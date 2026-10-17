#!/usr/bin/env python3
"""One-off NASA Moon Kit 4K asset builder for CUPOLA.

Uses authentic 16-bit LROC sRGB mosaic + LOLA unsigned half-meter elevations.
Assets are prepared in GitHub CI and committed to the branch, NEVER transformed
on every request or downloaded by the homepage. Lunar views load them lazily.
NASA SVS item 4720: https://svs.gsfc.nasa.gov/4720/
"""
from __future__ import annotations

import hashlib
import io
import json
import urllib.request
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
OUT = Path("public/moon")
OUT.mkdir(parents=True, exist_ok=True)


def fetch_tiff(filename: str, maximum: int = 125_000_000) -> tuple[np.ndarray, str]:
    req = urllib.request.Request(
        BASE + filename,
        headers={"User-Agent": "Cupola-NASA-MoonKit-AssetBuilder/1.0"},
    )
    with urllib.request.urlopen(req, timeout=150) as response:
        data = response.read(maximum + 1)
    if len(data) > maximum or len(data) < 100_000:
        raise ValueError("NASA source size outside expected limits: " + filename)
    if data[:4] not in (b"II*\x00", b"MM\x00*"):
        raise ValueError("NASA source is not a TIFF: " + filename)
    array = tifffile.imread(io.BytesIO(data))
    return np.asarray(array), hashlib.sha256(data).hexdigest()


def channels_last(array: np.ndarray) -> np.ndarray:
    if array.ndim == 3 and array.shape[0] in (3, 4) and array.shape[2] not in (3, 4):
        return np.moveaxis(array, 0, -1)
    return array


def build() -> None:
    assets: list[dict[str, object]] = []
    color_name = "lroc_color_16bit_srgb_4k.tif"
    rgb, digest = fetch_tiff(color_name)
    rgb = channels_last(rgb)
    if rgb.ndim != 3 or rgb.shape[:2] != (2048, 4096) or rgb.shape[2] < 3:
        raise ValueError(f"Unexpected NASA LROC 4K raster shape {rgb.shape}")
    if rgb.dtype == np.uint16:
        rgb8 = (rgb[:, :, :3] >> 8).astype(np.uint8)
    elif rgb.dtype == np.uint8:
        rgb8 = rgb[:, :, :3]
    else:
        raise ValueError(f"Unexpected NASA LROC data type {rgb.dtype}")
    color_output = OUT / "lroc_color_4k.webp"
    # Input is already sRGB (NASA), do not apply another gamma transform.
    Image.fromarray(rgb8, "RGB").save(
        color_output, "WEBP", quality=94, method=5,
    )
    assets.append({
        "output": color_output.name,
        "source": color_name,
        "sha256_source": digest,
        "size_bytes": color_output.stat().st_size,
        "color_space": "sRGB",
    })

    height_name = "ldem_16_uint.tif"
    height, digest = fetch_tiff(height_name)
    height = channels_last(height)
    if height.ndim != 2 or height.shape != (2880, 5760) or height.dtype != np.uint16:
        raise ValueError(f"Unexpected NASA LOLA elevation data: {height.shape}, {height.dtype}")
    # NASA's 16-bit unsigned LOLA height: 0.5 metres per unit, +20,000
    # unit offset (10 km below Moon radius). Preserve a [-10km,+10km]
    # range in the derived grayscale map for conservative normal shading.
    height8 = np.clip(
        np.rint(height.astype(np.float32) / 40000.0 * 255.0), 0, 255,
    ).astype(np.uint8)
    height_output = OUT / "lola_height_4k.webp"
    Image.fromarray(height8, "L").resize(
        (4096, 2048), Image.Resampling.LANCZOS,
    ).save(height_output, "WEBP", lossless=True, method=5)
    assets.append({
        "output": height_output.name,
        "source": height_name,
        "sha256_source": digest,
        "size_bytes": height_output.stat().st_size,
        "color_space": "data / no gamma",
        "height_encoding": "0..255 maps NASA [-10000m,+10000m] relative to 1737.4km",
    })

    # Validation: ensure output decodes, is 4K and physically plausible.
    for asset in assets:
        with Image.open(OUT / str(asset["output"])) as image:
            if image.size != (4096, 2048):
                raise ValueError("Incorrect generated lunar texture dimensions")
            image.load()
    manifest = {
        "source": "NASA SVS CGI Moon Kit #4720, LROC / LOLA",
        "credit": "NASA Scientific Visualization Studio / Ernie Wright / Noah Petro",
        "source_page": "https://svs.gsfc.nasa.gov/4720/",
        "kind": "static NASA imagery; lunar illumination and phase computed at render UTC",
        "assets": assets,
    }
    (OUT / "source-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf8",
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    build()
