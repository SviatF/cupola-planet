#!/usr/bin/env python3
"""Read-only official EUMETSAT OCA source readiness, NOT a cloud renderer.

The user's Africa cloud problem cannot be solved by brightening a thermal IR
proxy. OCA contains native cloud optical thickness and related cloud
properties, unlike the styled binary CLM currently displayed. This audit
checks LIVE product publication, not science bytes, download rights,
product QA or night-time retrieval validity. No secrets ever leave CI.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
from probe_meteosat_granules import probe_collection

COLLECTIONS = (
    ("mtg-fci-oca", "EO:EUM:DAT:0684",
     "MTG FCI-2-OCA native cloud optical thickness / phase (10m full disk)"),
    ("msg-seviri-oca", "EO:EUM:DAT:MSG:OCA",
     "MSG SEVIRI OCA native cloud optical thickness (15m full disk)"),
)

def report_oca(now, credentials_configured, probe=probe_collection, hours=6, timeout=16):
    if now.tzinfo is None:
        raise ValueError("UTC observation checks require timezone-aware time")
    if not 1<=hours<=24:
        raise ValueError("OCA metadata lookback must be within 1..24 hours")
    results=[]
    for key, collection, description in COLLECTIONS:
        r=probe(key,collection,description,now,hours,timeout)
        # The public Browse API and API credentials alone do not establish
        # available NetCDF or an active NRT licence. Fail closed.
        results.append({
            "key":key, "collection_id":collection,
            "recent_product_listed":bool(r.get("recent_granule_found")),
            "latest_observation":r.get("latest_observation"),
            "status":r.get("status", "unverified"),
            "download_authorized":False,
            "native_data_downloaded":False,
            "native_oca_cloud_properties_decoded":False,
            "native_geolocation_verified":False,
            "night_cloud_optical_thickness_verified":False,
            "live_atlas_enabled":False,
            "metadata_queries":len(r.get("day_queries",[])),
        })
    return {
        "schema":"cupola-meteosat-oca-readiness/v1",
        "generated_at":now.astimezone(timezone.utc).isoformat(),
        "geography":"Africa, Europe, Atlantic / overlapping EUMETSAT disks",
        "credentials_configured":bool(credentials_configured),
        "active_nrt_license_verified":False,
        "live_oca_pixels_in_cinema":0,
        "original_level2_modified":False,
        "sources":results,
        "next_step":"Authenticate EUMDAC with GitHub Actions secrets, verify NRT licence, fetch native OCA/CLM NetCDF, decode product QA/geolocation and optical thickness before enabling any pixels.",
    }

def self_test():
    from copy import deepcopy
    now=datetime(2026,10,12,22,0,tzinfo=timezone.utc)
    def fake(key,collection,description,now,hours,timeout):
        return {"recent_granule_found":True,"latest_observation":{
            "product_id":"synthetic-test-id",
            "age_minutes":10},
            "status":"recent_granule_catalogued","day_queries":[{}]}
    t=report_oca(now,False,fake)
    assert t["live_oca_pixels_in_cinema"]==0
    assert len(t["sources"])==2
    assert t["sources"][0]["collection_id"]=="EO:EUM:DAT:0684"
    assert t["sources"][1]["collection_id"]=="EO:EUM:DAT:MSG:OCA"
    assert all(x["recent_product_listed"] and not x["native_data_downloaded"]
               and not x["live_atlas_enabled"] for x in t["sources"])
    assert not t["active_nrt_license_verified"]
    try:
        report_oca(now.replace(tzinfo=None),False,fake)
    except ValueError:
        pass
    else:
        raise AssertionError("Accepted naive time")
    print("PASS: OCA metadata is never misrepresented as live cloud optical thickness")

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output",type=Path)
    p.add_argument("--hours",type=int,default=6)
    p.add_argument("--timeout",type=float,default=16)
    p.add_argument("--self-test",action="store_true")
    args=p.parse_args()
    if args.self_test:
        self_test()
    else:
        if args.output is None:p.error("--output is required")
        configured=bool(os.environ.get("EUMETSAT_CONSUMER_KEY") and
                        os.environ.get("EUMETSAT_CONSUMER_SECRET"))
        result=report_oca(datetime.now(timezone.utc),configured,
                          hours=args.hours,timeout=args.timeout)
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
        print(json.dumps(result,indent=2))
