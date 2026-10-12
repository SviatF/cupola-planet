#!/usr/bin/env python3
"""Experimental geometrically registered NOAA GMGSI global LW quicklooks.

Produces source-correct, QA-conservative **diagnostic** world PNGs.
The raw GMGSI 0..255 'brightness temperature' encoding is not yet calibrated
to optical cloud thickness. BOTH display polarities are provided; never use
as trusted scientific cloud masks or publish in the 3D scene yet.
"""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen
from urllib.parse import quote
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from netCDF4 import Dataset
from inspect_noaa_gmgsi import latest, BASE, MAX_BYTES

W,H=2048,1024

def run(folder:Path):
    folder.mkdir(parents=True,exist_ok=True)
    report={"ready_for_globe":False,"generated_at":datetime.now(timezone.utc).isoformat(),
            "provenance":"NOAA GMGSI longwave IR multi-satellite global mosaic",
            "not_calibrated_cloud_optical_depth":True,
            "dqf_code_zero_interpretation_pending":True}
    item,sensed,age=latest()
    report["source"]={"key":item["key"],"sensed":sensed.isoformat(),
                      "age_hours":round(age,3),"bytes":item["bytes"]}
    with tempfile.TemporaryDirectory() as tmp:
        local=Path(tmp)/"source.nc"
        with urlopen(Request(BASE+quote(item["key"],safe="/"),
                 headers={"User-Agent":"CUPOLA-GMGSI-Native-Geolocation-QA/1.0"}),
                 timeout=70) as stream,local.open("wb") as dst:
            h=hashlib.sha256()
            n=0
            while True:
                block=stream.read(1024*1024)
                if not block:break
                n+=len(block)
                if n>MAX_BYTES:raise ValueError("Download too large")
                dst.write(block);h.update(block)
        if n != item["bytes"]:raise ValueError("File size mismatch")
        report["source"]["sha256"]=h.hexdigest()
        with Dataset(local) as ds:
            lon=np.ma.filled(ds["lon"][0,:],np.nan).astype(np.float64)
            lat=np.ma.filled(ds["lat"][:,0],np.nan).astype(np.float64)
            if not (np.isfinite(lat).all() and np.isfinite(lon).all() and
                    np.all(np.diff(lat)<0) and
                    np.all(np.diff(lon[1:])>0)):
                raise ValueError("Coordinate grid is not the expected monotonic pattern")
            # Verify the coordinate fields really are separable in both axes.
            for y in (0,500,1500,2500,len(lat)-1):
                for x in (0,1000,2500,4000,len(lon)-1):
                    a=float(ds["lat"][y,x]);b=float(ds["lon"][y,x])
                    if abs(a-lat[y])>.02 or abs(b-lon[x])>.02:
                        raise ValueError(f"Non-separable source coordinate at {x},{y}")
            if abs(float(lon[0])-180)>.2 or abs(float(lon[1])+180)>.3:
                raise ValueError("Unrecognized 180-degree longitude seam")
            out_lat=90-(np.arange(H)+.5)*180/H
            out_lon=-180+(np.arange(W)+.5)*360/W
            inside=(out_lat<=lat.max())&(out_lat>=lat.min())
            yy=np.interp(out_lat,lat[::-1],np.arange(lat.size)[::-1])
            xx=np.interp(out_lon,lon[1:],np.arange(1,len(lon)))
            # clamp sample to valid inner interior for four-neighbor QA
            yi=np.clip(np.floor(yy).astype(int),0,len(lat)-2)
            xi=np.clip(np.floor(xx).astype(int),1,len(lon)-2)
            fy=np.repeat(yy[:,None],W,axis=1)
            fx=np.repeat(xx[None,:],H,axis=0)
            raw=np.ma.filled(np.ma.asarray(ds["data"][0]).astype(np.float32),np.nan)
            quality=np.ma.filled(ds["dqf"][0],-128).astype(np.int16)
            native_ok=(np.isfinite(raw)&(quality==0))
            # A source pixel is usable only if all 4 bilinear neighbors pass
            # the conservative dqf==0 screen. No outside-footprint inpainting.
            allgood=(native_ok[yi[:,None],xi[None,:]]&
                     native_ok[yi[:,None]+1,xi[None,:]]&
                     native_ok[yi[:,None],xi[None,:]+1]&
                     native_ok[yi[:,None]+1,xi[None,:]+1]&inside[:,None])
            # Do not interpolate NaN through adjacent invalid data.
            raw[~np.isfinite(raw)]=0
            coords=np.stack((fy,fx),axis=0)
            samples=map_coordinates(raw,coords,order=1,mode="nearest",prefilter=False)
            report["registration"]={
                "world_atlas":[W,H],
                "input_shape":list(raw.shape),
                "source_latitude":[float(lat.min()),float(lat.max())],
                "source_longitude":[float(np.nanmin(lon)),float(np.nanmax(lon))],
                "valid_pixel_footprint_fraction":round(float(allgood.mean()),6),
                "earth_surface_area_footprint_fraction":round(float(
                    (allgood*np.cos(np.deg2rad(out_lat))[:,None]).sum()/
                    (W*np.cos(np.deg2rad(out_lat)).sum())),6),
                "geolocation_axes_verified":True,
                "masked_four-neighbor_dqf_zero":True,
            }
            # Display-only quicklooks: encoding-to-cold-cloud polarity awaits
            # verification. Do not enable either in the production shader.
            for label,signal in (
                ("direct",np.clip((samples-45)/175,0,1)),
                ("inverted",np.clip((215-samples)/175,0,1)),
            ):
                rgba=np.zeros((H,W,4),dtype=np.uint8)
                rgba[:,:,0:3]=np.uint8(np.round(signal[:,:,None]*255))
                rgba[:,:,3]=np.where(allgood,255,0)
                Image.fromarray(rgba,"RGBA").save(
                    folder/f"gmgsi-lw-geo-{label}.png",optimize=True)
            del raw,quality,coords,samples
    (folder/"gmgsi-geo-diagnostic.json").write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps(report,indent=2,ensure_ascii=False))
    return report

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",required=True,type=Path)
    args=p.parse_args()
    run(args.output)
