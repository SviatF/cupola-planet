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

  // Gaia EDR3 is a source colour-density survey, not a photographic exposure.
  // Never display its full-frame bright raster as the physical night sky.
  // Keep only a narrow observed Galactic plane with dark surrounding space.
  float absLatitude = abs(lat);
  if (absLatitude > 0.31) discard;
  float denseSpine = exp(-pow(absLatitude / 0.095, 1.65));
  float outerCluster = exp(-pow(absLatitude / 0.18, 2.0));
  float edgeFade = 1.0 - smoothstep(0.16, 0.31, absLatitude);
  float galacticBand = (denseSpine * 0.76 + outerCluster * 0.24) * edgeFade;

  // In the source map, even apparently empty sky is bright. Subtract the
  // survey's image pedestal; retain REAL dark dust lanes and brighter knots.
  vec3 survey = texture2D(gaiaSkyMap, uv).rgb;
  float observedLuminance = dot(survey, vec3(0.2126, 0.7152, 0.0722));
  float stellarStructure = smoothstep(0.075, 0.58, observedLuminance);
  stellarStructure *= stellarStructure;
  float coreFacing = pow(max(dot(d, center), 0.0), 4.0);
  float coreAccent = mix(0.78, 1.0, coreFacing);
  vec3 neutralised = max(survey - vec3(0.14), vec3(0.0));
  vec3 colour = min(vec3(0.68), pow(neutralised, vec3(1.30)) * 0.76);
  // Compression rather than exposure boosting: colour retains structure,
  // but highlights cannot become an overexposed white/peach wall.
  float alpha = min(0.13, galacticBand * stellarStructure * coreAccent * intensity);
  if (alpha < 0.0015) discard;
  gl_FragColor = vec4(colour, alpha);
}`;
