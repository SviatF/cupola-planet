/**
 * ESA/Gaia/DPAC EDR3 all-sky colour map (equirectangular, Galactic coordinates).
 * Credit: ESA/Gaia/DPAC; acknowledgement: A. Moitinho.
 * Adapted asset: resized and WebP-compressed from the ESA published sky image.
 * CC BY-SA 3.0 IGO: https://creativecommons.org/licenses/by-sa/3.0/igo/
 *
 * Our shader places the Galactic centre at texture longitude 0 (u=0.5),
 * with north up (v=1). Never feed a Hammer/Aitoff projection into it.
 */
export const GAIA_SKY_VERTEX_SHADER = `
varying vec3 celestialDirection;
void main() {
  celestialDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const GAIA_SKY_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D gaiaSkyMap;
uniform vec3 galacticPole;
uniform vec3 galacticCenter;
uniform float intensity;
varying vec3 celestialDirection;

void main() {
  vec3 d = normalize(celestialDirection);
  vec3 pole = normalize(galacticPole);
  vec3 center = normalize(galacticCenter);
  // The positive Galactic-longitude axis is orthogonal to the centre and pole.
  vec3 east = normalize(cross(pole, center));
  float lon = atan(dot(d, east), dot(d, center));
  float lat = asin(clamp(dot(d, pole), -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 + lon / 6.28318530718),
                 clamp(0.5 + lat / 3.14159265359, 0.001, 0.999));

  // Actual observed density and colours, NOT a procedural haze. The original
  // ESA data is already dark outside the Galactic plane: preserve that black.
  vec3 survey = texture2D(gaiaSkyMap, uv).rgb;
  float brightness = dot(survey, vec3(0.2126, 0.7152, 0.0722));
  float confidence = smoothstep(0.007, 0.12, brightness);
  float alpha = clamp(confidence * intensity, 0.0, 0.74);
  if (alpha < 0.001) discard;
  vec3 colour = min(vec3(1.0), pow(survey, vec3(0.80)) * 1.48);
  gl_FragColor = vec4(colour, alpha);
}`;
