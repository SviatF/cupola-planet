#!/usr/bin/env python3
"""Discover official Meteosat scientific cloud-mask collections, not browse RGB.

A collection existing in EUMETSAT's public catalog does NOT prove that recent
granules can be downloaded or that an API license is active. Records the
difference explicitly. No optical cloud data is fabricated or sent to Cinema.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE = "https://api.eumetsat.int/data/browse/1.0.0/collections"
COLLECTIONS = (
    ("mtg-fci-cloud-mask", "EO:EUM:DAT:0678",
     "MTG FCI Level-2 CLM (0°; official geostationary cloud classification)"),
    ("msg-seviri-cloud-mask", "EO:EUM:DAT:MSG:CLM",
     "MSG SEVIRI Level-2 CLM (0°; cloud, clear land, clear water, unprocessed)"),
    ("msg-seviri-iodc-cloud-mask", "EO:EUM:DAT:MSG:CLM-IODC",
     "MSG SEVIRI Level-2 CLM (Indian Ocean coverage; verify active product dates)"),
)


def parse_catalog(document, collection_id):
    """Fail closed if the upstream response cannot identify this collection."""
    if not isinstance(document, dict):
        raise ValueError("EUMETSAT metadata was not a JSON object")
    # Schemas can differ by API generation. Never infer source availability
    # from an unrelated catalog record or arbitrary HTTP 200.
    # EUMETSAT Browse API may nest collection identity under a metadata,
    # properties or links object rather than a top-level id. Validate against
    # the exact collection identifier, never merely a generic 200/JSON.
    packed = json.dumps(document, ensure_ascii=False)
    if collection_id not in packed:
        raise ValueError("Requested EUMETSAT collection ID absent from JSON; "
                         "root keys=" + repr(list(document.keys())[:25]) +
                         "; excerpt=" + packed[:300])
    return {
        "id": collection_id,
        "title": str(document.get("title") or document.get("name") or "")[:160],
        "link_count": len(document.get("links", []))
            if isinstance(document.get("links"), list) else None,
    }


def probe(key, collection_id, description, timeout):
    uri = BASE + "/" + quote(collection_id, safe="") + "?format=json"
    record = {
        "key": key, "collection_id": collection_id,
        "product_description": description, "catalog_url": uri,
        "collection_metadata_verified": False,
        "recent_granule_found": False,
        "authorized_to_download": False,
        "level2_geolocation_decoded": False,
        "cloud_mask_decoded": False,
        "ready_for_atlas": False,
    }
    request = Request(uri, headers={
        "Accept": "application/json",
        "User-Agent": "CUPOLA-science-metadata-check/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise ValueError(f"Unexpected HTTP {response.status}")
            blob = response.read(524289)
            if len(blob) > 524288:
                raise ValueError("Collection response exceeds 512 KiB limit")
        metadata = parse_catalog(json.loads(blob), collection_id)
        record.update(metadata)
        record["collection_metadata_verified"] = True
        record["status"] = "catalog_verified_access_unchecked"
    except (HTTPError, URLError, ValueError, json.JSONDecodeError) as e:
        record["status"] = "catalog_unverified"
        record["reason"] = str(e)[:220]
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--strict", action="store_true",
                        help="Fail if catalog cannot verify all three collections")
    args = parser.parse_args()
    report = {
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "source": "EUMETSAT public Browse API, collection metadata only",
        "requires_live_data_license_review": True,
        "granules_downloaded": 0,
        "cloud_pixels_decoded": 0,
        "production_rendering_changed": False,
        "collections": [probe(k, collection, desc, args.timeout)
                        for k, collection, desc in COLLECTIONS],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if args.strict and not all(item["collection_metadata_verified"]
                               for item in report["collections"]):
        raise SystemExit("EUMETSAT catalog could not verify all requested CLM sources")


if __name__ == "__main__":
    main()
