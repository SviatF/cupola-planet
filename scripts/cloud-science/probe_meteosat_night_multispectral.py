#!/usr/bin/env python3
"""Read-only near-live EUMETView night/multispectral imagery investigation.

DO NOT enable any WMS RGB pixel as a native Level-2 cloud mask. RGB images
include non-cloud background and cannot be reduced to an optical-depth
retrieval without a validated cloud class/QA mask.
"""
from __future__ import annotations
import argparse
import io
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
import numpy as np
from PIL import Image

ENDPOINT = "https://view.eumetsat.int/geoserver/wms"
LAYERS = ("msg_fes:rgb_fog", "msg_iodc:rgb_fog", "mtg_fd:rgb_geocolour")
MAX_XML = 36_000_000
MAX_PNG = 7_000_000

def load(url:str, limit:int, timeout:float)->tuple[int,str,bytes]:
    try:
        with urlopen(Request(url,headers={"User-Agent":"CUPOLA-readonly-cloud-source-probe/1.0",
                                          "Accept":"image/png, text/xml, application/xml"}),timeout=timeout) as res:
            code=res.status
            ctype=res.headers.get("Content-Type","")
            payload=res.read(limit+1)
    except Exception as e:
        return 0,str(type(e).__name__)+": "+str(e)[:230],b""
    return (code,ctype,payload) if len(payload)<=limit else (0,"oversize",b"")

def parse_layers(xml:bytes):
    root=ET.fromstring(xml)
    found={}
    for elt in root.iter():
        if elt.tag.split("}")[-1]!="Layer":continue
        # Direct children only: parent inherited layers have own Dimension.
        children=list(elt)
        labels=[(x.tag.split("}")[-1],(x.text or "").strip()) for x in children]
        name=next((v for k,v in labels if k=="Name"),None)
        if name not in LAYERS:continue
        time_values=[]
        for c in children:
            tag=c.tag.split("}")[-1]
            if tag not in ("Dimension","Extent"):continue
            if (c.attrib.get("name") or "").lower()!="time":continue
            raw=(c.text or "").strip()
            for token in raw.split(","):
                t=token.strip().split("/")[0].replace("Z","+00:00")
                if len(t)<10:continue
                try:
                    dt=datetime.fromisoformat(t)
                    if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
                    time_values.append(dt.astimezone(timezone.utc))
                except ValueError:continue
        found[name]={"name":name,
                    "title":next((v for k,v in labels if k=="Title"),""),
                    "time_count":len(time_values),
                    "latest":max(time_values).isoformat() if time_values else None}
    return found

def probe(now:datetime, timeout:float=17, output:Path|None=None):
    params=urlencode({"service":"WMS","version":"1.3.0","request":"GetCapabilities"})
    status,ctype,xml=load(ENDPOINT+"?"+params,MAX_XML,timeout)
    report={"schema":"cupola-meteosat-night-multispectral-probe/v1",
            "generated_at":now.isoformat(),
            "wms_capabilities_status":status,
            "wms_capabilities_type":ctype,
            "freshness_limit_minutes":90,
            "native_level2_changed":False,
            "render_pipeline_changed":False,
            "products":[]}
    if status!=200 or not xml.startswith((b"<?xml",b"<WMS",b"<wms")):
        report["error"]="GetCapabilities unavailable; cannot validate fresh scene"
        return report
    try:info=parse_layers(xml)
    except ET.ParseError:
        report["error"]="Unparsable WMS capabilities"
        return report
    for source in LAYERS:
        layer=info.get(source)
        item={"layer":source,"catalogued":bool(layer),"latest_observation":layer.get("latest") if layer else None,
              "fresh":False,"getmap_status":None,"png_verified":False,
              "visual_structure":False,"usable_as_native_level2":False,
              "live_atlas_enabled":False}
        if not layer or not layer["latest"]:
            item["reason"]="No dated advertised observations"
            report["products"].append(item);continue
        dt=datetime.fromisoformat(layer["latest"])
        age=(now-dt).total_seconds()/60
        item["age_minutes"]=round(age,1)
        if age < -5 or age > 90:
            item["reason"]="Advertised data unavailable within 90-minute freshness window"
            report["products"].append(item);continue
        item["fresh"]=True
        params={"service":"WMS","version":"1.1.1","request":"GetMap","layers":source,
                "styles":"","srs":"EPSG:4326","bbox":"-50,-45,100,55",
                "width":720,"height":480,"format":"image/png","transparent":"true",
                "time":dt.strftime("%Y-%m-%dT%H:%M:%SZ")}
        code,typ,raw=load(ENDPOINT+"?"+urlencode(params),MAX_PNG,timeout)
        item["getmap_status"]=code
        item["getmap_type"]=typ
        if code==200 and typ.lower().startswith("image/png") and raw.startswith(b"\x89PNG\r\n\x1a\n"):
            try:
                img=Image.open(io.BytesIO(raw)).convert("RGBA")
                px=np.asarray(img)
                colors=np.unique(px[::5,::5,:3].reshape(-1,3),axis=0).shape[0]
                variance=float(px[::5,::5,:3].astype(np.float32).std())
                nontransparent=float(np.mean(px[:,:,3]>0))
                item.update({"png_verified":True,"sampled_unique_rgb":int(colors),
                    "spatial_rgb_std":round(variance,2),
                    "nontransparent_fraction":round(nontransparent,4),
                    "visual_structure":colors>50 and variance>5})
                if output is not None:
                    output.mkdir(parents=True,exist_ok=True)
                    (output/(source.replace(":","_")+".png")).write_bytes(raw)
            except Exception as e:
                item["reason"]="Invalid image: "+type(e).__name__
        report["products"].append(item)
    return report

def self_test():
    parsed=parse_layers(b'''<?xml version="1.0"?><WMS_Capabilities><Capability>
      <Layer><Layer><Name>msg_fes:rgb_fog</Name>
      <Dimension name="time">2026-10-12T22:00:00Z,2026-10-12T22:15:00Z</Dimension>
      </Layer></Layer></Capability></WMS_Capabilities>''')
    assert parsed["msg_fes:rgb_fog"]["latest"]=="2026-10-12T22:15:00+00:00"
    assert not set(LAYERS)-{"msg_fes:rgb_fog"}&set(parsed)
    print("PASS: XML dated layer extraction only; no cloud-mask claims")

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--out",type=Path)
    p.add_argument("--timeout",type=float,default=17)
    p.add_argument("--self-test",action="store_true")
    args=p.parse_args()
    if args.self_test:self_test()
    else:
        if args.out is None:p.error("--out is required")
        args.out.mkdir(parents=True,exist_ok=True)
        result=probe(datetime.now(timezone.utc),args.timeout,args.out)
        (args.out/"night-multispectral-readiness.json").write_text(json.dumps(result,indent=2)+"\n")
        print(json.dumps(result,indent=2))
