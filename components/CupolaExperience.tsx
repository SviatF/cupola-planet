"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, useTexture } from "@react-three/drei";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Cloud, CloudRain, Crosshair, Flame, Layers3, LocateFixed, Moon, Mountain, Satellite, Search, Share2, Sparkles, Sun, Thermometer, Gauge, Snowflake, Volume2, VolumeX, Wind, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CINEMA_PRESET, LIVE_PRESET } from "@/lib/earth/presets";
import { CLOUD_ATLAS_MAX_AGE_MS, composeCloudAtlas, decodeCloudFrame, decodePolarViirsFrame, validateCloudFrame, type CloudAtlasFrames, type CloudAtlasSource } from "@/lib/earth/cloudAtlas";
import { composeCloudAtlasV2 } from "@/lib/earth/cloudAtlasV2";
import { composeScientificWithMeteosatVisualGap, type MeteosatVisualFrame } from "@/lib/earth/scientificCloudVisualGap";
import { fillGlobalCloudModelGaps } from "@/lib/earth/globalCloudModelFill";
import { auditAfricaCloudSources } from "@/lib/earth/africaCloudSourceAudit";
import { overlayGmgsiVisualGap, estimateGmgsiVisualGains, interpolateGmgsiVisualGain } from "@/lib/earth/gmgsiVisualGap";
import { harmonizeV3CloudEdges, toneMatchV3SupplementalSeams } from "@/lib/earth/cloudSourceSeamHarmonizer";
import { buildSatelliteLimbOverlay } from "@/lib/earth/cloudLimbOverlay";
import { resolveCloudV3RuntimeConfig } from "@/lib/earth/cloudV3RuntimeConfig";
// Scientific V3 is delivered by the independent NOAA/JMA L2 ingest pipeline.
import { LIVE_CLOUD_FRAGMENT_SHADER, LIVE_CLOUD_SHADOW_FRAGMENT_SHADER, LIVE_CLOUD_VERTEX_SHADER } from "@/lib/earth/liveCloudShader";
import { OCEAN_SUN_GLINT_FRAGMENT_SHADER, OCEAN_SUN_GLINT_VERTEX_SHADER } from "@/lib/earth/oceanShader";
import { MILKY_WAY_VERTEX_SHADER, MILKY_WAY_FRAGMENT_SHADER } from "@/lib/earth/milkyWayShader";
import { GAIA_SKY_VERTEX_SHADER, GAIA_SKY_FRAGMENT_SHADER } from "@/lib/earth/gaiaSkyShader";
import { CELESTIAL_STAR_VERTEX_SHADER, CELESTIAL_STAR_FRAGMENT_SHADER } from "@/lib/earth/celestialStarShader";
import { extractLightningStormZones, selectLightningStormZones, selectLightningStormZonesBalanced, filterModelLightningByObservation, stormZoneFlashEnvelope, type LightningStormZone } from "@/lib/earth/lightningStormZones";
import { LIGHTNING_FRESHNESS_MINUTES } from "@/lib/earth/lightningObservation";
import { parseGLMFeed, selectUnseenGLMFlashes, type GLMFlash } from "@/lib/earth/glmFlashFeed";
import { satelliteMotionFactor, satelliteMotionClockOffset, satelliteOrbitArcPoint, SATELLITE_MOTION_REFERENCE_BUCKET_MS } from "@/lib/earth/satelliteMotion";
import { satelliteFrameStats, type SatelliteFrameStats } from "@/lib/earth/satellitePerformance";
import { decodeSatelliteRows, SATELLITE_WIRE_FORMAT } from "@/lib/earth/satelliteCatalogWire";
import { buildLightningBoltTriangles } from "@/lib/earth/lightningBoltGeometry";
import OrbitalContextPanel from "@/components/OrbitalContextPanel";
import { isFreshCloudV3RecoveryManifest } from "@/lib/earth/cloudAutoRecovery";
import { cloudHealth } from "@/lib/earth/cloudHealth";
import { celestialAt, eclipseAt, kmToScene, moonPoleEarthFixed, MOON_RADIUS_KM, type CelestialState } from "@/lib/earth/celestialEngine";
import { lunarAtmosphereTransmission, moonAltitudeDegrees, moonEarthShadow, moonAppearanceRGB, moonSunVisibility } from "@/lib/earth/moonAppearance";
import { SOLAR_VERTEX_SHADER, SOLAR_FRAGMENT_SHADER, solarBillboardWorldRadius, SOLAR_VIEW_CAMERA_DISTANCE, SOLAR_VIEW_LIMB_ANGLE_RAD, solarLensVisibility } from "@/lib/earth/solarCinematic";
import { fuseViirsPixels, type FusionStats } from "@/lib/earth/viirsSurfaceFusion";
import { parseDailyImageryInfo, imageVersion, type DailyImageryInfo } from "@/lib/earth/dailyImagery";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "SUN–EARTH L1" | "MOON" | "MOON ORBIT" | "MOON FROM EARTH" | "FREE CAMERA" | "SUN VIEW";
type MoonDistanceFactor = 1 | 2 | 3 | 4;
// Fixed cinematic presentation. Original lunar ephemerides remain untouched.
// Celestial 2.4: keep physical Earth–Moon separation in every camera mode.
// Camera navigation and the rendered Moon must use the same physical orbit.
const MOON_CINEMATIC_DISTANCE_FACTOR:MoonDistanceFactor=1;
type ExperienceMode = "CINEMA" | "EXPLORE";
type SurfaceMode = "EARTH" | "WEATHER";
type WeatherLayer = "CLOUDS" | "RAIN" | "WIND" | "TEMPERATURE" | "PRESSURE" | "SNOW";
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
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; pressure: number | null; snowfall: number | null; weatherCode: number; isDay: boolean; sunrise: string | null; sunset: string | null; timezone: string; updatedAt: string };
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
type LightningHotspot = LightningStormZone;
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
  noaaHotspot: LightningHotspot | null;
  mtgHotspot: LightningHotspot | null;
  zones: LightningStormZone[];
  glmObservedActive?: boolean;
  glmFlashCount?: number;
  updatedAt: string | null;
};
type AuroraPoint = { latitude: number; longitude: number; intensity: number };
type AuroraData = { points: AuroraPoint[]; source: string; forecastTime: string | null; observationTime: string | null; updatedAt: string; dataStatus?: string };
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
  dataStatus?: string;
  observationAgeMinutes?: number | null;
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
  dataStatus?: "recent-report" | "historical-report";
  reportAgeMinutes?: number | null;
};
type VolcanoData = {
  volcanoes: VolcanoEvent[];
  source: string;
  updatedAt: string;
  dataStatus?: string;
  recentReportCount?: number;
  latestReportAt?: string | null;
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
  kind: "EARTHQUAKE" | "CYCLONE" | "AURORA" | "WILDFIRE" | "VOLCANO" | "LIGHTNING MODEL" | "LIGHTNING OBSERVED";
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
  iodc: "/api/clouds-geostationary?source=meteosat-iodc",
  polar: "/api/clouds-polar",
  polar20: "/api/clouds-polar?sensor=noaa20",
  polarsnpp: "/api/clouds-polar?sensor=snpp",
} as const;
const PRECIP_TEXTURE = "/api/precipitation";
const LIGHTNING_TEXTURE = "/api/lightning";
const LIGHTNING_EUMETSAT_TEXTURE = "/api/lightning-eumetsat";
const NORMAL_TEXTURE = "/api/earth-texture?type=normal";
const SPECULAR_TEXTURE = "/api/earth-texture?type=specular";

const EARTH_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*worldPosition; }";
const EARTH_FRAGMENT_SHADER = "uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 s=normalize(sunDirection); vec3 v=normalize(cameraPosition-vWorldPosition); float sunDot=dot(n,s); float dayMix=smoothstep(-0.075,0.015,sunDot); vec3 day=texture2D(dayTexture,vUv).rgb; day=pow(day,vec3(0.93)); day*=vec3(0.96,0.99,1.025); vec3 night=texture2D(nightTexture,vUv).rgb; night=pow(night,vec3(0.78)); float ocean=smoothstep(0.015,0.16,day.b-max(day.r,day.g)*0.78); float diffuse=0.58+0.52*max(sunDot,0.0); vec3 h=normalize(s+v); float spec=pow(max(dot(n,h),0.0),90.0)*ocean*max(sunDot,0.0)*0.28; float twilight=1.0-smoothstep(0.00,0.10,abs(sunDot)); vec3 dayLit=day*diffuse+vec3(0.42,0.62,0.95)*spec; vec3 nightSide=day*0.010+night*vec3(1.0,0.72,0.34)*1.55*lightsEnabled; vec3 color=mix(nightSide,dayLit,dayMix); color+=vec3(1.0,0.37,0.10)*twilight*0.045; float limb=pow(1.0-max(dot(n,v),0.0),4.0); color+=vec3(0.08,0.23,0.52)*limb*0.10; gl_FragColor=vec4(color,1.0); }"

// Solar terminator visible from the Moon: intentionally scoped to lunar views.
// Sun, Moon and all Earth layers use the same geocentric UTC solar direction.
const LUNAR_OBSERVER_EARTH_FRAGMENT_SHADER = `
uniform sampler2D dayTexture;
uniform vec3 sunDirection;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main(){
  float ndl=dot(normalize(vWorldNormal),normalize(sunDirection));
  // A soft optical twilight band; no hard black hemisphere overlay.
  // Brightness falls continuously into darkness across the true terminator.
  float day=smoothstep(-0.04,0.025,ndl);
  vec3 albedo=texture2D(dayTexture,vUv).rgb;
  // Deep nightside is BLACK. Preserve a thin natural atmospheric twilight
  // band instead of slicing Earth's geometric hemisphere with an overlay.
  vec3 sunlit=albedo*(0.025+1.22*max(ndl,0.0));
  gl_FragColor=vec4(sunlit*day,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

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
  // An opaque dark WMS background is NOT observed lightning.
  // Require actual colour/radiance plus coverage alpha, never alpha alone.
  float observedColor=max(max(s.r,s.g),s.b);
  return observedColor*smoothstep(0.035,0.12,s.a);
}

float observedDensity(vec2 uv){
  // ImageBitmap uploads ignore Texture.flipY. WMS PNG is north-up while
  // sphere v=1 is north: flip sampling here, keeping Canvas geolocation raw.
  vec2 wmsUv=vec2(uv.x,1.0-uv.y);
  return max(signal(texture2D(lightningTexture,wmsUv)),signal(texture2D(lightningEuropeTexture,wmsUv)));
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

  // A five-minute observed footprint can be only a few pixels wide at
  // full-Earth zoom. Widen the *visual glow* without inventing new activity.
  float farActivity=max(
    max(observedDensity(vUv+vec2(px.x*14.0,0.0)),observedDensity(vUv-vec2(px.x*14.0,0.0))),
    max(observedDensity(vUv+vec2(0.0,px.y*10.0)),observedDensity(vUv-vec2(0.0,px.y*10.0)))
  );
  float density=smoothstep(0.020,0.30,center);
  float aura=smoothstep(0.018,0.26,max(near1,near2))*0.78+
    smoothstep(0.025,0.36,farActivity)*0.20;
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

  float pulse=density*activity;
  float cloudGlow=aura*activity*0.26;
  // Only momentary, neutral-white illumination of actual lightning activity.
  // No persistent cobalt disc: branched filaments render in StormZoneFlash.
  vec3 color=vec3(0.88,0.93,1.0);
  float alpha=(pulse*0.34+cloudGlow*0.32)*facing;
  vec3 emission=color*(pulse*1.18+cloudGlow*0.80)*facing;
  gl_FragColor=vec4(emission,alpha);
}`;

const NIGHT_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vUv=uv; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const NIGHT_FRAGMENT_SHADER = "uniform sampler2D nightTexture; uniform sampler2D baseNightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; float lum(vec3 c){ return max(max(c.r,c.g),c.b); } void main(){ vec3 n=normalize(vWorldNormal); float sunDot=dot(n,normalize(sunDirection)); float nightMask=1.0-smoothstep(-0.11,-0.018,sunDot); float deepNight=1.0-smoothstep(-0.26,-0.095,sunDot); vec2 px=vec2(1.0/4096.0,1.0/2048.0); float d0=lum(texture2D(nightTexture,vUv).rgb); float dn=0.25*(lum(texture2D(nightTexture,vUv+vec2(px.x,0.0)).rgb)+lum(texture2D(nightTexture,vUv-vec2(px.x,0.0)).rgb)+lum(texture2D(nightTexture,vUv+vec2(0.0,px.y)).rgb)+lum(texture2D(nightTexture,vUv-vec2(0.0,px.y)).rgb)); float b0=lum(texture2D(baseNightTexture,vUv).rgb); float bn=0.25*(lum(texture2D(baseNightTexture,vUv+vec2(px.x,0.0)).rgb)+lum(texture2D(baseNightTexture,vUv-vec2(px.x,0.0)).rgb)+lum(texture2D(baseNightTexture,vUv+vec2(0.0,px.y)).rgb)+lum(texture2D(baseNightTexture,vUv-vec2(0.0,px.y)).rgb)); float dailySignal=max(0.0,d0-dn*0.72); float baseSignal=max(0.0,b0-bn*0.74); float dailyCore=pow(clamp(dailySignal*7.4,0.0,1.0),0.88); float baseCore=pow(clamp(baseSignal*3.4,0.0,1.0),0.94); float dailyWide=pow(clamp(d0*2.7,0.0,1.0),1.28); float baseWide=pow(clamp(b0*1.5,0.0,1.0),1.20); float confidence=smoothstep(0.003,0.030,d0); float core=max(dailyCore,baseCore*0.58*(1.0-confidence)); float metropolitanCluster=smoothstep(0.065,0.31,dn)*smoothstep(0.24,0.88,core); float halo=max(dailyWide,baseWide*0.34*(1.0-confidence))*0.33+metropolitanCluster*0.055; float signal=max(core,halo); float coreMix=smoothstep(0.34,0.92,core); vec3 amber=vec3(1.00,0.48,0.16); vec3 warmWhite=vec3(1.00,0.84,0.61); vec3 lightColor=mix(amber,warmWhite,coreMix); float brightness=(halo*0.72+core*2.15)*deepNight+(halo*0.30+core*1.05)*(nightMask-deepNight); float alpha=smoothstep(0.028,0.62,signal)*nightMask*lightsEnabled; gl_FragColor=vec4(lightColor*brightness,alpha); }";

const ATMOSPHERE_VERTEX_SHADER = "varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";
const ATMOSPHERE_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float density; uniform float warmBoost; uniform float airglowBoost; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=max(dot(n,v),0.0); float nds=dot(n,s); float softHorizon=pow(1.0-ndv,1.75); float rim=pow(1.0-ndv,6.8); float daylight=smoothstep(-0.24,0.20,nds); float sunset=exp(-pow((nds+0.018)*7.0,2.0)); float nightside=1.0-smoothstep(-0.20,0.04,nds); vec3 rayleigh=vec3(0.10,0.34,0.86)*daylight; vec3 mie=vec3(1.0,0.42,0.18)*sunset*(0.72+warmBoost*0.62); vec3 airglow=vec3(0.07,0.16,0.34)*nightside*airglowBoost; vec3 color=rayleigh*(0.30+0.70*softHorizon)+mie*rim+airglow*softHorizon; float broad=softHorizon*(0.038+0.145*daylight+0.050*nightside); float edge=rim*(0.070+0.22*daylight+0.22*sunset+0.045*nightside); float alpha=(broad+edge)*density; gl_FragColor=vec4(color,alpha); }";


const LIMB_VERTEX_SHADER = "varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";

const ATMOSPHERE_DISC_VERTEX_SHADER = "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const ATMOSPHERE_DISC_FRAGMENT_SHADER = "uniform float intensity; varying vec2 vUv; void main(){ float r=length(vUv-vec2(0.5))*2.0; float earthEdge=0.892; float d=max((r-earthEdge)/(1.0-earthEdge),0.0); float outside=smoothstep(earthEdge-0.002,earthEdge+0.0015,r); float core=exp(-pow(d/0.070,2.0)); float shoulder=exp(-d*3.2); float broad=exp(-d*1.15); float outerFade=1.0-smoothstep(0.92,1.0,d); float mask=outside*outerFade; vec3 deep=vec3(0.002,0.018,0.11); vec3 royal=vec3(0.010,0.20,0.95); vec3 cyan=vec3(0.10,0.48,1.28); vec3 ice=vec3(0.72,1.10,1.80); vec3 color=mix(deep,royal,clamp(shoulder*0.72+broad*0.16,0.0,1.0)); color=mix(color,cyan,clamp(core*0.62+shoulder*0.18,0.0,1.0)); color=mix(color,ice,core*0.58); float alpha=mask*(core*0.82+shoulder*0.30+broad*0.13)*intensity; vec3 emission=color*mask*(core*7.8+shoulder*2.05+broad*0.62)*intensity; if(alpha<0.0008) discard; gl_FragColor=vec4(emission,alpha); }";

const ATMOSPHERE_CORE_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float intensity; uniform float lunarObserver; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=clamp(dot(n,v),0.0,1.0); float nds=dot(n,s); float edge=1.0-ndv; float core=pow(edge,24.0); float shoulder=pow(edge,6.8); float day=smoothstep(-0.28,0.30,nds); float dusk=exp(-pow((nds+0.015)*5.6,2.0)); vec3 navy=vec3(0.0015,0.012,0.070); vec3 cobalt=vec3(0.004,0.060,0.34); vec3 royal=vec3(0.020,0.40,1.30); vec3 ice=vec3(0.68,1.05,1.85); vec3 color=mix(navy,cobalt,0.76+0.16*day); color=mix(color,royal,core*(0.50+0.26*day)); color=mix(color,ice,core*core*(0.18+0.20*day)); color+=vec3(0.04,0.012,0.07)*dusk*0.035; float side=mix(0.30+0.70*day,smoothstep(-0.04,0.025,nds),lunarObserver); float alpha=(core*0.68+shoulder*0.060)*intensity*side; vec3 emission=color*(core*11.5+shoulder*0.52)*intensity*side; gl_FragColor=vec4(emission,alpha); }";

const ATMOSPHERE_HALO_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float intensity; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=abs(dot(n,v)); float nds=dot(n,s); float edge=1.0-clamp(ndv,0.0,1.0); float nearHalo=pow(edge,2.8); float farHalo=pow(edge,1.25); float day=smoothstep(-0.34,0.30,nds); vec3 deep=vec3(0.001,0.012,0.065); vec3 blue=vec3(0.004,0.075,0.36); vec3 royal=vec3(0.010,0.22,0.82); vec3 color=mix(deep,blue,0.76+0.18*day); color=mix(color,royal,nearHalo*(0.18+0.12*day)); float side=0.25+0.75*day; float alpha=(nearHalo*0.13+farHalo*0.028)*intensity*side; vec3 emission=color*(nearHalo*1.10+farHalo*0.17)*intensity*side; gl_FragColor=vec4(emission,alpha); }";

const ATMOSPHERE_INNER_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float intensity; uniform float lunarObserver; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=clamp(dot(n,v),0.0,1.0); float nds=dot(n,s); float edge=1.0-ndv; float broad=pow(edge,0.72); float rim=pow(edge,4.2); float band=1.0-smoothstep(0.00,0.985,ndv); float day=smoothstep(-0.26,0.30,nds); float night=1.0-smoothstep(-0.26,-0.03,nds); vec3 deep=vec3(0.002,0.020,0.10); vec3 blue=vec3(0.006,0.095,0.46); vec3 royal=vec3(0.018,0.28,0.98); vec3 ice=vec3(0.16,0.50,1.22); vec3 color=mix(deep,blue,0.72+0.18*day); color=mix(color,royal,rim*(0.18+0.18*day)); color=mix(color,ice,pow(edge,8.0)*(0.10+0.12*day)); float side=mix(0.22+0.78*day+0.04*night,smoothstep(-0.04,0.025,nds),lunarObserver); float alpha=(broad*0.27+rim*0.070)*band*intensity*side; vec3 emission=color*(broad*0.72+rim*0.28)*band*intensity*side; gl_FragColor=vec4(emission,alpha); }";

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

  // NOAA equation-of-time approximation for solar longitude: otherwise
  // the Sun and terrestrial terminator can drift by almost four degrees.
  const equationOfTimeMinutes = 229.18 * (
    0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)
  );
  const subSolarLongitude = THREE.MathUtils.euclideanModulo(
    (12 - hour) * 15 - equationOfTimeMinutes / 4 + 180, 360,
  ) - 180;

  return {
    declinationRadians: declination,
    declinationDegrees: THREE.MathUtils.radToDeg(declination),
    subSolarLongitude,
    sunriseLongitude: THREE.MathUtils.euclideanModulo(subSolarLongitude - 90 + 180, 360) - 180,
    sunsetLongitude: THREE.MathUtils.euclideanModulo(subSolarLongitude + 90 + 180, 360) - 180,
  };
}

// A single UTC ephemeris snapshot drives both bodies and the terrestrial light.
// Ten-second memoization prevents duplicate astronomical work in the render loop.
let cachedCelestial:CelestialState|null=null;
let cachedCelestialSlot=-1;
function getCelestial(date:Date):CelestialState {
  const slot=Math.floor(date.getTime()/10000);
  if (slot!==cachedCelestialSlot || !cachedCelestial){
    cachedCelestialSlot=slot;
    cachedCelestial=celestialAt(date);
  }
  return cachedCelestial;
}
function earthFixedToWorld(km:{x:number;y:number;z:number}):THREE.Vector3 {
  return new THREE.Vector3(km.x,km.y,km.z)
    .multiplyScalar(GLOBE_RADIUS/6371).applyEuler(GLOBE_ROTATION);
}
function moonWorldPosition(date:Date):THREE.Vector3 {
  return GLOBE_CENTER.clone().add(earthFixedToWorld(getCelestial(date).moon.earthFixedKm));
}
/**
 * Display-only moon distance compression for cinematic lunar observer views.
 * NEVER feed these coordinates to ephemerides, Earth eclipse calculations,
 * or Earth-side Moon observation. Earth / lunar radii remain unchanged.
 */
function moonCinematicWorldPosition(date:Date,factor:MoonDistanceFactor):THREE.Vector3{
  const physical=moonWorldPosition(date);
  return GLOBE_CENTER.clone().add(physical.sub(GLOBE_CENTER).divideScalar(factor));
}
/** Consistent Moon render position for EVERY camera.
 * The geocentric UTC direction stays fixed regardless of orbit/pan/Follow;
 * 4× distance compression is VISUAL ONLY, not a change to ephemerides.
 * The historical Earth telescope still uses the physical Moon distance.
 */
function moonRenderWorldPosition(date:Date,_observer:THREE.Vector3,factor:MoonDistanceFactor,fromEarth=false){
  return fromEarth ? moonWorldPosition(date) : moonCinematicWorldPosition(date,factor);
}
const SUN_PROXY_SCENE_DISTANCE=650;
// The Sun remains an optically correct camera billboard at a finite render
// proxy depth; its *physical* distance and radius are in celestialEngine.ts.
function getSunDirection(date:Date) {
  return earthFixedToWorld(getCelestial(date).sun.earthFixedKm).normalize();
}

/**
 * Earthrise from the observed lunar surface, using the actual Moon center,
 * Earth direction and solar illumination. The deliberately narrow lens is
 * cinematic; Earth/Moon radii and their orbital separation are NOT enlarged.
 * This is a geometric lunar horizon, not a displaced texture foreground.
 */
type LunarObserverMode = "EARTHRISE" | "ORBIT";
/**
 * Two camera stations on the Earth-facing illuminated lunar limb:
 * visually grounded Earthrise (~185 km) and wider lunar orbit (~280 km).
 * Earth is always its real Moon-distance away; the Sun/phase stay live.
 * The Earthrise aesthetic comes from physical line-of-sight geometry,
 * observer selection and a telephoto lens, NEVER a scaled Earth billboard.
 */
function lunarEarthriseFrame(date:Date,mode:LunarObserverMode="EARTHRISE",factor:MoonDistanceFactor=1) {
  const lunarCenter=moonCinematicWorldPosition(date,factor);
  const toEarth=GLOBE_CENTER.clone().sub(lunarCenter).normalize();
  const sun=getSunDirection(date);
  // Pick the daylit limb, and keep the sign deterministic over phase changes.
  const daylitTangent=sun.clone().addScaledVector(toEarth,-sun.dot(toEarth));
  if(daylitTangent.lengthSq()<1e-6){
    daylitTangent.set(0,1,0).addScaledVector(toEarth,-toEarth.y);
    if(daylitTangent.lengthSq()<1e-6)
      daylitTangent.set(1,0,0).addScaledVector(toEarth,-toEarth.x);
  }
  daylitTangent.normalize();
  const lunarRadius=kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS);
  // Keep the real foreground beyond the renderer's 0.1 near clip plane.
  // At 16 km, the previous camera physically intersected the near plane,
  // cutting the Moon into a flat strip surrounded by black.
  const altitude=kmToScene(mode==="ORBIT"?280:185,GLOBE_RADIUS);
  // Earth center stays ~1.1° above the TRUE curved Moon limb.
  // thetaH = pi/2 + acos(radius/(radius+altitude)).
  const depression=Math.acos(lunarRadius/(lunarRadius+altitude));
  const earthHalfAngle=Math.asin(Math.min(0.99,GLOBE_RADIUS/lunarCenter.distanceTo(GLOBE_CENTER)));
  // Earth becomes larger at CINEMATIC 2×/3×. Keep its rendered disk
  // clearing the lunar horizon without changing the body's true radius.
  const earthAboveLimb=Math.max(
    THREE.MathUtils.degToRad(mode==="ORBIT"?1.25:1.05),
    earthHalfAngle+THREE.MathUtils.degToRad(0.22));
  const earthNormalComponent=-Math.sin(depression-earthAboveLimb);
  const surfaceNormal=toEarth.clone().multiplyScalar(earthNormalComponent)
    .addScaledVector(daylitTangent,Math.sqrt(1-earthNormalComponent**2)).normalize();
  const position=lunarCenter.clone().addScaledVector(surfaceNormal,lunarRadius+altitude);
  // Local zenith is the correct camera UP direction: keep the horizon level
  // even as the Moon moves in Earth's rotating coordinate frame.
  const earthLook=GLOBE_CENTER.clone().sub(position).normalize();
  const look=earthLook.clone().addScaledVector(surfaceNormal,-0.001).normalize();
  return {
    position,
    target:position.clone().addScaledVector(look,4),
    up:surfaceNormal,
    lunarCenter,
    altitudeKm:mode==="ORBIT"?280:185,
  };
}

/**
 * Primary MOON mode: orbit pivot and view centre are the physical lunar
 * centre. Earth remains at its real geocentric distance, beyond one limb.
 */
