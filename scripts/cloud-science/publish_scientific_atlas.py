#!/usr/bin/env python3
"""Publishable CUPOLA V3 scientific atlas from verified GOES ACMF and Himawari CMSK.

Inputs are the exact science NPZs built by existing smoke-test decoders, NOT
GIBS IR PNGs. L2 QA masks remain authoritative. The RGB(A) channels encode:
R = visualization cloud signal, G = observation/render confidence,
B = provenance (1 east, 2 west, 3 east+west, 4 H09, 5 overlap), A=255.
A clear-sky pixel can have G>0 while R=0. Missing must have G=R=0.

Optical depth and true-colour cloud reflectance are NOT inferred.
"""
import argparse
from datetime import datetime, timezone, timedelta
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 2048, 1024
AGE_LIMIT = timedelta(minutes=90)


def observation_time(raw):
    value = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Scientific observation must have a UTC offset")
    return value.astimezone(timezone.utc)


def checked_time(time, now, label):
    if time > now + timedelta(minutes=5) or now - time > AGE_LIMIT:
        raise ValueError(f"{label} scientific scan is stale or future-dated")
    return time


def shape_check(data, label):
    if data.shape != (HEIGHT, WIDTH):
        raise ValueError(f"{label} expected {HEIGHT}x{WIDTH}, got {data.shape}")


def read_goes(mosaic_path, thermal_path, now):
    with np.load(mosaic_path, allow_pickle=False) as z:
        times = z["observed_at_ms"].copy()
        classes = z["cloud_class"].copy()
        qa = z["quality"].copy()
    with np.load(thermal_path, allow_pickle=False) as z:
        density = z["density"].copy()
        conf = z["confidence"].copy()
        observed = z["coverage"].astype(bool)
        source = z["source_id"].copy()
    for field, name in ((times,"times"),(classes,"classes"),(qa,"qa"),
                        (density,"density"),(conf,"confidence"),
                        (observed,"coverage"),(source,"source")):
        shape_check(field, "GOES "+name)
    valid = observed & (qa > 0) & (classes <= 3) & (times > 0) & (source > 0)
    if np.any(observed & ~valid):
        raise ValueError("GOES thermal coverage violates the ACMF/QA provenance")
    if not np.all(np.isfinite(density)) or not np.all(np.isfinite(conf)):
        raise ValueError("GOES science atlas has non-finite pixels")
    if np.any((conf < 0) | (conf > 1.00001)) or np.any((density < 0) | (density > 1.00001)):
        raise ValueError("GOES confidence/density must be normalized")
    if np.count_nonzero(valid) < 100000:
        raise ValueError("Insufficient scientifically observed GOES cells")
    # Discard *individual* stale observations rather than accepting the newest
    # scan as evidence that the entire GOES raster is current.
    now_ms = int(now.timestamp() * 1000)
    valid &= (times <= now_ms + 300000) & (times >= now_ms - 90 * 60000)
    if np.count_nonzero(valid) < 100000:
        raise ValueError("No sufficiently recent GOES observations")
    dates = times[valid]
    earliest = datetime.fromtimestamp(int(dates.min()) / 1000, timezone.utc)
    latest = datetime.fromtimestamp(int(dates.max()) / 1000, timezone.utc)
    view = np.where(valid, conf, 0).astype(np.float32)
    signal = np.where(valid, density, 0).astype(np.float32)
    return signal, view, np.where(valid, source, 0).astype(np.uint8), earliest, latest


