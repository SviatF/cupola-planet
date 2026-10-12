"""Continuous cloud-observation confidence across independent GEO satellites.

All inputs describe ACTUAL satellite observations. A missing pixel must be
represented by 0, never an interpolated non-zero confidence.
"""
import numpy as np


def combine_view_confidence(east, west):
    """Smooth union of two per-observation confidence maps in [0, 1].

    1-(1-E)*(1-W) has no derivative cusp where the better satellite changes.
    No physical observations are manufactured: if E=W=0, output is exactly 0.
    """
    east = np.asarray(east, dtype=np.float32)
    west = np.asarray(west, dtype=np.float32)
    if east.shape != west.shape:
        raise ValueError("GOES observation confidence shapes differ")
    if not (np.all(np.isfinite(east)) and np.all(np.isfinite(west))):
        raise ValueError("Non-finite GOES observation confidence")
    if (np.any(east < 0) or np.any(west < 0) or
            np.any(east > 1) or np.any(west > 1)):
        raise ValueError("GOES observation confidence outside [0, 1]")
    return (1 - (1 - east) * (1 - west)).astype(np.float32)


if __name__ == "__main__":
    e = np.linspace(0, 1, 1001, dtype=np.float32)
    w = e[::-1].copy()
    combined = combine_view_confidence(e, w)
    assert combined[0] == 1 and combined[-1] == 1
    assert np.max(np.abs(np.diff(np.diff(combined.astype(np.float64))))) < 0.0001
    assert np.array_equal(combine_view_confidence(np.zeros(10), np.zeros(10)), np.zeros(10))
    assert np.all(combine_view_confidence(e, w) >= np.maximum(e, w) - 1e-6)
    print("VIEW CONFIDENCE SMOOTHNESS AND MISSING-DATA SAFETY VERIFIED")
