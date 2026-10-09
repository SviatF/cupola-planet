#!/usr/bin/env python3
"""Geolocate a complete Himawari-9 AHI Level-1b Band-13 scan to CUPOLA WGS84.

Uses Satpy's authoritative JMA HSD calibration and area definition rather than
guessing navigation/header offsets. Produces a DIAGNOSTIC brightness-temperature
field, NOT a cloud-only mask: warm ground/ocean pixels are valid observations.
A separately validated Level-2 cloud product is required before cloud-only
rendering or scientific cloud coverage claims.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def build(manifest_path, output, preview, coverage_preview):
    from satpy import Scene
    from pyresample.geometry import AreaDefinition

    manifest = json.loads(manifest_path.read_text())
    if manifest.get("satellite") != "Himawari-9" or not manifest.get("complete_disk"):
        raise ValueError("Expected complete Himawari-9 science manifest")
    segments = manifest["segments"]
    if (len(segments) != 10 or
            {item["segment"] for item in segments} != set(range(1, 11)) or
            {item["slot_start_utc"] for item in segments} != {manifest["slot_start_utc"]}):
        raise ValueError("Himawari segment count or observation slot mismatch")
    files = [Path(item["path"]) for item in segments]
    if not all(path.is_file() for path in files):
        raise ValueError("Missing verified Himawari HSD segments")

    scene = Scene(filenames=[str(file) for file in files], reader="ahi_hsd")
    scene.load(["B13"])
    original = scene["B13"]
    if original.attrs.get("units") != "K":
        raise ValueError("Himawari B13 must be calibrated to Kelvin, not counts")
    globe = AreaDefinition(
        "cupola-himawari-global", "Full global equirectangular diagnostics",
        "epsg4326", "EPSG:4326", 2048, 1024, (-180, -90, 180, 90)
    )
    # Nearest valid observations are acceptable for diagnostics, but don't
    # manufacture values outside the actual JMA disc or ocean/space mask.
    target = scene.resample(
        globe, resampler="nearest", radius_of_influence=18000, reduce_data=True
    )
    raw = target["B13"].data
    values = np.asarray(raw.compute() if hasattr(raw, "compute") else raw,
                        dtype=np.float32)
    valid = np.isfinite(values) & (values >= 150) & (values <= 350)
    if values.shape != (1024, 2048):
        raise ValueError(f"Bad global grid shape: {values.shape}")
    if valid.sum() < 100000:
        raise ValueError("Insufficient science coverage in Himawari L1b scene")

    # Fixed Kelvin display scale; this is not an inverted cloud probability.
    # Lower brightness temperatures appear brighter. Invalid/unobserved pixels
    # are strictly transparent and not filled.
    scaled = np.clip((310 - values) / 105, 0, 1)
    gray = np.where(valid, 25 + 205 * scaled, 0).astype(np.uint8)
    image = np.zeros((*gray.shape, 4), dtype=np.uint8)
    image[:, :, :3] = gray[:, :, None]
    image[:, :, 3] = np.where(valid, 255, 0).astype(np.uint8)
    Image.fromarray(image, "RGBA").save(preview, optimize=True)
    Image.fromarray(np.where(valid, 255, 0).astype(np.uint8), "L").save(
        coverage_preview, optimize=True
    )

    metadata = {
        "satellite": "Himawari-9", "product": "AHI-L1b-FLDK",
        "band": 13, "units": "K", "calibration": "Satpy AHI HSD calibrated Band 13",
        "slot_start_utc": manifest["slot_start_utc"],
        "time_precision": "full-scan slot; no per-pixel acquisition time yet",
        "segments": 10, "width": 2048, "height": 1024,
        "observed_pixels": int(valid.sum()),
        "coverage_fraction": round(float(valid.mean()), 5),
        "min_kelvin": round(float(values[valid].min()), 2),
        "max_kelvin": round(float(values[valid].max()), 2),
        "median_kelvin": round(float(np.median(values[valid])), 2),
        "decoded_cloud_mask": False, "ready_for_cinema_cloud_layer": False,
        "note": "Brightness temperature includes clear land and sea; do not treat as cloud opacity",
    }
    np.savez_compressed(
        output, temperature_kelvin=np.where(valid, values, 0).astype(np.float32),
        coverage=valid.astype(np.uint8), metadata=json.dumps(metadata)
    )
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--coverage-preview", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.manifest, args.output, args.preview,
                           args.coverage_preview), indent=2))
