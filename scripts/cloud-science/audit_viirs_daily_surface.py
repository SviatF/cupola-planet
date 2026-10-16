#!/usr/bin/env python3
"""Operational NASA VIIRS browser-source smoke, no tokens or paid APIs.
Measures visually nonblack JPEG pixels as a diagnostic ONLY, not science QA.
Failed source means unavailable, not that Earth lacks observations.
"""
import concurrent.futures
import datetime as dt
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from PIL import Image

LAYERS = {
    "noaa21": "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    "noaa20": "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    "snpp": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
}
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"


def check_one(item):
    sensor, days_ago, today = item
    day = today - dt.timedelta(days=days_ago)
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap",
        "LAYERS": LAYERS[sensor], "STYLES": "", "SRS": "EPSG:4326",
        "BBOX": "-180,-90,180,90", "WIDTH": 512, "HEIGHT": 256,
        "FORMAT": "image/jpeg", "TIME": day.isoformat(),
    }
    url = WMS + "?" + urllib.parse.urlencode(params)
    result = {"sensor": sensor, "date": day.isoformat(),
              "daysAgo": days_ago, "visibleFraction": 0,
              "result": "not-verified"}
    try:
        with urllib.request.urlopen(urllib.request.Request(
            url, headers={"User-Agent":"CUPOLA Earth Viewer VIIRS Audit/1.0"}
        ), timeout=18) as response:
            mime=response.headers.get("Content-Type", "")
            data=response.read(4_000_000)
        result.update(bytes=len(data), contentType=mime)
        if "image/jpeg" not in mime.lower():
            result["result"]="wrong-content-type"
            return result
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert("RGB").resize((256,128),Image.Resampling.BILINEAR)
            observed=sum(1 for r,g,b in im.getdata()
                         if max(r,g,b)>=34 and r+g+b>=73)
        result["visibleFraction"]=round(observed/(256*128),5)
        result["result"]="sampled" if observed else "zero-visible"
    except Exception as error:
        result["result"]="fetch-or-decode-failed"
        result["error"]=str(error)[:140]
    return result


def main():
    date=dt.datetime.now(dt.timezone.utc).date()
    tasks=[(s,d,date) for d in (0,1,2,3) for s in LAYERS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows=list(pool.map(check_one,tasks))
    rows.sort(key=lambda r:(-r["visibleFraction"],r["daysAgo"]))
    print(json.dumps({"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),
        "note":"Estimated visibly non-black pixels, not VIIRS QF cloud-free or full-Earth coverage.",
        "best":rows[0],"results":rows},indent=2))
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"],"a",encoding="utf8") as f:
            f.write("## Real NASA VIIRS sensor/date audit (no keys)\n\n")
            f.write("Coverage is estimated visually, not cloud science QA.\n\n")
            f.write("| Sensor | UTC day | Approx. visible % | Result |\n|---|---|---:|---|\n")
            for x in rows:
                f.write(f"| {x['sensor']} | {x['date']} | "
                        f"{x['visibleFraction']*100:.2f}% | {x['result']} |\n")
    # A missing live NASA observation is important telemetry but should not
    # break app quality CI or cause a fake fallback image.
    return 0


if __name__=="__main__":
    sys.exit(main())
