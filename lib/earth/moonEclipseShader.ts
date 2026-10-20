/**
 * CUPOLA lunar material injection. Preserve meshStandardMaterial's PBR,
 * LROC albedo, LOLA height/displacement, roughness and all scene lights.
 * Interpolated world position is post-displacement, so the visible shadow
 * actually follows the crater geometry rather than tinting the whole sphere.
 *
 * Earth angular disk at each Moon-surface point + Sun angular radius:
 * geometric penumbra overlap with a conservative copper totality residual.
 * The copper radiance is NOT atmospheric spectrophotometry.
 */
export const MOON_ECLIPSE_VERTEX_DECL="varying vec3 vMoonEclipseWorld;";
export const MOON_ECLIPSE_VERTEX_POSITION=
  "vMoonEclipseWorld=(modelMatrix*vec4(transformed,1.0)).xyz;";
export const MOON_ECLIPSE_FRAGMENT=/* glsl */`
varying vec3 vMoonEclipseWorld;
uniform vec3 uEclipseEarthWorld;
uniform vec3 uEclipseApparentOffset;
uniform vec3 uEclipseSunDirection;
uniform float uEclipseEarthRadius;
uniform float uEclipseSolarAngularRadius;
float lunarSolarDiscOccultation() {
  vec3 geometricWorld=vMoonEclipseWorld-uEclipseApparentOffset;
  vec3 toEarth=uEclipseEarthWorld-geometricWorld;
  float distanceEarth=length(toEarth);
  if(distanceEarth<=uEclipseEarthRadius)return 0.0;
  float earthRadius=asin(clamp(uEclipseEarthRadius/distanceEarth,0.0,1.0));
  float sunRadius=uEclipseSolarAngularRadius;
  float sep=acos(clamp(dot(normalize(toEarth),normalize(uEclipseSunDirection)),-1.0,1.0));
  if(sep>=earthRadius+sunRadius)return 0.0;
  if(sep<=abs(earthRadius-sunRadius))
    return clamp(earthRadius*earthRadius/(sunRadius*sunRadius),0.0,1.0);
  float e2=earthRadius*earthRadius;
  float s2=sunRadius*sunRadius;
  float d2=sep*sep;
  float aEarth=acos(clamp((d2+e2-s2)/(2.0*sep*earthRadius),-1.0,1.0));
  float aSun=acos(clamp((d2+s2-e2)/(2.0*sep*sunRadius),-1.0,1.0));
  float radical=sqrt(max(0.0,(-sep+earthRadius+sunRadius)*
    (sep+earthRadius-sunRadius)*(sep-earthRadius+sunRadius)*
    (sep+earthRadius+sunRadius)));
  return clamp((e2*aEarth+s2*aSun-0.5*radical)/
    (3.141592653589793*s2),0.0,1.0);
}
`;
export const MOON_ECLIPSE_OUTGOING_LIGHT=/* glsl */`
float lunarSolarBlocked=lunarSolarDiscOccultation();
vec3 lunarEclipseRadiance=mix(vec3(1.0),vec3(0.045,0.009,0.004),
  lunarSolarBlocked);
outgoingLight *= lunarEclipseRadiance;
`;
