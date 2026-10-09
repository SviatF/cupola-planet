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
    # Use both independently verified science footprints. The old hard
    # owner switch generated a straight discontinuity even when both GOES
    # satellites observed the exact same geographic cell.
    from PIL import ImageFilter
    east = east_q & observed & np.isfinite(east_d)
    west = west_q & observed & np.isfinite(west_d)
    coverage = east | west
    overlap = east & west
    # Local distance-to-coverage proxies: a soft confidence score toward
    # either satellite's valid disk edge. No data is extrapolated.
    smooth_valid = lambda valid: np.asarray(
        Image.fromarray((valid * 255).astype(np.uint8), "L").filter(
            ImageFilter.GaussianBlur(radius=14)), dtype=np.float32
        ) / 255.0
    # Geostationary viewing geometry: in overlap, prefer the satellite
    # observing a cell closer to nadir rather than blending both equally
    # at the highly distorted limb. NOAA GOES-19/18 subpoints, in degrees.
    lat = np.deg2rad(90 - (np.arange(owner.shape[0]) + 0.5) * 180 / owner.shape[0])
    lon = np.deg2rad(-180 + (np.arange(owner.shape[1]) + 0.5) * 360 / owner.shape[1])
    def nadir_weight(sub_lon):
        central_cos = np.cos(lat)[:, None] * np.cos(lon[None, :] - np.deg2rad(sub_lon))
        # A positive monotonic weight only changes which *observed*
        # pixels dominate the blend; it never marks an unobserved pixel valid.
        return np.maximum(0.02, np.maximum(central_cos, 0) ** 3).astype(np.float32)
    east_weight = np.where(east, smooth_valid(east) * nadir_weight(-75.2), 0.0)
    west_weight = np.where(west, smooth_valid(west) * nadir_weight(-137.0), 0.0)
    weight_sum = east_weight + west_weight
    density = np.divide(
        east_d * east_weight + west_d * west_weight,
        weight_sum, out=np.zeros_like(east_d, dtype=np.float32),
        where=weight_sum > 0,
    )
    # Unambiguous source provenance for unique observations; overlap=3.
    source = np.where(overlap, 3, np.where(east, 1, np.where(west, 2, 0))).astype(np.uint8)
    # Render scientifically supported thermal structure separately from the
    # geographic footprint. RGBA white is deliberately NOT our data encoding.
    # Grayscale R/G/B communicates IR contrast; A communicates opacity only.
    coverage_image = Image.fromarray(np.where(coverage, 255, 0).astype(np.uint8), "L")
    # Blur only the geographic observation edge; never extend cloud detail
    # outside the actual sampled NOAA cells.
    distance_feather = np.asarray(
        coverage_image.filter(ImageFilter.GaussianBlur(radius=3)), dtype=np.float32
    ) / 255.0
    # Apply a physically grounded limb taper. Even a valid GEO measurement
    # becomes heavily foreshortened close to the satellite's horizon, where
    # scan-line aliasing is most obvious on a global equirectangular map.
    # This changes *rendering confidence*, not scientific coverage; no new
    # observations are created.
    def limb_confidence(sub_lon):
        earth_radius_km = 6371.0
        orbit_radius_km = 42164.0
        central_cos = np.cos(lat)[:, None] * np.cos(
            lon[None, :] - np.deg2rad(sub_lon))
        distance = np.sqrt(
            orbit_radius_km ** 2 + earth_radius_km ** 2 -
            2 * orbit_radius_km * earth_radius_km * central_cos)
        view_cos = (orbit_radius_km * central_cos - earth_radius_km) / distance
        lo = np.cos(np.deg2rad(84.0))
        hi = np.cos(np.deg2rad(73.0))
        t = np.clip((view_cos - lo) / (hi - lo), 0, 1)
        return (t * t * (3 - 2 * t)).astype(np.float32)
    limb_east = np.where(east, limb_confidence(-75.2), 0)
    limb_west = np.where(west, limb_confidence(-137.0), 0)
    view_confidence = np.maximum(limb_east, limb_west)
    confidence = np.where(
        coverage,
        np.clip(distance_feather, 0, 1) * view_confidence,
        0,
    )
    # Quantile-based tone mapping improves contrast without guessing cloud
    # classification. The source signal remains valid only where ACM/IR agree.
    # Each input density has ALREADY been gated by its own NOAA ACM/DQF
    # scientific classification. Re-gating using the hard-owner mosaic
    # cloud_class reintroduces a visible seam through valid dual-source data.
    cloudy = coverage & np.isfinite(density) & (density > 0)
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
    Image.fromarray(np.round(view_confidence * 255).astype(np.uint8), "L").save(
        preview.with_name("goes-view-confidence.png"), optimize=True)
    Image.fromarray(grayscale, "L").save(
        preview.with_name("goes-cloud-luma.png"), optimize=True)
    # Dedicated source-overlap map makes seam diagnostics inspectable:
    # black=missing, gray=east only, light gray=west only, white=both.
    overlap_debug = np.where(overlap, 255, np.where(east, 100, np.where(west, 175, 0)))
    Image.fromarray(overlap_debug.astype(np.uint8), "L").save(
        preview.with_name("goes-source-overlap.png"), optimize=True)
    np.savez_compressed(output, density=density.astype(np.float32),
                        coverage=coverage.astype(np.uint8),
                        confidence=confidence.astype(np.float32),
                        luma=grayscale, cloud_class=cloud,
                        source_id=source)
    stats = {
        "scientific_coverage_fraction": round(float(observed.mean()), 5),
        "thermal_intersection_fraction": round(float(coverage.mean()), 5),
        "cloudy_thermal_fraction": round(float(np.mean(cloudy)), 5),
        "thermal_tone_map_percentiles": [round(float(p_lo), 4), round(float(p_hi), 4)],
        "east_pixels": int(np.count_nonzero(east)),
        "west_pixels": int(np.count_nonzero(west)),
        "overlap_pixels": int(np.count_nonzero(overlap)),
        "overlap_mean_abs_density_delta": round(float(np.mean(
            np.abs(east_d[overlap] - west_d[overlap]))), 5) if np.any(overlap) else None,
        "overlap_blend": "observation-only geographic feather with GOES viewing geometry",
        "view_confidence_mean_in_coverage": round(
            float(np.mean(view_confidence[coverage])), 5),
        "view_confidence_model": "spherical GOES sensor zenith, 73-84 degree fade",
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
