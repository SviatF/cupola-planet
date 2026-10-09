#!/usr/bin/env python3
"""Combine calibrated masked GOES thermal textures using independently verified
L2 ACM mosaic source ownership. No fabrication, no RGB cloud detection.
Diagnostics only; source discontinuities and pixel voids remain visible.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image


def run(mosaic_file, east_file, west_file, output, preview):
    with np.load(mosaic_file, allow_pickle=False) as z:
        owner = z["source_id"].copy()
        cloud = z["cloud_class"].copy()
        observed = z["quality"] > 0
    with np.load(east_file, allow_pickle=False) as z:
        east_d, east_q = z["density"].copy(), z["coverage"].copy() > 0
    with np.load(west_file, allow_pickle=False) as z:
        west_d, west_q = z["density"].copy(), z["coverage"].copy() > 0
    if owner.shape != (1024, 2048) or east_d.shape != owner.shape or west_d.shape != owner.shape:
        raise ValueError("All scientific atlases must have matching world grids")
    east = (owner == 1) & east_q & observed
    west = (owner == 2) & west_q & observed
    density = np.where(east, east_d, np.where(west, west_d, 0.0))
    coverage = east | west
    alpha = np.round(np.clip(density, 0, 1) * 215).astype(np.uint8)
    img = np.zeros((*owner.shape, 4), dtype=np.uint8)
    img[coverage, :3] = 255
    img[:, :, 3] = alpha
    Image.fromarray(img, "RGBA").save(preview, optimize=True)
    np.savez_compressed(output, density=density.astype(np.float32),
                        coverage=coverage.astype(np.uint8), cloud_class=cloud,
                        source_id=np.where(coverage, owner, 0).astype(np.uint8))
    stats = {
        "scientific_coverage_fraction": round(float(observed.mean()), 5),
        "thermal_intersection_fraction": round(float(coverage.mean()), 5),
        "cloudy_thermal_fraction": round(float(np.mean(alpha > 0)), 5),
        "east_pixels": int(np.count_nonzero(east)),
        "west_pixels": int(np.count_nonzero(west)),
        "texture_is_photorealistic": False,
        "status": "diagnostic only",
    }
    if stats["thermal_intersection_fraction"] < 0.1:
        raise ValueError("Insufficient NOAA classification / IR overlap")
    return stats


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mosaic", type=Path, required=True)
    p.add_argument("--east", type=Path, required=True)
    p.add_argument("--west", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--preview", type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(run(args.mosaic, args.east, args.west, args.output, args.preview), indent=2))
