#!/usr/bin/env python3
"""Discover and verify REAL JMA Himawari-9 full-disk AHI Band-13 segments.

Source: public NOAA-hosted JMA archive s3://noaa-himawari9/
This fetcher does NOT turn IR temperatures into a cloud mask or claim complete
coverage; it establishes an authenticated-by-content L1b ingestion boundary.
Each full disk has 10 HSD segments. Default download is ONE Band-13 segment
for CI/format diagnostics only.
"""
import argparse
import bz2
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import struct
from urllib.parse import urlencode, quote
from urllib.request import urlopen
import xml.etree.ElementTree as ET

BUCKET = "noaa-himawari9"
NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"
FILENAME_RE = re.compile(
    r"^HS_H09_(?P<day>\d{8})_(?P<slot>\d{4})_"
    r"B(?P<band>\d{2})_FLDK_R(?P<resolution>\d{2})_"
    r"S(?P<segment>\d{2})(?P<segments>\d{2})\.DAT\.bz2$"
)


def list_objects(prefix):
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token is not None:
            params["continuation-token"] = token
        with urlopen(f"https://{BUCKET}.s3.amazonaws.com/?" +
                     urlencode(params), timeout=20) as response:
            root = ET.fromstring(response.read())
        for node in root.findall(NS + "Contents"):
            key = node.findtext(NS + "Key")
            if key:
                yield key
        if root.findtext(NS + "IsTruncated") != "true":
            break
        token = root.findtext(NS + "NextContinuationToken")
        if not token:
            raise RuntimeError("Himawari S3 listing truncated without continuation token")


def discover(now, segment=6, band=13, hours=6):
    # The S3 mirror can lag observation time. Never assume "latest" means now.
    now = now.astimezone(timezone.utc).replace(second=0, microsecond=0)
    now -= timedelta(minutes=now.minute % 10)
    for i in range(1, hours * 6 + 1):
        slot = now - timedelta(minutes=i * 10)
        prefix = f"AHI-L1b-FLDK/{slot:%Y/%m/%d/%H%M}/"
        for key in list_objects(prefix):
            match = FILENAME_RE.fullmatch(Path(key).name)
            if not match:
                continue
            if (int(match["band"]) == band and
                    int(match["segment"]) == segment and
                    int(match["segments"]) == 10 and
                    int(match["resolution"]) == 20 and
                    match["day"] == slot.strftime("%Y%m%d") and
                    match["slot"] == slot.strftime("%H%M")):
                return key, slot
    raise RuntimeError("No recent Himawari-9 Band-13 HSD segment found in NOAA S3 archive")


def fetch_and_validate(key, slot, directory, max_bytes=90_000_000):
    name = Path(key).name
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / name
    partial = directory / (name + ".part")
    total = 0
    url = f"https://{BUCKET}.s3.amazonaws.com/{quote(key, safe='/')}"
    try:
        with urlopen(url, timeout=90) as response, partial.open("wb") as handle:
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > max_bytes:
                    raise ValueError("Himawari segment exceeds configured safety limit")
                handle.write(block)
        if total < 10000:
            raise ValueError("Himawari segment too small")
        # HSD comprises binary numbered header blocks. Validate first block
        # of the decompressed stream without expanding a huge file in RAM.
        with bz2.open(partial, "rb") as stream:
            header = stream.read(512)
        if len(header) < 32 or header[0] != 1:
            raise ValueError("Himawari HSD basic information block missing")
        block_length = struct.unpack_from("<H", header, 1)[0]
        if not 32 <= block_length <= 512:
            raise ValueError(f"Unexpected Himawari HSD basic-block length: {block_length}")
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)
    return {
        "satellite": "Himawari-9",
        "product": "AHI-L1b-FLDK",
        "band": 13,
        "segment": int(FILENAME_RE.fullmatch(name)["segment"]),
        "segments_in_disk": 10,
        "source": f"s3://{BUCKET}/{key}",
        "path": str(destination),
        "compressed_bytes": total,
        "hsd_basic_block_bytes": block_length,
        "slot_start_utc": slot.isoformat(),
        "time_precision": "ten-minute-scan-slot-start; NOT per-pixel acquisition time",
        "decoded_cloud_mask": False,
        "decoded_geo_atlas": False,
    }



