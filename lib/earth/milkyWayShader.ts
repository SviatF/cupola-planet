/**
 * Actual ESA/Gaia EDR3 equirectangular all-sky brightness/colour map,
 * sampled in Galactic coordinates. The former procedural narrow-band shader
 * remains only as a fallback if the compressed local asset cannot load.
 * Earth occlusion and sidereal orientation are owned by the scene component.
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
uniform sampler2D gaiaSky;
uniform float gaiaAvailable;
uniform float gaiaIntensity;
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
  vec3 pole = normalize(galacticPole);
  float signedLatitude = dot(d, pole);
  float latitude = abs(signedLatitude);

  if (gaiaAvailable > 0.5) {
    // Gaia EDR3 equirectangular map, in GALACTIC coordinates:
    // longitude 0° (Galactic centre) is at u=0.5; Galactic north at v=1.
    // Galactic longitude increases to the left in the ESA panorama.
    vec3 center = normalize(galacticCenter);
    vec3 east = normalize(cross(pole, center));
    float longitude = atan(dot(d, east), dot(d, center));
    float latitudeRad = asin(clamp(signedLatitude, -1.0, 1.0));
    vec2 uv = vec2(fract(0.5 - longitude / 6.2831853),
                   clamp(0.5 + latitudeRad / 3.14159265, 0.001, 0.999));
    vec3 photometry = texture2D(gaiaSky, uv).rgb;

    // ESA/Gaia/DPAC observation map already contains actual dust lanes,
    // Galactic bulge and Magellanic Clouds: no invented grey gaussian.
    float brightness = dot(photometry, vec3(0.2126, 0.7152, 0.0722));
    // Gaia is already a dark photographic density map. Previously a high
    // threshold *plus* 0.68 alpha *plus* 0.82 colour erased the actual
    // star clouds. Lift genuine midtones without inventing uniform smoke.
    float emission = smoothstep(0.028, 0.42, brightness);
    float alpha = clamp(emission * gaiaIntensity * 1.12, 0.0, 0.90);
    if (alpha < 0.001) discard;
    vec3 richPhotometry = pow(max(photometry, vec3(0.0)), vec3(0.76)) * 1.18;
    gl_FragColor = vec4(richPhotometry, alpha);
    return;
  }

  // Never cover the entire sky in smoky grey. Beyond the thin Galactic band
  // there is no procedural haze at all, so deep space remains near-black.
  if (latitude > 0.235) discard;

  // Narrow, irregularly luminous stellar clouds along the actual Galactic
  // equator. Continuously interpolated noise avoids square cell boundaries.
  float wide = exp(-pow(latitude / 0.108, 2.0));
  float spine = exp(-pow(latitude / 0.036, 2.0));
  float cloud = valueNoise(d * 12.0);
  float strands = valueNoise(d * 39.0 + vec3(2.7, 7.1, 1.8));
  float starCloud = smoothstep(0.35, 0.76, cloud * 0.72 + strands * 0.28);

  // A thin, distorted dark lane cuts through the luminous band instead of
  // adding uniform grey blur. No rectangular sampling or wide soft mask.
  float bend = (valueNoise(d * 15.0 + vec3(9.6, 4.2, 1.8)) - 0.5) * 0.034;
  float laneDistance = abs(signedLatitude - bend);
  float darkLane = 1.0 - (1.0 - smoothstep(0.003, 0.020, laneDistance)) * 0.73;
  float centerFacing = pow(max(dot(d, normalize(galacticCenter)), 0.0), 6.0);
  float density = (0.18 * wide + 0.82 * spine) *
    (0.23 + 0.88 * starCloud) * darkLane;
  float glow = density * (0.77 + 0.52 * centerFacing);

  // The sky layer is a faint complement to physically distinct star points.
  // A translucent dusty stripe, never a full-screen diffuse grey veil.
  float opacity = min(0.047, glow * intensity);
  if (opacity < 0.0015) discard;
  vec3 cold = vec3(0.28, 0.35, 0.47);
  vec3 warm = vec3(0.55, 0.48, 0.43);
  vec3 tint = mix(cold, warm, centerFacing * 0.67);
  gl_FragColor = vec4(tint, opacity);
}`;
