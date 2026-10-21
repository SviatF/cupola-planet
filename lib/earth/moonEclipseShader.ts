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
uniform float uEclipseActive;
uniform vec3 uEclipseSunDirection;
uniform float uEclipseEarthRadius;
uniform float uEclipseSolarAngularRadius;
// 0 = accepted dark L1 baseline; -1 = hypothetical L0; +3 = L4.
// This is a user-defined illustrative Danjon atmosphere, NOT observed data.
uniform float uEclipseDanjonOffset;
float lunarSolarDiscOccultation() {
  // Broad phase disables 99%+ of eclipse-free GPU inverse trig workload.
  // The CPU gate intentionally fails OPEN when near an eclipse.
  if(uEclipseActive<0.5)return 0.0;
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
float lunarUmbraCoreDepth(float blocked){
  if(uEclipseActive<0.5 || blocked<0.99999)return 0.0;
  vec3 world=vMoonEclipseWorld-uEclipseApparentOffset;
  vec3 earthVector=uEclipseEarthWorld-world;
  float distanceEarth=length(earthVector);
  if(distanceEarth<=uEclipseEarthRadius)return 0.0;
  float earthAngle=asin(clamp(uEclipseEarthRadius/distanceEarth,0.0,1.0));
  float innerRadius=earthAngle-uEclipseSolarAngularRadius;
  if(innerRadius<=0.0)return 0.0;
  float separation=acos(clamp(dot(normalize(earthVector),
    normalize(uEclipseSunDirection)),-1.0,1.0));
  return clamp((innerRadius-separation)/innerRadius,0.0,1.0);
}
vec3 lunarDanjonCore(){
  float d=clamp(1.0+uEclipseDanjonOffset,0.0,4.0);
  if(d<0.5)return vec3(0.012,0.008,0.006);
  if(d<1.5)return vec3(0.045,0.009,0.004);
  if(d<2.5)return vec3(0.095,0.025,0.010);
  if(d<3.5)return vec3(0.160,0.045,0.015);
  return vec3(0.255,0.095,0.030);
}
vec3 lunarDanjonRim(){
  float d=clamp(1.0+uEclipseDanjonOffset,0.0,4.0);
  if(d<0.5)return vec3(0.019,0.013,0.009);
  if(d<1.5)return vec3(0.065,0.017,0.008);
  if(d<2.5)return vec3(0.140,0.043,0.015);
  if(d<3.5)return vec3(0.230,0.078,0.023);
  return vec3(0.330,0.145,0.048);
}
`;
export const MOON_ECLIPSE_OUTGOING_LIGHT=/* glsl */`

// Eclipse-free Moon must pay zero Danjon/umbra trigonometry cost.
if(uEclipseActive>=0.5){
  float lunarSolarBlocked=lunarSolarDiscOccultation();
  if(lunarSolarBlocked>0.0){
    float coreDepth=lunarUmbraCoreDepth(lunarSolarBlocked);
    float softDepth=coreDepth*coreDepth*(3.0-2.0*coreDepth);
    vec3 umbraResidual=mix(lunarDanjonRim(),lunarDanjonCore(),softDepth);
    vec3 lunarEclipseRadiance=mix(vec3(1.0),umbraResidual,
      lunarSolarBlocked);
    outgoingLight *= lunarEclipseRadiance;
  }
}
`;
