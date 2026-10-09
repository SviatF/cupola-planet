#!/usr/bin/env python3
"""Build a diagnostic, quality-screened Himawari-9 REAL Level-2 cloud mask.

Uses official NOAA/JMA AHI-CMSK CloudMask (0 clear, 1 probably clear,
2 probably cloudy, 3 cloudy), CloudMaskQualFlag=0 (good) and the native
HSD navigation indices from the *same* scan. Validates L2 Latitude/Longitude
against WGS84 before combining the products. No RGB heuristics, no static
cloud fill, no claiming that L2 cloud classes are optical thickness.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import quote

import numpy as np
from PIL import Image


def build(l2_manifest, thermal_npz, output_npz, preview, coverage_png):
    import fsspec
    import h5py

    l2 = json.loads(l2_manifest.read_text())
    source = l2.get("source", "")
    if (l2.get("product") != "AHI-CMSK" or
            not source.startswith("s3://noaa-himawari9/AHI-L2-FLDK-Clouds/")):
        raise ValueError("Expected original NOAA Himawari-9 Level-2 CMSK")
    with np.load(thermal_npz, allow_pickle=False) as z:
        thermal_meta = json.loads(str(z["metadata"]))
        temperature = z["temperature_kelvin"].copy()
        native_row = z["native_row"].copy()
        native_col = z["native_col"].copy()
        thermal_valid = z["coverage"].astype(bool)
    if thermal_meta["satellite"] != "Himawari-9":
        raise ValueError("Cloud mask and thermal products must be Himawari-9")
    thermal_time = datetime.fromisoformat(thermal_meta["slot_start_utc"])
    mask_time = datetime.fromisoformat(l2["observation_start_utc"])
    if abs((thermal_time - mask_time).total_seconds()) > 15 * 60:
        raise ValueError("Himawari L1b/L2 observations are not time aligned")

    url = "https://noaa-himawari9.s3.amazonaws.com/" + quote(
        source.split("s3://noaa-himawari9/", 1)[1], safe="/")
    sample_points = [(y, x) for y in (360, 512, 664)
                     for x in (0, 1500, 1800, 2047)
                     if thermal_valid[y, x]]
    matched = 0
    with fsspec.open(url, "rb", block_size=2 * 1024 * 1024,
                     cache_type="readahead") as stream:
        with h5py.File(stream, "r") as h5:
            if not all(name in h5 for name in
                       ("CloudMask", "CloudMaskQualFlag", "Latitude", "Longitude")):
                raise ValueError("Missing NOAA H09 L2 cloud mask/QA/geolocation")
            mask_ds = h5["CloudMask"]
            quality_ds = h5["CloudMaskQualFlag"]
            assert mask_ds.shape == quality_ds.shape == (5500, 5500)
            assert list(mask_ds.attrs["flag_values"]) == [0, 1, 2, 3]
            meanings = mask_ds.attrs["flag_meanings"]
            if isinstance(meanings, bytes):
                meanings = meanings.decode("utf-8")
            if meanings.split() != ["clear", "probably_clear",
                                    "probably_cloudy", "cloudy"]:
                raise ValueError("Unrecognized AHI-CMSK Level-2 class semantics")
            for y, x in sample_points:
                sy, sx = int(native_row[y, x]), int(native_col[y, x])
                if sy >= 5500 or sx >= 5500:
                    continue
                geo_lat = float(h5["Latitude"][sy, sx])
                geo_lon = float(h5["Longitude"][sy, sx])
                expected_lat = 90.0 - (y + .5) * (180.0 / 1024)
                expected_lon = -180.0 + (x + .5) * (360.0 / 2048)
                longitude_error = abs((geo_lon-expected_lon+180) % 360-180)
                if (not np.isfinite(geo_lat) or not np.isfinite(geo_lon) or
                        abs(geo_lat - expected_lat) >= 1.0 or longitude_error >= 1.0):
                    raise ValueError(
                        f"L2 cloud mask geographic misalignment at world {(x,y)}:"
                        f" L2={(geo_lat,geo_lon)} world={(expected_lat,expected_lon)}")
                matched += 1
            if matched < 8:
                raise ValueError("Insufficient L2 vs L1b geolocation reference samples")
            # Read the two specified science fields, NOT the entire 371MB file
            # (nor unrelated channel data). NetCDF4 compressed chunks are
            # fetched on demand through bounded HTTP byte-range requests.
            mask_native = mask_ds[:]
            qa_native = quality_ds[:]
    mapped = (thermal_valid & (native_row < 5500) & (native_col < 5500))
    row = np.where(mapped, native_row, 0).astype(np.intp)
    col = np.where(mapped, native_col, 0).astype(np.intp)
    classes = mask_native[row, col]
    quality = qa_native[row, col]
    good = mapped & (quality == 0) & (classes >= 0) & (classes <= 3)
    observed_classes = np.where(good, classes, 255).astype(np.uint8)
    if np.mean(good) < .1:
        raise ValueError("No adequate QA-screened Himawari L2 cloud observations")
    cloudy = good & (classes >= 2)
    # This is a diagnostic rendering grade only. Class severity and Band-13
    # temperature do not measure actual optical depth or visible albedo.
    cold = np.clip((305-temperature)/110, 0, 1)
    luminance = np.where(cloudy, 110+135*cold, 0)
    alpha = np.where(good & (classes == 3), .72,
                     np.where(good & (classes == 2), .34, 0))
    alpha *= np.where(cloudy, .55+.45*cold, 0)
    rgba = np.zeros((*classes.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(luminance, 0, 255).astype(np.uint8)[:, :, None]
    rgba[:, :, 3] = np.round(alpha * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(preview, optimize=True)
    Image.fromarray((good*255).astype(np.uint8), "L").save(
        coverage_png, optimize=True)
    np.savez_compressed(output_npz, cloud_class=observed_classes,
                        valid_qa=good.astype(np.uint8),
                        temperature_kelvin=temperature,
                        metadata=json.dumps({"source": source, "thermal_scan_utc":
                                           thermal_meta["slot_start_utc"]}))
    stats = {
        "satellite": "Himawari-9", "l2_product": "AHI-CMSK",
        "source": source, "temperature_scan_utc": thermal_meta["slot_start_utc"],
        "cloudmask_scan_utc": l2["observation_start_utc"],
        "geolocation_samples_matched": matched,
        "science_coverage_fraction": round(float(np.mean(good)), 5),
        "cloud_class_distribution": {str(i): int(np.count_nonzero(good & (classes==i)))
                                     for i in range(4)},
        "cloudy_fraction_of_globe": round(float(np.mean(cloudy)), 5),
        "outside_coverage_alpha_pixels": int(np.count_nonzero(rgba[:, :, 3][~good])),
        "cloud_classification_verified": True,
        "optical_depth_verified": False,
        "ready_for_cinema_cloud_layer": False,
        "note": "Quality-screened real four-level NOAA mask; diagnostic styling only",
    }
    if stats["outside_coverage_alpha_pixels"]:
        raise ValueError("Himawari cloud rendering leaked into unobserved geography")
    return stats


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--l2-manifest", type=Path, required=True)
    p.add_argument("--temperature", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--preview", type=Path, required=True)
    p.add_argument("--coverage-preview", type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(build(args.l2_manifest, args.temperature,
                           args.output, args.preview, args.coverage_preview),
                     indent=2))
