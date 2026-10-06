"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Cloud, CloudRain, Crosshair, Flame, Layers3, LocateFixed, Mountain, Pause, Play, Satellite, Search, Share2, Sparkles, Sun, Thermometer, Volume2, VolumeX, Wind, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CINEMA_PRESET, LIVE_PRESET } from "@/lib/earth/presets";
import { LIVE_CLOUD_FRAGMENT_SHADER, LIVE_CLOUD_SHADOW_FRAGMENT_SHADER, LIVE_CLOUD_VERTEX_SHADER } from "@/lib/earth/liveCloudShader";
import { OCEAN_SUN_GLINT_FRAGMENT_SHADER, OCEAN_SUN_GLINT_VERTEX_SHADER } from "@/lib/earth/oceanShader";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "SUN–EARTH L1" | "MOON" | "FREE CAMERA";
type ExperienceMode = "CINEMA" | "EXPLORE";
type SurfaceMode = "EARTH" | "WEATHER";
type WeatherLayer = "CLOUDS" | "RAIN" | "WIND" | "TEMPERATURE";
type IssTrackPoint = { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number };
type IssData = {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  timestamp: number;
  visibility: string | null;
  footprint: number | null;
  track: IssTrackPoint[];
  source: string;
  updatedAt: string;
};
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; weatherCode: number; isDay: boolean; sunrise: string | null; sunset: string | null; timezone: string; updatedAt: string };
type SpaceWeatherData = { kp: number; updatedAt: string; source: string };
type NightLightsMeta = { source: string; imageryDate: string; ageHours: number | null };
type EarthquakeEvent = { id: string; latitude: number; longitude: number; depth: number; magnitude: number; place: string; time: number; url: string | null };
type TropicalStormTrackPoint = {
  latitude: number;
  longitude: number;
  tau: number;
  windKnots: number | null;
  pressure: number | null;
  category: number | null;
  validTime: string | null;
};
type TropicalStorm = {
  id: string;
  name: string;
  basin: string;
  latitude: number;
  longitude: number;
  windKnots: number | null;
  pressure: number | null;
  category: number | null;
  stormType: string;
  advisory: string | null;
  updatedAt: string;
  source: string;
  movementDirection: number | null;
  movementSpeedKnots: number | null;
  track: TropicalStormTrackPoint[];
};
type LightningModelPoint = { latitude: number; longitude: number; density: number; validTime: string | null };
type ObservedLightningTelemetry = {
  noaaCells: number;
  mtgCells: number;
  noaaAvailable: boolean;
  mtgAvailable: boolean;
  noaaAgeMinutes: number | null;
  mtgAgeMinutes: number | null;
  noaaObservationTime: string | null;
  mtgObservationTime: string | null;
  noaaSource: string | null;
  mtgSource: string | null;
  updatedAt: string | null;
};
type AuroraPoint = { latitude: number; longitude: number; intensity: number };
type AuroraData = { points: AuroraPoint[]; source: string; forecastTime: string | null; observationTime: string | null; updatedAt: string };
type WildfireHotspot = {
  id: string;
  latitude: number;
  longitude: number;
  frp: number | null;
  brightness: number | null;
  confidence: string | null;
  acquiredAt: string | null;
  daynight: string | null;
  satellite: string | null;
};
type WildfireData = {
  hotspots: WildfireHotspot[];
  totalDetections: number;
  source: string;
  mode: string;
  latestAcquisition: string | null;
  updatedAt: string;
};
type VolcanoEvent = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eventTime: string | null;
  magnitude: number | null;
  source: string;
  sourceUrl: string | null;
};
type VolcanoData = {
  volcanoes: VolcanoEvent[];
  source: string;
  updatedAt: string;
};
type SatelliteTrackPoint = {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: string;
};
type LiveSatellite = {
  id: string;
  name: string;
  category: "STATION" | "WEATHER" | "EARTH OBSERVATION" | "STARLINK" | "OTHER";
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epoch: string | null;
  source: string;
  motionTarget: {
    latitude: number;
    longitude: number;
    altitude: number;
    timestamp: string;
  } | null;
  track: SatelliteTrackPoint[];
};
type SatelliteData = {
  satellites: LiveSatellite[];
  count: number;
  source: string;
  generatedAt: string;
  categories: {
    stations: number;
    weather: number;
    earthObservation: number;
    starlink: number;
    other?: number;
  };
};
type PlaceResult = { id: number; name: string; country: string; admin1: string | null; latitude: number; longitude: number; timezone: string };
type DiscoveryEvent = {
  id: string;
  kind: "EARTHQUAKE" | "CYCLONE" | "AURORA" | "WILDFIRE" | "VOLCANO" | "LIGHTNING MODEL";
  title: string;
  detail: string;
  latitude: number;
  longitude: number;
  score: number;
};

const DAY_TEXTURE = "/api/earth-texture?type=day";
const NIGHT_TEXTURE = "/api/night-lights";
const NIGHT_BASE_TEXTURE = "/api/earth-texture?type=night";
const STATIC_CLOUD_TEXTURE = "/api/earth-texture?type=clouds";
const LIVE_CLOUD_TEXTURE = "/api/clouds-live";
const GEO_CLOUD_TEXTURES = {
  east: "/api/clouds-geostationary?source=goes-east",
  west: "/api/clouds-geostationary?source=goes-west",
  himawari: "/api/clouds-geostationary?source=himawari",
  meteosat: "/api/clouds-geostationary?source=meteosat",
} as const;
const PRECIP_TEXTURE = "/api/precipitation";
const LIGHTNING_TEXTURE = "/api/lightning";
const LIGHTNING_EUMETSAT_TEXTURE = "/api/lightning-eumetsat";
const NORMAL_TEXTURE = "/api/earth-texture?type=normal";
const SPECULAR_TEXTURE = "/api/earth-texture?type=specular";

const EARTH_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*worldPosition; }";
const EARTH_FRAGMENT_SHADER = "uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 s=normalize(sunDirection); vec3 v=normalize(cameraPosition-vWorldPosition); float sunDot=dot(n,s); float dayMix=smoothstep(-0.075,0.015,sunDot); vec3 day=texture2D(dayTexture,vUv).rgb; day=pow(day,vec3(0.93)); day*=vec3(0.96,0.99,1.025); vec3 night=texture2D(nightTexture,vUv).rgb; night=pow(night,vec3(0.78)); float ocean=smoothstep(0.015,0.16,day.b-max(day.r,day.g)*0.78); float diffuse=0.58+0.52*max(sunDot,0.0); vec3 h=normalize(s+v); float spec=pow(max(dot(n,h),0.0),90.0)*ocean*max(sunDot,0.0)*0.28; float twilight=1.0-smoothstep(0.00,0.10,abs(sunDot)); vec3 dayLit=day*diffuse+vec3(0.42,0.62,0.95)*spec; vec3 nightSide=day*0.010+night*vec3(1.0,0.72,0.34)*1.55*lightsEnabled; vec3 color=mix(nightSide,dayLit,dayMix); color+=vec3(1.0,0.37,0.10)*twilight*0.045; float limb=pow(1.0-max(dot(n,v),0.0),4.0); color+=vec3(0.08,0.23,0.52)*limb*0.10; gl_FragColor=vec4(color,1.0); }"

const LIGHTNING_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";
const LIGHTNING_FRAGMENT_SHADER = `uniform sampler2D lightningTexture;
uniform sampler2D lightningEuropeTexture;
uniform float time;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float hash(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}

float signal(vec4 s){
  return max(s.a,max(max(s.r,s.g),s.b));
}

float observedDensity(vec2 uv){
  return max(signal(texture2D(lightningTexture,uv)),signal(texture2D(lightningEuropeTexture,uv)));
}

void main(){
  vec2 px=vec2(1.0/2048.0,1.0/1024.0);
  float center=observedDensity(vUv);
  float near1=max(
    max(observedDensity(vUv+vec2(px.x*2.0,0.0)),observedDensity(vUv-vec2(px.x*2.0,0.0))),
    max(observedDensity(vUv+vec2(0.0,px.y*2.0)),observedDensity(vUv-vec2(0.0,px.y*2.0)))
  );
  float near2=max(
    max(observedDensity(vUv+vec2(px.x*5.0,px.y*3.0)),observedDensity(vUv-vec2(px.x*5.0,px.y*3.0))),
    max(observedDensity(vUv+vec2(px.x*5.0,-px.y*3.0)),observedDensity(vUv-vec2(px.x*5.0,-px.y*3.0)))
  );

  float density=smoothstep(0.040,0.38,center);
  float aura=smoothstep(0.035,0.34,max(near1,near2))*0.62;
  if(max(density,aura)<0.001) discard;

  vec3 n=normalize(vWorldNormal);
  vec3 v=normalize(cameraPosition-vWorldPosition);
  float facing=smoothstep(0.02,0.22,dot(n,v));

  vec2 cell=floor(vUv*vec2(900.0,450.0));
  float seed=hash(cell);
  float phase=fract(time*(0.42+seed*0.62)+seed*13.7);
  float flash=exp(-phase*30.0);
  float returnStroke=exp(-abs(phase-0.115)*48.0)*0.62;
  float afterGlow=exp(-abs(phase-0.245)*20.0)*0.18;
  float activity=clamp(flash+returnStroke+afterGlow,0.0,1.0);

  float persistent=density*(0.045+0.055*seed);
  float pulse=density*activity;
  float cloudGlow=aura*(0.025+activity*0.28);

  vec3 cobalt=vec3(0.08,0.30,1.18);
  vec3 electric=vec3(0.32,0.72,1.75);
  vec3 whiteCore=vec3(1.35,1.55,1.90);
  vec3 color=mix(cobalt,electric,clamp(activity*1.15+aura*0.28,0.0,1.0));
  color=mix(color,whiteCore,pow(activity,2.2)*0.82);

  float alpha=(persistent+pulse*0.94+cloudGlow*0.40)*facing;
  vec3 emission=color*(persistent*0.85+pulse*5.2+cloudGlow*1.65)*facing;
  gl_FragColor=vec4(emission,alpha);
}`;

const NIGHT_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vUv=uv; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const NIGHT_FRAGMENT_SHADER = "uniform sampler2D nightTexture; uniform sampler2D baseNightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; float lum(vec3 c){ return max(max(c.r,c.g),c.b); } void main(){ vec3 n=normalize(vWorldNormal); float sunDot=dot(n,normalize(sunDirection)); float nightMask=1.0-smoothstep(-0.11,-0.018,sunDot); float deepNight=1.0-smoothstep(-0.26,-0.095,sunDot); vec2 px=vec2(1.0/4096.0,1.0/2048.0); float d0=lum(texture2D(nightTexture,vUv).rgb); float dn=0.25*(lum(texture2D(nightTexture,vUv+vec2(px.x,0.0)).rgb)+lum(texture2D(nightTexture,vUv-vec2(px.x,0.0)).rgb)+lum(texture2D(nightTexture,vUv+vec2(0.0,px.y)).rgb)+lum(texture2D(nightTexture,vUv-vec2(0.0,px.y)).rgb)); float b0=lum(texture2D(baseNightTexture,vUv).rgb); float bn=0.25*(lum(texture2D(baseNightTexture,vUv+vec2(px.x,0.0)).rgb)+lum(texture2D(baseNightTexture,vUv-vec2(px.x,0.0)).rgb)+lum(texture2D(baseNightTexture,vUv+vec2(0.0,px.y)).rgb)+lum(texture2D(baseNightTexture,vUv-vec2(0.0,px.y)).rgb)); float dailySignal=max(0.0,d0-dn*0.72); float baseSignal=max(0.0,b0-bn*0.74); float dailyCore=pow(clamp(dailySignal*7.4,0.0,1.0),0.88); float baseCore=pow(clamp(baseSignal*3.4,0.0,1.0),0.94); float dailyWide=pow(clamp(d0*2.7,0.0,1.0),1.28); float baseWide=pow(clamp(b0*1.5,0.0,1.0),1.20); float confidence=smoothstep(0.003,0.030,d0); float core=max(dailyCore,baseCore*0.58*(1.0-confidence)); float halo=max(dailyWide,baseWide*0.34*(1.0-confidence))*0.33; float signal=max(core,halo); float coreMix=smoothstep(0.34,0.92,core); vec3 amber=vec3(1.00,0.48,0.16); vec3 warmWhite=vec3(1.00,0.84,0.61); vec3 lightColor=mix(amber,warmWhite,coreMix); float brightness=(halo*0.72+core*2.15)*deepNight+(halo*0.30+core*1.05)*(nightMask-deepNight); float alpha=smoothstep(0.028,0.62,signal)*nightMask*lightsEnabled; gl_FragColor=vec4(lightColor*brightness,alpha); }";

const ATMOSPHERE_VERTEX_SHADER = "varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";
const ATMOSPHERE_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float density; uniform float warmBoost; uniform float airglowBoost; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=max(dot(n,v),0.0); float nds=dot(n,s); float softHorizon=pow(1.0-ndv,1.75); float rim=pow(1.0-ndv,6.8); float daylight=smoothstep(-0.24,0.20,nds); float sunset=exp(-pow((nds+0.018)*7.0,2.0)); float nightside=1.0-smoothstep(-0.20,0.04,nds); vec3 rayleigh=vec3(0.10,0.34,0.86)*daylight; vec3 mie=vec3(1.0,0.42,0.18)*sunset*(0.72+warmBoost*0.62); vec3 airglow=vec3(0.07,0.16,0.34)*nightside*airglowBoost; vec3 color=rayleigh*(0.30+0.70*softHorizon)+mie*rim+airglow*softHorizon; float broad=softHorizon*(0.038+0.145*daylight+0.050*nightside); float edge=rim*(0.070+0.22*daylight+0.22*sunset+0.045*nightside); float alpha=(broad+edge)*density; gl_FragColor=vec4(color,alpha); }";


const LIMB_VERTEX_SHADER = "varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";

const ATMOSPHERE_DISC_VERTEX_SHADER = "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const ATMOSPHERE_DISC_FRAGMENT_SHADER = "uniform float intensity; varying vec2 vUv; void main(){ float r=length(vUv-vec2(0.5))*2.0; float earthEdge=0.892; float d=max((r-earthEdge)/(1.0-earthEdge),0.0); float outside=smoothstep(earthEdge-0.002,earthEdge+0.0015,r); float core=exp(-pow(d/0.070,2.0)); float shoulder=exp(-d*3.2); float broad=exp(-d*1.15); float outerFade=1.0-smoothstep(0.92,1.0,d); float mask=outside*outerFade; vec3 deep=vec3(0.002,0.018,0.11); vec3 royal=vec3(0.010,0.20,0.95); vec3 cyan=vec3(0.10,0.48,1.28); vec3 ice=vec3(0.72,1.10,1.80); vec3 color=mix(deep,royal,clamp(shoulder*0.72+broad*0.16,0.0,1.0)); color=mix(color,cyan,clamp(core*0.62+shoulder*0.18,0.0,1.0)); color=mix(color,ice,core*0.58); float alpha=mask*(core*0.82+shoulder*0.30+broad*0.13)*intensity; vec3 emission=color*mask*(core*7.8+shoulder*2.05+broad*0.62)*intensity; if(alpha<0.0008) discard; gl_FragColor=vec4(emission,alpha); }";

const ATMOSPHERE_CORE_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float intensity; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=clamp(dot(n,v),0.0,1.0); float nds=dot(n,s); float edge=1.0-ndv; float core=pow(edge,24.0); float shoulder=pow(edge,6.8); float day=smoothstep(-0.28,0.30,nds); float dusk=exp(-pow((nds+0.015)*5.6,2.0)); vec3 navy=vec3(0.0015,0.012,0.070); vec3 cobalt=vec3(0.004,0.060,0.34); vec3 royal=vec3(0.020,0.40,1.30); vec3 ice=vec3(0.68,1.05,1.85); vec3 color=mix(navy,cobalt,0.76+0.16*day); color=mix(color,royal,core*(0.50+0.26*day)); color=mix(color,ice,core*core*(0.18+0.20*day)); color+=vec3(0.04,0.012,0.07)*dusk*0.035; float side=0.30+0.70*day; float alpha=(core*0.68+shoulder*0.060)*intensity*side; vec3 emission=color*(core*11.5+shoulder*0.52)*intensity*side; gl_FragColor=vec4(emission,alpha); }";

const ATMOSPHERE_HALO_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float intensity; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=abs(dot(n,v)); float nds=dot(n,s); float edge=1.0-clamp(ndv,0.0,1.0); float nearHalo=pow(edge,2.8); float farHalo=pow(edge,1.25); float day=smoothstep(-0.34,0.30,nds); vec3 deep=vec3(0.001,0.012,0.065); vec3 blue=vec3(0.004,0.075,0.36); vec3 royal=vec3(0.010,0.22,0.82); vec3 color=mix(deep,blue,0.76+0.18*day); color=mix(color,royal,nearHalo*(0.18+0.12*day)); float side=0.25+0.75*day; float alpha=(nearHalo*0.13+farHalo*0.028)*intensity*side; vec3 emission=color*(nearHalo*1.10+farHalo*0.17)*intensity*side; gl_FragColor=vec4(emission,alpha); }";

const ATMOSPHERE_INNER_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float intensity; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=clamp(dot(n,v),0.0,1.0); float nds=dot(n,s); float edge=1.0-ndv; float broad=pow(edge,0.72); float rim=pow(edge,4.2); float band=1.0-smoothstep(0.00,0.985,ndv); float day=smoothstep(-0.26,0.30,nds); float night=1.0-smoothstep(-0.26,-0.03,nds); vec3 deep=vec3(0.002,0.020,0.10); vec3 blue=vec3(0.006,0.095,0.46); vec3 royal=vec3(0.018,0.28,0.98); vec3 ice=vec3(0.16,0.50,1.22); vec3 color=mix(deep,blue,0.72+0.18*day); color=mix(color,royal,rim*(0.18+0.18*day)); color=mix(color,ice,pow(edge,8.0)*(0.10+0.12*day)); float side=0.22+0.78*day+0.04*night; float alpha=(broad*0.27+rim*0.070)*band*intensity*side; vec3 emission=color*(broad*0.72+rim*0.28)*band*intensity*side; gl_FragColor=vec4(emission,alpha); }";

const HAZE_FRAGMENT_SHADER = "uniform vec3 sunDirection; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=max(dot(n,v),0.0); float nds=dot(n,s); float horizon=pow(1.0-ndv,2.2); float daylight=smoothstep(-0.18,0.25,nds); float sunset=exp(-pow((nds+0.015)*5.0,2.0)); vec3 dayHaze=vec3(0.08,0.20,0.42)*daylight; vec3 warm=vec3(1.0,0.20,0.035)*sunset*1.85; vec3 color=dayHaze+warm; float alpha=horizon*(0.10*daylight+0.24*sunset); gl_FragColor=vec4(color,alpha); }";


function getSolarCoordinates(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const g = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const declination =
    0.006918
    - 0.399912 * Math.cos(g)
    + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g)
    + 0.00148 * Math.sin(3 * g);

  const subSolarLongitude = (12 - hour) * 15;

  return {
    declinationRadians: declination,
    declinationDegrees: THREE.MathUtils.radToDeg(declination),
    subSolarLongitude,
    sunriseLongitude: THREE.MathUtils.euclideanModulo(subSolarLongitude - 90 + 180, 360) - 180,
    sunsetLongitude: THREE.MathUtils.euclideanModulo(subSolarLongitude + 90 + 180, 360) - 180,
  };
}

function getSunDirection(date: Date) {
  const solar = getSolarCoordinates(date);
  const dec = solar.declinationRadians;

  // Sub-solar longitude: ~0° at 12:00 UTC, east-positive before noon.
  const subSolarLon = THREE.MathUtils.degToRad(solar.subSolarLongitude);

  // Match latLonToPoint() exactly:
  // x = cos(lat) * cos(lon)
  // y = sin(lat)
  // z = -cos(lat) * sin(lon)
  const localSun = new THREE.Vector3(
    Math.cos(dec) * Math.cos(subSolarLon),
    Math.sin(dec),
    -Math.cos(dec) * Math.sin(subSolarLon),
  ).normalize();

  // The globe is visually rotated in the scene, so the astronomical vector
  // must be rotated by the exact same transform before shader/light use.
  return localSun.applyEuler(GLOBE_ROTATION).normalize();
}

