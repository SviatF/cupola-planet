#!/usr/bin/env python3
"""Read REAL EUMETSAT Meteosat L2 cloud-mask granule publication metadata.

This probe reads only the public Browse API, not pixel values or quicklooks.
A catalog collection is NOT equivalent to recent cloud imagery; a product
listed in Browse is NOT proof of download authorization. All states are
reported independently and no source becomes enabled for Cinema.
Official API: https://api.eumetsat.int/data/browse/1.0.0/swagger.json
"""
import argparse
from datetime import datetime, timedelta, timezone
from email.message import Message
from http.client import HTTPResponse
import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen

from discover_meteosat_science import BASE, COLLECTIONS

MAX_RESPONSE = 1048576
USER_AGENT = "Cupola-Scientific-Cloud-Provenance/1.0"
PRODUCT_PATTERN = re.compile(r"^[A-Za-z0-9_,+.:=\-]+$")


def json_request(url, timeout):
    request = Request(url, headers={"Accept": "application/json",
                                    "User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("Upstream HTTP " + str(response.status))
        payload = response.read(MAX_RESPONSE + 1)
        if len(payload) > MAX_RESPONSE:
            raise ValueError("Upstream JSON exceeds the safe 1 MiB limit")
        return json.loads(payload)


def iso_datetime(value):
    if not isinstance(value, str):
        raise ValueError("Missing product sensing timestamp")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Naive product time must not be used for LIVE attribution")
    return dt.astimezone(timezone.utc)


def product_id(value):
    if not isinstance(value, str) or not value:
        raise ValueError("Product identifier is empty")
    # Swagger Products declares a URI, but some responses provide a short ID.
    if value.startswith("https://"):
        u = urlparse(value)
        if u.hostname != "api.eumetsat.int":
            raise ValueError("Unexpected origin in granule identity")
        value = unquote(u.path.rsplit("/", 1)[-1])
    if len(value) > 400 or not PRODUCT_PATTERN.fullmatch(value):
        raise ValueError("Invalid product identifier")
    return value


def parse_daily_products(doc, requested_day, now, lookback_hours):
    """Only return dated real products from the official date-scoped Browse API.

    A 200 OK or a collection page saying that products exist is *not enough*.
    Never use today's date as an observation timestamp for a source image.
    """
    if not isinstance(doc, dict) or not isinstance(doc.get("products"), list):
        raise ValueError("Expected EUMETSAT Browse Products object with products array")
    total = doc.get("numberOfProducts")
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise ValueError("Browse Products missing numeric numberOfProducts")
    if total < len(doc["products"]):
        raise ValueError("Browse page count contradicts returned products")
    candidates = []
    for item in doc["products"]:
        if not isinstance(item, dict):
            raise ValueError("Malformed EUMETSAT product entry")
        # EUMETSAT Browse Swagger Product: id (URI), date (UTC date-time), links.
        pid = product_id(item.get("id"))
        dt = iso_datetime(item.get("date"))
        if dt.date() != requested_day.date():
            raise ValueError("Browse product date does not match requested UTC day")
        if dt > now + timedelta(minutes=10):
            raise ValueError("Upstream returned a future-dated observation")
        candidates.append({"product_id": pid, "observation_utc": dt.isoformat(),
                           "age_minutes": round((now-dt).total_seconds()/60, 1)})
    candidates.sort(key=lambda p:p["observation_utc"], reverse=True)
    latest = candidates[0] if candidates else None
    recent = bool(latest and latest["age_minutes"] <= lookback_hours * 60)
    return {"product_count": total, "page_entries_checked": len(candidates),
            "latest": latest, "recent_granule_found": recent,
            "page_has_more": total > len(candidates)}


def probe_collection(key, collection_id, description, now, hours, timeout):
    result = {
        "key": key, "collection_id": collection_id,
        "product_description": description,
        "recent_granule_found": False, "download_authorized": False,
        "download_probe": "not_attempted_no_credentials",
        "pixel_data_downloaded": False, "level2_geolocation_decoded": False,
        "cloud_mask_decoded": False, "ready_for_atlas": False,
        "day_queries": [],
    }
    # At most 3 daily requests per collection; no SIP/NetCDF downloads.
    days = min(3, max(1, (hours + 23) // 24 + 1))
    newest = None
    for offset in range(days):
        day = now - timedelta(days=offset)
        base = (BASE + "/" + quote(collection_id, safe="") +
                "/dates/" + day.strftime("%Y/%m/%d") + "/products?format=json")
        record = {"utc_day": day.strftime("%Y-%m-%d"), "request_url": base}
        try:
            payload = json_request(base, timeout)
            parsed = parse_daily_products(payload, day, now, hours)
            record.update(parsed)
            record["status"] = "ok"
            if parsed["latest"] and (
                    newest is None or parsed["latest"]["observation_utc"] >
                    newest["observation_utc"]):
                newest = parsed["latest"]
        except (HTTPError, URLError, ValueError, TypeError, json.JSONDecodeError) as e:
            record["status"] = "unverified"
            record["error_type"] = type(e).__name__
            record["error"] = str(e)[:150]
        result["day_queries"].append(record)
    if newest:
        result["latest_observation"] = newest
        result["recent_granule_found"] = newest["age_minutes"] <= hours * 60
        result["status"] = ("recent_granule_catalogued" if
                            result["recent_granule_found"] else
                            "stale_granule_only")
    else:
        result["status"] = "no_verifiable_granules"
    if newest and newest["age_minutes"] < -10:
        raise ValueError("Computed future product timestamp")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--strict-recent", action="store_true",
                        help="Fail if any configured collection lacks recent products")
    args = parser.parse_args()
    if args.hours < 1 or args.hours > 72:
        parser.error("--hours must be 1..72")
    now = datetime.now(timezone.utc)
    report = {
        "generated_utc": now.isoformat(),
        "method": "EUMETSAT Browse API, UTC date-scoped REAL product listings",
        "max_acceptable_age_hours": args.hours,
        "recent_granules_verified": 0,
        "download_authorization_verified": False,
        "cloud_pixels_decoded": 0,
        "rendering_changed": False,
        "collections": [],
    }
    for argspec in COLLECTIONS:
        record = probe_collection(*argspec, now, args.hours, args.timeout)
        report["collections"].append(record)
        report["recent_granules_verified"] += int(record["recent_granule_found"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if args.strict_recent and report["recent_granules_verified"] != len(COLLECTIONS):
        raise SystemExit("Missing independently verified RECENT Meteosat granules")


if __name__ == "__main__":
    main()
