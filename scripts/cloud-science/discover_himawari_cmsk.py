#!/usr/bin/env python3
"""Check availability of official NOAA/JMA Himawari-9 AHI L2 cloud-mask files.

Discovers filenames and object metadata ONLY. A filename or S3 HTTP 200 does
not validate the product's cloud categories, QA flags or geolocation.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import PurePosixPath
import re
from urllib.request import Request, urlopen
from urllib.parse import quote

from fetch_himawari_ahi import BUCKET, list_objects

CLOUD_PREFIX = "AHI-L2-FLDK-Clouds/"
CLOUD_FILE = re.compile(r"^AHI-CMSK_.*_h09_s(\d{12,16})_.*\.nc$", re.I)


def discover(now, lookback_hours=24, matched_slot=None):
    now = now.astimezone(timezone.utc)
    dates = sorted({(now-timedelta(hours=i)).strftime("%Y/%m/%d")
                    for i in range(lookback_hours+1)}, reverse=True)
    for day in dates:
        prefix = CLOUD_PREFIX + day + "/"
        matches = []
        for key in list_objects(prefix):
            name = PurePosixPath(key).name
            if CLOUD_FILE.match(name):
                matches.append(key)
        if not matches:
            continue
        for key in sorted(matches, reverse=True):
            name = PurePosixPath(key).name
            time_match = re.search(r"_s(\d{12})", name)
            if not time_match:
                continue
            observation = datetime.strptime(time_match[1], "%Y%m%d%H%M").replace(
                tzinfo=timezone.utc
            )
            age_hours = (now-observation).total_seconds()/3600
            # A matching L1b scan is required before any scientific L1b/L2
            # pixel fusion. Never silently use a newer/older cloud mask.
            if matched_slot is not None and matched_slot != observation:
                continue
            if age_hours < -0.5 or age_hours > lookback_hours:
                continue
            url=f"https://{BUCKET}.s3.amazonaws.com/{quote(key, safe='/')}"
            request=Request(url, method="HEAD")
            with urlopen(request, timeout=20) as response:
                size=int(response.headers.get("Content-Length","0"))
                if size<10000:
                    continue
            return {
                "product": "AHI-CMSK", "satellite": "Himawari-9",
                "source": "s3://"+BUCKET+"/"+key,
                "observation_start_utc": observation.isoformat(),
                "age_hours": round(age_hours, 3),
                "netcdf_bytes": size,
                "decoded_cloud_mask": False,
                "validated_mask_qa": False,
            }
    raise RuntimeError("No recent public Himawari-9 AHI L2 cloud mask on NOAA S3")


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--hours",type=int,default=24)
    p.add_argument("--match-hsd-manifest",type=str,
                   help="find the AHI-CMSK scan matching a full-disk L1b manifest")
    a=p.parse_args()
    matched_slot=None
    if a.match_hsd_manifest:
        metadata=json.loads(open(a.match_hsd_manifest,encoding="utf-8").read())
        if not metadata.get("complete_disk") or metadata.get("satellite")!="Himawari-9":
            raise ValueError("Expected validated Himawari-9 full-disk manifest")
        matched_slot=datetime.fromisoformat(metadata["slot_start_utc"])
    print(json.dumps(discover(datetime.now(timezone.utc),a.hours,matched_slot),
                     indent=2))
