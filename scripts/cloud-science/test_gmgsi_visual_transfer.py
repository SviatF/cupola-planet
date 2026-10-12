#!/usr/bin/env python3
"""NOAA GMGSI visual-only thin-cloud photographic transfer regression."""
import numpy as np
from gmgsi_visual_transfer import (
    visual_density_from_satellite_ir, grey_detail_from_satellite_ir,
)

w,h=96,80
scene=np.full((h,w),.15,dtype=np.float32)
valid=np.ones((h,w),dtype=bool)
# Actual structured radiance, not random noise/procedural clouds.
scene[25:55,40:50]=.29
scene[34:46,42:48]=.40
out=visual_density_from_satellite_ir(scene,valid)
assert out.shape==scene.shape and np.isfinite(out).all()
assert out[40,45]>.09, "small structured IR feature must survive"
assert out[12,12]<.001, "featureless low IR should not create global gray haze"
assert out[40,45]>out[40,60]+.09
assert np.max(out)<=.72
assert np.min(out)>=0

# Masked blur must not hallucinate bright cloud at an invalid IR-data edge.
valid[:10,:]=False
out2=visual_density_from_satellite_ir(scene,valid)
assert not np.any(out2[:10,:]), "no-data source pixels must remain empty"
assert out2[12,20]<.001, "no false bright line along valid footprint"
try:
    visual_density_from_satellite_ir(scene,valid[:,:-1])
    raise AssertionError("mismatched native IR/DQF accepted")
except ValueError:
    pass


# Real-structure grey mode preserves the legacy baseline and its mask.
# Two identical NOAA observations permit same-frame / same-camera A/B.
detail=grey_detail_from_satellite_ir(scene,valid)
assert detail.shape==scene.shape and np.isfinite(detail).all()
assert np.all(detail>=out2-1e-6), "real grey-detail mode must not darken old IR"
assert np.any(detail>out2+.002), "measured positive local ridges should be more visible"
assert np.max(detail)<=.72
assert not np.any(detail[:10,:]), "invalid DQF pixels must never gain signal"
assert detail[12,20]<.001, "no false bright source-footprint seam"

# Radiometrically warm, but perfectly featureless land/sea must stay as-is.
# NOAA LW intensity is NOT the physical optical depth of a cloud.
for background in (.03,.15,.30,.48,.75):
    plate=np.full((80,96),background,dtype=np.float32)
    mask=np.ones(plate.shape,dtype=bool)
    base=visual_density_from_satellite_ir(plate,mask)
    enhanced=grey_detail_from_satellite_ir(plate,mask)
    assert np.max(np.abs(base-enhanced))<.0001, (
        "uniform thermal field cannot be painted as cloud density")
# Deliberately faint structured satellite streaks should survive when their
# optical depth has NOT been inferred from raw LW radiance.
weak=np.full((120,128),.16,dtype=np.float32)
weak[20:100,42:86]=.185
weak[35:90,55:72]=.218
good=np.ones(weak.shape,dtype=bool)
base=visual_density_from_satellite_ir(weak,good)
enhanced=grey_detail_from_satellite_ir(weak,good)
assert enhanced[50,62]>base[50,62]+.004
assert enhanced[8,8]<=base[8,8]+.0001
assert np.max(enhanced)<=.72
# The DQF cut in the MIDDLE of a cloudy patch must not brighten the edge.
good[:,62:66]=False
cut=grey_detail_from_satellite_ir(weak,good)
assert not np.any(cut[:,62:66])
assert np.max(cut)<.72

print("PASS: local NOAA grey-detail preserves real structured IR, flat thermal background, masked edges and baseline")

