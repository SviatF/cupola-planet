#!/usr/bin/env python3
"""Read-only production-worker vs NASA source HTTP diagnostic. Never print secrets."""
import datetime as dt
import json
import urllib.error
import urllib.parse
import urllib.request

HOST="https://cupola-planet.oleg22777.workers.dev"
date=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=1)).date().isoformat()
wms="https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?"+urllib.parse.urlencode({
"SERVICE":"WMS","VERSION":"1.1.1","REQUEST":"GetMap",
"LAYERS":"VIIRS_NOAA21_CorrectedReflectance_TrueColor","STYLES":"","SRS":"EPSG:4326",
"BBOX":"-180,-90,180,90","WIDTH":"512","HEIGHT":"256","FORMAT":"image/jpeg","TIME":date,
})
urls=[
("worker_health",HOST+"/"),
("worker_previous_day_noaa21",HOST+"/api/satellite?mode=live&sensor=noaa21&daysAgo=1&resolution=probe"),
("worker_previous_day_noaa20",HOST+"/api/satellite?mode=live&sensor=noaa20&daysAgo=1&resolution=probe"),
("worker_preview_metadata",HOST+"/api/satellite?mode=live&sensor=noaa21&daysAgo=1&resolution=probe&meta=1"),
("direct_nasa",wms),
]
for label,url in urls:
    report={"target":label}
    try:
        request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 CUPOLA diagnostic"})
        with urllib.request.urlopen(request,timeout=20) as response:
            data=response.read(16000000)
            report.update(status=response.status,bytes=len(data),
                contentType=response.headers.get("Content-Type"),
                cupolaHeaders={k:v for k,v in response.headers.items() if k.lower().startswith("x-cupola-")},
                cfray=bool(response.headers.get("cf-ray")),
                magic=data[:4].hex(),
                bodyExcerpt=data[:600].decode("utf-8","replace") if "json" in response.headers.get("Content-Type","") else None)
    except urllib.error.HTTPError as error:
        body=error.read(1200)
        report.update(status=error.code,error=str(error),
            contentType=error.headers.get("Content-Type"),
            cupolaHeaders={k:v for k,v in error.headers.items() if k.lower().startswith("x-cupola-")},
            bodyExcerpt=body[:300].decode("utf-8","replace"))
    except Exception as error:
        report.update(error=str(error)[:300])
    print(json.dumps(report,ensure_ascii=False),flush=True)
