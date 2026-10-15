#!/usr/bin/env python3
"""Discover and download a recent public NOAA GOES ABI-L2-ACMF granule.

Uses NOAA's public S3 inventory (no AWS credentials). This runs in an
external Python ingestion job, NOT in the user's browser or Next.js Worker.
It does not publish an atlas or claim that a frame was processed.
"""
import argparse
import re
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
            if key and key.endswith(".nc") and ("ABI-L2-ACMF" in key or "ABI-L1b-RadF" in key):
                yield key
        truncated = root.findtext(NS + "IsTruncated") == "true"
        if not truncated:
            break
        token = root.findtext(NS + "NextContinuationToken")
        if not token:
            raise RuntimeError("S3 listing truncated without continuation token")


def choose_recent(bucket, now, hours=3, product="ABI-L2-ACMF", band=None):
    found = []
    for h in range(hours + 1):
        dt = now - timedelta(hours=h)
        prefix = f"{product}/{dt.year}/{dt.timetuple().tm_yday:03d}/{dt.hour:02d}/"
        found.extend(key for key in object_names(bucket, prefix) if (not band or f"C{band:02d}_" in key))
    if not found:
        raise RuntimeError("No public ABI-L2-ACMF granules found")
    # Filename contains observation start marker _sYYYYDDDHHMMSS. Lexical
    # sorting among the official convention preserves chronological order.
    return max(found, key=lambda k: k.split("_s", 1)[-1].split("_", 1)[0])



def observation_midpoint(path):
    """UTC midpoint of an official NOAA _sYYYYDDDHHMMSSd_e... scan slot."""
    match = re.search(r"_s([0-9]{13,14})_e([0-9]{13,14})_", Path(path).name)
    if not match:
        raise ValueError("Missing official GOES scan timestamps in " + Path(path).name)

    def parse(stamp):
        whole = datetime.strptime(stamp[:13], "%Y%j%H%M%S").replace(tzinfo=timezone.utc)
        return whole + timedelta(milliseconds=(int(stamp[13]) * 100 if len(stamp) == 14 else 0))

    return parse(match.group(1)) + (parse(match.group(2)) - parse(match.group(1))) / 2


def choose_matching(bucket, cloud_granule, max_separation_seconds=600):
    """Select Band-13 IR closest to the *cloud mask*, not the newest IR.

    Downloading independent 'latest' feeds can silently pair scans 20+ minutes
    apart during publication lag. Fail closed if no matching observation exists.
    """
    anchor = observation_midpoint(cloud_granule)
    matches = []
    for offset in (-1, 0, 1):
        dt = anchor + timedelta(hours=offset)
        prefix = f"ABI-L1b-RadF/{dt.year}/{dt.timetuple().tm_yday:03d}/{dt.hour:02d}/"
        for key in object_names(bucket, prefix):
            if "C13_" in key:
                try:
                    matches.append((abs((observation_midpoint(key) - anchor).total_seconds()), key))
                except ValueError:
                    continue
    if not matches:
        raise RuntimeError("No NOAA Band-13 IR granules near the matching cloud mask")
    delta, key = min(matches, key=lambda candidate: (candidate[0], candidate[1]))
    if delta > max_separation_seconds:
        raise RuntimeError(f"No same-slot NOAA Band-13 IR: closest is {delta:.0f}s from cloud mask")
    return key


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
    parser.add_argument("--product", choices=("ABI-L2-ACMF", "ABI-L1b-RadF"), default="ABI-L2-ACMF")
    parser.add_argument("--band", type=int, choices=range(1, 17))
    parser.add_argument("--match-granule", type=Path, help="Match Band-13 to this cloud mask capture time")
    args = parser.parse_args()
    if args.hours < 0 or args.hours > 12:
        parser.error("--hours must be from 0 to 12")
    bucket = BUCKETS[args.satellite]
    if args.product == "ABI-L1b-RadF" and args.band is None:
        parser.error("L1b radiance requires --band")
    if args.match_granule:
        if args.product != "ABI-L1b-RadF" or args.band != 13:
            parser.error("--match-granule requires ABI-L1b-RadF --band 13")
        expected_satellite = "_G19_" if args.satellite == "east" else "_G18_"
        if expected_satellite not in args.match_granule.name:
            parser.error("The cloud mask satellite does not match the requested IR satellite")
        key = choose_matching(bucket, args.match_granule)
    else:
        key = choose_recent(bucket, datetime.now(timezone.utc), args.hours, args.product, args.band)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    destination = args.output_dir / Path(key).name
    size = download(bucket, key, destination)
    print(f"{destination} ({size} bytes, source={bucket}, key={key})")
    print("Next: decode_goes_acmf.py (separately validates capture time and science variables)")


if __name__ == "__main__":
    main()
