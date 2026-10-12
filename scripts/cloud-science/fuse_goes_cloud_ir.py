#!/usr/bin/env python3
"""Diagnostic cloud-texture fusion using L2 cloud classification and calibrated L1b IR.

Never treats IR brightness as proof that clouds exist. Pixels require both
valid ACM/DQF classification AND valid calibrated Band-13 temperature, with
granule acquisition times within 20 minutes. Output is a diagnostic, not
visible-cloud imagery or a scientifically derived optical-depth product.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def load(path):
    with np.load(path, allow_pickle=False) as z:
        return {key: z[key].copy() for key in z.files}


def metadata(frame):
    return json.loads(str(frame["metadata"]))


def fuse(cloud_file, thermal_file, output, png):
    cloud = load(cloud_file)
    thermal = load(thermal_file)
    cm, tm = metadata(cloud), metadata(thermal)
    import datetime
    midpoint = lambda m: (datetime.datetime.fromisoformat(m["start"])
                          + (datetime.datetime.fromisoformat(m["end"]) -
                             datetime.datetime.fromisoformat(m["start"])) / 2)
    separation_seconds = abs((midpoint(cm) - midpoint(tm)).total_seconds())
    if separation_seconds > 20 * 60:
        raise ValueError(f"Cloud mask/IR frames too far apart: {separation_seconds:.0f}s")
    classes = cloud["cloud_class"]
    quality = cloud["quality"]
    temperatures = thermal["temperature_kelvin"]
    ir_coverage = thermal["coverage"]
    if classes.shape != (1024, 2048) or temperatures.shape != classes.shape:
        raise ValueError("Cloud classification / IR atlas dimensions mismatch")
    valid = ((quality > 0) & (classes <= 3) &
             (ir_coverage > 0) & np.isfinite(temperatures) &
             (temperatures >= 150) & (temperatures <= 350))
    # NOAA 10.3um IR provides cloud-top thermal structure; it cannot tell
    # cloud optical depth. Scale brightness within observed cloudy pixels,
    # while keeping probably-clear and clear pixels transparent.
    cloudy = valid & (classes >= 2)
    coldness = np.clip((295 - temperatures) / 95, 0, 1)
    likelihood = np.where(classes == 3, 1.0, 0.52).astype(np.float32)
    # A non-zero baseline permits genuinely warm low clouds to remain visible.
    signal = np.where(cloudy, likelihood * (0.18 + 0.82 * coldness), 0).astype(np.float32)
    rgba = np.zeros((*classes.shape, 4), np.uint8)
    rgba[cloudy, :3] = 255
    rgba[:, :, 3] = np.round(signal * 215).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(png, optimize=True)
    np.savez_compressed(output, density=signal, coverage=valid.astype(np.uint8),
                        cloud_class=classes, temperature_kelvin=temperatures,
                        metadata=json.dumps({"cloud_granule": cm["granule"],
                          "thermal_granule": tm["granule"],
                          "time_offset_seconds": separation_seconds,
                          "coverage_fraction": round(float(valid.mean()), 5),
                          "cloudy_fraction": round(float(cloudy.mean()), 5),
                          "scientific_optical_depth": False}))
    return {"cloud_granule": cm["granule"], "thermal_granule": tm["granule"],
            "time_offset_seconds": separation_seconds,
            "intersection_coverage": round(float(valid.mean()), 5),
            "cloudy_pixels": int(np.count_nonzero(cloudy)),
            "status": "scientifically masked thermal diagnostic, not photographic"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cloud", type=Path, required=True)
    parser.add_argument("--thermal", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(fuse(args.cloud, args.thermal, args.output, args.preview), indent=2))