function centeredMoonOrbitFrame(date:Date,factor:MoonDistanceFactor=1){
  const lunarCenter=moonCinematicWorldPosition(date,factor);
  const toEarth=GLOBE_CENTER.clone().sub(lunarCenter).normalize();
  const sun=getSunDirection(date);
  const tangent=sun.clone().addScaledVector(toEarth,-sun.dot(toEarth));
  if(tangent.lengthSq()<0.0001){
    tangent.set(0,1,0).addScaledVector(toEarth,-toEarth.y);
    if(tangent.lengthSq()<0.0001)tangent.set(1,0,0).addScaledVector(toEarth,-toEarth.x);
  }
  const position=lunarCenter.clone().addScaledVector(toEarth,-7.7)
    .addScaledVector(tangent.normalize(),2.45);
  return {position,target:lunarCenter,lunarCenter};
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

/**
 * Actual topocentric line-of-sight of the Moon from an existing selected
 * location. A location on the far side of Earth cannot see the Moon.
 * This never changes global ephemerides or any existing Controls.
 */
function moonObserverFrame(date:Date,marker?:{lat:number;lon:number}|null){
  const moon=moonWorldPosition(date);
  const radial=marker
    ? globeWorldNormal(marker.lat,marker.lon)
    : moon.clone().sub(GLOBE_CENTER).normalize();
  // Observer is only ~150 m above the sphere, not an arbitrary 18 km orbit.
  // This preserves true rising/setting direction at the selected city.
  const position=GLOBE_CENTER.clone().addScaledVector(radial,GLOBE_RADIUS+0.0001);
  const sight=moon.clone().sub(position).normalize();
  const altitudeRadians=Math.asin(THREE.MathUtils.clamp(sight.dot(radial),-1,1));
  const north=marker
    ? globeWorldNormal(Math.min(89.999,marker.lat+0.02),marker.lon).sub(radial).normalize()
    : new THREE.Vector3(0,1,0).addScaledVector(radial,-radial.y).normalize();
  const up=north.lengthSq()>1e-8 ? north : new THREE.Vector3(0,0,1);
  return {position,moon,up,altitudeRadians};
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

function LocalMetricHalo({ lat, lon, value, kind }: {
  lat: number; lon: number; value: number; kind: "PRESSURE" | "SNOW";
}) {
  const point = useMemo(() => latLonToPoint(lat, lon, 2.59), [lat, lon]);
  const pressure = kind === "PRESSURE";
  const strength = pressure
    ? THREE.MathUtils.clamp(Math.abs(value - 1013) / 55, 0.12, 0.65)
    : THREE.MathUtils.clamp(value / 4, 0.08, 0.72);
  const color = pressure ? "#97cbff" : "#d4eaff";
  return (
    <group position={point}>
      <mesh scale={2 + strength}>
        <sphereGeometry args={[0.06, 20, 20]} />
        <meshBasicMaterial color={color} opacity={0.09 + strength * 0.08}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14 + strength * 0.09, 0.006, 10, 56]} />
        <meshBasicMaterial color={color} opacity={0.32 + strength * 0.35}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
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

function SunVisual({moonDistanceFactor,fromEarth}:{moonDistanceFactor:MoonDistanceFactor;fromEarth:boolean}) {
  const group = useRef<THREE.Group>(null);
  const solarMesh = useRef<THREE.Mesh>(null);
  const gaze = useRef(0);
  const uniforms = useMemo(() => ({ uGaze: { value: 0 }, uVisibility:{value:1} }), []);

  useFrame(({ camera }, delta) => {
    if (!group.current || !solarMesh.current) return;
    // The solar emitter follows exactly the same direction as Earth lighting.
    const utcNow=new Date();
    const sun = getSunDirection(utcNow);
    const renderedMoon=moonRenderWorldPosition(utcNow,camera.position,moonDistanceFactor,fromEarth);
    const moonVisibility=moonSunVisibility(camera.position,renderedMoon,
      kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS),sun);
    const earthVisibility=solarLensVisibility(camera.position,
      camera.position.clone().addScaledVector(sun,SUN_PROXY_SCENE_DISTANCE),
      GLOBE_CENTER,GLOBE_RADIUS);
    // Solar HDR/glare must disappear when either opaque celestial body
    // blocks the line of sight. Shared world camera and UTC sunlight only.
    // The depth-tested Moon silhouette removes the covered Sun pixels.
    // Do not dim the *entire* solar disc during a partial eclipse: reserve
    // the uniform mask for complete occultation, while Bloom separately
    // receives the fractional unblocked solar area.
    uniforms.uVisibility.value=(moonVisibility<0.0001?0:1)*earthVisibility;
    // Proxy tracks the camera so the real far Sun has zero artificial parallax.
    group.current.position.copy(camera.position).addScaledVector(sun, SUN_PROXY_SCENE_DISTANCE);
    const distance = camera.position.distanceTo(group.current.position);
    const radius = solarBillboardWorldRadius(distance);
    solarMesh.current.scale.setScalar(radius);
    const gazeDirection = group.current.position.clone().sub(camera.position).normalize();
    const forward = camera.getWorldDirection(new THREE.Vector3());
    // Stable bright-view optic; actual Earth occlusion is always depth-tested.
    const attention = THREE.MathUtils.smoothstep(forward.dot(gazeDirection), 0.965, 0.998);
    gaze.current = THREE.MathUtils.damp(gaze.current, attention, 5.5, Math.min(delta, 0.05));
    uniforms.uGaze.value = gaze.current;
  });

  return (
    <group ref={group}>
      <Billboard follow>
        <mesh ref={solarMesh} frustumCulled={false}>
          <planeGeometry args={[2, 2]} />
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={SOLAR_VERTEX_SHADER}
            fragmentShader={SOLAR_FRAGMENT_SHADER}
            transparent
            depthTest={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            fog={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

// The visible near side is procedurally shaded for now; it is NOT a NASA
// orthophoto. No remote texture stalls, and no claim of measured lunar terrain.
function makeIllustrativeMoonTexture():THREE.CanvasTexture|null {
  if(typeof document==="undefined")return null;
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext("2d");
  if(!ctx)return null;
  ctx.fillStyle="#8c8e90";ctx.fillRect(0,0,1024,512);
  let seed=0x91d0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<22000;i++){
    const x=random()*1024,y=random()*512;
    const p=0.3+random()*1.5;
    const light=80+Math.floor(random()*115);
    ctx.fillStyle="rgba("+light+","+light+","+light+","+(0.02+random()*0.13)+")";
    ctx.fillRect(x,y,p,p);
  }
  const maria=[[.40,.49,.092,.15],[.48,.37,.10,.13],[.57,.54,.085,.17],
               [.35,.61,.12,.11],[.61,.37,.06,.11],[.71,.65,.11,.08]];
  for(const [u,v,rx,ry] of maria){
    const x=u*1024,y=v*512;
    ctx.save();ctx.translate(x,y);ctx.scale(rx*1024,ry*512);
    const grad=ctx.createRadialGradient(0,0,.08,0,0,1);
    grad.addColorStop(0,"rgba(24,27,31,.36)");
    grad.addColorStop(1,"rgba(24,27,31,0)");
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // The placeholder must not look like 410 identical outlined craters.
  // Preserve faint albedo variation only until the actual NASA map decodes.
  for(let i=0;i<6800;i++){
    const x=random()*1024,y=random()*512,r=.6+random()*1.2;
    const shade=85+Math.floor(random()*80);
    ctx.fillStyle="rgba("+shade+","+shade+","+shade+",0.04)";
    ctx.fillRect(x,y,r,r);
  }
  const t=new THREE.CanvasTexture(canvas);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;
  t.anisotropy=2;t.needsUpdate=true;
  return t;
}

function MoonVisual({detailed,visualDistanceFactor,fromEarth,observerLocation}:{
  detailed:boolean;visualDistanceFactor:MoonDistanceFactor;
  fromEarth:boolean;observerLocation?:{lat:number;lon:number}|null;
}){
  const moon=useRef<THREE.Group>(null);
  const lunarMaterial=useRef<THREE.MeshStandardMaterial>(null);
  const lastApplied=useRef({color:false,relief:false,colorHd:false,reliefHd:false});
  const texture=useMemo(()=>makeIllustrativeMoonTexture(),[]);
  const [lrocTexture,setLrocTexture]=useState<THREE.Texture|null>(null);
  const [lolaRelief,setLolaRelief]=useState<THREE.Texture|null>(null);
  const [lrocHd,setLrocHd]=useState<THREE.Texture|null>(null);
  const [lolaHd,setLolaHd]=useState<THREE.Texture|null>(null);
  const ownedLrocHd=useRef<THREE.Texture|null>(null);
  const ownedLolaHd=useRef<THREE.Texture|null>(null);
  const hdAttempt=useRef(false);
  const ownedLroc=useRef<THREE.Texture|null>(null);
  const ownedLola=useRef<THREE.Texture|null>(null);
  const reliefFetching=useRef(false);
  const reliefLastAttempt=useRef(0);
  const lastAttempt=useRef(0);
  const fetching=useRef(false);
  const alive=useRef(false);
  // Ground-observer atmospheric model fields; never affect spacecraft cameras.
  // CAMS supplies a regional MODEL forecast, not actual lunar photometry.
  const aerosolSample=useRef<{key:string;aod:number;validMs:number;receivedMs:number}|null>(null);
  const aerosolRequest=useRef<{key:string;controller:AbortController}|null>(null);
  const aerosolLastKey=useRef("");
  const aerosolNextAttempt=useRef(0);
  useEffect(()=>()=>{aerosolRequest.current?.controller.abort();},[]);
  const notify=(status:"LOADING"|"NASA LROC ACTIVE"|"NASA LROC HD ACTIVE"|"NASA MAP RETRY PENDING")=>{
    window.dispatchEvent(new CustomEvent("cupola-moon-map-status",{detail:status}));
  };
  useEffect(()=>()=>{texture?.dispose();},[texture]);
  // Prewarm the small, cached 2K image immediately on scene mount.
  // Waiting for the Moon button caused the ugly fallback to appear first.
  // A genuine 200/decode must arrive before the UI can say NASA ACTIVE.
  const loadNasaMoon=()=>{
    if(!alive.current||ownedLroc.current||fetching.current)return;
    if(Date.now()-lastAttempt.current<10000)return;
    fetching.current=true;
    lastAttempt.current=Date.now();
    notify("LOADING");
    new THREE.TextureLoader().load("/api/moon-texture",loaded=>{
      fetching.current=false;
      if(!alive.current){loaded.dispose();return;}
      loaded.colorSpace=THREE.SRGBColorSpace;
      loaded.anisotropy=4;
      loaded.wrapS=THREE.RepeatWrapping;
      ownedLroc.current=loaded;
      setLrocTexture(loaded);
      // Only signal ACTIVE after the real 3D mesh actually binds this map.
      notify("LOADING");
    },undefined,()=>{
      fetching.current=false;
      if(alive.current)notify("NASA MAP RETRY PENDING");
    });
  };
  useEffect(()=>{
    alive.current=true;
    loadNasaMoon();
    return()=>{
      alive.current=false;
      ownedLroc.current?.dispose();
      ownedLroc.current=null;
      ownedLola.current?.dispose();
      ownedLola.current=null;
      ownedLrocHd.current?.dispose();
      ownedLrocHd.current=null;
      ownedLolaHd.current?.dispose();
      ownedLolaHd.current=null;
    };
    // Load once for a mounted Moon. No dependency on image state/view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // Measured NASA LOLA lunar heights (8-bit preview); optional, on-demand.
  // Preserve the honest neutral fallback if the upstream is unreachable.
  const loadLolaRelief=()=>{
    if(!alive.current||ownedLola.current||reliefFetching.current)return;
    if(Date.now()-reliefLastAttempt.current<10000)return;
    reliefLastAttempt.current=Date.now();
    reliefFetching.current=true;
    new THREE.TextureLoader().load("/api/moon-relief",loaded=>{
      reliefFetching.current=false;
      if(!alive.current){loaded.dispose();return;}
      loaded.colorSpace=THREE.NoColorSpace;
      loaded.anisotropy=4;
      loaded.wrapS=THREE.RepeatWrapping;
      ownedLola.current=loaded;
      setLolaRelief(loaded);
      // Confirm the material's bumpMap first, not just successful JPEG fetch.
    },undefined,()=>{
      reliefFetching.current=false;
      if(alive.current)window.dispatchEvent(new CustomEvent("cupola-moon-relief-status",{detail:"LOLA RELIEF UNAVAILABLE"}));
    });
  };
  // HD assets are generated FROM NASA's 16-bit 4k LROC + LOLA TIFF
  // by our verified CI pipeline. Load ONLY on lunar views and retain the
  // 2k/1k NASA fallbacks if those optional generated assets are absent.
  const loadHdLunarMaps=()=>{
    if(!alive.current||hdAttempt.current)return;
    hdAttempt.current=true;
    const loadHd=(url:string,kind:"albedo"|"relief")=>{
      new THREE.TextureLoader().load(url,loaded=>{
        if(!alive.current){loaded.dispose();return;}
        loaded.colorSpace=kind==="albedo"?THREE.SRGBColorSpace:THREE.NoColorSpace;
        loaded.anisotropy=4;
        loaded.wrapS=THREE.RepeatWrapping;
        if(kind==="albedo"){ownedLrocHd.current=loaded;setLrocHd(loaded);}
        else {ownedLolaHd.current=loaded;setLolaHd(loaded);}
      },undefined,()=>{
        // The global NASA sources continue working; no fake HD status.
      });
    };
    loadHd("/moon/lroc_color_4k.webp","albedo");
    loadHd("/moon/lola_height_4k.webp","relief");
  };
  useEffect(()=>{
    if(detailed){
      if(!ownedLroc.current)loadNasaMoon();
      if(!ownedLola.current)loadLolaRelief();
      loadHdLunarMaps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[detailed]);
  useFrame(({camera})=>{
    if(!moon.current)return;
    const utcNow=new Date();
    moon.current.position.copy(moonRenderWorldPosition(
      utcNow,camera.position,visualDistanceFactor,fromEarth));
    // A Moon entirely below the selected city's physical horizon must NOT
    // shine through the ground: the ultra-close ground camera's near clip
    // otherwise erases foreground terrain and falsely reveals the Moon.
    // Allow partial lunar-disc visibility until the upper limb fully sets.
    if(fromEarth && observerLocation){
      const observer=moonObserverFrame(utcNow,observerLocation);
      const moonRadius=kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS);
      const moonHalfAngle=Math.asin(Math.min(1,moonRadius/
        observer.position.distanceTo(observer.moon)));
      moon.current.visible=observer.altitudeRadians> -moonHalfAngle;
    }else moon.current.visible=true;
    const toEarth=GLOBE_CENTER.clone().sub(moon.current.position).normalize();
    // Mean lunar north pole in the same rotating UTC frame as the Moon itself.
    // Keep the mapped near-side meridian pointed Earthward while rotating the
    // crater pattern to its real sky orientation (not world-up Y).
    const pole=earthFixedToWorld(moonPoleEarthFixed(utcNow)).normalize();
    const yAxis=pole.addScaledVector(toEarth,-pole.dot(toEarth)).normalize();
    const xAxis=yAxis.clone().cross(toEarth).normalize();
    const alignedNorth=toEarth.clone().cross(xAxis).normalize();
    moon.current.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xAxis,alignedNorth,toEarth));
    const material=lunarMaterial.current;
    if(material){
      const cameraAltitudeKm=Math.max(0,
        (camera.position.distanceTo(GLOBE_CENTER)-GLOBE_RADIUS)*6371/GLOBE_RADIUS);
      // Tint depends on the real air column from the CAMERA, not the selected
      // satellite country or extra UI control. Orbital cameras see a grey Moon.
      const elevation=moonAltitudeDegrees(camera.position,GLOBE_CENTER,moonWorldPosition(utcNow));
      // Sample the actual near-ground CAMERA location, not the selected satellite's
      // subsatellite country. In orbit there is no terrestrial AOD tint.
      let aerosolAod:number|null=null;
      if(cameraAltitudeKm<120 && elevation> -1){
        const local=camera.position.clone().sub(GLOBE_CENTER)
          .applyQuaternion(new THREE.Quaternion().setFromEuler(GLOBE_ROTATION).invert())
          .normalize();
        const latitude=THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(local.y,-1,1)));
        const longitude=THREE.MathUtils.radToDeg(Math.atan2(-local.z,local.x));
        const sampleLat=Math.round(latitude*4)/4;
        const sampleLon=Math.round(longitude*4)/4;
        const key=sampleLat.toFixed(2)+":"+sampleLon.toFixed(2);
        const nowMs=utcNow.getTime();
        if(aerosolLastKey.current!==key){
          aerosolRequest.current?.controller.abort();
          aerosolRequest.current=null;
          aerosolLastKey.current=key;
          aerosolNextAttempt.current=0;
        }
        const sample=aerosolSample.current;
        const usable=sample!==null && sample.key===key &&
          nowMs-sample.receivedMs<30*60_000 && Math.abs(nowMs-sample.validMs)<4*3600_000;
        if(usable)aerosolAod=sample.aod;
        if(!usable && !aerosolRequest.current && nowMs>=aerosolNextAttempt.current){
          aerosolNextAttempt.current=nowMs+3*60_000;
          const controller=new AbortController();
          aerosolRequest.current={key,controller};
          void fetch("/api/moon-atmosphere?lat="+sampleLat.toFixed(2)+"&lon="+sampleLon.toFixed(2),
            {signal:controller.signal})
            .then(async response=>{
              if(!response.ok)throw new Error("No fresh CAMS aerosol model");
              return await response.json() as {aerosolOpticalDepth550?:unknown;validAt?:unknown;provenance?:unknown};
            })
            .then(data=>{
              if(aerosolRequest.current?.controller!==controller || data.provenance!=="MODEL_FORECAST")return;
              const aod=data.aerosolOpticalDepth550;
              const validMs=typeof data.validAt==="string"?Date.parse(data.validAt):NaN;
              if(typeof aod==="number"&&Number.isFinite(aod)&&aod>=0&&aod<=3.5 &&
                Number.isFinite(validMs)&&Math.abs(Date.now()-validMs)<4*3600_000){
                aerosolSample.current={key,aod,validMs,receivedMs:Date.now()};
              }
            })
            .catch(()=>{/* Forecast unavailable: retain the clear-air model. */})
            .finally(()=>{if(aerosolRequest.current?.controller===controller)aerosolRequest.current=null;});
        }
      }
      const atmosphere=lunarAtmosphereTransmission(elevation,cameraAltitudeKm,aerosolAod);
      const celestial=getCelestial(utcNow);
      const shadow=moonEarthShadow(celestial.moon.earthFixedKm,celestial.sun.earthFixedKm);
      const rgb=moonAppearanceRGB(atmosphere,shadow.umbra,shadow.penumbra);
      material.color.setRGB(rgb[0],rgb[1],rgb[2]);
    }
    // A source 200/decode alone does not prove its color appears on the Moon.
    if(!material)return;
    const lrocApplied=!!lrocTexture && material.map===lrocTexture;
    const lolaApplied=!!lolaRelief && material.bumpMap===lolaRelief;
    const lrocHdApplied=!!lrocHd && material.map===lrocHd;
    const lolaHdApplied=!!lolaHd && material.bumpMap===lolaHd;
    if(lrocApplied&&!lastApplied.current.color){
      lastApplied.current.color=true;
      notify("NASA LROC ACTIVE");
    }
    if(lolaApplied&&!lastApplied.current.relief){
      lastApplied.current.relief=true;
      window.dispatchEvent(new CustomEvent("cupola-moon-relief-status",{detail:"NASA LOLA ACTIVE"}));
    }
    if(lrocHdApplied&&!lastApplied.current.colorHd){
      lastApplied.current.colorHd=true;
      notify("NASA LROC HD ACTIVE");
    }
    if(lolaHdApplied&&!lastApplied.current.reliefHd){
      lastApplied.current.reliefHd=true;
      window.dispatchEvent(new CustomEvent("cupola-moon-relief-status",{detail:"NASA LOLA HD ACTIVE"}));
    }
  });
  return (
    <group ref={moon}>
      {/* LROC equirectangular 0° lunar longitude is texture u=0.5.
          Align that physically Earth-facing meridian with this group's +Z. */}
      <mesh frustumCulled={false} renderOrder={40} rotation={[0,-Math.PI/2,0]}>
        <sphereGeometry args={[kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS),detailed?256:64,detailed?160:40]}/>
        <meshStandardMaterial ref={lunarMaterial} depthTest depthWrite fog={false}
          color={lrocHd || lrocTexture ? "#ffffff" : "#d0d1d3"}
          map={lrocHd ?? lrocTexture ?? texture ?? undefined}
          bumpMap={lrocHd || lrocTexture ? lolaHd ?? lolaRelief ?? undefined : undefined}
          bumpScale={(lrocHd || lrocTexture) && (lolaHd || lolaRelief) ? 0.028 : 0}
          displacementMap={lrocHd || lrocTexture ? lolaHd ?? lolaRelief ?? undefined : undefined}
          displacementScale={(lrocHd || lrocTexture) && (lolaHd || lolaRelief) ? 0.0035 : 0}
          displacementBias={(lrocHd || lrocTexture) && (lolaHd || lolaRelief) ? -0.00175 : 0}
          roughness={1} metalness={0}/>
      </mesh>
    </group>
  );
}

const ECLIPSE_SHADOW_VERTEX=`
varying vec3 vWorld;
varying vec3 vNormal;
void main(){
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorld=world.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*world;
}`;
const ECLIPSE_SHADOW_FRAGMENT=`
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
uniform vec3 uMoon;
uniform vec3 uSunDirection;
uniform float uMoonRadius;
uniform float uSunAngularRadius;
void main(){
  vec3 m=uMoon-vWorld;
  float md=length(m);
  vec3 mdir=m/md;
  vec3 sdir=normalize(uSunDirection);
  // For small eclipse angles, chord length is the angle in radians.
  float sep=length(mdir-sdir);
  float moonRadius=asin(clamp(uMoonRadius/md,0.0,1.0));
  float radiusSum=moonRadius+uSunAngularRadius;
  float radiusDiff=abs(moonRadius-uSunAngularRadius);
  float penumbra=1.0-smoothstep(max(0.0,radiusDiff),radiusSum,sep);
  float central=1.0-smoothstep(0.0,max(radiusDiff,0.00002),sep);
  float lit=smoothstep(0.0,0.16,dot(normalize(vNormal),sdir));
  float shade=clamp((0.46*penumbra+0.47*central)*lit,0.0,0.91);
  if(shade<0.002)discard;
  gl_FragColor=vec4(0.005,0.011,0.021,shade);
}`;
function EclipseShadowPreview(){
  const shell=useRef<THREE.Mesh>(null);
  const uniforms=useMemo(()=>({
    uMoon:{value:new THREE.Vector3()},
    uSunDirection:{value:new THREE.Vector3(1,0,0)},
    uMoonRadius:{value:kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS)},
    uSunAngularRadius:{value:0.266*Math.PI/180},
  }),[]);
  useFrame(()=>{
    if(!shell.current)return;
    const e=getCelestial(new Date());
    const close=eclipseAt(e,{x:0,y:0,z:0}).separationDeg<2.0;
    shell.current.visible=close;
    if(!close)return;
    uniforms.uMoon.value.copy(moonWorldPosition(new Date()));
    uniforms.uSunDirection.value.copy(getSunDirection(new Date()));
    uniforms.uSunAngularRadius.value=e.sun.angularRadiusDeg*Math.PI/180;
  });
  return (
    <mesh ref={shell} position={GLOBE_CENTER} visible={false}>
      <sphereGeometry args={[GLOBE_RADIUS+0.036,96,64]}/>
      <shaderMaterial uniforms={uniforms} vertexShader={ECLIPSE_SHADOW_VERTEX}
        fragmentShader={ECLIPSE_SHADOW_FRAGMENT} transparent depthWrite={false}
        depthTest side={THREE.FrontSide} fog={false}/>
    </mesh>
  );
}

type CloudDebugMode = 0 | 1 | 2 | 3 | 4 | 5;
type CloudEngine = "legacy" | "v2" | "v3";
type CloudGpuApply = { kind:"verified-l2" | "visual-backup"; version:string | null; appliedAt:string };
type CloudTelemetry = { status: "observed" | "fallback" | "visual"; frameTime: string | null; sourceObservationAt?: string | null; coverage: number; sources: string[]; products: string[]; sourceCoverage: string[]; fallbackReasons: string[]; engine?: CloudEngine; sourceAges?: string[]; visualCoverage?: number; gmgsiCoverage?: number; visualSources?: string[]; displayFootprint?: number; modelCoverage?: number; modelAge?: string; modelStatus?: string; archiveAge?: string; irArchiveAge?: string };
type ScienceV3Manifest = {
  schema: string;
  version: string;
  generated_at: string;
  expires_at: string;
  width: number;
  height: number;
  observed_coverage_fraction: number;
  science_products: string[];
  sources: Array<{ source: string; product: string; observation_start: string; observation_end: string }>;
};

function LiveCloudLayer({
  cloudEngine,
  cloudDebugMode,
  staticCloudTexture,
  dayTexture,
  sunDirection,
  cinematic,
  lunarObserver,
}: {
  cloudEngine: CloudEngine;
  cloudDebugMode: CloudDebugMode;
  staticCloudTexture: THREE.Texture;
  dayTexture: THREE.Texture;
  sunDirection: { value: THREE.Vector3 };
  cinematic: boolean;
  lunarObserver: boolean;
}) {
  const { gl, invalidate } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const shadowMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const currentLiveRef = useRef<THREE.Texture | null>(null);
  const nextLiveRef = useRef<THREE.Texture | null>(null);
  const atlasCurrentRef = useRef<THREE.Texture | null>(null);
  const atlasNextRef = useRef<THREE.Texture | null>(null);
  const atlasTransitionRef = useRef<number | null>(null);
  // Emitted only when a cloud texture has finished its actual 3D GPU fade.
  const pendingGpuApplyRef = useRef<{kind: CloudGpuApply["kind"];version:string|null}|null>(null);
  const initialCloudBlendStartRef = useRef<number | null>(null);
  const limbOverlayRef = useRef<THREE.Texture | null>(null);
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
    cloudAtlasA: { value: staticCloudTexture },
    cloudAtlasB: { value: staticCloudTexture },
    cloudAtlasBlend: { value: 0 },
    cloudAtlasReady: { value: 0 },
    cloudIntroBlend: { value: cloudEngine === "v3" ? 0 : 1 },
    v3SeamVisualBlend: { value: 0 },
    v3LimbOverlayTexture: { value: staticCloudTexture },
    v3LimbOverlayReady: { value: 0 },
    cloudDebugMode: { value: 0 },
    geoAvailable: { value: new THREE.Vector4(0, 0, 0, 0) },
    sunDirection,
    lunarObserver: { value: lunarObserver ? 1 : 0 },
    opacity: { value: cinematic ? 0.66 : 0.56 },
    brightness: { value: cinematic ? 1.15 : 1.07 },
    relief: { value: cinematic ? 6.4 : 5.1 },
    rimStrength: { value: cinematic ? 0.42 : 0.29 },
    shadowStrength: { value: cinematic ? 0.40 : 0.34 },
  // These uniforms MUST NOT be recreated on EXPLORE/CINEMA toggles: the
  // async atlas effect below depends on their identity and would refetch.
  }), [staticCloudTexture, dayTexture, sunDirection]);

  useEffect(() => {
    uniforms.cloudDebugMode.value = cloudDebugMode;
    uniforms.lunarObserver.value = lunarObserver ? 1 : 0;
    uniforms.staticCloudTexture.value = staticCloudTexture;
    uniforms.baseTexture.value = dayTexture;
    uniforms.opacity.value = cinematic ? 0.66 : 0.56;
    uniforms.brightness.value = cinematic ? 1.15 : 1.07;
    uniforms.relief.value = cinematic ? 6.4 : 5.1;
    uniforms.rimStrength.value = cinematic ? 0.42 : 0.29;
    uniforms.shadowStrength.value = cinematic ? 0.40 : 0.34;
  }, [cloudDebugMode, staticCloudTexture, dayTexture, cinematic, lunarObserver, uniforms]);

  useEffect(() => {
    let cancelled = false;
    initialCloudBlendStartRef.current = null;
    uniforms.cloudIntroBlend.value = cloudEngine === "v3" ? 0 : 1;
    // Assemble a single EPSG:4326 atlas once all sources settle.
    // Hold the last usable frame per source across short upstream outages.
    const cachedFrames: CloudAtlasFrames = {};
    const geoControllers = new Set<AbortController>();
    let geoLoading = false;
    let publishedFrameSignature = "";

    // One lossless composited PNG per completed V3 observation cycle. Never
    // ship three disconnected sources as separate WebGL cloud textures.
    let atlasPngUrl: string | null = null;
    let atlasEncodeGeneration = 0;
    // Resolve presentation defaults ONCE per active cloud-engine lifetime.
    // Never read ad-hoc URL overrides in each asynchronous atlas update.
    const v3Policy = resolveCloudV3RuntimeConfig(new URLSearchParams(window.location.search));
    // Both the legacy renderer and the QA-verified scientific V3 feed use
    // the exact same 3D shell, sunlight and ground-shadow material.
    const publishCanvas = (
      sourceCanvas: HTMLCanvasElement,
      limb?: { scientific: ImageData; infrared: ImageData },
      atlasVersion?: string,
    ) => {
      // Final display-only compositing stage, AFTER L2, GMGSI, Meteosat
      // and any NOAA GFS fallback have been assigned source IDs.
      // Work on a new canvas: archived/verified native L2 ImageData and the
      // composited provenance source are never overwritten.
      // Default narrow: do not stretch one observation across 84px of an
      // unrelated satellite sector. ?cloudSeams=wide restores prior blending
      // for A/B comparison; ?cloudSeams=legacy disables both final passes.
      const seamMode = v3Policy.seamMode;
      let canvas = sourceCanvas;
      // One classified source raster readback per update, shared by
      // tone matching and the measured NOAA/L2 crossover sidecar.
      const sourcePixels = cloudEngine === "v3" ?
        sourceCanvas.getContext("2d", {willReadFrequently:true})?.getImageData(
          0,0,sourceCanvas.width,sourceCanvas.height) ?? null : null;
      if (cloudEngine === "v3" && seamMode !== "legacy") {
        if (sourcePixels) {
          const original=sourcePixels;
          const harmonized=harmonizeV3CloudEdges(original,seamMode === "wide" ? 84 : 12);
          // Existing 12px one-sided protection prevents sharp cloud-to-clear
          // cuts. The new 56px local tone pass aligns the *scale* of observed
          // greys without borrowing structures or reclassifying pixels.
          // ?cloudSeams=wide retains the older aggressive algorithm for QA.
          const matched=seamMode === "wide" ? null :
            toneMatchV3SupplementalSeams(harmonized.image,56);
          const display=document.createElement("canvas");
          display.width=sourceCanvas.width;display.height=sourceCanvas.height;
          const displayCtx=display.getContext("2d");
          if (!displayCtx) throw new Error("No Canvas2D for V3 source-aware final seams");
          displayCtx.putImageData(matched?.image ?? harmonized.image,0,0);
          canvas=display;
          window.dispatchEvent(new CustomEvent("cupola-cloud-seam-diagnostic",{
            detail: {algorithm:seamMode === "wide"
                ? "positive84-wisps-gpuedge-v4" : "tone56-source-local-gpu2-v6",
              seamMode: seamMode === "wide" ? "wide" : "tone",
              ...harmonized.stats,
              toneMatching:matched?.stats ?? null,
              originalLevel2Immutable:true,sourceMasksImmutable:true},
          }));
        }
      }
      // Only QA/export mode serializes the 2048x1024 atlas to a PNG. The
      // photographic renderer uses CanvasTexture directly with no encoder.
      if (cloudEngine === "v3" && v3Policy.exportAtlasPng) {
        const generation = ++atlasEncodeGeneration;
        // Convert the FINAL, already QA-composited canvas into a real PNG.
        // Keep the freshest Blob URL for diagnostics or download. No server
        // storage, fake re-observation or independent per-source rendering.
        canvas.toBlob(blob => {
          if (cancelled || generation !== atlasEncodeGeneration || !blob) return;
          const url = URL.createObjectURL(blob);
          if (atlasPngUrl) URL.revokeObjectURL(atlasPngUrl);
          atlasPngUrl = url;
          window.dispatchEvent(new CustomEvent("cupola-cloud-unified-png", {
            detail: {url, byteLength:blob.size, width:canvas.width,
              height:canvas.height, format:"image/png", scientific:false},
          }));
          // Optional QA tool: ?cloudAtlasExport=1 adds a download link for
          // the exact lossless PNG which was sent as ONE WebGL texture.
          if (new URLSearchParams(window.location.search).get("cloudAtlasExport") === "1") {
            let link = document.getElementById("cupola-v3-unified-atlas") as HTMLAnchorElement | null;
            if (!link) {
              link = document.createElement("a");
              link.id = "cupola-v3-unified-atlas";
              link.textContent = "DOWNLOAD UNIFIED V3 CLOUD PNG";
              Object.assign(link.style, {position:"fixed",zIndex:"10000",
                left:"50%",top:"12px",transform:"translateX(-50%)",
                color:"white",background:"#11253d",padding:"9px 15px",
                border:"1px solid #5da8ed",borderRadius:"8px",fontSize:"12px"});
              document.body.appendChild(link);
            }
            link.href = url;
            link.download = "cupola-v3-unified-cloud-atlas.png";
          }
        }, "image/png");
      }
      // Separate supplemental REAL satellite IR overlay for weak native-L2
      // viewing rims. It is sampled ONLY in a thin band at actual overlapping
      // longitudes. The classified-clear science/provenance atlas is NEVER
      // overwritten, and model/WMS cannot create an unmeasured cloud.
      const activeLimb = cloudEngine === "v3" && seamMode !== "legacy" &&
        seamMode !== "wide" &&
        v3Policy.useLimbOverlay && !!limb;
      if (activeLimb && limb) {
        if (sourcePixels) {
          const composite = sourcePixels;
          // The visual bridge must use the SAME local NOAA IR calibration
          // as the world atlas outside the L2 footprint. No new satellite
          // pixels or temporal offsets: everything is one actual GMGSI scan.
          const irCal=estimateGmgsiVisualGains(limb.scientific,limb.infrared);
          // Opt-in experiment only, NOT the accepted default or Cinema.
          // Compare ?cloudCrossover=right96 against the normal 64px
          // crossover on the same geolocated NOAA IR observation.
          const supplement = buildSatelliteLimbOverlay(
            limb.scientific,composite,limb.infrared,64,
            (x,y,density)=>Math.round(Math.min(255,
              density*interpolateGmgsiVisualGain(irCal,x,y))),
            v3Policy.nativeIrCrossoverRadius,
          );
          const texCanvas = document.createElement("canvas");
          texCanvas.width = sourceCanvas.width;
          texCanvas.height = sourceCanvas.height;
          const ctx = texCanvas.getContext("2d");
          if (!ctx) throw new Error("No visual limb overlay canvas");
          ctx.putImageData(supplement.image,0,0);
          const tex = new THREE.CanvasTexture(texCanvas);
          tex.colorSpace = THREE.NoColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
          const previous = limbOverlayRef.current;
          limbOverlayRef.current = tex;
          uniforms.v3LimbOverlayTexture.value = tex;
          uniforms.v3LimbOverlayReady.value = supplement.stats.observedIrLimbPixels > 0 ? 1 : 0;
          if (previous && previous !== tex) previous.dispose();
          window.dispatchEvent(new CustomEvent("cupola-cloud-limb-diagnostic",{
            detail:{algorithm:"bilateral-noaa-ir-continuity-v2",...supplement.stats,
              originalLevel2Immutable:true,independentIRVisualOnly:true},
          }));
        }
      } else {
        uniforms.v3LimbOverlayReady.value = 0;
        if (limbOverlayRef.current) {limbOverlayRef.current.dispose();limbOverlayRef.current = null;}
        uniforms.v3LimbOverlayTexture.value = staticCloudTexture;
      }
      // GPU source transition: narrow non-darkening default (1); old wide
      // method (2) is opt-in; raw (0) retains original data. Atlas QA remains exact.
      uniforms.v3SeamVisualBlend.value = cloudEngine !== "v3" || seamMode === "legacy"
        ? 0 : (seamMode === "wide" ? 2 : 1);
      const next = new THREE.CanvasTexture(canvas);
      next.colorSpace = THREE.NoColorSpace;
      next.wrapS = THREE.RepeatWrapping;
      next.wrapT = THREE.ClampToEdgeWrapping;
      next.minFilter = THREE.LinearFilter;
      next.magFilter = THREE.LinearFilter;
      next.generateMipmaps = false;
      next.needsUpdate = true;
      pendingGpuApplyRef.current = {
        kind: cloudEngine === "v3" && atlasVersion ? "verified-l2" : "visual-backup",
        version: cloudEngine === "v3" && atlasVersion ? atlasVersion : null,
      };
      uniforms.cloudAtlasReady.value = 1;
      const pending = atlasNextRef.current;
      if (pending && pending !== atlasCurrentRef.current) pending.dispose();
      if (!atlasCurrentRef.current) {
        // Keep a cheap static placeholder until the first verified image is
        // uploaded; fade ONLY the display. Scientific pixels remain exact.
        initialCloudBlendStartRef.current = performance.now();
        uniforms.cloudIntroBlend.value = cloudEngine === "v3" ? 0 : 1;
        atlasCurrentRef.current = next;
        uniforms.cloudAtlasA.value = next;
        uniforms.cloudAtlasB.value = next;
        uniforms.cloudAtlasBlend.value = 0;
      } else {
        atlasNextRef.current = next;
        uniforms.cloudAtlasA.value = atlasCurrentRef.current;
        uniforms.cloudAtlasB.value = next;
        uniforms.cloudAtlasBlend.value = 0;
        atlasTransitionRef.current = performance.now();
      }
      // Make a newly uploaded texture visible even if the browser has not
      // received user input / camera movement.
      invalidate();
    };

    if (cloudEngine === "v3") {
      let loading = false;
      let publishedVersion = "";
      let scienceExpiresAt = 0;
      let scienceImage: ImageData | null = null;
      let emergencySignature = "";
      let pendingScienceFailure = "";
      let visualImage: ImageData | null = null;
      let modelImage: ImageData | null = null;
      let gmgsiImage: ImageData | null = null;
      let gmgsiVersion = "";
      let gmgsiLoadedStyle: "legacy" | "detail" = "legacy";
      let gmgsiExpiresAt = 0;
      let gmgsiVisualCoverage = 0;
      let modelVersion = "";
      let modelExpiresAt = 0;
      let modelCoverage = 0;
      let modelAge = "";
      let renderedGlobalSignature = "";
      const useGlobalModel = v3Policy.useGlobalModel;
      // Only the V3 TEST branch enables the real, globally georeferenced
      // NOAA infrared observation. ?cloudGmgsi=none gives a direct A/B.
      const useGmgsi = v3Policy.useGmgsi;
      // The same NOAA observation has both restrained and structure-rich
      // visual-only textures. In this V3 TEST branch compare them with:
      // ?cloudGrey=legacy. Neither mode changes native Level-2/provenance.
      const useGreyDetail = v3Policy.useGreyDetail;
      let renderedVisualSignature = "";
      let visualCoverage = 0;
      let wmsCoverage = 0;
      let displayFootprint = 0;
      let visualSources: string[] = [];
      let wmsSources: string[] = [];
      const useVisualGap = v3Policy.useVisualGap;
      // Official styled CLM is the reliable default. An IR-first Meteosat
      // request returned HTTP 204 in real current-branch testing (Oct 12);
      // do not degrade normal globe coverage chasing unverified detail.
      // ?cloudMeteosat=ir is a VISUAL-ONLY experiment when EUMETView serves IR.
      // Either way native NOAA/JMA L2 is immutable and authoritative.
      const meteosatVisualMode = v3Policy.meteosatVisualMode;
      const controllers = new Set<AbortController>();
      let retryTimer: number | null = null;
      let retryDelay = 15_000;
      const reportEmpty = (reason: string) => {
        pendingScienceFailure = reason;
        // A manifest can disappear while the LAST verified observation is
        // still within its original expiry. Keep that legitimate texture.
        if (scienceImage && Date.now() < scienceExpiresAt) return;
        window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", {
          detail: { engine: "v3", status: "fallback", frameTime: null,
            coverage: 0, sources: [], products: [], sourceCoverage: [],
            sourceAges: [], fallbackReasons: [reason + " · FETCHING LIVE VISUAL BACKUP"] },
        }));
      };
      const fetchKeylessMeteosat = async (signal: AbortSignal): Promise<MeteosatVisualFrame[]> => {
        if (!useVisualGap) return [];
        const sources = [
          { source: "meteosat", url: "/api/clouds-geostationary?source=meteosat" },
          { source: "meteosat-iodc", url: "/api/clouds-geostationary?source=meteosat-iodc" },
        ] as const;
        const results = await Promise.all(sources.map(async ({ source, url }) => {
          try {
            const response = await fetch(
              url + (meteosatVisualMode === "ir" ? "&visual=infrared" : "") +
              "&v=" + Math.floor(Date.now() / 600000), {
                cache: "no-store",
                signal: AbortSignal.any([signal, AbortSignal.timeout(24_000)]),
              },
            );
            if (response.status !== 200 ||
                !(response.headers.get("content-type") || "").startsWith("image/png") ||
                !["infrared-processed", "cloudmask-wms-styled"].includes(response.headers.get("X-Cupola-Source-Type") || "") ||
                response.headers.get("X-Cupola-Data-Status") !== "observed" ||
                response.headers.get("X-Cupola-Cloud-Render") !== "white-alpha-mask")
              return null;
            const observedAt = Date.parse(response.headers.get("X-Cupola-Frame-Time") || "");
            const layer = response.headers.get("X-Cupola-Layer") || "";
            if (!Number.isFinite(observedAt) || observedAt > Date.now() + 5 * 60_000 ||
                Date.now() - observedAt > CLOUD_ATLAS_MAX_AGE_MS) return null;
            if (!(source === "meteosat"
                  ? /^(mtg_fd:ir105_hrfi|msg_fes:(?:clm|ir108))$/i
                  : /^msg_iodc:(?:clm|ir108)$/i).test(layer)) return null;
            const image = await decodeCloudFrame(await response.blob());
            if (cancelled) return null;
            return { source, image, observationMs: observedAt, layer };
          } catch {
            // Keyless WMS is an OPTIONAL visual filler, never a dependency for
            // the authoritative GOES/Himawari Level-2 scientific image.
            return null;
          }
        }));
        return results.filter((frame): frame is MeteosatVisualFrame => frame !== null);
      };

      // Separate observed freshness from the last SHA-verified NOAA visual
      // observation. The latter may be used ONLY as explicitly STALE visual
      // continuity during a PR-branch publication outage, never as live L2.
      let gmgsiIsArchived = false;
      let gmgsiObservedAtMs = 0;
      const archiveGmgsiMaxAgeMs = 48 * 60 * 60_000;
      const updateGmgsi = async (
        signal: AbortSignal, allowArchivedVisual = false,
      ): Promise<boolean> => {
        if (!useGmgsi || signal.aborted) return false;
        const cached = () => gmgsiImage !== null && Date.now() < gmgsiExpiresAt &&
          (allowArchivedVisual || !gmgsiIsArchived);
        const candidates = allowArchivedVisual
          ? ["manifest", "archive-manifest"] as const
          : ["manifest"] as const;
        for (const kind of candidates) {
          if (signal.aborted || cancelled) return false;
          const archived = kind === "archive-manifest";
          try {
            const response = await fetch(
              "/api/clouds-visual-gmgsi?kind=" + kind +
                "&v=" + Math.floor(Date.now() / 60_000),
              { cache: "no-store",
                signal: AbortSignal.any([signal, AbortSignal.timeout(48_000)]) },
            );
            const expectedStatus = archived
              ? "archived-ir-visual-not-live"
              : "satellite-ir-visual-not-cloudmask";
            if (response.status !== 200 ||
                !(response.headers.get("content-type") || "").includes("application/json") ||
                response.headers.get("X-Cupola-Data-Status") !== expectedStatus)
              continue;
            const meta = await response.json() as {
              schema: string; version: string; expires_at: string;
              observation_start: string; width: number; height: number;
              used_as_visual_only: boolean;
              native_noaa_jma_level2_cloudmask: boolean;
              source_grid_fraction: number;
              grey_detail_available?: boolean; grey_detail_transfer?: string;
            };
            const now = Date.now();
            const expires = Date.parse(meta.expires_at);
            const observed = Date.parse(meta.observation_start);
            const archiveDeadline = observed + archiveGmgsiMaxAgeMs;
            if (meta.schema !== "cupola-gmgsi-ir-visual/v1" ||
                !/^\d{14}$/.test(meta.version) ||
                meta.width !== 2048 || meta.height !== 1024 ||
                !meta.used_as_visual_only ||
                meta.native_noaa_jma_level2_cloudmask !== false ||
                !(meta.source_grid_fraction > .5) ||
                !Number.isFinite(expires) || !Number.isFinite(observed) ||
                observed > now + 300_000 ||
                (archived ? archiveDeadline <= now : expires <= now))
              continue;
            const desiredStyle: "legacy" | "detail" =
              useGreyDetail && meta.grey_detail_available === true &&
              meta.grey_detail_transfer === "structured-local-noaa-lw-v2"
                ? "detail" : "legacy";
            if (meta.version !== gmgsiVersion ||
                gmgsiLoadedStyle !== desiredStyle ||
                gmgsiIsArchived !== archived ||
                now >= gmgsiExpiresAt) {
              const raster = await fetch(
                "/api/clouds-visual-gmgsi?kind=" +
                  (archived ? "archive-atlas" : "atlas") +
                  "&version=" + meta.version + "&style=" + desiredStyle,
                { cache: "no-store",
                  signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) },
              );
              if (raster.status !== 200 ||
                  !(raster.headers.get("content-type") || "").startsWith("image/png") ||
                  raster.headers.get("X-Cupola-Data-Status") !== expectedStatus ||
                  raster.headers.get("X-Cupola-Visual-Style") !== desiredStyle)
                continue;
              const pixels = await decodeCloudFrame(await raster.blob());
              if (cancelled || signal.aborted) return false;
              if (pixels.width !== 2048 || pixels.height !== 1024) continue;
              gmgsiImage = pixels;
              gmgsiVersion = meta.version;
              gmgsiLoadedStyle = desiredStyle;
              window.dispatchEvent(new CustomEvent("cupola-cloud-grey-detail", {
                detail: { algorithm: "structured-local-noaa-lw-v2",
                  mode: desiredStyle, version: meta.version,
                  source: "NOAA GMGSI IR", visualOnly: true,
                  archivedVisualOnly: archived, observationTime: meta.observation_start,
                  nativeLevel2Immutable: true, originalSeamRadiusPixels: 64 },
              }));
            }
            gmgsiIsArchived = archived;
            gmgsiObservedAtMs = observed;
            gmgsiExpiresAt = archived ? archiveDeadline : expires;
            return true;
          } catch {
            // A timeout of the current feed may still allow a separately
            // verified archive endpoint to restore the exact NOAA texture.
          }
        }
        return cached();
      };

      const updateModel = async (signal: AbortSignal): Promise<boolean> => {
        if (!useGlobalModel) return false;
        try {
          const response = await fetch(
            "/api/clouds-model-gfs?kind=manifest&v=" + Math.floor(Date.now() / 60000),
            { cache: "no-store", signal },
          );
          if (response.status !== 200 ||
              !(response.headers.get("content-type") || "").includes("application/json"))
            return modelImage !== null && Date.now() < modelExpiresAt;
          const meta = await response.json() as {
            schema: string; version: string; expires_at: string; model_run_at: string;
            width: number; height: number; is_satellite_observation: boolean;
            grid_coverage_fraction: number;
          };
          const expiry = Date.parse(meta.expires_at);
          if (meta.schema !== "cupola-global-gfs-model-v1" ||
              !/^\d{14}$/.test(meta.version) ||
              meta.width !== 2048 || meta.height !== 1024 ||
              meta.is_satellite_observation !== false ||
              meta.grid_coverage_fraction !== 1 ||
              !Number.isFinite(expiry) || expiry <= Date.now()) return false;
          if (modelVersion !== meta.version || Date.now() >= modelExpiresAt) {
            const atlas = await fetch(
              "/api/clouds-model-gfs?kind=atlas&version=" + meta.version,
              { cache: "no-store", signal },
            );
            if (atlas.status !== 200 ||
                !(atlas.headers.get("content-type") || "").startsWith("image/png") ||
                atlas.headers.get("X-Cupola-Data-Status") !== "model-analysis-not-satellite")
              return modelImage !== null && Date.now() < modelExpiresAt;
            const decoded = await decodeCloudFrame(await atlas.blob());
            if (cancelled) return false;
            modelImage = decoded;
            modelVersion = meta.version;
          }
          modelExpiresAt = expiry;
          modelAge = Math.max(0, Math.floor((Date.now() - Date.parse(meta.model_run_at)) / 3600000)) + "h";
          return true;
        } catch {
          // Model is merely a lower-priority VISUAL backup. Its outage may
          // not hide a working real-satellite atlas.
          return modelImage !== null && Date.now() < modelExpiresAt;
        }
      };

      const renderVisualBackup = async (signal: AbortSignal, reason: string) => {
        // Restore the previously beautiful, unbroken Level-2 geography as
        // an explicitly NON-LIVE VISUAL scan if the publisher is delayed.
        // This scan is SHA-verified server-side, at most 48h old, and is
        // never counted as *current* L2 observations. Only the missing
        // Europe/Africa/Atlantic/Antarctica sector receives Meteosat WMS.
        // Crucially, no worldwide WMS reprojection is applied on top of
        // intact GOES/Himawari cloud pixels.
        try {
          const response = await fetch(
            "/api/clouds-science-v3?kind=archive-manifest&v=" + Math.floor(Date.now() / 60_000),
            { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(18_000)]) },
          );
          if (response.status === 200 &&
              response.headers.get("X-Cupola-Data-Status") === "archived-visual-not-live") {
            const meta = await response.json() as ScienceV3Manifest;
            const generatedMs = Date.parse(meta.generated_at);
            if (meta.schema === "cupola-scientific-cloud-v3/v1" &&
                /^\d{14}$/.test(meta.version) &&
                meta.width === 2048 && meta.height === 1024 &&
                Number.isFinite(generatedMs) && generatedMs <= Date.now() &&
                Date.now() - generatedMs <= 48 * 3_600_000) {
              const atlas = await fetch(
                "/api/clouds-science-v3?kind=archive-atlas&version=" + meta.version,
                { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(23_000)]) },
              );
              if (atlas.status === 200 &&
                  atlas.headers.get("X-Cupola-Data-Status") === "archived-visual-not-live" &&
                  (atlas.headers.get("content-type") || "").startsWith("image/png")) {
                const science = await decodeCloudFrame(await atlas.blob());
                if (cancelled || signal.aborted) return;
                const visualFrames = await fetchKeylessMeteosat(signal);
                if (cancelled || signal.aborted) return;
                const gap = composeScientificWithMeteosatVisualGap(science, visualFrames, Date.now());
                // Previously this archive path stopped after Meteosat, leaving
                // ~24% of the world with an abruptly empty cloud texture.
                // Add the SAME separately labelled GFS model used by the fresh
                // V3 path, strictly outside both L2 AND Meteosat coverage.
                // All 65.6% L2 bytes (including classified CLEAR) remain intact.
                let archivedCanvas = gap.canvas;
                let archivedModelCoverage = 0;
                let archivedFootprint = gap.totalVisualFootprintFraction;
                let archivedVisualCoverage = gap.visualCoverageFraction;
                let archivedGmgsiCoverage = 0;
                let archivedVisualSources = [...gap.sources];
                if(await updateGmgsi(signal,true) && gmgsiImage && Date.now()<gmgsiExpiresAt){
                  if(cancelled || signal.aborted)return;
                  const context=gap.canvas.getContext("2d");
                  if(!context)throw new Error("GMGSI archived compositing canvas unavailable");
                  const originalVisual=context.getImageData(0,0,2048,1024);
                  const better=overlayGmgsiVisualGap(science,originalVisual,gmgsiImage);
                  context.putImageData(better.image,0,0);
                  archivedFootprint=better.totalDataFootprintFraction;
                  archivedVisualCoverage=gap.visualCoverageFraction -
                    better.displacedWmsFraction + better.visualCoverageFraction;
                  archivedGmgsiCoverage=better.visualCoverageFraction;
                  if(better.visualCoverageFraction>0)archivedVisualSources.push(gmgsiIsArchived
                    ? "NOAA GMGSI IR · ARCHIVED VISUAL ONLY · NOT LIVE"
                    : "NOAA GMGSI IR · SATELLITE VISUAL ONLY");
                }
                if (useGlobalModel && await updateModel(signal) &&
                    modelImage && Date.now() < modelExpiresAt) {
                  if (cancelled || signal.aborted) return;
                  const composed = gap.canvas.getContext("2d");
                  if (!composed) throw new Error("Archive visual compositor unavailable");
                  const wmsAndScience = composed.getImageData(0, 0, 2048, 1024);
                  const filled = fillGlobalCloudModelGaps(wmsAndScience, modelImage, science);
                  archivedCanvas = filled.canvas;
                  archivedModelCoverage = filled.modelFraction;
                  archivedFootprint = filled.totalDataFootprint;
                }
                if (cancelled || signal.aborted) return;
                const signature = "ARCHIVED:" + meta.version + ":" +
                  visualFrames.map(f => f.source + ":" + f.observationMs + ":" + f.layer).join("|") +
                  "|GMGSI:" + (archivedVisualSources.some(x=>x.startsWith("NOAA GMGSI"))?gmgsiVersion:"none") +
                  "|MODEL:" + (archivedModelCoverage > 0 ? modelVersion : "none");
                if (signature !== emergencySignature) {
                  publishCanvas(archivedCanvas,
                    gmgsiImage && Date.now()<gmgsiExpiresAt ?
                      {scientific:science,infrared:gmgsiImage} : undefined);
                  emergencySignature = signature;
                }
                const archiveAge = Math.max(1, Math.round((Date.now() -
                  Math.max(...meta.sources.map(s => Date.parse(s.observation_end)))) / 60_000));
                window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", {
                  detail: {
                    engine:"v3", status:"visual", frameTime:meta.generated_at,
                    sourceObservationAt:meta.sources.length ? new Date(Math.max(...meta.sources.map(s=>Date.parse(s.observation_end)))).toISOString() : null,
                    coverage:0, sources:meta.sources.map(s => s.source),
                    products:meta.sources.map(s => s.product + " · ARCHIVED"),
                    sourceCoverage:[], sourceAges:meta.sources.map(s =>
                      s.source.toUpperCase() + ": " +
                      Math.round((Date.now() - Date.parse(s.observation_end))/60000) + "m STALE"),
                    fallbackReasons:[reason],
                    archiveAge:(archiveAge >= 60 ? (archiveAge/60).toFixed(1) + "h" : archiveAge + "m") + " OLD · NOT LIVE",
                    visualSources:archivedVisualSources, visualCoverage:archivedVisualCoverage,
                    gmgsiCoverage:archivedGmgsiCoverage,
                    irArchiveAge: archivedGmgsiCoverage>0 && gmgsiIsArchived
                      ? Math.max(1,Math.round((Date.now()-gmgsiObservedAtMs)/3_600_000*10)/10)+"h"
                      : undefined,
                    displayFootprint:archivedFootprint,
                    modelCoverage:archivedModelCoverage,
                    modelAge:archivedModelCoverage > 0 ? modelAge : undefined,
                    modelStatus:archivedModelCoverage > 0 ? "NOAA GFS ANALYSIS · NOT SATELLITE" : undefined,
                  },
                }));
                return;
              }
            }
          }
        } catch {
          // No recent verified archive: fall through to separately attributed
          // fresh GEO WMS imagery, without pretending it is true L2.
        }
        // NO "last known" scientific pixels: those expire at their own L2
        // timestamp. Instead acquire independent near-live geostationary WMS
        // observations and a separately labelled verified NOAA GFS MODEL.
        // This backup has zero Level-2 coverage and is never called science.
        type GeoKey = "east" | "west" | "himawari" | "meteosat" | "iodc";
        const sources: ReadonlyArray<{ key: GeoKey; source: string }> = [
          { key: "east", source: "goes-east" },
          { key: "west", source: "goes-west" },
          { key: "himawari", source: "himawari" },
          { key: "meteosat", source: "meteosat" },
          { key: "iodc", source: "meteosat-iodc" },
        ];
        const frames: CloudAtlasFrames = {};
        const sourceAges: string[] = [];
        // Model and five public WMS sources must not block each other.
        // EUMETView/NASA can occasionally take tens of seconds or longer,
        // so every frame request has an independent 24-second upper bound.
        const modelReady = updateModel(signal);
        const gmgsiReady = updateGmgsi(signal,true);
        await Promise.all(sources.map(async ({key, source}) => {
          try {
            const response = await fetch(
              "/api/clouds-geostationary?source=" + source +
              "&v=" + Math.floor(Date.now() / 600000),
              { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(24_000)]) },
            );
            if (response.status !== 200 ||
                !(response.headers.get("content-type") || "").startsWith("image/png") ||
                response.headers.get("X-Cupola-Data-Status") !== "observed" ||
                response.headers.get("X-Cupola-Source-Type") !== "infrared-processed" ||
                response.headers.get("X-Cupola-Cloud-Render") !== "white-alpha-mask")
              return;
            const time = Date.parse(response.headers.get("X-Cupola-Frame-Time") || "");
            if (!Number.isFinite(time) || time > Date.now() + 300000 ||
                Date.now() - time > CLOUD_ATLAS_MAX_AGE_MS) return;
            const image = await decodeCloudFrame(await response.blob());
            if (signal.aborted || cancelled) return;
            const inspection = validateCloudFrame(image);
            if (!inspection.valid) return;
            frames[key] = { image, time, product: "infrared" };
            sourceAges.push(source.toUpperCase() + ":" +
              Math.max(0, Math.round((Date.now() - time) / 60000)) + "m");
          } catch {
            // Each satellite has its own cadence. Do not fail the entire
            // fallback because one public, optional WMS source is unavailable.
          }
        }));
        if (signal.aborted || cancelled) return;

        const now = Date.now();
        const wmsCanvas = composeCloudAtlasV2(frames, now);
        const wmsKeys = sources.filter(item => !!frames[item.key]).map(item => item.source);
        let fullCanvas = wmsCanvas;
        let modelFraction = 0;
        let totalCoverage = wmsCanvas
          ? Number(wmsCanvas.dataset.observedCoverage || 0) : 0;
        let emergencyVisualCoverage=totalCoverage;
        let emergencyGmgsiCoverage=0;
        const hasGmgsi = await gmgsiReady;
        if(signal.aborted || cancelled)return;
        if(hasGmgsi && gmgsiImage && Date.now()<gmgsiExpiresAt){
          const target=wmsCanvas || document.createElement("canvas");
          if(!wmsCanvas){target.width=2048;target.height=1024;}
          const context=target.getContext("2d");
          if(!context)throw new Error("GMGSI fallback canvas unavailable");
          const observed=context.getImageData(0,0,2048,1024);
          const zeroL2=context.createImageData(2048,1024);
          const merged=overlayGmgsiVisualGap(zeroL2,observed,gmgsiImage);
          context.putImageData(merged.image,0,0);
          fullCanvas=target;
          totalCoverage=merged.totalDataFootprintFraction;
          emergencyVisualCoverage+=merged.newCoverageFraction;
          emergencyGmgsiCoverage=merged.visualCoverageFraction;
          if(merged.visualCoverageFraction>0)wmsKeys.push(gmgsiIsArchived
            ? "NOAA GMGSI IR · ARCHIVED VISUAL ONLY · NOT LIVE"
            : "NOAA GMGSI IR · SATELLITE VISUAL ONLY");
        }
        const usableModel = await modelReady;
        if (signal.aborted || cancelled) return;
        if (usableModel && modelImage && now < modelExpiresAt) {
          // Model-only can render even if *all* GEO products are unavailable.
          const fallbackBase = fullCanvas || document.createElement("canvas");
          if (!fullCanvas) {
            fallbackBase.width = 2048; fallbackBase.height = 1024;
          }
          const ctx = fallbackBase.getContext("2d");
          if (!ctx) throw new Error("No fallback model canvas");
          const baseline = ctx.getImageData(0, 0, 2048, 1024);
          const fused = fillGlobalCloudModelGaps(baseline, modelImage);
          fullCanvas = fused.canvas;
          modelFraction = fused.modelFraction;
          totalCoverage = fused.totalDataFootprint;
        }
        if (signal.aborted || cancelled) return;
        if (!fullCanvas) {
          emergencySignature = "";
          uniforms.cloudAtlasReady.value = 0;
          window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", {
            detail: { engine:"v3", status:"fallback", frameTime:null,
              coverage:0, sources:[], products:[], sourceCoverage:[],
              sourceAges:[], fallbackReasons:[reason,"NO FRESH WMS OR GFS FRAMES"] },
          }));
          return;
        }
        const signature = wmsKeys.map(key => {
          const source=sources.find(s => s.source === key);
          const frame=source ? frames[source.key] : undefined;
          return key + ":" + (frame?.time ?? gmgsiVersion);
        }).join("|") + "|GMGSI:" +
          (wmsKeys.some(x=>x.startsWith("NOAA GMGSI"))?gmgsiVersion:"none") +
          "|" + (modelFraction > 0 ? modelVersion : "no-model");
        if (signature !== emergencySignature) {
          publishCanvas(fullCanvas);
          emergencySignature = signature;
        }
        const newest = Math.max(0, ...Object.values(frames).map(frame => frame?.time ?? 0));
        window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", {
          detail: {
            engine:"v3", status:"visual", frameTime: newest > 0 ? new Date(newest).toISOString() : null,
            sourceObservationAt: newest > 0 ? new Date(newest).toISOString() : null,
            coverage:0, sources:wmsKeys, products:wmsKeys.map(key => key + ":IR VISUAL"),
            sourceCoverage:[], sourceAges,
            fallbackReasons:[reason],
            visualCoverage: emergencyVisualCoverage,
            gmgsiCoverage:emergencyGmgsiCoverage,
            irArchiveAge:emergencyGmgsiCoverage>0 && gmgsiIsArchived
              ? Math.max(1,Math.round((Date.now()-gmgsiObservedAtMs)/3_600_000*10)/10)+"h"
              : undefined,
            visualSources:wmsKeys,
            modelCoverage:modelFraction,
            modelAge:modelFraction > 0 ? modelAge : undefined,
            modelStatus:modelFraction > 0 ? "NOAA GFS MODEL · NOT SATELLITE" : undefined,
            displayFootprint:totalCoverage,
          },
        }));
      };

      const updateScience = () => {
        if (cancelled || loading) return;
        loading = true;
        retryDelay = 15_000; // Retry a transient early 204/network fault promptly.
        let stage = "MANIFEST REQUEST";
        const controller = new AbortController();
        controllers.add(controller);
        void (async () => {
          try {
            pendingScienceFailure = "";
            // Each update constructs one final complete mosaic and performs
            // exactly one GPU texture swap. Avoid showing intermediate
            // L2-only then WMS then GFS frames in rapid succession.
            let completedAtlas: HTMLCanvasElement | null = null;
            const manifestResponse = await fetch(
              "/api/clouds-science-v3?kind=manifest&v=" + Math.floor(Date.now() / 60000),
              { cache: "no-store", signal: controller.signal },
            );
            // HTTP 204 is `Response.ok === true`, but its body is empty.
            // Never call response.json() on 204 or an unexpected HTML/error page.
            const manifestMime = (manifestResponse.headers.get("content-type") || "").toLowerCase();
            if (manifestResponse.status !== 200 || !manifestMime.includes("application/json")) {
              const reason = manifestResponse.headers.get("X-Cupola-Data-Status");
              if (!cancelled) reportEmpty(
                manifestResponse.status === 204
                  ? reason === "no-fresh-verified-science-atlas"
                    ? "SCIENCE ATLAS EXPIRED · NO NEW L2 PUBLICATION"
                    : "NO SCIENTIFIC ATLAS · " + (reason || "NO DATA")
                  : "MANIFEST HTTP " + manifestResponse.status +
                    " · " + (reason || "UNEXPECTED RESPONSE"),
              );
              return;
            }
            stage = "MANIFEST DECODE";
            const meta = await manifestResponse.json() as ScienceV3Manifest;
            const now = Date.now();
            const expiry = Date.parse(meta.expires_at);
            if (meta.schema !== "cupola-scientific-cloud-v3/v1" ||
                !/^\d{14}$/.test(meta.version) ||
                meta.width !== 2048 || meta.height !== 1024 ||
                !Array.isArray(meta.sources) || !meta.sources.length ||
                !Number.isFinite(expiry) || expiry <= now ||
                !Number.isFinite(meta.observed_coverage_fraction) ||
                meta.observed_coverage_fraction < 0.05) {
              if (!cancelled) reportEmpty("UNVERIFIED OR EXPIRED L2 MANIFEST");
              return;
            }
            if (meta.version !== publishedVersion || scienceExpiresAt <= now) {
              stage = "ATLAS REQUEST";
              const imgResponse = await fetch(
                "/api/clouds-science-v3?kind=atlas&version=" + meta.version,
                { cache: "no-store", signal: controller.signal },
              );
              if (imgResponse.status !== 200 || !(imgResponse.headers.get("content-type") || "").startsWith("image/png")) {
                if (!cancelled) reportEmpty(
                  "ATLAS " + imgResponse.status + " · " +
                  (imgResponse.headers.get("X-Cupola-Data-Status") || "RETRYING"),
                );
                return;
              }
              stage = "ATLAS TRANSFER";
              const blob = await imgResponse.blob();
              if (blob.size < 1000) {
                if (!cancelled) reportEmpty("EMPTY SCIENCE ATLAS");
                return;
              }
              stage = "PNG IMAGE DECODE";
              const scientific = await decodeCloudFrame(blob);
              if (cancelled) return;
              const canvas = document.createElement("canvas");
              canvas.width = 2048;
              canvas.height = 1024;
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("Scientific preview Canvas2D unavailable");
              stage = "ASSEMBLE SINGLE V3 PNG";
              ctx.putImageData(scientific, 0, 0);
              completedAtlas = canvas;
              scienceImage = scientific;
              publishedVersion = meta.version;
              emergencySignature = "";
              visualImage = null;
              renderedGlobalSignature = "";
              renderedVisualSignature = "";
              visualCoverage = 0;
              wmsCoverage = 0;
              visualSources = [];
              wmsSources = [];
              gmgsiVisualCoverage = 0;
              displayFootprint = meta.observed_coverage_fraction;
            }

            // Fetch three independent supplemental products concurrently.
            // Keep the SAME L2 > GMGSI > WMS > GFS composition priority and
            // publish only the complete QA-attributed atlas. This removes a
            // network waterfall without changing a single cloud pixel.
            const pendingGmgsi = scienceImage && useGmgsi
              ? updateGmgsi(controller.signal) : Promise.resolve(false);
            const pendingGfs = scienceImage && useGlobalModel
              ? updateModel(controller.signal) : Promise.resolve(false);

            // New L2 science renders immediately. Then blend independent,
            // real-time, *visual-only* WMS observations into L2 NO-DATA cells.
            // All L2 pixels (including classified CLEAR) remain untouched.
            if (scienceImage && useVisualGap) {
              stage = "KEYLESS METEOSAT WMS";
              const visualFrames = await fetchKeylessMeteosat(controller.signal);
              if (cancelled) return;
              const visualSignature = meta.version + "|" + visualFrames.map(f =>
                f.source + ":" + f.observationMs + ":" + f.layer).join("|");
              if (visualSignature !== renderedVisualSignature) {
                stage = "SCIENCE + VISUAL GAP COMPOSITING";
                const gap = composeScientificWithMeteosatVisualGap(scienceImage, visualFrames, Date.now());
                if (cancelled) return;
                const gapCtx = gap.canvas.getContext("2d");
                visualImage = visualFrames.length > 0 && gapCtx
                  ? gapCtx.getImageData(0, 0, 2048, 1024) : null;
                renderedGlobalSignature = "";
                // Prepare the next unified atlas, never publish this
                // intermediate partial satellite frame to the 3D globe.
                completedAtlas = gap.canvas;
                wmsCoverage = gap.visualCoverageFraction;
                visualCoverage = wmsCoverage;
                displayFootprint = Math.max(meta.observed_coverage_fraction, gap.totalVisualFootprintFraction);
                wmsSources = gap.sources;
                visualSources = [...wmsSources];
                renderedVisualSignature = visualSignature;
              }
            }
            // Apply the existing georegistered HIGH-DETAIL SATELLITE IR in
            // L2 no-data cells BEFORE relying on low-resolution GFS forecast.
            // WMS remains as fallback wherever GMGSI has invalid QA.
            let globalVisualImage: ImageData = visualImage ?? scienceImage!;
            let activeGmgsiVersion = "none";
            if(scienceImage){
              visualCoverage = wmsCoverage;
              visualSources = [...wmsSources];
              gmgsiVisualCoverage = 0;
              stage = "NOAA GMGSI SATELLITE IR VISUAL";
              if(await pendingGmgsi &&
                 gmgsiImage && Date.now()<gmgsiExpiresAt){
                if(cancelled)return;
                const merged=overlayGmgsiVisualGap(
                  scienceImage,globalVisualImage,gmgsiImage);
                if(merged.visualCoverageFraction>0){
                  globalVisualImage=merged.image;
                  gmgsiVisualCoverage=merged.visualCoverageFraction;
                  activeGmgsiVersion=gmgsiVersion;
                  visualCoverage=Math.max(0,wmsCoverage - merged.displacedWmsFraction) +
                    merged.visualCoverageFraction;
                  displayFootprint=merged.totalDataFootprintFraction;
                  visualSources.push("NOAA GMGSI IR · SATELLITE VISUAL ONLY");
                  const target=document.createElement("canvas");
                  target.width=2048;target.height=1024;
                  const context=target.getContext("2d");
                  if(!context)throw new Error("GMGSI unified raster unavailable");
                  context.putImageData(globalVisualImage,0,0);
                  completedAtlas=target;
                  renderedGlobalSignature="";
                }
              }
            }
            if (scienceImage && useGlobalModel) {
              // Render real data FIRST. Only then add model output in cells
              // where neither verified L2 nor fresh WMS has observation.
              stage = "GLOBAL GFS MODEL";
              const ready = await pendingGfs;
              if (cancelled) return;
              if (ready && modelImage && Date.now() < modelExpiresAt) {
                const key = meta.version + "|" + renderedVisualSignature + "|GMGSI:" +
                  activeGmgsiVersion + "|" + modelVersion;
                if (key !== renderedGlobalSignature) {
                  const combined = fillGlobalCloudModelGaps(globalVisualImage, modelImage, scienceImage);
                  if (cancelled) return;
                  completedAtlas = combined.canvas;
                  modelCoverage = combined.modelFraction;
                  displayFootprint = combined.totalDataFootprint;
                  renderedGlobalSignature = key;
                }
              } else if (renderedGlobalSignature) {
                // Expired model must never linger as claimed current data.
                const base = globalVisualImage;
                const canvas = document.createElement("canvas");
                canvas.width = 2048; canvas.height = 1024;
                const ctx = canvas.getContext("2d");
                if (ctx) { ctx.putImageData(base, 0, 0); completedAtlas = canvas; }
                renderedGlobalSignature = "";
                modelCoverage = 0;
              }
            }
            if (completedAtlas) {
              // Strictly opt-in scientific source audit. It reads actual L2,
              // classified Meteosat visual, raw NOAA GMGSI, and the finished
              // source-attributed atlas. Nothing is drawn or rewritten.
              if (new URLSearchParams(window.location.search).get("cloudAudit") === "sources" && scienceImage) {
                const readback = completedAtlas.getContext("2d",{willReadFrequently:true});
                if (readback) {
                  const audit = auditAfricaCloudSources(
                    scienceImage, visualImage ?? scienceImage,
                    gmgsiImage && Date.now()<gmgsiExpiresAt ? gmgsiImage : null,
                    readback.getImageData(0,0,2048,1024),
                  );
                  window.dispatchEvent(new CustomEvent("cupola-cloud-source-audit",{detail:audit}));
                }
              }
              stage = "FINAL UNIFIED PNG TEXTURE";
              publishCanvas(completedAtlas,
                scienceImage && gmgsiImage && useGmgsi && Date.now()<gmgsiExpiresAt ?
                  {scientific:scienceImage,infrared:gmgsiImage} : undefined,
                meta.version);
            }
            scienceExpiresAt = expiry;
            retryDelay = 2 * 60_000;
            if (cancelled) return;
            window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", {
              detail: {
                engine: "v3", status: "observed",
                frameTime: meta.generated_at,
                // Oldest accepted source is the limiting age of this multisensor L2 atlas.
                sourceObservationAt: new Date(Math.min(...meta.sources.map(s => Date.parse(s.observation_start)))).toISOString(),
                coverage: meta.observed_coverage_fraction,
                sources: meta.sources.map(s => s.source),
                products: meta.sources.map(s => s.product),
                sourceCoverage: [],
                sourceAges: meta.sources.map(s =>
                  s.source.toUpperCase() + ": " +
                  Math.max(0, Math.round((now - Date.parse(s.observation_end)) / 60000)) + "m"),
                fallbackReasons: [],
                visualCoverage,
                gmgsiCoverage:gmgsiVisualCoverage,
                displayFootprint,
                visualSources,
                modelCoverage,
                modelAge: modelCoverage > 0 ? modelAge : undefined,
                modelStatus: modelCoverage > 0 ? "NOAA GFS ANALYSIS · NOT SATELLITE" : undefined,
              },
            }));
          } catch (error) {
            // Distinguish transport failure from JSON/PNG/WebGL exceptions.
            const type = error instanceof Error ? error.name : "UnknownError";
            if (!cancelled) reportEmpty(stage + " · " + type);
          } finally {
            // A missing or expired scientific publication must not make the
            // entire 3D globe lose its clouds. This runs on EACH retry, and
            // seamlessly switches back to authoritative L2 as soon as it
            // becomes available again.
            if (!cancelled && (!scienceImage || Date.now() >= scienceExpiresAt)) {
              try {
                await renderVisualBackup(
                  controller.signal,
                  pendingScienceFailure || "VERIFIED L2 SCAN NOT AVAILABLE",
                );
                retryDelay = 2 * 60_000;
              } catch {
                if (!cancelled) reportEmpty("VISUAL BACKUP UNAVAILABLE · RETRYING");
              }
            }
            controllers.delete(controller);
            loading = false;
            if (!cancelled) retryTimer = window.setTimeout(updateScience, retryDelay);
          }
        })();
      };
      updateScience();
      return () => {
        cancelled = true;
        ++atlasEncodeGeneration;
        if (atlasPngUrl) URL.revokeObjectURL(atlasPngUrl);
        if (limbOverlayRef.current) {limbOverlayRef.current.dispose();limbOverlayRef.current=null;}
        uniforms.v3LimbOverlayReady.value=0;
        document.getElementById("cupola-v3-unified-atlas")?.remove();
        if (retryTimer != null) window.clearTimeout(retryTimer);
        controllers.forEach(controller => controller.abort());
        if (atlasCurrentRef.current) atlasCurrentRef.current.dispose();
        if (atlasNextRef.current && atlasNextRef.current !== atlasCurrentRef.current) atlasNextRef.current.dispose();
        atlasCurrentRef.current = null;
        atlasNextRef.current = null;
        atlasTransitionRef.current = null;
        uniforms.cloudAtlasReady.value = 0;
      };
    }


    const loadGeo = () => {
      if (cancelled || geoLoading) return;
      geoLoading = true;
      const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
      const entries = Object.entries(GEO_CLOUD_TEXTURES) as Array<[CloudAtlasSource, string]>;
      const geoProductFallbacks: string[] = [];
      void (async () => {
        try {
          await Promise.all(entries.map(async ([key, url]) => {
            const controller = new AbortController();
            geoControllers.add(controller);
            try {
              const experimentalGeoColor = new URLSearchParams(window.location.search).get("cloudProduct") === "geocolor";
              const productParam = experimentalGeoColor && (key === "east" || key === "west") ? "&product=geocolor" : "";
              const response = await fetch(url + productParam + "&v=" + bucket, { signal: controller.signal, cache: "no-store" });
              if (!response.ok || cancelled || !(response.headers.get("content-type") || "").startsWith("image/")) return;
              const fallbackReason = response.headers.get("X-Cupola-Product-Fallback");
              if (fallbackReason && fallbackReason !== "none") geoProductFallbacks.push(key.toUpperCase() + ": " + fallbackReason);
              const observedProduct = key.startsWith("polar") ? "viirs-daily" : response.headers.get("X-Cupola-Source-Type") === "geocolor-experimental" ? "geocolor" : "infrared";
              const stamp = Date.parse(response.headers.get("X-Cupola-Frame-Time") || "");
              if (!Number.isFinite(stamp) || stamp > Date.now() + 5 * 60_000 || Date.now() - stamp > (key.startsWith("polar") ? 48 * 60 * 60_000 : CLOUD_ATLAS_MAX_AGE_MS)) return;
              if (cachedFrames[key] && cachedFrames[key]!.time >= stamp &&
                  (key !== "polar" || Date.now() - (cachedFrames[key]!.revision ?? 0) < 30 * 60_000)) return;
              const blob = await response.blob();
              if (cancelled || blob.size < 2000) return;
              const image = key.startsWith("polar") ? await decodePolarViirsFrame(blob) : await decodeCloudFrame(blob);
              const quality = validateCloudFrame(image);
              if (!quality.valid) return;
              if (!cancelled) { cachedFrames[key] = { image, time: stamp, product: observedProduct, revision: key.startsWith("polar") ? Date.now() : stamp }; }
            } catch {
              // Preserve last known-good image; never substitute a fabricated frame.
            } finally { geoControllers.delete(controller); }
          }));
          if (cancelled) return;
          // Publish when a new frame arrives OR an older source expires.
          // Each satellite has its own observation age and may still be fresh
          // when another satellite has already published a later scan.
          const observedNow = Date.now();
          const frameSignature = entries.map(([key]) => {
            const frame = cachedFrames[key];
            return frame && observedNow - frame.time <= (key.startsWith("polar") ? 48 * 60 * 60_000 : CLOUD_ATLAS_MAX_AGE_MS) &&
              frame.time <= observedNow + 5 * 60_000 ? key + ":" + frame.time + ":" + (frame.revision ?? frame.time) : key + ":none";
          }).join("|");
          if (frameSignature === publishedFrameSignature && atlasCurrentRef.current) return;
          // V2 is opt-in during validation; default engine remains unchanged.
          const canvas = cloudEngine === "v2"
            ? composeCloudAtlasV2(cachedFrames, observedNow)
            : composeCloudAtlas(cachedFrames, observedNow);
          if (!canvas) {
            publishedFrameSignature = frameSignature;
            uniforms.cloudAtlasReady.value = 0;
            window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", { detail: {
              status: "fallback", frameTime: null, coverage: 0, sources: [], products: [], sourceCoverage: [], fallbackReasons: geoProductFallbacks, engine: cloudEngine, sourceAges: [],
            } }));
            return;
          }
          publishedFrameSignature = frameSignature;
          window.dispatchEvent(new CustomEvent<CloudTelemetry>("cupola-cloud-telemetry", { detail: {
            status: "observed", frameTime: canvas.dataset.observationTime ?? null,
            coverage: Number(canvas.dataset.observedCoverage ?? 0),
            sources: (canvas.dataset.sources || "").split(",").filter(Boolean),
            products: (canvas.dataset.products || "").split(",").filter(Boolean),
            sourceCoverage: (canvas.dataset.sourceCoverage || "").split(",").filter(Boolean),
            fallbackReasons: geoProductFallbacks,
            engine: cloudEngine,
            sourceAges: entries.flatMap(([key]) => cachedFrames[key] && observedNow - cachedFrames[key]!.time <= CLOUD_ATLAS_MAX_AGE_MS
              ? [key + ":" + Math.round((observedNow - cachedFrames[key]!.time) / 60000) + "m"] : []),
          } }));
          publishCanvas(canvas);
        } finally { geoLoading = false; }
      })();
    };

    // Live-only test: never fetch or display the MODIS/baseline clouds.
    loadGeo();
    // Check for new frames regularly; the upstream cadence remains ~10 min.
    // A quick poll reduces publication delay without fabricating observations.
    const geoInterval = window.setInterval(loadGeo, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(geoInterval);
      geoControllers.forEach((controller) => controller.abort());
      const current = currentLiveRef.current;
      const next = nextLiveRef.current;
      if (current && current !== staticCloudTexture) current.dispose();
      if (next && next !== current && next !== staticCloudTexture) next.dispose();
      currentLiveRef.current = null;
      nextLiveRef.current = null;
      if (atlasCurrentRef.current) atlasCurrentRef.current.dispose();
      if (atlasNextRef.current && atlasNextRef.current !== atlasCurrentRef.current) atlasNextRef.current.dispose();
      atlasCurrentRef.current = null;
      atlasNextRef.current = null;
      atlasTransitionRef.current = null;
      pendingGpuApplyRef.current = null;
      uniforms.cloudAtlasReady.value = 0;
    };
  }, [gl, staticCloudTexture, uniforms, cloudEngine]);

  useFrame(() => {
    const announceGpuApplied = () => {
      const pending = pendingGpuApplyRef.current;
      if (!pending) return;
      pendingGpuApplyRef.current = null;
      window.dispatchEvent(new CustomEvent<CloudGpuApply>("cupola-cloud-gpu-applied", {
        detail: { ...pending, appliedAt: new Date().toISOString() },
      }));
    };
    const introStart = initialCloudBlendStartRef.current;
    if (introStart !== null) {
      const t = Math.min(1, (performance.now() - introStart) / 900);
      uniforms.cloudIntroBlend.value = t * t * (3 - 2 * t);
      if (t >= 1) {
        initialCloudBlendStartRef.current = null;
        if (!atlasTransitionRef.current) announceGpuApplied();
      }
    }
    // Keep both actual WebGL materials in sync with React diagnostic state.
    // R3F may copy the initial uniforms object when mounting shaderMaterial.
    uniforms.cloudDebugMode.value = cloudDebugMode;
    if (materialRef.current?.uniforms.cloudDebugMode) materialRef.current.uniforms.cloudDebugMode.value = cloudDebugMode;
    if (shadowMaterialRef.current?.uniforms.cloudDebugMode) shadowMaterialRef.current.uniforms.cloudDebugMode.value = cloudDebugMode;
    // R3F can copy uniforms when mounting. Keep the distinct visual IR rim
    // texture synced to both actual materials as the 10-min atlas changes.
    for (const ref of [materialRef, shadowMaterialRef]) {
      const u=ref.current?.uniforms;
      if (u?.v3SeamVisualBlend) u.v3SeamVisualBlend.value=uniforms.v3SeamVisualBlend.value;
      if (u?.v3LimbOverlayReady) u.v3LimbOverlayReady.value=uniforms.v3LimbOverlayReady.value;
      if (u?.v3LimbOverlayTexture) u.v3LimbOverlayTexture.value=uniforms.v3LimbOverlayTexture.value;
    }
    const started = atlasTransitionRef.current;
    if (started != null && atlasNextRef.current) {
      const t = Math.min(1, (performance.now() - started) / 6000);
      uniforms.cloudAtlasBlend.value = t * t * (3 - 2 * t);
      if (t >= 1) {
        const previous = atlasCurrentRef.current;
        const next = atlasNextRef.current;
        atlasCurrentRef.current = next;
        atlasNextRef.current = null;
        atlasTransitionRef.current = null;
        uniforms.cloudAtlasA.value = next;
        uniforms.cloudAtlasB.value = next;
        uniforms.cloudAtlasBlend.value = 0;
        if (previous && previous !== next) previous.dispose();
        announceGpuApplied();
      }
    }
    // React Three Fiber may clone initial uniform structures.
    for (const material of [materialRef.current, shadowMaterialRef.current]) {
      if (!material) continue;
      for (const key of ["cloudAtlasA", "cloudAtlasB", "cloudAtlasBlend", "cloudAtlasReady", "cloudIntroBlend"] as const) {
        if (material.uniforms[key]) material.uniforms[key].value = uniforms[key].value;
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
          ref={shadowMaterialRef}
          uniforms={uniforms}
          vertexShader={LIVE_CLOUD_VERTEX_SHADER}
          fragmentShader={LIVE_CLOUD_SHADOW_FRAGMENT_SHADER}
          transparent
          depthTest={true}
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


type DynamicImage = {
  info: DailyImageryInfo;
  version: string;
  texture: THREE.Texture | null;
};

/** Two-request staging: lightweight server metadata first, then download
 * image only when the date/revision window changes. Never overwrite current
 * GPU texture with expired, unverifiable or fallback imagery.
 */
async function retrieveDailyImage(
  kind: "night" | "surface", previousVersion: string | null,
  signal: AbortSignal,
): Promise<DynamicImage | null> {
  const source = kind === "night" ? "/api/night-lights" : "/api/satellite?mode=live";
  const metaUrl = kind === "night"
    ? source + "?meta=1" : source + "&meta=1";
  const metaResponse = await fetch(metaUrl, {signal, cache:"no-store"});
  if (!metaResponse.ok) return null;
  const info = parseDailyImageryInfo(await metaResponse.json(),kind);
  if (!info) return null;
  // The GIBS daily image can gain swath data throughout the UTC day.
  // Revisit the same dated layer without forcing a new GPU upload each minute.
  const refreshEvery = kind === "night" ? 3*3600_000 : 45*60_000;
  const version = imageVersion(info) + "#" + Math.floor(Date.now()/refreshEvery);
  if (version === previousVersion) return {info,version,texture:null};

  const downloadUrl = source + (kind === "night" ? "?" : "&") +
    "revision=" + encodeURIComponent(String(Math.floor(Date.now()/refreshEvery)));
  const imgResponse = await fetch(downloadUrl,{signal,cache:"no-store"});
  if(!imgResponse.ok ||
    imgResponse.headers.get("X-Cupola-Imagery-Date") !== info.imageryDate ||
    !imgResponse.headers.get("X-Cupola-Source")?.includes(info.layer) ||
    !imgResponse.headers.get("Content-Type")?.startsWith("image/")) return null;
  const blob = await imgResponse.blob();
  if(blob.size < (kind==="night"?5000:25000) || blob.size > 20_000_000) return null;
  const blobUrl = URL.createObjectURL(blob);
  let texture:THREE.Texture;
  try {
    texture = await new THREE.TextureLoader().loadAsync(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  if(signal.aborted) {texture.dispose();return null;}
  const bitmap=texture.image as {width?:number;height?:number};
  const expected = kind==="night" ? [4096,2048] : [2048,1024];
  if(bitmap.width !== expected[0] || bitmap.height !== expected[1]){
    texture.dispose();
    return null;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return {info,version,texture};
}

function Earth(props: { lunarObserver: boolean; cloudEngine: CloudEngine; cloudDebugMode: CloudDebugMode; clouds: boolean; cityLights: boolean; satelliteSurface: boolean; onSurfaceApplied?: (stats: FusionStats | null) => void; aurora: boolean; precipitation: boolean; cinematic: boolean; marker?: { lat: number; lon: number } | null; windSpeed?: number | null; temperature?: number | null; pressure?: number | null; snowfall?: number | null; weatherLayer?: WeatherLayer | null }) {
  const preset = props.cinematic ? CINEMA_PRESET : LIVE_PRESET;
  const earthRef = useRef<THREE.Mesh>(null);
  const { gl } = useThree();
  const textures = useTexture([DAY_TEXTURE, NIGHT_TEXTURE, NIGHT_BASE_TEXTURE, STATIC_CLOUD_TEXTURE, PRECIP_TEXTURE, NORMAL_TEXTURE, SPECULAR_TEXTURE]);
  const baseDayTexture = textures[0];
  const initialNightTexture = textures[1];
  const [liveNightTexture, setLiveNightTexture] = useState<THREE.Texture | null>(null);
  const nightVersionRef = useRef<string | null>(null);
  const nightManagedRef = useRef<THREE.Texture | null>(null);
  const [viirsLandTexture,setViirsLandTexture]=useState<THREE.Texture|null>(null);
  const landOwnedRef=useRef<THREE.Texture|null>(null);
  const landVersionRef=useRef<string|null>(null);
  // The actual Earth surface changes. VIIRS only fills conservatively
  // accepted land pixels; the existing NASA basemap survives everywhere else.
  const dayTexture = props.satelliteSurface && viirsLandTexture ? viirsLandTexture : baseDayTexture;
  const nightTexture = liveNightTexture ?? initialNightTexture;
  const baseNightTexture = textures[2];
  const staticCloudTexture = textures[3];
  const precipTexture = textures[4];
  const normalTexture = textures[5];
  const specularTexture = textures[6];
  const uniforms = useMemo(() => ({
    dayTexture: { value: dayTexture },
    nightTexture: { value: nightTexture },
    sunDirection: { value: getSunDirection(new Date()) },
    lightsEnabled: { value: props.cityLights ? (props.lunarObserver ? 0.42 : 1) : 0 },
  }), [baseDayTexture, initialNightTexture]);
  const nightLayerUniforms = useMemo(() => ({
    nightTexture: uniforms.nightTexture,
    baseNightTexture: { value: baseNightTexture },
    sunDirection: uniforms.sunDirection,
    lightsEnabled: uniforms.lightsEnabled,
  }), [baseNightTexture, uniforms]);
  useEffect(() => {
    uniforms.dayTexture.value = dayTexture;
    uniforms.nightTexture.value = nightTexture;
  }, [dayTexture, nightTexture, uniforms]);
  const glintUniforms = useMemo(() => ({
    oceanMask: { value: specularTexture },
    sunDirection: uniforms.sunDirection,
    northDirection: { value: globeWorldNormal(90, 0) },
    intensity: { value: props.cinematic ? 0.94 : 0.80 },
    time: { value: 0 },
  }), [specularTexture, uniforms]);

  useEffect(() => {
    const anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    [baseDayTexture, initialNightTexture, baseNightTexture, staticCloudTexture, precipTexture].forEach((texture) => {
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
  }, [baseDayTexture, initialNightTexture, baseNightTexture, staticCloudTexture, precipTexture, normalTexture, specularTexture, gl]);

  // Maintain night-city illumination as an independent daily NASA VIIRS
  // texture. Shader uniforms and the Cloud V3 atlas remain stable.
  useEffect(() => {
    if (!props.cityLights) return;
    let inFlight=false;
    const controller=new AbortController();
    const reload=async()=>{
      if(inFlight||controller.signal.aborted)return;
      inFlight=true;
      try {
        const result=await retrieveDailyImage("night",nightVersionRef.current,controller.signal);
        if(!result||controller.signal.aborted||!result.texture)return;
        const previous=nightManagedRef.current;
        result.texture.anisotropy=Math.min(8,gl.capabilities.getMaxAnisotropy());
        nightManagedRef.current=result.texture;
        nightVersionRef.current=result.version;
        setLiveNightTexture(result.texture);
        // Preserve previous GPU allocation during the scene's next render.
        if(previous)window.setTimeout(()=>previous.dispose(),1200);
      } catch {/* Keep last known-good VIIRS or Black Marble fallback. */}
      finally {inFlight=false;}
    };
    void reload();
    const timer=window.setInterval(()=>void reload(),30*60_000);
    return()=>{
      controller.abort();
      window.clearInterval(timer);
      const owned=nightManagedRef.current;
      nightManagedRef.current=null;
      nightVersionRef.current=null;
      setLiveNightTexture(null);
      if(owned)window.setTimeout(()=>owned.dispose(),1200);
    };
  },[props.cityLights,gl]);

  // Live GPU surface: composite recent NASA VIIRS observed land pixels into
  // the real Earth material (not just a menu preview). No fake full-Earth
  // video, and never alter or remount the V3 cinematic cloud atlas.
  useEffect(()=>{
    if(!props.satelliteSurface) {
      props.onSurfaceApplied?.(null);
      return;
    }
    const controller=new AbortController();
    let inFlight=false;
    const apply=async()=>{
      if(inFlight||controller.signal.aborted)return;
      inFlight=true;
      try{
        // A completed UTC daily mosaic is substantially more complete than a
        // partly collected current-day pass.
        const sensor="noaa21",daysAgo=1;
        const url="/api/satellite?mode=live&sensor="+sensor+"&daysAgo="+daysAgo;
        const response=await fetch(url,{signal:controller.signal,cache:"no-store"});
        if(!response.ok||
          response.headers.get("x-cupola-source")!=="NASA_GIBS_VIIRS"||
          response.headers.get("x-cupola-layer")!=="VIIRS_NOAA21_CorrectedReflectance_TrueColor"||
          !(response.headers.get("content-type")||"").startsWith("image/jpeg"))
          return;
        const date=response.headers.get("x-cupola-imagery-date")||"";
        const expected=new Date();expected.setUTCDate(expected.getUTCDate()-daysAgo);
        if(date!==expected.toISOString().slice(0,10))return;
        const version=date+"|"+Math.floor(Date.now()/(4*3600_000));
        if(version===landVersionRef.current)return;
        const blob=await response.blob();
        if(blob.size<25000||blob.size>16_000_000)return;
        const freshBitmap=await createImageBitmap(blob);
        try{
          if(freshBitmap.width!==2048||freshBitmap.height!==1024)return;
          const baseImage=baseDayTexture.image as CanvasImageSource|null;
          if(!baseImage)return;
          const baseCanvas=document.createElement("canvas");
          baseCanvas.width=2048;baseCanvas.height=1024;
          const ctx=baseCanvas.getContext("2d",{willReadFrequently:true});
          const rawCanvas=document.createElement("canvas");
          rawCanvas.width=2048;rawCanvas.height=1024;
          const rawContext=rawCanvas.getContext("2d",{willReadFrequently:true});
          if(!ctx||!rawContext)return;
          ctx.drawImage(baseImage,0,0,2048,1024);
          rawContext.drawImage(freshBitmap,0,0,2048,1024);
          const baseData=ctx.getImageData(0,0,2048,1024);
          const rawData=rawContext.getImageData(0,0,2048,1024);
          const blend=fuseViirsPixels(baseData.data,rawData.data,2048,1024);
          // Fail closed rather than change the planet based on a mostly
          // empty or incompatible imagery layer.
          if(blend.accepted<10000 || controller.signal.aborted)return;
          const merged=ctx.createImageData(2048,1024);
          merged.data.set(blend.pixels);
          ctx.putImageData(merged,0,0);
          const newTexture=new THREE.CanvasTexture(baseCanvas);
          newTexture.colorSpace=THREE.SRGBColorSpace;
          newTexture.wrapS=THREE.RepeatWrapping;
          newTexture.wrapT=THREE.ClampToEdgeWrapping;
          newTexture.anisotropy=Math.min(8,gl.capabilities.getMaxAnisotropy());
          newTexture.minFilter=THREE.LinearMipmapLinearFilter;
          newTexture.magFilter=THREE.LinearFilter;
          newTexture.generateMipmaps=true;
          newTexture.needsUpdate=true;
          if(controller.signal.aborted){newTexture.dispose();return;}
          const old=landOwnedRef.current;
          landOwnedRef.current=newTexture;
          landVersionRef.current=version;
          setViirsLandTexture(newTexture);
          props.onSurfaceApplied?.({
            acceptedPixels:blend.accepted,totalPixels:2048*1024,
            date,sensor:"NOAA-21 VIIRS",
          });
          if(old)window.setTimeout(()=>old.dispose(),1400);
        } finally {freshBitmap.close();}
      }catch{
        // Preserve last-good Earth. Network, CORS and pixel failures never
        // switch off clouds or substitute a black raster.
      }finally{inFlight=false;}
    };
    void apply();
    const timer=window.setInterval(()=>void apply(),30*60_000);
    return()=>{
      controller.abort();window.clearInterval(timer);
      const old=landOwnedRef.current;
      landOwnedRef.current=null;landVersionRef.current=null;
      setViirsLandTexture(null);
      if(old)window.setTimeout(()=>old.dispose(),1400);
      props.onSurfaceApplied?.(null);
    };
  },[props.satelliteSurface,props.onSurfaceApplied,baseDayTexture,gl]);

  useEffect(() => { uniforms.lightsEnabled.value = props.cityLights ? (props.lunarObserver ? 0.42 : 1) : 0; }, [props.cityLights, props.lunarObserver, uniforms]);
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
        {props.lunarObserver ? (
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={EARTH_VERTEX_SHADER}
            fragmentShader={LUNAR_OBSERVER_EARTH_FRAGMENT_SHADER}
          />
        ) : (
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
        )}
      </mesh>

      {!props.lunarObserver && <mesh scale={1.0018} renderOrder={1}>
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
      </mesh>}

      {/* A soft ocean-only solar path. Never changes the existing day/night,
          clouds, limb atmosphere or the base physical ocean material. */}
      {!props.lunarObserver && <mesh scale={1.0025} renderOrder={2}>
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
      </mesh>}

      {props.cityLights && !props.lunarObserver && (
        <mesh scale={1.0034} renderOrder={2}>
          <sphereGeometry args={[2.5, 128, 128]} />
          <shaderMaterial
            uniforms={nightLayerUniforms}
            vertexShader={NIGHT_VERTEX_SHADER}
            fragmentShader={NIGHT_FRAGMENT_SHADER}
            transparent
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {props.clouds && props.cloudDebugMode !== 3 && (
        <LiveCloudLayer
          cloudEngine={props.cloudEngine}
          cloudDebugMode={props.cloudDebugMode}
          staticCloudTexture={staticCloudTexture}
          dayTexture={baseDayTexture}
          sunDirection={uniforms.sunDirection}
          cinematic={props.cinematic}
          lunarObserver={props.lunarObserver}
        />
      )}

      {props.precipitation && !props.lunarObserver && (
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
      {!props.lunarObserver && <Billboard follow>
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
      </Billboard>}

      {/* Bright atmospheric core anchored directly to the Earth limb. */}
      <mesh scale={1.00001} renderOrder={18}>
        <sphereGeometry args={[2.5, 192, 192]} />
        <shaderMaterial
          uniforms={{
            sunDirection: uniforms.sunDirection,
            intensity: { value: props.lunarObserver ? 0.62 : (props.cinematic ? 1.28 : 1.16) },
             lunarObserver: { value: props.lunarObserver ? 1 : 0 },
          }}
          vertexShader={LIMB_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_CORE_FRAGMENT_SHADER}
          side={THREE.FrontSide}
          transparent
          depthTest={props.lunarObserver}
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
            intensity: { value: props.lunarObserver ? 0.27 : (props.cinematic ? 1.48 : 1.30) },
             lunarObserver: { value: props.lunarObserver ? 1 : 0 },
          }}
          vertexShader={LIMB_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_INNER_FRAGMENT_SHADER}
          side={THREE.FrontSide}
          transparent
          depthTest={props.lunarObserver}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>



      {props.marker && props.windSpeed != null && props.weatherLayer === "WIND" && <WindHalo lat={props.marker.lat} lon={props.marker.lon} speed={props.windSpeed} />}

      {props.marker && props.temperature != null && props.weatherLayer === "TEMPERATURE" && <TemperatureHalo lat={props.marker.lat} lon={props.marker.lon} temperature={props.temperature} />}
      {props.marker && props.pressure != null && props.weatherLayer === "PRESSURE" && <LocalMetricHalo lat={props.marker.lat} lon={props.marker.lon} value={props.pressure} kind="PRESSURE" />}
      {props.marker && props.snowfall != null && props.weatherLayer === "SNOW" && <LocalMetricHalo lat={props.marker.lat} lon={props.marker.lon} value={props.snowfall} kind="SNOW" />}

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

function SeismicMarker({ event, index, onSelect }: { event: EarthquakeEvent; index: number; onSelect?: (event: EarthquakeEvent) => void }) {
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
    <group ref={groupRef} position={point} quaternion={quaternion}
      onClick={(e) => { if(onSelect){e.stopPropagation();onSelect(event);} }}>
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

function EarthquakeLayer({ events, onSelect }: { events: EarthquakeEvent[]; onSelect?: (event: EarthquakeEvent) => void }) {
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
        <SeismicMarker key={event.id} event={event} index={index} onSelect={onSelect} />
      ))}
    </group>
  );
}


function VolcanoMarker({ event, index, onSelect }: { event: VolcanoEvent; index: number; onSelect?: (event: VolcanoEvent) => void }) {
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
    <group ref={groupRef} position={point} quaternion={quaternion}
      onClick={(e) => { if(onSelect){e.stopPropagation();onSelect(event);} }}>
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

function VolcanoLayer({ volcanoes, onSelect }: { volcanoes: VolcanoEvent[]; onSelect?: (event: VolcanoEvent) => void }) {
  return (
    <group>
      {volcanoes.slice(0, 32).map((event, index) => (
        <VolcanoMarker key={event.id} event={event} index={index} onSelect={onSelect} />
      ))}
    </group>
  );
}


function WildfireLayer({ hotspots, onSelect }: { hotspots: WildfireHotspot[]; onSelect?: (hotspot: WildfireHotspot) => void }) {
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

      <instancedMesh ref={coreRef} args={[undefined, undefined, visibleHotspots.length]} frustumCulled={false} renderOrder={12}
        onClick={(e) => { const picked=visibleHotspots[e.instanceId ?? -1]; if(picked&&onSelect){e.stopPropagation();onSelect(picked);} }}>
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

function StormMarker({ storm, index, showForecast, onSelect }: { storm: TropicalStorm; index: number; showForecast: boolean; onSelect?: (storm: TropicalStorm) => void }) {
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

      <group ref={groupRef} position={point} quaternion={quaternion}
        onClick={(e) => {if(onSelect){e.stopPropagation();onSelect(storm);} }}>
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

function StormLayer({ storms, showForecast, onSelect }: { storms: TropicalStorm[]; showForecast: boolean; onSelect?: (storm: TropicalStorm) => void }) {
  return (
    <group>
      {storms.slice(0, 12).map((storm, index) => (
        <StormMarker key={storm.id} storm={storm} index={index} showForecast={showForecast} onSelect={onSelect} />
      ))}
    </group>
  );
}


/**
 * Photographic-style lightning channel (tapered, jagged, branching), followed
 * by a brief return stroke and light scattered through the storm cloud.
 * The storm region is satellite-observed / modelled. The individual animated
 * channel and its timing are illustrative, NEVER a measured strike.
 */
const STORM_CLOUD_ILLUMINATION_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STORM_CLOUD_ILLUMINATION_FRAGMENT = `
  uniform float intensity;
  varying vec2 vUv;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    vec2 p = (vUv - vec2(0.5)) * vec2(1.0, 1.28);
    // Irregular scattered light through clouds, without a circular disc rim.
    float noise = hash(floor(vUv * 21.0)) * 0.16 +
                  hash(floor(vUv * 49.0)) * 0.085;
    float filamentLight = exp(-pow(length(p) * 4.4, 1.45));
    float cloudLight = exp(-pow(length(p + vec2(0.10, -0.035)) * 3.1, 1.9));
    float alpha = (filamentLight * 0.22 + cloudLight * 0.13) *
                  (0.83 + noise) * intensity;
    if (alpha < 0.002) discard;
    vec3 iceWhite = mix(vec3(0.79, 0.86, 1.0), vec3(1.0, 0.98, 0.93),
                        filamentLight * 0.76);
    gl_FragColor = vec4(iceWhite * alpha * 1.9, alpha);
  }
`;

// Factor is applied to all lightning channels, their corona and cloud
// illumination; the shape/size of bolts and Cloud V3 textures are unchanged.
const STORM_FLASH_BRIGHTNESS = 1.35;

function StormZoneFlash({
  zone, index, cinematic, flashOnceAtMs,
}: { zone: LightningStormZone; index: number; cinematic: boolean; flashOnceAtMs?: number }) {
  const channelRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const cameraVector = useRef(new THREE.Vector3());
  const position = useMemo(
    () => globeWorldPoint(zone.latitude, zone.longitude, 0.072),
    [zone.latitude, zone.longitude],
  );
  const normal = useMemo(
    () => globeWorldNormal(zone.latitude, zone.longitude),
    [zone.latitude, zone.longitude],
  );
  const power = THREE.MathUtils.clamp(zone.strength, 0.2, 1);
  const seed = useMemo(
    () => index * 23 + Math.round((zone.latitude + 90) * 7) +
      Math.round((zone.longitude + 180) * 13),
    [index, zone.latitude, zone.longitude],
  );
  // Geometry is created on zone change only, never regenerated on a frame.
  const channelGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(
      buildLightningBoltTriangles(seed, 1), 3,
    ));
    geometry.computeBoundingSphere();
    return geometry;
  }, [seed]);
  const coronaGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(
      buildLightningBoltTriangles(seed, 4.1), 3,
    ));
    geometry.computeBoundingSphere();
    return geometry;
  }, [seed]);
  useEffect(() => () => {
    channelGeometry.dispose();
    coronaGeometry.dispose();
  }, [channelGeometry, coronaGeometry]);

  useFrame(({ clock, camera }) => {
    // Occlude the back hemisphere without projecting false lightning through
    // the globe. The flash cycles contain a bright leader + return stroke.
    cameraVector.current.copy(camera.position).sub(position).normalize();
    const facing = THREE.MathUtils.smoothstep(
      normal.dot(cameraVector.current), 0.02, 0.23,
    );
    // Real GLM detections emit ONE 900ms pulse only. The existing cyclic
    // envelope remains for explicitly illustrative NOAA/MTG/MODEL zones.
    const elapsed = flashOnceAtMs === undefined ? 0 : (performance.now() - flashOnceAtMs) / 1000;
    const burst = flashOnceAtMs === undefined
      ? stormZoneFlashEnvelope(clock.elapsedTime, index + 1)
      : elapsed < 0 || elapsed > 0.90 ? 0 :
        Math.min(1, Math.exp(-elapsed * 17) + 0.55 * Math.exp(-Math.abs(elapsed - 0.18) * 31));
    const modelFactor = zone.source === "MODEL" ? 0.48 : 1;
    const base = burst * facing * modelFactor *
      (0.76 + power * 0.24) * (cinematic ? 1.20 : 0.90) * STORM_FLASH_BRIGHTNESS;
    const visible = base > 0.012;
    if (channelRef.current) {
      channelRef.current.visible = visible;
      (channelRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.min(1, base * 1.40);
    }
    if (coronaRef.current) {
      coronaRef.current.visible = visible;
      (coronaRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.min(0.60, base * 0.35);
    }
    if (cloudRef.current) {
      cloudRef.current.visible = visible;
      const material = cloudRef.current.material as THREE.ShaderMaterial;
      material.uniforms.intensity.value = Math.min(1.3, base * 1.20);
    }
  });

  return (
    <Billboard position={position} scale={cinematic ? 0.64 : 0.52} follow>
      <mesh ref={cloudRef} renderOrder={16} visible={false}>
        <planeGeometry args={[0.54, 0.40]} />
        <shaderMaterial
          vertexShader={STORM_CLOUD_ILLUMINATION_VERTEX}
          fragmentShader={STORM_CLOUD_ILLUMINATION_FRAGMENT}
          uniforms={{ intensity: { value: 0 } }}
          transparent depthTest depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false} side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={coronaRef} geometry={coronaGeometry} renderOrder={17}
        visible={false}>
        <meshBasicMaterial color="#bed7ff" transparent opacity={0}
          depthTest depthWrite={false} blending={THREE.AdditiveBlending}
          toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={channelRef} geometry={channelGeometry} renderOrder={18}
        visible={false}>
        <meshBasicMaterial color="#fffdf4" transparent opacity={0}
          depthTest depthWrite={false} blending={THREE.AdditiveBlending}
          toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </Billboard>
  );
}


/** One-time observed GLM optical flashes, NEVER a periodic animated storm.
 * On first mount the existing historical snapshot is marked seen, not replayed
 * as a new lightning strike. Newly published IDs then appear exactly once,
 * paced across a short visual arrival window (not simulated observation UTC).
 * Original NOAA WMS / MTG overlays remain the independently labelled fallback.
 */
function RealGLMFlashLayer({
  cinematic, onCoverageChange,
}: { cinematic: boolean; onCoverageChange: (bothSatellites: boolean, count: number) => void }) {
  const seenRef = useRef(new Set<string>());
  const initializedRef = useRef(false);
  const queueRef = useRef<GLMFlash[]>([]);
  const [visibleFlashes, setVisibleFlashes] = useState<Array<{event: GLMFlash; startedAt: number}>>([]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const load = async () => {
      if (cancelled || loading) return;
      loading = true;
      try {
        const response = await fetch("/api/lightning-glm?v=" + Math.floor(Date.now() / 30_000),
          {cache: "no-store", signal: AbortSignal.timeout(14000)});
        if (cancelled) return;
        if (response.status !== 200 ||
          response.headers.get("X-Cupola-Data-Status") !== "goes-glm-observed-flash-centroids") {
          onCoverageChange(false, 0);
          return;
        }
        const feed = parseGLMFeed(await response.json());
        if (!feed || cancelled) { if (!cancelled) onCoverageChange(false, 0); return; }
        const fullCoverage = feed.sources.some(s => s.satellite === "GOES-18") &&
          feed.sources.some(s => s.satellite === "GOES-19");
        onCoverageChange(fullCoverage, feed.count_sampled);
        // First visit begins with a baseline; old flashes must never replay.
        if (!initializedRef.current) {
          feed.flashes.forEach(event => seenRef.current.add(event.id));
          initializedRef.current = true;
          return;
        }
        const unseen = selectUnseenGLMFlashes(feed, seenRef.current, Date.now(), 80);
        if (unseen.length) queueRef.current.push(...unseen.reverse());
        if (queueRef.current.length > 140) queueRef.current.splice(0, queueRef.current.length - 140);
      } catch {
        if (!cancelled) onCoverageChange(false, 0);
      } finally { loading = false; }
    };
    void load();
    const dataTimer = window.setInterval(() => void load(), 40_000);
    // A pulse exists for <900 ms then is removed. One new source record
    // is illustrated once; no recurring 6-8 second loop at a fixed coordinate.
    const animationTimer = window.setInterval(() => {
      if (cancelled) return;
      const next = queueRef.current.shift();
      const now = performance.now();
      setVisibleFlashes(previous => {
        const survivors = previous.filter(p => now - p.startedAt < 1000);
        return next
          ? [...survivors, {event: next, startedAt: now}].slice(-12)
          : survivors.length === previous.length ? previous : survivors;
      });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(dataTimer);
      window.clearInterval(animationTimer);
      onCoverageChange(false, 0);
    };
  }, [onCoverageChange]);

  return (
    <group>
      {visibleFlashes.map((pulse, index) => (
        <StormZoneFlash key={pulse.event.id}
          zone={{latitude:pulse.event.lat, longitude:pulse.event.lon,
            strength:1, source:"NOAA"}}
          index={index + 47} cinematic={cinematic} flashOnceAtMs={pulse.startedAt} />
      ))}
    </group>
  );
}

function LightningLayer({ cinematic, onTelemetry }: { cinematic: boolean; onTelemetry?: (telemetry: ObservedLightningTelemetry) => void }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [stormZones, setStormZones] = useState<LightningStormZone[]>([]);
  const currentTextureRef = useRef<THREE.Texture | null>(null);
  const currentEuropeTextureRef = useRef<THREE.Texture | null>(null);
  const glmActiveRef = useRef(false);
  const refreshZonesRef = useRef<() => void>(() => {});
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
    noaaHotspot: null,
    mtgHotspot: null,
    zones: [],
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

  const handleGLMCoverage = useCallback((fullCoverage: boolean, count: number) => {
    if (glmActiveRef.current === fullCoverage &&
        telemetryRef.current.glmFlashCount === count) return;
    glmActiveRef.current = fullCoverage;
    telemetryRef.current.glmObservedActive = fullCoverage;
    telemetryRef.current.glmFlashCount = count;
    // Suppress the repeating NOAA WMS flashes only when BOTH real GOES
    // satellites are current. Keep MTG/ECMWF coverage and their provenance.
    uniforms.lightningTexture.value = fullCoverage
      ? transparentFallback : currentTextureRef.current ?? transparentFallback;
    refreshZonesRef.current();
  }, [uniforms, transparentFallback]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const zonesByFeed: Record<"noaa" | "mtg", LightningStormZone[]> = { noaa: [], mtg: [] };

    const prepareLightningTexture = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      // ImageBitmap orientation is handled in WMS shader sampling.
      texture.flipY = false;
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

    // Decode real storm activity AREAS; no individual observed strike event is necessary.
    const analyzeCells = (texture: THREE.Texture, source: "NOAA" | "MTG") => {
      try {
        const canvas = document.createElement("canvas");
        // Use WMS native resolution. Downsampling previously erased small
        // but genuine North American lightning accumulations.
        canvas.width = 2048;
        canvas.height = 1024;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || !texture.image) return { cells: 0, hotspot: null as LightningHotspot | null, zones: [] as LightningStormZone[] };
        context.drawImage(texture.image as CanvasImageSource, 0, 0, 2048, 1024);
        const pixels = context.getImageData(0, 0, 2048, 1024).data;
        const regions = extractLightningStormZones(pixels, 2048, 1024, source, 28);
        return { cells: regions.zones.length ? regions.cells : 0,
          hotspot: regions.zones[0] ?? null, zones: regions.zones };
      } catch {
        return { cells: 0, hotspot: null as LightningHotspot | null, zones: [] as LightningStormZone[] };
      }
    };

    const emitTelemetry = () => {
      const combined = selectLightningStormZonesBalanced(glmActiveRef.current ? [] : zonesByFeed.noaa, zonesByFeed.mtg, 36, 12, 1.2);
      setStormZones(combined);
      const next = { ...telemetryRef.current, zones: combined, updatedAt: new Date().toISOString() };
      telemetryRef.current = next;
      onTelemetry?.(next);
    };

    refreshZonesRef.current = emitTelemetry;

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

        const observationMs = Date.parse(response.headers.get("x-cupola-observation-time") || "");
        const ageMs = Date.now() - observationMs;
        const available = response.ok && response.status !== 204 &&
          (response.headers.get("content-type") || "").startsWith("image/png") &&
          Number.isFinite(observationMs) && ageMs >= -5 * 60000 &&
          ageMs <= LIGHTNING_FRESHNESS_MINUTES[feed === "noaa" ? "NOAA" : "MTG"] * 60000;
        const prefix = feed === "noaa" ? "noaa" : "mtg";

        if (!available) {
          zonesByFeed[feed] = [];
          if (prefix === "noaa") {
            telemetryRef.current.noaaCells = 0;
            telemetryRef.current.noaaAvailable = false;
            telemetryRef.current.noaaAgeMinutes = null;
            telemetryRef.current.noaaObservationTime = null;
            telemetryRef.current.noaaSource = response.headers.get("x-cupola-source");
            telemetryRef.current.noaaHotspot = null;
            uniforms.lightningTexture.value = transparentFallback;
            disposeLightningTexture(currentTextureRef.current);
            currentTextureRef.current = null;
          } else {
            telemetryRef.current.mtgCells = 0;
            telemetryRef.current.mtgAvailable = false;
            telemetryRef.current.mtgAgeMinutes = null;
            telemetryRef.current.mtgObservationTime = null;
            telemetryRef.current.mtgSource = response.headers.get("x-cupola-source");
            telemetryRef.current.mtgHotspot = null;
            uniforms.lightningEuropeTexture.value = transparentFallback;
            disposeLightningTexture(currentEuropeTextureRef.current);
            currentEuropeTextureRef.current = null;
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
        const observation = analyzeCells(texture, feed === "noaa" ? "NOAA" : "MTG");
        // Fade observed accumulation with source age, never fake continuous flashes.
        const freshnessLimit = LIGHTNING_FRESHNESS_MINUTES[feed === "noaa" ? "NOAA" : "MTG"];
        const visualFade = Math.max(0.16, Math.min(1,
          (freshnessLimit - ageMs / 60000) / (freshnessLimit - 10)));
        zonesByFeed[feed] = observation.zones.map(zone => ({
          ...zone, strength: zone.strength * visualFade,
        }));
        const cells = observation.cells;
        const age = readAge(response.headers);
        const observationTime = response.headers.get("x-cupola-observation-time");
        const source = response.headers.get("x-cupola-source");

        if (feed === "noaa") {
          const previous = currentTextureRef.current;
          currentTextureRef.current = texture;
          uniforms.lightningTexture.value = glmActiveRef.current ? transparentFallback : texture;
          telemetryRef.current.noaaCells = cells;
          telemetryRef.current.noaaHotspot = observation.hotspot;
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
          telemetryRef.current.mtgHotspot = observation.hotspot;
          telemetryRef.current.mtgAvailable = true;
          telemetryRef.current.mtgAgeMinutes = age;
          telemetryRef.current.mtgObservationTime = observationTime;
          telemetryRef.current.mtgSource = source;
          disposeLightningTexture(previous);
        }

        emitTelemetry();
      } catch {
        zonesByFeed[feed] = [];
        if (feed === "noaa") {
          telemetryRef.current.noaaCells = 0;
          telemetryRef.current.noaaAvailable = false;
          telemetryRef.current.noaaAgeMinutes = null;
          telemetryRef.current.noaaHotspot = null;
          uniforms.lightningTexture.value = transparentFallback;
          disposeLightningTexture(currentTextureRef.current);
          currentTextureRef.current = null;
        } else {
          telemetryRef.current.mtgCells = 0;
          telemetryRef.current.mtgAvailable = false;
          telemetryRef.current.mtgAgeMinutes = null;
          telemetryRef.current.mtgHotspot = null;
          uniforms.lightningEuropeTexture.value = transparentFallback;
          disposeLightningTexture(currentEuropeTextureRef.current);
          currentEuropeTextureRef.current = null;
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
    <group>
      {/* Match Earth's translation, orientation and scale:
          the origin-centered lightning shell used to misplace observations. */}
      <mesh position={GLOBE_CENTER} rotation={GLOBE_ROTATION}
        scale={GLOBE_SCALE * 1.0175} renderOrder={15}>
        <sphereGeometry args={[2.5, 176, 176]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={LIGHTNING_VERTEX_SHADER}
          fragmentShader={LIGHTNING_FRAGMENT_SHADER}
          transparent depthTest depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <RealGLMFlashLayer cinematic={cinematic} onCoverageChange={handleGLMCoverage} />
      {stormZones.map((zone, index) => (
        <StormZoneFlash
          key={zone.source + ":" + zone.latitude.toFixed(2) + ":" + zone.longitude.toFixed(2)}
          zone={zone} index={index} cinematic={cinematic}
        />
      ))}
    </group>
  );
}


function LightningModelLayer({ points, cinematic }: { points: LightningModelPoint[]; cinematic: boolean }) {
  const zones = useMemo(() => selectLightningStormZones(
    points.slice(0, 48).map(point => ({
      latitude: point.latitude,
      longitude: point.longitude,
      strength: Math.min(1, 0.28 + Math.log2(1 + Math.max(0, point.density)) * 0.10),
      source: "MODEL" as const,
    })),
    12, 7,
  ), [points]);
  return (
    <group>
      {zones.map((zone, index) => (
        <StormZoneFlash key={"model:" + zone.latitude + ":" + zone.longitude}
          zone={zone} index={index + 13} cinematic={cinematic} />
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
  return satelliteMotionFactor(satellite.motionTarget?.timestamp, nowMs);
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
  // Never interpolate along a Cartesian chord through the atmosphere.
  // CPU follow/click position now matches the spherical GPU fleet motion.
  const position = satelliteOrbitArcPoint(
    [current.x, current.y, current.z],
    [target.x, target.y, target.z],
    [GLOBE_CENTER.x, GLOBE_CENTER.y, GLOBE_CENTER.z],
    satelliteMotionProgress(satellite, nowMs),
  );
  return new THREE.Vector3(...position);
}

const SATELLITE_FLEET_VERTEX_SHADER = `
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
attribute vec3 instanceColor;
attribute float instanceScale;
attribute float instanceSpin;
attribute float instanceSelected;
attribute float instanceIndex;
attribute float instanceMotionStart;
attribute float partType;

uniform float uNowSeconds;
uniform vec3 uGlobeCenter;
uniform float uHoveredIndex;

varying vec3 vColor;
varying float vPartType;
varying vec2 vUv;
varying float vSelected;
varying float vHovered;

void main() {
  // Each object has its own UTC motion window. Do not let the first
  // satellite's clock position the entire fleet.
  float progress = clamp((uNowSeconds - instanceMotionStart) / 180.0, 0.0, 1.0);
  vec3 orbitalStart = instanceStart - uGlobeCenter;
  vec3 orbitalEnd = instanceEnd - uGlobeCenter;
  float startRadius = length(orbitalStart);
  float endRadius = length(orbitalEnd);
  vec3 direction = normalize(mix(
    orbitalStart / max(startRadius, 0.00001),
    orbitalEnd / max(endRadius, 0.00001),
    progress
  ));
  // Normalize the interpolated radial direction to stay ABOVE Earth
  // rather than cutting through its atmosphere as a straight chord.
  vec3 center = uGlobeCenter + direction * mix(startRadius, endRadius, progress);
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

  // Click opens a dedicated hero 3D model, so hide the original fleet instance.
  alpha *= (1.0 - vSelected);

  gl_FragColor = vec4(color, alpha);
}
`;

function buildSatelliteFleetGeometry(satellites: LiveSatellite[]) {
  const buildStartedAt = performance.now();
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
  // Index once on fleet refresh, not during each selected satellite click.
  const instanceIndexById = new Map<string, number>();
  // Reuse five colors instead of allocating 16,000+ THREE.Color objects.
  const weatherColor = new THREE.Color("#27495a");
  const observationColor = new THREE.Color("#2b4f4a");
  const starlinkColor = new THREE.Color("#354454");
  const stationColor = new THREE.Color("#5a4934");
  const otherColor = new THREE.Color("#2d4150");
  const instanceIndices = new Float32Array(count);
  const motionStarts = new Float32Array(count);
  // Keep shader floats near zero: the Unix epoch (~1.8e12 ms) loses
  // seconds of precision if passed directly to a float32 GPU uniform.
  const motionReferenceMs = Math.floor(Date.now() /
    SATELLITE_MOTION_REFERENCE_BUCKET_MS) * SATELLITE_MOTION_REFERENCE_BUCKET_MS;

  satellites.forEach((satellite, index) => {
    instanceIndexById.set(satellite.id, index);
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

    const color = satellite.category === "WEATHER" ? weatherColor :
      satellite.category === "EARTH OBSERVATION" ? observationColor :
      satellite.category === "STARLINK" ? starlinkColor :
      satellite.category === "STATION" ? stationColor : otherColor;

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
    instanceIndices[index] = index;
    motionStarts[index] = satelliteMotionClockOffset(
      satellite.motionTarget?.timestamp, motionReferenceMs,
    );
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
  const selectedAttribute = new THREE.InstancedBufferAttribute(selectedFlags, 1);
  // The renderer may update just 1-2 NORAD indices in GPU memory on click.
  selectedAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceSelected", selectedAttribute);
  geometry.setAttribute(
    "instanceIndex",
    new THREE.InstancedBufferAttribute(instanceIndices, 1),
  );
  geometry.setAttribute(
    "instanceMotionStart",
    new THREE.InstancedBufferAttribute(motionStarts, 1),
  );
  geometry.userData.motionReferenceMs = motionReferenceMs;
  geometry.userData.instanceIndexById = instanceIndexById;
  geometry.userData.selectedIndex = -1;
  geometry.instanceCount = count;
  geometry.computeBoundingSphere();

  // GPU upload cannot be timed reliably from a CPU clock. This measures ONLY
  // typed-array construction; report buffer bytes as an estimate, not VRAM.
  geometry.userData.instanceBufferBytes =
    starts.byteLength + ends.byteLength + colors.byteLength +
    scales.byteLength + spins.byteLength + selectedFlags.byteLength +
    instanceIndices.byteLength + motionStarts.byteLength;
  geometry.userData.buildMs = Math.max(0, performance.now() - buildStartedAt);
  return geometry;
}

function SatelliteFleet({
  satellites,
  selectedId,
  onSelect,
  onReady,
  enabled,
  generation,
}: {
  satellites: LiveSatellite[];
  selectedId: string | null;
  onSelect: (satellite: LiveSatellite) => void;
  onReady?: () => void;
  enabled: boolean;
  generation: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera, gl, size } = useThree();
  const hoverCheckAt = useRef(0);
  const readyNotified = useRef(false);
  const firstFrameTicket = useRef<number | null>(null);
  useEffect(() => {
    // Each distinct enable generation needs a fresh frame acknowledgment.
    readyNotified.current = false;
    if (firstFrameTicket.current !== null) {
      window.cancelAnimationFrame(firstFrameTicket.current);
      firstFrameTicket.current = null;
    }
  }, [enabled, generation]);
  useEffect(() => () => {
    if (firstFrameTicket.current !== null)
      window.cancelAnimationFrame(firstFrameTicket.current);
  }, []);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const visible = satellites;

  // A selection changes only ONE attribute value. Do not regenerate and
  // re-upload the entire 17k-spacecraft geometry on every click or Follow.
  const geometry = useMemo(
    () => buildSatelliteFleetGeometry(visible),
    [visible],
  );

  useEffect(() => {
    const flags = geometry.getAttribute("instanceSelected") as THREE.InstancedBufferAttribute;
    const previousIndex = Number(geometry.userData.selectedIndex ?? -1);
    const instanceIndexById = geometry.userData.instanceIndexById as Map<string, number>;
    const nextIndex = selectedId ? (instanceIndexById.get(selectedId) ?? -1) : -1;
    if (previousIndex === nextIndex) return;
    // Three.js 0.171 WebGLAttributes honours addUpdateRange(start, count)
    // as gl.bufferSubData; preserve pending ranges across quick selections.
    if (previousIndex >= 0) {
      flags.setX(previousIndex, 0);
      flags.addUpdateRange(previousIndex, 1);
    }
    if (nextIndex >= 0) {
      flags.setX(nextIndex, 1);
      flags.addUpdateRange(nextIndex, 1);
    }
    flags.needsUpdate = true;
    geometry.userData.selectedIndex = nextIndex;
  }, [geometry, selectedId]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("satellitePerf") !== "1") return;
    window.dispatchEvent(new CustomEvent("cupola:satellite-fleet", { detail: {
      count: visible.length,
      buildMs: Math.round(Number(geometry.userData.buildMs) * 10) / 10,
      bufferMiB: Math.round(Number(geometry.userData.instanceBufferBytes) / 1048576 * 100) / 100,
      // This is ONE instanced draw call for the whole group.
      fleetDrawCalls: visible.length ? 1 : 0,
    }}));
  }, [geometry, visible.length]);

  useEffect(() => { readyNotified.current = false; return () => geometry.dispose(); }, [geometry]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uNowSeconds: { value: 0 },
      uGlobeCenter: { value: GLOBE_CENTER.clone() },
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

  const findSatelliteAtPointer = useCallback((clientX:number,clientY:number)=>{
    if(!enabled || !visible.length)return null;
    const rect=gl.domElement.getBoundingClientRect();
    const ndc=new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1);
    const caster=new THREE.Raycaster();caster.setFromCamera(ndc,camera);
    const {origin,direction}=caster.ray;
    const perspective=camera as THREE.PerspectiveCamera;
    const fov=THREE.MathUtils.degToRad(perspective.isPerspectiveCamera?perspective.fov:41);
    const starts=(geometry.getAttribute("instanceStart") as THREE.InstancedBufferAttribute).array as Float32Array;
    const ends=(geometry.getAttribute("instanceEnd") as THREE.InstancedBufferAttribute).array as Float32Array;
    const ms=(geometry.getAttribute("instanceMotionStart") as THREE.InstancedBufferAttribute).array as Float32Array;
    const now=(Date.now()-Number(geometry.userData.motionReferenceMs))/1000;
    const cx=GLOBE_CENTER.x,cy=GLOBE_CENTER.y,cz=GLOBE_CENTER.z;
    const rx=origin.x-cx,ry=origin.y-cy,rz=origin.z-cz;
    const b=rx*direction.x+ry*direction.y+rz*direction.z;
    const disc=b*b-(rx*rx+ry*ry+rz*rz-GLOBE_RADIUS*GLOBE_RADIUS);
    const earthEntry=disc>=0?-b-Math.sqrt(disc):Infinity;
    const pxFactor=2*Math.tan(fov/2)/Math.max(1,size.height);
    let closest=121,chosen=-1;
    // Same radial interpolation as GPU; no per-satellite Vector3 allocations.
    for(let k=0;k<visible.length;k++){
      const j=k*3,ax=starts[j]-cx,ay=starts[j+1]-cy,az=starts[j+2]-cz;
      const bx=ends[j]-cx,by=ends[j+1]-cy,bz=ends[j+2]-cz;
      const ra=Math.hypot(ax,ay,az),rb=Math.hypot(bx,by,bz);
      if(ra<1e-7||rb<1e-7)continue;
      const t=Math.max(0,Math.min(1,(now-ms[k])/180));
      const vx=ax/ra*(1-t)+bx/rb*t,vy=ay/ra*(1-t)+by/rb*t,vz=az/ra*(1-t)+bz/rb*t;
      const norm=Math.hypot(vx,vy,vz);if(norm<1e-7)continue;
      const radius=ra+(rb-ra)*t;
      const x=cx+vx/norm*radius-origin.x;
      const y=cy+vy/norm*radius-origin.y;
      const zz=cz+vz/norm*radius-origin.z;
      const along=x*direction.x+y*direction.y+zz*direction.z;
      if(along<=0||(earthEntry>0&&earthEntry<along-0.0001))continue;
      const missSq=Math.max(0,x*x+y*y+zz*zz-along*along);
      const pixelScale=Math.max(pxFactor*along,0.000001);
      const pixels=missSq/(pixelScale*pixelScale);
      if(pixels<closest){closest=pixels;chosen=k;}
    }
    return chosen>=0?{satellite:visible[chosen],index:chosen}:null;
  },[camera,gl,size.height,visible,geometry,enabled]);

  useEffect(() => {
    const element = gl.domElement;
    if (!enabled) { element.style.cursor = ""; return; }

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
  }, [findSatelliteAtPointer, gl, onSelect, enabled]);

  useFrame(() => {
    if (!enabled || !materialRef.current || !visible.length) return;
    if (!readyNotified.current) {
      readyNotified.current = true;
      // The callback executes after a populated scene frame has been scheduled.
      // Do not show 100% for a hidden mesh or a stale toggling generation.
      firstFrameTicket.current = window.requestAnimationFrame(() => onReady?.());
    }
    const referenceMs = Number(geometry.userData.motionReferenceMs);
    materialRef.current.uniforms.uNowSeconds.value =
      (Date.now() - referenceMs) / 1000;
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

type SatellitePerformanceReading = Omit<
  Partial<SatelliteFrameStats>, "fps" | "p95FrameMs" | "worstFrameMs"
> & {
  fps?: number | null;
  p95FrameMs?: number | null;
  worstFrameMs?: number | null;
  phase?: "warming" | "measuring" | "measured" | "paused";
  count?: number;
  buildMs?: number;
  bufferMiB?: number;
  fleetDrawCalls?: number;
  renderer?: string;
  rendererIsSoftware?: boolean;
};

// All diagnostic sampling is opt-in: ?satellitePerf=1. Its measurements
// reflect the VISITOR'S renderer, not GitHub Actions / SwiftShader hardware.
// Local-only diagnostic; never sample the inactive-tab RAF suspension or
// transition frames just after focus/layer changes. Genuine stalls while the
// page is visible and focused REMAIN included in the statistics.
const SATELLITE_PERF_SETTLE_MS = 1600;
const SATELLITE_PERF_WINDOW_MS = 8000;
type SatelliteProbeState = {
  previous: number; elapsed: number; intervals: number[];
  readyAt: number; phase: "warming" | "measuring" | "paused";
};

function SatellitePerformanceProbe({ count }: { count: number }) {
  const { gl } = useThree();
  const sample = useRef<SatelliteProbeState>({
    previous: 0, elapsed: 0, intervals: [], readyAt: 0, phase: "warming",
  });
  const active = useRef(true);
  const renderer = useRef<{ name: string; software: boolean } | null>(null);

  useEffect(() => {
    const notify = (phase: SatelliteProbeState["phase"]) => {
      window.dispatchEvent(new CustomEvent("cupola:satellite-frame", { detail: {
        fps: null, p95FrameMs: null, worstFrameMs: null,
        frames: 0, sampleSeconds: 0, phase,
      }}));
    };
    const reset = (phase: SatelliteProbeState["phase"]) => {
      sample.current = {
        previous: 0, elapsed: 0, intervals: [],
        readyAt: performance.now() + SATELLITE_PERF_SETTLE_MS, phase,
      };
      notify(phase);
    };
    const pause = () => { active.current = false; reset("paused"); };
    const resume = () => {
      active.current = document.visibilityState === "visible" && document.hasFocus();
      reset(active.current ? "warming" : "paused");
    };
    const visibility = () => {
      if (document.visibilityState === "visible") resume();
      else pause();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", resume);
    window.addEventListener("blur", pause);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", resume);
    resume();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", resume);
      window.removeEventListener("blur", pause);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", resume);
    };
  }, []);

  useFrame(() => {
    if (!active.current || document.visibilityState !== "visible") return;
    const now = performance.now();
    const current = sample.current;
    if (now < current.readyAt) return;
    if (current.phase !== "measuring") {
      current.phase = "measuring";
      window.dispatchEvent(new CustomEvent("cupola:satellite-frame", {
        detail: { phase: "measuring" },
      }));
    }
    if (!current.previous) { current.previous = now; return; }
    const delta = now - current.previous;
    current.previous = now;
    // A rare huge interval is still a real missed frame if visible/focused.
    if (!(delta > 0 && delta < 60_000)) return;
    current.intervals.push(delta);
    current.elapsed += delta;
    if (current.elapsed < SATELLITE_PERF_WINDOW_MS) return;

    if (!renderer.current) {
      const context = gl.getContext();
      const debugExtension = context.getExtension("WEBGL_debug_renderer_info");
      const name = debugExtension
        ? String(context.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL))
        : "Browser renderer undisclosed";
      renderer.current = { name, software: /swiftshader|llvmpipe|software|warp/i.test(name) };
    }
    const stats = satelliteFrameStats(current.intervals);
    if (stats) {
      window.dispatchEvent(new CustomEvent("cupola:satellite-frame", { detail: {
        ...stats, count, phase: "measured",
        renderer: renderer.current.name,
        rendererIsSoftware: renderer.current.software,
      }}));
    }
    sample.current = {
      previous: now, elapsed: 0, intervals: [], readyAt: 0, phase: "measuring",
    };
  });
  return null;
}

// The HUD owns its updates. Sending frame statistics through the root
// CupolaExperience state previously re-rendered the ENTIRE scene every 2.5 s,
// contaminating the very FPS measurement we were trying to observe.
function SatellitePerformanceHud({
  count, satellitesOn, cloudsOn, mode,
}: {
  count: number; satellitesOn: boolean; cloudsOn: boolean; mode: ExperienceMode;
}) {
  const [reading, setReading] = useState<SatellitePerformanceReading>({
    fps: null, phase: "warming",
  });
  useEffect(() => {
    const onFrame = (event: Event) => {
      const detail = (event as CustomEvent<SatellitePerformanceReading>).detail;
      if (detail) setReading(current => ({ ...current, ...detail }));
    };
    window.addEventListener("cupola:satellite-frame", onFrame);
    window.addEventListener("cupola:satellite-fleet", onFrame);
    return () => {
      window.removeEventListener("cupola:satellite-frame", onFrame);
      window.removeEventListener("cupola:satellite-fleet", onFrame);
    };
  }, []);
  const phase = reading.phase === "paused" ? "PAUSED / TAB INACTIVE" :
    reading.phase === "warming" ? "WARMING AFTER CHANGE" :
    reading.phase === "measuring" && reading.fps === null ? "MEASURING (8 S)" :
    "8 S SAMPLE";
  return (
    <aside data-satellite-perf="enabled" aria-label="Local satellite renderer performance"
      style={{
        position: "absolute", top: 80, right: 16, zIndex: 60,
        background: "rgba(3, 9, 17, 0.88)", color: "#e6f6ff",
        border: "1px solid rgba(95, 179, 235, 0.33)",
        borderRadius: 10, padding: "12px 14px", minWidth: 220,
        font: "12px/1.6 monospace", pointerEvents: "none",
      }}>
      <strong>LOCAL SATELLITE PERFORMANCE</strong>
      <div data-satellite-perf-state>{satellitesOn ? "SATELLITES ON" : "SATELLITES OFF"}
        {" · "}{cloudsOn ? "CLOUDS ON" : "CLOUDS OFF"}{" · "}{mode}</div>
      <div data-satellite-perf-phase>{phase}</div>
      <div data-satellite-perf-fps>{reading.fps ?? "Sampling"} FPS</div>
      <div data-satellite-perf-p95>P95 frame: {reading.p95FrameMs ?? "—"} ms</div>
      <div>Worst frame: {reading.worstFrameMs ?? "—"} ms</div>
      <div>Fleet: {satellitesOn ? count : 0} objects · {satellitesOn ? reading.fleetDrawCalls ?? "—" : 0} instanced draw call</div>
      <div>Last fleet build: {reading.buildMs ?? "—"} ms · {reading.bufferMiB ?? "—"} MiB attribute buffers</div>
      <div>Renderer: {reading.rendererIsSoftware ? "SOFTWARE" : "BROWSER-REPORTED / UNVERIFIED"}</div>
      <small style={{ opacity: 0.7 }}>Only visible, focused, settled frames. FPS is not GPU time.</small>
    </aside>
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
  const radial = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const orientation = useMemo(() => new THREE.Quaternion(), []);
  const spinRotation = useMemo(() => new THREE.Quaternion(), []);
  const spin = useMemo(() =>
    ((Number(satellite.id) || 17) % 360) * Math.PI / 180, [satellite.id]);
  const initialPoint = useMemo(
    () => satelliteInterpolatedWorldPoint(satellite),
    [satellite],
  );

  const bodyColor = "#263746";
  const panelColor = "#0c2234";

  useFrame(() => {
    if (!groupRef.current) return;

    const point = satelliteInterpolatedWorldPoint(satellite);
    groupRef.current.position.copy(point);

    radial.copy(point).sub(GLOBE_CENTER).normalize();
    orientation.setFromUnitVectors(up, radial);
    spinRotation.setFromAxisAngle(radial, spin);
    groupRef.current.quaternion.copy(orientation).multiply(spinRotation);
  });

  return (
    <group
      ref={groupRef}
      position={initialPoint}
      scale={0.78}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(satellite);
      }}
    >
      <mesh renderOrder={18}>
        <boxGeometry args={[0.036, 0.052, 0.032]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.82}
          roughness={0.20}
          emissive="#1b6f9e"
          emissiveIntensity={0.20}
        />
      </mesh>

      <mesh position={[-0.064, 0, 0]} renderOrder={18}>
        <boxGeometry args={[0.090, 0.0045, 0.040]} />
        <meshStandardMaterial
          color={panelColor}
          metalness={0.48}
          roughness={0.32}
          emissive="#0b4f76"
          emissiveIntensity={0.16}
        />
      </mesh>

      <mesh position={[0.064, 0, 0]} renderOrder={18}>
        <boxGeometry args={[0.090, 0.0045, 0.040]} />
        <meshStandardMaterial
          color={panelColor}
          metalness={0.48}
          roughness={0.32}
          emissive="#0b4f76"
          emissiveIntensity={0.16}
        />
      </mesh>

      <mesh position={[0, 0.040, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={19}>
        <cylinderGeometry args={[0.012, 0.006, 0.022, 12]} />
        <meshStandardMaterial
          color="#9fc7d8"
          metalness={0.78}
          roughness={0.18}
          emissive="#2aaeff"
          emissiveIntensity={0.22}
        />
      </mesh>

      <mesh scale={1.85} renderOrder={17}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial
          color="#159bff"
          transparent
          opacity={0.055}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}


function SatelliteLayer({
  satellites,
  selectedId,
  onSelect,
  onReady,
  enabled,
  generation,
}: {
  satellites: LiveSatellite[];
  selectedId: string | null;
  onSelect: (satellite: LiveSatellite) => void;
  onReady?: () => void;
  enabled: boolean;
  generation: number;
}) {
  const visibleSatellites = useMemo(() => satellites.slice(0, 20000), [satellites]);
  const selected = visibleSatellites.find((satellite) => satellite.id === selectedId) ?? null;

  return (
    <group visible={enabled}>
      {selected && <SatelliteTrack satellite={selected} />}

      <SatelliteFleet
        satellites={visibleSatellites}
        selectedId={selectedId}
        onSelect={onSelect}
        onReady={onReady}
        enabled={enabled}
        generation={generation}
      />

      {selected && (
        <SelectedSatelliteMarker satellite={selected} onSelect={onSelect} />
      )}
    </group>
  );
}


function StableBloomEffect({ mode, view }: { mode: ExperienceMode; view: ViewMode }) {
  const camera = useThree((state) => state.camera);
  const smoothProximity = useRef(0);
  const solarSmooth = useRef({ visibility: 0, gaze: 0 });
  const sunWorld = useMemo(() => new THREE.Vector3(), []);
  const sunClip = useMemo(() => new THREE.Vector3(), []);
  const sunToCamera = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const effect = useMemo(() => new Effect("CupolaSinglePassBloom", `
    uniform float glowStrength;
    uniform float glowThreshold;
    // Bloom-only, close-range enhancement. No procedural or geometric
    // atmosphere is drawn: all glow comes from actual rendered pixels.
    uniform float closeHorizon;
    // Solar lens response reuses this very same postprocess pass.
    // Its center is the physically projected Sun and intensity is zero
    // behind Earth or behind the camera. Earth/cloud shaders are unchanged.
    uniform vec2 solarCenter;
    uniform float solarVisible;
    uniform float solarGaze;
    uniform float solarAspect;

    vec3 cupolaBrightSample(in vec2 uv) {
      vec3 hdrColor = max(texture2D(inputBuffer, clamp(uv, vec2(0.0), vec2(1.0))).rgb, vec3(0.0));
      // Match the original Bloom's *luminance* gate instead of testing the
      // brightest RGB channel. Saturated cobalt atmosphere stays clean.
      float luma = dot(hdrColor, vec3(0.2126, 0.7152, 0.0722));
      float mask = smoothstep(glowThreshold, glowThreshold + 0.42, luma);
      return min(hdrColor, vec3(2.0)) * mask;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
      // The 2/9/28px ring sampler produced three visible echo contours on
      // the high-contrast atmosphere. A normalized 2D Gaussian samples a
      // *continuous local neighbourhood*, so there are no discrete halos.
      // Render the original scene color as-is; add only restrained glow.
      vec3 weightedGlow = vec3(0.0);
      float totalWeight = 0.0;
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          vec2 cell = vec2(float(x), float(y));
          float weight = exp(-dot(cell, cell) * 0.45);
          vec2 sampleUv = uv + cell * texelSize * 2.0;
          weightedGlow += cupolaBrightSample(sampleUv) * weight;
          totalWeight += weight;
        }
      }

      vec3 halo = weightedGlow / max(totalWeight, 0.0001);
      // Close zoom: softly broaden ONLY *existing* luminous pixels.
      // The previous analytic sphere profile invented a bright silhouette
      // even when the real atmosphere was out of view, causing an arc that
      // floated over Earth during follow-camera rotation.
      // This image-space Gaussian cannot draw an independent orbit/halo:
      // pixels further than 24px from original bright scene receive zero.
      vec3 closeGlow = vec3(0.0);
      if (closeHorizon > 0.001) {
        float broadWeight = 0.0;
        for (int y = -3; y <= 3; y++) {
          for (int x = -3; x <= 3; x++) {
            vec2 cell = vec2(float(x), float(y));
            float weight = exp(-dot(cell, cell) * 0.30);
            vec2 sampleUv = uv + cell * texelSize * 8.0;
            // Use the already-rendered Earth/atmosphere as the ONLY source.
            // No synthetic colors, new meshes, or camera-space limb rays.
            closeGlow += cupolaBrightSample(sampleUv) * weight;
            broadWeight += weight;
          }
        }
        closeGlow *= (0.65 * closeHorizon) / max(broadWeight, 0.0001);
      }
      // Wide, smooth sensor glare around the *visible* solar disc.
      // Unlike the global 24px bloom, this is independent of resolution
      // and scales to fill the optical field without bleeding at Earth's rim.
      vec2 deltaSolar = (uv - solarCenter) * vec2(solarAspect, 1.0);
      float rSolar = length(deltaSolar);
      float core = exp(-rSolar * rSolar * 85.0);
      float scatter = exp(-rSolar * 10.0);
      float veil = exp(-rSolar * rSolar * 8.0);
      // Small diffraction streaks are an optional camera artifact,
      // not geometric light rays painted into the space vacuum.
      float streaks = (exp(-abs(deltaSolar.x) * 95.0) +
                       exp(-abs(deltaSolar.y) * 95.0)) * exp(-rSolar * 7.5);
      float optical = solarVisible *
         (core * (1.35 + 1.75 * solarGaze) +
          scatter * (0.5 + 0.65 * solarGaze) +
          streaks * 0.26 * solarGaze);
      float washed = solarVisible * solarGaze * veil * 0.24;
      vec3 softWhite = vec3(1.0, 0.965, 0.88);
      // Perceptual adaptation makes the glare dominant without darkening
      // other parts of the Earth in views with no visible Sun.
      vec3 cameraResponse = inputColor.rgb * (1.0 - 0.15 * solarVisible * solarGaze);
      vec3 solarGlare = softWhite * optical + vec3(washed);
      outputColor = vec4(cameraResponse + halo * glowStrength +
                         closeGlow + solarGlare, inputColor.a);
    }
  `, {
    blendFunction: BlendFunction.NORMAL,
    attributes: EffectAttribute.CONVOLUTION,
    uniforms: new Map<string, THREE.Uniform<number | THREE.Vector2>>([
      ["glowStrength", new THREE.Uniform(0.44)],
      ["glowThreshold", new THREE.Uniform(0.98)],
      ["closeHorizon", new THREE.Uniform(0)],
      ["solarCenter", new THREE.Uniform(new THREE.Vector2(-5, -5))],
      ["solarVisible", new THREE.Uniform(0)],
      ["solarGaze", new THREE.Uniform(0)],
      ["solarAspect", new THREE.Uniform(1)],
    ]),
  }), []);

  useEffect(() => {
    const strength = effect.uniforms.get("glowStrength");
    // Bloom around a distant Earth must not smear through the Moon's limb.
    // Solar core/corona remains independently driven by geometric occlusion.
    if (strength) strength.value = view==="MOON" || view==="MOON ORBIT"
      ? 0.10 : (mode === "CINEMA" ? 0.48 : 0.44);
  }, [effect, mode, view]);

  useFrame((_state, delta) => {
    // Original HERO and full-globe camera positions are outside this range.
    // Ease in only close to Earth; leave standard Single-Pass unchanged.
    const radius = camera.position.distanceTo(GLOBE_CENTER);
    const raw = THREE.MathUtils.clamp((7.4 - radius) / (7.4 - 5.3), 0, 1);
    const target = raw * raw * (3 - 2 * raw);
    smoothProximity.current = THREE.MathUtils.damp(
      smoothProximity.current, target, 6, Math.min(delta, 0.05),
    );
    const strength = effect.uniforms.get("closeHorizon");
    if (strength) strength.value = smoothProximity.current;

    sunWorld.copy(camera.position).addScaledVector(getSunDirection(new Date()), SUN_PROXY_SCENE_DISTANCE);
    sunClip.copy(sunWorld).project(camera);
    sunToCamera.copy(sunWorld).sub(camera.position).normalize();
    camera.getWorldDirection(cameraForward);
    const facing = sunToCamera.dot(cameraForward);
    const inFront = facing > 0.05 && sunClip.z >= -1 && sunClip.z <= 1;
    const nearScreen = Math.abs(sunClip.x) <= 1.30 && Math.abs(sunClip.y) <= 1.30;
    const limbVisible = inFront && nearScreen
      ? solarLensVisibility(camera.position, sunWorld, GLOBE_CENTER, GLOBE_RADIUS + 0.05)
      : 0;
    const screenFade = Math.min(1,
      Math.max(0, (1.30 - Math.max(Math.abs(sunClip.x), Math.abs(sunClip.y))) / 0.35));
    // Suppress glare during a geometric lunar eclipse in the OBSERVER frame.
    // Analytical preview only: source timestamps are not DE440/TDB contacts.
    const observerLocal=camera.position.clone().sub(GLOBE_CENTER)
      .applyEuler(new THREE.Euler(-GLOBE_ROTATION.x,-GLOBE_ROTATION.y,-GLOBE_ROTATION.z,"ZYX"))
      .multiplyScalar(6371/GLOBE_RADIUS);
    const eclipse=eclipseAt(getCelestial(new Date()),observerLocal);
    // The old bloom path always sampled the 4× Moon even when the actual
    // Moon mesh was at its true distance in the Earth-telescope camera.
    // Solar glow must be occluded by the EXACT position used for the mesh.
    // Do not mix physical eclipse timing with an artistically shortened orbit.
    const lunarTransmission=view==="MOON FROM EARTH"
      ? 1-0.995*eclipse.obscuration : 1;
    const moonRendered=moonRenderWorldPosition(new Date(),camera.position,
      MOON_CINEMATIC_DISTANCE_FACTOR,view==="MOON FROM EARTH");
    const moonSunMask=moonSunVisibility(camera.position,moonRendered,
      kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS),sunToCamera);
    const targetVisible = limbVisible * screenFade * lunarTransmission * moonSunMask;
    const targetGaze = THREE.MathUtils.smoothstep(facing, 0.955, 0.997);
    // A Moon transit must extinguish solar bloom immediately, not linger
    // as a ghost behind the opaque lunar disc during camera orbit.
    solarSmooth.current.visibility = targetVisible < solarSmooth.current.visibility
      ? targetVisible
      : THREE.MathUtils.damp(solarSmooth.current.visibility, targetVisible, 7, Math.min(delta, 0.05));
    solarSmooth.current.gaze = THREE.MathUtils.damp(
      solarSmooth.current.gaze, targetGaze, 4.5, Math.min(delta, 0.05));
    const positionUniform = effect.uniforms.get("solarCenter");
    if (positionUniform) (positionUniform.value as THREE.Vector2)
      .set((sunClip.x + 1) / 2, (sunClip.y + 1) / 2);
    const visibilityUniform = effect.uniforms.get("solarVisible");
    if (visibilityUniform) visibilityUniform.value = solarSmooth.current.visibility;
    const gazeUniform = effect.uniforms.get("solarGaze");
    if (gazeUniform) gazeUniform.value = solarSmooth.current.gaze;
    const aspectUniform = effect.uniforms.get("solarAspect");
    if (aspectUniform) aspectUniform.value = camera instanceof THREE.PerspectiveCamera
      ? camera.aspect : 1;
  });

  useEffect(() => () => { effect.dispose(); }, [effect]);
  return <primitive object={effect} dispose={null} />;
}

/**
 * The Galactic North Pole is RA 192.85948°, Dec +27.12825° (J2000).
 * Rotate right ascension by Greenwich mean sidereal time into our globe's
 * Earth-fixed frame. Updated once/minute, not every animation frame.
 */
function greenwichSiderealDegrees(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const centuries = d / 36525;
  return 280.46061837 + 360.98564736629 * d +
    0.000387933 * centuries * centuries - centuries * centuries * centuries / 38710000;
}
function galacticPoleNow(date: Date) {
  return globeWorldNormal(27.12825, 192.85948 - greenwichSiderealDegrees(date));
}
function galacticCenterNow(date: Date) {
  // IAU J2000 Galactic Center approximation: RA 266.4051°, Dec -28.936175°.
  return globeWorldNormal(-28.936175, 266.4051 - greenwichSiderealDegrees(date));
}

/** Smooth dust lanes; always behind the opaque Earth in the actual depth buffer. */
// A camera-centred background has no false parallax in the lunar view.
const DEEP_SKY_SHELL_RADIUS=910;
const DEEP_SKY_STARS_RADIUS=895;
function MilkyWayBackdrop({ cinematic }: { cinematic: boolean }) {
  const skyMesh=useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    galacticPole: { value: galacticPoleNow(new Date()) },
    galacticCenter: { value: galacticCenterNow(new Date()) },
    intensity: { value: cinematic ? 0.074 : 0.055 },
  }), []);
  const lastUpdated = useRef(-60);
  useEffect(() => {
    uniforms.intensity.value = cinematic ? 0.074 : 0.055;
  }, [cinematic, uniforms]);
  useFrame(({ clock, camera }) => {
    skyMesh.current?.position.copy(camera.position);
    if (clock.elapsedTime - lastUpdated.current < 60) return;
    lastUpdated.current = clock.elapsedTime;
    const date = new Date();
    uniforms.galacticPole.value.copy(galacticPoleNow(date));
    uniforms.galacticCenter.value.copy(galacticCenterNow(date));
  });
  return (
    <mesh ref={skyMesh} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[DEEP_SKY_SHELL_RADIUS, 48, 24]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={MILKY_WAY_VERTEX_SHADER}
        fragmentShader={MILKY_WAY_FRAGMENT_SHADER}
        side={THREE.BackSide}
        transparent
        depthTest={true}
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Authenticated ESA/Gaia EDR3 all-sky survey image, projected in Galactic l/b.
 *  Loaded once from our own Worker/CDN; retain the old procedural backdrop only
 *  on a real image load failure (never combine both galaxy clouds). */
function GaiaSkyBackdrop({ cinematic }: { cinematic: boolean }) {
  const skyMesh=useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    new THREE.TextureLoader().load(
      "/sky/gaia-edr3-equirect.webp",
      image => {
        image.colorSpace = THREE.SRGBColorSpace;
        image.wrapS = THREE.RepeatWrapping;
        image.wrapT = THREE.ClampToEdgeWrapping;
        image.minFilter = THREE.LinearMipmapLinearFilter;
        image.magFilter = THREE.LinearFilter;
        image.generateMipmaps = true;
        image.anisotropy = 2;
        image.needsUpdate = true;
        if (!active) { image.dispose(); return; }
        setTexture(image);
      },
      undefined,
      () => { if (active) setLoadFailed(true); },
    );
    return () => { active = false; };
  }, []);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  const uniforms = useMemo(() => ({
    gaiaSkyMap: { value: texture },
    galacticPole: { value: galacticPoleNow(new Date()) },
    galacticCenter: { value: galacticCenterNow(new Date()) },
    intensity: { value: cinematic ? 0.115 : 0.16 },
  }), [texture]);
  useEffect(() => {
    uniforms.intensity.value = cinematic ? 0.115 : 0.16;
  }, [cinematic, uniforms]);
  const lastUpdated = useRef(-60);
  useFrame(({ clock, camera }) => {
    skyMesh.current?.position.copy(camera.position);
    if (clock.elapsedTime - lastUpdated.current < 60) return;
    lastUpdated.current = clock.elapsedTime;
    const date = new Date();
    uniforms.galacticPole.value.copy(galacticPoleNow(date));
    uniforms.galacticCenter.value.copy(galacticCenterNow(date));
  });
  if (!texture) {
    return loadFailed ? <MilkyWayBackdrop cinematic={cinematic} /> : null;
  }
  return (
    <mesh ref={skyMesh} renderOrder={-10} frustumCulled={false}
      name="gaia-edr3-observed-sky">
      <sphereGeometry args={[DEEP_SKY_SHELL_RADIUS, 64, 32]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={GAIA_SKY_VERTEX_SHADER}
        fragmentShader={GAIA_SKY_FRAGMENT_SHADER}
        side={THREE.BackSide}
        transparent
        depthTest={true}
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** One GPU points draw call: brighter artistic foreground points, not Gaia IDs. */
function CelestialStarField({ cinematic }: { cinematic: boolean }) {
  const { gl } = useThree();
  const starPointsRef = useRef<THREE.Points>(null);
  const siderealReference = useMemo(() => greenwichSiderealDegrees(new Date()), []);
  const northAxis = useMemo(() => globeWorldNormal(90, 0), []);
  const geometry = useMemo(() => {
    const total = 5200;
    const positions = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const luminances = new Float32Array(total);
    const temperatures = new Float32Array(total);
    let seed = 0x6a09e667;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    const pole = galacticPoleNow(new Date()).normalize();
    const east = new THREE.Vector3(1, 0, 0).cross(pole).normalize();
    const north = new THREE.Vector3().crossVectors(pole, east).normalize();
    for (let index = 0; index < total; index++) {
      const phi = random() * Math.PI * 2;
      let direction: THREE.Vector3;
      if (index % 4 === 0) {
        // A denser but subtle population near the galactic plane.
        const latitude = (random() + random() - 1) * 0.21;
        direction = east.clone().multiplyScalar(Math.cos(phi) * Math.cos(latitude))
          .addScaledVector(north, Math.sin(phi) * Math.cos(latitude))
          .addScaledVector(pole, Math.sin(latitude));
      } else {
        const z = random() * 2 - 1;
        const xy = Math.sqrt(Math.max(0, 1 - z * z));
        direction = new THREE.Vector3(xy * Math.cos(phi), z, xy * Math.sin(phi));
      }
      direction.normalize().multiplyScalar(DEEP_SKY_STARS_RADIUS);
      direction.toArray(positions, index * 3);
      // Three restrained magnitude tiers: mostly pinpoint stars, some
      // visually readable mid-magnitudes and rare luminous anchors.
      const bright = index % 89 === 0;
      const medium = !bright && index % 11 === 0;
      sizes[index] = bright ? 4.1 + 1.4 * random()
        : medium ? 2.7 + 0.8 * random() : 1.75 + 1.45 * random();
      luminances[index] = bright ? 0.94 + 0.06 * random()
        : medium ? 0.66 + 0.22 * random()
        : 0.35 + Math.pow(random(), 1.3) * 0.40;
      temperatures[index] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("starSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("starLuminance", new THREE.BufferAttribute(luminances, 1));
    geometry.setAttribute("starTemperature", new THREE.BufferAttribute(temperatures, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(() => ({
    intensity: { value: cinematic ? 1.13 : 0.96 },
    pixelRatio: { value: gl.getPixelRatio() },
  }), [gl]);
  useEffect(() => { uniforms.intensity.value = cinematic ? 1.13 : 0.96; }, [cinematic, uniforms]);
  const lastStarUpdate = useRef(-60);
  useFrame(({ camera, clock }) => {
    starPointsRef.current?.position.copy(camera.position);
    if (clock.elapsedTime - lastStarUpdate.current < 60) return;
    lastStarUpdate.current = clock.elapsedTime;
    const degrees = greenwichSiderealDegrees(new Date()) - siderealReference;
    starPointsRef.current?.quaternion.setFromAxisAngle(northAxis, -THREE.MathUtils.degToRad(degrees));
  });
  return (
    <points ref={starPointsRef} geometry={geometry} renderOrder={-9} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={CELESTIAL_STAR_VERTEX_SHADER}
        fragmentShader={CELESTIAL_STAR_FRAGMENT_SHADER}
        transparent
        depthTest={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function Scene(props: { moonDistanceFactor: MoonDistanceFactor; cloudEngine: CloudEngine; cloudDebugMode: CloudDebugMode; satelliteSurface: boolean; onSurfaceApplied?: (stats:FusionStats|null)=>void; layers: { clouds: boolean; cityLights: boolean; aurora: boolean; precipitation: boolean; earthquakes: boolean; storms: boolean; lightning: boolean; wildfires: boolean; volcanoes: boolean; satellites: boolean }; mode: ExperienceMode; view: ViewMode; marker?: { lat: number; lon: number } | null; focusTarget?: { lat: number; lon: number } | null; qaWideAngle?: boolean; iss?: IssData | null; followIss: boolean; followSunrise: boolean; followSatellite: boolean; satellites: LiveSatellite[]; selectedSatelliteId: string | null; onSelectSatellite: (satellite: LiveSatellite) => void; onSelectEarthEvent?: (event: DiscoveryEvent) => void; onStopFollowIss?: () => void; onStopFollowSunrise?: () => void; onStopFollowSatellite?: () => void; windSpeed?: number | null; temperature?: number | null; pressure?: number | null; snowfall?: number | null; weatherLayer?: WeatherLayer | null; earthquakes: EarthquakeEvent[]; auroraPoints: AuroraPoint[]; kp: number; storms: TropicalStorm[]; wildfires: WildfireHotspot[]; volcanoes: VolcanoEvent[]; lightningModelPoints: LightningModelPoint[]; showLightningModel: boolean; showStormForecast: boolean; onLightningTelemetry?: (telemetry: ObservedLightningTelemetry) => void }) {
  const preset = props.mode === "CINEMA" ? { ...CINEMA_PRESET, exposure: 1.06, bloomIntensity: 0.18, bloomThreshold: 0.97 } : LIVE_PRESET;
  const controls = useRef<any>(null);
  // Track the moving astronomical Moon without leaving a lunar camera behind
  // in Earth-fixed coordinates when the ephemeris updates every ten seconds.
  const moonCameraAnchor=useRef<THREE.Vector3|null>(null);
  const earthTelescopeAnchor=useRef<{moon:THREE.Vector3;camera:THREE.Vector3}|null>(null);
  const moonObserverMarker=useRef<{lat:number;lon:number}|null>(null);
  const moonCameraUpAnchor=useRef<THREE.Vector3|null>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const { camera, size, gl } = useThree();
  const flyTarget = useRef<THREE.Vector3 | null>(null);
  const previousSatelliteFollowTarget = useRef<THREE.Vector3 | null>(null);
  const wasFollowingSatellite = useRef(props.followSatellite);
  const satelliteLocalExit = useRef<{
    active: boolean;
    elapsed: number;
    duration: number;
    startCamera: THREE.Vector3 | null;
    startTarget: THREE.Vector3 | null;
    endCamera: THREE.Vector3 | null;
    endTarget: THREE.Vector3 | null;
  }>({
    active: false,
    elapsed: 0,
    duration: 1.85,
    startCamera: null,
    startTarget: null,
    endCamera: null,
    endTarget: null,
  });
  const satelliteOrbitEntry = useRef<{
    active: boolean;
    elapsed: number;
    duration: number;
    startDirection: THREE.Vector3 | null;
    startRadius: number;
    startTarget: THREE.Vector3 | null;
  }>({
    active: false,
    elapsed: 0,
    duration: 2.4,
    startDirection: null,
    startRadius: 0,
    startTarget: null,
  });
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
    perspective.near = 0.1;
    perspective.far = 960;
    perspective.fov =
      props.view === "MOON" ? 41 :
      props.view === "MOON FROM EARTH" ? 1.6 :
      props.view === "MOON ORBIT" ? 6.5 :
      props.view === "ISS CUPOLA" && props.mode === "CINEMA" ? 30 : 41;
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height, props.view, props.mode, props.followSatellite]);

  useEffect(() => {
    if (!controls.current || props.followSatellite || satelliteLocalExit.current.active) return;
    const camera = controls.current.object as THREE.PerspectiveCamera;
    moonCameraAnchor.current=null;
    earthTelescopeAnchor.current=null;
    moonCameraUpAnchor.current=null;
    camera.up.set(0,1,0);
    let lunarPresetTarget:THREE.Vector3|null=null;

    if (props.view === "GEOSTATIONARY") camera.position.set(0.32, 0.20, 8.75);
    if (props.view === "ISS CUPOLA") camera.position.copy(props.mode === "CINEMA" ? CINEMA_CAMERA : HERO_CAMERA);
    // L1-facing preview uses the real Sun–Earth line, with a deliberately
    // closer cinematic distance rather than claiming a 1.5-million-km orbit.
    if (props.view === "MOON") {
      // Centred Moon orbit is the default, not a forced horizon/Earthrise.
      const orbit=centeredMoonOrbitFrame(new Date(),props.moonDistanceFactor);
      camera.position.copy(orbit.position);
      lunarPresetTarget=orbit.target;
      moonCameraAnchor.current=orbit.lunarCenter.clone();
    }
    if (props.view === "MOON ORBIT") {
      // A genuine 280 km lunar orbit over the Earth-facing illuminated limb:
      // NOT a far-side Moon portrait with an artificially tiny Earth.
      const orbit=lunarEarthriseFrame(new Date(),"ORBIT",props.moonDistanceFactor);
      camera.position.copy(orbit.position);
      camera.up.copy(orbit.up);
      moonCameraUpAnchor.current=orbit.up.clone();
      lunarPresetTarget=orbit.target;
      moonCameraAnchor.current=orbit.lunarCenter.clone();
    }
    if (props.view === "MOON FROM EARTH") {
      // A telescope from the selected city / FIND ME observer, not the
      // sublunar Earth point. If Moon is below horizon it remains occluded.
      const observer=moonObserverFrame(new Date(),props.marker);
      camera.position.copy(observer.position);
      camera.up.copy(observer.up);
      lunarPresetTarget=observer.moon;
      moonObserverMarker.current=props.marker??null;
      earthTelescopeAnchor.current={moon:observer.moon.clone(),camera:observer.position.clone()};
    }
    if (props.view === "FREE CAMERA") camera.position.set(0.35, 0.38, 6.9);
    // Tangential solar-view approach: keep Earth's luminous edge in frame
    // with the real Sun just outside the limb; do not fake an L1 position.
    const solarDirection = getSunDirection(new Date());
    if (props.view === "SUN–EARTH L1") {
      camera.position.copy(GLOBE_CENTER).addScaledVector(solarDirection, GLOBE_RADIUS + 5.8);
    }
    const solarTangent = new THREE.Vector3(0, 1, 0).cross(solarDirection).normalize();
    const solarNormal = solarDirection.clone()
      .multiplyScalar(-Math.cos(SOLAR_VIEW_LIMB_ANGLE_RAD))
      .addScaledVector(solarTangent, Math.sin(SOLAR_VIEW_LIMB_ANGLE_RAD)).normalize();
    if (props.view === "SUN VIEW") {
      camera.position.copy(GLOBE_CENTER).addScaledVector(solarNormal, SOLAR_VIEW_CAMERA_DISTANCE);
    }

    // Compose a recognisable Earth limb WITH the Sun, rather than centering
    // a lonely white disc against empty stars. Aim about 6 degrees inward
    // from the Sun toward Earth's apparent silhouette.
    const solarLook = solarDirection.clone(); // Physical parallel rays; no solar parallax.
    const earthLook = GLOBE_CENTER.clone().sub(camera.position).normalize();
    const sunAndLimb = solarLook.clone().multiplyScalar(0.75)
      .addScaledVector(earthLook, 0.25).normalize();
    const target = props.view === "SUN VIEW"
      ? camera.position.clone().addScaledVector(sunAndLimb, 9)
      : lunarPresetTarget ?? (props.view === "ISS CUPOLA" && props.mode === "CINEMA" ? CINEMA_TARGET : HERO_TARGET);
    controls.current.target.copy(target);
    camera.lookAt(target);

    camera.near = 0.1;
    camera.fov = props.view === "MOON" ? 41 :
      props.view === "MOON FROM EARTH" ? 1.6 :
      props.view === "MOON ORBIT" ? 6.5 :
      props.view === "ISS CUPOLA" && props.mode === "CINEMA" ? 30 : 41;
    camera.updateProjectionMatrix();
    controls.current.update();
  // A new location should reposition only the Earth-side Moon telescope;
  // normal Earth marker/fly-to navigation must keep its existing behavior.
  }, [props.view, props.mode, props.moonDistanceFactor,
      props.view==="MOON FROM EARTH" ? props.marker?.lat : undefined,
      props.view==="MOON FROM EARTH" ? props.marker?.lon : undefined]);

  useEffect(() => {
    // A geolocation or Earth-event target must never override a lunar camera.
    if (props.view === "MOON" || props.view === "MOON ORBIT" || props.view === "MOON FROM EARTH") {
      flyTarget.current=null;
      return;
    }
    const focus = props.focusTarget || props.marker;
    if (!focus || !controls.current || props.view === "SUN VIEW") return;
    const normal = globeWorldNormal(focus.lat, focus.lon);
    const distance =
      props.qaWideAngle ? GLOBE_RADIUS + 7.6 :
      props.view === "ISS CUPOLA" ? GLOBE_RADIUS + 2.15 :
      props.view === "GEOSTATIONARY" ? GLOBE_RADIUS + 4.75 :
      props.view === "SUN–EARTH L1" ? GLOBE_RADIUS + 5.8 :
      GLOBE_RADIUS + 3.0;
    flyTarget.current = GLOBE_CENTER.clone().add(normal.multiplyScalar(distance));
  }, [props.focusTarget, props.marker, props.view, props.qaWideAngle]);

  useFrame((_state, delta) => {
    const followJustStopped =
      wasFollowingSatellite.current && !props.followSatellite;
    const followJustStarted =
      !wasFollowingSatellite.current && props.followSatellite;
    wasFollowingSatellite.current = props.followSatellite;

    if (followJustStarted) {
      previousSatelliteFollowTarget.current = null;
      satelliteLocalExit.current.active = false;
      satelliteOrbitEntry.current = {
        active: true,
        elapsed: 0,
        duration: 2.4,
        startDirection: null,
        startRadius: 0,
        startTarget: null,
      };
    }

    if (followJustStopped && controls.current && selectedSatellite) {
      const exitCamera = controls.current.object as THREE.PerspectiveCamera;
      const stopPoint = satelliteInterpolatedWorldPoint(selectedSatellite);
      const radial = stopPoint.clone().sub(GLOBE_CENTER).normalize();

      // Exit from the actual camera position at point C. Pull back along the
      // local orbital radial without changing viewpoint or flying to a preset.
      const startCamera = exitCamera.position.clone();
      const startTarget = controls.current.target.clone();
      const radialOffset = startCamera.clone().sub(stopPoint);
      const outward = radialOffset.lengthSq() > 0.0001
        ? radialOffset.normalize().add(radial).normalize()
        : radial;
      const endCamera = startCamera.clone().add(outward.multiplyScalar(1.65));
      // Release the orbit pivot from the moving satellite. The final pivot
      // is fixed on Earth below point C, so free orbit no longer circles
      // the satellite after STOP FOLLOWING.
      const endTarget = GLOBE_CENTER.clone().add(
        radial.clone().multiplyScalar(GLOBE_RADIUS * 0.985),
      );

      satelliteOrbitEntry.current.active = false;
      satelliteLocalExit.current = {
        active: true,
        elapsed: 0,
        duration: 1.85,
        startCamera,
        startTarget,
        endCamera,
        endTarget,
      };
      controls.current.enabled = false;
    }

    if (sunLight.current) {
      const sun = getSunDirection(new Date());
      sunLight.current.position.copy(GLOBE_CENTER).add(sun.multiplyScalar(24));
      sunLight.current.target.position.copy(GLOBE_CENTER);
      sunLight.current.target.updateMatrixWorld();
    }

    if ((props.view === "MOON" || props.view === "MOON ORBIT") && controls.current) {
      // A Moon-relative frame is required: the body moves by several render
      // units each minute in the rotating Earth-fixed frame.
      const currentMoon=moonCinematicWorldPosition(new Date(),props.moonDistanceFactor);
      const previousMoon=moonCameraAnchor.current;
      if (previousMoon && currentMoon.distanceToSquared(previousMoon)>1e-14) {
        const orbitSpin=new THREE.Quaternion().setFromUnitVectors(
          GLOBE_CENTER.clone().sub(previousMoon).normalize(),
          GLOBE_CENTER.clone().sub(currentMoon).normalize());
        const viewCamera=controls.current.object as THREE.PerspectiveCamera;
        viewCamera.position.sub(previousMoon).applyQuaternion(orbitSpin).add(currentMoon);
        controls.current.target.sub(previousMoon).applyQuaternion(orbitSpin).add(currentMoon);
        // Surface-frame roll cannot remain global Y as the Moon moves.
        if(moonCameraUpAnchor.current){
          moonCameraUpAnchor.current.applyQuaternion(orbitSpin);
          viewCamera.up.copy(moonCameraUpAnchor.current);
        }
        viewCamera.lookAt(controls.current.target);
        controls.current.update();
      }
      moonCameraAnchor.current=currentMoon;
    }
    if (props.view === "MOON FROM EARTH" && controls.current) {
      // Track true Moon direction from the SAME place, never teleport the
      // observer to the moving sublunar point.
      const observer=moonObserverFrame(new Date(),moonObserverMarker.current);
      const previous=earthTelescopeAnchor.current;
      if (previous && observer.moon.distanceToSquared(previous.moon)>1e-14) {
        const viewCamera=controls.current.object as THREE.PerspectiveCamera;
        viewCamera.position.copy(observer.position);
        viewCamera.up.copy(observer.up);
        controls.current.target.copy(observer.moon);
        viewCamera.lookAt(observer.moon);
        controls.current.update();
        previous.camera.copy(observer.position);
        previous.moon.copy(observer.moon);
      }
    }

    if (satelliteLocalExit.current.active && controls.current) {
      const exit = satelliteLocalExit.current;
      const exitCamera = controls.current.object as THREE.PerspectiveCamera;
      const startCamera = exit.startCamera;
      const startTarget = exit.startTarget;
      const endCamera = exit.endCamera;
      const endTarget = exit.endTarget;

      if (startCamera && startTarget && endCamera && endTarget) {
        exit.elapsed = Math.min(exit.duration, exit.elapsed + Math.min(delta, 0.05));
        const raw = THREE.MathUtils.clamp(exit.elapsed / exit.duration, 0, 1);
        const eased = raw * raw * raw * (raw * (raw * 6 - 15) + 10);

        const nextCamera = startCamera.clone().lerp(endCamera, eased);
        const nextTarget = startTarget.clone().lerp(endTarget, eased);

        // Never allow the exit path to cross Earth.
        const minEarthRadius = GLOBE_RADIUS + 0.24;
        const fromEarth = nextCamera.clone().sub(GLOBE_CENTER);
        if (fromEarth.length() < minEarthRadius) {
          nextCamera.copy(
            GLOBE_CENTER.clone().add(
              fromEarth.normalize().multiplyScalar(minEarthRadius),
            ),
          );
        }

        exitCamera.position.copy(nextCamera);
        controls.current.target.copy(nextTarget);
        exitCamera.lookAt(nextTarget);

        if (raw >= 1) {
          exit.active = false;
          controls.current.enabled = true;
        }

        flyTarget.current = null;
        return;
      }

      exit.active = false;
      controls.current.enabled = true;
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

      // Same final framing as FOLLOW SUNRISE.
      const desiredCamera = satellitePoint
        .clone()
        .add(satelliteNormal.clone().multiplyScalar(0.92))
        .add(tangent.clone().multiplyScalar(-0.58));
      const desiredTarget = satellitePoint
        .clone()
        .add(tangent.clone().multiplyScalar(0.20))
        .add(satelliteNormal.clone().multiplyScalar(-0.08));

      const minEarthRadius = GLOBE_RADIUS + 0.24;
      const entry = satelliteOrbitEntry.current;

      if (entry.active) {
        if (!entry.startDirection || !entry.startTarget) {
          const startVector = camera.position.clone().sub(GLOBE_CENTER);
          entry.startRadius = Math.max(startVector.length(), minEarthRadius);
          entry.startDirection = startVector.normalize();
          entry.startTarget = controls.current.target.clone();
          entry.elapsed = 0;
          controls.current.enabled = false;
        }

        const startDirection = entry.startDirection;
        const startTarget = entry.startTarget;
        if (!startDirection || !startTarget) return;

        entry.elapsed = Math.min(
          entry.duration,
          entry.elapsed + Math.min(delta, 0.05),
        );

        const raw = THREE.MathUtils.clamp(entry.elapsed / entry.duration, 0, 1);
        const eased = raw * raw * raw * (raw * (raw * 6 - 15) + 10);

        const desiredVector = desiredCamera.clone().sub(GLOBE_CENTER);
        const desiredRadius = Math.max(desiredVector.length(), minEarthRadius);
        const desiredDirection = desiredVector.normalize();

        // Great-circle transfer: rotate the radial direction around Earth
        // instead of linearly cutting a chord through the planet.
        const rotationToDestination = new THREE.Quaternion().setFromUnitVectors(
          startDirection,
          desiredDirection,
        );
        const orbitalRotation = new THREE.Quaternion().identity().slerp(
          rotationToDestination,
          eased,
        );
        const orbitalDirection = startDirection.clone().applyQuaternion(orbitalRotation).normalize();

        // Radius is independent from direction. Mid-transfer lift makes the
        // motion read as an orbital maneuver and guarantees Earth clearance.
        const baseRadius = THREE.MathUtils.lerp(
          entry.startRadius,
          desiredRadius,
          eased,
        );
        const orbitalLift = Math.sin(Math.PI * raw) * 0.72;
        const transferRadius = Math.max(
          minEarthRadius,
          baseRadius + orbitalLift,
        );

        const transferCamera = GLOBE_CENTER.clone().add(
          orbitalDirection.multiplyScalar(transferRadius),
        );
        const transferTarget = startTarget.clone().lerp(desiredTarget, eased);

        camera.position.copy(transferCamera);
        controls.current.target.copy(transferTarget);
        camera.lookAt(transferTarget);

        if (raw >= 1) {
          entry.active = false;
          previousSatelliteFollowTarget.current = desiredTarget.clone();
          controls.current.enabled = true;
        }

        flyTarget.current = null;
        return;
      }

      // After orbital entry, preserve the user's own rotate/zoom offset.
      // Only translate the camera rig by the satellite target movement.
      const previousTarget = previousSatelliteFollowTarget.current;
      if (!previousTarget) {
        previousSatelliteFollowTarget.current = desiredTarget.clone();
      } else {
        const movement = desiredTarget.clone().sub(previousTarget);
        camera.position.add(movement);
        controls.current.target.add(movement);
        previousTarget.copy(desiredTarget);
      }

      const fromEarth = camera.position.clone().sub(GLOBE_CENTER);
      if (fromEarth.length() < minEarthRadius) {
        camera.position.copy(
          GLOBE_CENTER.clone().add(
            fromEarth.normalize().multiplyScalar(minEarthRadius),
          ),
        );
      }

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
      {props.view !== "MOON" && props.view !== "MOON ORBIT" && props.view !== "MOON FROM EARTH" && (
        <fog attach="fog" args={["#010208", 7, 15]} />
      )}
      <ambientLight intensity={props.view==="MOON" || props.view==="MOON ORBIT" || props.view==="MOON FROM EARTH" ? 0 : 0.012} />
      <directionalLight ref={sunLight} intensity={props.mode === "CINEMA" ? 2.45 : 2.15} color="#fff3df" />
      <SunVisual moonDistanceFactor={props.moonDistanceFactor}
        fromEarth={props.view==="MOON FROM EARTH"} />
      <MoonVisual detailed={props.view==="MOON" || props.view==="MOON ORBIT" || props.view==="MOON FROM EARTH"}
        visualDistanceFactor={props.view==="MOON FROM EARTH" ? 1 : props.moonDistanceFactor}
        fromEarth={props.view==="MOON FROM EARTH"} observerLocation={props.marker} />
      {(props.moonDistanceFactor===1 || (props.view!=="MOON" && props.view!=="MOON ORBIT")) && <EclipseShadowPreview />}
      {props.followSunrise && <TerminatorLayer />}
      <Earth lunarObserver={props.view==="MOON" || props.view==="MOON ORBIT"} cloudEngine={props.cloudEngine} cloudDebugMode={props.cloudDebugMode} clouds={props.layers.clouds} cityLights={props.layers.cityLights} satelliteSurface={props.satelliteSurface} onSurfaceApplied={props.onSurfaceApplied} aurora={props.layers.aurora} precipitation={props.layers.precipitation} cinematic={props.mode === "CINEMA"} marker={props.marker} windSpeed={props.windSpeed} temperature={props.temperature} pressure={props.pressure} snowfall={props.snowfall} weatherLayer={props.weatherLayer} />
      {props.iss && <IssOrbitLayer iss={props.iss} showTracks={props.followIss} />}

      {props.layers.aurora && <AuroraOvalLayer points={props.auroraPoints} kp={props.kp} />}
      {props.layers.earthquakes && <EarthquakeLayer events={props.earthquakes} onSelect={(quake) => props.onSelectEarthEvent?.({
        id:"quake:"+quake.id,kind:"EARTHQUAKE",title:"M"+quake.magnitude.toFixed(1)+" · "+quake.place,
        detail:"USGS · DEPTH "+Math.round(quake.depth)+" KM",latitude:quake.latitude,longitude:quake.longitude,score:0
      })} />}
      {props.layers.volcanoes && <VolcanoLayer volcanoes={props.volcanoes} onSelect={(volcano) => props.onSelectEarthEvent?.({
        id:"volcano:"+volcano.id,kind:"VOLCANO",title:volcano.name,
        detail:"NASA EONET · "+(volcano.eventTime?"REPORTED "+volcano.eventTime.slice(0,10):"ACTIVE EVENT"),
        latitude:volcano.latitude,longitude:volcano.longitude,score:0
      })} />}
      {props.layers.wildfires && <WildfireLayer hotspots={props.wildfires} onSelect={(fire) => props.onSelectEarthEvent?.({
        id:"fire:"+fire.id,kind:"WILDFIRE",title:"FIRE HOTSPOT",
        detail:(fire.frp!=null?Math.round(fire.frp)+" MW FRP · ":"")+
          (fire.satellite?"NASA FIRMS":"NASA FIRE EVENT FEED"),
        latitude:fire.latitude,longitude:fire.longitude,score:0
      })} />}
      {props.layers.storms && <StormLayer storms={props.storms} showForecast={props.showStormForecast} onSelect={(storm) => props.onSelectEarthEvent?.({
        id:"storm:"+storm.id,kind:"CYCLONE",title:storm.name,
        detail:(storm.category!=null&&storm.category>=1?"CAT "+Math.round(storm.category)+" · ":"")+
          (storm.windKnots!=null?Math.round(storm.windKnots)+" KT · ":"")+"NHC",
        latitude:storm.latitude,longitude:storm.longitude,score:0
      })} />}
      {props.layers.lightning && <LightningLayer cinematic={props.mode === "CINEMA"} onTelemetry={props.onLightningTelemetry} />}
      {props.layers.lightning && props.showLightningModel && <LightningModelLayer points={props.lightningModelPoints} cinematic={props.mode === "CINEMA"} />}
      <EffectComposer multisampling={0}>
        <StableBloomEffect mode={props.mode} view={props.view} />
      </EffectComposer>
      <OrbitControls
        ref={controls}
        enabled
        enablePan={false}
        minDistance={props.view === "MOON" ? kmToScene(MOON_RADIUS_KM,GLOBE_RADIUS)+0.15 :
          props.view === "MOON ORBIT" ? 2.0 :
          props.view === "MOON FROM EARTH" ? 4.0 :
          props.selectedSatelliteId ? 1.25 : GLOBE_RADIUS + 0.72}
        maxDistance={props.view === "MOON" ? 24 :
          props.view === "MOON ORBIT" ? 24 :
          props.view === "MOON FROM EARTH" ? 300 :
          props.qaWideAngle ? 13 : 11}
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

type LayerLoadState = { phase: "connecting" | "downloading" | "preparing" | "visible" | "unavailable"; percent?: number };
function LayerRow(props: { checked: boolean; label: string; status: string; tone: "live" | "forecast" | "model"; onChange: () => void; load?: LayerLoadState | null }) {
  // Other layers are already independently prefetched. Their indicator
  // confirms React activation, not a fictitious network download.
  const [applied, setApplied] = useState<LayerLoadState | null>(null);
  const wasChecked = useRef(props.checked);
  useEffect(() => {
    const activated = props.checked && !wasChecked.current;
    wasChecked.current = props.checked;
    if (!activated) {
      if (!props.checked) setApplied(null);
      return;
    }
    if (props.load) return; // Satellites own their real network phases.
    setApplied({ phase: "preparing" });
    let lastFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      lastFrame = requestAnimationFrame(() => setApplied({ phase: "visible", percent: 100 }));
    });
    const hide = window.setTimeout(() => setApplied(null), 1600);
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(lastFrame); window.clearTimeout(hide); };
  }, [props.checked]);
  const state = props.load ?? applied;
  const phase = state?.phase;
  const indeterminate = phase === "connecting" || phase === "preparing" || (phase === "downloading" && state?.percent == null);
  const progress = phase === "visible" ? 100 : state?.percent;
  const detail = phase === "connecting" ? "CONNECTING TO SOURCE"
    : phase === "downloading" ? "DOWNLOADING ORBITAL DATA"
    : phase === "preparing" ? (props.load ? "PREPARING OBJECTS" : "APPLYING LAYER")
    : phase === "unavailable" ? "SOURCE UNAVAILABLE · RETRY"
    : props.load ? "VISIBLE ON GLOBE" : "LAYER ACTIVATED";
  return (
    <div className="layer-load-item">
      <button className="layer-row" onClick={props.onChange} aria-pressed={props.checked}>
        <span className={"layer-check " + (props.checked ? "active" : "")}>{props.checked ? "✓" : ""}</span>
        <span>{props.label}</span>
        <StatusPill tone={props.tone}>{props.status}</StatusPill>
      </button>
      {props.checked && phase && (
        <div className="layer-load-detail" role="status" aria-live="polite">
          <div className="layer-load-meta"><span>{detail}</span>
            <span>{phase === "unavailable" ? "—" : progress != null ? Math.round(progress) + "%" : "•••"}</span>
          </div>
          <div className={"layer-load-track" + (indeterminate ? " indeterminate" : "") + (phase === "unavailable" ? " unavailable" : "")}
            role={progress != null ? "progressbar" : undefined}
            aria-label={props.label + " loading"}
            aria-valuemin={progress != null ? 0 : undefined}
            aria-valuemax={progress != null ? 100 : undefined}
            aria-valuenow={progress != null ? Math.round(progress) : undefined}>
            <span style={progress != null ? { width: progress + "%" } : undefined}/>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CupolaExperience() {
  const [mode, setMode] = useState<ExperienceMode>("EXPLORE");
  // Opt-in QA only: ?cloudDebug=sources colors the cloud shell by atlas
  // provenance, making a pole-to-pole source discontinuity easy to locate.
  // Normal visitors see the unchanged cinematic presentation.
  const [cloudDebugMode, setCloudDebugMode] = useState<CloudDebugMode>(0);
  // Optional, deterministic QA camera at the real East Africa / Indian
  // Ocean satellite-source boundary. It is NEVER enabled for visitors,
  // Cinema or production by default; only ?cloudQaView=indian-ocean.
  const [cloudQaFocus, setCloudQaFocus] = useState<{lat:number;lon:number}|null>(null);
  useEffect(() => {
    const debug=new URLSearchParams(window.location.search).get("cloudDebug");
    if(debug==="sources")setCloudDebugMode(4);
    else if(debug==="lighting")setCloudDebugMode(5);
    if(new URLSearchParams(window.location.search).get("cloudQaView")==="indian-ocean")
      setCloudQaFocus({lat:-8,lon:58});
  }, []);
  const [cloudEngine, setCloudEngine] = useState<CloudEngine>("v3");
  const [cloudPreviewControls, setCloudPreviewControls] = useState(false);
  const [cloudTelemetry, setCloudTelemetry] = useState<CloudTelemetry | null>(null);
  const [cloudGpuApply, setCloudGpuApply] = useState<CloudGpuApply|null>(null);
  const [moonMapStatus,setMoonMapStatus]=useState("LOADING");
  const [moonReliefStatus,setMoonReliefStatus]=useState("LOLA RELIEF ON DEMAND");
  const [surfaceDiagnostics, setSurfaceDiagnostics] = useState(false);
  const [cloudSafetyNotice, setCloudSafetyNotice] = useState<string | null>(null);
  // An emergency STATIC fallback must automatically resume when verified L2 returns.
  const [cloudAutoRecover, setCloudAutoRecover] = useState(false);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("EARTH");
  const [weatherLayer, setWeatherLayer] = useState<WeatherLayer>("CLOUDS");
  const [view, setView] = useState<ViewMode>("ISS CUPOLA");
  // Moon has no extra Controls. One visual compression, permanently 4×.
  const moonDistanceFactor=MOON_CINEMATIC_DISTANCE_FACTOR;
  const [satelliteSurface, setSatelliteSurface] = useState(false);
  const [landFusionStats,setLandFusionStats]=useState<FusionStats|null>(null);
  const onSurfaceApplied=useCallback((next:FusionStats|null)=>{
    setLandFusionStats(previous=>
      previous?.date===next?.date&&previous?.acceptedPixels===next?.acceptedPixels?previous:next);
  },[]);
  // Cloud V3 and the conservative VIIRS land fusion are independent layers.
  const [layers, setLayers] = useState({ clouds: true, cityLights: true, aurora: false, precipitation: false, earthquakes: false, storms: true, lightning: true, wildfires: false, volcanoes: false, satellites: false });
  const [now, setNow] = useState(new Date());
  const [iss, setIss] = useState<IssData | null>(null);
  const [followIss, setFollowIss] = useState(false);
  const [followSunrise, setFollowSunrise] = useState(false);
  const [followSatellite, setFollowSatellite] = useState(false);
  const [satelliteData, setSatelliteData] = useState<SatelliteData | null>(null);
  const [satelliteLoad, setSatelliteLoad] = useState<LayerLoadState | null>(null);
  const [satellitePrefetchEnabled, setSatellitePrefetchEnabled] = useState(false);
  const [satelliteActivation, setSatelliteActivation] = useState(0);
  const satelliteVisibleRef = useRef(layers.satellites);
  satelliteVisibleRef.current = layers.satellites;

  const [satellitePerfEnabled, setSatellitePerfEnabled] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("satellitePerf") === "1")
      setSatellitePerfEnabled(true);
  }, []);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get("satellite");
    if(!id||!/^\d{1,8}$/.test(id))return;
    setSelectedSatelliteId(id);
    setLayers(current=>current.satellites?current:{...current,satellites:true});
  },[]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
  const [nightLightsMeta, setNightLightsMeta] = useState<NightLightsMeta | null>(null);
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([]);
  const [earthquakeUpdatedAt, setEarthquakeUpdatedAt] = useState<string | null>(null);
  const [storms, setStorms] = useState<TropicalStorm[]>([]);
  const [stormsUpdatedAt, setStormsUpdatedAt] = useState<string | null>(null);
  const [wildfireData, setWildfireData] = useState<WildfireData | null>(null);
  const [volcanoData, setVolcanoData] = useState<VolcanoData | null>(null);
  const [earthFeeds, setEarthFeeds] = useState({ storms: true, earthquakes: true, volcanoes: true, aurora: true, wildfires: true });
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
    noaaHotspot: null,
    mtgHotspot: null,
    zones: [],
    updatedAt: null,
  });
  const [auroraData, setAuroraData] = useState<AuroraData | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sound, setSound] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"now" | null>(null);
  const [controlPanel, setControlPanel] = useState<"view" | "layers" | "events" | null>(null);
  // The first visit to Layers is explicit intent to inspect satellite data.
  // Begin preparing the catalogue then, without slowing the initial Earth view.
  useEffect(() => {
    if (controlPanel === "layers" || layers.satellites)
      setSatellitePrefetchEnabled(true);
  }, [controlPanel, layers.satellites]);
  // The scene remains unobstructed until the visitor explicitly requests controls.
  useEffect(() => {
    if (!controlPanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlPanel(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("#cupola-control-center, .control-center-trigger, [data-control-trigger]")) return;
      setControlPanel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [controlPanel]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [showCurrentLocationContext, setShowCurrentLocationContext] = useState(false);
  const [discoveryIndex, setDiscoveryIndex] = useState(-1);
  const [discoveryFocus, setDiscoveryFocus] = useState<DiscoveryEvent | null>(null);
  const discoveryCameraTarget = useMemo(
    () => discoveryFocus ? { lat: discoveryFocus.latitude, lon: discoveryFocus.longitude } : null,
    [discoveryFocus],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const engine = params.get("cloudEngine");
    if (engine === "v3" || engine === "v2" || engine === "legacy") setCloudEngine(engine);
    setCloudAutoRecover(engine === "legacy" && params.get("cloudAutoRecover") === "1");
    setSurfaceDiagnostics(params.get("surfaceDebug") === "1");
    setCloudPreviewControls(engine === "v3" || params.get("cloudPreview") === "1");
    const onCloudTelemetry = (event: Event) => {
      const state = (event as CustomEvent<CloudTelemetry>).detail;
      // A non-live, INCOMPLETE fallback cannot be visually seamless:
      // do not present its hard satellite footprint as continuous clouds.
      // Fail closed to the existing standard, static visual layer, clearly
      // disclosed. Never mislabel standard as live or scientific satellite.
      const noCurrentL2=state.engine==="v3" && state.status==="visual" &&
        state.coverage===0;
      const footprint=state.displayFootprint ?? 0;
      const noMeasuredGlobalIr=(state.gmgsiCoverage ?? 0)<0.01;
      const severeGap=footprint>0 && footprint<0.90;
      if(noCurrentL2 && noMeasuredGlobalIr && severeGap){
        setCloudSafetyNotice(
          "SCIENTIFIC V3 DATA INCOMPLETE ("+(footprint*100).toFixed(1)+
          "% COVERAGE) · TEMPORARY STANDARD CLOUD VISUAL · NOT LIVE"
        );
        setCloudEngine("legacy");
        setCloudAutoRecover(true);
        setCloudTelemetry(null);
        const url=new URL(window.location.href);
        url.searchParams.set("cloudEngine","legacy");
        url.searchParams.set("cloudAutoRecover","1");
        url.searchParams.set("cloudPreview","1");
        window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
        window.dispatchEvent(new CustomEvent("cupola-cloud-safety-fallback",{
          detail:{reason:"incomplete-satellite-coverage",footprint,
            scienceCoverage:state.coverage,gmGsiCoverage:state.gmgsiCoverage ?? 0,
            displayMode:"standard-static-not-live"}
        }));
        return;
      }
      setCloudTelemetry(state);
    };
    // This event is emitted after the atlas actually completes its WebGL fade.
    const onCloudGpuApply = (event: Event) => {
      const detail = (event as CustomEvent<CloudGpuApply>).detail;
      if (!detail || !["verified-l2", "visual-backup"].includes(detail.kind)) return;
      setCloudGpuApply(previous => previous?.kind===detail.kind &&
        previous.version===detail.version ? previous : detail);
    };
    const onMoonStatus=(event:Event)=>{
      const next=(event as CustomEvent<string>).detail;
      if(["LOADING","NASA LROC ACTIVE","NASA LROC HD ACTIVE","NASA MAP RETRY PENDING"].includes(next))
        setMoonMapStatus(next);
    };
    window.addEventListener("cupola-cloud-telemetry", onCloudTelemetry);
    window.addEventListener("cupola-cloud-gpu-applied", onCloudGpuApply);
    window.addEventListener("cupola-moon-map-status",onMoonStatus);
    const onLola=(event:Event)=>{
      const status=(event as CustomEvent<string>).detail;
      if(["NASA LOLA ACTIVE","NASA LOLA HD ACTIVE","LOLA RELIEF UNAVAILABLE"].includes(status))
        setMoonReliefStatus(status);
    };
    window.addEventListener("cupola-moon-relief-status",onLola);
    return () => {
      window.removeEventListener("cupola-cloud-telemetry", onCloudTelemetry);
      window.removeEventListener("cupola-cloud-gpu-applied", onCloudGpuApply);
      window.removeEventListener("cupola-moon-map-status",onMoonStatus);
      window.removeEventListener("cupola-moon-relief-status",onLola);
    };
  }, []);

  // Scientific Cloud V3 may briefly switch to the safe static STANDARD layer
  // when all fresh observed sources are unavailable/incomplete. Previously
  // that emergency switch was permanent, even once GitHub published new L2.
  // Re-probe only during this automatic fallback; user-selected STANDARD is
  // never overridden. Persist the recovery marker across page reloads.
  useEffect(() => {
    if (!cloudAutoRecover || cloudEngine !== "legacy") return;
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const check = async () => {
      if (!active || loading) return;
      loading = true;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]);
        const response = await fetch(
          "/api/clouds-science-v3?kind=manifest&v=" + Math.floor(Date.now() / 60_000),
          { cache: "no-store", signal },
        );
        if (response.status !== 200 ||
            response.headers.get("X-Cupola-Data-Status") !== "scientific-observed") return;
        const meta = await response.json() as { version?: string };
        if (!isFreshCloudV3RecoveryManifest(meta, Date.now())) return;
        // Avoid a V3/STATIC oscillation: validate the server's pinned,
        // SHA-checked atlas response before putting V3 back on the GPU.
        const atlas = await fetch(
          "/api/clouds-science-v3?kind=atlas&version=" + encodeURIComponent(meta.version ?? ""),
          { cache: "no-store", signal },
        );
        if (atlas.status !== 200 ||
            atlas.headers.get("X-Cupola-Data-Status") !== "scientific-observed" ||
            !(atlas.headers.get("content-type") || "").startsWith("image/png") ||
            (await atlas.blob()).size < 1000 || !active) return;
        setCloudAutoRecover(false);
        setCloudSafetyNotice(null);
        setCloudTelemetry(null);
        setCloudEngine("v3");
        const url = new URL(window.location.href);
        url.searchParams.set("cloudEngine", "v3");
        url.searchParams.delete("cloudAutoRecover");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      } catch {
        // Keep safe visual until both a fresh, observed manifest and its
        // immutable verified atlas are available; check again later.
      } finally { loading = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 2 * 60_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [cloudAutoRecover, cloudEngine]);

  const changeCloudDebugMode = (mode:CloudDebugMode) => {
    setCloudDebugMode(mode);
    const url=new URL(window.location.href);
    if(mode===4)url.searchParams.set("cloudDebug","sources");
    else if(mode===5)url.searchParams.set("cloudDebug","lighting");
    else url.searchParams.delete("cloudDebug");
    window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
  };

  const changeCloudEngine = (engine: CloudEngine) => {
    setCloudEngine(engine);
    setCloudAutoRecover(false);
    setCloudTelemetry(null);
    setCloudGpuApply(null);
    setCloudSafetyNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("cloudEngine", engine);
    url.searchParams.delete("cloudAutoRecover");
    url.searchParams.set("cloudPreview", "1");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  };

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
        if (!response.ok) throw new Error("earthquakes-upstream-unavailable");
        const data = await response.json();
        if (!active) return;
        setEarthquakes(Array.isArray(data.earthquakes) ? data.earthquakes : []);
        setEarthquakeUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
        setEarthFeeds(prev => ({ ...prev, earthquakes: true }));
      } catch { if (active) setEarthFeeds(prev => ({ ...prev, earthquakes: false })); }
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
        if (!response.ok) throw new Error("storms-upstream-unavailable");
        const data = await response.json();
        if (!active) return;
        setStorms(Array.isArray(data.storms) ? data.storms : []);
        setStormsUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
        setEarthFeeds(prev => ({ ...prev, storms: true }));
      } catch { if (active) setEarthFeeds(prev => ({ ...prev, storms: false })); }
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
        if (!response.ok) throw new Error("wildfires-upstream-unavailable");
        const data = await response.json();
        if (!active) return;
        setWildfireData({
          hotspots: Array.isArray(data.hotspots) ? data.hotspots : [],
          totalDetections: Number.isFinite(Number(data.totalDetections)) ? Number(data.totalDetections) : 0,
          source: typeof data.source === "string" ? data.source : "NASA",
          mode: typeof data.mode === "string" ? data.mode : "unknown",
          latestAcquisition: typeof data.latestAcquisition === "string" ? data.latestAcquisition : null,
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
          dataStatus: typeof data.dataStatus === "string" ? data.dataStatus : "unknown",
          observationAgeMinutes: typeof data.observationAgeMinutes === "number" ? data.observationAgeMinutes : null,
        });
        setEarthFeeds(prev => ({ ...prev, wildfires: data.dataStatus !== "offline" }));
      } catch { if (active) { setEarthFeeds(prev => ({ ...prev, wildfires: false })); setWildfireData(null); } }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/volcanoes", { cache: "no-store" });
        if (!response.ok) throw new Error("volcanoes-upstream-unavailable");
        const data = await response.json();
        if (!active) return;
        setVolcanoData({
          volcanoes: Array.isArray(data.volcanoes) ? data.volcanoes : [],
          source: typeof data.source === "string" ? data.source : "GDACS / NASA EONET",
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
          dataStatus: typeof data.dataStatus === "string" ? data.dataStatus : "unknown",
          latestReportAt: typeof data.latestReportAt === "string" ? data.latestReportAt : null,
          recentReportCount: Number(data.recentReportCount || 0),
        });
        setEarthFeeds(prev => ({ ...prev, volcanoes: true }));
      } catch { if (active) { setEarthFeeds(prev => ({ ...prev, volcanoes: false })); setVolcanoData(null); } }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
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
        if (!response.ok) throw new Error("aurora-oval-upstream-unavailable");
        const data = await response.json();
        if (!active) return;
        setAuroraData({
          points: Array.isArray(data.points) ? data.points : [],
          source: typeof data.source === "string" ? data.source : "NOAA SWPC OVATION",
          forecastTime: typeof data.forecastTime === "string" ? data.forecastTime : null,
          observationTime: typeof data.observationTime === "string" ? data.observationTime : null,
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
          dataStatus: typeof data.dataStatus === "string" ? data.dataStatus : "unknown",
        });
        setEarthFeeds(prev => ({ ...prev, aurora: data.dataStatus === "forecast" }));
      } catch {
        if (active) { setEarthFeeds(prev => ({ ...prev, aurora: false })); setAuroraData(null); }
      }
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/night-lights?meta=1", { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setNightLightsMeta({source:"NASA Black Marble fallback",imageryDate:"2016-composite",ageHours:null});
          return;
        }
        const metadata = parseDailyImageryInfo(await response.json(),"night");
        if (!metadata) {
          setNightLightsMeta({source:"NASA Black Marble fallback",imageryDate:"2016-composite",ageHours:null});
          return;
        }
        const ageHours = Math.max(0,Math.round(
          (Date.now() - Date.parse(metadata.imageryDate + "T00:00:00Z")) / 3600000));
        setNightLightsMeta({
          source:metadata.layer,
          imageryDate:metadata.imageryDate,
          ageHours,
        });
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 30 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    // The full orbital catalog can contain up to 20k objects. Do not make
    // every first-time Earth visitor download it while the layer is off.
    // The first Layers-tab opening, or direct Satellite activation, opts in.
    if (!satellitePrefetchEnabled) return;
    let active = true;
    const abort = new AbortController();
    const report = (state: LayerLoadState) => {
      if (active && satelliteVisibleRef.current) setSatelliteLoad(state);
    };
    report({phase: "connecting"});
    const cacheKey = "cupola:satellites:snapshot:v1";
    const cacheMaxAgeMs = 2 * 60 * 1000;
    let hasUsableCache = !!(satelliteData?.satellites.length &&
      Date.now()-Date.parse(satelliteData.generatedAt) < cacheMaxAgeMs);

    const normalizeSnapshot = (data: any): SatelliteData => ({
      satellites: data?.wireFormat === SATELLITE_WIRE_FORMAT
        ? decodeSatelliteRows(data?.satellites, data?.motionTargetTimestamp)
        : Array.isArray(data?.satellites) ? data.satellites : [],
      count: Number.isFinite(Number(data?.count)) ? Number(data.count) : 0,
      source: typeof data?.source === "string" ? data.source : "CelesTrak GP · OMM JSON",
      generatedAt: typeof data?.generatedAt === "string" ? data.generatedAt : "",
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
          Date.now() - Date.parse(snapshot.generatedAt) <= cacheMaxAgeMs &&
          snapshot.count > 0 &&
          snapshot.satellites.length > 0
        ) {
          hasUsableCache = true;
          setSatelliteData(snapshot);
          report({ phase: "preparing" });

        }
      }
    } catch {}

    const load = async () => {
      try {
        const response = await fetch("/api/satellites?format=compact", {signal: abort.signal});
        if (!response.ok) {
          if (!hasUsableCache) report({phase: "unavailable"});
          return;
        }
        let data: any;
        const encoded = response.headers.get("content-encoding");
        // Browsers generally expose decompressed response.body bytes even
        // when Content-Length counts Brotli/gzip bytes; never fake % in that case.
        const length = !encoded || encoded === "identity"
          ? Number(response.headers.get("content-length")) : NaN;
        if (response.body) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); received += value.byteLength;
            if (!hasUsableCache) report({phase: "downloading",
              percent: length > 0 && Number.isFinite(length) ? Math.min(99, received / length * 100) : undefined});
          }
          const buffer = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.byteLength; }
          if (!hasUsableCache) report({phase: "preparing"});
          data = JSON.parse(new TextDecoder().decode(buffer));
        } else {
          if (!hasUsableCache) report({phase: "downloading"});
          data = await response.json();
          if (!hasUsableCache) report({phase: "preparing"});
        }
        if (!active) return;

        const candidate = normalizeSnapshot(data);
        if (candidate.count < 100 || candidate.satellites.length < 100 ||
            !Number.isFinite(Date.parse(candidate.generatedAt)) ||
            Date.now() - Date.parse(candidate.generatedAt) > 3*60*1000) {
          if (!hasUsableCache) report({phase: "unavailable"});
          return;
        }

        hasUsableCache = true;
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

          // The bulk catalog omits per-satellite trajectory data. Keep the
          // separately fetched track across periodic catalog refreshes so the
          // selected satellite's blue orbit never disappears while following.
          if (!current) return candidate;
          const tracksById = new Map(
            current.satellites
              .filter((satellite) => satellite.track?.length >= 2)
              .map((satellite) => [satellite.id, {
                epoch: satellite.epoch,
                track: satellite.track,
              }] as const),
          );
          if (!tracksById.size) return candidate;
          return {
            ...candidate,
            satellites: candidate.satellites.map((satellite) => {
              const previousTrack = tracksById.get(satellite.id);
              return previousTrack && previousTrack.epoch === satellite.epoch &&
                (!satellite.track || satellite.track.length < 2)
                ? { ...satellite, track: previousTrack.track }
                : satellite;
            }),
          };
        });

      } catch (error) {
        if (active && !hasUsableCache &&
          !(error instanceof DOMException && error.name === "AbortError")) report({phase: "unavailable"});
      }
    };

    // Keep the one prewarm request and decoded snapshot through quick toggles.
    // Refresh only while satellites are enabled, not on every panel visit.
    if (!hasUsableCache) void load();
    const timer = window.setInterval(() => {
      if (satelliteVisibleRef.current) void load();
    }, 2 * 60 * 1000);
    return () => {
      active = false;
      abort.abort();
      window.clearInterval(timer);
    };
  }, [satellitePrefetchEnabled]);

  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    fetch("/api/weather?lat=" + coords.lat + "&lon=" + coords.lon, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setWeather(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [coords]);

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
    setShowCurrentLocationContext(false);
    setCoords({ lat: place.latitude, lon: place.longitude });
    setSearchOpen(false);
    setSearchResults([]);
  };

  const toggleFollowIss = () => {
    if (!iss) return;
    setShowCurrentLocationContext(false);
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
    setShowCurrentLocationContext(false);
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
    setShowCurrentLocationContext(false);
    if (followSatellite && selectedSatelliteId === satellite.id) return;
    // Switching selected object must update the panel even during Follow.
    setFollowSatellite(false);
    setFollowIss(false);
    setFollowSunrise(false);
    setDiscoveryFocus(null);
    setDiscoveryIndex(-1);
    setSelectedPlace(null);
    setSelectedSatelliteId(satellite.id);
  };

  // Refresh the selected orbital track as its OMM catalog changes. Do not
  // overwrite newer live positions/motion targets with a delayed track reply.
  useEffect(() => {
    if (!layers.satellites || !selectedSatelliteId) return;
    let active = true;
    const loadTrack = async () => {
      try {
        const response = await fetch(
          "/api/satellites?track=" + encodeURIComponent(selectedSatelliteId),
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = await response.json();
        if (!active) return;
        const tracked = payload?.satellite as LiveSatellite | undefined;
        if (!tracked || tracked.id !== selectedSatelliteId ||
            !Array.isArray(tracked.track) || tracked.track.length < 2) return;
        setSatelliteData((current) => {
          if (!current || !active) return current;
          let changed = false;
          const satellites = current.satellites.map((item) => {
            if (item.id !== tracked.id || item.epoch !== tracked.epoch) return item;
            changed = true;
            // Track only: current position, velocity and target must remain
            // from the latest bulk SGP4 snapshot used by GPU and Follow.
            return { ...item, track: tracked.track };
          });
          return changed ? { ...current, satellites } : current;
        });
      } catch {}
    };
    void loadTrack();
    const timer = window.setInterval(() => void loadTrack(), 2 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [layers.satellites, selectedSatelliteId]);

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
    const alreadyPrepared = !!satelliteData?.satellites.length;
    setSatelliteLoad(next ? {phase: alreadyPrepared ? "preparing" : "connecting"} : null);
    if (next) setSatelliteActivation(current => current + 1);
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
        setShowCurrentLocationContext(true);
        setCoords({ lat: Number(position.coords.latitude.toFixed(4)), lon: Number(position.coords.longitude.toFixed(4)) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  };

  const selectedSatellite = satelliteData?.satellites.find((satellite) => satellite.id === selectedSatelliteId) ?? null;
  const hasContextFocus = Boolean(
    selectedSatellite || (followIss && iss) || discoveryFocus || selectedPlace ||
    (showCurrentLocationContext && coords) || followSunrise
  );
  const focusIdentity = selectedSatellite ? "sat:"+selectedSatellite.id :
    followIss && iss ? "iss" :
    discoveryFocus ? "event:"+discoveryFocus.id :
    selectedPlace ? "place:"+selectedPlace.id :
    showCurrentLocationContext && coords ? "user:"+coords.lat+":"+coords.lon :
    followSunrise ? "sunrise" : "";
  useEffect(() => {
    if (!focusIdentity) {
      setMobilePanel(prev => prev === "now" ? null : prev);
    } else if (window.matchMedia("(max-width: 900px)").matches) {
      setMobilePanel("now");
    }
  }, [focusIdentity]);
  const closeContextFocus = () => {
    setSelectedSatelliteId(null);
    setFollowSatellite(false);
    setFollowIss(false);
    setDiscoveryFocus(null);
    setFollowSunrise(false);
    setSelectedPlace(null);
    setShowCurrentLocationContext(false);
    setMobilePanel(prev => prev === "now" ? null : prev);
  };
  const satelliteAge = formatUpdatedAge(satelliteData?.generatedAt, now);
  const satelliteFeedStale = !satelliteData ||
    !Number.isFinite(Date.parse(satelliteData.generatedAt)) ||
    now.getTime()-Date.parse(satelliteData.generatedAt)>4*60*1000;

  const utc = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateLabel = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const solarNow = getSolarCoordinates(now);
  const celestialNow=getCelestial(now);
  const lunarIllumination=Math.round(celestialNow.moonIlluminatedFraction*100);
  const geocentricAlignment=eclipseAt(celestialNow,{x:0,y:0,z:0});
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
  const stormsAge = formatUpdatedAge(storms.map(storm => storm.updatedAt).sort().at(-1) ?? null, now);
  const wildfireAge = formatUpdatedAge(wildfireData?.latestAcquisition, now);
  const volcanoUpdatedAge = formatUpdatedAge(volcanoData?.latestReportAt, now);
  const mostRecentVolcano = volcanoData?.volcanoes.length
    ? [...volcanoData.volcanoes].sort((a, b) => {
        const aTime = a.eventTime ? new Date(a.eventTime).getTime() : 0;
        const bTime = b.eventTime ? new Date(b.eventTime).getTime() : 0;
        return bTime - aTime;
      })[0]
    : null;
  const mostRecentVolcanoAge = mostRecentVolcano?.eventTime
    ? formatUpdatedAge(mostRecentVolcano.eventTime, now)
    : null;
  const wildfireIsFirms = wildfireData?.mode === "firms";
  const wildfireStatus = !earthFeeds.wildfires ? "SOURCE OFFLINE" : wildfireData
    ? wildfireIsFirms
      ? wildfireData.dataStatus === "satellite-nrt" ? "VIIRS NRT" : "VIIRS DELAYED"
      : wildfireData.hotspots.length ? "REPORTED FIRES" : "NO NEW REPORTS"
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
  const auroraAge = formatUpdatedAge(auroraData?.observationTime, now);
  const auroraMaxProbability = auroraData?.points.length
    ? Math.max(...auroraData.points.map((point) => point.intensity))
    : 0;
  const auroraActiveCells = auroraData?.points.filter((point) => point.intensity >= 20).length ?? 0;
  const auroraStatus = !earthFeeds.aurora ? "SOURCE OFFLINE" : auroraMaxProbability > 0
    ? "FORECAST " + Math.round(auroraMaxProbability) + "%"
    : "FORECAST QUIET";
  const lightningModelAge = formatUpdatedAge(lightningModelUpdatedAt, now);
  const observedLightningAge = formatUpdatedAge(observedLightning.updatedAt, now);
  const observedLightningCells = observedLightning.noaaCells + observedLightning.mtgCells;
  const observedLightningZones = observedLightning.zones.length;
  const modelLightningVisible = useMemo(() => {
    // Never render a cached model beyond its useful forecast freshness.
    const updated = Date.parse(lightningModelUpdatedAt ?? "");
    if (!Number.isFinite(updated) || now.getTime() - updated > 45 * 60000 ||
        updated - now.getTime() > 2 * 60000) return [];
    return filterModelLightningByObservation(
      lightningModelPoints, observedLightning.zones, 7,
    );
  }, [lightningModelPoints, observedLightning.zones, lightningModelUpdatedAt, now]);
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
    ? (modelLightningVisible.length ? "OBS + MODEL" : "OBSERVED")
    : modelLightningVisible.length > 0
      ? "MODEL ONLY"
      : observedFeedCount > 0 ? "NO FLASHES" : "FEEDS UNAVAILABLE";
  const observedHotspot = [observedLightning.noaaHotspot, observedLightning.mtgHotspot]
    .filter((point): point is LightningHotspot => point != null)
    .sort((a, b) => b.strength - a.strength)[0] ?? null;

  const discoveryEvents = useMemo<DiscoveryEvent[]>(() => {
    const events: DiscoveryEvent[] = [];
    const nowMs = now.getTime();

    for (const storm of earthFeeds.storms ? storms : []) {
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

    for (const quake of earthFeeds.earthquakes ? earthquakes.slice(0, 60) : []) {
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

    if (earthFeeds.aurora && auroraData?.points.length) {
      const strongestAurora = [...auroraData.points].sort((a, b) => b.intensity - a.intensity)[0];
      if (strongestAurora) {
        events.push({
          id: "aurora:" + strongestAurora.latitude + ":" + strongestAurora.longitude,
          kind: "AURORA",
          title: "AURORA " + Math.round(strongestAurora.intensity) + "%",
          detail: "NOAA OVATION FORECAST · KP " + (spaceWeather?.kp ?? 0).toFixed(1) + (auroraAge ? " · OBS " + auroraAge + " AGO" : ""),
          latitude: strongestAurora.latitude,
          longitude: strongestAurora.longitude > 180 ? strongestAurora.longitude - 360 : strongestAurora.longitude,
          score: 34 + strongestAurora.intensity * 0.58 + (spaceWeather?.kp ?? 0) * 2.8,
        });
      }
    }

    if (earthFeeds.wildfires && wildfireData?.hotspots.length) {
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
          title: wildfireData.mode === "firms" ? "OBSERVED FIRE HOTSPOT" : "REPORTED WILDFIRE",
          detail: wildfireData.mode === "firms"
            ? (frp > 0 ? Math.round(frp) + " MW FRP · " : "") + "NASA FIRMS" + (wildfireAge ? " · " + wildfireAge + " OLD" : "")
            : "GDACS / EONET INCIDENT REPORT" + (wildfireAge ? " · " + wildfireAge + " OLD" : ""),
          latitude: strongestFire.latitude,
          longitude: strongestFire.longitude,
          score: 30 + Math.log2(1 + frp) * 5 + Math.max(0, 1 - ageHours / 24) * 12,
        });
      }
    }

    if (earthFeeds.volcanoes && volcanoData?.volcanoes.length) {
      for (const volcano of volcanoData.volcanoes.slice(0, 12)) {
        const ageHours = volcano.eventTime
          ? Math.max(0, (nowMs - new Date(volcano.eventTime).getTime()) / 3600000)
          : 24 * 30;
        const recency = Math.max(0, 1 - ageHours / (24 * 45));
        events.push({
          id: "volcano:" + volcano.id,
          kind: "VOLCANO",
          title: volcano.name,
          detail: (volcano.dataStatus === "recent-report" ? "RECENT VOLCANIC REPORT" : "VOLCANIC REPORT · NOT LIVE") + " · " + volcano.source + (volcano.eventTime ? " · " + (formatUpdatedAge(volcano.eventTime, now) ?? "AGE UNKNOWN") + " OLD" : ""),
          latitude: volcano.latitude,
          longitude: volcano.longitude,
          score: 45 + recency * 18 + (volcano.magnitude ?? 0) * 2,
        });
      }
    }

    if (modelLightningVisible.length) {
      const strongestLightning = [...modelLightningVisible].sort((a, b) => b.density - a.density)[0];
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
    earthFeeds,
    auroraData,
    spaceWeather,
    wildfireData,
    volcanoData,
    observedLightningCells,
    modelLightningVisible,
  ]);

  const focusEarthEvent = (event: DiscoveryEvent) => {
    setShowCurrentLocationContext(false);
    // Exit follow modes before issuing a geographic fly-to, otherwise the
    // orbital tracking camera immediately overrides the Earth-event focus.
    setFollowIss(false);
    setFollowSunrise(false);
    setFollowSatellite(false);
    setSelectedSatelliteId(null);
    setDiscoveryFocus(event);
    setSelectedPlace(null);
    setSurfaceMode("EARTH");
    setView("ISS CUPOLA");
    setLayers((current) => ({
      ...current,
      earthquakes: event.kind === "EARTHQUAKE" || current.earthquakes,
      storms: event.kind === "CYCLONE" || current.storms,
      aurora: event.kind === "AURORA" || current.aurora,
      wildfires: event.kind === "WILDFIRE" || current.wildfires,
      volcanoes: event.kind === "VOLCANO" || current.volcanoes,
      lightning: event.kind === "LIGHTNING MODEL" || event.kind === "LIGHTNING OBSERVED" || current.lightning,
    }));
  };

  const exploreEarthNow = () => {
    if (!discoveryEvents.length) return;
    const nextIndex = (discoveryIndex + 1) % discoveryEvents.length;
    setDiscoveryIndex(nextIndex);
    focusEarthEvent(discoveryEvents[nextIndex]);
  };

  const focusEventKind = (kind: DiscoveryEvent["kind"]) => {
    const event = discoveryEvents.find((item) => item.kind === kind);
    if (!event) return;
    setDiscoveryIndex(-1);
    focusEarthEvent(event);
  };

  const focusObservedLightning = () => {
    if (!observedHotspot) return;
    setShowCurrentLocationContext(false);
    setFollowIss(false); setFollowSunrise(false); setFollowSatellite(false);
    setSelectedSatelliteId(null); setSelectedPlace(null);
    setSurfaceMode("EARTH"); setView("ISS CUPOLA");
    setLayers(current => ({ ...current, lightning: true }));
    setDiscoveryFocus({ id: "observed-lightning:" + observedHotspot.source,
      kind: "LIGHTNING OBSERVED", title: "OBSERVED LIGHTNING · " + observedHotspot.source,
      detail: "RECENT FLASH ACCUMULATION · CINEMATIC ANIMATION",
      latitude: observedHotspot.latitude, longitude: observedHotspot.longitude, score: 100 });
    setDiscoveryIndex(-1);
  };

  const cityLightsStatus = nightLightsMeta?.imageryDate === "2016-composite"
    ? "2016 STATIC"
    : nightLightsMeta?.imageryDate && /^\d{4}-\d\d-\d\d$/.test(nightLightsMeta.imageryDate)
      ? "DAILY VIIRS · " + nightLightsMeta.imageryDate
      : "NIGHT DATA UNAVAILABLE";
  const satelliteSurfaceStatus = !satelliteSurface ? "OFF" : landFusionStats
    ? "LAND APPLIED · "+landFusionStats.date
    : "WAITING · BASE EARTH";
  const cloudHealthLabel = cloudHealth({
    enabled: layers.clouds, engine: cloudEngine, status: cloudTelemetry?.status,
    observationTime: cloudTelemetry?.sourceObservationAt,
    coverage: cloudTelemetry?.coverage,
  }, now.getTime());
  const cloudObservedUtc = cloudHealthLabel.observedAt?.replace("T"," ").slice(0,16)+" UTC";

  return (
    <main className="cupola-page">
      <section className={"cupola " + (mode === "CINEMA" ? "cinema-mode" : "")}>
      <div className="scene-wrap">
        <Canvas
          dpr={[1, 1.3]}
          camera={{ position: [HERO_CAMERA.x, HERO_CAMERA.y, HERO_CAMERA.z], fov: 41, near: 0.1, far: 960 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.12;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.3));
          }}
        >
          {/* The sky must load even when Earth's remote scientific textures
              suspend the globe. This also keeps the first frame cinematic. */}
          <GaiaSkyBackdrop cinematic={mode === "CINEMA"} />
          <CelestialStarField cinematic={mode === "CINEMA"} />
          {/* Orbits do not depend on satellite cloud textures. Keep the GPU
              fleet warm and independent of Earth Suspense while disabled. */}
          {(layers.satellites || !!satelliteData?.satellites.length) && (
            <SatelliteLayer
              satellites={satelliteData?.satellites ?? []}
              selectedId={selectedSatelliteId}
              onSelect={selectSatellite}
              onReady={() => setSatelliteLoad(current =>
                current?.phase === "visible" ? current : {phase: "visible", percent: 100})}
              enabled={layers.satellites}
              generation={satelliteActivation}
            />
          )}
          <Suspense fallback={null}>
            {satellitePerfEnabled && (
              <SatellitePerformanceProbe
                key={String(layers.satellites)+":"+String(layers.clouds)+":"+mode}
                count={layers.satellites ? satelliteData?.count ?? 0 : 0}
              />
            )}
            <Scene cloudEngine={cloudEngine} moonDistanceFactor={moonDistanceFactor} cloudDebugMode={cloudDebugMode} satelliteSurface={satelliteSurface} onSurfaceApplied={onSurfaceApplied} layers={layers} mode={mode} view={view} marker={coords} focusTarget={cloudQaFocus ?? discoveryCameraTarget} qaWideAngle={cloudQaFocus!==null} iss={iss} followIss={followIss} followSunrise={followSunrise} followSatellite={followSatellite} satellites={satelliteData?.satellites ?? []} selectedSatelliteId={selectedSatelliteId} onSelectSatellite={selectSatellite} onSelectEarthEvent={focusEarthEvent} onStopFollowIss={() => setFollowIss(false)} onStopFollowSunrise={() => setFollowSunrise(false)} onStopFollowSatellite={() => setFollowSatellite(false)} windSpeed={weather?.windSpeed ?? null} temperature={weather?.temperature ?? null} pressure={weather?.pressure ?? null} snowfall={weather?.snowfall ?? null} weatherLayer={surfaceMode === "WEATHER" ? weatherLayer : null} earthquakes={earthFeeds.earthquakes ? earthquakes : []} auroraPoints={earthFeeds.aurora ? auroraData?.points ?? [] : []} kp={spaceWeather?.kp ?? 0} storms={earthFeeds.storms ? storms : []} wildfires={earthFeeds.wildfires ? wildfireData?.hotspots ?? [] : []} volcanoes={earthFeeds.volcanoes ? volcanoData?.volcanoes ?? [] : []} lightningModelPoints={modelLightningVisible} showLightningModel={modelLightningVisible.length > 0} showStormForecast={discoveryFocus?.kind === "CYCLONE"} onLightningTelemetry={setObservedLightning} />
          </Suspense>
        </Canvas>
      </div>

      {satellitePerfEnabled && (
        <SatellitePerformanceHud count={satelliteData?.count ?? 0}
          satellitesOn={layers.satellites} cloudsOn={layers.clouds} mode={mode} />
      )}
      {surfaceDiagnostics && (
        <aside className="surface-science-diagnostics hud" role="region" aria-label="Technical VIIRS land diagnostics">
          <div className="surface-science-header">TECHNICAL DIAGNOSTICS <strong>VIIRS · LAND</strong></div>
          <button type="button" aria-pressed={satelliteSurface}
            onClick={() => setSatelliteSurface(current => !current)}>
            {satelliteSurface ? "DISABLE" : "ENABLE"} EXPERIMENTAL SURFACE
          </button>
          <p>{satelliteSurfaceStatus}</p>
          {satelliteSurface && (
            <p>{landFusionStats
              ? "APPLIED TO GLOBE · "+Math.round(landFusionStats.acceptedPixels/landFusionStats.totalPixels*1000)/10+
                "% OF FULL TEXTURE PIXELS · "+landFusionStats.date+" · "+landFusionStats.sensor
              : "WAITING FOR VERIFIED LAND PIXELS · CINEMA BASE PROTECTED"}</p>
          )}
          <small>DAILY SURFACE ONLY · DAY SIDE · NOT CLOUDS · NOT GLOBAL LIVE VIDEO</small>
        </aside>
      )}


      {cloudPreviewControls && (
        <aside className="cloud-v3-dock hud" data-cloud-qa-build="indian-ocean-v1" aria-label="Satellite cloud preview controls">
          <div className="cloud-v3-heading">
            <span>CLOUD ENGINE</span>
            <strong>V3 SCIENTIFIC CLOUDS</strong>
          </div>
          {cloudSafetyNotice && <p role="status" className="cloud-v3-readout" style={{padding:"10px 14px",fontSize:"11px",lineHeight:1.5,color:"#e5b974"}}>{cloudSafetyNotice}</p>}
          <div className="cloud-v3-switch">
            <button className={cloudEngine !== "v3" ? "active" : ""} onClick={() => changeCloudEngine("legacy")}>STANDARD</button>
            <button className={cloudEngine === "v3" ? "active" : ""} onClick={() => changeCloudEngine("v3")}>SCIENTIFIC V3</button>
          </div>
          {cloudEngine === "v3" && (
            <div aria-label="V3 diagnostic views" style={{fontSize:"10px",padding:"7px 3px"}}>
              <div style={{display:"flex",gap:"6px"}}>
                {([["VISUAL",0],["SOURCES",4],["DAY / NIGHT",5]] as const).map(([label,mode])=>(
                  <button key={mode} aria-pressed={cloudDebugMode===mode}
                    onClick={()=>changeCloudDebugMode(mode)}
                    style={{flex:1,minWidth:0,padding:"7px 2px",borderRadius:"7px",
                      background:cloudDebugMode===mode?"#194b70":"#101a26",
                      color:cloudDebugMode===mode?"#e8f4ff":"#92a7bb",
                      border:"1px solid #284254",fontSize:"10px",cursor:"pointer"}}>
                    {label}
                  </button>
                ))}
              </div>
              {cloudDebugMode===4 && (
                <div role="note" style={{padding:"8px 2px 0",lineHeight:1.7,color:"#d1dae4"}}>
                  <span style={{color:"#f24754"}}>● L2</span>{" · "}
                  <span style={{color:"#20d3d9"}}>● NOAA IR</span>{" · "}
                  <span style={{color:"#ffba36"}}>● Meteosat</span>{" · "}
                  <span style={{color:"#a85ef0"}}>● GFS model</span>
                </div>
              )}
              {cloudDebugMode===5 && (
                <div role="note" style={{padding:"8px 2px 0",lineHeight:1.4,color:"#d1dae4"}}>
                  <span style={{color:"#c4def2"}}>● DAY</span>{" · "}
                  <span style={{color:"#4269a0"}}>● NIGHT</span>{" · "}
                  shading transition is continuous
                </div>
              )}
            </div>
          )}
          {cloudEngine === "v3" && (
            <div className="cloud-v3-readout" aria-live="polite">
              <strong>{cloudHealthLabel.label}</strong>
              <small>{cloudHealthLabel.description}{cloudHealthLabel.observedAt ? " · OBS "+cloudObservedUtc : ""}</small>
              <span>{cloudTelemetry?.status === "observed" && cloudTelemetry.engine === "v3"
                ? "VERIFIED L2 OBSERVATIONS"
                : cloudTelemetry?.status === "visual" && cloudTelemetry.engine === "v3"
                  ? (cloudTelemetry.archiveAge
                      ? "LAST VERIFIED SCAN · VISUAL ONLY · NOT LIVE"
                      : cloudTelemetry.irArchiveAge
                        ? "ARCHIVED NOAA IR · VISUAL ONLY · NOT LIVE"
                        : "LIVE VISUAL BACKUP · LEVEL-2 OFFLINE")
                  : cloudTelemetry?.status === "fallback" && cloudTelemetry.engine === "v3"
                    ? "WAITING FOR VERIFIED SATELLITE DATA"
                    : "ACQUIRING SCIENCE ATLAS"}</span>
              <strong>{cloudTelemetry?.status === "observed" && cloudTelemetry.engine === "v3"
                ? (cloudTelemetry.coverage * 100).toFixed(1) + "% OBSERVED FOOTPRINT"
                : cloudTelemetry?.status === "visual" && cloudTelemetry.engine === "v3"
                  ? (cloudTelemetry.archiveAge
                      ? "0% CURRENT L2 · " + cloudTelemetry.archiveAge
                      : "0% CURRENT VERIFIED L2 · VISUAL BACKUP ACTIVE")
                  : "COVERAGE PENDING"}</strong>
              {cloudTelemetry?.engine === "v3" && cloudTelemetry.sources.length > 0 && (
                <small>{cloudTelemetry.sources.map(s => s.toUpperCase()).join(" · ")}</small>
              )}
              {cloudTelemetry?.engine === "v3" && (cloudTelemetry.sourceAges?.length ?? 0) > 0 && (
                <small>{cloudTelemetry.sourceAges!.join(" · ")}</small>
              )}
              {cloudTelemetry?.engine === "v3" && (cloudTelemetry.visualCoverage ?? 0) > 0 && (
                <small className="cloud-v3-visual">
                  {cloudTelemetry.status === "visual" ? "" : "+"}{((cloudTelemetry.visualCoverage ?? 0) * 100).toFixed(1)}% {cloudTelemetry.gmgsiCoverage ? "SATELLITE VISUAL IR + WMS (NOT VERIFIED L2)" : (cloudTelemetry.status === "visual" ? "ACTIVE GEO WMS VISUAL" : "KEYLESS WMS VISUAL FILL")}
                  {" · "}{(cloudTelemetry.visualSources || []).map(s => s.toUpperCase()).join(" + ")}
                </small>
              )}
              {cloudTelemetry?.engine === "v3" && (cloudTelemetry.gmgsiCoverage ?? 0) > 0 && (
                <small className="cloud-v3-visual">
                  NOAA GMGSI IR: {(100*(cloudTelemetry.gmgsiCoverage ?? 0)).toFixed(1)}% GRID · {cloudTelemetry.irArchiveAge
                    ? "ARCHIVED " + cloudTelemetry.irArchiveAge + " · NOT LIVE · "
                    : ""}SATELLITE VISUAL · NOT CLOUD MASK
                </small>
              )}
              {cloudTelemetry?.engine === "v3" && (cloudTelemetry.modelCoverage ?? 0) > 0 && (
                <small className="cloud-v3-model">
                  +{((cloudTelemetry.modelCoverage ?? 0) * 100).toFixed(1)}% NOAA GFS GLOBAL MODEL
                  {" · "}{cloudTelemetry.modelAge} OLD · NOT SATELLITE
                </small>
              )}
              {cloudTelemetry?.engine === "v3" && (cloudTelemetry.displayFootprint ?? 0) > 0 && (
                <small className="cloud-v3-visual">
                  {(Math.min(1,cloudTelemetry.displayFootprint ?? 0) * 100).toFixed(1)}% GLOBAL DATA COVERAGE
                </small>
              )}
              {(cloudTelemetry?.status === "fallback" || cloudTelemetry?.status === "visual") &&
                cloudTelemetry.engine === "v3" && (
                <small>{cloudTelemetry.fallbackReasons.join(" · ")}</small>
              )}
              <small className="cloud-v3-disclaimer">NOAA/JMA QA-SCREENED L2 · GMGSI IR / METEOSAT WMS VISUAL ONLY · GFS IS MODEL</small>
            </div>
          )}
        </aside>
      )}

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
          <button className="control-center-trigger" onClick={() => setControlPanel(current => current ? null : "layers")}
            aria-expanded={controlPanel !== null} aria-controls="cupola-control-center" aria-label="Open Earth controls">
            <Layers3 size={15} /><span>CONTROLS</span>
          </button>
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
            <button className={weatherLayer === "PRESSURE" ? "active" : ""} onClick={() => activateWeatherLayer("PRESSURE")}><Gauge size={16} /><span>PRESSURE</span><small>{weather?.pressure != null ? Math.round(weather.pressure) + " HPA · LOCAL" : "SELECT PLACE"}</small></button>
            <button className={weatherLayer === "SNOW" ? "active" : ""} onClick={() => activateWeatherLayer("SNOW")}><Snowflake size={16} /><span>SNOW</span><small>{weather?.snowfall != null ? weather.snowfall.toFixed(1) + " CM · LOCAL" : "SELECT PLACE"}</small></button>
          </div>
          <div className="weather-source-note">
            {weatherLayer === "RAIN" ? "PRECIPITATION · NASA GIBS IMERG NRT" : weatherLayer === "CLOUDS" ? "CLOUDS · GOES / MTG / HIMAWARI NRT · MODIS FALLBACK" : "LOCAL POINT FORECAST · OPEN-METEO · NOT A GLOBAL WEATHER RASTER"}
          </div>
        </section>
      )}

      <OrbitalContextPanel
        satellite={selectedSatellite}
        station={iss}
        followingStation={followIss}
        followingSatellite={followSatellite}
        event={discoveryFocus}
        place={selectedPlace ? {name:selectedPlace.name,country:selectedPlace.country,
          latitude:selectedPlace.latitude,longitude:selectedPlace.longitude} : null}
        currentLocation={showCurrentLocationContext && coords ?
          {name:"YOUR LOCATION",latitude:coords.lat,longitude:coords.lon} : null}
        sunrise={followSunrise ? {longitude:solarNow.sunriseLongitude,
          declination:solarNow.declinationDegrees} : null}
        catalogGeneratedAt={satelliteData?.generatedAt ?? null}
        onFollowSelected={toggleFollowSatellite}
        onFollowStation={toggleFollowIss}
        onClear={closeContextFocus}
        onNextEvent={exploreEarthNow}
      />

      {controlPanel && (
        <aside id="cupola-control-center" className="controls panel hud cupola-control-center"
          data-control-center={controlPanel} aria-label="Earth control center">
          <div className="control-center-header">
            <div><small>CUPOLA / EARTH SYSTEMS</small><strong>CONTROL CENTER</strong></div>
            <button aria-label="Close controls" onClick={() => setControlPanel(null)}><X size={16}/></button>
          </div>
          <div className="control-center-tabs" role="tablist" aria-label="Control category">
            {(["view","layers","events"] as const).map(tab => (
              <button key={tab} role="tab" aria-selected={controlPanel === tab}
                onClick={() => setControlPanel(tab)}>
                {tab === "view" ? "VIEW" : tab === "layers" ? "LAYERS" : "EVENTS"}
              </button>
            ))}
          </div>
          <div className="control-center-content" role="tabpanel" aria-label={controlPanel}>
            {controlPanel === "view" && (
              <div className="control-center-section">
                <p className="control-center-caption">CHOOSE YOUR PERSPECTIVE</p>
        {(["ISS CUPOLA", "GEOSTATIONARY", "SUN–EARTH L1", "FREE CAMERA", "SUN VIEW"] as ViewMode[]).map((item) => (
          <button className="radio-row" key={item} onClick={() => { closeContextFocus(); setView(item); setControlPanel(null); }}>
            <span className={"radio " + (view === item ? "active" : "")} />
            {item}
          </button>
        ))}
                <div className="control-center-divider"/>
                <p className="control-center-caption">TRACKING</p>
                <button className="control-center-action" onClick={() => {toggleFollowSunrise();setControlPanel(null);}}>
                  <Sun size={15}/> {followSunrise ? "STOP FOLLOWING SUNRISE" : "FOLLOW SUNRISE"}
                </button>
                <button className="control-center-action" disabled={!iss}
                  onClick={() => {toggleFollowIss();setControlPanel(null);}}>
                  <Satellite size={15}/> {followIss ? "STOP FOLLOWING ISS" : "FOLLOW ISS"}
                </button>
              </div>
            )}
            {controlPanel === "layers" && (
              <div className="control-center-section">
                <p className="control-center-caption">VISIBLE EARTH LAYERS · LIVE / NRT / MODEL</p>
        <LayerRow checked={layers.clouds} label="Clouds" status={cloudHealthLabel.label}
          tone={cloudHealthLabel.state==="LIVE" ? "live" : "forecast"}
          onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
        {layers.clouds && (
          <p role="status" aria-live="polite" style={{fontSize:10,lineHeight:1.5,color:"#93a9bb",margin:"-3px 10px 7px 39px"}}>
            {cloudHealthLabel.description}
            {cloudHealthLabel.observedAt ? " · OBS "+cloudObservedUtc : ""}
            {cloudTelemetry?.status==="observed" && cloudHealthLabel.state!=="OFFLINE"
              ? " · "+(cloudTelemetry.coverage*100).toFixed(1)+"% VERIFIED L2 FOOTPRINT" : ""}
            {cloudGpuApply?.kind==="verified-l2" ?
              " · ON GLOBE "+cloudGpuApply.appliedAt.slice(11,16)+" UTC · ATLAS "+cloudGpuApply.version : ""}
            {cloudGpuApply?.kind==="visual-backup" ? " · ON GLOBE: VISUAL BACKUP (NOT VERIFIED L2)" : ""}
          </p>
        )}
        <LayerRow checked={layers.precipitation} label="Precipitation" status="NRT SAT" tone="forecast" onChange={() => setLayers({ ...layers, precipitation: !layers.precipitation })} />
        <LayerRow checked={layers.cityLights} label="City lights" status={cityLightsStatus} tone={nightLightsMeta?.imageryDate === "2016-composite" ? "model" : "forecast"} onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
        <LayerRow checked={layers.aurora} label="Aurora oval" status={!earthFeeds.aurora ? "SOURCE OFFLINE" : auroraStatus + (auroraAge ? " · OBS " + auroraAge : "")} tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
        <LayerRow checked={layers.earthquakes} label="Earthquakes" status={strongestRecentEarthquake ? "M" + strongestRecentEarthquake.magnitude.toFixed(1) + (strongestEarthquakeAge ? " · " + strongestEarthquakeAge : "") : earthquakeAge ? "USGS " + earthquakeAge : "USGS LIVE"} tone="live" onChange={() => setLayers({ ...layers, earthquakes: !layers.earthquakes })} />
        <LayerRow checked={layers.storms} label="Tropical cyclones" status={!earthFeeds.storms ? "SOURCE OFFLINE" : storms.length ? "NHC ADVISORY " + storms.length + (stormsAge ? " · " + stormsAge : "") : "NO CURRENT NHC ADVISORIES"} tone="forecast" onChange={() => setLayers({ ...layers, storms: !layers.storms })} />
        <LayerRow checked={layers.wildfires} label="Wildfires" status={wildfireData ? wildfireStatus + (wildfireAge ? " · " + wildfireAge : "") : "NASA"} tone="forecast" onChange={() => setLayers({ ...layers, wildfires: !layers.wildfires })} />
        <LayerRow checked={layers.volcanoes} label="Volcanoes" status={!earthFeeds.volcanoes ? "SOURCE OFFLINE" : volcanoData?.recentReportCount ? volcanoData.recentReportCount + " RECENT REPORTS" + (mostRecentVolcanoAge ? " · " + mostRecentVolcanoAge : "") : volcanoData?.volcanoes.length ? volcanoData.volcanoes.length + " HISTORICAL REPORTS" : "NO VERIFIED REPORTS"} tone="forecast" onChange={() => setLayers({ ...layers, volcanoes: !layers.volcanoes })} />
        <LayerRow checked={layers.satellites} label="Satellites" status={satelliteFeedStale && layers.satellites ? "ORBIT FEED STALE" : satelliteData ? satelliteData.count + " TRACKED" : "CELESTRAK"} tone="live" onChange={toggleSatelliteLayer} load={satelliteLoad} />
        <LayerRow checked={layers.lightning} label="Lightning" status={observedLightning.glmObservedActive ? "GLM FLASHES · NOAA" : observedLightningZones > 0 ? "OBS " + observedLightningZones + (observedFreshnessLabel ? " · " + observedFreshnessLabel : "") : modelLightningVisible.length > 0 ? "MODEL FALLBACK" : "NO ACTIVITY"} tone="forecast" onChange={() => setLayers({ ...layers, lightning: !layers.lightning })} />

              </div>
            )}
            {controlPanel === "events" && (
              <div className="control-center-section">
                <p className="control-center-caption">EXPLORE OBSERVED EVENTS & FORECASTS</p>
        <div className="weather-entry">
          <button onClick={() => {exploreEarthNow();setControlPanel(null);}} disabled={!discoveryEvents.length}>{discoveryFocus ? "NEXT EARTH EVENT" : "EXPLORE EARTH NOW"}</button>
        </div>
        <details className="earth-event-shortcuts">
          <summary>EVENT SHORTCUTS</summary>
          <div>
            <button disabled={!discoveryEvents.some(e=>e.kind==="CYCLONE")} onClick={()=>{focusEventKind("CYCLONE");setControlPanel(null);}}>VIEW STORM</button>
            <button disabled={!discoveryEvents.some(e=>e.kind==="EARTHQUAKE")} onClick={()=>{focusEventKind("EARTHQUAKE");setControlPanel(null);}}>VIEW QUAKE</button>
            <button disabled={!discoveryEvents.some(e=>e.kind==="AURORA")} onClick={()=>{focusEventKind("AURORA");setControlPanel(null);}}>VIEW AURORA</button>
            <button disabled={!discoveryEvents.some(e=>e.kind==="WILDFIRE")} onClick={()=>{focusEventKind("WILDFIRE");setControlPanel(null);}}>VIEW FIRE</button>
            <button disabled={!discoveryEvents.some(e=>e.kind==="VOLCANO")} onClick={()=>{focusEventKind("VOLCANO");setControlPanel(null);}}>VIEW VOLCANO</button>
          </div>
        </details>
        <div className="weather-entry">
          <button onClick={() => {setSurfaceMode(surfaceMode === "WEATHER" ? "EARTH" : "WEATHER");setControlPanel(null);}}>{surfaceMode === "WEATHER" ? "BACK TO EARTH" : "WEATHER FROM SPACE"}</button>
        </div>

        <div className="lightning-source-compare">
          <span className="lightning-observation-summary" title="Observed NOAA and MTG lightning-active regions; model forecast is identified separately.">
            {"GLM " + (observedLightning.glmObservedActive ? "INDIVIDUAL FLASHES · " + (observedLightning.glmFlashCount ?? 0) + " RECORDS · " : "NO LIVE FLASH FEED · ") + "OBS " + observedLightningZones + " ZONES · MODEL " + modelLightningVisible.length}
          </span>
          <a className="lightning-reference-link" href="https://www.lightningmaps.org/?lang=uk#m=ses;t=3;s=0;o=0;b=;ts=0;" target="_blank" rel="noopener noreferrer"
            title="Independent lightning map from Blitzortung.org. Different sensor network and time window. Not a CUPOLA data source. Animated bolts are illustrative, not individual measured strikes.">
            COMPARE INDEPENDENT LIGHTNING ↗
          </a>
          {(observedHotspot || modelLightningVisible.length > 0) && (
            <button className="orbital-lightning-jump"
              title={observedHotspot ? "Fly to an observed lightning-active zone. Animated bolts are illustrative." : "Fly to model-forecast storm potential, not observed lightning"}
              onClick={() => {if(observedHotspot)focusObservedLightning();else focusEventKind("LIGHTNING MODEL");setControlPanel(null);}}>
              {observedHotspot ? "VIEW STORM FLASHES" : "VIEW MODEL STORMS"}
            </button>
          )}
        </div>

              </div>
            )}
          </div>
          <div className="gaia-sky-attribution">
            SKY MAP · <a href="https://www.esa.int/ESA_Multimedia/Images/2020/12/The_colour_of_the_sky_from_Gaia_s_Early_Data_Release_32"
              target="_blank" rel="noopener noreferrer">ESA/Gaia/DPAC</a>
            <span> · A. Moitinho · </span>
            <a href="https://creativecommons.org/licenses/by-sa/3.0/igo/"
              target="_blank" rel="noopener noreferrer">CC BY-SA 3.0 IGO</a>
            <span> · ADAPTED</span>
          </div>
        </aside>
      )}

      <div className="hud-bottom-layout">
      <section className={"location-card hud"+(hasContextFocus?" location-card-context-active":"")}>
        <div className="location-actions">
          <button className="locate-button" onClick={locateMe}>
            <LocateFixed size={15}/>{locating ? "LOCATING…" : coords ? "CENTER ON ME" : "FIND ME"}
          </button>
          <button className="locate-button secondary" onClick={() => setSearchOpen(true)}>
            <Search size={15}/> SEARCH EARTH
          </button>
          <button className="locate-button secondary" onClick={() => {
            closeContextFocus();
            setView("MOON");
            setControlPanel(null);
          }} aria-label="View and orbit the Moon">
            <Moon size={15}/> VIEW MOON
          </button>
          <button className="locate-button secondary" onClick={toggleFollowIss} disabled={!iss}
            aria-pressed={followIss}>
            <Satellite size={15}/>{followIss ? "STOP ISS" : "FOLLOW ISS"}
          </button>
          <button className="locate-button secondary" onClick={exploreEarthNow}
            disabled={!discoveryEvents.length}>
            <Sparkles size={15}/>{discoveryFocus ? "NEXT EVENT" : "EXPLORE EVENTS"}
          </button>
        </div>
      </section>

      <div className="mode-switch panel hud">
        <button className={mode === "CINEMA" ? "active" : ""} onClick={() => {setControlPanel(null);setMode("CINEMA");}}>CINEMA</button>
        <button className={mode === "EXPLORE" ? "active" : ""} onClick={() => setMode("EXPLORE")}>EXPLORE</button>
      </div>
      </div>

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

      <nav className={"mobile-nav hud"+(hasContextFocus?" mobile-nav--object":" mobile-nav--two")}>
        <button onClick={locateMe}><Crosshair size={18} /><span>Find me</span></button>
        <button data-control-trigger onClick={() => {setMobilePanel(null);setControlPanel(current => current ? null : "layers");}}
          aria-expanded={controlPanel !== null}><Layers3 size={18} /><span>Controls</span></button>
        {hasContextFocus && <button onClick={() => setMobilePanel("now")}><Satellite size={18} /><span>Object</span></button>}
      </nav>

      {mobilePanel === "now" && (
        <div className="mobile-sheet mobile-object-sheet">
          <div className="sheet-head"><strong>OBJECT IN FOCUS</strong>
            <button aria-label="Close object details" onClick={() => setMobilePanel(null)}><X size={18}/></button>
          </div>
            <OrbitalContextPanel
              mobile satellite={selectedSatellite} station={iss}
              followingStation={followIss} followingSatellite={followSatellite}
              event={discoveryFocus}
              place={selectedPlace ? {name:selectedPlace.name,country:selectedPlace.country,
                latitude:selectedPlace.latitude,longitude:selectedPlace.longitude} : null}
              currentLocation={showCurrentLocationContext && coords ?
                {name:"YOUR LOCATION",latitude:coords.lat,longitude:coords.lon} : null}
              sunrise={followSunrise ? {longitude:solarNow.sunriseLongitude,
                declination:solarNow.declinationDegrees} : null}
              catalogGeneratedAt={satelliteData?.generatedAt ?? null}
              onFollowSelected={() => {toggleFollowSatellite();setMobilePanel(null);}}
              onFollowStation={() => {toggleFollowIss();setMobilePanel(null);}}
              onClear={closeContextFocus}
              onNextEvent={exploreEarthNow}
            />
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
            <span>Full controls and real-time Earth layers.</span>
          </div>
          <div className="concept-earth earth-center" />
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
