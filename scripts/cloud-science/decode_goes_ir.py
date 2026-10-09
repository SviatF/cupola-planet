#!/usr/bin/env python3
"""Reproject NOAA GOES ABI-L1b-RadF Band 13 brightness temperature to EPSG:4326.

Physical calibration uses the radiance Planck constants stored in the actual
L1b NetCDF granule. This is NOT RGB palette detection or an optical-depth
measurement. The resulting 8-bit temperature texture is auxiliary to verified
L2 ACM/DQF cloud classification and never creates coverage independently.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from netCDF4 import Dataset
from pyproj import CRS, Transformer

W, H = 2048, 1024


def parse_iso(text):
    value = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Time requires timezone")
    return value.astimezone(timezone.utc)


def decode(path, output, stride=2):
    with Dataset(path) as root:
        name = str(getattr(root, "dataset_name", path.name))
        if "ABI-L1b-RadF" not in name and "ABI-L1b-RadF" not in path.name:
            raise ValueError("Not ABI-L1b-RadF")
        band = int(np.asarray(root.variables["band_id"][:]).ravel()[0])
        if band != 13:
            raise ValueError(f"Expected Band 13; got {band}")
        start = parse_iso(root.time_coverage_start)
        end = parse_iso(root.time_coverage_end)
        if (end - start).total_seconds() > 1800 or end < start:
            raise ValueError("Invalid radiance acquisition interval")
        now = datetime.now(timezone.utc)
        if (now - end).total_seconds() > 90 * 60 or (end - now).total_seconds() > 300:
            raise ValueError("Stale or future radiance granule")
        p = root.variables["goes_imager_projection"]
        h = float(p.perspective_point_height)
        crs = CRS.from_proj4(
            f"+proj=geos +h={h} +lon_0={float(p.longitude_of_projection_origin)} "
            f"+a={float(p.semi_major_axis)} +b={float(p.semi_minor_axis)} "
            f"+sweep={str(getattr(p, 'sweep_angle_axis', 'x'))} +units=m +no_defs"
        )
        x = np.asarray(root.variables["x"][::stride], dtype=np.float64) * h
        y = np.asarray(root.variables["y"][::stride], dtype=np.float64) * h
        rad = np.ma.asarray(root.variables["Rad"][::stride, ::stride])
        if rad.shape != (len(y), len(x)):
            raise ValueError("Radiance and scan axes differ")
        fk1 = float(root.variables["planck_fk1"][:])
        fk2 = float(root.variables["planck_fk2"][:])
        bc1 = float(root.variables["planck_bc1"][:])
        bc2 = float(root.variables["planck_bc2"][:])
        # Use inverse mapping for radiance too, otherwise the calibrated
        # IR texture has the same scan-edge ring artifacts as the cloud mask.
        reverse = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        longitude = -180 + (np.arange(W) + 0.5) * 360 / W
        latitude = 90 - (np.arange(H) + 0.5) * 180 / H
        lo, la = np.meshgrid(longitude, latitude)
        xp, yp = reverse.transform(lo, la, errcheck=False)
        def map_axis(values, axis):
            positions = np.arange(axis.size, dtype=np.float64)
            if axis[0] > axis[-1]:
                axis, positions = axis[::-1], positions[::-1]
            return np.interp(values, axis, positions, left=np.nan, right=np.nan)
        ix_f = map_axis(xp, x)
        iy_f = map_axis(yp, y)
        mapped = np.isfinite(ix_f) & np.isfinite(iy_f)
        # Bilinear sampling is essential at the distorted geostationary limb.
        # Nearest-neighbour made 2-km scan rows alias into concentric stripes
        # on the much coarser global equirectangular output grid.
        raw_x0 = np.floor(np.nan_to_num(ix_f, nan=-1.0)).astype(np.int32)
        raw_y0 = np.floor(np.nan_to_num(iy_f, nan=-1.0)).astype(np.int32)
        inside = (mapped & (raw_x0 >= 0) & (raw_y0 >= 0) &
                  (raw_x0 + 1 < len(x)) & (raw_y0 + 1 < len(y)))
        x0 = np.clip(raw_x0, 0, len(x) - 2)
        y0 = np.clip(raw_y0, 0, len(y) - 2)
        dx = np.clip(np.nan_to_num(ix_f - raw_x0, nan=0.0), 0, 1)
        dy = np.clip(np.nan_to_num(iy_f - raw_y0, nan=0.0), 0, 1)
        radiance = np.asarray(rad.filled(np.nan), dtype=np.float32)
        r00 = radiance[y0, x0]
        r10 = radiance[y0, x0 + 1]
        r01 = radiance[y0 + 1, x0]
        r11 = radiance[y0 + 1, x0 + 1]
        all_samples_valid = (np.isfinite(r00) & (r00 > 0) &
                             np.isfinite(r10) & (r10 > 0) &
                             np.isfinite(r01) & (r01 > 0) &
                             np.isfinite(r11) & (r11 > 0))
        valid = inside & all_samples_valid
        values = ((1 - dy) * ((1 - dx) * r00 + dx * r10) +
                  dy * ((1 - dx) * r01 + dx * r11))
        kelvin = np.zeros((H, W), dtype=np.float64)
        kelvin[valid] = (fk2 / np.log(fk1 / values[valid] + 1) - bc1) / bc2
        actual = valid & np.isfinite(kelvin) & (kelvin >= 150) & (kelvin <= 350)
        temp = np.where(actual, kelvin, 0).astype(np.float32).ravel()
        actual = actual.ravel()
        if np.count_nonzero(actual) < 1000:
            raise ValueError("Insufficient calibrated radiance coverage")
        mid_ms = int((start + (end - start) / 2).timestamp() * 1000)
        summary = {
            "product": "ABI-L1b-RadF", "band": band, "granule": path.name,
            "start": start.isoformat(), "end": end.isoformat(),
            "time_precision": "granule-midpoint-approximation",
            "valid_pixels": int(np.count_nonzero(actual)),
            "reprojection_sampling": "bilinear-four-valid-radiance-neighbors",
            "mean_temperature_kelvin": round(float(temp[actual].mean()), 2),
        }
        np.savez_compressed(output,
            temperature_kelvin=temp.reshape(H, W),
            coverage=actual.reshape(H, W).astype(np.uint8),
            observed_at_ms=np.where(actual, mid_ms, 0).astype(np.int64).reshape(H, W),
            metadata=json.dumps(summary))
        return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("granule", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stride", type=int, default=2)
    args = parser.parse_args()
    if not 1 <= args.stride <= 16:
        parser.error("stride must be between 1 and 16")
    print(json.dumps(decode(args.granule, args.output, args.stride), indent=2))