def fetch_complete_disk(now, directory, hours=6, exact_slot=None):
    # JMA publishes a 10-segment full disk progressively. An incomplete
    # newest 10-minute slot must NOT make ingest fail or mix older segments.
    now = now.astimezone(timezone.utc).replace(second=0, microsecond=0)
    now -= timedelta(minutes=now.minute % 10)
    slots_skipped = []
    if exact_slot is not None:
        exact_slot = exact_slot.astimezone(timezone.utc)
        if exact_slot.minute % 10 or exact_slot.second or exact_slot.microsecond:
            raise ValueError("L2 cloud mask does not specify a valid 10-minute scan slot")
        if not (timedelta(0) <= now - exact_slot <= timedelta(hours=hours)):
            raise ValueError("Matching Level-2 mask is outside the permitted L1b freshness window")
        candidate_slots = [exact_slot]
    else:
        candidate_slots = [now-timedelta(minutes=i*10)
                           for i in range(1, hours*6+1)]
    for slot in candidate_slots:
        prefix = f"AHI-L1b-FLDK/{slot:%Y/%m/%d/%H%M}/"
        available = {}
        for candidate in list_objects(prefix):
            match = FILENAME_RE.fullmatch(Path(candidate).name)
            if (match and match["day"] == slot.strftime("%Y%m%d") and
                    match["slot"] == slot.strftime("%H%M") and
                    int(match["band"]) == 13 and int(match["resolution"]) == 20 and
                    int(match["segments"]) == 10):
                available[int(match["segment"])] = candidate
        if set(available) != set(range(1, 11)):
            slots_skipped.append({"slot_utc": slot.isoformat(),
                                  "segments_present": len(available)})
            continue
        segments = []
        for segment_number in range(1, 11):
            metadata = fetch_and_validate(available[segment_number], slot, directory)
            segments.append(metadata)
        return {
            "satellite": "Himawari-9", "product": "AHI-L1b-FLDK",
            "band": 13, "slot_start_utc": slot.isoformat(),
            "segments": segments,
            "complete_disk": True,
            "newer_incomplete_scans": slots_skipped[:10],
            "decoded_cloud_mask": False,
        }
    raise RuntimeError(
        f"No complete synchronous Himawari-9 Band-13 scan within {hours}h;"
        f" newest incomplete scans: {slots_skipped[:10]}")



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("/tmp/cupola-himawari"))
    parser.add_argument("--segment", type=int, choices=range(1, 11), default=6)
    parser.add_argument("--hours", type=int, choices=range(1, 13), default=6)
    parser.add_argument("--all-segments", action="store_true",
                        help="download every Band-13 segment from the SAME scan slot")
    parser.add_argument("--l2-manifest", type=Path,
                        help="require EXACT same UTC slot as a discovered AHI-CMSK cloud mask")
    args = parser.parse_args()
    exact_slot = None
    if args.l2_manifest:
        if not args.all_segments:
            parser.error("--l2-manifest requires --all-segments")
        mask = json.loads(args.l2_manifest.read_text(encoding="utf-8"))
        if (mask.get("satellite") != "Himawari-9" or
                mask.get("product") != "AHI-CMSK" or
                not mask.get("source", "").startswith(
                    "s3://noaa-himawari9/AHI-L2-FLDK-Clouds/")):
            raise ValueError("Unverified Himawari-9 Level-2 scan provenance")
        exact_slot = datetime.fromisoformat(mask["observation_start_utc"])
    if args.all_segments:
        metadata = fetch_complete_disk(datetime.now(timezone.utc),
                                       args.output_dir, args.hours, exact_slot)
    else:
        key, slot = discover(datetime.now(timezone.utc), args.segment, hours=args.hours)
        metadata = fetch_and_validate(key, slot, args.output_dir)
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
