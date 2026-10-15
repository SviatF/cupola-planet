#!/usr/bin/env python3
"""Publish individual, QA-screened GOES GLM optical flashes from public NOAA S3.

No paid API, credential or external service. Each flash uses the NOAA L2
energy-weighted CENTROID and acquisition timestamp, not a ground strike.
Files are 20-second GLM-L2-LCFA NetCDF products. Missing observations are
not replaced by synthetic events.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.parse import urlencode, quote
from urllib.request import urlopen
import xml.etree.ElementTree as ET

BUCKETS = {18: "noaa-goes18", 19: "noaa-goes19"}
NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"
STAMP = re.compile(r"_s(\d{13,14})_e(\d{13,14})_")
MAX_FILE_BYTES = 10_000_000
MAX_EVENTS = 1600
SCHEMA = "cupola-goes-glm-flashes/v1"


def scan_times(key):
    match = STAMP.search(key)
    if not match:
        raise ValueError("Not a GOES time-stamped GLM granule: " + key)
    def parse(v):
        return datetime.strptime(v[:13], "%Y%j%H%M%S").replace(tzinfo=timezone.utc)
    start, end = parse(match.group(1)), parse(match.group(2))
    if not (0 < (end - start).total_seconds() <= 30):
        raise ValueError("Invalid GLM observation window")
    return start, end


def list_keys(bucket, prefix):
    cursor = None
    for _ in range(8):  # hard bound on listings
        args = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if cursor:
            args["continuation-token"] = cursor
        with urlopen("https://" + bucket + ".s3.amazonaws.com/?" + urlencode(args), timeout=25) as res:
            root = ET.fromstring(res.read(2_000_000))
        for part in root.findall(NS + "Contents"):
            key = part.findtext(NS + "Key") or ""
            if key.endswith(".nc") and "_GLM-L2-LCFA_" in key:
                yield key
        if root.findtext(NS + "IsTruncated") != "true":
            return
        cursor = root.findtext(NS + "NextContinuationToken")
        if not cursor:
            raise RuntimeError("Truncated NOAA GLM listing")
    raise RuntimeError("Too many S3 listing pages")


def recent_keys(bucket, now, minutes=12, max_files=30):
    entries = []
    for offset in (0, 1):
        hour = now - timedelta(hours=offset)
        prefix = "GLM-L2-LCFA/{}/{:03d}/{:02d}/".format(
            hour.year, hour.timetuple().tm_yday, hour.hour
        )
        for key in list_keys(bucket, prefix):
            try:
                start, end = scan_times(key)
            except ValueError:
                continue
            if now - timedelta(minutes=minutes) <= end <= now + timedelta(minutes=2):
                entries.append((start, key))
    return [item[1] for item in sorted(entries, reverse=True)[:max_files]]


def download(bucket, key):
    url = "https://" + bucket + ".s3.amazonaws.com/" + quote(key, safe="/")
    with urlopen(url, timeout=35) as res:
        payload = res.read(MAX_FILE_BYTES + 1)
    if len(payload) < 1000 or len(payload) > MAX_FILE_BYTES or payload[:4] != b"\x89HDF":
        raise ValueError("NOAA GLM NetCDF4/HDF5 invalid size or magic")
    return payload


def parse_glm(path, key, sat, now):
    import netCDF4
    from netCDF4 import Dataset
    out = []
    scan_start, scan_end = scan_times(key)
    with Dataset(str(path), "r") as nc:
        required = (
            "flash_id", "flash_lat", "flash_lon", "flash_quality_flag",
            "flash_time_offset_of_first_event",
        )
        if not all(name in nc.variables for name in required):
            raise ValueError("Not original NOAA GLM-L2-LCFA flash record")
        if "GLM-L2-LCFA" not in key or ("_G" + str(sat) + "_") not in key:
            raise ValueError("Product identity mismatch")
        ids = nc.variables["flash_id"][:]
        lat = nc.variables["flash_lat"][:]
        lon = nc.variables["flash_lon"][:]
        flag = nc.variables["flash_quality_flag"][:]
        tv = nc.variables["flash_time_offset_of_first_event"]
        offsets = tv[:]
        if not hasattr(tv, "units") or not isinstance(tv.units, str) or " since " not in tv.units:
            raise ValueError("Missing CF timestamp units")
        if not (len(ids) == len(lat) == len(lon) == len(flag) == len(offsets)):
            raise ValueError("Inconsistent GLM flash variables")
        # netCDF4 handles the actual units, including fractional seconds,
        # not a guessed conversion from product/processing time.
        times = netCDF4.num2date(
            offsets, units=tv.units, calendar=getattr(tv, "calendar", "standard"),
            only_use_cftime_datetimes=False,
        )
        for i in range(len(ids)):
            if any(bool(getattr(a, "mask", False)) for a in (ids[i], lat[i], lon[i], flag[i], offsets[i])):
                continue
            if int(flag[i]) != 0:
                continue
            y, x = float(lat[i]), float(lon[i])
            if not (math.isfinite(y) and math.isfinite(x) and -90 <= y <= 90 and -180 <= x <= 180):
                continue
            t = times[i]
            instant = datetime.fromisoformat(str(t).replace(" ", "T"))
            if instant.tzinfo is None:
                instant = instant.replace(tzinfo=timezone.utc)
            instant = instant.astimezone(timezone.utc)
            if not (scan_start - timedelta(seconds=2) <= instant <= scan_end + timedelta(seconds=2)):
                continue
            if not (now - timedelta(minutes=15) <= instant <= now + timedelta(minutes=1)):
                continue
            out.append({
                "id": str(sat) + ":" + scan_start.strftime("%Y%j%H%M%S") + ":" + str(int(ids[i])),
                "lat": round(y, 4), "lon": round(x, 4),
                "observed_at": instant.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "satellite": "GOES-" + str(sat),
            })
    return out


def compose(now, records, sources):
    # Dedup exact stable NOAA flash IDs across overlapping ingestion runs.
    unique = {event["id"]: event for event in records}
    newest_first = sorted(unique.values(), key=lambda e: (e["observed_at"], e["id"]), reverse=True)
    limited = newest_first[:MAX_EVENTS]
    limited.reverse()
    return {
        "schema": SCHEMA,
        "generated_at": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "expires_at": (now + timedelta(minutes=10)).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "latest_observation_at": max((s["last_scan_end"] for s in sources), default=None),
        "observation_kind": "satellite-optical-flash-centroid-not-ground-strike",
        "source": "NOAA GOES GLM-L2-LCFA, public anonymous S3",
        "publication_mode": "best-effort-github-actions-5-minute",
        "coverage": "GOES-18/19 field of view; not global",
        "sources": sources,
        "flashes": limited,
        "count_sampled": len(limited),
        "count_available_in_selected_files": len(unique),
    }


def run(out):
    now = datetime.now(timezone.utc)
    events, sources = [], []
    with tempfile.TemporaryDirectory() as tempdir:
        for sat, bucket in BUCKETS.items():
            try:
                keys = recent_keys(bucket, now)
                if not keys:
                    print("No recent GLM keys for GOES-" + str(sat), flush=True)
                    continue
                newest_scan = max(scan_times(k)[1] for k in keys)
                if now - newest_scan > timedelta(minutes=15):
                    print("GOES-" + str(sat) + " source stale", flush=True)
                    continue
                good_files = 0
                sat_events = []
                for index, key in enumerate(keys):
                    try:
                        data = download(bucket, key)
                        path = Path(tempdir) / ("glm-" + str(sat) + "-" + str(index) + ".nc")
                        path.write_bytes(data)
                        sat_events.extend(parse_glm(path, key, sat, now))
                        path.unlink(missing_ok=True)
                        good_files += 1
                    except Exception as exc:
                        print("Skip unverifiable NOAA granule: " + key[-75:] + " " + str(exc), flush=True)
                if not good_files:
                    continue
                sources.append({
                    "satellite": "GOES-" + str(sat),
                    "product": "GLM-L2-LCFA",
                    "last_scan_end": newest_scan.isoformat(timespec="seconds").replace("+00:00", "Z"),
                    "granules_validated": good_files,
                })
                events.extend(sat_events)
            except Exception as exc:
                print("GOES-" + str(sat) + " source unavailable: " + str(exc), flush=True)
    if not sources:
        raise RuntimeError("No verified fresh GOES GLM observation; refusing to publish")
    payload = compose(now, events, sources)
    out.mkdir(parents=True, exist_ok=True)
    (out / "latest.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(json.dumps({
        "source_count": len(sources), "sampled": payload["count_sampled"],
        "available": payload["count_available_in_selected_files"],
        "last_observed": payload["latest_observation_at"],
    }))


def self_test():
    assert scan_times("x_G19_s20262882200000_e20262882200200_c20262882200300.nc")[1].second == 20
    now = datetime(2026, 10, 15, 22, 0, tzinfo=timezone.utc)
    rows = [{"id":"19:abc:1","lat":12.0,"lon":-88.0,"observed_at":"2026-10-15T21:59:40.000Z","satellite":"GOES-19"}]
    payload = compose(now, rows + rows, [{"satellite":"GOES-19","product":"GLM-L2-LCFA","last_scan_end":"2026-10-15T22:00:00Z","granules_validated":1}])
    assert payload["count_sampled"] == 1 and payload["flashes"][0]["id"] == rows[0]["id"]
    import netCDF4
    with tempfile.TemporaryDirectory() as folder:
        key = "OR_GLM-L2-LCFA_G19_s20262882200000_e20262882200200_c20262882200300.nc"
        path = Path(folder) / key
        with netCDF4.Dataset(str(path), "w") as nc:
            nc.createDimension("number_of_flashes", 2)
            v = {}
            for name, kind, vals in [
                ("flash_id","i4",[1,2]), ("flash_lat","f4",[25.5,26.5]),
                ("flash_lon","f4",[-90.1,-91.1]), ("flash_quality_flag","i2",[0,1]),
                ("flash_time_offset_of_first_event","f8",[1.250,1.500]),
            ]:
                v[name] = nc.createVariable(name,kind,("number_of_flashes",))
                v[name][:] = vals
            v["flash_time_offset_of_first_event"].units = "seconds since 2026-10-15 22:00:00"
        decoded = parse_glm(path, key, 19, now + timedelta(seconds=2))
        assert len(decoded) == 1 and decoded[0]["lat"] == 25.5
        assert decoded[0]["observed_at"] == "2026-10-15T22:00:01.250Z"
    print("PASS: one-off GLM flash ID, QA=0, native CF event time, centroid and schema")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/tmp/cupola-glm"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        run(args.output)
