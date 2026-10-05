export const CINEMATIC_EARTH_VERTEX_SHADER = `
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

export const CINEMATIC_EARTH_FRAGMENT_SHADER = `
uniform sampler2D dayTexture;
uniform sampler2D oceanMaskTexture;
uniform vec3 sunDirection;
uniform float oceanBlue;
uniform float oceanFresnel;
uniform float oceanGlint;
uniform float daylightBoost;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturateColor(vec3 c, float amount) {
  float l = luminance(c);
  return mix(vec3(l), c, amount);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float ndl = dot(N, L);
  float day = smoothstep(-0.12, 0.22, ndl);

  vec3 albedo = texture2D(dayTexture, vUv).rgb;
  albedo = pow(albedo, vec3(0.94));
  albedo = saturateColor(albedo, 1.12);
  albedo = (albedo - 0.5) * 1.08 + 0.5;
  albedo *= vec3(1.00, 1.025, 1.08);

  float oceanMask = clamp(texture2D(oceanMaskTexture, vUv).r, 0.0, 1.0);
  oceanMask = smoothstep(0.08, 0.78, oceanMask);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 120.0) * max(ndl, 0.0);

  vec3 deepOcean = vec3(0.012, 0.10, 0.27);
  vec3 brightOcean = vec3(0.035, 0.27, 0.62);
  vec3 oceanColor = mix(deepOcean, brightOcean, clamp(fresnel * 0.72 + max(ndl, 0.0) * 0.30, 0.0, 1.0));
  oceanColor *= 0.82 + oceanBlue * 0.38;
  oceanColor += vec3(0.08, 0.24, 0.58) * fresnel * oceanFresnel;
  oceanColor += vec3(0.92, 0.96, 1.0) * spec * oceanGlint;

  vec3 landLit = albedo * (0.36 + 0.76 * max(ndl, 0.0)) * daylightBoost;
  vec3 oceanLit = oceanColor * (0.46 + 0.72 * max(ndl, 0.0));

  vec3 color = mix(landLit, oceanLit, oceanMask);

  float twilight = exp(-pow((ndl + 0.03) * 7.0, 2.0));
  color += vec3(1.0, 0.24, 0.055) * twilight * 0.055;

  float limb = pow(1.0 - max(dot(N, V), 0.0), 4.2);
  color += vec3(0.035, 0.16, 0.46) * limb * 0.17;

  color *= mix(0.055, 1.0, day);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const CINEMATIC_CLOUD_VERTEX_SHADER = `
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

export const CINEMATIC_CLOUD_FRAGMENT_SHADER = `
uniform sampler2D cloudTexture;
uniform vec3 sunDirection;
uniform float cloudOpacity;
uniform float cloudBrightness;
uniform float cloudContrast;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 tex = texture2D(cloudTexture, vUv).rgb;
  float luma = dot(tex, vec3(0.2126, 0.7152, 0.0722));

  // Use luminance only. Do not use texture alpha: this asset has opaque alpha.
  float coverage = smoothstep(0.08, 0.72, luma);
  coverage = pow(coverage, 0.82);

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(sunDirection);

  float ndl = dot(N, L);
  float day = smoothstep(-0.10, 0.18, ndl);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.7);

  float detail = clamp((luma - 0.5) * cloudContrast + 0.5, 0.0, 1.0);

  vec3 shadow = vec3(0.34, 0.40, 0.50);
  vec3 white = vec3(1.08, 1.10, 1.14) * cloudBrightness;
  vec3 color = mix(shadow, white, day);
  color *= mix(0.86, 1.16, detail);
  color += vec3(0.20, 0.34, 0.62) * rim * 0.16;
  color += vec3(1.0, 0.92, 0.82) * rim * max(ndl, 0.0) * 0.10;

  float alpha = coverage * cloudOpacity * mix(0.42, 1.0, day);
  gl_FragColor = vec4(color, alpha);
}
`;
