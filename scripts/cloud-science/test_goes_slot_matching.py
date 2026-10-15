#!/usr/bin/env python3
"""Offline regression: GOES IR is paired with the observed mask scan slot."""
import fetch_goes_acmf as fetch

mask = ("OR_ABI-L2-ACMF-M6_G19_s20262882120205_"
        "e20262882129514_c20262882130199.nc")
paired = ("OR_ABI-L1b-RadF-M6C13_G19_s20262882120205_"
          "e20262882129526_c20262882149561.nc")
newer = ("OR_ABI-L1b-RadF-M6C13_G19_s20262882140205_"
         "e20262882149526_c20262882149561.nc")
prefix = "ABI-L1b-RadF/2026/288/21/"
assert abs((fetch.observation_midpoint(mask) -
            fetch.observation_midpoint(paired)).total_seconds()) < 2
assert abs((fetch.observation_midpoint(mask) -
            fetch.observation_midpoint(newer)).total_seconds()) > 1200
original = fetch.object_names
try:
    fetch.object_names = lambda _bucket, q: (
        key for key in (prefix + newer, prefix + paired) if key.startswith(q))
    assert fetch.choose_matching("noaa-goes19", mask) == prefix + paired
    fetch.object_names = lambda _bucket, q: (
        key for key in (prefix + newer,) if key.startswith(q))
    try:
        fetch.choose_matching("noaa-goes19", mask)
    except RuntimeError as error:
        assert "No same-slot" in str(error)
    else:
        raise AssertionError("Do not combine unrelated NOAA scan slots")
finally:
    fetch.object_names = original
print("PASS: NOAA GOES mask/IR capture slot matches; stale pair rejected")
