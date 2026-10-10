#!/usr/bin/env python3
"""Check REAL Meteosat product-level Browse metadata and unauthenticated HEAD.

A fresh catalog listing does not prove a usable cloud-mask file. This
diagnostic validates product identity, parent collection, online status,
acquisition metadata, and the *HTTP metadata status* of the download URL.
It NEVER downloads a granule, never requests an access token, never claims
authorization, and never enables a source on the CUPOLA globe.
"""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen

from discover_meteosat_science import BASE
from probe_meteosat_granules import json_request, product_id


def validate_metadata(doc, expected_collection, expected_product):
    if not isinstance(doc, dict) or doc.get("type") != "Feature":
        raise ValueError("Not a Browse API GeoJSON EarthObservation Feature")
    properties = doc.get("properties")
    if not isinstance(properties, dict):
        raise ValueError("Missing GeoJSON product properties")
    if properties.get("parentIdentifier") != expected_collection:
        raise ValueError("Product parentIdentifier does not match collection: " +
                         repr(properties.get("parentIdentifier"))[:150])
    pid = product_id(doc.get("id"))
    if pid != expected_product:
        raise ValueError("Product identity mismatches dated Browse listing")
    info = properties.get("productInformation")
    if not isinstance(info, dict):
        raise ValueError("Missing productInformation")
    return {
        "product_id": pid,
        "parent_collection_verified": True,
        "metadata_verified": True,
        "product_status": str(properties.get("status", "unknown"))[:60],
        "product_type": str(info.get("productType", "unknown"))[:100],
        "processing_level": str(info.get("processingLevel", "unknown"))[:30],
        "status_subtype": str(info.get("statusSubType", "unknown"))[:40],
        "product_size": info.get("size"),
        "availability_utc": str(info.get("availabilityTime", ""))[:48],
        "content_filename_extension_verified": False,
        "scientific_classes_decoded": False,
    }


def probe_head(url, timeout):
    # A HEAD on a package path does not retrieve NetCDF/GRIB pixels.
    # Some EUMETSAT endpoints reject HEAD; record that as inconclusive.
    req = Request(url, method="HEAD",
                  headers={"User-Agent": "Cupola-Meteosat-Provenance/1.0"})
    try:
        with urlopen(req, timeout=timeout) as response:
            return {"http_status":response.status,
                    "content_type": response.headers.get("Content-Type", "")[:80],
                    "access": "head_reachable_not_download_verified"}
    except HTTPError as e:
        return {"http_status":e.code, "access":
                ("auth_required_or_forbidden" if e.code in (401,403)
                 else "inconclusive_http_head")}
    except (URLError, TimeoutError) as e:
        return {"access":"transport_unverified",
                "reason":str(e)[:100]}


def inspect_collection(item, timeout):
    record = {
        "collection_id": item["collection_id"],
        "key":item["key"],
        "metadata_verified":False,
        "download_authorized":False,
        "science_file_downloaded":False,
        "science_mask_decoded":False,
        "ready_for_atlas":False,
    }
    latest = item.get("latest_observation")
    if not item.get("recent_granule_found") or not latest:
        record["status"]="no_recent_source_product"
        return record
    collection = item["collection_id"]
    pid = product_id(latest["product_id"])
    stem = BASE + "/" + quote(collection,safe="") + "/products/" + quote(pid,safe="")
    record["browse_url"] = stem+"?format=json"
    try:
        metadata = json_request(record["browse_url"], timeout)
        record.update(validate_metadata(metadata,collection,pid))
        record["status"] = "product_metadata_verified"
    except (HTTPError,URLError,ValueError,TypeError) as e:
        record["status"]="product_metadata_unverified"
        record["error_type"]=type(e).__name__
        record["reason"]=str(e)[:230]
        return record
    download = ("https://api.eumetsat.int/data/download/1.0.0/collections/" +
                quote(collection,safe="") + "/products/" + quote(pid,safe=""))
    record["download_url"] = download
    record["anonymous_head"] = probe_head(download,timeout)
    return record


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--freshness",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--timeout",type=float,default=12)
    p.add_argument("--strict-metadata",action="store_true")
    args=p.parse_args()
    freshness=json.loads(args.freshness.read_text(encoding="utf-8"))
    if not isinstance(freshness.get("collections"),list) or len(freshness["collections"])!=3:
        raise ValueError("Expected three independently checked Meteosat collections")
    report={
        "source":"Official EUMETSAT Browse GeoJSON per-product metadata",
        "fresh_collections":freshness["recent_granules_verified"],
        "metadata_verified_collections":0,
        "granules_downloaded":0,
        "scientific_cloud_pixels_decoded":0,
        "production_cinema_changed":False,
        "authenticated_download_verified":False,
        "products":[],
    }
    for item in freshness["collections"]:
        result=inspect_collection(item,args.timeout)
        report["metadata_verified_collections"]+=int(result["metadata_verified"])
        report["products"].append(result)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if args.strict_metadata and report["metadata_verified_collections"]!=3:
        raise SystemExit("Recent product identity/metadata not verified for all 3 collections")


if __name__=="__main__":
    main()