function latLonToPoint(lat: number, lon: number, radius = 2.54) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-radius*Math.sin(phi)*Math.cos(theta), radius*Math.cos(phi), radius*Math.sin(phi)*Math.sin(theta));
}




const GLOBE_CENTER = new THREE.Vector3(0.62, -2.18, 0);
const GLOBE_ROTATION = new THREE.Euler(-0.12, 1.10, -0.055, "XYZ");
const GLOBE_SCALE = 1.72;
const GLOBE_RADIUS = 2.5 * GLOBE_SCALE;
const HERO_CAMERA = new THREE.Vector3(-0.12, 0.28, 7.55);
const HERO_TARGET = GLOBE_CENTER.clone();
const CINEMA_TARGET = GLOBE_CENTER.clone().add(new THREE.Vector3(0.35, 1.15, 0));

function globeWorldNormal(lat: number, lon: number) {
  return latLonToPoint(lat, lon, 1)
    .applyEuler(GLOBE_ROTATION)
    .normalize();
}

function globeWorldPoint(lat: number, lon: number, altitude = 0.045) {
  const normal = globeWorldNormal(lat, lon);
  return GLOBE_CENTER.clone().add(normal.multiplyScalar(GLOBE_RADIUS + altitude));
}

function WindHalo({ lat, lon, speed }: { lat: number; lon: number; speed: number }) {
  const group = useRef<THREE.Group>(null);
  const point = useMemo(() => latLonToPoint(lat, lon, 2.60), [lat, lon]);

  useFrame((_state, delta) => {
    if (group.current) group.current.rotation.z += delta * Math.max(0.08, Math.min(0.55, speed / 45));
  });

  const strength = Math.max(0.16, Math.min(0.6, speed / 55));

  return (
    <group position={point}>
      <group ref={group}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[Math.PI / 2, 0, i * 0.85]} scale={[1 + i * 0.22, 1 + i * 0.22, 1]}>
            <torusGeometry args={[0.12 + i * 0.045, 0.006, 10, 48, Math.PI * 1.2]} />
            <meshBasicMaterial
              color="#b7e7ff"
              transparent
              opacity={strength - i * 0.07}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}



function TemperatureHalo({ lat, lon, temperature }: { lat: number; lon: number; temperature: number }) {
  const point = useMemo(() => latLonToPoint(lat, lon, 2.585), [lat, lon]);
  const normalized = Math.max(0, Math.min(1, (temperature + 20) / 60));
  const cool = new THREE.Color("#6ab8ff");
  const warm = new THREE.Color("#ff9b67");
  const color = cool.clone().lerp(warm, normalized);

  return (
    <group position={point}>
      <mesh scale={3.3}>
        <sphereGeometry args={[0.05, 28, 28]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.13}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.009, 12, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}


const CINEMA_CAMERA = new THREE.Vector3(-0.62, 1.22, 9.25);

function SunVisual() {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!group.current) return;
    const sun = getSunDirection(new Date());
    group.current.position.copy(GLOBE_CENTER).add(sun.multiplyScalar(18));
  });

  return (
    <group ref={group}>
      <Billboard follow>
        <mesh>
          <circleGeometry args={[0.16, 48]} />
          <meshBasicMaterial color="#fffaf0" transparent opacity={0.98} depthWrite={false} />
        </mesh>
        <mesh scale={3.2}>
          <circleGeometry args={[0.16, 48]} />
          <meshBasicMaterial color="#ffd39a" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh scale={7.2}>
          <circleGeometry args={[0.16, 48]} />
          <meshBasicMaterial color="#ff9b55" transparent opacity={0.055} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

function LiveCloudLayer({
  staticCloudTexture,
  dayTexture,
  sunDirection,
  cinematic,
}: {
  staticCloudTexture: THREE.Texture;
  dayTexture: THREE.Texture;
  sunDirection: { value: THREE.Vector3 };
  cinematic: boolean;
}) {
  const { gl } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const currentLiveRef = useRef<THREE.Texture | null>(null);
  const nextLiveRef = useRef<THREE.Texture | null>(null);
  const geoTexturesRef = useRef<{
    east: THREE.Texture | null;
    west: THREE.Texture | null;
    himawari: THREE.Texture | null;
    meteosat: THREE.Texture | null;
  }>({ east: null, west: null, himawari: null, meteosat: null });
  const geoFadeStartRef = useRef<number | null>(null);
  const transitionRef = useRef<{ active: boolean; start: number; type: "strength" | "blend" }>({
    active: false,
    start: 0,
    type: "strength",
  });

  const uniforms = useMemo(() => ({
    staticCloudTexture: { value: staticCloudTexture },
    liveTextureA: { value: staticCloudTexture },
    liveTextureB: { value: staticCloudTexture },
    geoEastTexture: { value: staticCloudTexture },
    geoWestTexture: { value: staticCloudTexture },
    geoHimawariTexture: { value: staticCloudTexture },
    geoMeteosatTexture: { value: staticCloudTexture },
    baseTexture: { value: dayTexture },
    liveBlend: { value: 0 },
    liveStrength: { value: 0 },
    geoStrength: { value: 0 },
    sunDirection,
    opacity: { value: cinematic ? 0.66 : 0.56 },
    brightness: { value: cinematic ? 1.15 : 1.07 },
    relief: { value: cinematic ? 6.4 : 5.1 },
    rimStrength: { value: cinematic ? 0.42 : 0.29 },
    shadowStrength: { value: cinematic ? 0.40 : 0.34 },
  }), [staticCloudTexture, dayTexture, sunDirection, cinematic]);

  useEffect(() => {
    uniforms.staticCloudTexture.value = staticCloudTexture;
    uniforms.baseTexture.value = dayTexture;
    uniforms.opacity.value = cinematic ? 0.66 : 0.56;
    uniforms.brightness.value = cinematic ? 1.15 : 1.07;
    uniforms.relief.value = cinematic ? 6.4 : 5.1;
    uniforms.rimStrength.value = cinematic ? 0.42 : 0.29;
    uniforms.shadowStrength.value = cinematic ? 0.40 : 0.34;
  }, [staticCloudTexture, dayTexture, cinematic, uniforms]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const loader = new THREE.TextureLoader();
    const anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());

    const prepare = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
    };

    const loadLive = () => {
      if (loading || cancelled) return;
      loading = true;

      // The endpoint is cached server-side. The bucket only lets the browser
      // discover a newly available NRT frame without touching the current one.
      const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
      loader.load(
        LIVE_CLOUD_TEXTURE + "?v=" + bucket,
        (texture) => {
          loading = false;
          if (cancelled) {
            texture.dispose();
            return;
          }

          prepare(texture);

          if (!currentLiveRef.current) {
            currentLiveRef.current = texture;
            uniforms.liveTextureA.value = texture;
            uniforms.liveTextureB.value = texture;
            uniforms.liveBlend.value = 0;
            uniforms.liveStrength.value = 0;
            transitionRef.current = { active: true, start: performance.now(), type: "strength" };
            return;
          }

          const previousNext = nextLiveRef.current;
          if (previousNext && previousNext !== currentLiveRef.current) previousNext.dispose();

          nextLiveRef.current = texture;
          uniforms.liveTextureA.value = currentLiveRef.current;
          uniforms.liveTextureB.value = texture;
          uniforms.liveBlend.value = 0;
          transitionRef.current = { active: true, start: performance.now(), type: "blend" };
        },
        undefined,
        () => {
          // Keep the currently rendered texture untouched on any NRT failure.
          loading = false;
        },
      );
    };

    const loadGeo = () => {
      const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
      const entries = Object.entries(GEO_CLOUD_TEXTURES) as Array<
        ["east" | "west" | "himawari" | "meteosat", string]
      >;

      let completed = 0;
      let loadedAny = false;

      const finish = () => {
        completed += 1;
        if (completed < entries.length || !loadedAny || cancelled) return;
        uniforms.geoStrength.value = Math.min(uniforms.geoStrength.value, 0.70);
        geoFadeStartRef.current = performance.now();
      };

      entries.forEach(([key, url]) => {
        loader.load(
          url + "&v=" + bucket,
          (texture) => {
            if (cancelled) {
              texture.dispose();
              finish();
              return;
            }

            prepare(texture);
            const previous = geoTexturesRef.current[key];
            geoTexturesRef.current[key] = texture;

            if (key === "east") uniforms.geoEastTexture.value = texture;
            if (key === "west") uniforms.geoWestTexture.value = texture;
            if (key === "himawari") uniforms.geoHimawariTexture.value = texture;
            if (key === "meteosat") uniforms.geoMeteosatTexture.value = texture;

            if (previous && previous !== staticCloudTexture && previous !== texture) previous.dispose();
            loadedAny = true;
            finish();
          },
          undefined,
          () => finish(),
        );
      });
    };

    loadLive();
    loadGeo();
    const interval = window.setInterval(loadLive, 30 * 60 * 1000);
    const geoInterval = window.setInterval(loadGeo, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(geoInterval);
      const current = currentLiveRef.current;
      const next = nextLiveRef.current;
      if (current && current !== staticCloudTexture) current.dispose();
      if (next && next !== current && next !== staticCloudTexture) next.dispose();
      currentLiveRef.current = null;
      nextLiveRef.current = null;
      (["east", "west", "himawari", "meteosat"] as const).forEach((key) => {
        const texture = geoTexturesRef.current[key];
        if (texture && texture !== staticCloudTexture) texture.dispose();
        geoTexturesRef.current[key] = null;
      });
      geoFadeStartRef.current = null;
    };
  }, [gl, staticCloudTexture, uniforms]);

  useFrame(() => {
    const geoStart = geoFadeStartRef.current;
    if (geoStart != null) {
      const rawGeo = Math.min(1, (performance.now() - geoStart) / 1400);
      const easedGeo = rawGeo * rawGeo * (3 - 2 * rawGeo);
      uniforms.geoStrength.value = THREE.MathUtils.lerp(0.70, 1.0, easedGeo);
      if (rawGeo >= 1) {
        uniforms.geoStrength.value = 1;
        geoFadeStartRef.current = null;
      }
    }

    const transition = transitionRef.current;
    if (!transition.active) return;

    const raw = Math.min(1, (performance.now() - transition.start) / 1200);
    const eased = raw * raw * (3 - 2 * raw);

    if (transition.type === "strength") {
      uniforms.liveStrength.value = eased;
    } else {
      uniforms.liveBlend.value = eased;
    }

    if (raw < 1) return;

    transition.active = false;

    if (transition.type === "strength") {
      uniforms.liveStrength.value = 1;
      return;
    }

    const old = currentLiveRef.current;
    const next = nextLiveRef.current;
    if (!next) return;

    currentLiveRef.current = next;
    nextLiveRef.current = null;
    uniforms.liveTextureA.value = next;
    uniforms.liveTextureB.value = next;
    uniforms.liveBlend.value = 0;
    uniforms.liveStrength.value = 1;

    if (old && old !== staticCloudTexture && old !== next) old.dispose();
  });

  return (
    <group>
      {/* Subtle ground shadow from the exact same live/NRT cloud field.
          It sits below the visible cloud shell and only appears on the day side. */}
      <mesh scale={cinematic ? 1.0019 : 1.0016} renderOrder={3}>
        <sphereGeometry args={[2.5, cinematic ? 176 : 160, cinematic ? 176 : 160]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={LIVE_CLOUD_VERTEX_SHADER}
          fragmentShader={LIVE_CLOUD_SHADOW_FRAGMENT_SHADER}
          transparent
          depthTest={false}
          depthWrite={false}
          blending={THREE.NormalBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh scale={cinematic ? 1.0140 : 1.0124} renderOrder={4}>
        <sphereGeometry args={[2.5, cinematic ? 176 : 160, cinematic ? 176 : 160]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={LIVE_CLOUD_VERTEX_SHADER}
          fragmentShader={LIVE_CLOUD_FRAGMENT_SHADER}
          transparent
          depthTest
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
}


function Earth(props: { clouds: boolean; cityLights: boolean; aurora: boolean; precipitation: boolean; cinematic: boolean; marker?: { lat: number; lon: number } | null; windSpeed?: number | null; temperature?: number | null; weatherLayer?: WeatherLayer | null }) {
  const preset = props.cinematic ? CINEMA_PRESET : LIVE_PRESET;
  const earthRef = useRef<THREE.Mesh>(null);
  const { gl } = useThree();
  const textures = useTexture([DAY_TEXTURE, NIGHT_TEXTURE, NIGHT_BASE_TEXTURE, STATIC_CLOUD_TEXTURE, PRECIP_TEXTURE, NORMAL_TEXTURE, SPECULAR_TEXTURE]);
  const dayTexture = textures[0];
  const nightTexture = textures[1];
  const baseNightTexture = textures[2];
  const staticCloudTexture = textures[3];
  const precipTexture = textures[4];
  const normalTexture = textures[5];
  const specularTexture = textures[6];
  const uniforms = useMemo(() => ({
    dayTexture: { value: dayTexture },
    nightTexture: { value: nightTexture },
    sunDirection: { value: getSunDirection(new Date()) },
    lightsEnabled: { value: props.cityLights ? 1 : 0 },
  }), [dayTexture, nightTexture]);
  const glintUniforms = useMemo(() => ({
    oceanMask: { value: specularTexture },
    sunDirection: uniforms.sunDirection,
    northDirection: { value: globeWorldNormal(90, 0) },
    intensity: { value: props.cinematic ? 0.94 : 0.80 },
    time: { value: 0 },
  }), [specularTexture, uniforms]);

  useEffect(() => {
    const anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    [dayTexture, nightTexture, baseNightTexture, staticCloudTexture, precipTexture].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
      texture.needsUpdate = true;
    });
    normalTexture.colorSpace = THREE.NoColorSpace;
    specularTexture.colorSpace = THREE.NoColorSpace;
    normalTexture.anisotropy = anisotropy;
    specularTexture.anisotropy = anisotropy;
    normalTexture.minFilter = THREE.LinearMipmapLinearFilter;
    specularTexture.minFilter = THREE.LinearMipmapLinearFilter;
    normalTexture.magFilter = THREE.LinearFilter;
    specularTexture.magFilter = THREE.LinearFilter;
    normalTexture.needsUpdate = true;
    specularTexture.needsUpdate = true;
  }, [dayTexture, nightTexture, baseNightTexture, staticCloudTexture, precipTexture, normalTexture, specularTexture, gl]);

  useEffect(() => { uniforms.lightsEnabled.value = props.cityLights ? 1 : 0; }, [props.cityLights, uniforms]);
  useEffect(() => { glintUniforms.intensity.value = props.cinematic ? 0.94 : 0.80; }, [props.cinematic, glintUniforms]);

  useFrame(({ clock }) => {
    uniforms.sunDirection.value.copy(getSunDirection(new Date()));
    glintUniforms.time.value = clock.elapsedTime;
  });

  const markerPoint = props.marker ? latLonToPoint(props.marker.lat, props.marker.lon) : null;

  return (
    <group position={GLOBE_CENTER} scale={GLOBE_SCALE} rotation={GLOBE_ROTATION}>
      <mesh ref={earthRef} renderOrder={0}>
        <sphereGeometry args={[2.5, 192, 192]} />
        <meshPhysicalMaterial
          map={dayTexture}
          normalMap={normalTexture}
          normalScale={new THREE.Vector2(props.cinematic ? 0.18 : 0.21, props.cinematic ? 0.18 : 0.21)}
          roughness={props.cinematic ? 0.66 : 0.72}
          metalness={0.0}
          clearcoat={props.cinematic ? 0.14 : 0.10}
          clearcoatMap={specularTexture}
          clearcoatRoughness={props.cinematic ? 0.44 : 0.56}
          color={props.cinematic ? "#eef5ff" : "#ffffff"}
        />
      </mesh>

      <mesh scale={1.0018} renderOrder={1}>
        <sphereGeometry args={[2.5, 128, 128]} />
        <meshPhysicalMaterial
          color={props.cinematic ? "#12679a" : "#105b8c"}
          alphaMap={specularTexture}
          transparent
          opacity={props.cinematic ? 0.20 : 0.16}
          depthTest={false}
          depthWrite={false}
          roughness={props.cinematic ? 0.28 : 0.36}
          metalness={0.0}
          clearcoat={props.cinematic ? 0.48 : 0.38}
          clearcoatRoughness={0.22}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* A soft ocean-only solar path. Never changes the existing day/night,
          clouds, limb atmosphere or the base physical ocean material. */}
      <mesh scale={1.0025} renderOrder={2}>
        <sphereGeometry args={[2.5, 144, 144]} />
        <shaderMaterial
          uniforms={glintUniforms}
          vertexShader={OCEAN_SUN_GLINT_VERTEX_SHADER}
          fragmentShader={OCEAN_SUN_GLINT_FRAGMENT_SHADER}
          transparent
          depthTest
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>

      {props.cityLights && (
        <mesh scale={1.0034} renderOrder={2}>
          <sphereGeometry args={[2.5, 128, 128]} />
          <shaderMaterial
            uniforms={{
              nightTexture: { value: nightTexture },
              baseNightTexture: { value: baseNightTexture },
              sunDirection: uniforms.sunDirection,
              lightsEnabled: uniforms.lightsEnabled,
            }}
            vertexShader={NIGHT_VERTEX_SHADER}
            fragmentShader={NIGHT_FRAGMENT_SHADER}
            transparent
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {props.clouds && (
        <LiveCloudLayer
          staticCloudTexture={staticCloudTexture}
          dayTexture={dayTexture}
          sunDirection={uniforms.sunDirection}
          cinematic={props.cinematic}
        />
      )}

      {props.precipitation && (
        <mesh scale={1.0165} renderOrder={5}>
          <sphereGeometry args={[2.5, 128, 128]} />
          <meshBasicMaterial
            map={precipTexture}
            transparent
            opacity={0.68}
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </mesh>
      )}





      {/* Optical halo behind the globe: camera-facing, soft and edge-less.
          The Earth itself depth-occludes the center so only the atmospheric glow remains. */}
      <Billboard follow>
        <mesh renderOrder={6} frustumCulled={false}>
          <circleGeometry args={[2.86, 192]} />
          <shaderMaterial
            uniforms={{
              intensity: { value: props.cinematic ? 1.52 : 1.34 },
            }}
            vertexShader={ATMOSPHERE_DISC_VERTEX_SHADER}
            fragmentShader={ATMOSPHERE_DISC_FRAGMENT_SHADER}
            transparent
            depthTest
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </Billboard>

      {/* Bright atmospheric core anchored directly to the Earth limb. */}
      <mesh scale={1.00001} renderOrder={18}>
        <sphereGeometry args={[2.5, 192, 192]} />
        <shaderMaterial
          uniforms={{
            sunDirection: uniforms.sunDirection,
            intensity: { value: props.cinematic ? 1.28 : 1.16 },
          }}
          vertexShader={LIMB_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_CORE_FRAGMENT_SHADER}
          side={THREE.FrontSide}
          transparent
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Weaker inward scatter: atmosphere gently washes over surface and clouds near the horizon. */}
      <mesh scale={1.00010} renderOrder={20}>
        <sphereGeometry args={[2.5, 192, 192]} />
        <shaderMaterial
          uniforms={{
            sunDirection: uniforms.sunDirection,
            intensity: { value: props.cinematic ? 1.48 : 1.30 },
          }}
          vertexShader={LIMB_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_INNER_FRAGMENT_SHADER}
          side={THREE.FrontSide}
          transparent
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>



      {props.marker && props.windSpeed != null && props.weatherLayer === "WIND" && <WindHalo lat={props.marker.lat} lon={props.marker.lon} speed={props.windSpeed} />}

      {props.marker && props.temperature != null && props.weatherLayer === "TEMPERATURE" && <TemperatureHalo lat={props.marker.lat} lon={props.marker.lon} temperature={props.temperature} />}

      {markerPoint && (
        <group position={markerPoint}>
          <mesh>
            <sphereGeometry args={[0.035, 24, 24]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh scale={2.7}>
            <sphereGeometry args={[0.035, 20, 20]} />
            <meshBasicMaterial color="#49a9ff" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}


const AURORA_RIBBON_VERTEX_SHADER = `
  attribute float aIntensity;
  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vIntensity = aIntensity;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normalize(position));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const AURORA_RIBBON_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLayer;
  uniform vec3 uSunDirection;
  varying vec2 vUv;
  varying float vIntensity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float facing = max(dot(normal, viewDir), 0.0);
    float horizonFade = smoothstep(0.015, 0.16, facing);

    float sunDot = dot(normal, normalize(uSunDirection));
    float night = 1.0 - smoothstep(-0.10, 0.055, sunDot);
    float twilight = 1.0 - smoothstep(-0.22, -0.04, sunDot);
    float visibility = max(night, twilight * 0.34);

    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float ribbonCore = pow(smoothstep(0.0, 0.84, across), 0.72);
    float curtainEdge = pow(clamp(across, 0.0, 1.0), 1.8);

    float waveA = sin(vUv.x * 132.0 + uTime * (0.82 + uLayer * 0.16));
    float waveB = sin(vUv.x * 263.0 - uTime * 0.46 + vUv.y * 8.5);
    float waveC = sin(vUv.x * 61.0 + uTime * 0.21 - vUv.y * 14.0);
    float streak = pow(0.5 + 0.5 * waveA, 8.0) * 0.58;
    streak += pow(0.5 + 0.5 * waveB, 11.0) * 0.31;
    streak += pow(0.5 + 0.5 * waveC, 5.0) * 0.15;
    streak += noise(vec2(vUv.x * 44.0 + uTime * 0.026, vUv.y * 11.0)) * 0.20;

    float probability = smoothstep(0.055, 0.76, vIntensity);
    float strongProbability = smoothstep(0.38, 0.94, vIntensity);
    float pulse = 0.88 + 0.12 * sin(uTime * 0.48 + vUv.x * 23.0 + uLayer);

    float veil = ribbonCore * (0.13 + streak * 0.86);
    float alpha = probability * veil * horizonFade * visibility * pulse * uOpacity;
    alpha += strongProbability * curtainEdge * streak * 0.10 * visibility * uOpacity;
    if (alpha < 0.004) discard;

    vec3 oxygenGreen = vec3(0.02, 1.04, 0.36);
    vec3 emerald = vec3(0.02, 0.77, 0.42);
    vec3 cyan = vec3(0.06, 0.76, 1.12);
    vec3 violet = vec3(0.46, 0.20, 1.05);

    vec3 color = mix(emerald, oxygenGreen, clamp(probability * 1.18, 0.0, 1.0));
    color = mix(color, cyan, smoothstep(0.42, 0.96, streak) * (0.22 + uLayer * 0.10));
    color = mix(color, violet, strongProbability * pow(streak, 3.0) * 0.16);

    float emission = 1.42 + probability * 1.55 + streak * 0.72 + uLayer * 0.22;
    gl_FragColor = vec4(color * alpha * emission, alpha);
  }
`;

function buildAuroraRibbonGeometry(points: AuroraPoint[], hemisphere: 1 | -1, kp: number) {
  const step = 3;
  const minPolarLatitude = THREE.MathUtils.lerp(52, 43, THREE.MathUtils.clamp((kp - 2) / 6, 0, 1));
  const bins: Array<{ lon: number; lat: number; intensity: number; spread: number } | null> = [];

  for (let lon = -180; lon <= 180; lon += step) {
    const candidates = points.filter((point) => {
      const pLon = point.longitude > 180 ? point.longitude - 360 : point.longitude;
      if (Math.abs(pLon - lon) > step * 0.72) return false;
      if (hemisphere === 1 && point.latitude < minPolarLatitude) return false;
      if (hemisphere === -1 && point.latitude > -minPolarLatitude) return false;
      const polarLat = Math.abs(point.latitude);
      return polarLat <= 86 && point.intensity >= 5;
    });

    if (!candidates.length) {
      bins.push(null);
      continue;
    }

    let weightSum = 0;
    let latSum = 0;
    let maxIntensity = 0;

    for (const point of candidates) {
      const normalized = THREE.MathUtils.clamp(point.intensity / 100, 0, 1);
      const weight = Math.pow(Math.max(normalized, 0.03), 1.7);
      weightSum += weight;
      latSum += point.latitude * weight;
      maxIntensity = Math.max(maxIntensity, normalized);
    }

    if (weightSum <= 0 || maxIntensity < 0.05) {
      bins.push(null);
      continue;
    }

    const centerLat = latSum / weightSum;
    let variance = 0;
    for (const point of candidates) {
      const normalized = THREE.MathUtils.clamp(point.intensity / 100, 0, 1);
      const weight = Math.pow(Math.max(normalized, 0.03), 1.7);
      variance += Math.pow(point.latitude - centerLat, 2) * weight;
    }

    const spread = Math.sqrt(variance / weightSum);

    bins.push({
      lon,
      lat: centerLat,
      intensity: maxIntensity,
      spread,
    });
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const intensities: number[] = [];
  const radius = 2.5;
  const kpExpansion = THREE.MathUtils.clamp((kp - 2.0) / 6.0, 0, 1);

  const pushVertex = (lat: number, lon: number, u: number, v: number, intensity: number) => {
    const p = latLonToPoint(lat, lon, radius);
    positions.push(p.x, p.y, p.z);
    uvs.push(u, v);
    intensities.push(intensity);
  };

  for (let i = 0; i < bins.length - 1; i++) {
    const a = bins[i];
    const b = bins[i + 1];
    if (!a || !b) continue;
    if (Math.abs(a.lat - b.lat) > 13) continue;

    const widthA = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(1.9, 5.6, a.intensity) + a.spread * 1.35 + kpExpansion * 2.4,
      1.8,
      10.5,
    );
    const widthB = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(1.9, 5.6, b.intensity) + b.spread * 1.35 + kpExpansion * 2.4,
      1.8,
      10.5,
    );

    const equatorShiftA = hemisphere * -kpExpansion * (1.0 + a.intensity * 1.5);
    const equatorShiftB = hemisphere * -kpExpansion * (1.0 + b.intensity * 1.5);
    const centerA = a.lat + equatorShiftA;
    const centerB = b.lat + equatorShiftB;
    const sign = hemisphere;

    const aInner = centerA - sign * widthA * 0.56;
    const aOuter = centerA + sign * widthA * 0.44;
    const bInner = centerB - sign * widthB * 0.56;
    const bOuter = centerB + sign * widthB * 0.44;

    const u0 = i / (bins.length - 1);
    const u1 = (i + 1) / (bins.length - 1);

    pushVertex(aInner, a.lon, u0, 0, a.intensity);
    pushVertex(aOuter, a.lon, u0, 1, a.intensity);
    pushVertex(bOuter, b.lon, u1, 1, b.intensity);

    pushVertex(aInner, a.lon, u0, 0, a.intensity);
    pushVertex(bOuter, b.lon, u1, 1, b.intensity);
    pushVertex(bInner, b.lon, u1, 0, b.intensity);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aIntensity", new THREE.Float32BufferAttribute(intensities, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function AuroraRibbon({
  geometry,
  layer,
  opacity,
  scale,
}: {
  geometry: THREE.BufferGeometry;
  layer: number;
  opacity: number;
  scale: number;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: opacity },
    uLayer: { value: layer },
    uSunDirection: { value: getSunDirection(new Date()) },
  }), [opacity, layer]);

  useFrame(({ clock }) => {
    if (!material.current) return;
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uSunDirection.value.copy(getSunDirection(new Date()));
  });

  return (
    <mesh geometry={geometry} scale={scale} renderOrder={8 + layer}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={AURORA_RIBBON_VERTEX_SHADER}
        fragmentShader={AURORA_RIBBON_FRAGMENT_SHADER}
        transparent
        depthTest
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function AuroraOvalLayer({ points, kp }: { points: AuroraPoint[]; kp: number }) {
  const safeKp = Number.isFinite(kp) ? THREE.MathUtils.clamp(kp, 0, 9) : 0;
  const north = useMemo(() => buildAuroraRibbonGeometry(points, 1, safeKp), [points, safeKp]);
  const south = useMemo(() => buildAuroraRibbonGeometry(points, -1, safeKp), [points, safeKp]);
  const kpBoost = THREE.MathUtils.clamp((safeKp - 2) / 5.5, 0, 1);

  useEffect(() => {
    return () => {
      north.dispose();
      south.dispose();
    };
  }, [north, south]);

  if (!points.length) return null;

  return (
    <group position={GLOBE_CENTER} rotation={GLOBE_ROTATION} scale={GLOBE_SCALE}>
      <AuroraRibbon geometry={north} layer={0} opacity={0.56 + kpBoost * 0.16} scale={1.0106} />
      <AuroraRibbon geometry={north} layer={1} opacity={0.24 + kpBoost * 0.08} scale={1.0178} />
      <AuroraRibbon geometry={north} layer={2} opacity={0.095 + kpBoost * 0.055} scale={1.0260} />
      <AuroraRibbon geometry={south} layer={0} opacity={0.52 + kpBoost * 0.14} scale={1.0106} />
      <AuroraRibbon geometry={south} layer={1} opacity={0.21 + kpBoost * 0.07} scale={1.0178} />
      <AuroraRibbon geometry={south} layer={2} opacity={0.082 + kpBoost * 0.048} scale={1.0260} />
    </group>
  );
}

function SeismicMarker({ event, index }: { event: EarthquakeEvent; index: number }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);
  const ringCRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const magnitude = THREE.MathUtils.clamp(event.magnitude, 2.5, 8.5);
  const strength = THREE.MathUtils.clamp((magnitude - 2.5) / 6.0, 0, 1);
  const ageHours = Math.max(0, (Date.now() - event.time) / 3600000);
  const recency = THREE.MathUtils.clamp(1 - ageHours / 24, 0.08, 1);
  const freshness = Math.pow(recency, 0.58);

  const point = useMemo(
    () => globeWorldPoint(event.latitude, event.longitude, 0.0045),
    [event.latitude, event.longitude],
  );
  const normal = useMemo(
    () => globeWorldNormal(event.latitude, event.longitude),
    [event.latitude, event.longitude],
  );
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    return q;
  }, [normal]);

  const palette = useMemo(() => {
    if (magnitude >= 7.0) return { core: "#fffaf0", glow: "#ff3f2e", ring: "#ff5a3f" };
    if (magnitude >= 6.0) return { core: "#fff7e8", glow: "#ff6244", ring: "#ff7757" };
    if (magnitude >= 5.0) return { core: "#fff1d8", glow: "#ff9c50", ring: "#ffad62" };
    return { core: "#ffedc7", glow: "#dca15b", ring: "#e0b06f" };
  }, [magnitude]);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;

    const viewDir = camera.position.clone().sub(point).normalize();
    const facing = THREE.MathUtils.clamp(normal.dot(viewDir), -1, 1);
    const horizonFade = THREE.MathUtils.smoothstep(facing, 0.035, 0.20);
    const visible = horizonFade * freshness;

    if (groupRef.current) {
      groupRef.current.visible = visible > 0.012;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.70, 1.0, horizonFade));
    }

    const speed = THREE.MathUtils.lerp(0.34, 0.78, strength) * THREE.MathUtils.lerp(0.82, 1.08, recency);
    const phaseA = (t * speed + index * 0.173) % 1;
    const phaseB = (phaseA + 0.34) % 1;
    const phaseC = (phaseA + 0.67) % 1;

    const pulse = 0.86 + Math.sin((t * (1.05 + strength * 0.85) + index) * Math.PI * 2) * (0.10 + strength * 0.07);

    if (coreRef.current) {
      const s = THREE.MathUtils.lerp(0.80, 1.72, strength) * pulse;
      coreRef.current.scale.setScalar(s);
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(0.62, 0.98, strength) * visible;
    }

    if (glowRef.current) {
      const s = THREE.MathUtils.lerp(2.0, 4.2, strength) * (0.96 + pulse * 0.08);
      glowRef.current.scale.setScalar(s);
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(0.08, 0.24, strength) * visible;
    }

    const animateRing = (mesh: THREE.Mesh | null, p: number, tier: 0 | 1 | 2) => {
      if (!mesh) return;
      const eased = 1 - Math.pow(1 - p, 2.2);
      const base = THREE.MathUtils.lerp(1.42, 2.20, strength);
      const spread = THREE.MathUtils.lerp(2.5, 5.4, strength) * (1 + tier * 0.11);
      mesh.scale.setScalar(base + eased * spread);
      const material = mesh.material as THREE.MeshBasicMaterial;
      const baseOpacity = tier === 0 ? 0.25 : tier === 1 ? 0.17 : 0.11;
      const fade = Math.pow(1 - p, 1.55 + tier * 0.12);
      material.opacity = fade * THREE.MathUtils.lerp(baseOpacity * 0.48, baseOpacity, strength) * visible;
    };

    animateRing(ringARef.current, phaseA, 0);
    if (magnitude >= 4.8) animateRing(ringBRef.current, phaseB, 1);
    if (magnitude >= 6.0) animateRing(ringCRef.current, phaseC, 2);
  });

  const coreRadius = THREE.MathUtils.lerp(0.010, 0.021, strength);

  return (
    <group ref={groupRef} position={point} quaternion={quaternion}>
      <mesh ref={glowRef} renderOrder={10}>
        <circleGeometry args={[coreRadius * 2.6, 36]} />
        <meshBasicMaterial
          color={palette.glow}
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={ringARef} renderOrder={9}>
        <ringGeometry args={[coreRadius * 2.22, coreRadius * 2.50, 56]} />
        <meshBasicMaterial
          color={palette.ring}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {magnitude >= 4.8 && (
        <mesh ref={ringBRef} renderOrder={9}>
          <ringGeometry args={[coreRadius * 2.08, coreRadius * 2.32, 56]} />
          <meshBasicMaterial
            color={palette.ring}
            transparent
            opacity={0.12}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}

      {magnitude >= 6.0 && (
        <mesh ref={ringCRef} renderOrder={9}>
          <ringGeometry args={[coreRadius * 1.96, coreRadius * 2.18, 64]} />
          <meshBasicMaterial
            color={palette.ring}
            transparent
            opacity={0.09}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}

      <mesh ref={coreRef} renderOrder={11}>
        <circleGeometry args={[coreRadius, 30]} />
        <meshBasicMaterial
          color={palette.core}
          transparent
          opacity={0.96}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function EarthquakeLayer({ events }: { events: EarthquakeEvent[] }) {
  const visibleEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => event.magnitude >= 3.2)
      .sort((a, b) => {
        const ageA = Math.max(0, (now - a.time) / 3600000);
        const ageB = Math.max(0, (now - b.time) / 3600000);
        const recencyA = Math.max(0, 1 - ageA / 24);
        const recencyB = Math.max(0, 1 - ageB / 24);
        const scoreA = Math.pow(a.magnitude, 1.45) + recencyA * 3.0;
        const scoreB = Math.pow(b.magnitude, 1.45) + recencyB * 3.0;
        return scoreB - scoreA;
      })
      .slice(0, 48);
  }, [events]);

  return (
    <group>
      {visibleEvents.map((event, index) => (
        <SeismicMarker key={event.id} event={event} index={index} />
      ))}
    </group>
  );
}


