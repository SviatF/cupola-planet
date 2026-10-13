#!/usr/bin/env python3
"""Read Himawari-9 AHI-CMSK NetCDF4/HDF5 metadata via HTTP range requests.

Never loads 371MB+ L2 data arrays or mistakes dataset names for validated
category semantics. Outputs a bounded schema summary for scientific review.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import quote
import numpy as np


def to_json(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if isinstance(value, np.ndarray):
        return [to_json(v) for v in value.ravel().tolist()[:24]]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)


def inspect(manifest, output):
    import fsspec
    import h5py

    info = json.loads(manifest.read_text())
    if info.get("product") != "AHI-CMSK" or info.get("satellite") != "Himawari-9":
        raise ValueError("Expected verified NOAA Himawari-9 AHI-CMSK manifest")
    source = info["source"]
    if not source.startswith("s3://noaa-himawari9/AHI-L2-FLDK-Clouds/"):
        raise ValueError("Unexpected Level-2 cloud product provenance")
    url = "https://noaa-himawari9.s3.amazonaws.com/" + quote(
        source.split("s3://noaa-himawari9/", 1)[1], safe="/")
    datasets = []
    attrs_to_capture = {"long_name", "standard_name", "units", "flag_values",
                        "flag_meanings", "flag_masks", "_FillValue",
                        "valid_range", "scale_factor", "add_offset"}
    # fsspec allows HDF5 metadata seeks without transferring the full L2 file.
    with fsspec.open(url, "rb", block_size=1024 * 1024,
                     cache_type="readahead") as stream:
        with h5py.File(stream, "r") as netcdf:
            def visit(path, node):
                if not isinstance(node, h5py.Dataset) or len(datasets) >= 200:
                    return
                attrs = {str(k): to_json(v) for k, v in node.attrs.items()
                         if str(k) in attrs_to_capture}
                datasets.append({"name": path, "shape": list(node.shape),
                                 "dtype": str(node.dtype), "attrs": attrs})
            netcdf.visititems(visit)
    mask_candidates = [d["name"] for d in datasets if
                       any(w in d["name"].lower() for w in
                           ("mask", "cloud", "quality", "flag", "dqf", "prob"))]
    if not mask_candidates:
        raise ValueError("AHI-CMSK HDF5 contains no recognizable cloud or QA variable names")
    summary = {
        "satellite": "Himawari-9", "product": "AHI-CMSK",
        "source": source, "netcdf_bytes": info["netcdf_bytes"],
        "metadata_only_http_ranges": True,
        "dataset_count_listed": len(datasets),
        "mask_candidate_paths": mask_candidates[:50],
        "datasets": datasets,
        "classification_verified": False,
        "geo_reprojection_verified": False,
        "ready_for_cinema_cloud_layer": False,
    }
    output.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    summary = inspect(args.manifest, args.output)
    primary = {"CloudMask", "CloudMaskBinary", "CloudMaskQualFlag", "CloudMaskPacked",
               "latitude", "longitude", "Latitude", "Longitude", "goes_imager_projection", "Projection"}
    important = [d for d in summary["datasets"] if
                 d["name"] in primary or d["name"].lower() in
                 {"x", "y", "lat", "lon"}]
    print(json.dumps({"source": summary["source"],
                      "mask_candidate_paths": summary["mask_candidate_paths"],
                      "dataset_count_listed": summary["dataset_count_listed"],
                      "important_field_metadata": important,
                      "metadata_only_http_ranges": True}, indent=2))
