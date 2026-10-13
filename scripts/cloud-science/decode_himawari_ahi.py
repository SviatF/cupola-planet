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
    from pyproj import Transformer

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
    # CRITICAL: resampling the entire EPSG:4326 globe via pyresample's
    # nearest-neighbour reduction left an artificial circular void at -180°
    # despite valid Himawari observations at the equivalent +180° meridian.
    # Use inverse navigation directly in the original JMA HSD geostationary
    # fixed-grid projection. The output longitude wraps in pyproj before
    # projection, so both sides of the date line sample the same scan lines.
    source_area = original.attrs.get("area")
    if source_area is None or not hasattr(source_area, "area_extent"):
        raise ValueError("Himawari B13 missing authoritative Satpy fixed-grid area")
    xmin, ymin, xmax, ymax = source_area.area_extent
    source = original.data
    raw = np.asarray(source.compute() if hasattr(source, "compute") else source,
                     dtype=np.float32)
    source_height, source_width = raw.shape
    if source_height < 1000 or source_width < 1000:
        raise ValueError(f"Unexpected JMA Band-13 native array shape: {raw.shape}")

    transformer = Transformer.from_crs("EPSG:4326", source_area.crs,
                                       always_xy=True)
    lon = -180.0 + (np.arange(2048) + 0.5) * (360.0 / 2048)
    lat = 90.0 - (np.arange(1024) + 0.5) * (180.0 / 1024)
    values = np.full((1024, 2048), np.nan, dtype=np.float32)
    # Preserve native HSD pixel positions for subsequent L2 cloud-mask QA
    # instead of performing another independently shifted reprojection.
    missing_native_index = np.uint16(65535)
    native_row = np.full((1024, 2048), missing_native_index, dtype=np.uint16)
    native_col = np.full((1024, 2048), missing_native_index, dtype=np.uint16)
    pixel_dx = (xmax - xmin) / source_width
    pixel_dy = (ymax - ymin) / source_height
    # Calculate in row batches to bound temporary memory for 2M world cells.
    for ystart in range(0, 1024, 64):
        ystop = min(ystart + 64, 1024)
        world_lon, world_lat = np.meshgrid(lon, lat[ystart:ystop])
        scan_x, scan_y = transformer.transform(
            world_lon, world_lat, errcheck=False)
        fx = (scan_x - xmin) / pixel_dx - 0.5
        fy = (ymax - scan_y) / pixel_dy - 0.5
        in_scan = (np.isfinite(fx) & np.isfinite(fy) &
                   (fx >= 0) & (fy >= 0) &
                   (fx < source_width - 1) &
                   (fy < source_height - 1))
        floor_x = np.floor(np.where(in_scan, fx, 0)).astype(np.int32)
        floor_y = np.floor(np.where(in_scan, fy, 0)).astype(np.int32)
        dx = np.where(in_scan, fx - floor_x, 0)
        dy = np.where(in_scan, fy - floor_y, 0)
        t00 = raw[floor_y, floor_x]
        t10 = raw[floor_y, floor_x + 1]
        t01 = raw[floor_y + 1, floor_x]
        t11 = raw[floor_y + 1, floor_x + 1]
        measured = (in_scan & np.isfinite(t00) & np.isfinite(t10) &
                    np.isfinite(t01) & np.isfinite(t11) &
                    (t00 >= 150) & (t00 <= 350) &
                    (t10 >= 150) & (t10 <= 350) &
                    (t01 >= 150) & (t01 <= 350) &
                    (t11 >= 150) & (t11 <= 350))
        interpolated = ((1 - dy) * ((1 - dx) * t00 + dx * t10) +
                        dy * ((1 - dx) * t01 + dx * t11))
        values[ystart:ystop] = np.where(measured, interpolated, np.nan)
        source_yy = np.clip(np.rint(fy), 0, source_height - 1).astype(np.uint16)
        source_xx = np.clip(np.rint(fx), 0, source_width - 1).astype(np.uint16)
        native_row[ystart:ystop] = np.where(
            measured, source_yy, missing_native_index)
        native_col[ystart:ystop] = np.where(
            measured, source_xx, missing_native_index)
    valid = np.isfinite(values) & (values >= 150) & (values <= 350)
    if values.shape != (1024, 2048):
        raise ValueError(f"Bad global grid shape: {values.shape}")
    if valid.sum() < 100000:
        raise ValueError("Insufficient science coverage in Himawari L1b scene")

    # Check antimeridian continuity on the same geographic meridian.
    # Himawari observes it in full-disk mode. A one-sided coverage hole
    # implies a reprojection problem, not missing JMA satellite input.
    belt = slice(1024 // 2 - 140, 1024 // 2 + 140)
    seam_left = valid[belt, 0]
    seam_right = valid[belt, -1]
    if np.mean(seam_left & seam_right) < 0.95:
        raise ValueError("Himawari antimeridian still has unobserved seam pixels")
    seam_delta = np.abs(values[belt, 0] - values[belt, -1])
    if np.nanmedian(seam_delta) >= 5.0:
        raise ValueError("Himawari antimeridian thermal discontinuity detected")

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
        "reprojection": "JMA geostationary fixed-grid inverse bilinear",
        "antimeridian_pair_coverage": round(float(np.mean(seam_left & seam_right)), 5),
        "antimeridian_median_temperature_delta_kelvin": round(float(np.nanmedian(seam_delta)), 3),
        "note": "Brightness temperature includes clear land and sea; do not treat as cloud opacity",
    }
    np.savez_compressed(
        output, temperature_kelvin=np.where(valid, values, 0).astype(np.float32),
        coverage=valid.astype(np.uint8), native_row=native_row,
        native_col=native_col, metadata=json.dumps(metadata)
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
