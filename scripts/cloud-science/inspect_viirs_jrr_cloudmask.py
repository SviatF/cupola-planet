#!/usr/bin/env python3
"""Inspect ONE real anonymous NOAA-21 JRR CloudMask netCDF granule.

Diagnostic only. No production ingestion and NO native QA mapping assumed.
Runs off-browser in GitHub Actions; does not affect Earth/Cinema textures.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request

from probe_viirs_polar_sources import list_objects

BUCKET = "noaa-nesdis-n21-pds"
PRODUCT = "VIIRS-JRR-CloudMask/"
MAX_BYTES = 90_000_000
SCAN = re.compile(r"_s(\d{13})_e(\d{13})_")


def render(value):
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (int, float, bool, str)):
        return value
    return str(value)[:320]


def inspect(path):
    from netCDF4 import Dataset
    report = {"netcdf_opened": False, "variables": [], "groups": [],
              "cloud_fields_identified": [], "geolocation_fields_identified": []}
    with Dataset(path, "r") as ds:
        report["netcdf_opened"] = True
        report["global_attrs"] = {
            name: render(ds.getncattr(name))
            for name in ds.ncattrs()
            if any(token in name.lower() for token in
                   ("product", "platform", "start", "end", "time", "satellite", "instrument"))
        }
        def walk(group, prefix=""):
            report["groups"].append(prefix or "/")
            for name, var in group.variables.items():
                key = prefix + "/" + name
                item = {"path": key, "shape": list(var.shape),
                        "dtype": str(var.dtype),
                        "dimensions": list(var.dimensions),
                        "attrs": {k: render(var.getncattr(k))
                                  for k in var.ncattrs()
                                  if any(t in k.lower() for t in (
                                      "long_name", "standard_name", "flag", "valid",
                                      "fill", "units", "description", "coordinates"))}}
                report["variables"].append(item)
                if any(t in key.lower() for t in ("cloudmask", "cloud_mask", "quality", "qa")):
                    report["cloud_fields_identified"].append(key)
                if any(t in key.lower() for t in ("latitude", "longitude", "lat", "lon")):
                    report["geolocation_fields_identified"].append(key)
            for name, child in group.groups.items():
                walk(child, prefix + "/" + name)
        walk(ds)
    report["native_qa_decoded"] = False
    report["ready_for_globe"] = False
    return report


def run():
    now = dt.datetime.now(dt.timezone.utc)
    output = {"generated_at": now.isoformat(), "bucket": BUCKET,
              "product": PRODUCT, "native_qa_decoded": False,
              "ready_for_globe": False}
    recent = []
    for day in (now.date(), now.date() - dt.timedelta(days=1)):
        prefix = PRODUCT + day.strftime("%Y/%m/%d/")
        scan = list_objects(BUCKET, prefix, delimiter="", pages=2)
        if scan.get("error"):
            output.setdefault("listing_errors", []).append(scan["error"])
        recent.extend(f for f in scan["objects"] if f["key"].endswith(".nc"))
        if recent:
            break
    if not recent:
        output["error"] = "No anonymously listed NetCDF granules in recent dates"
        return output
    selected = max(recent, key=lambda f: f["key"])
    output["granule"] = selected
    found = SCAN.search(selected["key"])
    if found:
        output["scan_start_id"] = found.group(1)
        output["scan_end_id"] = found.group(2)
    if int(selected.get("size", 0)) > MAX_BYTES:
        output["error"] = "Size over 90 MB safety budget"
        return output
    url = f"https://{BUCKET}.s3.amazonaws.com/" + urllib.parse.quote(selected["key"], safe="/")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CUPOLA-Scientific-Cloud-Inspector/1.0"})
        with tempfile.TemporaryDirectory(prefix="cupola-viirs-") as tmp:
            local = os.path.join(tmp, "granule.nc")
            total = 0
            with urllib.request.urlopen(req, timeout=80) as response, open(local, "wb") as fd:
                while True:
                    part = response.read(1_048_576)
                    if not part:
                        break
                    total += len(part)
                    if total > MAX_BYTES:
                        raise ValueError("Download exceeds byte budget")
                    fd.write(part)
            output["download_bytes"] = total
            if total != int(selected["size"]):
                raise ValueError("NetCDF bytes differ from S3 object listing")
            output.update(inspect(local))
    except Exception as exc:
        output["error"] = type(exc).__name__ + ": " + str(exc)[:260]
    return output


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", required=True)
    args = p.parse_args()
    report = run()
    payload = json.dumps(report, ensure_ascii=False, indent=2, default=str)
    print(payload)
    with open(args.output, "w", encoding="utf-8") as fd:
        fd.write(payload + "\n")
