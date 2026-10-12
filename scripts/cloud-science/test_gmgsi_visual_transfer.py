#!/usr/bin/env python3
"""NOAA GMGSI visual-only thin-cloud photographic transfer regression."""
import numpy as np
from gmgsi_visual_transfer import visual_density_from_satellite_ir

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

print("PASS: thin-real-IR structured gray survives, flat background remains dark, invalid coverage protected")
