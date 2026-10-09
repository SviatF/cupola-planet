#!/usr/bin/env python3
"""Merge two independently decoded GOES ACMF science rasters.

No RGB cloud inference and no invented pixels. Quality wins; a newer granule
breaks ties. Output is a diagnostic PNG (not wired into production).
Requires numpy and Pillow.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

CLASS_TO_INTENSITY = np.array([0, 45, 170, 245, 0], dtype=np.uint8)


def read_frame(path):
    with np.load(path, allow_pickle=False) as data:
        classes = data["cloud_class"].copy()
        quality = data["quality"].copy()
        times = data["observed_at_ms"].copy()
        metadata = json.loads(str(data["metadata"]))
    if classes.shape != (1024, 2048) or quality.shape != classes.shape or times.shape != classes.shape:
        raise ValueError(f"Bad raster dimensions: {path}")
    valid = (classes <= 3) & (quality > 0) & (times > 0)
    if not np.array_equal(valid, quality > 0):
        raise ValueError(f"Invalid class/QA consistency: {path}")
    return classes, quality, times, metadata, valid


def mosaic(east, west, output, preview, now_ms=None):
    ec, eq, et, em, ev = read_frame(east)
    wc, wq, wt, wm, wv = read_frame(west)
    if now_ms is None:
        import time
        now_ms = int(time.time() * 1000)
    max_age_ms = 90 * 60 * 1000
    ev &= (et <= now_ms + 300_000) & (now_ms - et <= max_age_ms)
    wv &= (wt <= now_ms + 300_000) & (now_ms - wt <= max_age_ms)
    # Prefer the highest-quality scan, then newer observation. Overlap
    # selection is per cell; missing data are never expanded or inpainted.
    west_wins = wv & (~ev | (wq > eq) | ((wq == eq) & (wt > et)))
    east_wins = ev & ~west_wins
    valid = east_wins | west_wins
    cloud = np.full(ec.shape, 255, dtype=np.uint8)
    cloud[east_wins] = ec[east_wins]
    cloud[west_wins] = wc[west_wins]
    timestamps = np.where(west_wins, wt, np.where(east_wins, et, 0)).astype(np.int64)
    owner = np.where(west_wins, 2, np.where(east_wins, 1, 0)).astype(np.uint8)
    np.savez_compressed(output, cloud_class=cloud, observed_at_ms=timestamps, source_id=owner,
                        quality=np.where(west_wins, wq, np.where(east_wins, eq, 0)).astype(np.uint8))
    # Transparent means NO OBSERVATION; observed clear sky is transparent
    # too visually, but its coverage remains explicit in the NPZ.
    rgba = np.zeros((*cloud.shape, 4), dtype=np.uint8)
    for classification, intensity in enumerate(CLASS_TO_INTENSITY[:4]):
        selected = valid & (cloud == classification)
        rgba[selected, :3] = 255
        rgba[selected, 3] = intensity
    Image.fromarray(rgba, "RGBA").save(preview, optimize=True)
    summary = {
        "east_granule": em["granule"], "west_granule": wm["granule"],
        "east_only_fraction": round(float(np.mean(east_wins)), 5),
        "west_only_fraction": round(float(np.mean(west_wins)), 5),
        "combined_coverage_fraction": round(float(np.mean(valid)), 5),
        "observed_pixels": int(np.count_nonzero(valid)),
        "missing_pixels": int(valid.size - np.count_nonzero(valid)),
        "status": "diagnostic only; not published to globe",
    }
    if summary["observed_pixels"] < 1000:
        raise ValueError("Insufficient real scientific coverage")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--east", type=Path, required=True)
    parser.add_argument("--west", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(mosaic(args.east, args.west, args.output, args.preview), indent=2))


if __name__ == "__main__":
    main()
