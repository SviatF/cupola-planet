export const LIVE_CLOUD_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const LIVE_CLOUD_FRAGMENT_SHADER = `
uniform sampler2D staticCloudTexture;
uniform sampler2D liveTextureA;
uniform sampler2D liveTextureB;
uniform sampler2D geoEastTexture;
uniform sampler2D geoWestTexture;
uniform sampler2D geoHimawariTexture;
uniform sampler2D geoMeteosatTexture;
uniform sampler2D cloudAtlasA;
uniform sampler2D cloudAtlasB;
uniform float cloudAtlasBlend;
uniform float cloudAtlasReady;
uniform float cloudIntroBlend;
uniform sampler2D v3LimbOverlayTexture;
uniform float v3LimbOverlayReady;
// V3 display-only smoothing of SOURCE transitions; original atlas data
// (especially the verified 65.6% Level-2) remains entirely unchanged.
uniform float v3SeamVisualBlend;
uniform sampler2D baseTexture;

uniform float liveBlend;
uniform float liveStrength;
uniform float geoStrength;
uniform float cloudDebugMode;
uniform vec4 geoAvailable;
uniform vec3 sunDirection;
uniform float opacity;
uniform float brightness;
uniform float relief;
uniform float rimStrength;
uniform float lunarObserver;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float staticCloudSignal(vec4 sampleValue) {
  float lum = luma(sampleValue.rgb);

  // fair_clouds_4k is a transparent cloud texture. Its RGB values outside
  // cloud coverage are not a reliable mask by themselves, so alpha must lead.
  float alphaMask = smoothstep(0.015, 0.92, sampleValue.a);
  float luminanceMask = smoothstep(0.16, 0.88, lum);

  return clamp(alphaMask * mix(0.72, 1.0, luminanceMask), 0.0, 1.0);
}

float liveValidity(vec4 s) {
  float maxC = max(max(s.r, s.g), s.b);

  // Transparent PNG no-data and opaque-black WMS gaps both become invalid.
  float alphaValid = smoothstep(0.025, 0.30, s.a);
  float radianceValid = smoothstep(0.012, 0.075, maxC);

  return alphaValid * radianceValid;
}

float liveCloudSignal(vec4 liveSample, vec3 surface) {
  float liveL = luma(liveSample.rgb);
  float surfaceL = luma(surface);

  float maxC = max(max(liveSample.r, liveSample.g), liveSample.b);
  float minC = min(min(liveSample.r, liveSample.g), liveSample.b);
  float whiteness = 1.0 - clamp(maxC - minC, 0.0, 1.0);

  // NRT true-colour clouds are bright, spectrally neutral and generally
  // brighter than the underlying Blue Marble surface.
  float brighter = liveL - surfaceL * 0.74;

  float cloud = smoothstep(0.045, 0.34, brighter);
  cloud *= smoothstep(0.34, 0.88, liveL);
  cloud *= smoothstep(0.38, 0.90, whiteness);

  return clamp(cloud, 0.0, 1.0);
}

float geoCloudSignal(vec4 sampleValue) {
  // Server returns white RGB and alpha as cloud density. Alpha 8/255
  // represents observed clear sky; zero alpha is outside the footprint.
  // Preserve fine satellite structure while avoiding hard white paint.
  // Input alpha is a heuristic IR cloud score, not calibrated cloud optical depth.
  float density = smoothstep(0.065, 0.88, sampleValue.a);
  return pow(density, 1.35) * 0.68;
}

float geoMaskCoverage(vec4 sampleValue) {
  // RGBA alpha 8/255 means observed CLEAR sky, 0 means missing imagery.
  return smoothstep(0.001, 0.029, sampleValue.a);
}

// Multi-scale footprint confidence. Centre pixel must be valid, while
// nearby no-data reduces the transition weight BEFORE compositing.
// This avoids hard rectangular gaps and satellite-disk edges.
float geoFootprintConfidence(sampler2D tex, vec2 uv) {
  vec2 nearPx = vec2(12.0 / 2048.0, 12.0 / 1024.0);
  vec2 farPx = vec2(32.0 / 2048.0, 32.0 / 1024.0);
  float center = geoMaskCoverage(texture2D(tex, uv));
  float around = (
    geoMaskCoverage(texture2D(tex, uv + vec2(nearPx.x, 0.0))) +
    geoMaskCoverage(texture2D(tex, uv - vec2(nearPx.x, 0.0))) +
    geoMaskCoverage(texture2D(tex, uv + vec2(0.0, nearPx.y))) +
    geoMaskCoverage(texture2D(tex, uv - vec2(0.0, nearPx.y))) +
    geoMaskCoverage(texture2D(tex, uv + vec2(farPx.x, 0.0))) +
    geoMaskCoverage(texture2D(tex, uv - vec2(farPx.x, 0.0))) +
    geoMaskCoverage(texture2D(tex, uv + vec2(0.0, farPx.y))) +
    geoMaskCoverage(texture2D(tex, uv - vec2(0.0, farPx.y)))
  ) * 0.125;
  return center * smoothstep(0.26, 0.92, around);
}

float finalCloudSignal(vec2 uv) {
  // STRICT LIVE: only observed geostationary cloud atlas. Unobserved is clear.
  vec4 atlas = mix(texture2D(cloudAtlasA, uv), texture2D(cloudAtlasB, uv), cloudAtlasBlend);
  // IMPORTANT: atlas.r is already rendered cloud density; atlas.g is
  // observation/QA confidence, NOT an opacity multiplier.  The previous
  // smoothstep(0.002, 0.085, g) nearly erased valid GOES/Himawari pixels
  // with G=1/255 at their disk boundaries while adjacent WMS/GFS pixels
  // stayed bright. Even identical R values rendered as a giant black seam.
  // Treat any nonzero observed footprint as present; the GPU's bilinear
  // interpolation supplies subpixel antialiasing where G approaches zero.
  // No scientific atlas RGBA bytes or classified clear skies are modified.
  float coverage = smoothstep(0.0, 1.0 / 255.0, atlas.g) * cloudAtlasReady;
  float density = clamp(atlas.r * coverage, 0.0, 1.0);
  // A faint but REAL IR/WMS pixel must not disappear when passed through
  // the cloud alpha curve on the night side. Only supplemental satellite
  // visualization IDs 224/232/248 receive a very restrained transfer.
  // The native L2 signal, including its validated clear R=0, is untouched;
  // forecast GFS B=255 is also left unchanged. Zero remains exact zero.
  float src = floor(atlas.b * 255.0 + 0.5);
  float visualSatellite = step(223.5, src) * (1.0 - step(254.5, src));
  float wispy = mix(density, sqrt(density), 0.17);
  float visible = mix(density, wispy, visualSatellite);

  // V3 preview: default GPU source-edge correction must NEVER darken a
  // verified bright cloud into a black ribbon or smear it across 20 pixels.
  // Compare ?cloudSeams=wide (old symmetric 20px crossfade) with the new
  // non-darkening 4px treatment, or ?cloudSeams=legacy (no final correction).
  // This is DISPLAY ONLY; native L2 and source metadata are not touched.
  if (v3SeamVisualBlend > 0.5) {
    float wide = step(1.5,v3SeamVisualBlend);
    vec2 spread = vec2(mix(2.0,10.0,wide) / 2048.0, 0.0);
    vec2 uvl = vec2(fract(uv.x - spread.x), clamp(uv.y,0.0,1.0));
    vec2 uvr = vec2(fract(uv.x + spread.x), clamp(uv.y,0.0,1.0));
    vec4 leftAtlas = mix(texture2D(cloudAtlasA,uvl),
                         texture2D(cloudAtlasB,uvl),cloudAtlasBlend);
    vec4 rightAtlas = mix(texture2D(cloudAtlasA,uvr),
                          texture2D(cloudAtlasB,uvr),cloudAtlasBlend);
    float sourcesDiffer = step(16.0 / 255.0,
                               abs(leftAtlas.b - rightAtlas.b));
    float bothSourced = step(0.5 / 255.0,leftAtlas.g) *
                        step(0.5 / 255.0,rightAtlas.g);
    float leftDensity = leftAtlas.r * smoothstep(0.0,1.0/255.0,leftAtlas.g);
    float rightDensity = rightAtlas.r * smoothstep(0.0,1.0/255.0,rightAtlas.g);
    float oldTarget = (leftDensity + rightDensity) * 0.5;
    float narrowTarget = max(visible,max(leftDensity,rightDensity));
    float target = mix(narrowTarget,oldTarget,wide);
    visible = mix(visible,target,
      sourcesDiffer * bothSourced * mix(0.20,0.62,wide));
  }
  // The independent IR preview contains only real NOAA pixels at their
  // original coordinates in the poor-viewing-angle L2 rim. The strict
  // science/provenance atlas and classified-clear values remain untouched.
  if (v3LimbOverlayReady > 0.5) {
    vec4 limb = texture2D(v3LimbOverlayTexture, uv);
    // Symmetric source crossover: this MUST be a two-way mix. max() can
    // only brighten L2 and is the reason the old NOAA/L2 rectangular border
    // survived every "grey detail" and tone-matching experiment.
    // Use the exact same 0.17 wispy transfer as GMGSI in the main atlas.
    float satelliteIr = mix(limb.r, sqrt(max(limb.r, 0.0)), 0.17);
    visible = mix(visible, satelliteIr, clamp(limb.g, 0.0, 1.0));
  }
  // First-paint placeholder is a clearly non-scientific static cloud
  // texture, replaced over 900ms once the first observed V3 raster arrives.
  float preview = staticCloudSignal(texture2D(staticCloudTexture, uv));
  return mix(preview, clamp(visible, 0.0, 1.0), clamp(cloudIntroBlend, 0.0, 1.0));
}

void main() {
  // Visual-only QA map of the EXACT lighting falloff used below.
  // It cannot alter the cloud atlas, clouds, shadows or the CINEMA renderer.
  if (cloudDebugMode > 4.5) {
    float ndl = dot(normalize(vWorldNormal), normalize(sunDirection));
    float dayWeight = smoothstep(-0.14, 0.20, ndl);
    vec3 qaNight = vec3(0.07, 0.14, 0.25);
    vec3 qaDay = vec3(0.77, 0.87, 0.95);
    gl_FragColor = vec4(mix(qaNight, qaDay, dayWeight), 0.68);
    return;
  }
  // Nearest-texel source provenance: bilinear B interpolation invents
  // bogus source codes *on the very borders we need to investigate*.
  // Keep native scientific metadata byte-for-byte intact; this is paint
  // on the debug viewport only, not a cloud/opacity transfer.
  if (cloudDebugMode > 3.5) {
    vec2 qaUv = (floor(vUv * vec2(2048.0, 1024.0)) + 0.5) /
      vec2(2048.0, 1024.0);
    vec4 atlas = mix(texture2D(cloudAtlasA, qaUv),
                     texture2D(cloudAtlasB, qaUv), cloudAtlasBlend);
    float id = floor(atlas.b * 255.0 + 0.5);
    float observed = step(0.5 / 255.0, atlas.g) * cloudAtlasReady;
    vec3 source = vec3(0.24, 0.26, 0.31);  // no source
    if (observed > 0.5) {
      if (abs(id - 255.0) < 0.5)
        source = vec3(0.66, 0.37, 0.94);  // GFS forecast, NOT satellite
      else if (abs(id - 232.0) < 0.5)
        source = vec3(0.12, 0.83, 0.85);  // NOAA GMGSI IR, visual only
      else if (abs(id - 224.0) < 0.5 || abs(id - 248.0) < 0.5)
        source = vec3(1.00, 0.73, 0.21);  // Meteosat WMS visual
      else
        source = vec3(0.95, 0.28, 0.33);  // native verified/archived L2
    }
    gl_FragColor = vec4(source, 0.72);
    return;
  }
  float c = finalCloudSignal(vUv);

  // Screen-space derivatives create a cheap height/normal impression from
  // cloud density without extra cloud spheres or expensive neighbour sampling.
  float softDensity = smoothstep(0.02, 0.96, c);
  float dx = dFdx(softDensity);
  float dy = dFdy(softDensity);
  float slope = clamp(length(vec2(dx, dy)) * relief * 3.2, 0.0, 1.0);
  vec3 reliefNormal = normalize(vec3(-dx * relief, -dy * relief, 1.0));

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float ndl = dot(N, L);
  float day = smoothstep(-0.14, 0.20, ndl);
  float sunFacing = max(ndl, 0.0);

  vec3 projectedSun = normalize(vec3(L.x, L.y, 0.72));
  float microLight = clamp(0.64 + dot(reliefNormal, projectedSun) * 0.56, 0.34, 1.40);

  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);
  float core = smoothstep(0.32, 0.92, c);

  // Photographic day-side diffuse cloud, subtly moonlit-looking night-side
  // clouds. Do not brighten a full IR mask as though it were a white decal.
  vec3 underside = vec3(0.115, 0.145, 0.195);
  vec3 sunlit = vec3(0.85, 0.89, 0.95) * brightness;
  vec3 color = mix(underside, sunlit, day);
  color *= mix(0.87, 1.10, microLight);

  // Edge-facing density receives a tiny extra bright top / dark underside cue.
  // This is deliberately subtle: it adds perceived cloud thickness without
  // adding another transparent sphere or destabilising the renderer.
  color += sunlit * slope * sunFacing * 0.075;
  color *= 1.0 - slope * (1.0 - sunFacing) * 0.18;

  // Dense cores receive a subtle self-shadow away from sunlight.
  color *= 1.0 - (1.0 - day) * core * 0.26;

  // Silver lining and atmospheric scattering around cloud edges.
  color += vec3(0.18, 0.34, 0.66) * rim * rimStrength;
  color += vec3(0.68, 0.78, 0.94) * rim * slope * 0.12;
  color += vec3(1.0, 0.92, 0.79) * rim * sunFacing * 0.14;

  float alpha = pow(smoothstep(0.012, 0.87, c), 1.28) * opacity;
  alpha *= mix(0.34, 0.88, day);
  alpha = clamp(alpha, 0.0, 0.56);
  if (alpha < 0.001) alpha = 0.0;

  // Moon-camera truth: cloud pixels can never glow across Earth's solar
  // terminator. Use EXACTLY the shared UTC Sun direction used by the lunar
  // surface shader. Keep accepted V3 cloud data, masks, and all normal
  // Earth/CINEMA rendering unchanged; this is display-only and view-scoped.
  float lunarDay=smoothstep(-0.00475,0.0060,ndl);
  float lunarMask=mix(1.0,lunarDay,lunarObserver);
  color*=lunarMask;
  alpha*=lunarMask;
  gl_FragColor = vec4(color, alpha);
}
`;


