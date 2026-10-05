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
uniform sampler2D baseTexture;

uniform float liveBlend;
uniform float liveStrength;
uniform float geoStrength;
uniform vec3 sunDirection;
uniform float opacity;
uniform float brightness;
uniform float relief;
uniform float rimStrength;

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
  float lum = luma(sampleValue.rgb);
  float maxC = max(max(sampleValue.r, sampleValue.g), sampleValue.b);
  float minC = min(min(sampleValue.r, sampleValue.g), sampleValue.b);
  float neutral = 1.0 - clamp((maxC - minC) * 1.8, 0.0, 1.0);

  // Band-13 clean IR is usable day and night. Cold/high cloud tops are the
  // bright neutral structures in the rendered clean-IR product.
  float cloud = smoothstep(0.18, 0.72, lum);
  cloud *= mix(0.78, 1.0, neutral);
  cloud *= smoothstep(0.02, 0.22, sampleValue.a);
  return clamp(cloud, 0.0, 1.0);
}

float finalCloudSignal(vec2 uv) {
  vec4 staticSample = texture2D(staticCloudTexture, uv);
  vec4 liveA = texture2D(liveTextureA, uv);
  vec4 liveB = texture2D(liveTextureB, uv);
  vec4 liveSample = mix(liveA, liveB, liveBlend);
  vec3 surface = texture2D(baseTexture, uv).rgb;

  float fallbackCloud = staticCloudSignal(staticSample);
  float currentCloud = liveCloudSignal(liveSample, surface);

  // Feather live coverage. Where the NRT swath has no usable observation,
  // smoothly fall back to the global cloud composite instead of cutting holes.
  float coverage = liveValidity(liveSample) * liveStrength;
  coverage = smoothstep(0.08, 0.92, coverage);
  float baseCloud = mix(fallbackCloud, currentCloud, coverage);

  // Geostationary fast lane. These textures are global transparent WMS
  // canvases, so validity naturally limits each satellite to its footprint.
  vec4 geoEast = texture2D(geoEastTexture, uv);
  vec4 geoWest = texture2D(geoWestTexture, uv);
  vec4 geoHimawari = texture2D(geoHimawariTexture, uv);

  float eastValidity = liveValidity(geoEast);
  float westValidity = liveValidity(geoWest);
  float himawariValidity = liveValidity(geoHimawari);

  float eastCloud = geoCloudSignal(geoEast) * eastValidity;
  float westCloud = geoCloudSignal(geoWest) * westValidity;
  float himawariCloud = geoCloudSignal(geoHimawari) * himawariValidity;

  float geoCoverage = max(eastValidity, max(westValidity, himawariValidity));
  geoCoverage = smoothstep(0.10, 0.88, geoCoverage * geoStrength);
  float geoCloud = max(eastCloud, max(westCloud, himawariCloud));

  return mix(baseCloud, max(baseCloud * 0.90, geoCloud), geoCoverage);
}

void main() {
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

  // Blue-grey undersides, brilliant sunlit tops.
  vec3 underside = vec3(0.23, 0.29, 0.39);
  vec3 sunlit = vec3(1.045, 1.055, 1.075) * brightness;
  vec3 color = mix(underside, sunlit, day);
  color *= mix(0.72, 1.28, microLight);

  // Edge-facing density receives a tiny extra bright top / dark underside cue.
  // This is deliberately subtle: it adds perceived cloud thickness without
  // adding another transparent sphere or destabilising the renderer.
  color += sunlit * slope * sunFacing * 0.18;
  color *= 1.0 - slope * (1.0 - sunFacing) * 0.18;

  // Dense cores receive a subtle self-shadow away from sunlight.
  color *= 1.0 - (1.0 - day) * core * 0.26;

  // Silver lining and atmospheric scattering around cloud edges.
  color += vec3(0.18, 0.34, 0.66) * rim * rimStrength;
  color += vec3(0.68, 0.78, 0.94) * rim * slope * 0.12;
  color += vec3(1.0, 0.92, 0.79) * rim * sunFacing * 0.14;

  float alpha = smoothstep(0.035, 0.94, c) * opacity;
  alpha *= mix(0.52, 1.0, day);
  alpha = clamp(alpha, 0.0, 0.72);
  if (alpha < 0.001) alpha = 0.0;

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
uniform sampler2D baseTexture;

uniform float liveBlend;
uniform float liveStrength;
uniform float geoStrength;
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

float cloudSignal(vec2 uv) {
  vec4 staticSample = texture2D(staticCloudTexture, uv);
  vec4 liveA = texture2D(liveTextureA, uv);
  vec4 liveB = texture2D(liveTextureB, uv);
  vec4 liveSample = mix(liveA, liveB, liveBlend);
  vec3 surface = texture2D(baseTexture, uv).rgb;

  float fallbackCloud = staticCloudSignal(staticSample);
  float currentCloud = liveCloudSignal(liveSample, surface);
  float coverage = liveValidity(liveSample) * liveStrength;
  coverage = smoothstep(0.08, 0.92, coverage);
  float baseCloud = mix(fallbackCloud, currentCloud, coverage);

  vec4 geoEast = texture2D(geoEastTexture, uv);
  vec4 geoWest = texture2D(geoWestTexture, uv);
  vec4 geoHimawari = texture2D(geoHimawariTexture, uv);

  float eastValidity = liveValidity(geoEast);
  float westValidity = liveValidity(geoWest);
  float himawariValidity = liveValidity(geoHimawari);

  float eastCloud = geoCloudSignal(geoEast) * eastValidity;
  float westCloud = geoCloudSignal(geoWest) * westValidity;
  float himawariCloud = geoCloudSignal(geoHimawari) * himawariValidity;

  float geoCoverage = max(eastValidity, max(westValidity, himawariValidity));
  geoCoverage = smoothstep(0.10, 0.88, geoCoverage * geoStrength);
  float geoCloud = max(eastCloud, max(westCloud, himawariCloud));

  return mix(baseCloud, max(baseCloud * 0.90, geoCloud), geoCoverage);
}

void main() {
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
