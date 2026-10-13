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

    # A real IR snapshot contains broad and fine local gradients that
    # cold-top-only alpha curves suppress. Estimate LOCAL variation in the
    # same DQF-checked observation; do not treat brightness as optical depth.
    near = masked_mean(7.0)
    large = masked_mean(22.0)
    near_sq = gaussian_filter(image * image * support, sigma=7.0, mode="nearest")
    large_sq = gaussian_filter(image * image * support, sigma=22.0, mode="nearest")
    near_weight = gaussian_filter(support, sigma=7.0, mode="nearest")
    large_weight = gaussian_filter(support, sigma=22.0, mode="nearest")
    near_std = np.sqrt(np.maximum(near_sq / np.maximum(near_weight, .001) - near * near, 0))
    large_std = np.sqrt(np.maximum(large_sq / np.maximum(large_weight, .001) - large * large, 0))
    fine_structure = smoothstep(.010, .055, near_std)
    broad_structure = smoothstep(.012, .068, large_std)
    positive_anomaly = smoothstep(.008, .11, np.maximum(image - large, 0))
    radiance_gate = smoothstep(.12, .51, image)

    # Never add a background plateau: at zero local thermal variance all
    # contributions are exactly zero, even for bright uniform source radiance.
    # The positive anomaly independently identifies real warmer/cooler IR
    # morphology; it is NOT a classified cloud or manufactured cirrus.
    texture = ((.095 * fine_structure + .085 * broad_structure) *
               radiance_gate + .12 * positive_anomaly * broad_structure)

    # A feathered DQF-valid-only support prevents blooming at invalid masks.
    # This cannot remove the original science or change source B/G/A bytes.
    edge_gate = smoothstep(.80, .99, near_weight)
    result = baseline + texture * edge_gate
    result = np.maximum(result, baseline)
    return np.where(valid, np.clip(result, 0, .72), 0).astype(np.float32)
