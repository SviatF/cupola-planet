# CUPOLA 8.9 — real night lights and morning limb in one homepage header

The homepage iframe used the previous **1.56 Earth radii** dawn camera, even after CUPOLA 8.8 had widened the **separate Earth Atlas capture preset**. That is why the homepage still displayed a giant cropped globe and visibly enlarged Cloud V3 pixels.

This version adds a separate `editorialTwilightHeroCamera` at **4.30 Earth radii** for the embedded homepage route `/explore?embed=1&hero=sunrise` only. The camera tracks the same real UTC Sun used by the Earth terminator, clouds and city lights. Approximate projected solar phase: **40% day / 60% night**; morning illumination is on the right-hand limb, with the night side available for actual city-light radiance.

No synthetic sun, fake lights or new observed cloud pixels are added. Existing daily NASA VIIRS input and Black Marble fallback remain source-labelled independently. Clouds can occlude individual lights and orbital geometry cannot guarantee any particular city appears in a given frame.

The 41-degree WebGL perspective and the existing desktop/tablet/mobile iframe cropping produce a globe almost filling the desktop hero height without cutting off the top/bottom. The mobile globe remains in the upper region above text. New tests mathematically verify the composition.

A/B routes `/explore?embed=1&hero=sunrise&heroShot=daylit` and `heroShot=classic` retain the previous cameras. The normal `/explore`, scientific Atlas capture (`capture=1`), and Home WebM are unchanged.

Validation: `node scripts/seo/test_twilight_home_hero.mjs`, full Next.js type/build and Cloudflare build. The production screenshot still needs browser QA after deployment.
