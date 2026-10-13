/**
 * A deliberately faint, procedural approximation of the Galactic plane.
 * The pole is supplied in Earth-fixed coordinates from sidereal time.
 * No photographic "live Milky Way" claims and no new asset downloads.
 */
export const MILKY_WAY_VERTEX_SHADER = `
varying vec3 skyDirection;
void main() {
  skyDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const MILKY_WAY_FRAGMENT_SHADER = `
precision mediump float;
uniform vec3 galacticPole;
uniform float intensity;
varying vec3 skyDirection;

float grain(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void main() {
  vec3 d = normalize(skyDirection);
  float b = abs(dot(d, normalize(galacticPole)));
  float wide = exp(-pow(b / 0.19, 2.0));
  float spine = exp(-pow(b / 0.065, 2.0));
  float fragments = grain(floor(d * 43.0)) * 0.22 +
                    grain(floor(d * 105.0)) * 0.11;
  float dustLane = 0.76 + 0.18 * sin(d.x * 19.0 + d.y * 11.0);
  float glow = (wide * 0.55 + spine * 0.38) * (dustLane + fragments);
  float opacity = min(0.065, glow * intensity);
  if (opacity < 0.001) discard;
  gl_FragColor = vec4(vec3(0.30, 0.39, 0.55), opacity);
}`;
