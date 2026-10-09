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
    # Render scientifically supported thermal structure separately from the
    # geographic footprint. RGBA white is deliberately NOT our data encoding.
    # Grayscale R/G/B communicates IR contrast; A communicates opacity only.
    from PIL import ImageFilter
    coverage_image = Image.fromarray(np.where(coverage, 255, 0).astype(np.uint8), "L")
    # Blur only the geographic observation edge; never extend cloud detail
    # outside the actual sampled NOAA cells.
    distance_feather = np.asarray(
        coverage_image.filter(ImageFilter.GaussianBlur(radius=3)), dtype=np.float32
    ) / 255.0
    confidence = np.where(coverage, np.clip(distance_feather, 0, 1), 0)
    # Quantile-based tone mapping improves contrast without guessing cloud
    # classification. The source signal remains valid only where ACM/IR agree.
    cloudy = coverage & (cloud >= 2) & np.isfinite(density) & (density > 0)
    p_lo, p_hi = (np.percentile(density[cloudy], (5, 95))
                  if np.count_nonzero(cloudy) > 100 else (0.0, 1.0))
    spread = max(0.08, float(p_hi - p_lo))
    normalized = np.clip((density - p_lo) / spread, 0, 1)
    # Slightly raised shadows, restrained highlights. Grayscale image is
    # diagnostic thermal structure, NOT real visible-light reflectance.
    luma = np.where(cloudy, 55 + 165 * np.power(normalized, 0.85), 0)
    opacity = np.where(cloudy, (0.12 + 0.58 * normalized) * confidence, 0)
    img = np.zeros((*owner.shape, 4), dtype=np.uint8)
    grayscale = np.round(luma).astype(np.uint8)
    img[:, :, :3] = grayscale[:, :, None]
    img[:, :, 3] = np.round(np.clip(opacity, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(preview, optimize=True)
    # Publish transparent observation confidence and thermal luma separately,
    # so visual preview compositing cannot be confused with data availability.
    Image.fromarray(np.round(confidence * 255).astype(np.uint8), "L").save(
        preview.with_name("goes-soft-coverage.png"), optimize=True)
    Image.fromarray(grayscale, "L").save(
        preview.with_name("goes-cloud-luma.png"), optimize=True)
    np.savez_compressed(output, density=density.astype(np.float32),
                        coverage=coverage.astype(np.uint8),
                        confidence=confidence.astype(np.float32),
                        luma=grayscale, cloud_class=cloud,
                        source_id=np.where(coverage, owner, 0).astype(np.uint8))
    stats = {
        "scientific_coverage_fraction": round(float(observed.mean()), 5),
        "thermal_intersection_fraction": round(float(coverage.mean()), 5),
        "cloudy_thermal_fraction": round(float(np.mean(cloudy)), 5),
        "thermal_tone_map_percentiles": [round(float(p_lo), 4), round(float(p_hi), 4)],
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
