#!/usr/bin/env python3
"""Download and optimize the ORIGINAL ESA/Gaia EDR3 equirectangular sky image.

The equirectangular projection is required: the Hammer/Aitoff panorama cannot
be mapped to an inside-out 3D sphere. Output is an adapted image distributed
under CC BY-SA 3.0 IGO with attribution in docs and the CUPOLA Control Center.
"""
from __future__ import annotations
import hashlib
import io
import pathlib
import sys
import urllib.request
from PIL import Image, ImageOps

SOURCE = (
    "https://www.esa.int/var/esa/storage/images/esa_multimedia/images/2020/"
    "12/interactive_map_of_the_sky_from_gaia_s_early_data_release_3/"
    "25364650-1-eng-GB/Interactive_map_of_the_sky_from_Gaia_s_Early_Data_Release_3.png"
)
# Identical official image mirrored by Wikimedia Commons (2,000 x 1,000).
MIRROR = (
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/"
    "Interactive_map_of_the_sky_from_Gaia%E2%80%99s_Early_Data_Release_3_ESA25364661.png"
)
OUT = pathlib.Path("public/sky/gaia-edr3-equirect.webp")

def load_image() -> tuple[Image.Image, str, str]:
    last = None
    for url in (SOURCE, MIRROR):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "CUPOLA-Sky-Asset/1.0 (+https://github.com/SviatF/cupola-planet)",
                "Accept": "image/png,image/*"
            })
            with urllib.request.urlopen(req, timeout=35) as response:
                payload = response.read(18000000)
            image = Image.open(io.BytesIO(payload))
            image.load()
            if image.width != 2000 or image.height != 1000:
                raise ValueError(f"Expected Gaia EDR3 equirectangular 2000x1000, got {image.size}")
            if image.format != "PNG":
                raise ValueError(f"Expected original PNG, got {image.format}")
            return image, url, hashlib.sha256(payload).hexdigest()
        except Exception as exc:
            last = exc
            print(f"Source unavailable: {url}: {exc}", file=sys.stderr)
    raise RuntimeError("No verified ESA Gaia equirectangular image available") from last

def main() -> None:
    if OUT.exists():
        with Image.open(OUT) as prior:
            if prior.size == (2000, 1000) and prior.format == "WEBP":
                print("Validated existing Gaia asset, no changes needed")
                return
        raise RuntimeError("Existing Gaia asset is not the expected source")
    image, url, sha = load_image()
    rgb = ImageOps.exif_transpose(image).convert("RGB")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(OUT, format="WEBP", quality=86, method=6, exact=True)
    with Image.open(OUT) as test:
        test.verify()
    result_bytes = OUT.stat().st_size
    if result_bytes > 1_800_000:
        raise RuntimeError(f"WebP {result_bytes} bytes exceeds 1.8MB performance budget")
    print(f"Gaia EDR3 equirectangular: {rgb.size[0]}x{rgb.size[1]}, {result_bytes:,} bytes")
    print(f"ESA original {url}")
    print(f"Source SHA256: {sha}")
    print("Attribution ESA/Gaia/DPAC; acknowledgement A. Moitinho; CC BY-SA 3.0 IGO")

if __name__ == "__main__":
    main()
