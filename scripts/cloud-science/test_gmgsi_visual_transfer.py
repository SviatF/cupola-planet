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

# Africa/southern-ocean regression: real coherent GREY structures whose
# NOAA LW signal is below the old 0.22 core threshold. The earlier transfer
# nearly erased these fine layered clouds before they reached the shader.
# A cold/cloudy-class assertion is NOT made: GMGSI remains visual IR only.
weak=np.full((96,128),.15,dtype=np.float32)
weak[20:75,40:88]=.215
weak[30:65,50:78]=.225
weak_mask=np.ones_like(weak,dtype=bool)
subtle=visual_density_from_satellite_ir(weak,weak_mask)
assert subtle[30,41]>.025, "real low-contrast measured IR contour must stay visible"
assert subtle[40,70]>.019, "broader faint structured IR must survive"
assert subtle[5,5]<.001, "featureless African background must remain transparent"
assert subtle[40,70]<subtle[30,41]+.05, "avoid solid gray rectangle"
assert np.max(subtle)<.25, "weak structured IR must not become opaque white"

# Source DQF must be checked at the local pixel; NEVER carry a bright
# neighbor into missing satellite footprint during masked convolution.
weak_mask[:,62:66]=False
missing=visual_density_from_satellite_ir(weak,weak_mask)
assert not np.any(missing[:,62:66]), "no synthetic cloud at invalid swath pixels"

# Strong source cloud cores remain capped and are NOT the target of this fix.
bright=np.full((96,128),.92,dtype=np.float32)
dense=visual_density_from_satellite_ir(bright,np.ones_like(bright,dtype=bool))
assert .67<=dense[50,50]<=.72, "strong cloud stays restrained and uniform"

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