export const LIVE_CLOUD_SHADOW_FRAGMENT_SHADER = `
uniform sampler2D staticCloudTexture;
uniform sampler2D liveTextureA;
uniform sampler2D liveTextureB;
uniform sampler2D geoEastTexture;
uniform sampler2D geoWestTexture;
uniform sampler2D geoHimawariTexture;
uniform sampler2D geoMeteosatTexture;
uniform sampler2D cloudAtlasA;
uniform sampler2D cloudAtlasB;
uniform float cloudAtlasBlend;
uniform float cloudAtlasReady;
uniform float cloudIntroBlend;
uniform sampler2D v3LimbOverlayTexture;
uniform float v3LimbOverlayReady;
uniform sampler2D baseTexture;

uniform float liveBlend;
uniform float liveStrength;
uniform float geoStrength;
uniform float cloudDebugMode;
uniform vec4 geoAvailable;
uniform vec3 sunDirection;
uniform float shadowStrength;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float staticCloudSignal(vec4 sampleValue) {
  float lum = luma(sampleValue.rgb);
  float alphaMask = smoothstep(0.015, 0.92, sampleValue.a);
  float luminanceMask = smoothstep(0.16, 0.88, lum);
  return clamp(alphaMask * mix(0.72, 1.0, luminanceMask), 0.0, 1.0);
}

float liveValidity(vec4 s) {
  float maxC = max(max(s.r, s.g), s.b);
  float alphaValid = smoothstep(0.025, 0.30, s.a);
  float radianceValid = smoothstep(0.012, 0.075, maxC);
  return alphaValid * radianceValid;
}

float liveCloudSignal(vec4 liveSample, vec3 surface) {
  float liveL = luma(liveSample.rgb);
  float surfaceL = luma(surface);
  float maxC = max(max(liveSample.r, liveSample.g), liveSample.b);
  float minC = min(min(liveSample.r, liveSample.g), liveSample.b);
  float whiteness = 1.0 - clamp(maxC - minC, 0.0, 1.0);
  float brighter = liveL - surfaceL * 0.74;
  float cloud = smoothstep(0.045, 0.34, brighter);
  cloud *= smoothstep(0.34, 0.88, liveL);
  cloud *= smoothstep(0.38, 0.90, whiteness);
  return clamp(cloud, 0.0, 1.0);
}

float geoCloudSignal(vec4 sampleValue) {
  // Server returns white RGB and alpha as cloud density. Alpha 8/255
  // represents observed clear sky; zero alpha is outside the footprint.
  // Preserve fine satellite structure while avoiding hard white paint.
  // Input alpha is a heuristic IR cloud score, not calibrated cloud optical depth.
  float density = smoothstep(0.065, 0.88, sampleValue.a);
  return pow(density, 1.35) * 0.68;
}

float geoMaskCoverage(vec4 sampleValue) {
  // RGBA alpha 8/255 means observed CLEAR sky, 0 means missing imagery.
  return smoothstep(0.001, 0.029, sampleValue.a);
}

// Multi-scale footprint confidence. Centre pixel must be valid, while
// nearby no-data reduces the transition weight BEFORE compositing.
// This avoids hard rectangular gaps and satellite-disk edges.
float geoFootprintConfidence(sampler2D tex, vec2 uv) {
  // The server has already feathered the PNG footprint. Use its alpha here
  // instead of repeating expensive multi-tap lookups for every shadow tap.
  return geoMaskCoverage(texture2D(tex, uv));
}

float cloudSignal(vec2 uv) {
  // STRICT LIVE: only observed geostationary cloud atlas. Unobserved is clear.
  vec4 atlas = mix(texture2D(cloudAtlasA, uv), texture2D(cloudAtlasB, uv), cloudAtlasBlend);
  // IMPORTANT: atlas.r is already rendered cloud density; atlas.g is
  // observation/QA confidence, NOT an opacity multiplier.  The previous
  // smoothstep(0.002, 0.085, g) nearly erased valid GOES/Himawari pixels
  // with G=1/255 at their disk boundaries while adjacent WMS/GFS pixels
  // stayed bright. Even identical R values rendered as a giant black seam.
  // Treat any nonzero observed footprint as present; the GPU's bilinear
  // interpolation supplies subpixel antialiasing where G approaches zero.
  // No scientific atlas RGBA bytes or classified clear skies are modified.
  float coverage = smoothstep(0.0, 1.0 / 255.0, atlas.g) * cloudAtlasReady;
  float density = clamp(atlas.r * coverage, 0.0, 1.0);
  // A faint but REAL IR/WMS pixel must not disappear when passed through
  // the cloud alpha curve on the night side. Only supplemental satellite
  // visualization IDs 224/232/248 receive a very restrained transfer.
  // The native L2 signal, including its validated clear R=0, is untouched;
  // forecast GFS B=255 is also left unchanged. Zero remains exact zero.
  float src = floor(atlas.b * 255.0 + 0.5);
  float visualSatellite = step(223.5, src) * (1.0 - step(254.5, src));
  float wispy = mix(density, sqrt(density), 0.17);
  float observed = mix(density, wispy, visualSatellite);
  float preview = staticCloudSignal(texture2D(staticCloudTexture, uv));
  return mix(preview, observed, clamp(cloudIntroBlend, 0.0, 1.0));
}

void main() {
  // Source/terminator QA renders provenance or light angle on the cloud
  // sphere itself, without adding unrelated photographic ground shadows.
  if (cloudDebugMode > 3.5) discard;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(sunDirection);

  float ndl = dot(N, L);
  float daylight = smoothstep(0.015, 0.24, ndl);
  if (daylight <= 0.001) discard;

  // Project the same NRT cloud field a tiny distance toward the surface.
  // Low sun produces a slightly longer offset, while midday shadows sit close
  // beneath the cloud body.
  vec2 sunTangent = vec2(-L.z, L.x);
  float tangentLen = max(length(sunTangent), 0.0001);
  sunTangent /= tangentLen;

  float lowSun = 1.0 - clamp(ndl, 0.0, 1.0);
  float shadowOffset = mix(0.0012, 0.0046, lowSun);
  vec2 shadowUv = vUv + sunTangent * shadowOffset;

  // Five-tap blur keeps the shadow photographic and avoids a duplicate hard
  // cloud silhouette on the ground.
  vec2 px = vec2(1.5 / 2048.0, 1.5 / 1024.0);
  float c = cloudSignal(shadowUv) * 0.34;
  c += cloudSignal(shadowUv + vec2(px.x, 0.0)) * 0.12;
  c += cloudSignal(shadowUv - vec2(px.x, 0.0)) * 0.12;
  c += cloudSignal(shadowUv + vec2(0.0, px.y)) * 0.12;
  c += cloudSignal(shadowUv - vec2(0.0, px.y)) * 0.12;
  c += cloudSignal(shadowUv + vec2(px.x, px.y)) * 0.045;
  c += cloudSignal(shadowUv + vec2(-px.x, px.y)) * 0.045;
  c += cloudSignal(shadowUv + vec2(px.x, -px.y)) * 0.045;
  c += cloudSignal(shadowUv + vec2(-px.x, -px.y)) * 0.045;
  // Match the narrow real-IR limb supplement in ground shadows with only
  // one extra sample, avoiding a costly ninth duplicate overlay lookup.
  if (v3LimbOverlayReady > 0.5) {
    vec4 limb = texture2D(v3LimbOverlayTexture, shadowUv);
    // Match the two-way visual crossover: a darker measured IR pixel
    // must also be allowed to REDUCE the shadow during the source handoff.
    float satelliteIr = mix(limb.r, sqrt(max(limb.r, 0.0)), 0.17);
    c = mix(c, satelliteIr, clamp(limb.g, 0.0, 1.0));
  }

  float dense = smoothstep(0.08, 0.76, c);
  float soft = smoothstep(0.018, 0.60, c);

  // Dense cloud systems cast more shadow, thin cloud remains barely visible.
  float alpha = (soft * 0.52 + dense * 0.72) * daylight * shadowStrength;
  alpha *= mix(0.88, 1.0, clamp(ndl, 0.0, 1.0));
  alpha = clamp(alpha, 0.0, 0.42);

  vec3 shadowColor = vec3(0.0025, 0.006, 0.014);
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(shadowColor, alpha);
}
`;