def read_himawari(mask_path, now):
    from scipy.ndimage import gaussian_filter
    from himawari_preview import render_confidence, observation_distance
    with np.load(mask_path, allow_pickle=False) as z:
        cls = z["cloud_class"].copy()
        qa = z["valid_qa"].astype(bool)
        temperature = z["temperature_kelvin"].copy()
        meta = json.loads(str(z["metadata"]))
    for field, name in ((cls,"classes"),(qa,"QA"),(temperature,"thermal")):
        shape_check(field, "Himawari "+name)
    if not np.array_equal(qa, cls <= 3):
        raise ValueError("Himawari classes and L2 quality mask disagree")
    seen = checked_time(observation_time(meta["thermal_scan_utc"]), now, "Himawari")
    if not meta.get("source", "").startswith("s3://noaa-himawari9/AHI-L2-FLDK-Clouds/"):
        raise ValueError("Unexpected Himawari provenance")
    if np.count_nonzero(qa) < 100000:
        raise ValueError("Himawari L2 QA coverage too sparse")
    if not np.all(np.isfinite(temperature[qa])):
        raise ValueError("Bad Himawari radiometric calibration")
    cloud = qa & (cls >= 2)
    cold = np.clip((305 - temperature) / 110, 0, 1)
    raw = np.where(cls == 3, .72, np.where(cls == 2, .34, 0)).astype(np.float32)
    raw *= (.55 + .45 * cold.astype(np.float32))
    # The previously reviewed preview's category-aware view-angle taper:
    class_view, _ = render_confidence(qa, cls)
    numerator = gaussian_filter(np.where(cloud, raw, 0).astype(np.float32),
                                sigma=2, mode=("nearest", "wrap"))
    neighbours = gaussian_filter(cloud.astype(np.float32), sigma=2,
                                 mode=("nearest", "wrap"))
    signal = np.where(cloud, numerator * np.minimum(1, neighbours * 1.35)
                      * class_view, 0).astype(np.float32)
    # Coverage confidence is independent of cloud/clear classification.
    # Longitude wraps; the atlas contains no invented polar or limb cells.
    edge_distance = observation_distance(qa)
    t = np.clip((edge_distance - .5) / 14.0, 0, 1)
    confidence = np.where(qa, .10 + .90 * (t*t*(3-2*t)), 0).astype(np.float32)
    return signal, confidence, qa, seen


def compose(goes=None, him=None):
    if goes is None and him is None:
        raise ValueError("No quality-verified scientific sources")
    empty = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    g_signal, g_conf, g_owner = (goes[:3] if goes else
                                (empty, empty, np.zeros_like(empty, dtype=np.uint8)))
    h_signal, h_conf = (him[:2] if him else (empty, empty))
    # Validated GEO footprints may overlap. They are weighted only where
    # original QA observations exist; there is no inpainting.
    weights = g_conf + h_conf
    density = np.divide(g_signal * g_conf + h_signal * h_conf, weights,
                        out=np.zeros_like(empty), where=weights > 0)
    confidence = 1 - (1 - np.clip(g_conf, 0, 1)) * (1 - np.clip(h_conf, 0, 1))
    dominant = np.where(g_conf > 0, g_owner, 0).astype(np.uint8)
    dominant = np.where((h_conf > 0) & (g_conf > 0), 5, dominant)
    dominant = np.where((h_conf > 0) & (g_conf == 0), 4, dominant)
    density = np.where(confidence > 0, density, 0)
    rgba = np.empty((HEIGHT, WIDTH, 4), dtype=np.uint8)
    rgba[:,:,0] = np.round(np.clip(density, 0, 1) * 255).astype(np.uint8)
    rgba[:,:,1] = np.round(np.clip(confidence, 0, 1) * 255).astype(np.uint8)
    rgba[:,:,2] = np.round(dominant * 255 / 6).astype(np.uint8)
    rgba[:,:,3] = 255
    if np.any(rgba[:,:,0][confidence == 0]):
        raise ValueError("Clouds invented outside scientific footprint")
    if np.any(rgba[:,:,0][(g_conf > 0) & (h_conf == 0) & (g_signal == 0)]):
        raise ValueError("GOES clear-sky cloud leakage")
    if np.any(rgba[:,:,0][(h_conf > 0) & (g_conf == 0) & (h_signal == 0)]):
        raise ValueError("Himawari clear-sky cloud leakage")
    return rgba, dominant, float(np.count_nonzero(confidence > 0.03) / (HEIGHT * WIDTH))


