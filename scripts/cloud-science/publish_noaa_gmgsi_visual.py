#!/usr/bin/env python3
"""Publish a QA-screened, VISUAL-ONLY NOAA GMGSI global infrared texture.

Real multisatellite NOAA longwave IR contains high-detail structures, but
the 0-255 brightness encoding is NOT a cloud optical depth retrieval.
Only used in L2-NODATA scene cells; provenance is GMGSI visual IR, never L2.
"""
import argparse
from datetime import datetime, timezone, timedelta
from hashlib import sha256
import json
from pathlib import Path
import numpy as np
from PIL import Image
from geo_noaa_gmgsi_preview import run as render_native

SCHEMA="cupola-gmgsi-ir-visual/v1"
W,H=2048,1024
def smoothstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)

def build(folder):
    report=render_native(folder)
    observed=datetime.fromisoformat(report["source"]["sensed"])
    now=datetime.now(timezone.utc)
    age=(now-observed).total_seconds()/3600
    if age<0 or age>4:raise ValueError("Expired GMGSI visual observation")
    if report["registration"]["earth_surface_area_footprint_fraction"]<.85:
        raise ValueError("Global IR source insufficient coverage")
    inp=np.asarray(Image.open(folder/"gmgsi-lw-geo-direct.png").convert("RGBA"),dtype=np.uint8)
    valid=inp[:,:,3]==255
    # The raw image is a brightness proxy; cold, high tops are generally
    # brighter here (confirmed from actual Atlantic storm sample).
    normalized=inp[:,:,0].astype(np.float32)/255
    density=smoothstep(.23,.91,normalized)*.72
    texture=np.zeros((H,W,4),dtype=np.uint8)
    texture[:,:,0]=np.where(valid,np.round(density*255),0).astype(np.uint8)
    texture[:,:,1]=np.where(valid,135,0).astype(np.uint8)
    texture[:,:,2]=np.where(valid,232,0).astype(np.uint8)
    texture[:,:,3]=255
    version=now.strftime("%Y%m%d%H%M%S")
    png=f"gmgsi-visual-{version}.png"
    Image.fromarray(texture,"RGBA").save(folder/png,optimize=True)
    digest=sha256((folder/png).read_bytes()).hexdigest()
    manifest={
        "schema":SCHEMA,"version":version,
        "generated_at":now.isoformat(),
        "observation_start":observed.isoformat(),
        "expires_at":(observed+timedelta(hours=4)).isoformat(),
        "width":W,"height":H,"atlas_file":png,"atlas_sha256":digest,
        "source_file":report["source"]["key"],
        "source_sha256":report["source"]["sha256"],
        "source_area_fraction":report["registration"]["earth_surface_area_footprint_fraction"],
        "source_grid_fraction":report["registration"]["valid_pixel_footprint_fraction"],
        "source":"NOAA GMGSI LW multisatellite infrared mosaic",
        "cloud_optical_depth_calibrated":False,
        "native_noaa_jma_level2_cloudmask":False,
        "native_dqf_zero_screen_used":True,
        "used_as_visual_only":True,
        "rgba_semantics":"R=IR-derived visual brightness, G=visual coverage, B=232 GMGSI, A=opaque",
    }
    (folder/f"manifest-{version}.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (folder/"latest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps(manifest,indent=2))
    return manifest

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    build(args.output)
