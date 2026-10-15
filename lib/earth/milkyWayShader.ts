/**
 * Cinematic, synthetic approximation of the Galactic plane — not a Gaia
 * catalogue or astronomical photograph. Smooth, band-limited value noise
 * replaces the old nearest-cell hash, which produced visible square tiles.
 * Galactic pole / center orientations are updated from sidereal time.
 */
export const MILKY_WAY_VERTEX_SHADER = `
varying vec3 skyDirection;
void main() {
  skyDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const MILKY_WAY_FRAGMENT_SHADER = `
precision highp float;
uniform vec3 galacticPole;
uniform vec3 galacticCenter;
uniform float intensity;
varying vec3 skyDirection;

// Interpolate across the lattice rather than exposing hard cell boundaries.
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x00 = mix(hash31(cell), hash31(cell + vec3(1.,0.,0.)), f.x);
  float x10 = mix(hash31(cell + vec3(0.,1.,0.)), hash31(cell + vec3(1.,1.,0.)), f.x);
  float x01 = mix(hash31(cell + vec3(0.,0.,1.)), hash31(cell + vec3(1.,0.,1.)), f.x);
  float x11 = mix(hash31(cell + vec3(0.,1.,1.)), hash31(cell + vec3(1.,1.,1.)), f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float smoothNebula(vec3 p) {
  return valueNoise(p) * 0.56 +
         valueNoise(p * 2.05 + vec3(8.1,1.7,3.2)) * 0.29 +
         valueNoise(p * 4.08 - vec3(2.1,6.6,0.9)) * 0.15;
}

void main() {
  vec3 d = normalize(skyDirection);
  float latitude = abs(dot(d, normalize(galacticPole)));
  float wide = exp(-pow(latitude / 0.24, 2.0));
  float spine = exp(-pow(latitude / 0.078, 2.0));
  float coreFacing = pow(max(dot(d, normalize(galacticCenter)), 0.0), 4.0);

  float largeCloud = smoothNebula(d * 7.4);
  float filaments = valueNoise(d * 37.0 + vec3(2.7,7.1,1.8));
  float darkDust = smoothstep(0.49, 0.75,
    valueNoise(d * 19.0 + vec3(11.4,3.5,8.8)));
  float organicDensity = smoothstep(0.18, 0.83,
    largeCloud * 0.81 + filaments * 0.19);

  // Central dust lanes darken the natural band without hard, rectangular cells.
  float dustTransmission = 1.0 - darkDust * (0.29 + 0.32 * spine);
  float arm = (wide * 0.35 + spine * 0.65) *
    (0.35 + 0.83 * organicDensity) * dustTransmission;
  float glow = arm * (0.75 + 0.50 * coreFacing);

  float opacity = min(0.105, glow * intensity);
  if (opacity < 0.0007) discard;
  vec3 cold = vec3(0.35, 0.42, 0.54);
  vec3 warm = vec3(0.63, 0.56, 0.47);
  vec3 tint = mix(cold, warm, coreFacing * 0.74);
  gl_FragColor = vec4(tint, opacity);
}`;
