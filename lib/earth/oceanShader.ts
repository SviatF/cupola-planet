export const OCEAN_VERTEX_SHADER = `
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

export const OCEAN_FRAGMENT_SHADER = `
uniform sampler2D oceanMask;
uniform vec3 sunDirection;
uniform float opacity;
uniform float fresnelStrength;
uniform float glintStrength;
uniform float blueStrength;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  float mask = texture2D(oceanMask, vUv).r;
  mask = smoothstep(0.18, 0.72, mask);

  if (mask < 0.01) discard;

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float ndl = max(dot(N, L), 0.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);

  vec3 H = normalize(L + V);
  float glint = pow(max(dot(N, H), 0.0), 180.0) * ndl;

  float horizonBlue = pow(1.0 - max(dot(N, V), 0.0), 2.0);

  vec3 deep = vec3(0.006, 0.055, 0.16);
  vec3 mid = vec3(0.012, 0.18, 0.42);
  vec3 cyan = vec3(0.05, 0.42, 0.78);

  vec3 color = mix(deep, mid, clamp(ndl * 0.82 + 0.12, 0.0, 1.0));
  color += cyan * fresnel * fresnelStrength * blueStrength;
  color += vec3(0.42, 0.70, 1.0) * horizonBlue * 0.10 * blueStrength;
  color += vec3(1.0, 0.92, 0.76) * glint * glintStrength;

  float alpha = mask * opacity;
  alpha += mask * fresnel * 0.10;
  alpha += mask * glint * 0.14;
  alpha = clamp(alpha, 0.0, 0.72);

  gl_FragColor = vec4(color, alpha);
}
`;


// Specular glint drawn as a very thin additive shell on the existing ocean mask.
// World-space normals make the highlight follow the actual sun and camera,
// while a latitude-aware ripple subtly breaks the reflection into a sun path.
export const OCEAN_SUN_GLINT_VERTEX_SHADER = `
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

export const OCEAN_SUN_GLINT_FRAGMENT_SHADER = `
uniform sampler2D oceanMask;
uniform vec3 sunDirection;
uniform float intensity;
uniform float time;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float waveNoise(vec2 uv) {
  vec2 p = uv * vec2(410.0, 185.0);
  float a = sin(p.x * 1.31 + sin(p.y * 0.83));
  float b = sin(p.x * 2.67 - p.y * 1.75);
  float c = sin(p.y * 3.90 + p.x * 0.57);
  return a * 0.50 + b * 0.32 + c * 0.18;
}

void main() {
  // The Earth specular map is bright over oceans and dark over land.
  float water = smoothstep(0.26, 0.80, texture2D(oceanMask, vUv).r);
  if (water < 0.012) discard;

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float facing = max(dot(N, V), 0.0);
  float ndl = dot(N, L);
  float day = smoothstep(0.025, 0.18, ndl);
  if (day < 0.003 || facing < 0.025) discard;

  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float sunPath = pow(ndh, 20.0);
  float softLobe = pow(ndh, 54.0);
  float hotCore = pow(ndh, 210.0);

  // Ripple breakup; strongest around the reflection center, never an
  // independently glowing water pattern on dark oceans.
  float waves = waveNoise(vUv + vec2(time * 0.000018, time * 0.000009));
  float textureBreakup = mix(0.77, 1.17, clamp(waves * 0.5 + 0.5, 0.0, 1.0));
  float glint = (sunPath * 0.18 + softLobe * 0.44 + hotCore * 0.72)
    * textureBreakup * day * water;

  float rimGate = smoothstep(0.025, 0.14, facing);
  glint *= rimGate * intensity;
  vec3 warmSun = vec3(1.0, 0.87, 0.69);
  vec3 paleReflection = vec3(0.66, 0.83, 1.0);
  vec3 glintColor = mix(paleReflection, warmSun, 0.67 + 0.27 * hotCore);

  // Leave the existing cinematic ocean, city lights and atmospheric rim intact.
  float alpha = clamp(glint * 0.40, 0.0, 0.48);
  gl_FragColor = vec4(glintColor * glint * 1.35, alpha);
}
`;