function VolcanoMarker({ event, index }: { event: VolcanoEvent; index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const plumeRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const point = useMemo(
    () => globeWorldPoint(event.latitude, event.longitude, 0.0055),
    [event.latitude, event.longitude],
  );
  const normal = useMemo(
    () => globeWorldNormal(event.latitude, event.longitude),
    [event.latitude, event.longitude],
  );
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    return q;
  }, [normal]);

  const eventAgeHours = event.eventTime
    ? Math.max(0, (Date.now() - new Date(event.eventTime).getTime()) / 3600000)
    : 24 * 14;
  const recency = THREE.MathUtils.clamp(1 - eventAgeHours / (24 * 45), 0.28, 1);
  const magnitudeBoost = event.magnitude != null
    ? THREE.MathUtils.clamp(event.magnitude / 8, 0, 0.35)
    : 0;
  const strength = THREE.MathUtils.clamp(recency + magnitudeBoost, 0.32, 1.25);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    const viewDir = camera.position.clone().sub(point).normalize();
    const facing = THREE.MathUtils.clamp(normal.dot(viewDir), -1, 1);
    const horizonFade = THREE.MathUtils.smoothstep(facing, 0.02, 0.20);

    if (groupRef.current) {
      groupRef.current.visible = horizonFade > 0.01;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.72, 1.0, horizonFade));
    }

    const pulse = 0.88 + Math.sin((t * 1.45 + index * 0.67) * Math.PI * 2) * 0.12;

    if (coreRef.current) {
      coreRef.current.scale.setScalar(THREE.MathUtils.lerp(0.86, 1.40, strength) * pulse);
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.70 + strength * 0.20) * horizonFade;
    }

    if (glowRef.current) {
      glowRef.current.scale.setScalar(THREE.MathUtils.lerp(1.55, 2.55, strength) * (0.95 + pulse * 0.08));
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(0.08, 0.18, strength) * horizonFade;
    }

    if (plumeRef.current) {
      const plumePulse = 0.90 + Math.sin(t * 0.82 + index) * 0.10;
      plumeRef.current.scale.set(1, 1, plumePulse);
      const material = plumeRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(0.08, 0.17, strength) * horizonFade;
    }

    if (ringRef.current) {
      const phase = (t * THREE.MathUtils.lerp(0.24, 0.42, strength) + index * 0.19) % 1;
      const eased = 1 - Math.pow(1 - phase, 2);
      ringRef.current.scale.setScalar(1.15 + eased * THREE.MathUtils.lerp(1.5, 2.65, strength));
      const material = ringRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.pow(1 - phase, 1.7) * THREE.MathUtils.lerp(0.08, 0.16, strength) * horizonFade;
    }
  });

  return (
    <group ref={groupRef} position={point} quaternion={quaternion}>
      <mesh ref={glowRef} renderOrder={11}>
        <circleGeometry args={[0.030, 36]} />
        <meshBasicMaterial
          color="#ff5b2f"
          transparent
          opacity={0.13}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={ringRef} renderOrder={11}>
        <ringGeometry args={[0.020, 0.024, 48]} />
        <meshBasicMaterial
          color="#ff8a4f"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={plumeRef} position={[0, 0, 0.050]} rotation={[Math.PI / 2, 0, 0]} renderOrder={12}>
        <coneGeometry args={[0.012, 0.075, 20, 1, true]} />
        <meshBasicMaterial
          color="#ff7a3d"
          transparent
          opacity={0.13}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={coreRef} renderOrder={13}>
        <sphereGeometry args={[0.0105, 16, 16]} />
        <meshBasicMaterial
          color="#fff0c2"
          transparent
          opacity={0.92}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function VolcanoLayer({ volcanoes }: { volcanoes: VolcanoEvent[] }) {
  return (
    <group>
      {volcanoes.slice(0, 32).map((event, index) => (
        <VolcanoMarker key={event.id} event={event} index={index} />
      ))}
    </group>
  );
}


function WildfireLayer({ hotspots }: { hotspots: WildfireHotspot[] }) {
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const visibleHotspots = useMemo(() => hotspots.slice(0, 220), [hotspots]);

  useEffect(() => {
    if (!coreRef.current || !glowRef.current || !visibleHotspots.length) return;

    const dummy = new THREE.Object3D();
    const now = Date.now();

    visibleHotspots.forEach((hotspot, index) => {
      const position = globeWorldPoint(hotspot.latitude, hotspot.longitude, 0.0050);
      const frp = Math.max(0, hotspot.frp ?? 0);
      const brightness = Math.max(300, hotspot.brightness ?? 300);
      const ageHours = hotspot.acquiredAt
        ? Math.max(0, (now - new Date(hotspot.acquiredAt).getTime()) / 3600000)
        : 12;
      const recency = THREE.MathUtils.clamp(1 - ageHours / 30, 0.18, 1);
      const thermal = THREE.MathUtils.clamp(
        Math.log2(1 + frp) / 7 + Math.max(0, brightness - 315) / 170,
        0.12,
        1,
      );
      const confidenceBoost =
        hotspot.confidence?.toLowerCase() === "h" || hotspot.confidence?.toLowerCase() === "high"
          ? 1.16
          : 1;
      const strength = THREE.MathUtils.clamp((0.30 + thermal * 0.86) * recency * confidenceBoost, 0.18, 1.35);

      dummy.position.copy(position);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(THREE.MathUtils.lerp(0.72, 1.72, strength));
      dummy.updateMatrix();
      coreRef.current!.setMatrixAt(index, dummy.matrix);

      dummy.scale.setScalar(THREE.MathUtils.lerp(0.95, 2.45, strength));
      dummy.updateMatrix();
      glowRef.current!.setMatrixAt(index, dummy.matrix);
    });

    coreRef.current.instanceMatrix.needsUpdate = true;
    glowRef.current.instanceMatrix.needsUpdate = true;
  }, [visibleHotspots]);

  useFrame(({ clock }) => {
    const pulse = 0.86 + Math.sin(clock.elapsedTime * 2.4) * 0.14;
    if (coreRef.current) {
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.76 + pulse * 0.18;
    }
    if (glowRef.current) {
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + pulse * 0.055;
    }
  });

  if (!visibleHotspots.length) return null;

  return (
    <>
      <instancedMesh ref={glowRef} args={[undefined, undefined, visibleHotspots.length]} frustumCulled={false} renderOrder={11}>
        <sphereGeometry args={[0.030, 10, 10]} />
        <meshBasicMaterial
          color="#ff5a24"
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={coreRef} args={[undefined, undefined, visibleHotspots.length]} frustumCulled={false} renderOrder={12}>
        <sphereGeometry args={[0.0105, 10, 10]} />
        <meshBasicMaterial
          color="#ffd08b"
          transparent
          opacity={0.92}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}


function StormForecastTrack({ storm }: { storm: TropicalStorm }) {
  const points = useMemo(
    () => (storm.track || [])
      .filter((point) => point.tau >= 0)
      .slice(0, 10)
      .map((point) => globeWorldPoint(point.latitude, point.longitude, 0.0070)),
    [storm.track],
  );

  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    if (points.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.18);
      next.setFromPoints(curve.getPoints(Math.max(240, points.length * 4)));
    }
    return next;
  }, [points]);

  const trackLine = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#76c8ff",
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 12;
    return line;
  }, [geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      (trackLine.material as THREE.Material).dispose();
    };
  }, [geometry, trackLine]);

  if (points.length < 2) return null;

  return (
    <group>
      <primitive object={trackLine} />

      {(storm.track || []).slice(1, 8).map((forecast, index) => {
        const p = globeWorldPoint(forecast.latitude, forecast.longitude, 0.0080);
        const size = index === 0 ? 0.013 : 0.010;
        return (
          <mesh key={storm.id + "-forecast-" + forecast.tau + "-" + index} position={p} renderOrder={13}>
            <sphereGeometry args={[size, 14, 14]} />
            <meshBasicMaterial
              color={index === 0 ? "#dff5ff" : "#69bcff"}
              transparent
              opacity={Math.max(0.18, 0.62 - index * 0.065)}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function StormMarker({ storm, index, showForecast }: { storm: TropicalStorm; index: number; showForecast: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const arcRef = useRef<THREE.Mesh>(null);

  const point = useMemo(
    () => globeWorldPoint(storm.latitude, storm.longitude, 0.0065),
    [storm.latitude, storm.longitude],
  );
  const normal = useMemo(
    () => globeWorldNormal(storm.latitude, storm.longitude),
    [storm.latitude, storm.longitude],
  );
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    return q;
  }, [normal]);

  const wind = storm.windKnots ?? 35;
  const strength = THREE.MathUtils.clamp((wind - 25) / 115, 0, 1);
  const radius = THREE.MathUtils.lerp(0.030, 0.058, strength);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    const viewDir = camera.position.clone().sub(point).normalize();
    const facing = THREE.MathUtils.clamp(normal.dot(viewDir), -1, 1);
    const horizonFade = THREE.MathUtils.smoothstep(facing, 0.02, 0.20);

    if (groupRef.current) {
      groupRef.current.visible = horizonFade > 0.01;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.78, 1.0, horizonFade));
    }

    if (coreRef.current) {
      const pulse = 1 + Math.sin((t * 1.05 + index * 0.7) * Math.PI * 2) * 0.10;
      coreRef.current.scale.setScalar(pulse);
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.78 + strength * 0.18) * horizonFade;
    }

    if (glowRef.current) {
      const glowPulse = 1.0 + Math.sin((t * 0.72 + index * 0.31) * Math.PI * 2) * 0.07;
      glowRef.current.scale.setScalar(glowPulse);
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.10 + strength * 0.09) * horizonFade;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = -t * (0.24 + strength * 0.20);
      const material = ringRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.22 + strength * 0.10) * horizonFade;
    }

    if (arcRef.current) {
      arcRef.current.rotation.z = t * (0.32 + strength * 0.24);
      const material = arcRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.16 + strength * 0.12) * horizonFade;
    }
  });

  return (
    <>
      {showForecast && <StormForecastTrack storm={storm} />}

      <group ref={groupRef} position={point} quaternion={quaternion}>
        <mesh ref={glowRef} renderOrder={12}>
          <circleGeometry args={[radius * 2.45, 48]} />
          <meshBasicMaterial
            color="#3e9cff"
            transparent
            opacity={0.14}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh ref={ringRef} renderOrder={13}>
          <ringGeometry args={[radius * 1.32, radius * 1.50, 72, 1, 0.18, Math.PI * 1.58]} />
          <meshBasicMaterial
            color="#79c9ff"
            transparent
            opacity={0.26}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh ref={arcRef} renderOrder={13}>
          <ringGeometry args={[radius * 1.72, radius * 1.90, 72, 1, 2.52, Math.PI * 1.14]} />
          <meshBasicMaterial
            color="#d9efff"
            transparent
            opacity={0.19}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh ref={coreRef} renderOrder={14}>
          <circleGeometry args={[radius * 0.48, 36]} />
          <meshBasicMaterial
            color="#f7fcff"
            transparent
            opacity={0.90}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
    </>
  );
}

