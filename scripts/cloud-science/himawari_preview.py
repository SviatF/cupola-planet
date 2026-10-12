"""Conservative visualization confidence for Himawari-9 AHI-CMSK.

This NEVER changes scientific classes, observed coverage, or the official
CloudMaskQualFlag. A geostationary satellite sees clouds at severe oblique
angles near its disk limb. The AHI Level-2 'probably cloudy' category there
can contain block-shaped classifier artifacts. We therefore attenuate the
DISPLAY opacity more strongly for that *uncertain* class near the limb.

The output is NOT a scientific quality flag, probability, or optical depth.
"""
import numpy as np
from scipy.ndimage import distance_transform_edt


def smoothstep01(value):
    t = np.clip(value, 0.0, 1.0)
    return t*t*(3.0-2.0*t)


def observation_distance(observed):
    """Distance in equirectangular pixels to invalid QA, wrapping longitude."""
    observed = np.asarray(observed, dtype=bool)
    if observed.ndim != 2:
        raise ValueError("expected a 2-D observed mask")
    if not np.any(observed):
        return np.zeros(observed.shape, dtype=np.float32)
    pad = min(96, max(1, observed.shape[1] // 2))
    wrapped = np.pad(observed, ((0, 0), (pad, pad)),
                     mode="wrap")
    return distance_transform_edt(wrapped)[:, pad:-pad].astype(np.float32)


def render_confidence(observed, classes):
    """Class-specific *render* confidence. Does not change data or QA.

    Class 2 is 'probably cloudy': strong limb attenuation over 72px.
    Class 3 is 'cloudy': moderate 52px limb fade.
    Confirmed clear, bad-QA, unobserved -> exactly zero.
    """
    valid = np.asarray(observed, dtype=bool)
    classes = np.asarray(classes)
    if valid.shape != classes.shape:
        raise ValueError("mask and cloud classes must share a WGS84 grid")
    distance = observation_distance(valid)
    certain_cloud = smoothstep01((distance - 0.5) / 52.0)
    probable_cloud = smoothstep01((distance - 8.0) / 72.0)
    confidence = np.where(classes == 3, certain_cloud,
                          np.where(classes == 2, probable_cloud, 0.0))
    confidence = np.where(valid, confidence, 0.0).astype(np.float32)
    return confidence, distance
