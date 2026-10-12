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


def grey_detail_from_satellite_ir(gray: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Source-local fine grey structure from REAL DQF-valid NOAA LW signal.

    Visual-only, NOT a retrieved cloud mask/optical thickness. Never lift an
    even IR radiance field to an invented grey veil. No global gamma lift,
    no bilateral scene equalisation or long-distance neighbour propagation.
    Returns an alternate display PNG; baseline remains byte-identical.
    """
    baseline = visual_density_from_satellite_ir(gray, valid)
    image = np.clip(gray.astype(np.float32, copy=False), 0, 1)
    support = valid.astype(np.float32, copy=False)

    def masked_mean(sigma: float) -> np.ndarray:
        total = gaussian_filter(image * support, sigma=sigma, mode="nearest")
        available = gaussian_filter(support, sigma=sigma, mode="nearest")
        return total / np.maximum(available, 0.001)

    micro = masked_mean(1.6)
    near = masked_mean(6.0)
    large = masked_mean(20.0)
    # Positive LOCAL radiance ridges only; warm surface background cannot
    # become cloud just because its absolute IR brightness is nonzero.
    fine = np.maximum(image - near, 0)
    coherent = np.maximum(micro - near, 0)
    layered = np.maximum(near - large, 0)
    local_ridge = np.maximum(fine, coherent)

    # High-contrast locally structured satellite features survive as quiet
    # grey filaments even when their absolute IR cold-top score is weak.
    # Broad layers must be paired with an independently measured fine ridge;
    # a uniformly grey thermal plateau therefore remains unchanged.
    texture = (
        0.092 * smoothstep(.006, .064, fine) +
        0.080 * smoothstep(.007, .058, coherent) +
        0.044 * smoothstep(.011, .083, layered)
        * smoothstep(.006, .028, local_ridge)
    )
    radiance_gate = smoothstep(.095, .265, image)
    # Source DQF edge confidence: shrink enhancement near invalid pixels.
    # The original baseline still determines the appearance in this band.
    footprint = gaussian_filter(support, sigma=3, mode="nearest")
    edge_gate = smoothstep(.62, .985, footprint)
    amount = np.minimum(texture * radiance_gate * edge_gate, .165)
    result = baseline + amount * (1 - baseline / .72) * .82
    return np.where(valid, np.clip(result, 0, .72), 0).astype(np.float32)
