#!/usr/bin/env python3
"""Anonymous official NOAA GMGSI AWS inventory diagnostic — NO scene changes.

Determine whether NOAA's already-stitched GOES/Meteosat/Himawari imagery
has usable *current* global IR granules. A historically listed public bucket
is NOT evidence of 2026 freshness. Do not publish or decode until verified.
"""
import argparse
from datetime import datetime, timezone
import json
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import re

BUCKET="noaa-gmgsi-pds"
BASE=f"https://{BUCKET}.s3.amazonaws.com/"
NS="{http://s3.amazonaws.com/doc/2006-03-01/}"
DEEP_LIMIT=16


def list_objects(prefix="", delimiter="/", max_keys=80):
    params={"list-type":"2","max-keys":str(max_keys)}
    if prefix:params["prefix"]=prefix
    if delimiter:params["delimiter"]=delimiter
    url=BASE+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"User-Agent":"CUPOLA-GMGSI-Anonymous-Inventory/1.0"})
    with urllib.request.urlopen(req,timeout=24) as reply:
        root=ET.fromstring(reply.read(1_000_000))
    prefixes=[x.findtext(NS+"Prefix") for x in root.findall(NS+"CommonPrefixes")]
    objects=[]
    for obj in root.findall(NS+"Contents"):
        objects.append({"key":obj.findtext(NS+"Key"),
                        "modified":obj.findtext(NS+"LastModified"),
                        "bytes":int(obj.findtext(NS+"Size") or 0)})
    return {"prefix":prefix,"prefixes":[x for x in prefixes if x],
            "objects":objects,"truncated":root.findtext(NS+"IsTruncated")=="true"}


def inventory():
    report={"bucket":BUCKET,"checked_at":datetime.now(timezone.utc).isoformat(),
            "anonymous_access":False,"current_imagery_verified":False,
            "usable_as_2026_live_observations":False,"directories":[],"sample_objects":[]}
    try:
        top=list_objects()
        report["anonymous_access"]=True
        report["top_prefixes"]=top["prefixes"][:60]
        report["root_keys"]=top["objects"][:12]
        candidates=list(top["prefixes"])
        visited=set()
        # Limit discovery to avoid crawling an archive of millions of scenes.
        for depth in range(3):
            if not candidates or len(visited)>=DEEP_LIMIT:break
            priority=lambda p:(0 if p.startswith("GMGSI_LW/") else 1,
                               0 if "/2026/" in p else 1,
                               0 if "/10/" in p else 1, p)
            more=[]
            for prefix in sorted(candidates,key=priority):
                if prefix in visited or len(visited)>=DEEP_LIMIT:continue
                visited.add(prefix)
                try:
                    data=list_objects(prefix)
                except Exception as exc:
                    report.setdefault("errors",[]).append({"prefix":prefix,"error":str(exc)[:180]})
                    continue
                report["directories"].append({"prefix":prefix,"subfolders":data["prefixes"][:14],
                                               "items":len(data["objects"])})
                report["sample_objects"].extend(data["objects"][:3])
                more.extend(data["prefixes"])
            candidates=more
        # Directly inspect the current UTC month/day to avoid spending the
        # bounded directory traversal budget on older archived years.
        today=datetime.now(timezone.utc)
        month_prefix=f"GMGSI_LW/{today.year}/{today.month:02d}/"
        report["current_month_prefix"]=month_prefix
        try:
            month=list_objects(month_prefix)
            report["current_month_subfolders"]=month["prefixes"][:35]
            report["current_month_sample"]=month["objects"][:8]
            report["sample_objects"].extend(month["objects"][:8])
            # Some NOAA variants store objects under day folders, others
            # directly in months. Check the most recent two UTC days.
            for day in (today.day,today.day-1):
                if day<1:continue
                day_prefix=month_prefix+f"{day:02d}/"
                dayinfo=list_objects(day_prefix,delimiter="",max_keys=100)
                report.setdefault("current_days",[]).append({
                    "prefix":day_prefix,"count_sample":len(dayinfo["objects"]),
                    "truncated":dayinfo["truncated"],
                    "first_objects":dayinfo["objects"][:4],
                    "last_objects":dayinfo["objects"][-4:]})
                report["sample_objects"].extend(dayinfo["objects"][:10])
                report["sample_objects"].extend(dayinfo["objects"][-10:])
        except Exception as exc:
            report.setdefault("errors",[]).append({
                "prefix":month_prefix,"error":str(exc)[:180]})
        all_objects=top["objects"]+report["sample_objects"]
        # This is only a limited sample, NEVER assert a full inventory scan.
        recent=[]
        now=datetime.now(timezone.utc)
        for obj in all_objects:
            try: age=(now-datetime.fromisoformat(obj["modified"].replace("Z","+00:00"))).total_seconds()/3600
            except (ValueError,TypeError,KeyError):continue
            if -0.1 <= age <= 12:
                recent.append({"key":obj["key"],"age_hours":round(age,2),
                               "bytes":obj["bytes"]})
        report["recent_suspected_objects"]=recent[:20]
        report["current_imagery_verified"]=any(
            re.search(r"(?:IR|LW|NETCDF|\.nc$|\.nc4$)",x["key"],re.I) for x in recent)
        report["usable_as_2026_live_observations"]=False
        report["caution"]="Presence and timestamps of listed objects do not prove radiometry, geolocation, data quality, or optical coverage."
    except Exception as exc:
        report["error"]=type(exc).__name__+": "+str(exc)[:230]
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",required=True)
    args=parser.parse_args()
    result=inventory()
    with open(args.output,"w",encoding="utf-8") as f:
        json.dump(result,f,indent=2,ensure_ascii=False)
        f.write("\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))
