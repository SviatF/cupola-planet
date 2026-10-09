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

        acm_variable = require_variable(root, "ACM")
        quality_variable = require_variable(root, "DQF")
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
        to_wgs84 = Transformer.from_crs(geos, "EPSG:4326", always_xy=True)
        grid_x, grid_y = np.meshgrid(x * height_m, y * height_m)
        lon, lat = to_wgs84.transform(grid_x, grid_y, errcheck=False)
        # Enterprise ACM codes 0=clear,1=probably clear,2=probably cloudy,3=cloudy.
        # DQF 0 only: valid good-quality observation; other DQF values omitted.
        good = (
            (acm <= 3) & (dqf == 0) & np.isfinite(lat) & np.isfinite(lon) &
            (np.abs(lat) <= 90) & (np.abs(lon) <= 180)
        )
        xpos = np.clip(((lon[good] + 180) / 360 * WIDTH).astype(np.int32), 0, WIDTH - 1)
        ypos = np.clip(((90 - lat[good]) / 180 * HEIGHT).astype(np.int32), 0, HEIGHT - 1)
        idx = ypos * WIDTH + xpos
        classes = np.full(WIDTH * HEIGHT, MISSING, dtype=np.uint8)
        qualities = np.zeros(WIDTH * HEIGHT, dtype=np.uint8)
        # Deterministic overlap aggregation: most-cloudy of competing valid
        # pixels sampled from one scan. No fabricated values outside coverage.
        np.maximum.at(qualities, idx, 255)
        for cloud_class in (0, 1, 2, 3):
            chosen = idx[acm[good] == cloud_class]
            classes[chosen] = np.maximum(
                np.where(classes[chosen] == MISSING, 0, classes[chosen]), cloud_class
            )
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
