#!/usr/bin/env python3
"""
Independent IAU 2006/2000A celestial-to-terrestrial audit using SOFA-derived
ERFA c2t06a (not Astronomy Engine's EQJ/EQD and sidereal approximations).

This is a BOUNDED ERROR QA gate, not an arcsecond accuracy certification:
the runtime uses an equinox-based approximation and must remain opt-in.
EOP samples below are deliberately synthetic fixtures for rotation only.
"""
import datetime as dt
import json
import math
import subprocess

import erfa
import numpy as np

EPOCHS = (
    "2000-01-01T12:00:00Z",
    "2024-04-08T18:17:00Z",
    "2026-10-20T12:00:00Z",
    "2027-12-31T23:59:00Z",
    "2030-06-21T00:00:00Z",
)
# Several independent orientations, including the inertial north pole,
# near-axis directions and a generic off-axis Earth/Moon geometry.
VECTORS = (
    (149600000.0, 0.0, 0.0),
    (0.0, 384400.0, 0.0),
    (0.0, 0.0, 384400.0),
    (100000.0, -175000.0, 320000.0),
    (-120000.0, 260000.0, -180000.0),
)
EOP = {
    "mjd": 60000,
    "dut1Seconds": 0.1234,
    "xpArcsec": 0.15,
    "ypArcsec": -0.25,
    "quality": "FINAL",
}
ARCSEC_TO_RAD = math.pi / (180.0 * 3600.0)
MAX_ERROR_ARCSEC = 120.0  # release gate for approximate transform; NOT precision-certified
cases = [
    {"at": epoch, "icrfKm": list(vector), "eop": EOP}
    for epoch in EPOCHS for vector in VECTORS
]
proc = subprocess.run(
    ["node", "scripts/cloud-science/erfa_reference_bridge.mjs"],
    input=json.dumps({"cases": cases}), text=True, capture_output=True,
    check=True, timeout=30,
)
results = json.loads(proc.stdout)
if len(results) != len(cases):
    raise AssertionError("ERFA independent suite returned incomplete results")

max_error = 0.0
worst_case = None
for case, result in zip(cases, results):
    when = dt.datetime.fromisoformat(case["at"].replace("Z", "+00:00"))
    utc1, utc2 = erfa.dtf2d(
        "UTC", when.year, when.month, when.day,
        when.hour, when.minute, when.second + when.microsecond / 1e6,
    )
    tai1, tai2 = erfa.utctai(utc1, utc2)
    tt1, tt2 = erfa.taitt(tai1, tai2)
    ut11, ut12 = erfa.utcut1(utc1, utc2, EOP["dut1Seconds"])
    terrestrial = erfa.c2t06a(
        tt1, tt2, ut11, ut12,
        EOP["xpArcsec"] * ARCSEC_TO_RAD,
        EOP["ypArcsec"] * ARCSEC_TO_RAD,
    ) @ np.asarray(case["icrfKm"])
    # ITRF x Greenwich, y 90 degrees east, z north.
    # CUPOLA x Greenwich, y north, z 90 degrees west.
    expected = np.array(
        [terrestrial[0], terrestrial[2], -terrestrial[1]]
    )
    actual = np.asarray(result["cupolaKm"], dtype=float)
    if not np.isfinite(actual).all():
        raise AssertionError("Nonfinite coordinates in terrestrial renderer")
    rel_distance_error = abs(np.linalg.norm(actual) - np.linalg.norm(expected)) / np.linalg.norm(expected)
    if rel_distance_error > 1e-10:
        raise AssertionError("CUPOLA transform failed to preserve physical range")
    error_arcsec = math.degrees(math.atan2(
        np.linalg.norm(np.cross(actual, expected)),
        float(np.dot(actual, expected)),
    )) * 3600.0
    if error_arcsec > max_error:
        max_error = error_arcsec
        worst_case = {"epoch": case["at"], "vectorKm": case["icrfKm"]}
    if error_arcsec > MAX_ERROR_ARCSEC:
        raise AssertionError(
            "CUPOLA EQJ/EQD terrestrial transform exceeds independently "
            f"bounded ERFA IAU 2006/2000A error: {error_arcsec:.3f} "
            f"arcsec at {case['at']} for {case['icrfKm']}"
        )
print(json.dumps({
    "status": "PASS",
    "reference": "ERFA c2t06a IAU 2006/2000A",
    "epochCount": len(EPOCHS),
    "vectorCases": len(cases),
    "maxAngularErrorArcsec": round(max_error, 4),
    "boundArcsec": MAX_ERROR_ARCSEC,
    "worstCase": worst_case,
    "certification": "APPROXIMATE_ONLY_JPL_NOT_DEFAULT",
}, indent=2))
