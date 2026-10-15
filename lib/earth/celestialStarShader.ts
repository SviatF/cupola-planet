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
  gl_PointSize = min(5.0, starSize * min(1.5, pixelRatio));
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
  float core = exp(-r2 * 11.5);
  float halo = exp(-r2 * 3.4) * 0.16;
  float strength = (core + halo) * vLuminance * intensity;
  vec3 cool = vec3(0.75, 0.84, 1.0);
  vec3 warm = vec3(1.0, 0.91, 0.79);
  vec3 color = mix(cool, warm, vTemperature);
  gl_FragColor = vec4(color, clamp(strength, 0.0, 0.95));
}`;
