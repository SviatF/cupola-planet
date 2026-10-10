#!/usr/bin/env python3
"""Keyless, worldwide NOAA GFS total cloud-cover backup for CUPOLA V3.

This is a NWP forecast/analysis, NOT a satellite observation and never
increases the GOES/Himawari Level-2 observed footprint. It is only used
for no-data pixels after all available real satellite imagery.

Fetch precisely one TCDC:entire atmosphere GRIB2 message via the open
NOAA AWS GFS .idx + HTTP Range API. No full 500 MB GRIB downloads.
"""
import argparse
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import urllib.error
import urllib.request

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 2048, 1024
AWS = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
IDX_LINE = re.compile(r"^\d+:(\d+):d=\d{10}:TCDC:entire atmosphere(?:[^:]*)?:")
MAX_MESSAGE_BYTES = 12_000_000
MAX_SOURCE_HOURS = 12


def get_bytes(url: str, headers=None, max_bytes=200_000):
    req = urllib.request.Request(url, headers={
        "User-Agent": "CUPOLA-v3-GFS-global-cloud-cover/1.0",
        **(headers or {}),
    })
    with urllib.request.urlopen(req, timeout=35) as response:
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("GFS response exceeded safe byte limit")
        return data, response.status


def cycles(now):
    base = now.replace(hour=(now.hour // 6) * 6, minute=0, second=0, microsecond=0)
    for i in range(4):
        yield base - timedelta(hours=6 * i)


def resolve_tcdc(now):
    last_error = "No available public GFS"
    for cycle in cycles(now):
        name = f"gfs.{cycle:%Y%m%d}/{cycle:%H}/atmos/gfs.t{cycle:%H}z.pgrb2.0p25.f000"
        idx_url = f"{AWS}/{name}.idx"
        try:
            body, _ = get_bytes(idx_url)
            rows = body.decode("utf-8").splitlines()
            for i, row in enumerate(rows[:-1]):
                matched = IDX_LINE.match(row)
                if not matched:
                    continue
                start = int(matched.group(1))
                end = int(rows[i + 1].split(":")[1]) - 1
                if end < start or end - start + 1 > MAX_MESSAGE_BYTES:
                    raise ValueError("GFS TCDC field exceeds allowed range")
                field = f"{AWS}/{name}"
                data, status = get_bytes(field, {
                    "Range": f"bytes={start}-{end}",
                }, max_bytes=MAX_MESSAGE_BYTES)
                if status != 206 or len(data) != end - start + 1 or data[:4] != b"GRIB":
                    raise ValueError("Invalid GFS GRIB range response")
                return cycle, data, name, row
            last_error = f"No TCDC entire-atmosphere field in {idx_url}"
        except (urllib.error.URLError, TimeoutError, ValueError, IndexError) as error:
            last_error = str(error)
            print("Source skipped:", cycle.isoformat(), str(error)[:180])
    raise ValueError(last_error)


def decode_grib(message, cycle):
    from eccodes import codes_grib_new_from_file, codes_get_array, codes_get, codes_release
    gid = codes_grib_new_from_file(BytesIO(message))
    if gid is None:
        raise ValueError("GFS GRIB2 decoder returned no message")
    try:
        ni = int(codes_get(gid, "Ni"))
        nj = int(codes_get(gid, "Nj"))
        if (ni, nj) != (1440, 721):
            raise ValueError(f"Unexpected GFS full-earth grid {ni}x{nj}")
        lat0 = float(codes_get(gid, "latitudeOfFirstGridPointInDegrees"))
        lon0 = float(codes_get(gid, "longitudeOfFirstGridPointInDegrees"))
        northward = int(codes_get(gid, "jScansPositively"))
        eastward = int(codes_get(gid, "iScansNegatively"))
        if abs(lat0 - 90) > .001 or abs(lon0) > .001 or northward != 0 or eastward != 0:
            raise ValueError("Unexpected GFS grid scan direction / geographic origin")
        if int(codes_get(gid, "dataDate")) != int(cycle.strftime("%Y%m%d")) or int(
            codes_get(gid, "dataTime")
        ) != int(cycle.strftime("%H00")):
            raise ValueError("GFS GRIB date does not match indexed run")
        shortname = str(codes_get(gid, "shortName"))
        if shortname.lower() not in ("tcc", "tcdc"):
            raise ValueError(f"Unexpected GFS variable {shortname}")
        vals = np.asarray(codes_get_array(gid, "values"), dtype=np.float32)
        if vals.size != ni * nj or not np.all(np.isfinite(vals)):
            raise ValueError("GFS TCDC has non-finite or missing coverage")
        if np.any((vals < -.02) | (vals > 100.02)):
            raise ValueError("GFS TCDC values outside 0..100 percent")
        vals = vals.reshape(nj, ni)
        # NOAA longitudes are 0..359.75. Pixel x=0 in equirectangular Earth is -180.
        vals = np.roll(vals, ni // 2, axis=1)
        return np.clip(vals, 0, 100).astype(np.float32)
    finally:
        codes_release(gid)


def build(args):
    now = datetime.now(timezone.utc)
    cycle, grib, source_path, idx_field = resolve_tcdc(now)
    if now - cycle > timedelta(hours=MAX_SOURCE_HOURS):
        raise ValueError("NOAA GFS input is older than 12 hours")
    cloud = decode_grib(grib, cycle)
    # Upscale the actual full-Earth 0.25-degree grid; do not inject clouds
    # outside model values. GFS clear=0 is genuine MODEL CLEAR, not no-data.
    values = np.round(cloud / 100 * 255).astype(np.uint8)
    im = Image.fromarray(values, mode="L").resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)
    rgba = Image.merge("RGBA", (im, Image.new("L", (WIDTH, HEIGHT), 255),
                                 Image.new("L", (WIDTH, HEIGHT), 0),
                                 Image.new("L", (WIDTH, HEIGHT), 255)))
    version = now.strftime("%Y%m%d%H%M%S")
    args.output.mkdir(parents=True, exist_ok=True)
    png = args.output / f"gfs-cloud-cover-{version}.png"
    manifest_path = args.output / f"gfs-manifest-{version}.json"
    rgba.save(png, optimize=True)
    expires = cycle + timedelta(hours=MAX_SOURCE_HOURS)
    manifest = {
        "schema": "cupola-global-gfs-model-v1",
        "version": version,
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "model_run_at": cycle.isoformat().replace("+00:00", "Z"),
        "valid_at": cycle.isoformat().replace("+00:00", "Z"),
        "expires_at": expires.isoformat().replace("+00:00", "Z"),
        "variable": "TCDC:entire atmosphere",
        "model": "NOAA NCEP GFS 0.25 degree",
        "source": source_path,
        "source_index_line": idx_field,
        "grid_coverage_fraction": 1.0,
        "noaa_goes_l2_coverage_contribution": 0,
        "is_satellite_observation": False,
        "width": WIDTH,
        "height": HEIGHT,
        "channels": "R=model cloud cover,G=model grid validity,B=reserved,A=opaque",
        "atlas_file": png.name,
        "atlas_sha256": sha256(png.read_bytes()).hexdigest(),
        "bytes_downloaded_grib": len(grib),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


def test():
    now = datetime.now(timezone.utc)
    cycles_list = list(cycles(now))
    assert all(c.tzinfo is not None and c.hour % 6 == 0 for c in cycles_list)
    sample = "500:123456:d=2026101006:TCDC:entire atmosphere:anl:"
    assert IDX_LINE.match(sample) and not IDX_LINE.match(sample.replace("TCDC", "TMP"))
    test_vals = np.tile(np.arange(1440, dtype=np.float32), (721, 1))
    shifted = np.roll(test_vals, 720, axis=1)
    assert shifted[0, 0] == 720 and shifted[0, 720] == 0
    print("GFS indexing, geographic wrap and UTC cycle tests: PASS")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, default=Path("/tmp/cupola-gfs"))
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        test()
    else:
        build(args)