function StormLayer({ storms, showForecast }: { storms: TropicalStorm[]; showForecast: boolean }) {
  return (
    <group>
      {storms.slice(0, 12).map((storm, index) => (
        <StormMarker key={storm.id} storm={storm} index={index} showForecast={showForecast} />
      ))}
    </group>
  );
}


function LightningLayer({ onTelemetry }: { onTelemetry?: (telemetry: ObservedLightningTelemetry) => void }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const currentTextureRef = useRef<THREE.Texture | null>(null);
  const currentEuropeTextureRef = useRef<THREE.Texture | null>(null);
  const telemetryRef = useRef<ObservedLightningTelemetry>({
    noaaCells: 0,
    mtgCells: 0,
    noaaAvailable: false,
    mtgAvailable: false,
    noaaAgeMinutes: null,
    mtgAgeMinutes: null,
    noaaObservationTime: null,
    mtgObservationTime: null,
    noaaSource: null,
    mtgSource: null,
    updatedAt: null,
  });
  const transparentFallback = useMemo(() => {
    const data = new Uint8Array([0, 0, 0, 0]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  const uniforms = useMemo(() => ({
    lightningTexture: { value: transparentFallback as THREE.Texture },
    lightningEuropeTexture: { value: transparentFallback as THREE.Texture },
    time: { value: 0 },
  }), [transparentFallback]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;

    const prepareLightningTexture = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    };

    const disposeLightningTexture = (texture: THREE.Texture | null) => {
      if (!texture || texture === transparentFallback) return;
      const image = texture.image as ImageBitmap | undefined;
      texture.dispose();
      if (image && typeof image.close === "function") image.close();
    };

    const countActiveCells = (texture: THREE.Texture) => {
      try {
        const image = texture.image as CanvasImageSource | undefined;
        if (!image) return 0;

        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return 0;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

        let active = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3] / 255;
          const maxRgb = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) / 255;
          if (alpha > 0.030 && maxRgb > 0.050) active += 1;
        }
        return active;
      } catch {
        return 0;
      }
    };

    const emitTelemetry = () => {
      const next = { ...telemetryRef.current, updatedAt: new Date().toISOString() };
      telemetryRef.current = next;
      onTelemetry?.(next);
    };

    const readAge = (headers: Headers) => {
      const raw = headers.get("x-cupola-age-minutes");
      if (raw == null) return null;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : null;
    };

    const loadObservedFeed = async (
      url: string,
      feed: "noaa" | "mtg",
      bucket: number,
    ) => {
      try {
        const response = await fetch(url + "?v=" + bucket, { cache: "no-store" });
        if (cancelled) return;

        const available = response.ok && response.status !== 204 && (response.headers.get("content-type") || "").startsWith("image/");
        const prefix = feed === "noaa" ? "noaa" : "mtg";

        if (!available) {
          if (prefix === "noaa") {
            telemetryRef.current.noaaCells = 0;
            telemetryRef.current.noaaAvailable = false;
            telemetryRef.current.noaaAgeMinutes = null;
            telemetryRef.current.noaaObservationTime = null;
            telemetryRef.current.noaaSource = response.headers.get("x-cupola-source");
          } else {
            telemetryRef.current.mtgCells = 0;
            telemetryRef.current.mtgAvailable = false;
            telemetryRef.current.mtgAgeMinutes = null;
            telemetryRef.current.mtgObservationTime = null;
            telemetryRef.current.mtgSource = response.headers.get("x-cupola-source");
          }
          emitTelemetry();
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;
        const bitmap = await createImageBitmap(blob);
        if (cancelled) {
          bitmap.close();
          return;
        }

        const texture = new THREE.Texture(bitmap);
        prepareLightningTexture(texture);
        const cells = countActiveCells(texture);
        const age = readAge(response.headers);
        const observationTime = response.headers.get("x-cupola-observation-time");
        const source = response.headers.get("x-cupola-source");

        if (feed === "noaa") {
          const previous = currentTextureRef.current;
          currentTextureRef.current = texture;
          uniforms.lightningTexture.value = texture;
          telemetryRef.current.noaaCells = cells;
          telemetryRef.current.noaaAvailable = true;
          telemetryRef.current.noaaAgeMinutes = age;
          telemetryRef.current.noaaObservationTime = observationTime;
          telemetryRef.current.noaaSource = source;
          disposeLightningTexture(previous);
        } else {
          const previous = currentEuropeTextureRef.current;
          currentEuropeTextureRef.current = texture;
          uniforms.lightningEuropeTexture.value = texture;
          telemetryRef.current.mtgCells = cells;
          telemetryRef.current.mtgAvailable = true;
          telemetryRef.current.mtgAgeMinutes = age;
          telemetryRef.current.mtgObservationTime = observationTime;
          telemetryRef.current.mtgSource = source;
          disposeLightningTexture(previous);
        }

        emitTelemetry();
      } catch {
        if (feed === "noaa") {
          telemetryRef.current.noaaCells = 0;
          telemetryRef.current.noaaAvailable = false;
          telemetryRef.current.noaaAgeMinutes = null;
        } else {
          telemetryRef.current.mtgCells = 0;
          telemetryRef.current.mtgAvailable = false;
          telemetryRef.current.mtgAgeMinutes = null;
        }
        emitTelemetry();
      }
    };

    const load = async () => {
      if (cancelled || loading) return;
      loading = true;
      const bucket = Math.floor(Date.now() / (5 * 60 * 1000));

      await Promise.allSettled([
        loadObservedFeed(LIGHTNING_TEXTURE, "noaa", bucket),
        loadObservedFeed(LIGHTNING_EUMETSAT_TEXTURE, "mtg", bucket),
      ]);

      loading = false;
    };

    void load();
    const interval = window.setInterval(() => void load(), 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      disposeLightningTexture(currentTextureRef.current);
      disposeLightningTexture(currentEuropeTextureRef.current);
      currentTextureRef.current = null;
      currentEuropeTextureRef.current = null;
      transparentFallback.dispose();
    };
  }, [onTelemetry, transparentFallback, uniforms]);

  useFrame(({ clock }) => {
    uniforms.time.value = clock.elapsedTime;
  });

  return (
    <mesh scale={1.0175} renderOrder={15}>
      <sphereGeometry args={[2.5, 176, 176]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={LIGHTNING_VERTEX_SHADER}
        fragmentShader={LIGHTNING_FRAGMENT_SHADER}
        transparent
        depthTest
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}


function LightningModelPointMarker({ point, index }: { point: LightningModelPoint; index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const worldPoint = useMemo(
    () => globeWorldPoint(point.latitude, point.longitude, 0.020),
    [point.latitude, point.longitude],
  );
  const normal = useMemo(
    () => globeWorldNormal(point.latitude, point.longitude),
    [point.latitude, point.longitude],
  );
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    return q;
  }, [normal]);

  const strength = THREE.MathUtils.clamp(Math.log10(1 + point.density * 20) / 2.1, 0, 1);
  const radius = THREE.MathUtils.lerp(0.018, 0.036, strength);

  useFrame(({ clock, camera }) => {
    const viewDir = camera.position.clone().sub(worldPoint).normalize();
    const facing = THREE.MathUtils.clamp(normal.dot(viewDir), -1, 1);
    const horizonFade = THREE.MathUtils.smoothstep(facing, 0.03, 0.18);

    if (groupRef.current) {
      groupRef.current.visible = horizonFade > 0.01;
    }

    if (glowRef.current) {
      const pulse = 0.90 + Math.sin((clock.elapsedTime * (0.52 + strength * 0.28) + index) * Math.PI * 2) * 0.12;
      glowRef.current.scale.setScalar(pulse);
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.070 + strength * 0.090) * horizonFade;
    }
  });

  return (
    <group ref={groupRef} position={worldPoint} quaternion={quaternion}>
      <mesh ref={glowRef} renderOrder={12}>
        <circleGeometry args={[radius * 2.4, 24]} />
        <meshBasicMaterial
          color="#6ea8ff"
          transparent
          opacity={0.09}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh renderOrder={13}>
        <ringGeometry args={[radius * 0.86, radius, 28]} />
        <meshBasicMaterial
          color="#b7d2ff"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function LightningModelLayer({ points }: { points: LightningModelPoint[] }) {
  return (
    <group>
      {points.slice(0, 140).map((point, index) => (
        <LightningModelPointMarker
          key={point.latitude + ":" + point.longitude}
          point={point}
          index={index}
        />
      ))}
    </group>
  );
}

function TerminatorLayer() {
  const sunriseRef = useRef<THREE.Group>(null);
  const sunsetRef = useRef<THREE.Group>(null);

  const geometry = useMemo(() => new THREE.BufferGeometry(), []);

  const line = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#74bfff",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const next = new THREE.Line(geometry, material);
    next.renderOrder = 14;
    return next;
  }, [geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [geometry, line]);

  useFrame(() => {
    const now = new Date();
    const sun = getSunDirection(now).normalize();
    const north = globeWorldNormal(90, 0);

    let basisA = new THREE.Vector3().crossVectors(sun, north);
    if (basisA.lengthSq() < 1e-6) {
      basisA = new THREE.Vector3().crossVectors(sun, new THREE.Vector3(1, 0, 0));
    }
    basisA.normalize();
    const basisB = new THREE.Vector3().crossVectors(sun, basisA).normalize();

    const points: THREE.Vector3[] = [];
    const radius = GLOBE_RADIUS + 0.020;
    for (let i = 0; i <= 180; i++) {
      const angle = (i / 180) * Math.PI * 2;
      const normal = basisA.clone().multiplyScalar(Math.cos(angle))
        .add(basisB.clone().multiplyScalar(Math.sin(angle)))
        .normalize();
      points.push(GLOBE_CENTER.clone().add(normal.multiplyScalar(radius)));
    }

    geometry.setFromPoints(points);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();

    const solar = getSolarCoordinates(now);

    if (sunriseRef.current) {
      sunriseRef.current.position.copy(globeWorldPoint(0, solar.sunriseLongitude, 0.030));
    }
    if (sunsetRef.current) {
      sunsetRef.current.position.copy(globeWorldPoint(0, solar.sunsetLongitude, 0.030));
    }
  });

  return (
    <>
      <primitive object={line} />

      <group ref={sunriseRef}>
        <mesh renderOrder={15}>
          <sphereGeometry args={[0.018, 16, 16]} />
          <meshBasicMaterial color="#ffe0a8" toneMapped={false} />
        </mesh>
        <mesh scale={3.0} renderOrder={14}>
          <sphereGeometry args={[0.018, 16, 16]} />
          <meshBasicMaterial
            color="#ff9b55"
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group ref={sunsetRef}>
        <mesh renderOrder={15}>
          <sphereGeometry args={[0.013, 14, 14]} />
          <meshBasicMaterial color="#f6a071" transparent opacity={0.78} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}


function issAltitudeToScene(altitudeKm: number) {
  return GLOBE_RADIUS * THREE.MathUtils.clamp(altitudeKm, 300, 500) / 6371;
}

function IssOrbitLayer({ iss, showTracks }: { iss: IssData; showTracks: boolean }) {
  const markerRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  const orbitPoints = useMemo(
    () => (iss.track || []).map((point) =>
      globeWorldPoint(point.latitude, point.longitude, issAltitudeToScene(point.altitude)),
    ),
    [iss.track],
  );

  const groundPoints = useMemo(
    () => (iss.track || []).map((point) =>
      globeWorldPoint(point.latitude, point.longitude, 0.018),
    ),
    [iss.track],
  );

  const orbitGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    if (orbitPoints.length >= 2) geometry.setFromPoints(orbitPoints);
    return geometry;
  }, [orbitPoints]);

  const groundGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    if (groundPoints.length >= 2) geometry.setFromPoints(groundPoints);
    return geometry;
  }, [groundPoints]);

  const orbitLine = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#bfe8ff",
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(orbitGeometry, material);
    line.renderOrder = 15;
    return line;
  }, [orbitGeometry]);

  const groundLine = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#4fa9e8",
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(groundGeometry, material);
    line.renderOrder = 11;
    return line;
  }, [groundGeometry]);

  const stationPoint = useMemo(
    () => globeWorldPoint(iss.latitude, iss.longitude, issAltitudeToScene(iss.altitude)),
    [iss.latitude, iss.longitude, iss.altitude],
  );

  const stationNormal = useMemo(
    () => globeWorldNormal(iss.latitude, iss.longitude),
    [iss.latitude, iss.longitude],
  );

  const stationQuaternion = useMemo(() => {
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), stationNormal.clone().normalize());
    return quaternion;
  }, [stationNormal]);

  const nextPoint = useMemo(() => {
    const future = (iss.track || [])
      .filter((point) => point.timestamp > iss.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp)[0];
    return future
      ? globeWorldPoint(future.latitude, future.longitude, issAltitudeToScene(future.altitude))
      : null;
  }, [iss.track, iss.timestamp]);

  const directionGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    if (nextPoint) {
      const delta = nextPoint.clone().sub(stationPoint);
      const end = stationPoint.clone().add(delta.normalize().multiplyScalar(0.30));
      geometry.setFromPoints([stationPoint, end]);
    }
    return geometry;
  }, [stationPoint, nextPoint]);

  const directionLine = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(directionGeometry, material);
    line.renderOrder = 16;
    return line;
  }, [directionGeometry]);

  useEffect(() => {
    return () => {
      orbitGeometry.dispose();
      groundGeometry.dispose();
      directionGeometry.dispose();
      (orbitLine.material as THREE.Material).dispose();
      (groundLine.material as THREE.Material).dispose();
      (directionLine.material as THREE.Material).dispose();
    };
  }, [orbitGeometry, groundGeometry, directionGeometry, orbitLine, groundLine, directionLine]);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    const viewDir = camera.position.clone().sub(stationPoint).normalize();
    const facing = THREE.MathUtils.clamp(stationNormal.dot(viewDir), -1, 1);
    const visibility = THREE.MathUtils.smoothstep(facing, -0.10, 0.18);

    if (markerRef.current) {
      markerRef.current.visible = visibility > 0.01;
      const pulse = 1 + Math.sin(t * 3.1) * 0.045;
      markerRef.current.scale.setScalar(pulse);
    }

    if (pulseRef.current) {
      const phase = (t * 0.42) % 1;
      pulseRef.current.scale.setScalar(1.0 + phase * 2.1);
      const material = pulseRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.pow(1 - phase, 1.8) * 0.30 * visibility;
    }
  });

  return (
    <>
      {showTracks && <primitive object={groundLine} />}
      {showTracks && <primitive object={orbitLine} />}
      {showTracks && nextPoint && <primitive object={directionLine} />}

      <group ref={markerRef} position={stationPoint} quaternion={stationQuaternion}>
        <mesh ref={pulseRef} renderOrder={16}>
          <ringGeometry args={[0.030, 0.034, 40]} />
          <meshBasicMaterial
            color="#7dd1ff"
            transparent
            opacity={0.22}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh renderOrder={17}>
          <boxGeometry args={[0.050, 0.028, 0.022]} />
          <meshBasicMaterial color="#eef8ff" toneMapped={false} />
        </mesh>

        <mesh position={[-0.075, 0, 0]} renderOrder={17}>
          <boxGeometry args={[0.085, 0.040, 0.006]} />
          <meshBasicMaterial color="#4ea0d8" transparent opacity={0.92} toneMapped={false} />
        </mesh>

        <mesh position={[0.075, 0, 0]} renderOrder={17}>
          <boxGeometry args={[0.085, 0.040, 0.006]} />
          <meshBasicMaterial color="#4ea0d8" transparent opacity={0.92} toneMapped={false} />
        </mesh>

        <mesh scale={2.4} renderOrder={16}>
          <sphereGeometry args={[0.026, 18, 18]} />
          <meshBasicMaterial
            color="#4ab8ff"
            transparent
            opacity={0.10}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
    </>
  );
}


