#!/usr/bin/env python3
"""Decode a real NOAA GOES-R ABI-L2-ACMF granule to a compact WGS84 cloud atlas.

Requires: numpy, netCDF4, pyproj (requirements-science.txt).
Usage: python scripts/cloud-science/decode_goes_acmf.py file.nc --output frame.npz
Output: compressed NPZ with cloud_class (uint8, 255=missing), quality (uint8),
observed_at_ms (int64; granule midpoint approximation), coverage summary metadata.

CRITICAL: time_coverage_start/end are file-level timestamps, not per-pixel
acquisition times. Until scan-line timing is independently decoded this output
must NOT be treated as an exact per-pixel timestamp source.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from netCDF4 import Dataset
from pyproj import CRS, Transformer

WIDTH, HEIGHT = 2048, 1024
MISSING = 255


def parse_utc(value):
    if not value:
        raise ValueError("Missing acquisition time")
    timestamp = str(value).replace("Z", "+00:00")
    result = datetime.fromisoformat(timestamp)
    if result.tzinfo is None:
        raise ValueError("Acquisition timestamp has no timezone")
    return result.astimezone(timezone.utc)


def require_variable(dataset, key):
    if key not in dataset.variables:
        raise ValueError("Required Level-2 variable missing: " + key)
    return dataset.variables[key]


def decode(path, output, stride=3, max_age_minutes=90):
    now = datetime.now(timezone.utc)
    with Dataset(path, "r") as root:
        product_name = str(getattr(root, "dataset_name", Path(path).name))
        if "ABI-L2-ACMF" not in product_name and "ABI-L2-ACMF" not in Path(path).name:
            raise ValueError("Not a verified ABI-L2-ACMF Full Disk granule")
        start = parse_utc(getattr(root, "time_coverage_start", None))
        end = parse_utc(getattr(root, "time_coverage_end", None))
        if end < start or (end - start).total_seconds() > 1800:
            raise ValueError("Invalid granule acquisition interval")
        if (now - end).total_seconds() > max_age_minutes * 60 or end > now.replace(microsecond=0) and (end - now).total_seconds() > 300:
            raise ValueError("Granule is stale or from the future")
        observed = start + (end - start) / 2
        mid_ms = int(observed.timestamp() * 1000)

        # NOAA ACM is the verified four-class enterprise mask (0..3).
        acm_variable = require_variable(root, "ACM")
        quality_variable = require_variable(root, "DQF")
        print("NOAA ACM variable metadata:", {
            "dimensions": acm_variable.dimensions,
            "long_name": getattr(acm_variable, "long_name", None),
            "flag_values": str(getattr(acm_variable, "flag_values", None)),
            "flag_meanings": str(getattr(acm_variable, "flag_meanings", None)),
            "available_cloud_variables": [k for k in root.variables.keys()
                if any(t in k.lower() for t in ("acm", "cloud", "mask", "bcm"))],
        })
        x_variable = require_variable(root, "x")
        y_variable = require_variable(root, "y")
        projection = require_variable(root, "goes_imager_projection")
        acm = np.ma.filled(acm_variable[::stride, ::stride], MISSING).astype(np.uint8)
        dqf = np.ma.filled(quality_variable[::stride, ::stride], MISSING).astype(np.uint8)
        x = np.asarray(x_variable[::stride], dtype="float64")
        y = np.asarray(y_variable[::stride], dtype="float64")
        if acm.shape != dqf.shape or acm.shape != (len(y), len(x)):
            raise ValueError("Science mask, QA and geolocation grids differ")
        height_m = float(projection.perspective_point_height)
        longitude = float(projection.longitude_of_projection_origin)
        sweep = str(getattr(projection, "sweep_angle_axis", "x"))
        semi_major = float(projection.semi_major_axis)
        semi_minor = float(projection.semi_minor_axis)
        if sweep not in ("x", "y") or not (35_000_000 < height_m < 37_000_000):
            raise ValueError("Unexpected GOES fixed-grid projection")
        geos = CRS.from_proj4(
            f"+proj=geos +h={height_m} +lon_0={longitude} "
            f"+a={semi_major} +b={semi_minor} +sweep={sweep} +units=m +no_defs"
        )
        # INVERSE MAPPING: one sample per output cell. Forward scatter had
        # quantized holes/concentric rings at GEO scan edges.
        from_wgs84 = Transformer.from_crs("EPSG:4326", geos, always_xy=True)
        lon_out = -180 + (np.arange(WIDTH) + 0.5) * 360 / WIDTH
        lat_out = 90 - (np.arange(HEIGHT) + 0.5) * 180 / HEIGHT
        longitudes, latitudes = np.meshgrid(lon_out, lat_out)
        scan_x_m, scan_y_m = from_wgs84.transform(longitudes, latitudes, errcheck=False)
        scan_x = scan_x_m / height_m
        scan_y = scan_y_m / height_m
        # x/y coordinate axes may run in either direction. Interpolation
        # maps true scan angles to the sampled source pixel indices.
        def map_axis(values, axis):
            positions = np.arange(axis.size, dtype=np.float64)
            if axis[0] > axis[-1]:
                axis, positions = axis[::-1], positions[::-1]
            return np.interp(values, axis, positions, left=np.nan, right=np.nan)
        fx = map_axis(scan_x, x)
        fy = map_axis(scan_y, y)
        mapped = np.isfinite(fx) & np.isfinite(fy)
        ix = np.clip(np.rint(np.nan_to_num(fx, nan=0)).astype(np.int32), 0, len(x)-1)
        iy = np.clip(np.rint(np.nan_to_num(fy, nan=0)).astype(np.int32), 0, len(y)-1)
        sampled_class = acm[iy, ix]
        sampled_quality = dqf[iy, ix]
        good = mapped & (sampled_class <= 3) & (sampled_quality == 0)
        classes = np.where(good, sampled_class, MISSING).astype(np.uint8).ravel()
        qualities = np.where(good, 255, 0).astype(np.uint8).ravel()
        count = int(np.count_nonzero(qualities))
        if count < 100:
            raise ValueError("Science swath has insufficient valid Earth pixels")
        observed_ms = np.where(qualities > 0, mid_ms, 0).astype(np.int64)
        summary = {
            "product": "ABI-L2-ACMF", "granule": Path(path).name,
            "time_precision": "granule-midpoint-approximation",
            "start": start.isoformat(), "end": end.isoformat(),
            "valid_pixels": count, "coverage_fraction": count / (WIDTH * HEIGHT),
            "width": WIDTH, "height": HEIGHT, "stride": stride,
        }
        np.savez_compressed(output, cloud_class=classes.reshape(HEIGHT, WIDTH),
                            quality=qualities.reshape(HEIGHT, WIDTH),
                            observed_at_ms=observed_ms.reshape(HEIGHT, WIDTH),
                            metadata=json.dumps(summary))
        return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("granule", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stride", type=int, default=3)
    parser.add_argument("--max-age-minutes", type=int, default=90)
    args = parser.parse_args()
    if args.stride < 1 or args.stride > 32:
        parser.error("stride must be between 1 and 32")
    print(json.dumps(decode(args.granule, args.output, args.stride, args.max_age_minutes), indent=2))


if __name__ == "__main__":
    main()
