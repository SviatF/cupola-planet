#!/usr/bin/env python3
"""Inspect ONE fresh, real NOAA GMGSI LW global mosaic NetCDF.

Offline CI diagnostic: find current S3 object, verify age and size, fetch,
inspect scientific variables/units/geolocation and make RAW quicklook only.
Never feed globe or count this as Level-2 without independent QA.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timedelta,timezone
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import quote
from urllib.request import Request,urlopen
import numpy as np
from netCDF4 import Dataset
from PIL import Image
from probe_noaa_gmgsi import BASE,list_objects

PREFIX="GMGSI_LW/"
SCAN=re.compile(r"_s(\d{14})\d?_")
MAX_BYTES=17_000_000


def latest():
    now=datetime.now(timezone.utc)
    items=[]
    for day in (now,now-timedelta(days=1)):
        prefix=PREFIX+day.strftime("%Y/%m/%d/")
        listing=list_objects(prefix,delimiter="",max_keys=120)
        items.extend(x for x in listing["objects"] if x["key"].endswith(".nc") and SCAN.search(x["key"]))
        if items:break
    if not items:raise RuntimeError("No fresh GMGSI LW NetCDF file found")
    objects=sorted(items,key=lambda x:x["key"],reverse=True)
    for item in objects:
        match=SCAN.search(item["key"])
        sensed=datetime.strptime(match[1],"%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        age=(now-sensed).total_seconds()/3600
        if 0<=age<=4.0 and 50000<=item["bytes"]<=MAX_BYTES:
            return item,sensed,age
    raise RuntimeError("No GMGSI LW file passes 4-hour observation / 17MB budget")


def printable(v):
    if hasattr(v,"tolist"):v=v.tolist()
    return str(v)[:230]


def inspect(path:Path,out:Path):
    report={"opened":False,"variables":[],"preview_generated":False,"usable_for_globe":False}
    with Dataset(path) as ds:
        report["opened"]=True
        report["dimensions"]={k:len(v) for k,v in ds.dimensions.items()}
        report["global_attributes"]={k:printable(ds.getncattr(k))
            for k in ds.ncattrs() if any(t in k.lower() for t in (
                "satellite","source","history","product","projection","title",
                "time","institution","sensor","grid","resolution"))}
        candidates=[]
        def walk(group,prefix=""):
            for name,v in group.variables.items():
                key=prefix+"/"+name
                attrs={k:printable(v.getncattr(k)) for k in v.ncattrs()
                       if any(t in k.lower() for t in ("units","standard","long",
                           "fill","missing","valid","scale","offset","grid","coordinates"))}
                report["variables"].append({"name":key,"dtype":str(v.dtype),
                    "shape":list(v.shape),"dims":list(v.dimensions),"attrs":attrs})
                if len(v.shape)>=2 and np.issubdtype(v.dtype,np.number):
                    score=sum(1 for t in ("IR","LIR","LW","BRIGHT","TEMP","DATA") if t.lower() in key.lower())
                    candidates.append((score,key,v))
            for name,g in group.groups.items():walk(g,prefix+"/"+name)
        walk(ds)
        candidates.sort(key=lambda x:(x[0],len(x[2].shape)),reverse=True)
        if candidates:
            _,key,var=candidates[0]
            slicing=tuple(0 for _ in var.shape[:-2])+(
                slice(None,None,max(1,var.shape[-2]//900)),
                slice(None,None,max(1,var.shape[-1]//1800)))
            data=np.ma.asarray(var[slicing]).astype(np.float32)
            values=np.asarray(np.ma.filled(data,np.nan),dtype=np.float32)
            finite=np.isfinite(values)
            if finite.any():
                lo,med,hi=[float(x) for x in np.percentile(values[finite],[2,50,98])]
                report["raw_2d"]={"variable":key,"preview_shape":list(values.shape),
                    "valid_fraction":round(float(finite.mean()),5),
                    "p02":lo,"median":med,"p98":hi}
                norm=np.clip((values-lo)/max(.00001,hi-lo),0,1)
                # Native IR temperatures tend to be colder for tall clouds;
                # this grayscale is an exploratory visualization, not a mask.
                rgb=np.uint8((1-norm)*255)
                rgb[~finite]=0
                Image.fromarray(rgb,"L").save(out/"gmgsi-lw-raw-quicklook.png")
                report["preview_generated"]=True
                report["preview_label"]="RAW ARRAY QUICKLOOK — NOT YET GEO-REGISTERED"
        # Geolocation has NOT been assumed from array orientation.
        report["geolocation_verified"]=False
        report["scientific_cloud_qa_verified"]=False
        report["usable_for_globe"]=False
    return report


def run(out:Path):
    out.mkdir(parents=True,exist_ok=True)
    result={"checked_at":datetime.now(timezone.utc).isoformat(),
            "bucket":"noaa-gmgsi-pds","scientific_source":"NOAA GMGSI LW",
            "not_native_cloud_mask":True,"usable_for_globe":False}
    try:
        item,sensed,age=latest()
        result["selected"]={**item,"sensing_start":sensed.isoformat(),
                            "sensing_age_hours":round(age,3)}
        url=BASE+quote(item["key"],safe="/")
        req=Request(url,headers={"User-Agent":"CUPOLA-GMGSI-Scientific-Inspector/1.0"})
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/"gmgsi.nc"
            got=0
            with urlopen(req,timeout=60) as res,target.open("wb") as file:
                while True:
                    block=res.read(1024*1024)
                    if not block:break
                    got+=len(block)
                    if got>MAX_BYTES:raise ValueError("File exceeds size budget")
                    file.write(block)
            if got!=item["bytes"]:raise ValueError("S3 byte-length mismatch")
            result["download_bytes"]=got
            result.update(inspect(target,out))
    except Exception as exc:
        result["error"]=type(exc).__name__+": "+str(exc)[:280]
    (out/"gmgsi-native-schema.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return result


if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",required=True,type=Path)
    args=ap.parse_args()
    run(args.output)
