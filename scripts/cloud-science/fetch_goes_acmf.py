#!/usr/bin/env python3
"""Discover and download a recent public NOAA GOES ABI-L2-ACMF granule.

Uses NOAA's public S3 inventory (no AWS credentials). This runs in an
external Python ingestion job, NOT in the user's browser or Next.js Worker.
It does not publish an atlas or claim that a frame was processed.
"""
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import urlopen
import xml.etree.ElementTree as ET

BUCKETS = {"east": "noaa-goes19", "west": "noaa-goes18"}
NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"


def object_names(bucket, prefix, timeout=20):
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token:
            params["continuation-token"] = token
        url = f"https://{bucket}.s3.amazonaws.com/?" + urlencode(params)
        with urlopen(url, timeout=timeout) as response:
            root = ET.fromstring(response.read())
        for item in root.findall(NS + "Contents"):
            key = item.findtext(NS + "Key")
            if key and key.endswith(".nc") and "ABI-L2-ACMF" in key:
                yield key
        truncated = root.findtext(NS + "IsTruncated") == "true"
        if not truncated:
            break
        token = root.findtext(NS + "NextContinuationToken")
        if not token:
            raise RuntimeError("S3 listing truncated without continuation token")


def choose_recent(bucket, now, hours=3):
    found = []
    for h in range(hours + 1):
        dt = now - timedelta(hours=h)
        prefix = f"ABI-L2-ACMF/{dt.year}/{dt.timetuple().tm_yday:03d}/{dt.hour:02d}/"
        found.extend(object_names(bucket, prefix))
    if not found:
        raise RuntimeError("No public ABI-L2-ACMF granules found")
    # Filename contains observation start marker _sYYYYDDDHHMMSS. Lexical
    # sorting among the official convention preserves chronological order.
    return max(found, key=lambda k: k.split("_s", 1)[-1].split("_", 1)[0])


def download(bucket, key, destination, max_bytes=150_000_000):
    url = f"https://{bucket}.s3.amazonaws.com/{quote(key, safe='/')}"
    tmp = destination.with_suffix(destination.suffix + ".part")
    total = 0
    try:
        with urlopen(url, timeout=90) as response, tmp.open("wb") as output:
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > max_bytes:
                    raise RuntimeError("Unexpectedly large science granule")
                output.write(block)
        if total < 10_000:
            raise RuntimeError("Downloaded file is unexpectedly small")
        tmp.replace(destination)
    finally:
        tmp.unlink(missing_ok=True)
    return total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--satellite", choices=BUCKETS, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("science-granules"))
    parser.add_argument("--hours", type=int, default=3)
    args = parser.parse_args()
    if args.hours < 0 or args.hours > 12:
        parser.error("--hours must be from 0 to 12")
    bucket = BUCKETS[args.satellite]
    key = choose_recent(bucket, datetime.now(timezone.utc), args.hours)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    destination = args.output_dir / Path(key).name
    size = download(bucket, key, destination)
    print(f"{destination} ({size} bytes, source={bucket}, key={key})")
    print("Next: decode_goes_acmf.py (separately validates capture time and science variables)")


if __name__ == "__main__":
    main()
