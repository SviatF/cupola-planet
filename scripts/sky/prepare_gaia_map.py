#!/usr/bin/env python3
"""Reproducibly prepare CUPOLA's licensed, local, low-bandwidth ESA/Gaia sky map.

This job fetches one pinned ESA-authored image mirrored by Wikimedia Commons.
The image is an equirectangular all-sky Galactic-coordinate panorama.
We only convert RGB/resize/compress to WebP; no synthetic content is inserted.
The adaptation is distributed under the same CC BY-SA 3.0 IGO license.
"""
from __future__ import annotations

import hashlib
import io
import pathlib
import time
import urllib.request

from PIL import Image, ImageOps

SOURCE_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/c/c2/"
    "Interactive_map_of_the_sky_from_Gaia%E2%80%99s_Early_Data_Release_3_ESA25364661.png"
)
SOURCE_SHA1 = "53aacb50613e0baf5636c91fb670d1a3615fc767"
TARGET = pathlib.Path("public/astro/gaia-edr3-sky.webp")

def download() -> bytes:
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                SOURCE_URL,
                headers={"User-Agent": "CUPOLA-GaiaSky-AssetBuilder/1.0 (https://github.com/SviatF/cupola-planet; Wikimedia-licensed astronomy media)"}
            )
            with urllib.request.urlopen(request, timeout=50) as response:
                data = response.read(6_000_000)
            if hashlib.sha1(data).hexdigest() != SOURCE_SHA1:
                raise RuntimeError("Upstream Gaia sky map has unexpected SHA-1; refusing unreviewed bytes")
            return data
        except (OSError, TimeoutError) as exc:
            if attempt == 3:
                raise
            print(f"Source download attempt {attempt+1}: {exc}; retry", flush=True)
            time.sleep(4*(attempt+1))
    raise RuntimeError("Source unavailable")

def main() -> None:
    raw = download()
    image = Image.open(io.BytesIO(raw))
    image.load()
    if image.size != (2000, 1000):
        raise RuntimeError(f"Unexpected equirectangular source dimensions: {image.size}")
    if image.format != "PNG":
        raise RuntimeError("Unexpected source format")
    # RGB sky on genuine black; never synthesize nebulosity.
    image = ImageOps.exif_transpose(image).convert("RGB")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    image.save(TARGET, format="WEBP", quality=76, method=6)
    size = TARGET.stat().st_size
    if size > 900_000:
        raise RuntimeError(f"Gaia image exceeds initial load budget: {size} bytes")
    with Image.open(TARGET) as verify:
        if verify.size != (2000, 1000):
            raise RuntimeError("WebP validation failed")
    print(f"GAIA ASSET READY: {TARGET} {size} bytes; pinned source SHA1={SOURCE_SHA1}")

if __name__ == "__main__":
    main()