def build(args):
    now = datetime.now(timezone.utc)
    goe, him = None, None
    sources = []
    times = []
    if bool(args.goes_mosaic) != bool(args.goes_thermal):
        raise ValueError("GOES mosaic/thermal files must be supplied together")
    if args.goes_mosaic:
        goe = read_goes(args.goes_mosaic, args.goes_thermal, now)
        sources.extend(["goes-east-acmf", "goes-west-acmf"])
        times.append(goe[3])
    if args.himawari_mask:
        him = read_himawari(args.himawari_mask, now)
        sources.append("himawari9-ahi-cmsk")
        times.append(him[3])
    rgba, owner, coverage = compose(goe, him)
    if coverage < .05:
        raise ValueError("Published scientific atlas has insufficient real coverage")
    if not args.version.isdigit() or len(args.version) != 14:
        raise ValueError("Version must be a unique UTC YYYYMMDDHHMMSS token")
    args.output.mkdir(parents=True, exist_ok=True)
    png = args.output / f"atlas-{args.version}.png"
    manifest_file = args.output / f"manifest-{args.version}.json"
    Image.fromarray(rgba, "RGBA").save(png, optimize=True)
    digest = sha256(png.read_bytes()).hexdigest()
    expires = min(times) + AGE_LIMIT
    if expires <= now:
        raise ValueError("Scientific source has already expired")
    manifest = {
        "schema": "cupola-scientific-cloud-v3/v1",
        "version": args.version,
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "expires_at": expires.isoformat().replace("+00:00", "Z"),
        "width": WIDTH, "height": HEIGHT,
        "channels": "R=cloud-visualization,G=quality-and-view-confidence,B=source,A=opaque",
        "science_products": sources,
        "sources": [{
            "source": "goes-acmf", "product": "ABI-L2-ACMF + ABI-L1b-Band13",
            "observation_start": goe[3].isoformat().replace("+00:00", "Z"),
            "observation_end": goe[4].isoformat().replace("+00:00", "Z"),
            "time_precision": "GOES granule midpoint",
        }] * bool(goe) + ([{
            "source": "himawari9-cmsk", "product": "AHI-CMSK + AHI-L1b-Band13",
            "observation_start": him[3].isoformat().replace("+00:00", "Z"),
            "observation_end": him[3].isoformat().replace("+00:00", "Z"),
            "time_precision": "Himawari 10-minute scan start",
        }] if him else []),
        "observed_coverage_fraction": round(coverage, 6),
        "source_distribution": {str(i): int(np.count_nonzero(owner == i)) for i in range(1,6)},
        "atlas_file": png.name, "atlas_sha256": digest,
        "optical_depth_verified": False,
        "visible_light_photorealism": False,
        "meteosat_api_used": False,
        "not_a_static_fallback": True,
    }
    manifest_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return manifest


def self_test():
    observed = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    observed[300:700, 300:900] = 1
    cloudy = observed * .75
    owner = (observed * 1).astype(np.uint8)
    rgba, provenance, fraction = compose((cloudy, observed, owner), None)
    assert rgba[500,500,0] > 0 and rgba[500,500,1] == 255
    assert rgba[5,5,0] == rgba[5,5,1] == 0
    assert provenance[500,500] == 1 and fraction > .05
    clear = np.zeros_like(observed)
    h = np.zeros_like(observed)
    h[500:800, 600:1100] = .7
    mask = np.zeros_like(observed, dtype=bool)
    mask[500:800, 600:1100] = True
    mix, _, _ = compose((clear, observed, owner), (h, mask.astype(np.float32), mask, datetime.now(timezone.utc)))
    assert mix[400,400,0] == 0 and mix[400,400,1] > 0
    assert mix[600,700,0] > 0 and mix[600,700,1] > 0
    assert mix[5,5,0] == mix[5,5,1] == 0
    print("Scientific V3 atlas: observed clear, missing, cloud & overlap checks PASS")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--goes-mosaic", type=Path)
    p.add_argument("--goes-thermal", type=Path)
    p.add_argument("--himawari-mask", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--version")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()
    if a.self_test:
        self_test()
    elif not a.output or not a.version:
        p.error("--output and --version required for atlas generation")
    else:
        build(a)
