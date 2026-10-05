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
uniform sampler2D baseTexture;

uniform float liveBlend;
uniform float liveStrength;
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

  return mix(fallbackCloud, currentCloud, coverage);
}

void main() {
  float c = finalCloudSignal(vUv);
  if (c < 0.003) discard;

  // Screen-space derivatives create a cheap height/normal impression from
  // cloud density without extra cloud spheres or expensive neighbour sampling.
  float softDensity = smoothstep(0.02, 0.96, c);
  float dx = dFdx(softDensity);
  float dy = dFdy(softDensity);
  vec3 reliefNormal = normalize(vec3(-dx * relief, -dy * relief, 1.0));

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float ndl = dot(N, L);
  float day = smoothstep(-0.14, 0.20, ndl);
  float sunFacing = max(ndl, 0.0);

  vec3 projectedSun = normalize(vec3(L.x, L.y, 0.72));
  float microLight = clamp(0.68 + dot(reliefNormal, projectedSun) * 0.44, 0.42, 1.28);

  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);
  float core = smoothstep(0.32, 0.92, c);

  // Blue-grey undersides, brilliant sunlit tops.
  vec3 underside = vec3(0.31, 0.37, 0.47);
  vec3 sunlit = vec3(1.045, 1.055, 1.075) * brightness;
  vec3 color = mix(underside, sunlit, day);
  color *= mix(0.82, 1.18, microLight);

  // Dense cores receive a subtle self-shadow away from sunlight.
  color *= 1.0 - (1.0 - day) * core * 0.18;

  // Silver lining and atmospheric scattering around cloud edges.
  color += vec3(0.18, 0.34, 0.66) * rim * rimStrength;
  color += vec3(1.0, 0.91, 0.76) * rim * sunFacing * 0.10;

  float alpha = smoothstep(0.025, 0.94, c) * opacity;
  alpha *= mix(0.52, 1.0, day);
  alpha = clamp(alpha, 0.0, 0.72);

  gl_FragColor = vec4(color, alpha);
}
`;
