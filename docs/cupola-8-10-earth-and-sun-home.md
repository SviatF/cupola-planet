# CUPOLA 8.10 — one physical Sun, day/night Earth and city lights in the homepage

The 8.9 hero correctly displays a complete Earth at 4.30 Earth radii, but its
41-degree vertical lens cannot show the *actual* solar disk: for the chosen
~40%-day phase the solar line-of-sight is ~78 degrees from Earth's center.
Moving CSS or painting a Sun icon would be misleading.

## Wide desktop optically accurate solution

For the existing `/explore?embed=1&hero=sunrise` route with actual
WebGL camera aspect >= 1.85:

- Use a real **70-degree vertical** WebGL perspective camera and change the
  orbital observation distance to **3.10 Earth radii**.
- Preserve an actually sunlit **~30%** visible hemisphere and a **~70%** actual
  night hemisphere where NASA VIIRS/Black Marble city light emission is shown
  by the normal night shader.
- Rotate the optical axis **34 degrees** toward the exact same
  UTC solar vector controlling the Sun mesh, cloud lighting and terminator.
  Roll 8 degrees for a moderate sunrise diagonal.
- The physical solar disc should appear in the visible **right edge of the
  outer home header**, not merely inside the inner 3D iframe frustum.
- Earth shifts toward the middle-right, retains readable apparent size and
  leaves the editorial text column unobstructed. No synthetic Sun, CSS
  overlay, invented city pixels, brightness-increased VIIRS or altered cloud
  input.

Tablet and mobile (camera aspect < 1.85) keep the proven CUPOLA 8.9
4.30R / 41-degree globe composition, because even a wide lens cannot
fit both the real Sun and a centered Earth in narrow aspect ratios without
losing the text or the globe.

## Isolation / QA

This changes only the embedded homepage's actual camera, not the normal
interactive Explore viewer, independent Moon/Sun astronomy, Atlas 4.15R
still captures or 8s Home WebM. Explicit `heroShot=twilight` reproduces
the 8.9 composition, while `heroShot=daylit` and `classic` retain
their earlier A/B cameras.

The automated mathematical test checks multiple Sun vectors (including
near-polar), true solar angular separation, globe full-disk placement,
night/day fraction and the **outer iframe crop** at actual production sizes.
The post-deploy browser QA samples the actual GPU scene's measured solar
projection and only passes if the real Sun is inside the visible outer hero;
it archives a review screenshot without publishing to R2.

One limitation: apparent Sun size is physically very small at realistic
angular diameter; lens bloom remains generated from original Sun pixels,
not an artificially positioned graphic. Final visual art direction should
be reviewed against the real browser screenshot.
