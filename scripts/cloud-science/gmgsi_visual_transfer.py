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

    near = masked_blur(6.0)
    large = masked_blur(20.0)
    fine = np.maximum(image - near, 0)
    broad = np.maximum(image - large, 0)

    # A gentle cloud-core curve + conservative high-pass wisps.
    # If the same gray signal fills the entire region, high-pass=0.
    # Only STRUCTURED NOAA source radiance may produce the thin cirrus cue.
    main = np.power(smoothstep(.22, .88, image), .90) * .70
    wisps = (smoothstep(.012, .09, fine) * .22 +
             smoothstep(.020, .13, broad) * .11) * smoothstep(.13, .36, image)
    result = np.maximum(main, wisps)
    return np.where(valid, np.clip(result, 0, .72), 0).astype(np.float32)
