# CUPOLA 8.14 — homepage fallback identical to Explore while awaiting reviewed WebP

The user selected the normal interactive Explore screenshot as the visual
reference. The original live homepage iframe explicitly requested
`?embed=1&hero=sunrise` and thus selected an **editorialDawn camera**
plus nonstandard `editorialHero` cloud shader. This produced uneven dark
grey clouds and a large camera jump versus original Explore.

Until `home-cover` has an actually **science and editorial approved**
original WebP, the homepage's only iframe requests
`/explore?embed=1&captureShot=explore`. It uses exactly the normal default
`ISS CUPOLA`, `HERO_CAMERA` and `HERO_TARGET`, FOV 41 and
`EXPLORE_UNMODIFIED` cloud shader uniforms. It never enters
`editorialDawn` mode, and does not remap the real cloud pixels.

At desktop width, the iframe is fit to 100% hero height, shifted right
18% to leave room for editorial copy. This is a 1:1 aspect-preserving
viewport, **not CSS scaling of Earth's width independently**. Tablet
and mobile layouts similarly preserve proportional dimensions.
The inner WebGL surface remains invisible until the *correct* Explore
camera and GPU renderer are ready, avoiding the initial jump.

The on-demand `home-cover` still capture is unchanged: it already
uses normal Explore settings after CUPOLA 8.13. This fallback does not
approve source `visual` clouds or disguise them as satellite imagery.

Actual homepage browser QA now checks the camera distance, FOV, original
shader marker, first-frame readiness, full globe crop and WebGL pixels,
then saves its own UNAPPROVED screenshot for visual comparison. The normal
interactive Explore scene is not changed at all.
