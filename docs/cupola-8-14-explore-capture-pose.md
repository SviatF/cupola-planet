# CUPOLA 8.14 — stable original Explore WebP capture

## Failure verified
Production workflow #40539092677 failed at render.mjs:96 with `page.waitForFunction: Timeout 70000ms exceeded`. Artifact contained no WebP.

## Technical cause and fix
Previously `Canvas.onCreated` marked the Explore reference camera after only 12 WebGL frames, before OrbitControls had necessarily aimed at the Earth center. The stored projected coordinates could therefore be stale even though the browser later showed the correct Earth.

- Capture-only `Scene.useFrame` now reads the actual OrbitControls camera, target, 41-degree FOV and Earth's projection on each render frame.
- Stamps Explore metadata only after 12 consecutive stable frames, with both eye and target within 0.03 scene units of the native Explore preset.
- Captures real camera diagnostics on timeout. A timeout never becomes a fake frame.
- Science gate separately checks stability, real GPU L2 source, freshness, scene revision and image hashes. Capture does not publish anything.
- The one-shot GitHub workflow runs against the matching Cloudflare commit, stores an UNAPPROVED WebP plus scientific assessment, never writes R2 or approves the editorial manifest.

## Visual acceptance
Compare the actual `home-cover.webp` to the user's original Explore screenshot, particularly Earth shape, Sun on the left and native night cloud shader. Keep static poster unpublished if the scene or provenance is unsatisfactory.