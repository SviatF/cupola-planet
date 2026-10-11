#!/usr/bin/env python3
"""Read-only, anonymous NOAA JPSS polar Cloud Mask source inventory.

This script does NOT decode pixels, assume licences, or claim any VIIRS cloud
coverage. It only probes official public S3 object listings. A named cloud-mask
product in NOAA CLASS or NASA LAADS does not imply it is mirrored in NOAA NODD.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

BUCKETS = ("noaa-nesdis-n21-pds", "noaa-nesdis-n20-pds", "noaa-nesdis-snpp-pds")
CLOUD_PREFIX = re.compile(r"(?:viirs.*(?:cloud|cld|cm(?:-|_))|jrr.*(?:cloud|cld|cm(?:-|_)))", re.I)
NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"
UTC = dt.timezone.utc


def list_objects(bucket: str, prefix: str = "", delimiter: str = "/",
                 pages: int = 4) -> dict:
    result: dict = {"bucket": bucket, "prefix": prefix, "prefixes": [],
                    "objects": [], "complete": False}
    token = None
    for _ in range(pages):
        query = {"list-type": "2", "delimiter": delimiter,
                 "prefix": prefix, "max-keys": 1000}
        if token:
            query["continuation-token"] = token
        url = f"https://{bucket}.s3.amazonaws.com/?" + urllib.parse.urlencode(query)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CUPOLA-Polar-Source-Discovery/1.0"})
            with urllib.request.urlopen(req, timeout=18) as response:
                body = response.read(2_000_000)
                if response.read(1):
                    raise ValueError("S3 XML response exceeded byte limit")
            root = ET.fromstring(body)
            result["prefixes"].extend(
                el.text or "" for el in root.findall(f".//{NS}CommonPrefixes/{NS}Prefix")
            )
            for el in root.findall(f".//{NS}Contents"):
                result["objects"].append({
                    "key": el.findtext(f"{NS}Key", default=""),
                    "last_modified": el.findtext(f"{NS}LastModified", default=""),
                    "size": el.findtext(f"{NS}Size", default=""),
                })
            if root.findtext(f"{NS}IsTruncated", default="false") != "true":
                result["complete"] = True
                break
            token = root.findtext(f"{NS}NextContinuationToken")
            if not token:
                result["error"] = "truncated-listing-without-continuation"
                break
        except (urllib.error.URLError, TimeoutError, ValueError, ET.ParseError) as exc:
            result["error"] = f"{type(exc).__name__}: {str(exc)[:180]}"
            break
    return result


def run() -> dict:
    now = dt.datetime.now(UTC)
    dates = [now.date(), now.date() - dt.timedelta(days=1)]
    summary = {
        "generated_at": now.isoformat(),
        "type": "anonymous-NOAA-NODD-object-discovery-only",
        "read_only": True, "native_cloud_mask_decoded": False,
        "ready_for_globe": False, "buckets": [],
        "note": "Catalog product naming is not evidence of available native Level-2 bytes.",
    }
    for bucket in BUCKETS:
        root = list_objects(bucket)
        candidates = [p for p in root["prefixes"] if CLOUD_PREFIX.search(p)]
        entry = {
            "bucket": bucket, "root_accessible": "error" not in root,
            "root_listing_complete": root["complete"],
            "root_error": root.get("error"),
            "top_level_prefixes_seen": len(root["prefixes"]),
            "cloud_mask_candidate_prefixes": candidates,
            "samples": [],
        }
        for p in candidates[:4]:
            for day in dates:
                dayprefix = p + day.strftime("%Y/%m/%d/")
                items = list_objects(bucket, dayprefix, delimiter="", pages=1)
                entry["samples"].append({
                    "prefix": dayprefix, "accessible": "error" not in items,
                    "error": items.get("error"),
                    "objects": len(items["objects"]),
                    "examples": items["objects"][:2],
                    "listing_complete": items["complete"],
                })
        summary["buckets"].append(entry)
    return summary


def self_test() -> None:
    assert CLOUD_PREFIX.search("VIIRS-CM-EDR/")
    assert CLOUD_PREFIX.search("JRR-CloudMask/")
    assert not CLOUD_PREFIX.search("VIIRS-I1-SDR/")
    assert not CLOUD_PREFIX.search("VIIRS-IMG-GEO-TC/")
    print("PASS: conservative Cloud Mask candidate matching")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--output")
    args = p.parse_args()
    if args.self_test:
        self_test()
        sys.exit(0)
    report = run()
    payload = json.dumps(report, indent=2, ensure_ascii=False)
    print(payload)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fd:
            fd.write(payload + "\n")
