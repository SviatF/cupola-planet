#!/usr/bin/env python3
"""Keyless live probe for official EUMETView MSG/MTG Cloud Mask WMS.

A named CLM layer on a public product page is NOT proof of fresh usable
pixels. This probes official WMS GetCapabilities, validates the advertised
time and optional GetMap PNG, and records only diagnostics. The renderer must
NOT ingest color-class pixels until the authoritative WMS style / legend
mapping and classification semantics have been independently validated.
"""
import argparse
from datetime import datetime, timezone, timedelta
import io
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = "https://view.eumetsat.int/geoserver/wms"
MAX_AGE_MINUTES = 100


def local(element, name):
    return [e for e in element if e.tag.split("}")[-1] == name]


def request(url, limit=8_000_000, timeout=24):
    with urlopen(Request(url, headers={"User-Agent": "CUPOLA-CLM-Public-WMS-Probe/1.0"}),
                 timeout=timeout) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError("Response exceeds WMS diagnostic size limit")
        return response.status, response.headers.get("Content-Type", ""), body


def as_time(text):
    value = (text or "").strip().replace("Z", "+00:00")
    try:
        when = datetime.fromisoformat(value)
        return when.astimezone(timezone.utc) if when.tzinfo else None
    except ValueError:
        return None


def latest_time(element, inherited):
    own = []
    for node in element:
        if node.tag.split("}")[-1] not in ("Dimension", "Extent"):
            continue
        if node.attrib.get("name", "").lower() != "time":
            continue
        possible = [node.attrib.get("default", "")]
        for item in (node.text or "").split(","):
            segment = item.strip().split("/")
            possible.append(segment[1] if len(segment) >= 2 else segment[0])
        own += [dt for raw in possible if (dt := as_time(raw))]
    return max(own) if own else inherited


def inspect_layers(node, inherited, found):
    effective = latest_time(node, inherited)
    name = (local(node, "Name")[0].text or "").strip() if local(node, "Name") else ""
    title = (local(node, "Title")[0].text or "").strip() if local(node, "Title") else ""
    if name and ("clm" in name.lower() or "cloud mask" in title.lower()):
        found.append({"name": name, "title": title, "latest_advertised_utc":
                      effective.isoformat() if effective else None, "parsed_time": effective})
    for child in local(node, "Layer"):
        inspect_layers(child, effective, found)


def run():
    params = urlencode({"service": "WMS", "version": "1.3.0", "request": "GetCapabilities"})
    status, content_type, body = request(ROOT + "?" + params)
    doc = ET.fromstring(body)
    found = []
    for capability in doc.iter():
        if capability.tag.split("}")[-1] == "Capability":
            for layer in local(capability, "Layer"):
                inspect_layers(layer, None, found)
            break
    now = datetime.now(timezone.utc)
    checked = []
    for entry in found:
        name = entry["name"]
        dt = entry.pop("parsed_time")
        fresh = dt is not None and now - timedelta(minutes=5) <= dt <= now + timedelta(minutes=MAX_AGE_MINUTES)
        age = (now - dt).total_seconds()/60 if dt else None
        row = {"name": name, "title": entry["title"],
               "latest_advertised_utc": entry["latest_advertised_utc"],
               "age_minutes": round(age, 1) if age is not None else None,
               "fresh_layer_advertised": fresh, "fresh_getmap_verified": False,
               "scientific_class_decode_verified": False}
        # Never trust stale layers, XML errors, or a valid-looking title.
        if fresh and (name.lower().endswith(":clm") or "cloud mask" in entry["title"].lower()):
            getmap = urlencode({
                "service": "WMS", "version": "1.1.1", "request": "GetMap",
                "layers": name, "styles": "", "srs": "EPSG:4326",
                "bbox": "-180,-90,180,90", "width": 512, "height": 256,
                "format": "image/png", "transparent": "true",
                "time": dt.isoformat().replace("+00:00", "Z"),
            })
            try:
                status, typ, pixels = request(ROOT + "?" + getmap, timeout=30)
                row["getmap_http"] = status
                row["getmap_content_type"] = typ
                row["png_magic_valid"] = pixels.startswith(bytes.fromhex("89504e470d0a1a0a"))
                if row["png_magic_valid"]:
                    from PIL import Image
                    rgba = Image.open(io.BytesIO(pixels)).convert("RGBA")
                    count = rgba.getchannel("A").getbbox()
                    colors = rgba.getcolors(maxcolors=16384)
                    row["nontransparent_footprint_present"] = count is not None
                    row["color_count"] = len(colors) if colors is not None else ">16384"
                    row["fresh_getmap_verified"] = bool(count is not None and len(pixels) > 1000)
            except Exception as e:
                row["getmap_error_type"] = type(e).__name__
                row["getmap_error"] = str(e)[:180]
        checked.append(row)
    return {"source": ROOT, "capabilities_http": status,
            "wms_layers_matched": len(found),
            "fresh_cloudmask_wms_frames": sum(int(x["fresh_getmap_verified"]) for x in checked),
            "scientific_classes_decoded": 0,
            "note": "Experimental public WMS catalogue probe only; NO decoder enabled",
            "layers": checked}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    try:
        data = run()
    except Exception as error:
        data = {"source": ROOT, "probe_error": type(error).__name__,
                "reason": str(error)[:250], "scientific_classes_decoded": 0}
    from pathlib import Path
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps(data, indent=2))
