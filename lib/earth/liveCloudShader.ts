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
uniform sampler2D liveTexture;
uniform sampler2D baseTexture;
uniform vec3 sunDirection;
uniform vec2 texelSize;
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

float cloudSignal(vec2 uv) {
  vec4 liveSample = texture2D(liveTexture, uv);
  vec3 live = liveSample.rgb;
  vec3 base = texture2D(baseTexture, uv).rgb;

  // GIBS PNG uses transparency for no-data / outside satellite swaths.
  // Reject those pixels before any cloud classification.
  if (liveSample.a < 0.05) return 0.0;

  float liveL = luma(live);
  float baseL = luma(base);

  float maxC = max(max(live.r, live.g), live.b);
  float minC = min(min(live.r, live.g), live.b);
  float whiteness = 1.0 - clamp(maxC - minC, 0.0, 1.0);

  float brighterThanSurface = liveL - baseL * 0.76;

  // Smooth cloud likelihood: no binary threshold, no alpha assumptions.
  float signal = smoothstep(0.08, 0.40, brighterThanSurface);
  signal *= smoothstep(0.46, 0.94, liveL);
  signal *= smoothstep(0.58, 0.96, whiteness);
  signal *= smoothstep(0.08, 0.65, liveSample.a);

  // Keep real cloud bands while suppressing most bright terrain/snow.
  return clamp(signal, 0.0, 1.0);
}

void main() {
  float c = cloudSignal(vUv);
  if (c < 0.002) discard;

  float cx1 = cloudSignal(vUv + vec2(texelSize.x, 0.0));
  float cx0 = cloudSignal(vUv - vec2(texelSize.x, 0.0));
  float cy1 = cloudSignal(vUv + vec2(0.0, texelSize.y));
  float cy0 = cloudSignal(vUv - vec2(0.0, texelSize.y));

  vec3 localRelief = normalize(vec3(
    (cx0 - cx1) * relief,
    (cy0 - cy1) * relief,
    1.0
  ));

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float sunBase = max(dot(N, L), 0.0);
  float reliefLight = clamp(0.62 + dot(localRelief, normalize(vec3(L.xy, 0.72))) * 0.52, 0.28, 1.28);
  float day = smoothstep(-0.12, 0.18, dot(N, L));

  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);

  // Denser cloud cores are whiter; edges retain cool atmospheric depth.
  vec3 shadow = vec3(0.38, 0.44, 0.54);
  vec3 white = vec3(1.02, 1.035, 1.06) * brightness;
  vec3 color = mix(shadow, white, day);
  color *= mix(0.72, 1.20, reliefLight);
  color += vec3(0.16, 0.30, 0.58) * rim * rimStrength;
  color += vec3(1.0, 0.92, 0.80) * rim * sunBase * 0.08;

  // Fake underside shadow gives thickness without extra shells.
  float core = smoothstep(0.25, 0.88, c);
  color *= 1.0 - (1.0 - day) * core * 0.16;

  float alpha = c * opacity;
  alpha *= mix(0.42, 1.0, day);
  alpha = clamp(alpha, 0.0, 0.76);

  gl_FragColor = vec4(color, alpha);
}
`;
