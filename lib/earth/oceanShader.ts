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
