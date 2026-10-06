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
uniform vec3 northDirection;
uniform float intensity;
uniform float time;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  // Only ocean pixels contribute; no glow across land or the dark hemisphere.
  float water = smoothstep(0.48, 0.88, texture2D(oceanMask, vUv).r);
  if (water < 0.03) discard;

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float ndl = dot(N, L);
  float facing = max(dot(N, V), 0.0);
  float day = smoothstep(0.10, 0.28, ndl);
  if (day < 0.01 || facing < 0.06) discard;

  vec3 H = normalize(L + V);

  // Build a stable tangent frame on the ocean surface. The reflection is
  // intentionally broader east/west and tighter north/south so it reads as a
  // natural sun path rather than a circular lamp-like bloom.
  vec3 east = cross(normalize(northDirection), N);
  if (dot(east, east) < 0.0001) east = cross(vec3(0.0, 0.0, 1.0), N);
  east = normalize(east);
  vec3 northTangent = normalize(cross(N, east));

  float eastError = dot(H, east);
  float northError = dot(H, northTangent);
  float normalError = 1.0 - max(dot(N, H), 0.0);

  float widePath = exp(-(eastError * eastError * 32.0 + northError * northError * 92.0 + normalError * 26.0));
  float softCore = exp(-(eastError * eastError * 88.0 + northError * northError * 210.0 + normalError * 72.0));
  float hotCore = pow(max(dot(N, H), 0.0), 360.0);

  // Keep the center restrained. Most of the perceived highlight comes from the
  // wider shoulder, while the hottest point stays small and soft.
  float glint = (widePath * 0.075 + softCore * 0.085 + hotCore * 0.055)
    * day * water
    * smoothstep(0.06, 0.20, facing)
    * intensity;

  if (glint < 0.0008) discard;

  vec3 coolReflection = vec3(0.66, 0.82, 1.0);
  vec3 warmSun = vec3(1.0, 0.91, 0.78);
  vec3 color = mix(coolReflection, warmSun, 0.58);

  float alpha = clamp(glint * 0.20, 0.0, 0.065);
  gl_FragColor = vec4(color * glint * 0.42, alpha);
}
`;
