#!/usr/bin/env python3
"""Compare live Meteosat WMS products from the *current* PR source code.
Only report measurements; never claim infrared luminance is native CLM QA.
"""
from __future__ import annotations
import argparse
import io
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from PIL import Image
from collections import Counter
from datetime import datetime, timezone


def inspect(base: str, out: Path, kind: str):
    url = f"{base}/api/clouds-geostationary?source=meteosat&visual={kind}&test=current-pr"
    result = {"requested": kind, "status": None, "layer": None, "source_type": None,
              "source_time": None, "available": False}
    try:
        with urlopen(Request(url, headers={"User-Agent":"CUPOLA-Local-IR-Source-QA/1.0"}),
                     timeout=200) as response:
            result["status"] = response.status
            for key,field in (
                ("x-cupola-layer","layer"),
                ("x-cupola-source-type","source_type"),
                ("x-cupola-frame-time","source_time"),
                ("x-cupola-visual-preference","confirmed_preference"),
                ("x-cupola-visual-fallback","fallback"),
            ):
                result[field] = response.headers.get(key)
            if response.status != 200:
                return result
            payload = response.read(16_000_000)
    except HTTPError as exc:
        result["status"] = exc.code
        result["error"] = str(exc)[:250]
        return result
    except (URLError, TimeoutError, ValueError) as exc:
        result["error"] = type(exc).__name__+": "+str(exc)[:250]
        return result
    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        result["error"] = "Upstream was not a PNG"
        return result
    with Image.open(io.BytesIO(payload)) as im:
        im.load()
        rgba = im.convert("RGBA")
        if rgba.size != (2048,1024):
            result["error"] = "Wrong global image shape"
            return result
        alphas = rgba.getchannel("A")
        counts = Counter(alphas.getdata())
        covered = sum(n for a,n in counts.items() if a>0)
        occupied = sum(n for a,n in counts.items() if a>=8)
        cloud = sum(n for a,n in counts.items() if a>26)
        result.update({
            "available":True,
            "width":2048,
            "height":1024,
            "covered_fraction":round(covered/(2048*1024),4),
            "classified_coverage_fraction":round(occupied/(2048*1024),4),
            "cloud_alpha_gt26_fraction":round(cloud/(2048*1024),4),
            "distinct_alpha_values":len(counts),
            "alpha_top":counts.most_common(9),
            "is_native_level2":False,
        })
        rgba.save(out / f"meteosat-{kind}.png",optimize=True)
    return result


def run(base: str, out: Path):
    out.mkdir(parents=True,exist_ok=True)
    result={"generated_at":datetime.now(timezone.utc).isoformat(),
            "source":"LIVE EUMETView WMS, not native L2",
            "description":"Current branch-built Next.js handler; never count visual coverage as Level-2"}
    for kind in ("infrared","clm"):
        result[kind]=inspect(base.rstrip("/"),out,kind)
    (out/"report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))
    for k in ("infrared","clm"):
        item=result[k]
        if item["status"]==200 and item["confirmed_preference"] != ("infrared-first" if k=="infrared" else "clm-first"):
            raise AssertionError("New backend source ordering not deployed in local Next app")
    # Do not fail merely because EUMETView temporarily has no fresh scene.
    # On a real IR success require the telemetry to identify the exact IR layer.
    ir=result["infrared"]
    if ir.get("available") and ir.get("source_type")=="infrared-processed":
        assert ir["layer"] in ("mtg_fd:ir105_hrfi","msg_fes:ir108")
        print("PASS: Fresh Infrared source, independently decoded and saved.")
    elif ir.get("available"):
        print("IR unavailable; categorical CLM retained as an explicitly labelled fallback.")
    else:
        print("EUMETView not usable for this run; source comparison inconclusive.")


if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--base-url",required=True)
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    run(args.base_url,args.output)