function satelliteAltitudeToScene(altitudeKm: number) {
  const altitude = Math.max(120, altitudeKm);
  if (altitude <= 2000) {
    return THREE.MathUtils.clamp(GLOBE_RADIUS * altitude / 6371, 0.085, 0.92);
  }
  const compressed = 0.92 + Math.log10(1 + (altitude - 2000) / 1800) * 0.92;
  return THREE.MathUtils.clamp(compressed, 0.92, 2.45);
}

function SatelliteTrack({ satellite }: { satellite: LiveSatellite }) {
  const points = useMemo(
    () => (satellite.track || []).map((point) =>
      globeWorldPoint(point.latitude, point.longitude, satelliteAltitudeToScene(point.altitude)),
    ),
    [satellite.track],
  );

  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    if (points.length >= 2) next.setFromPoints(points);
    return next;
  }, [points]);

  const line = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#86d8ff",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const next = new THREE.Line(geometry, material);
    next.renderOrder = 15;
    return next;
  }, [geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [geometry, line]);

  if (points.length < 2) return null;
  return <primitive object={line} />;
}

function satelliteMotionProgress(satellite: LiveSatellite, nowMs = Date.now()) {
  const targetTime = satellite.motionTarget
    ? new Date(satellite.motionTarget.timestamp).getTime()
    : NaN;
  if (!Number.isFinite(targetTime)) return 0;
  const startTime = targetTime - 180 * 1000;
  return THREE.MathUtils.clamp((nowMs - startTime) / (180 * 1000), 0, 1);
}

function satelliteInterpolatedWorldPoint(
  satellite: LiveSatellite,
  nowMs = Date.now(),
) {
  const current = globeWorldPoint(
    satellite.latitude,
    satellite.longitude,
    satelliteAltitudeToScene(satellite.altitude),
  );
  if (!satellite.motionTarget) return current;

  const target = globeWorldPoint(
    satellite.motionTarget.latitude,
    satellite.motionTarget.longitude,
    satelliteAltitudeToScene(satellite.motionTarget.altitude),
  );

  return current.lerp(target, satelliteMotionProgress(satellite, nowMs));
}

const SATELLITE_FLEET_VERTEX_SHADER = `
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
attribute vec3 instanceColor;
attribute float instanceScale;
attribute float instanceSpin;
attribute float instanceSelected;
attribute float instanceIndex;
attribute float partType;

uniform float uProgress;
uniform float uHoveredIndex;

varying vec3 vColor;
varying float vPartType;
varying vec2 vUv;
varying float vSelected;
varying float vHovered;

void main() {
  vec3 center = mix(instanceStart, instanceEnd, uProgress);
  vec4 mvCenter = modelViewMatrix * vec4(center, 1.0);

  float cs = cos(instanceSpin);
  float sn = sin(instanceSpin);
  vec2 rotated = mat2(cs, -sn, sn, cs) * position.xy;

  // Slightly tighter than before so 16k objects read as spacecraft,
  // not a noisy field of large icons.
  float hovered = 1.0 - step(0.5, abs(instanceIndex - uHoveredIndex));
  float selectedScale = mix(1.0, 1.12, instanceSelected);
  float hoverScale = mix(1.0, 1.85, hovered);
  float apparentScale = clamp((-mvCenter.z) * 0.0045, 0.0085, 0.032) * instanceScale * selectedScale * hoverScale;
  vec4 mvPosition = mvCenter;
  mvPosition.xy += rotated * apparentScale;

  gl_Position = projectionMatrix * mvPosition;
  vColor = instanceColor;
  vPartType = partType;
  vUv = uv;
  vSelected = instanceSelected;
  vHovered = hovered;
}
`;

const SATELLITE_FLEET_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vPartType;
varying vec2 vUv;
varying float vSelected;
varying float vHovered;

