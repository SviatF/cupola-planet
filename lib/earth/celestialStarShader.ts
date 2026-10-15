/**
 * Lightweight cinematic stellar sprites; a deterministic stylization, not a
 * positional astronomy catalogue. Each circular sprite occupies only a few
 * physical pixels, with no texture fetch or time-dependent sparkle.
 */
export const CELESTIAL_STAR_VERTEX_SHADER = `
precision highp float;
attribute float starSize;
attribute float starLuminance;
attribute float starTemperature;
uniform float pixelRatio;
varying float vLuminance;
varying float vTemperature;
void main() {
  vLuminance = starLuminance;
  vTemperature = starTemperature;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(starSize * min(1.8, pixelRatio), 1.7, 8.0);
}`;

export const CELESTIAL_STAR_FRAGMENT_SHADER = `
precision highp float;
uniform float intensity;
varying float vLuminance;
varying float vTemperature;
void main() {
  vec2 p = (gl_PointCoord - vec2(0.5)) * 2.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Resolved pinpoints: a readable centre with a restrained subpixel halo.
  // Broad Gaussian fog made the previous tiny sprites almost invisible.
  float core = 1.0 - smoothstep(0.055, 0.31, r2);
  float halo = (1.0 - smoothstep(0.12, 0.92, r2)) * 0.16;
  float strength = (core + halo) * vLuminance * intensity;
  vec3 cool = vec3(0.82, 0.90, 1.0);
  vec3 warm = vec3(1.0, 0.94, 0.85);
  vec3 color = mix(cool, warm, vTemperature);
  gl_FragColor = vec4(color, clamp(strength, 0.0, 0.98));
}`;
