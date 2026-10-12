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
from gmgsi_visual_transfer import (
    visual_density_from_satellite_ir,
    grey_detail_from_satellite_ir,
)

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
    # Preserve thin radiance filaments, not uniform brightness.
    # Spatial contrast is derived strictly from the actual DQF-checked NOAA
    # IR image. Do not classify its low radiance as scientifically clear.
    density=visual_density_from_satellite_ir(normalized,valid)
    texture=np.zeros((H,W,4),dtype=np.uint8)
    texture[:,:,0]=np.where(valid,np.round(density*255),0).astype(np.uint8)
    texture[:,:,1]=np.where(valid,135,0).astype(np.uint8)
    texture[:,:,2]=np.where(valid,232,0).astype(np.uint8)
    texture[:,:,3]=255
    version=now.strftime("%Y%m%d%H%M%S")
    png=f"gmgsi-visual-{version}.png"
    Image.fromarray(texture,"RGBA").save(folder/png,optimize=True)
    digest=sha256((folder/png).read_bytes()).hexdigest()

    # Two pixel-identical source coordinates / DQF masks; only visual R
    # differs. Publish separately so every user can compare the same scan
    # without the previous false-positive from mutable branch previews.
    enhanced=grey_detail_from_satellite_ir(normalized,valid)
    detail=np.array(texture,copy=True)
    detail[:,:,0]=np.where(valid,np.round(enhanced*255),0).astype(np.uint8)
    detail_png=f"gmgsi-grey-detail-{version}.png"
    Image.fromarray(detail,"RGBA").save(folder/detail_png,optimize=True)
    detail_digest=sha256((folder/detail_png).read_bytes()).hexdigest()
    # Data fidelity assertions MUST happen before release publication.
    assert np.array_equal(detail[:,:,1:],texture[:,:,1:])
    assert np.all(detail[:,:,0]>=texture[:,:,0])
    assert np.all(detail[~valid,0]==0)

    # Geographical QA on the exact current NOAA scan. Improvements must be
    # meaningful but cannot create an opaque grey rectangle across Africa.
    # This is a VISUAL signal metric, never an optical-depth/cloud-count metric.
    africa=(slice(round((90-37)/180*H),round((90+35)/180*H)),
            slice(round((-18+180)/360*W),round((50+180)/360*W)))
    af_valid=valid[africa]
    if not np.any(af_valid):
        raise ValueError("No currently valid NOAA IR in Africa validation region")
    af_old=density[africa][af_valid]
    af_new=enhanced[africa][af_valid]
    af_gain=af_new-af_old
    fraction=float(np.mean(af_gain>.03))
    mean_delta=float(np.mean(af_gain))
    # A real source can be nearly featureless; do not invent clouds to meet
    # a growth quota. But reject a nearly-global grey veil or overexposure.
    if not (0 <= fraction < .88 and 0 <= mean_delta < .13):
        raise ValueError("Source-only Africa grey detail failed bounded image QA "
                         f"fraction={fraction:.3f} mean_delta={mean_delta:.4f}")
    print(json.dumps({"grey_detail_africa_qa":{
        "real_satellite_valid_pixels":int(np.count_nonzero(af_valid)),
        "locally_enhanced_fraction":round(fraction,5),
        "mean_added_visual_density":round(mean_delta,5),
        "scientific_cloud_fraction_inferred":False,
        "original_level2_modified":False,
        "all_source_provenance_channels_identical":True,
    }}))
    manifest={
        "schema":SCHEMA,"version":version,
        "generated_at":now.isoformat(),
        "observation_start":observed.isoformat(),
        "expires_at":(observed+timedelta(hours=4)).isoformat(),
        "width":W,"height":H,"atlas_file":png,"atlas_sha256":digest,
        "grey_detail_available":True,
        "grey_detail_file":detail_png,
        "grey_detail_sha256":detail_digest,
        "grey_detail_transfer":"structured-local-noaa-lw-v2",
        "grey_detail_visual_only":True,
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