void main() {
  // partType: 0 = solar panel, 1 = central bus, 2 = mast / antenna.
  float isBody = step(0.5, vPartType) * (1.0 - step(1.5, vPartType));
  float isMast = step(1.5, vPartType);
  float isPanel = 1.0 - max(isBody, isMast);

  // Cinematic base: panels are almost black navy, bus is gunmetal.
  vec3 panelBase = vec3(0.010, 0.026, 0.048);
  vec3 bodyBase = vec3(0.060, 0.075, 0.090);
  vec3 mastBase = vec3(0.105, 0.125, 0.145);

  // Solar-cell segmentation. At global zoom it reads as texture;
  // up close it becomes a recognizable panel grid.
  float verticalCell = smoothstep(0.46, 0.50, abs(fract(vUv.x * 4.0) - 0.5));
  float horizontalCell = smoothstep(0.46, 0.50, abs(fract(vUv.y * 2.0) - 0.5));
  float panelGrid = max(verticalCell, horizontalCell) * isPanel;

  float panelRim =
    isPanel *
    (1.0 - smoothstep(0.0, 0.085, min(
      min(vUv.x, 1.0 - vUv.x),
      min(vUv.y, 1.0 - vUv.y)
    )));

  // Tiny glint on the spacecraft bus, not a glow over the entire fleet.
  float bodyGlint =
    isBody *
    (1.0 - smoothstep(0.0, 0.34, distance(vUv, vec2(0.60, 0.58))));

  vec3 cyan = vec3(0.12, 0.42, 0.62);
  vec3 coldMetal = vec3(0.26, 0.32, 0.37);

  vec3 panel = panelBase + cyan * (panelGrid * 0.18 + panelRim * 0.12);
  vec3 body = bodyBase + coldMetal * 0.15 + cyan * bodyGlint * 0.42;
  vec3 mast = mastBase + coldMetal * 0.12;

  // Category tint is now almost imperceptible; the fleet has one visual language.
  panel = mix(panel, vColor * 0.12, 0.08);
  body = mix(body, vColor * 0.14, 0.06);

  vec3 color =
    panel * isPanel +
    body * isBody +
    mast * isMast;

  float alpha =
    isPanel * 0.58 +
    isBody * 0.82 +
    isMast * 0.68;

  vec3 hoverBlue = vec3(0.08, 0.58, 1.00);
  color = mix(color, hoverBlue * (1.25 + bodyGlint * 0.72), vHovered);
  alpha = mix(alpha, 1.0, vHovered);

  // Selected fleet instance remains understated because click opens the hero 3D model.
  color = mix(color, vec3(0.16, 0.46, 0.68), vSelected * 0.28);

  gl_FragColor = vec4(color, alpha);
}
`;

function buildSatelliteFleetGeometry(satellites: LiveSatellite[], selectedId: string | null) {
  const geometry = new THREE.InstancedBufferGeometry();

  // Compact spacecraft silhouette: long solar arrays, central bus,
  // plus a short antenna mast. Still one instanced geometry / one draw call.
  const positions = new Float32Array([
    // left panel
    -1.28, -0.18, 0,   -0.34, -0.18, 0,   -0.34, 0.18, 0,   -1.28, 0.18, 0,
    // body
    -0.22, -0.34, 0,    0.22, -0.34, 0,    0.22, 0.34, 0,   -0.22, 0.34, 0,
    // right panel
     0.34, -0.18, 0,    1.28, -0.18, 0,    1.28, 0.18, 0,    0.34, 0.18, 0,
    // mast
    -0.035, 0.34, 0,     0.035, 0.34, 0,     0.035, 0.66, 0,  -0.035, 0.66, 0,
  ]);

  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);

  const partTypes = new Float32Array([
    0, 0, 0, 0,
    1, 1, 1, 1,
    0, 0, 0, 0,
    2, 2, 2, 2,
  ]);

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("partType", new THREE.BufferAttribute(partTypes, 1));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
  ]);

  const count = satellites.length;
  const starts = new Float32Array(count * 3);
  const ends = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const spins = new Float32Array(count);
  const selectedFlags = new Float32Array(count);
  const instanceIndices = new Float32Array(count);

  satellites.forEach((satellite, index) => {
    const start = globeWorldPoint(
      satellite.latitude,
      satellite.longitude,
      satelliteAltitudeToScene(satellite.altitude),
    );

    const end = satellite.motionTarget
      ? globeWorldPoint(
          satellite.motionTarget.latitude,
          satellite.motionTarget.longitude,
          satelliteAltitudeToScene(satellite.motionTarget.altitude),
        )
      : start;

    starts[index * 3] = start.x;
    starts[index * 3 + 1] = start.y;
    starts[index * 3 + 2] = start.z;

    ends[index * 3] = end.x;
    ends[index * 3 + 1] = end.y;
    ends[index * 3 + 2] = end.z;

    const color = new THREE.Color(
      satellite.category === "WEATHER" ? "#27495a" :
      satellite.category === "EARTH OBSERVATION" ? "#2b4f4a" :
      satellite.category === "STARLINK" ? "#354454" :
      satellite.category === "STATION" ? "#5a4934" :
      "#2d4150",
    );

    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;

    scales[index] =
      satellite.category === "STATION" ? 1.30 :
      satellite.category === "WEATHER" ? 1.12 :
      satellite.category === "EARTH OBSERVATION" ? 1.04 :
      satellite.category === "STARLINK" ? 0.78 :
      0.88;

    spins[index] =
      (((Number(satellite.id) || index * 29) % 360) / 360) * Math.PI * 2.0;
    selectedFlags[index] = satellite.id === selectedId ? 1 : 0;
    instanceIndices[index] = index;
  });

  geometry.setAttribute(
    "instanceStart",
    new THREE.InstancedBufferAttribute(starts, 3),
  );
  geometry.setAttribute(
    "instanceEnd",
    new THREE.InstancedBufferAttribute(ends, 3),
  );
  geometry.setAttribute(
    "instanceColor",
    new THREE.InstancedBufferAttribute(colors, 3),
  );
  geometry.setAttribute(
    "instanceScale",
    new THREE.InstancedBufferAttribute(scales, 1),
  );
  geometry.setAttribute(
    "instanceSpin",
    new THREE.InstancedBufferAttribute(spins, 1),
  );
  geometry.setAttribute(
    "instanceSelected",
    new THREE.InstancedBufferAttribute(selectedFlags, 1),
  );
  geometry.setAttribute(
    "instanceIndex",
    new THREE.InstancedBufferAttribute(instanceIndices, 1),
  );
  geometry.instanceCount = count;
  geometry.computeBoundingSphere();

  return geometry;
}

function SatelliteFleet({
  satellites,
  selectedId,
  onSelect,
}: {
  satellites: LiveSatellite[];
  selectedId: string | null;
  onSelect: (satellite: LiveSatellite) => void;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera, gl, size } = useThree();
  const hoverCheckAt = useRef(0);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const visible = satellites;

  const geometry = useMemo(
    () => buildSatelliteFleetGeometry(visible, selectedId),
    [visible, selectedId],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uHoveredIndex: { value: -1 },
    },
    vertexShader: SATELLITE_FLEET_VERTEX_SHADER,
    fragmentShader: SATELLITE_FLEET_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => () => material.dispose(), [material]);

  const findSatelliteAtPointer = useCallback((clientX: number, clientY: number) => {
    if (!visible.length) return null;

    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);

    const ray = raycaster.ray;
    const perspective = camera as THREE.PerspectiveCamera;
    const fovRad = THREE.MathUtils.degToRad(
      perspective.isPerspectiveCamera ? perspective.fov : 41,
    );
    const nowMs = Date.now();

    let bestSatellite: LiveSatellite | null = null;
    let bestIndex = -1;
    let bestScreenDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < visible.length; index += 1) {
      const satellite = visible[index];
      const point = satelliteInterpolatedWorldPoint(satellite, nowMs);
      const toPoint = point.clone().sub(ray.origin);
      const alongRay = toPoint.dot(ray.direction);
      if (alongRay <= 0) continue;

      const closest = ray.origin.clone().addScaledVector(ray.direction, alongRay);
      const worldDistance = point.distanceTo(closest);

      const worldPerPixel =
        (2 * alongRay * Math.tan(fovRad * 0.5)) /
        Math.max(1, size.height);
      const screenDistance = worldDistance / Math.max(worldPerPixel, 0.000001);

      // Keep selection precise even in the dense orbital shell.
      if (screenDistance <= 11 && screenDistance < bestScreenDistance) {
        bestScreenDistance = screenDistance;
        bestSatellite = satellite;
        bestIndex = index;
      }
    }

    return bestSatellite ? { satellite: bestSatellite, index: bestIndex } : null;
  }, [camera, gl, size.height, visible]);

  useEffect(() => {
    const element = gl.domElement;

    const handlePointerMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - hoverCheckAt.current < 90) return;
      hoverCheckAt.current = now;

      const hit = findSatelliteAtPointer(event.clientX, event.clientY);
      setHoveredIndex(hit?.index ?? -1);
      element.style.cursor = hit ? "pointer" : "";
    };

    const handleClick = (event: MouseEvent) => {
      const hit = findSatelliteAtPointer(event.clientX, event.clientY);
      if (!hit) return;

      event.preventDefault();
      event.stopPropagation();
      onSelect(hit.satellite);
      element.style.cursor = "pointer";
    };

    const clearCursor = () => {
      setHoveredIndex(-1);
      element.style.cursor = "";
    };

    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("click", handleClick, true);
    element.addEventListener("pointerleave", clearCursor);

    return () => {
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("click", handleClick, true);
      element.removeEventListener("pointerleave", clearCursor);
      element.style.cursor = "";
    };
  }, [findSatelliteAtPointer, gl, onSelect]);

  useFrame(() => {
    if (!materialRef.current || !visible.length) return;
    materialRef.current.uniforms.uProgress.value =
      satelliteMotionProgress(visible[0]);
    materialRef.current.uniforms.uHoveredIndex.value = hoveredIndex;
  });

  if (!visible.length) return null;

  return (
    <mesh
      geometry={geometry}
      renderOrder={15}
      frustumCulled={false}
    >
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}

function SelectedSatelliteMarker({
  satellite,
  onSelect,
}: {
  satellite: LiveSatellite;
  onSelect: (satellite: LiveSatellite) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const initialPoint = useMemo(
    () => satelliteInterpolatedWorldPoint(satellite),
    [satellite],
  );

  const bodyColor =
    satellite.category === "WEATHER" ? "#58a8c7" :
    satellite.category === "EARTH OBSERVATION" ? "#5a9f98" :
    satellite.category === "STARLINK" ? "#6e97b1" :
    satellite.category === "STATION" ? "#b7965f" :
    "#5a819a";

  const panelColor =
    satellite.category === "STARLINK" ? "#315b78" :
    satellite.category === "STATION" ? "#755f3b" :
    "#2b607b";

  useFrame(() => {
    if (!groupRef.current) return;

    const point = satelliteInterpolatedWorldPoint(satellite);
    groupRef.current.position.copy(point);

    const radial = point.clone().sub(GLOBE_CENTER).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      radial,
    );
    const spin = ((Number(satellite.id) || 17) % 360) * Math.PI / 180;
    orientation.multiply(
      new THREE.Quaternion().setFromAxisAngle(radial, spin),
    );
    groupRef.current.quaternion.copy(orientation);
  });

  return (
    <group
      ref={groupRef}
      position={initialPoint}
      scale={0.72}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(satellite);
      }}
    >
      <mesh renderOrder={18}>
        <boxGeometry args={[0.034, 0.048, 0.030]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.76}
          roughness={0.24}
          emissive={bodyColor}
          emissiveIntensity={0.045}
        />
      </mesh>

      <mesh position={[-0.058, 0, 0]} renderOrder={18}>
        <boxGeometry args={[0.078, 0.005, 0.038]} />
        <meshStandardMaterial
          color={panelColor}
          metalness={0.42}
          roughness={0.38}
        />
      </mesh>

      <mesh position={[0.058, 0, 0]} renderOrder={18}>
        <boxGeometry args={[0.078, 0.005, 0.038]} />
        <meshStandardMaterial
          color={panelColor}
          metalness={0.42}
          roughness={0.38}
        />
      </mesh>
    </group>
  );
}


function SatelliteLayer({
  satellites,
  selectedId,
  onSelect,
}: {
  satellites: LiveSatellite[];
  selectedId: string | null;
  onSelect: (satellite: LiveSatellite) => void;
}) {
  const visibleSatellites = useMemo(() => satellites.slice(0, 20000), [satellites]);
  const selected = visibleSatellites.find((satellite) => satellite.id === selectedId) ?? null;

  return (
    <group>
      {selected && <SatelliteTrack satellite={selected} />}

      <SatelliteFleet
        satellites={visibleSatellites}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      {selected && (
        <SelectedSatelliteMarker satellite={selected} onSelect={onSelect} />
      )}
    </group>
  );
}


function Scene(props: { layers: { clouds: boolean; cityLights: boolean; aurora: boolean; precipitation: boolean; earthquakes: boolean; storms: boolean; lightning: boolean; wildfires: boolean; volcanoes: boolean; satellites: boolean }; mode: ExperienceMode; view: ViewMode; marker?: { lat: number; lon: number } | null; focusTarget?: { lat: number; lon: number } | null; iss?: IssData | null; followIss: boolean; followSunrise: boolean; followSatellite: boolean; satellites: LiveSatellite[]; selectedSatelliteId: string | null; onSelectSatellite: (satellite: LiveSatellite) => void; onStopFollowIss?: () => void; onStopFollowSunrise?: () => void; onStopFollowSatellite?: () => void; windSpeed?: number | null; temperature?: number | null; weatherLayer?: WeatherLayer | null; earthquakes: EarthquakeEvent[]; auroraPoints: AuroraPoint[]; kp: number; storms: TropicalStorm[]; wildfires: WildfireHotspot[]; volcanoes: VolcanoEvent[]; lightningModelPoints: LightningModelPoint[]; showLightningModel: boolean; showStormForecast: boolean; onLightningTelemetry?: (telemetry: ObservedLightningTelemetry) => void }) {
  const preset = props.mode === "CINEMA" ? { ...CINEMA_PRESET, exposure: 1.06, bloomIntensity: 0.18, bloomThreshold: 0.97 } : LIVE_PRESET;
  const controls = useRef<any>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const { camera, size, gl } = useThree();
  const flyTarget = useRef<THREE.Vector3 | null>(null);
  const selectedSatellite = props.satellites.find((satellite) => satellite.id === props.selectedSatelliteId) ?? null;

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = preset.exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl, props.mode, preset.exposure]);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    perspective.clearViewOffset();
    perspective.near = props.followSatellite ? 0.035 : 0.1;
    perspective.fov = props.followSatellite
      ? 48
      : props.view === "ISS CUPOLA" && props.mode === "CINEMA"
        ? 30
        : 41;
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height, props.view, props.mode, props.followSatellite]);

  useEffect(() => {
    if (!controls.current || props.followSatellite) return;
    const camera = controls.current.object as THREE.PerspectiveCamera;

    if (props.view === "GEOSTATIONARY") camera.position.set(0.32, 0.20, 8.75);
    if (props.view === "ISS CUPOLA") camera.position.copy(props.mode === "CINEMA" ? CINEMA_CAMERA : HERO_CAMERA);
    if (props.view === "SUN–EARTH L1") camera.position.set(-0.9, 0.25, 7.7);
    if (props.view === "MOON") camera.position.set(0.2, 0.2, 9.8);
    if (props.view === "FREE CAMERA") camera.position.set(0.35, 0.38, 6.9);

    const target = props.view === "ISS CUPOLA" && props.mode === "CINEMA" ? CINEMA_TARGET : HERO_TARGET;
    controls.current.target.copy(target);
    camera.lookAt(target);

    camera.fov = props.view === "ISS CUPOLA" && props.mode === "CINEMA" ? 30 : 41;
    camera.updateProjectionMatrix();
    controls.current.update();
  }, [props.view, props.mode, props.followSatellite]);

  useEffect(() => {
    const focus = props.focusTarget || props.marker;
    if (!focus || !controls.current) return;
    const normal = globeWorldNormal(focus.lat, focus.lon);
    const distance =
      props.view === "ISS CUPOLA" ? GLOBE_RADIUS + 2.15 :
      props.view === "GEOSTATIONARY" ? GLOBE_RADIUS + 4.75 :
      props.view === "SUN–EARTH L1" ? GLOBE_RADIUS + 5.8 :
      props.view === "MOON" ? GLOBE_RADIUS + 7.1 :
      GLOBE_RADIUS + 3.0;
    flyTarget.current = GLOBE_CENTER.clone().add(normal.multiplyScalar(distance));
  }, [props.focusTarget, props.marker, props.view]);

  useFrame((_state, delta) => {
    if (sunLight.current) {
      const sun = getSunDirection(new Date());
      sunLight.current.position.copy(GLOBE_CENTER).add(sun.multiplyScalar(24));
      sunLight.current.target.position.copy(GLOBE_CENTER);
      sunLight.current.target.updateMatrixWorld();
    }

    if (props.followSatellite && selectedSatellite && controls.current) {
      const camera = controls.current.object as THREE.PerspectiveCamera;
      const satellitePoint = satelliteInterpolatedWorldPoint(selectedSatellite);
      const satelliteNormal = satellitePoint.clone().sub(GLOBE_CENTER).normalize();
      const nextTrackPoint = (selectedSatellite.track || []).find(
        (point) => new Date(point.timestamp).getTime() > Date.now(),
      );
      const futurePoint = selectedSatellite.motionTarget
        ? globeWorldPoint(
            selectedSatellite.motionTarget.latitude,
            selectedSatellite.motionTarget.longitude,
            satelliteAltitudeToScene(selectedSatellite.motionTarget.altitude),
          )
        : nextTrackPoint
          ? globeWorldPoint(
              nextTrackPoint.latitude,
              nextTrackPoint.longitude,
              satelliteAltitudeToScene(nextTrackPoint.altitude),
            )
          : null;

      const tangent = futurePoint
        ? futurePoint.clone().sub(satellitePoint).normalize()
        : new THREE.Vector3(0, 1, 0).cross(satelliteNormal).normalize();

      // Chase-camera: slightly above and clearly behind the spacecraft,
      // looking forward along its trajectory so terrain visibly flows below.
      const desiredCamera = satellitePoint
        .clone()
        .add(satelliteNormal.clone().multiplyScalar(0.34))
        .add(tangent.clone().multiplyScalar(-0.52));
      const desiredTarget = satellitePoint
        .clone()
        .add(tangent.clone().multiplyScalar(0.34))
        .add(satelliteNormal.clone().multiplyScalar(-0.08));

      const followAlpha = 1 - Math.pow(0.006, delta);
      camera.position.lerp(desiredCamera, followAlpha * 0.64);
      controls.current.target.lerp(desiredTarget, followAlpha * 0.78);
      camera.lookAt(controls.current.target);
      controls.current.update();
      flyTarget.current = null;
      return;
    }

    if (props.followSunrise && controls.current) {
      const camera = controls.current.object as THREE.PerspectiveCamera;
      const solar = getSolarCoordinates(new Date());
      const sunrisePoint = globeWorldPoint(0, solar.sunriseLongitude, 0.032);
      const sunriseNormal = globeWorldNormal(0, solar.sunriseLongitude);
      const north = globeWorldNormal(90, 0);
      const tangent = new THREE.Vector3().crossVectors(north, sunriseNormal).normalize();

      const desiredCamera = sunrisePoint
        .clone()
        .add(sunriseNormal.clone().multiplyScalar(1.35))
        .add(tangent.clone().multiplyScalar(-0.72))
        .add(north.clone().multiplyScalar(0.30));
      const desiredTarget = sunrisePoint
        .clone()
        .add(tangent.clone().multiplyScalar(0.18))
        .add(sunriseNormal.clone().multiplyScalar(-0.16));

      const followAlpha = 1 - Math.pow(0.002, delta);
      camera.position.lerp(desiredCamera, followAlpha * 0.68);
      controls.current.target.lerp(desiredTarget, followAlpha * 0.82);
      camera.lookAt(controls.current.target);
      controls.current.update();
      flyTarget.current = null;
      return;
    }

    if (props.followIss && props.iss && controls.current) {
      const camera = controls.current.object as THREE.PerspectiveCamera;
      const stationNormal = globeWorldNormal(props.iss.latitude, props.iss.longitude);
      const stationPoint = globeWorldPoint(
        props.iss.latitude,
        props.iss.longitude,
        issAltitudeToScene(props.iss.altitude),
      );
      const future = (props.iss.track || [])
        .filter((point) => point.timestamp > props.iss!.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp)[0];
      const futurePoint = future
        ? globeWorldPoint(future.latitude, future.longitude, issAltitudeToScene(future.altitude))
        : null;
      const tangent = futurePoint
        ? futurePoint.clone().sub(stationPoint).normalize()
        : new THREE.Vector3(0, 1, 0).cross(stationNormal).normalize();

      const desiredCamera = stationPoint
        .clone()
        .add(stationNormal.clone().multiplyScalar(0.92))
        .add(tangent.clone().multiplyScalar(-0.58));
      const desiredTarget = stationPoint
        .clone()
        .add(tangent.clone().multiplyScalar(0.20))
        .add(stationNormal.clone().multiplyScalar(-0.08));

      const followAlpha = 1 - Math.pow(0.002, delta);
      camera.position.lerp(desiredCamera, followAlpha * 0.72);
      controls.current.target.lerp(desiredTarget, followAlpha * 0.82);
      camera.lookAt(controls.current.target);
      controls.current.update();
      flyTarget.current = null;
      return;
    }

    if (!flyTarget.current || !controls.current) return;
    const camera = controls.current.object as THREE.PerspectiveCamera;
    const alpha = 1 - Math.pow(0.001, delta);
    camera.position.lerp(flyTarget.current, alpha * 0.55);
    camera.lookAt(GLOBE_CENTER);
    controls.current.target.lerp(GLOBE_CENTER, alpha);
    controls.current.update();
    if (camera.position.distanceTo(flyTarget.current) < 0.025) {
      flyTarget.current = null;
    }
  });


  return (
    <>
      <color attach="background" args={["#010208"]} />
      <fog attach="fog" args={["#010208", 7, 15]} />
      <ambientLight intensity={0.012} />
      <directionalLight ref={sunLight} intensity={props.mode === "CINEMA" ? 2.45 : 2.15} color="#fff3df" />
      <SunVisual />
      {props.followSunrise && <TerminatorLayer />}
      <Stars radius={95} depth={60} count={2600} factor={1.65} saturation={0.18} fade speed={0.08} />
      <Earth clouds={props.layers.clouds} cityLights={props.layers.cityLights} aurora={props.layers.aurora} precipitation={props.layers.precipitation} cinematic={props.mode === "CINEMA"} marker={props.marker} windSpeed={props.windSpeed} temperature={props.temperature} weatherLayer={props.weatherLayer} />
      {props.iss && <IssOrbitLayer iss={props.iss} showTracks={props.followIss} />}
      {props.layers.satellites && (
        <SatelliteLayer
          satellites={props.satellites}
          selectedId={props.selectedSatelliteId}
          onSelect={props.onSelectSatellite}
        />
      )}
      {props.layers.aurora && <AuroraOvalLayer points={props.auroraPoints} kp={props.kp} />}
      {props.layers.earthquakes && <EarthquakeLayer events={props.earthquakes} />}
      {props.layers.volcanoes && <VolcanoLayer volcanoes={props.volcanoes} />}
      {props.layers.wildfires && <WildfireLayer hotspots={props.wildfires} />}
      {props.layers.storms && <StormLayer storms={props.storms} showForecast={props.showStormForecast} />}
      {props.layers.lightning && <LightningLayer onTelemetry={props.onLightningTelemetry} />}
      {props.layers.lightning && props.showLightningModel && <LightningModelLayer points={props.lightningModelPoints} />}
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={props.mode === "CINEMA" ? 1.16 : 1.14}
          luminanceThreshold={props.mode === "CINEMA" ? 0.98 : 0.98}
          luminanceSmoothing={props.mode === "CINEMA" ? 0.62 : 0.48}
        />
      </EffectComposer>
      <OrbitControls
        ref={controls}
        enabled
        enablePan={false}
        minDistance={GLOBE_RADIUS + 0.72}
        maxDistance={11}
        autoRotate={false}
        autoRotateSpeed={0}
        enableDamping
        dampingFactor={0.035}
        rotateSpeed={0.28}
        zoomSpeed={0.45}
        onStart={() => {
          if (props.followIss) props.onStopFollowIss?.();
          if (props.followSunrise) props.onStopFollowSunrise?.();
        }}
      />
    </>
  );
}


function formatSatelliteAge(ageHours: number | null | undefined) {
  if (ageHours == null || !Number.isFinite(ageHours)) return "SATELLITE";
  if (ageHours < 1) return "SAT <1H";
  if (ageHours < 24) return "SAT " + Math.max(1, Math.round(ageHours)) + "H";
  return "SAT " + Math.max(1, Math.round(ageHours / 24)) + "D";
}

function formatUpdatedAge(updatedAt: string | null | undefined, now: Date) {
  if (!updatedAt) return null;
  const time = new Date(updatedAt).getTime();
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - time) / 60000));
  if (minutes < 1) return "<1M";
  if (minutes < 60) return minutes + "M";
  const hours = Math.round(minutes / 60);
  return hours + "H";
}

function StatusPill(props: { children: React.ReactNode; tone?: "live" | "forecast" | "model" }) {
  return <span className={"status-pill " + (props.tone || "live")}>{props.children}</span>;
}

function LayerRow(props: { checked: boolean; label: string; status: string; tone: "live" | "forecast" | "model"; onChange: () => void }) {
  return (
    <button className="layer-row" onClick={props.onChange}>
      <span className={"layer-check " + (props.checked ? "active" : "")}>{props.checked ? "✓" : ""}</span>
      <span>{props.label}</span>
      <StatusPill tone={props.tone}>{props.status}</StatusPill>
    </button>
  );
}

export default function CupolaExperience() {
  const [mode, setMode] = useState<ExperienceMode>("EXPLORE");
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("EARTH");
  const [weatherLayer, setWeatherLayer] = useState<WeatherLayer>("CLOUDS");
  const [view, setView] = useState<ViewMode>("ISS CUPOLA");
  const [layers, setLayers] = useState({ clouds: true, cityLights: true, aurora: false, precipitation: false, earthquakes: false, storms: true, lightning: true, wildfires: false, volcanoes: false, satellites: false });
  const [now, setNow] = useState(new Date());
  const [iss, setIss] = useState<IssData | null>(null);
  const [followIss, setFollowIss] = useState(false);
  const [followSunrise, setFollowSunrise] = useState(false);
  const [followSatellite, setFollowSatellite] = useState(false);
  const [satelliteData, setSatelliteData] = useState<SatelliteData | null>(null);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
  const [nightLightsMeta, setNightLightsMeta] = useState<NightLightsMeta | null>(null);
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([]);
  const [earthquakeUpdatedAt, setEarthquakeUpdatedAt] = useState<string | null>(null);
  const [storms, setStorms] = useState<TropicalStorm[]>([]);
  const [stormsUpdatedAt, setStormsUpdatedAt] = useState<string | null>(null);
  const [wildfireData, setWildfireData] = useState<WildfireData | null>(null);
  const [volcanoData, setVolcanoData] = useState<VolcanoData | null>(null);
  const [lightningModelPoints, setLightningModelPoints] = useState<LightningModelPoint[]>([]);
  const [lightningModelUpdatedAt, setLightningModelUpdatedAt] = useState<string | null>(null);
  const [observedLightning, setObservedLightning] = useState<ObservedLightningTelemetry>({
    noaaCells: 0,
    mtgCells: 0,
    noaaAvailable: false,
    mtgAvailable: false,
    noaaAgeMinutes: null,
    mtgAgeMinutes: null,
    noaaObservationTime: null,
    mtgObservationTime: null,
    noaaSource: null,
    mtgSource: null,
    updatedAt: null,
  });
  const [auroraData, setAuroraData] = useState<AuroraData | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [timeline, setTimeline] = useState(0);
  const [sound, setSound] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"layers" | "now" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [discoveryIndex, setDiscoveryIndex] = useState(-1);
  const [discoveryFocus, setDiscoveryFocus] = useState<DiscoveryEvent | null>(null);
  const discoveryCameraTarget = useMemo(
    () => discoveryFocus ? { lat: discoveryFocus.latitude, lon: discoveryFocus.longitude } : null,
    [discoveryFocus],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/iss");
        if (!response.ok) return;
        const data = await response.json();
        if (active) setIss(data);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/space-weather");
        if (!response.ok) return;
        const data = await response.json();
        if (active) setSpaceWeather(data);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/earthquakes", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setEarthquakes(Array.isArray(data.earthquakes) ? data.earthquakes : []);
        setEarthquakeUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/storms", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setStorms(Array.isArray(data.storms) ? data.storms : []);
        setStormsUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 15 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/wildfires", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setWildfireData({
          hotspots: Array.isArray(data.hotspots) ? data.hotspots : [],
          totalDetections: Number.isFinite(Number(data.totalDetections)) ? Number(data.totalDetections) : 0,
          source: typeof data.source === "string" ? data.source : "NASA",
          mode: typeof data.mode === "string" ? data.mode : "unknown",
          latestAcquisition: typeof data.latestAcquisition === "string" ? data.latestAcquisition : null,
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
        });
      } catch {}
    };
    void load();
    const timer = window.setInterval(() => void load(), 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/volcanoes", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setVolcanoData({
          volcanoes: Array.isArray(data.volcanoes) ? data.volcanoes : [],
          source: typeof data.source === "string" ? data.source : "NASA EONET · VOLCANOES",
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
        });
      } catch {}
    };
    void load();
    const timer = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/lightning-model", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setLightningModelPoints(Array.isArray(data.points) ? data.points : []);
        setLightningModelUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 15 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/aurora-oval", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setAuroraData({
          points: Array.isArray(data.points) ? data.points : [],
          source: typeof data.source === "string" ? data.source : "NOAA SWPC OVATION",
          forecastTime: typeof data.forecastTime === "string" ? data.forecastTime : null,
          observationTime: typeof data.observationTime === "string" ? data.observationTime : null,
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
        });
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/night-lights", { cache: "no-store" });
        if (!response.ok) return;
        const source = response.headers.get("x-cupola-source") || "NASA VIIRS";
        const imageryDate = response.headers.get("x-cupola-imagery-date") || "unknown";
        const ageRaw = response.headers.get("x-cupola-age-hours");
        const age = ageRaw == null ? null : Number(ageRaw);
        if (active) {
          setNightLightsMeta({
            source,
            imageryDate,
            ageHours: typeof age === "number" && Number.isFinite(age) && age >= 0 ? age : null,
          });
        }
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 30 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const cacheKey = "cupola:satellites:snapshot:v1";
    const cacheMaxAgeMs = 10 * 60 * 1000;

    const normalizeSnapshot = (data: any): SatelliteData => ({
      satellites: Array.isArray(data?.satellites) ? data.satellites : [],
      count: Number.isFinite(Number(data?.count)) ? Number(data.count) : 0,
      source: typeof data?.source === "string" ? data.source : "CelesTrak GP · OMM JSON",
      generatedAt: typeof data?.generatedAt === "string" ? data.generatedAt : new Date().toISOString(),
      categories: {
        stations: Number(data?.categories?.stations || 0),
        weather: Number(data?.categories?.weather || 0),
        earthObservation: Number(data?.categories?.earthObservation || 0),
        starlink: Number(data?.categories?.starlink || 0),
        other: Number(data?.categories?.other || 0),
      },
    });

    try {
      const cachedRaw = window.localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const cachedAt = Number(cached?.cachedAt || 0);
        const snapshot = normalizeSnapshot(cached?.snapshot);
        if (
          Date.now() - cachedAt <= cacheMaxAgeMs &&
          snapshot.count > 0 &&
          snapshot.satellites.length > 0
        ) {
          setSatelliteData(snapshot);
        }
      }
    } catch {}

    const load = async () => {
      try {
        const response = await fetch("/api/satellites");
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;

        const candidate = normalizeSnapshot(data);
        if (candidate.count < 100 || candidate.satellites.length < 100) return;

        setSatelliteData((current) => {
          // Never let a transient upstream fallback collapse a healthy catalog.
          // Example: 600 tracked satellites must not be overwritten by 1 ISS.
          const floor = current && current.count >= 50
            ? Math.max(24, Math.floor(current.count * 0.60))
            : 1;

          if (candidate.count < floor) return current;

          if (candidate.count <= 5000) {
            try {
              window.localStorage.setItem(
                cacheKey,
                JSON.stringify({
                  cachedAt: Date.now(),
                  snapshot: candidate,
                }),
              );
            } catch {}
          }

          return candidate;
        });
      } catch {}
    };

    void load();
    const timer = window.setInterval(() => void load(), 2 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    fetch("/api/weather?lat=" + coords.lat + "&lon=" + coords.lon, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setWeather(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [coords]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTimeline((value) => value >= 24 ? -24 : Math.min(24, value + 0.016));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  const searchPlaces = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const response = await fetch("/api/geocode?q=" + encodeURIComponent(q));
      const data = await response.json();
      setSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const activateWeatherLayer = (layer: WeatherLayer) => {
    setSurfaceMode("WEATHER");
    setWeatherLayer(layer);
    setLayers((current) => ({
      ...current,
      clouds: layer === "CLOUDS" ? true : current.clouds,
      precipitation: layer === "RAIN",
    }));
  };

  const selectPlace = (place: PlaceResult) => {
    setFollowIss(false);
    setFollowSunrise(false);
    setFollowSatellite(false);
    setSelectedSatelliteId(null);
    setDiscoveryFocus(null);
    setDiscoveryIndex(-1);
    setSelectedPlace(place);
    setCoords({ lat: place.latitude, lon: place.longitude });
    setSearchOpen(false);
    setSearchResults([]);
  };

  const toggleFollowIss = () => {
    if (!iss) return;
    setFollowSunrise(false);
    setFollowSatellite(false);
    setSelectedSatelliteId(null);
    setDiscoveryFocus(null);
    setDiscoveryIndex(-1);
    setSelectedPlace(null);
    setSurfaceMode("EARTH");
    setView("ISS CUPOLA");
    setFollowIss((current) => !current);
  };

  const toggleFollowSunrise = () => {
    setFollowIss(false);
    setFollowSatellite(false);
    setSelectedSatelliteId(null);
    setDiscoveryFocus(null);
    setDiscoveryIndex(-1);
    setSelectedPlace(null);
    setSurfaceMode("EARTH");
    setView("ISS CUPOLA");
    setFollowSunrise((current) => !current);
  };

  const selectSatellite = (satellite: LiveSatellite) => {
    if (followSatellite) return;
    setFollowIss(false);
    setFollowSunrise(false);
    setDiscoveryFocus(null);
    setDiscoveryIndex(-1);
    setSelectedPlace(null);
    setSelectedSatelliteId(satellite.id);

    if (satellite.track?.length) return;

    void fetch("/api/satellites?track=" + encodeURIComponent(satellite.id))
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        const tracked = data?.satellite as LiveSatellite | undefined;
        if (!tracked?.id || !Array.isArray(tracked.track) || !tracked.track.length) return;

        setSatelliteData((current) => {
          if (!current) return current;
          return {
            ...current,
            satellites: current.satellites.map((item) =>
              item.id === tracked.id ? { ...item, ...tracked } : item,
            ),
          };
        });
      })
      .catch(() => undefined);
  };

  const toggleFollowSatellite = () => {
    if (!selectedSatellite) return;
    setFollowIss(false);
    setFollowSunrise(false);
    setDiscoveryFocus(null);
    setDiscoveryIndex(-1);
    setSelectedPlace(null);
    setView("ISS CUPOLA");
    setFollowSatellite((current) => !current);
  };

  const toggleSatelliteLayer = () => {
    const next = !layers.satellites;
    setLayers({ ...layers, satellites: next });
    if (!next) {
      setFollowSatellite(false);
      setSelectedSatelliteId(null);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFollowIss(false);
        setFollowSunrise(false);
        setFollowSatellite(false);
        setSelectedSatelliteId(null);
        setDiscoveryFocus(null);
        setDiscoveryIndex(-1);
        setSelectedPlace(null);
        setCoords({ lat: Number(position.coords.latitude.toFixed(4)), lon: Number(position.coords.longitude.toFixed(4)) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  };

  const selectedSatellite = satelliteData?.satellites.find((satellite) => satellite.id === selectedSatelliteId) ?? null;
  const satelliteAge = formatUpdatedAge(satelliteData?.generatedAt, now);

  const utc = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateLabel = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const solarNow = getSolarCoordinates(now);
  const currentLat = selectedSatellite ? selectedSatellite.latitude : followSunrise ? 0 : followIss && iss ? iss.latitude : coords ? coords.lat : iss ? iss.latitude : 31.441;
  const currentLon = selectedSatellite ? selectedSatellite.longitude : followSunrise ? solarNow.sunriseLongitude : followIss && iss ? iss.longitude : coords ? coords.lon : iss ? iss.longitude : -158.92;
  const localTime = weather?.timezone ? now.toLocaleTimeString("en-GB", { timeZone: weather.timezone, hour12: false, hour: "2-digit", minute: "2-digit" }) : null;
  const sunriseLabel = weather?.sunrise ? new Date(weather.sunrise).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const sunsetLabel = weather?.sunset ? new Date(weather.sunset).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  const kpAge = formatUpdatedAge(spaceWeather?.updatedAt, now);
  const weatherAge = formatUpdatedAge(weather?.updatedAt, now);
  const earthquakeAge = formatUpdatedAge(earthquakeUpdatedAt, now);
  const strongestRecentEarthquake = earthquakes.length
    ? [...earthquakes].sort((a, b) => {
        const ageA = Math.max(0, now.getTime() - a.time);
        const ageB = Math.max(0, now.getTime() - b.time);
        const scoreA = a.magnitude * 2.2 + Math.max(0, 1 - ageA / 86400000) * 1.6;
        const scoreB = b.magnitude * 2.2 + Math.max(0, 1 - ageB / 86400000) * 1.6;
        return scoreB - scoreA;
      })[0]
    : null;
  const strongestEarthquakeAge = strongestRecentEarthquake
    ? formatUpdatedAge(new Date(strongestRecentEarthquake.time).toISOString(), now)
    : null;
  const strongestEarthquakeLabel = strongestRecentEarthquake
    ? "M" + strongestRecentEarthquake.magnitude.toFixed(1) + " · " + strongestRecentEarthquake.place + (strongestEarthquakeAge ? " · " + strongestEarthquakeAge + " AGO" : "")
    : null;
  const stormsAge = formatUpdatedAge(stormsUpdatedAt, now);
  const wildfireAge = formatUpdatedAge(wildfireData?.latestAcquisition || wildfireData?.updatedAt, now);
  const volcanoUpdatedAge = formatUpdatedAge(volcanoData?.updatedAt, now);
  const mostRecentVolcano = volcanoData?.volcanoes.length
    ? [...volcanoData.volcanoes].sort((a, b) => {
        const aTime = a.eventTime ? new Date(a.eventTime).getTime() : 0;
        const bTime = b.eventTime ? new Date(b.eventTime).getTime() : 0;
        return bTime - aTime;
      })[0]
    : null;
  const mostRecentVolcanoAge = mostRecentVolcano?.eventTime
    ? formatUpdatedAge(mostRecentVolcano.eventTime, now)
    : volcanoUpdatedAge;
  const wildfireIsFirms = wildfireData?.mode === "firms";
  const wildfireStatus = wildfireData
    ? wildfireIsFirms
      ? "FIRMS NRT"
      : wildfireData.hotspots.length
        ? "EONET"
        : "NO EVENTS"
    : "LOADING";
  const strongestStorm = storms.length
    ? [...storms].sort((a, b) => (b.windKnots ?? 0) - (a.windKnots ?? 0))[0]
    : null;
  const strongestStormDetail = strongestStorm
    ? [
        strongestStorm.name,
        strongestStorm.category != null && strongestStorm.category >= 1 ? "CAT " + Math.round(strongestStorm.category) : strongestStorm.stormType,
        strongestStorm.windKnots != null ? Math.round(strongestStorm.windKnots) + " KT" : null,
        strongestStorm.pressure != null ? Math.round(strongestStorm.pressure) + " HPA" : null,
      ].filter(Boolean).join(" · ")
    : null;
  const auroraAge = formatUpdatedAge(auroraData?.observationTime || auroraData?.forecastTime || auroraData?.updatedAt, now);
  const auroraMaxProbability = auroraData?.points.length
    ? Math.max(...auroraData.points.map((point) => point.intensity))
    : 0;
  const auroraActiveCells = auroraData?.points.filter((point) => point.intensity >= 20).length ?? 0;
  const auroraStatus = auroraMaxProbability > 0
    ? Math.round(auroraMaxProbability) + "%"
    : "QUIET";
  const lightningModelAge = formatUpdatedAge(lightningModelUpdatedAt, now);
  const observedLightningAge = formatUpdatedAge(observedLightning.updatedAt, now);
  const observedLightningCells = observedLightning.noaaCells + observedLightning.mtgCells;
  const observedFeedCount = Number(observedLightning.noaaAvailable) + Number(observedLightning.mtgAvailable);
  const freshestObservedLightningAge = [observedLightning.noaaAgeMinutes, observedLightning.mtgAgeMinutes]
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)[0] ?? null;
  const observedFreshnessLabel = freshestObservedLightningAge == null
    ? null
    : freshestObservedLightningAge < 2
      ? "NOW"
      : Math.round(freshestObservedLightningAge) + " MIN";
  const lightningDisplayMode = observedLightningCells > 0
    ? "OBSERVED"
    : lightningModelPoints.length > 0
      ? "MODEL FALLBACK"
      : "NO ACTIVITY";

  const discoveryEvents = useMemo<DiscoveryEvent[]>(() => {
    const events: DiscoveryEvent[] = [];
    const nowMs = now.getTime();

    for (const storm of storms) {
      const wind = storm.windKnots ?? 0;
      const category = Math.max(0, storm.category ?? 0);
      events.push({
        id: "storm:" + storm.id,
        kind: "CYCLONE",
        title: storm.name,
        detail: [
          category >= 1 ? "CAT " + Math.round(category) : storm.stormType,
          wind > 0 ? Math.round(wind) + " KT" : null,
          storm.pressure != null ? Math.round(storm.pressure) + " HPA" : null,
        ].filter(Boolean).join(" · "),
        latitude: storm.latitude,
        longitude: storm.longitude,
        score: 82 + category * 11 + wind * 0.28,
      });
    }

    for (const quake of earthquakes.slice(0, 60)) {
      const ageHours = Math.max(0, (nowMs - quake.time) / 3600000);
      const recency = Math.max(0, 1 - ageHours / 24);
      events.push({
        id: "quake:" + quake.id,
        kind: "EARTHQUAKE",
        title: "M" + quake.magnitude.toFixed(1) + " · " + quake.place,
        detail: ageHours < 1 ? Math.max(1, Math.round(ageHours * 60)) + " MIN AGO" : Math.round(ageHours) + "H AGO",
        latitude: quake.latitude,
        longitude: quake.longitude,
        score: 48 + quake.magnitude * 8.5 + recency * 15,
      });
    }

    if (auroraData?.points.length) {
      const strongestAurora = [...auroraData.points].sort((a, b) => b.intensity - a.intensity)[0];
      if (strongestAurora) {
        events.push({
          id: "aurora:" + strongestAurora.latitude + ":" + strongestAurora.longitude,
          kind: "AURORA",
          title: "AURORA " + Math.round(strongestAurora.intensity) + "%",
          detail: "NOAA OVATION · KP " + (spaceWeather?.kp ?? 0).toFixed(1),
          latitude: strongestAurora.latitude,
          longitude: strongestAurora.longitude > 180 ? strongestAurora.longitude - 360 : strongestAurora.longitude,
          score: 34 + strongestAurora.intensity * 0.58 + (spaceWeather?.kp ?? 0) * 2.8,
        });
      }
    }

    if (wildfireData?.hotspots.length) {
      const strongestFire = [...wildfireData.hotspots].sort((a, b) => {
        const aFrp = a.frp ?? 0;
        const bFrp = b.frp ?? 0;
        const aAge = a.acquiredAt ? Math.max(0, (nowMs - new Date(a.acquiredAt).getTime()) / 3600000) : 24;
        const bAge = b.acquiredAt ? Math.max(0, (nowMs - new Date(b.acquiredAt).getTime()) / 3600000) : 24;
        const aScore = Math.log2(1 + aFrp) * 5 + Math.max(0, 1 - aAge / 24) * 10;
        const bScore = Math.log2(1 + bFrp) * 5 + Math.max(0, 1 - bAge / 24) * 10;
        return bScore - aScore;
      })[0];

      if (strongestFire) {
        const frp = strongestFire.frp ?? 0;
        const ageHours = strongestFire.acquiredAt
          ? Math.max(0, (nowMs - new Date(strongestFire.acquiredAt).getTime()) / 3600000)
          : 24;
        events.push({
          id: "fire:" + strongestFire.id,
          kind: "WILDFIRE",
          title: wildfireData.mode === "firms" ? "ACTIVE FIRE HOTSPOT" : "ACTIVE WILDFIRE",
          detail: wildfireData.mode === "firms"
            ? (frp > 0 ? Math.round(frp) + " MW FRP · " : "") + "NASA FIRMS"
            : "NASA EONET",
          latitude: strongestFire.latitude,
          longitude: strongestFire.longitude,
          score: 30 + Math.log2(1 + frp) * 5 + Math.max(0, 1 - ageHours / 24) * 12,
        });
      }
    }

    if (volcanoData?.volcanoes.length) {
      for (const volcano of volcanoData.volcanoes.slice(0, 12)) {
        const ageHours = volcano.eventTime
          ? Math.max(0, (nowMs - new Date(volcano.eventTime).getTime()) / 3600000)
          : 24 * 30;
        const recency = Math.max(0, 1 - ageHours / (24 * 45));
        events.push({
          id: "volcano:" + volcano.id,
          kind: "VOLCANO",
          title: volcano.name,
          detail: "ACTIVE VOLCANIC EVENT · NASA EONET",
          latitude: volcano.latitude,
          longitude: volcano.longitude,
          score: 45 + recency * 18 + (volcano.magnitude ?? 0) * 2,
        });
      }
    }

    if (observedLightningCells === 0 && lightningModelPoints.length) {
      const strongestLightning = [...lightningModelPoints].sort((a, b) => b.density - a.density)[0];
      if (strongestLightning) {
        events.push({
          id: "lightning-model:" + strongestLightning.latitude + ":" + strongestLightning.longitude,
          kind: "LIGHTNING MODEL",
          title: "THUNDERSTORM POTENTIAL",
          detail: "ECMWF MODEL FALLBACK",
          latitude: strongestLightning.latitude,
          longitude: strongestLightning.longitude,
          score: 22 + Math.log2(1 + Math.max(0, strongestLightning.density)) * 7,
        });
      }
    }

    return events
      .filter((event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude))
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);
  }, [
    now,
    storms,
    earthquakes,
    auroraData,
    spaceWeather,
    wildfireData,
    volcanoData,
    observedLightningCells,
    lightningModelPoints,
  ]);

  const exploreEarthNow = () => {
    if (!discoveryEvents.length) return;
    const nextIndex = (discoveryIndex + 1) % discoveryEvents.length;
    const event = discoveryEvents[nextIndex];
    setDiscoveryIndex(nextIndex);
    setDiscoveryFocus(event);
    setSelectedPlace(null);
    setSurfaceMode("EARTH");
    setView("ISS CUPOLA");

    setLayers((current) => ({
      ...current,
      earthquakes: event.kind === "EARTHQUAKE" ? true : current.earthquakes,
      storms: event.kind === "CYCLONE" ? true : current.storms,
      aurora: event.kind === "AURORA" ? true : current.aurora,
      wildfires: event.kind === "WILDFIRE" ? true : current.wildfires,
      volcanoes: event.kind === "VOLCANO" ? true : current.volcanoes,
      lightning: event.kind === "LIGHTNING MODEL" ? true : current.lightning,
    }));
  };

  const cityLightsStatus = nightLightsMeta?.imageryDate === "2016-composite"
    ? "STATIC"
    : formatSatelliteAge(nightLightsMeta?.ageHours);

  return (
    <main className="cupola-page">
      <section className={"cupola " + (mode === "CINEMA" ? "cinema-mode" : "")}>
      <div className="scene-wrap">
        <Canvas
          dpr={[1, 1.3]}
          camera={{ position: [HERO_CAMERA.x, HERO_CAMERA.y, HERO_CAMERA.z], fov: 41, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.12;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.3));
          }}
        >
          <Suspense fallback={null}>
            <Scene layers={layers} mode={mode} view={view} marker={coords} focusTarget={discoveryCameraTarget} iss={iss} followIss={followIss} followSunrise={followSunrise} followSatellite={followSatellite} satellites={satelliteData?.satellites ?? []} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={selectSatellite} onStopFollowIss={() => setFollowIss(false)} onStopFollowSunrise={() => setFollowSunrise(false)} onStopFollowSatellite={() => setFollowSatellite(false)} windSpeed={weather?.windSpeed ?? null} temperature={weather?.temperature ?? null} weatherLayer={surfaceMode === "WEATHER" ? weatherLayer : null} earthquakes={earthquakes} auroraPoints={auroraData?.points ?? []} kp={spaceWeather?.kp ?? 0} storms={storms} wildfires={wildfireData?.hotspots ?? []} volcanoes={volcanoData?.volcanoes ?? []} lightningModelPoints={lightningModelPoints} showLightningModel={observedLightningCells === 0} showStormForecast={discoveryFocus?.kind === "CYCLONE"} onLightningTelemetry={setObservedLightning} />
          </Suspense>
        </Canvas>
      </div>

      <div className="vignette" />
      <div className="noise" />

      <header className="topbar hud">
        <div>
          <div className="brand">CUPOLA<sup>°</sup></div>
          <div className="brand-tag">{surfaceMode === "WEATHER" ? "WEATHER FROM SPACE." : "EARTH. RIGHT NOW."}</div>
        </div>
        <div className="live-meta">
          <span><i /> DATA ONLINE</span>
          <b>{dateLabel} · {utc} UTC</b>
        </div>
        <div className="header-actions">
          <button aria-label="Search Earth" onClick={() => setSearchOpen(true)}><Search size={17} /></button>
          <button aria-label="Share"><Share2 size={17} /></button>
          <button aria-label="Sound" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        </div>
      </header>

      <div className="surface-switch panel hud">
        <button className={surfaceMode === "EARTH" ? "active" : ""} onClick={() => setSurfaceMode("EARTH")}>EARTH</button>
        <button className={surfaceMode === "WEATHER" ? "active" : ""} onClick={() => setSurfaceMode("WEATHER")}>WEATHER FROM SPACE</button>
      </div>

      {surfaceMode === "WEATHER" && (
        <section className="weather-dock panel hud">
          <div className="panel-title">WEATHER FROM SPACE</div>
          <div className="weather-layer-grid">
            <button className={weatherLayer === "CLOUDS" ? "active" : ""} onClick={() => activateWeatherLayer("CLOUDS")}><Cloud size={16} /><span>CLOUDS</span><small>GEO NRT · 10 MIN</small></button>
            <button className={weatherLayer === "RAIN" ? "active" : ""} onClick={() => activateWeatherLayer("RAIN")}><CloudRain size={16} /><span>RAIN</span><small>NRT SAT</small></button>
            <button className={weatherLayer === "WIND" ? "active" : ""} onClick={() => activateWeatherLayer("WIND")}><Wind size={16} /><span>WIND</span><small>{weather ? "CURRENT · " + Math.round(weather.windSpeed) + " KM/H" : "SELECT PLACE"}</small></button>
            <button className={weatherLayer === "TEMPERATURE" ? "active" : ""} onClick={() => activateWeatherLayer("TEMPERATURE")}><Thermometer size={16} /><span>TEMP</span><small>{weather ? "CURRENT · " + Math.round(weather.temperature) + "°C" : "SELECT PLACE"}</small></button>
          </div>
          <div className="weather-source-note">
            {weatherLayer === "RAIN" ? "PRECIPITATION · NASA GIBS IMERG NRT" : weatherLayer === "CLOUDS" ? "CLOUDS · GOES / MTG / HIMAWARI NRT · MODIS FALLBACK" : "LOCAL CONDITIONS · OPEN-METEO"}
          </div>
        </section>
      )}

      <section className="right-now panel hud">
        <div className="panel-title">RIGHT NOW</div>
        <div className="event-row">
          <div><Satellite size={14} /><span><strong>ISS</strong><small>{iss ? Math.round(iss.altitude) + " km · " + (iss.velocity / 3600).toFixed(2) + " km/s · " + (iss.track?.length || 0) + " track points" : "Acquiring orbit…"}</small></span></div>
          <button className={"status-pill status-pill-button " + (followIss ? "forecast" : "")} onClick={toggleFollowIss} disabled={!iss}>{followIss ? "FOLLOWING" : "FOLLOW ISS"}</button>
        </div>
        <div className="event-row">
          <div><Satellite size={14} /><span><strong>SATELLITES</strong><small>{selectedSatellite ? selectedSatellite.name + " · " + Math.round(selectedSatellite.altitude) + " KM · " + selectedSatellite.category : satelliteData ? satelliteData.count + " tracked satellites · " + satelliteData.categories.weather + " weather · " + satelliteData.categories.earthObservation + " EO · " + satelliteData.categories.starlink + " Starlink · " + (satelliteData.categories.other || 0) + " other" + (satelliteAge ? " · " + satelliteAge + " AGO" : "") : "Acquiring orbital catalog…"}</small></span></div>
          <StatusPill>{selectedSatellite ? selectedSatellite.category : satelliteData ? satelliteData.count + " LIVE" : "LIVE"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Sparkles size={14} /><span><strong>SPACE WEATHER</strong><small>{spaceWeather ? "Planetary Kp " + spaceWeather.kp.toFixed(1) + " · NOAA SWPC" + (kpAge ? " · " + kpAge + " AGO" : "") : "Acquiring space weather…"}</small></span></div>
          <StatusPill>{spaceWeather ? "LIVE KP" : "LIVE"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Sparkles size={14} /><span><strong>AURORA</strong><small>{auroraData?.points.length ? "OVATION max " + Math.round(auroraMaxProbability) + "% · " + auroraActiveCells + " active cells · NOAA" + (auroraAge ? " · " + auroraAge + " AGO" : "") : "Acquiring auroral probability…"}</small></span></div>
          <StatusPill tone="forecast">{auroraStatus}</StatusPill>
        </div>
        <div className="event-row">
          <div><Crosshair size={14} /><span><strong>EARTHQUAKES</strong><small>{strongestEarthquakeLabel ? strongestEarthquakeLabel + " · USGS" : earthquakes.length ? earthquakes.length + " events M2.5+ · USGS" + (earthquakeAge ? " · " + earthquakeAge + " AGO" : "") : "Acquiring seismic feed…"}</small></span></div>
          <StatusPill>{strongestRecentEarthquake ? "M" + strongestRecentEarthquake.magnitude.toFixed(1) : "LIVE"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Wind size={14} /><span><strong>TROPICAL CYCLONES</strong><small>{storms.length ? (strongestStormDetail || storms.length + " active") + " · NOAA NHC" + (stormsAge ? " · " + stormsAge + " AGO" : "") : "No active NHC tropical cyclones"}</small></span></div>
          <StatusPill tone="forecast">{storms.length ? "NHC NRT" : "CLEAR"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Flame size={14} /><span><strong>WILDFIRES</strong><small>{wildfireData ? (wildfireIsFirms ? wildfireData.totalDetections + " VIIRS detections · NASA FIRMS" : wildfireData.hotspots.length + " open wildfire events · NASA EONET") + (wildfireAge ? " · " + wildfireAge + " AGO" : "") : "Acquiring wildfire feed…"}</small></span></div>
          <StatusPill tone="forecast">{wildfireStatus}</StatusPill>
        </div>
        <div className="event-row">
          <div><Mountain size={14} /><span><strong>VOLCANOES</strong><small>{volcanoData ? (mostRecentVolcano ? mostRecentVolcano.name + (mostRecentVolcanoAge ? " · " + mostRecentVolcanoAge + " AGO" : "") : "No open volcanic events") + " · NASA EONET" : "Acquiring volcanic activity…"}</small></span></div>
          <StatusPill tone="forecast">{volcanoData?.volcanoes.length ? volcanoData.volcanoes.length + " ACTIVE" : "CLEAR"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Sparkles size={14} /><span><strong>LIGHTNING</strong><small>{lightningDisplayMode + " · OBS " + observedLightningCells + " · MODEL " + lightningModelPoints.length + (observedFreshnessLabel ? " · OBS " + observedFreshnessLabel + " AGO" : "") + (observedFeedCount < 2 ? " · " + observedFeedCount + "/2 OBS FEEDS" : "") + (!observedFreshnessLabel && lightningModelAge ? " · MODEL " + lightningModelAge + " AGO" : "")}</small></span></div>
          <StatusPill tone="forecast">{lightningDisplayMode}</StatusPill>
        </div>
        <div className="event-row">
          <div><Sun size={14} /><span><strong>SUN</strong><small>{"Terminator live · sunrise " + Math.abs(solarNow.sunriseLongitude).toFixed(1) + "° " + (solarNow.sunriseLongitude >= 0 ? "E" : "W") + " · decl " + solarNow.declinationDegrees.toFixed(1) + "°"}</small></span></div>
          <button className={"status-pill status-pill-button " + (followSunrise ? "forecast" : "")} onClick={toggleFollowSunrise}>{followSunrise ? "FOLLOWING" : "FOLLOW SUNRISE"}</button>
        </div>
        <div className="night-lights-meta">
          <span>CITY LIGHTS</span>
          <small>{nightLightsMeta ? (nightLightsMeta.imageryDate === "2016-composite" ? "STATIC · BLACK MARBLE 2016" : cityLightsStatus + " · VIIRS BRDF · " + nightLightsMeta.imageryDate) : "ACQUIRING SATELLITE PASS…"}</small>
        </div>
      </section>

      <aside className="controls panel hud">
        <div className="panel-title">VIEW</div>
        {(["ISS CUPOLA", "GEOSTATIONARY", "SUN–EARTH L1", "MOON", "FREE CAMERA"] as ViewMode[]).map((item) => (
          <button className="radio-row" key={item} onClick={() => { setFollowIss(false); setFollowSunrise(false); setFollowSatellite(false); setView(item); }}>
            <span className={"radio " + (view === item ? "active" : "")} />
            {item}
          </button>
        ))}
        <div className="separator" />
        <div className="panel-title">LAYERS</div>
        <div className="source-note">CINEMATIC EARTH · LIVE + NRT + MODEL DATA</div>
        <LayerRow checked={layers.clouds} label="Clouds" status="NRT SAT" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
        <LayerRow checked={layers.precipitation} label="Precipitation" status="NRT SAT" tone="forecast" onChange={() => setLayers({ ...layers, precipitation: !layers.precipitation })} />
        <LayerRow checked={layers.cityLights} label="City lights" status={cityLightsStatus} tone={nightLightsMeta?.imageryDate === "2016-composite" ? "model" : "live"} onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
        <LayerRow checked={layers.aurora} label="Aurora oval" status={auroraData?.points.length ? auroraStatus + (auroraAge ? " · " + auroraAge : "") : "NOAA"} tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
        <LayerRow checked={layers.earthquakes} label="Earthquakes" status={strongestRecentEarthquake ? "M" + strongestRecentEarthquake.magnitude.toFixed(1) + (strongestEarthquakeAge ? " · " + strongestEarthquakeAge : "") : earthquakeAge ? "USGS " + earthquakeAge : "USGS LIVE"} tone="live" onChange={() => setLayers({ ...layers, earthquakes: !layers.earthquakes })} />
        <LayerRow checked={layers.storms} label="Tropical cyclones" status={storms.length ? "NHC " + storms.length : "NHC"} tone="forecast" onChange={() => setLayers({ ...layers, storms: !layers.storms })} />
        <LayerRow checked={layers.wildfires} label="Wildfires" status={wildfireData ? wildfireStatus + (wildfireAge ? " · " + wildfireAge : "") : "NASA"} tone="forecast" onChange={() => setLayers({ ...layers, wildfires: !layers.wildfires })} />
        <LayerRow checked={layers.volcanoes} label="Volcanoes" status={volcanoData?.volcanoes.length ? volcanoData.volcanoes.length + " ACTIVE" : "NASA EONET"} tone="forecast" onChange={() => setLayers({ ...layers, volcanoes: !layers.volcanoes })} />
        <LayerRow checked={layers.satellites} label="Satellites" status={satelliteData ? satelliteData.count + " LIVE" : "CELESTRAK"} tone="live" onChange={toggleSatelliteLayer} />
        <LayerRow checked={layers.lightning} label="Lightning" status={observedLightningCells > 0 ? "OBS" + (observedFreshnessLabel ? " · " + observedFreshnessLabel : "") : lightningModelPoints.length > 0 ? "MODEL FALLBACK" : "NO ACTIVITY"} tone="forecast" onChange={() => setLayers({ ...layers, lightning: !layers.lightning })} />
        <div className="weather-entry">
          <button onClick={exploreEarthNow} disabled={!discoveryEvents.length}>{discoveryFocus ? "NEXT EARTH EVENT" : "EXPLORE EARTH NOW"}</button>
        </div>
        <div className="weather-entry">
          <button onClick={() => setSurfaceMode(surfaceMode === "WEATHER" ? "EARTH" : "WEATHER")}>{surfaceMode === "WEATHER" ? "BACK TO EARTH" : "WEATHER FROM SPACE"}</button>
        </div>
      </aside>

      <section className="location-card hud">
        <div className="eyebrow">{followSatellite && selectedSatellite ? "FOLLOWING LIVE SATELLITE" : selectedSatellite ? "SELECTED ORBITAL OBJECT" : followSunrise ? "FOLLOWING DAY / NIGHT EDGE" : followIss ? "FOLLOWING LIVE ORBIT" : discoveryFocus ? "EARTH EVENT · " + discoveryFocus.kind : selectedPlace ? "VIEWING" : coords ? "YOU ARE HERE" : "NOW ABOVE"}</div>
        <h1>{selectedSatellite ? selectedSatellite.name.toUpperCase() : followSunrise ? "SUNRISE TERMINATOR" : followIss ? "INTERNATIONAL SPACE STATION" : discoveryFocus ? discoveryFocus.title.toUpperCase() : selectedPlace ? selectedPlace.name.toUpperCase() : coords ? "YOUR LOCATION" : "EARTH ORBIT"}</h1>
        <div className="coords">{discoveryFocus && !followIss ? Math.abs(discoveryFocus.latitude).toFixed(4) + "° " + (discoveryFocus.latitude >= 0 ? "N" : "S") + " · " + Math.abs(discoveryFocus.longitude).toFixed(4) + "° " + (discoveryFocus.longitude >= 0 ? "E" : "W") : Math.abs(currentLat).toFixed(4) + "° " + (currentLat >= 0 ? "N" : "S") + " · " + Math.abs(currentLon).toFixed(4) + "° " + (currentLon >= 0 ? "E" : "W")}</div>
        <div className="location-actions">
          <button className="locate-button" onClick={locateMe}><LocateFixed size={16} />{locating ? "LOCATING…" : coords ? "CENTER ON ME" : "FIND ME"}</button>
          {!followSunrise && !followIss && !discoveryFocus && weather && <div className="weather-mini"><Cloud size={15} /><span>{Math.round(weather.temperature)}°C</span><small>CURRENT{weatherAge ? " · " + weatherAge + " AGO" : ""} · {weather.cloudCover}% CLOUD · {Math.round(weather.windSpeed)} KM/H WIND</small></div>}
          <button className="locate-button secondary" onClick={() => setSearchOpen(true)}><Search size={16} />SEARCH EARTH</button>
          <button className="locate-button secondary" onClick={toggleFollowIss} disabled={!iss}><Satellite size={16} />{followIss ? "STOP FOLLOWING ISS" : "FOLLOW ISS"}</button>
          <button className="locate-button secondary" onClick={toggleFollowSunrise}><Sun size={16} />{followSunrise ? "STOP FOLLOWING SUNRISE" : "FOLLOW SUNRISE"}</button>
          {selectedSatellite && <button className="locate-button secondary" onClick={toggleFollowSatellite}><Satellite size={16} />{followSatellite ? "STOP FOLLOWING SATELLITE" : "FOLLOW SATELLITE"}</button>}
          <button className="locate-button secondary" onClick={exploreEarthNow} disabled={!discoveryEvents.length}><Sparkles size={16} />{discoveryFocus ? "NEXT EARTH EVENT" : "EXPLORE EARTH NOW"}</button>
        </div>
        {selectedSatellite && (
          <div className="place-context">
            <span><b>{selectedSatellite.category}</b><small>NORAD {selectedSatellite.id}</small></span>
            <span><b>ALTITUDE</b><small>{Math.round(selectedSatellite.altitude)} KM</small></span>
            <span><b>VELOCITY</b><small>{selectedSatellite.velocity.toFixed(2)} KM/S</small></span>
          </div>
        )}
        {!selectedSatellite && followSunrise && (
          <div className="place-context">
            <span><b>SUNRISE EDGE</b><small>{Math.abs(solarNow.sunriseLongitude).toFixed(1)}° {solarNow.sunriseLongitude >= 0 ? "E" : "W"}</small></span>
            <span><b>SUBSOLAR</b><small>{Math.abs(solarNow.subSolarLongitude).toFixed(1)}° {solarNow.subSolarLongitude >= 0 ? "E" : "W"}</small></span>
            <span><b>DECLINATION</b><small>{solarNow.declinationDegrees.toFixed(1)}°</small></span>
          </div>
        )}
        {!selectedSatellite && !followSunrise && followIss && iss && (
          <div className="place-context">
            <span><b>ALTITUDE</b><small>{Math.round(iss.altitude)} KM</small></span>
            <span><b>VELOCITY</b><small>{(iss.velocity / 3600).toFixed(2)} KM/S</small></span>
            <span><b>FOOTPRINT</b><small>{iss.footprint != null ? Math.round(iss.footprint) + " KM" : "—"}</small></span>
          </div>
        )}
        {!selectedSatellite && !followSunrise && !followIss && discoveryFocus && (
          <div className="place-context">
            <span><b>{discoveryFocus.kind}</b><small>{discoveryFocus.detail}</small></span>
            <span><b>DISCOVERY</b><small>{Math.min(discoveryIndex + 1, discoveryEvents.length)} / {discoveryEvents.length}</small></span>
            <span><b>SCORE</b><small>{Math.round(discoveryFocus.score)}</small></span>
          </div>
        )}
        {!selectedSatellite && !followSunrise && !followIss && !discoveryFocus && weather && (
          <div className="place-context">
            <span><b>{weather.isDay ? "DAY" : "NIGHT"}</b><small>{localTime ? localTime + " LOCAL" : weather.timezone}</small></span>
            <span><b>SUNRISE</b><small>{sunriseLabel ?? "—"}</small></span>
            <span><b>SUNSET</b><small>{sunsetLabel ?? "—"}</small></span>
          </div>
        )}
      </section>

      <section className="telemetry panel hud">
        <div><span>ALTITUDE</span><strong>{iss ? Math.round(iss.altitude) : 408} <small>KM</small></strong></div>
        <div><span>VELOCITY</span><strong>{iss ? (iss.velocity / 3600).toFixed(2) : "7.66"} <small>KM/S</small></strong></div>
        <div><span>ORBIT</span><strong>92 <small>MIN</small></strong></div>
        <div><span>SUNRISES</span><strong>16 <small>/ DAY</small></strong></div>
      </section>

      <div className="mode-switch panel hud">
        <button className={mode === "CINEMA" ? "active" : ""} onClick={() => setMode("CINEMA")}>CINEMA</button>
        <button className={mode === "EXPLORE" ? "active" : ""} onClick={() => setMode("EXPLORE")}>EXPLORE</button>
      </div>

      <section className="timeline panel hud">
        <div className="timeline-head"><span>-24H</span><strong>{timeline > -0.2 && timeline < 0.2 ? "NOW" : (timeline > 0 ? "+" : "") + timeline.toFixed(1) + "H"}</strong><span>+24H</span></div>
        <input aria-label="Earth timeline" type="range" min="-24" max="24" step="0.1" value={timeline} onChange={(event) => { setTimeline(Number(event.target.value)); setPlaying(false); }} />
        <div className="timeline-actions">
          <button onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <button className="active">×1</button><button>×60</button><button>×600</button>
        </div>
      </section>

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-panel panel">
            <div className="sheet-head">
              <div>
                <div className="panel-title">SEARCH EARTH</div>
                <strong>Fly anywhere on the planet</strong>
              </div>
              <button onClick={() => setSearchOpen(false)}><X size={18} /></button>
            </div>

            <form className="earth-search" onSubmit={(event) => { event.preventDefault(); void searchPlaces(); }}>
              <Search size={18} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tokyo, Reykjavik, Cape Town…"
              />
              <button type="submit">{searching ? "…" : "GO"}</button>
            </form>

            <div className="search-results">
              {searchResults.map((place) => (
                <button key={place.id} onClick={() => selectPlace(place)}>
                  <span>
                    <strong>{place.name}</strong>
                    <small>{[place.admin1, place.country].filter(Boolean).join(", ")}</small>
                  </span>
                  <span className="search-coords">{place.latitude.toFixed(2)}°, {place.longitude.toFixed(2)}°</span>
                </button>
              ))}
              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <div className="search-empty">Search a city to begin orbital fly-to.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav hud">
        <button onClick={locateMe}><Crosshair size={18} /><span>Find me</span></button>
        <button onClick={() => setMobilePanel("layers")}><Layers3 size={18} /><span>Layers</span></button>
        <button onClick={() => setMobilePanel("now")}><Satellite size={18} /><span>Live</span></button>
      </nav>

      {mobilePanel && (
        <div className="mobile-sheet">
          <div className="sheet-head"><strong>{mobilePanel === "layers" ? "EARTH LAYERS" : "RIGHT NOW"}</strong><button onClick={() => setMobilePanel(null)}><X size={18} /></button></div>
          {mobilePanel === "layers" ? (
            <div>
              <LayerRow checked={layers.clouds} label="Clouds" status="NRT SAT" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
              <LayerRow checked={layers.precipitation} label="Precipitation" status="NRT" tone="forecast" onChange={() => setLayers({ ...layers, precipitation: !layers.precipitation })} />
              <LayerRow checked={layers.cityLights} label="City lights" status={nightLightsMeta?.ageHours != null ? (nightLightsMeta.ageHours < 24 ? "SAT <24H" : "SAT " + Math.max(1, Math.round(nightLightsMeta.ageHours / 24)) + "D") : "SATELLITE"} tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
              <LayerRow checked={layers.aurora} label="Aurora oval" status={auroraData?.points.length ? auroraStatus : "NOAA"} tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
              <LayerRow checked={layers.earthquakes} label="Earthquakes" status="USGS LIVE" tone="live" onChange={() => setLayers({ ...layers, earthquakes: !layers.earthquakes })} />
              <LayerRow checked={layers.wildfires} label="Wildfires" status={wildfireData ? wildfireStatus : "NASA"} tone="forecast" onChange={() => setLayers({ ...layers, wildfires: !layers.wildfires })} />
              <LayerRow checked={layers.volcanoes} label="Volcanoes" status={volcanoData?.volcanoes.length ? volcanoData.volcanoes.length + " ACTIVE" : "NASA"} tone="forecast" onChange={() => setLayers({ ...layers, volcanoes: !layers.volcanoes })} />
              <LayerRow checked={layers.satellites} label="Satellites" status={satelliteData ? satelliteData.count + " LIVE" : "CELESTRAK"} tone="live" onChange={toggleSatelliteLayer} />
            </div>
          ) : (
            <div className="sheet-stats">
              <span><Satellite size={16} /> ISS {iss ? Math.round(iss.altitude) + " km" : "loading"}</span>
              <span><Cloud size={16} /> {weather ? weather.cloudCover + "% cloud" : "Find your location for weather"}</span>
            </div>
          )}
        </div>
      )}
      </section>

      <section className="concept-grid concept-grid-top">
        <article className="concept-card cinema-card">
          <div className="concept-copy">
            <strong>CINEMA MODE</strong>
            <span>Minimal interface. Just you and Earth.</span>
          </div>
          <div className="concept-earth earth-left" />
        </article>

        <article className="concept-card explore-card">
          <div className="concept-copy">
            <strong>EXPLORE MODE</strong>
            <span>Full controls, layers and timeline.</span>
          </div>
          <div className="concept-earth earth-center" />
          <div className="mini-timeline"><span>-24H</span><b>NOW</b><span>+24H</span></div>
        </article>

        <article className="concept-card iss-card">
          <div className="concept-copy">
            <strong>ISS CUPOLA VIEW</strong>
            <span>Authentic window frame for real immersion.</span>
          </div>
          <div className="iss-window">
            <div className="iss-earth" />
          </div>
        </article>
      </section>

      <section className="concept-grid concept-grid-bottom">
        <article className="concept-card history-card">
          <div className="concept-copy">
            <strong>EARTH ON YOUR DAY</strong>
            <span>See how Earth looked on any day since 2000.</span>
          </div>
          <div className="history-ui">
            <div className="date-picker"><span>12</span><span>AUG</span><span>1998</span></div>
            <button>VIEW EARTH →</button>
          </div>
          <div className="history-earth" />
        </article>

        <article className="concept-card share-card">
          <div className="concept-copy">
            <strong>SHARE</strong>
            <span>Create a beautiful card or short video.</span>
          </div>
          <div className="share-previews">
            <div className="share-phone"><small>CUPOLA°</small><div className="share-globe" /><b>EARTH</b><span>12 AUGUST 1998</span></div>
            <div className="share-phone video"><div className="share-globe" /><b>▶</b><span>0:10</span></div>
            <div className="share-actions"><span>⌁ Copy link</span><span>⇩ Download image</span><span>⇩ Download video</span><span>𝕏　◎　♪</span></div>
          </div>
        </article>

        <article className="concept-card mobile-card">
          <div className="concept-copy">
            <strong>MOBILE EXPERIENCE</strong>
            <span>Beautiful and simple on mobile.</span>
          </div>
          <div className="mobile-previews">
            <div className="mini-phone"><small>CUPOLA°　● LIVE</small><div className="mini-globe" /><b>NORTH PACIFIC</b></div>
            <div className="mini-phone"><small>LAYERS</small><div className="mini-list">☑ Clouds<br/>☑ City lights<br/>☑ Aurora<br/>☐ Satellites</div></div>
            <div className="mini-phone"><small>EARTH ON YOUR DAY</small><div className="mini-globe small" /><button>View Earth →</button></div>
          </div>
        </article>
      </section>
    </main>
  );
}
