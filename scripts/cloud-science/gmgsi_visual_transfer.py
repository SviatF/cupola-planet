"""Contrast-aware, imagery-derived NOAA GMGSI DISPLAY transfer.

NOAA IR brightness is not an optical-depth retrieval. Use measured signal
and local contrast only; a smooth atmospheric background must NOT become a
fake gray cloud blanket. Invalid DQF/footprint remains empty. This module
contains no HTTP calls, facilitating deterministic QA before publish.
"""
import numpy as np
from scipy.ndimage import gaussian_filter


def smoothstep(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x-lo)/(hi-lo), 0, 1)
    return t*t*(3-2*t)


def visual_density_from_satellite_ir(gray: np.ndarray, valid: np.ndarray) -> np.ndarray:
    if gray.shape != valid.shape or gray.ndim != 2:
        raise ValueError("NOAA IR and DQF shapes must match")
    if not np.isfinite(gray).all():
        raise ValueError("Non-finite NOAA IR signal")
    image = np.clip(gray.astype(np.float32, copy=False), 0, 1)
    good = valid.astype(np.float32, copy=False)

    # Normalise the local convolution by actual DQF-valid support.
    # This prevents fake bright rims at missing-footprint boundaries.
    def masked_blur(sigma: float) -> np.ndarray:
        sampled = gaussian_filter(image * good, sigma=sigma, mode="nearest")
        support = gaussian_filter(good, sigma=sigma, mode="nearest")
        return sampled / np.maximum(support, 0.001)

    micro = masked_blur(1.4)
    near = masked_blur(6.0)
    large = masked_blur(20.0)

    # The original transfer retained prominent cold cloud cores but dropped
    # substantial fine GREY satellite structure, particularly over Africa
    # and the southern ocean: weak IR contrast often fell below 0.02.
    # Use multiple positive LOCAL radiance differences measured at the SAME
    # coordinates. Low-frequency uniform background stays at zero, and the
    # DQF-invalid edge never acquires cloud from a neighbouring valid pixel.
    fine = np.maximum(image - near, 0)
    coherent = np.maximum(micro - near, 0)
    broad = np.maximum(image - large, 0)
    layered = np.maximum(near - large, 0)

    # Distinct high, middle and low-relief structure, with bounded strength.
    # THIS IS NOT A CLASSIFIED CLOUDMASK. No arbitrary grey overlay, land
    # texture synthesis, dilation, neighbour inpainting or hemispheric gain.
    main = np.power(smoothstep(.205, .875, image), .91) * .69
    micro_detail = (smoothstep(.006, .065, fine) * .14 +
                    smoothstep(.007, .050, coherent) * .12)
    layered_detail = (smoothstep(.011, .073, layered) * .16 +
                      smoothstep(.018, .108, broad) * .07)
    wisps = np.minimum(.34, micro_detail + layered_detail) * smoothstep(.115, .32, image)
    result = np.maximum(main, wisps)
    return np.where(valid, np.clip(result, 0, .72), 0).astype(np.float32)
