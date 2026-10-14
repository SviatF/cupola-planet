#!/usr/bin/env python3
"""CUPOLA lightning feed diagnostic: checks real WMS freshness and nonempty PNGs.

Not an event generator. No synthetic flashes are injected in any mode.
A service outage must be visible in Actions rather than becoming fake LIVE.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from PIL import Image

SOURCES = (
    ("NOAA nowCOAST", "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows",
     "ldn_lightning_strike_density", "lightning_density", "1.1.1"),
    ("EUMETSAT MTG LI", "https://view.eumetsat.int/geoserver/wms",
     "mtg_fd:li_afa", "", "1.3.0"),
)


def local(tag):
    return tag.split("}")[-1].split(":")[-1]


def select_layer(root, name):
    for layer in root.iter():
        if local(layer.tag) != "Layer":
            continue
        names = [node.text.strip() for node in layer if local(node.tag) == "Name" and node.text]
        if name in names:
            return layer
    return None


def layer_observation(layer, now):
    options = []
    if layer is None:
        return None
    for child in layer:
        if local(child.tag) not in {"Dimension", "Extent"} or child.attrib.get("name", "").lower() != "time":
            continue
        for entry in (child.text or "").split(","):
            stamp = entry.strip().split("/")
            raw = stamp[1] if len(stamp) >= 2 else stamp[0]
            try:
                observed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if observed.tzinfo is None:
                    continue
                if now - timedelta(minutes=90) <= observed <= now + timedelta(minutes=5):
                    options.append(observed)
            except ValueError:
                continue
    return max(options) if options else None


def region_for_pixel(x, y, width, height):
    """North-up WMS 1.1.1 EPSG:4326 location; qualitative QA, not strike count."""
    lon = -180.0 + (x + 0.5) * 360.0 / width
    lat = 90.0 - (y + 0.5) * 180.0 / height
    if 15 <= lat <= 75 and -170 <= lon <= -50:
        return "NORTH_AMERICA"
    if -60 <= lat < 15 and -85 <= lon <= -30:
        return "SOUTH_AMERICA"
    if 34 <= lat <= 72 and -12 <= lon <= 45:
        return "EUROPE"
    if -37 <= lat < 34 and -18 <= lon <= 53:
        return "AFRICA"
    if -55 <= lat <= 75 and 53 < lon <= 180:
        return "ASIA_PACIFIC"
    return "OTHER_OCEAN_OR_REGION"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "CUPOLA-Lightning-Feed-Diagnostics/1.0"})
    with urllib.request.urlopen(req, timeout=16) as res:
        return res.headers.get("content-type", ""), res.read(18_000_000)


def probe(name, base, layer, style, version):
    now = datetime.now(timezone.utc)
    metadata = urllib.parse.urlencode({"service": "WMS", "version": version, "request": "GetCapabilities"})
    ctype, payload = fetch(base + "?" + metadata)
    root = ET.fromstring(payload)
    target = select_layer(root, layer)
    if target is None:
        raise ValueError("requested lightning layer missing from GetCapabilities")
    observation = layer_observation(target, now)
    params = {
        "service": "WMS", "version": "1.1.1", "request": "GetMap",
        "layers": layer, "styles": style, "srs": "EPSG:4326",
        "bbox": "-180,-90,180,90", "width": "1024", "height": "512",
        "format": "image/png", "transparent": "true",
    }
    if observation:
        params["time"] = observation.isoformat().replace("+00:00", "Z")
    mime, image = fetch(base + "?" + urllib.parse.urlencode(params))
    if not image.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("GetMap returned non-PNG (" + mime + ")")
    with Image.open(io.BytesIO(image)) as original:
        pixels = original.convert("RGBA")
        active = 0
        regions = {}
        for idx, (r, g, b, a) in enumerate(pixels.getdata()):
            if a >= 21 and max(r, g, b) >= 20:
                active += 1
                region = region_for_pixel(idx % pixels.width, idx // pixels.width,
                                           pixels.width, pixels.height)
                regions[region] = regions.get(region, 0) + 1
    return {
        "name": name, "layer": layer,
        "observation_utc": observation.isoformat() if observation else None,
        "source_timestamp_usable": bool(observation),
        "png_bytes": len(image), "nontransparent_signal_pixels": active,
        "sample_pixels": pixels.width * pixels.height,
        "regional_signal_pixels": regions,
        "cupola_usable_now": bool(
            observation and
            now - observation <= timedelta(minutes=45 if name == "NOAA nowCOAST" else 30)
        ),
        "note": "Regional pixel counts are source-specific WMS sample area, NOT individual strikes or global completeness.",
    }


def self_test():
    now = datetime(2026, 10, 13, 18, tzinfo=timezone.utc)
    root = ET.fromstring("<WMS><Layer><Name>other</Name><Dimension name='time'>2026-10-13T17:59:00Z</Dimension></Layer><Layer><Name>mtg_fd:li_afa</Name><Dimension name='time'>2026-10-13T17:35:00Z,2026-10-13T17:50:00Z</Dimension></Layer></WMS>")
    assert layer_observation(select_layer(root, "mtg_fd:li_afa"), now) == datetime(2026, 10, 13, 17, 50, tzinfo=timezone.utc)
    assert layer_observation(select_layer(root, "other"), now) == datetime(2026, 10, 13, 17, 59, tzinfo=timezone.utc)
    assert layer_observation(select_layer(root, "mtg_fd:li_afa"), now + timedelta(hours=3)) is None
    assert region_for_pixel(310, 127, 1024, 512) == "NORTH_AMERICA"
    assert region_for_pixel(560, 130, 1024, 512) == "EUROPE"
    assert region_for_pixel(850, 180, 1024, 512) == "ASIA_PACIFIC"
    print("PASS: feed probe layer-specific freshness and regional geographic buckets")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
        sys.exit(0)
    for args in SOURCES:
        try:
            report = probe(*args)
            print("CUPOLA LIGHTNING SOURCE:", json.dumps(report, sort_keys=True))
            if not report["source_timestamp_usable"]:
                print("::warning::" + args[0] + " has no recent layer-specific WMS timestamp")
            if report["nontransparent_signal_pixels"] == 0:
                print("::notice::" + args[0] + " returned no observed coloured flash cells")
        except Exception as exc:
            print("::warning::" + args[0] + " WMS probe failed: " + str(exc))
