"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Cloud, CloudRain, Crosshair, Layers3, LocateFixed, Pause, Play, Satellite, Search, Share2, Sparkles, Sun, Thermometer, Volume2, VolumeX, Wind, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CINEMA_PRESET, LIVE_PRESET } from "@/lib/earth/presets";
import { LIVE_CLOUD_FRAGMENT_SHADER, LIVE_CLOUD_SHADOW_FRAGMENT_SHADER, LIVE_CLOUD_VERTEX_SHADER } from "@/lib/earth/liveCloudShader";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "SUN–EARTH L1" | "MOON" | "FREE CAMERA";
type ExperienceMode = "CINEMA" | "EXPLORE";
type SurfaceMode = "EARTH" | "WEATHER";
type WeatherLayer = "CLOUDS" | "RAIN" | "WIND" | "TEMPERATURE";
type IssData = { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number };
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; weatherCode: number; isDay: boolean; sunrise: string | null; sunset: string | null; timezone: string; updatedAt: string };
type SpaceWeatherData = { kp: number; updatedAt: string; source: string };
type NightLightsMeta = { source: string; imageryDate: string; ageHours: number | null };
type EarthquakeEvent = { id: string; latitude: number; longitude: number; depth: number; magnitude: number; place: string; time: number; url: string | null };
type TropicalStorm = { id: string; name: string; basin: string; latitude: number; longitude: number; windKnots: number | null; pressure: number | null; category: number | null; stormType: string; advisory: string | null; updatedAt: string; source: string };
type LightningModelPoint = { latitude: number; longitude: number; density: number; validTime: string | null };
type AuroraPoint = { latitude: number; longitude: number; intensity: number };
type AuroraData = { points: AuroraPoint[]; source: string; forecastTime: string | null; observationTime: string | null; updatedAt: string };
type PlaceResult = { id: number; name: string; country: string; admin1: string | null; latitude: number; longitude: number; timezone: string };

const DAY_TEXTURE = "/api/earth-texture?type=day";
const NIGHT_TEXTURE = "/api/night-lights";
const NIGHT_BASE_TEXTURE = "/api/earth-texture?type=night";
const STATIC_CLOUD_TEXTURE = "/api/earth-texture?type=clouds";
const LIVE_CLOUD_TEXTURE = "/api/clouds-live";
const GEO_CLOUD_TEXTURES = {
  east: "/api/clouds-geostationary?source=goes-east",
  west: "/api/clouds-geostationary?source=goes-west",
  himawari: "/api/clouds-geostationary?source=himawari",
} as const;
const PRECIP_TEXTURE = "/api/precipitation";
const LIGHTNING_TEXTURE = "/api/lightning";
const LIGHTNING_EUMETSAT_TEXTURE = "/api/lightning-eumetsat";
const NORMAL_TEXTURE = "/api/earth-texture?type=normal";
const SPECULAR_TEXTURE = "/api/earth-texture?type=specular";

const EARTH_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*worldPosition; }";
const EARTH_FRAGMENT_SHADER = "uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 s=normalize(sunDirection); vec3 v=normalize(cameraPosition-vWorldPosition); float sunDot=dot(n,s); float dayMix=smoothstep(-0.075,0.015,sunDot); vec3 day=texture2D(dayTexture,vUv).rgb; day=pow(day,vec3(0.93)); day*=vec3(0.96,0.99,1.025); vec3 night=texture2D(nightTexture,vUv).rgb; night=pow(night,vec3(0.78)); float ocean=smoothstep(0.015,0.16,day.b-max(day.r,day.g)*0.78); float diffuse=0.58+0.52*max(sunDot,0.0); vec3 h=normalize(s+v); float spec=pow(max(dot(n,h),0.0),90.0)*ocean*max(sunDot,0.0)*0.28; float twilight=1.0-smoothstep(0.00,0.10,abs(sunDot)); vec3 dayLit=day*diffuse+vec3(0.42,0.62,0.95)*spec; vec3 nightSide=day*0.010+night*vec3(1.0,0.72,0.34)*1.55*lightsEnabled; vec3 color=mix(nightSide,dayLit,dayMix); color+=vec3(1.0,0.37,0.10)*twilight*0.045; float limb=pow(1.0-max(dot(n,v),0.0),4.0); color+=vec3(0.08,0.23,0.52)*limb*0.10; gl_FragColor=vec4(color,1.0); }"

const LIGHTNING_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";
const LIGHTNING_FRAGMENT_SHADER = "uniform sampler2D lightningTexture; uniform sampler2D lightningEuropeTexture; uniform float time; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); } void main(){ vec4 src=texture2D(lightningTexture,vUv); vec4 srcEu=texture2D(lightningEuropeTexture,vUv); float density=max(max(src.a,max(max(src.r,src.g),src.b)),max(srcEu.a,max(max(srcEu.r,srcEu.g),srcEu.b))); density=smoothstep(0.055,0.42,density); if(density<0.001) discard; vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); float facing=smoothstep(0.02,0.20,dot(n,v)); vec2 cell=floor(vUv*vec2(720.0,360.0)); float seed=hash(cell); float phase=fract(time*(0.34+seed*0.46)+seed*9.7); float flash=exp(-phase*22.0); float secondary=exp(-abs(phase-0.16)*34.0)*0.42; float activity=clamp(flash+secondary,0.0,1.0); float base=density*(0.10+0.16*seed); float alpha=(base+density*activity*0.88)*facing; vec3 electric=mix(vec3(0.16,0.46,1.15),vec3(0.92,1.18,1.42),activity); gl_FragColor=vec4(electric*(base*0.72+density*activity*3.4),alpha); }";

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


function getSunDirection(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // Approximate solar declination (radians).
  const g = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const dec =
    0.006918
    - 0.399912 * Math.cos(g)
    + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g)
    + 0.00148 * Math.sin(3 * g);

  // Sub-solar longitude: ~0° at 12:00 UTC, east-positive before noon.
  const subSolarLon = THREE.MathUtils.degToRad((12 - hour) * 15);

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
  }>({ east: null, west: null, himawari: null });
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
        ["east" | "west" | "himawari", string]
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
      (["east", "west", "himawari"] as const).forEach((key) => {
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

  useFrame((_state, delta) => {
    uniforms.sunDirection.value.copy(getSunDirection(new Date()));

  });

  const markerPoint = props.marker ? latLonToPoint(props.marker.lat, props.marker.lon) : null;

  return (
    <group position={GLOBE_CENTER} scale={props.cinematic ? GLOBE_SCALE * 0.96 : GLOBE_SCALE} rotation={GLOBE_ROTATION}>
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
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float facing = max(dot(normalize(vWorldNormal), viewDir), 0.0);
    float horizonFade = smoothstep(0.015, 0.16, facing);

    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float ribbonCore = smoothstep(0.0, 0.28, across) * smoothstep(0.0, 0.16, across);

    float waveA = sin(vUv.x * 118.0 + uTime * (0.78 + uLayer * 0.14));
    float waveB = sin(vUv.x * 247.0 - uTime * 0.41 + vUv.y * 7.0);
    float streak = pow(0.5 + 0.5 * waveA, 7.0) * 0.62 + pow(0.5 + 0.5 * waveB, 10.0) * 0.28;
    streak += noise(vec2(vUv.x * 38.0 + uTime * 0.022, vUv.y * 9.0)) * 0.22;

    float intensity = smoothstep(0.08, 0.82, vIntensity);
    float pulse = 0.86 + 0.14 * sin(uTime * 0.52 + vUv.x * 21.0);

    float alpha = intensity * ribbonCore * (0.20 + streak * 0.82) * horizonFade * pulse * uOpacity;
    if (alpha < 0.006) discard;

    vec3 green = vec3(0.03, 1.00, 0.42);
    vec3 cyan = vec3(0.07, 0.82, 1.00);
    vec3 violet = vec3(0.48, 0.24, 1.00);

    vec3 color = mix(green, cyan, smoothstep(0.35, 0.95, streak) * 0.42);
    color = mix(color, violet, smoothstep(0.68, 1.0, vIntensity) * pow(streak, 3.0) * 0.22);

    gl_FragColor = vec4(color * alpha * (1.55 + uLayer * 0.34), alpha);
  }
`;

function buildAuroraRibbonGeometry(points: AuroraPoint[], hemisphere: 1 | -1) {
  const step = 3;
  const bins: Array<{ lon: number; lat: number; intensity: number } | null> = [];

  for (let lon = -180; lon <= 180; lon += step) {
    let best: AuroraPoint | null = null;
    let bestScore = -Infinity;

    for (const point of points) {
      const pLon = point.longitude > 180 ? point.longitude - 360 : point.longitude;
      if (Math.abs(pLon - lon) > step * 0.6) continue;
      if (hemisphere === 1 && point.latitude < 48) continue;
      if (hemisphere === -1 && point.latitude > -48) continue;

      const polarLat = Math.abs(point.latitude);
      if (polarLat > 84) continue;

      const score = point.intensity - Math.abs(polarLat - 67) * 0.12;
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }

    if (!best || best.intensity < 8) {
      bins.push(null);
      continue;
    }

    bins.push({
      lon,
      lat: best.latitude,
      intensity: THREE.MathUtils.clamp(best.intensity / 100, 0, 1),
    });
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const intensities: number[] = [];
  const radius = 2.5;

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
    if (Math.abs(a.lat - b.lat) > 10) continue;

    const widthA = THREE.MathUtils.lerp(1.7, 4.8, a.intensity);
    const widthB = THREE.MathUtils.lerp(1.7, 4.8, b.intensity);
    const sign = hemisphere;

    const aInner = a.lat - sign * widthA * 0.5;
    const aOuter = a.lat + sign * widthA * 0.5;
    const bInner = b.lat - sign * widthB * 0.5;
    const bOuter = b.lat + sign * widthB * 0.5;

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
  }), [opacity, layer]);

  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
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

function AuroraOvalLayer({ points }: { points: AuroraPoint[] }) {
  const north = useMemo(() => buildAuroraRibbonGeometry(points, 1), [points]);
  const south = useMemo(() => buildAuroraRibbonGeometry(points, -1), [points]);

  useEffect(() => {
    return () => {
      north.dispose();
      south.dispose();
    };
  }, [north, south]);

  if (!points.length) return null;

  return (
    <group position={GLOBE_CENTER} rotation={GLOBE_ROTATION} scale={GLOBE_SCALE}>
      <AuroraRibbon geometry={north} layer={0} opacity={0.58} scale={1.0108} />
      <AuroraRibbon geometry={north} layer={1} opacity={0.22} scale={1.0185} />
      <AuroraRibbon geometry={south} layer={0} opacity={0.52} scale={1.0108} />
      <AuroraRibbon geometry={south} layer={1} opacity={0.18} scale={1.0185} />
    </group>
  );
}

function SeismicMarker({ event, index }: { event: EarthquakeEvent; index: number }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const magnitude = THREE.MathUtils.clamp(event.magnitude, 2.5, 7.8);
  const strength = THREE.MathUtils.clamp((magnitude - 2.5) / 5.3, 0, 1);
  const point = useMemo(
    () => globeWorldPoint(event.latitude, event.longitude, 0.014),
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
    if (magnitude >= 6.5) return { core: "#fff4dc", glow: "#ff5b42", ring: "#ff7456" };
    if (magnitude >= 5.2) return { core: "#fff0cc", glow: "#ff9952", ring: "#ffb56a" };
    return { core: "#fff0c9", glow: "#e2a55c", ring: "#e7b872" };
  }, [magnitude]);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;

    const viewDir = camera.position.clone().sub(point).normalize();
    const facing = THREE.MathUtils.clamp(normal.dot(viewDir), -1, 1);
    const horizonFade = THREE.MathUtils.smoothstep(facing, 0.035, 0.20);

    if (groupRef.current) {
      groupRef.current.visible = horizonFade > 0.015;
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.72, 1.0, horizonFade));
    }
    const speed = THREE.MathUtils.lerp(0.38, 0.68, strength);
    const phase = (t * speed + index * 0.173) % 1;
    const phaseB = (phase + 0.46) % 1;

    const pulse = 0.78 + Math.sin((t * (1.15 + strength * 0.65) + index) * Math.PI * 2) * 0.14;

    if (coreRef.current) {
      const s = THREE.MathUtils.lerp(0.78, 1.42, strength) * pulse;
      coreRef.current.scale.setScalar(s);
    }

    if (glowRef.current) {
      const s = THREE.MathUtils.lerp(2.0, 3.35, strength) * (0.92 + pulse * 0.10);
      glowRef.current.scale.setScalar(s);
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(0.10, 0.19, strength) * (0.84 + pulse * 0.08) * horizonFade;
    }

    const animateRing = (mesh: THREE.Mesh | null, p: number, second = false) => {
      if (!mesh) return;
      const eased = 1 - Math.pow(1 - p, 2);
      const base = THREE.MathUtils.lerp(1.5, 2.15, strength);
      const spread = THREE.MathUtils.lerp(2.55, 3.85, strength);
      const s = base + eased * spread;
      mesh.scale.setScalar(s);
      const material = mesh.material as THREE.MeshBasicMaterial;
      const fade = Math.pow(1 - p, 1.7);
      material.opacity = fade * THREE.MathUtils.lerp(second ? 0.09 : 0.14, second ? 0.15 : 0.23, strength) * horizonFade;
    };

    animateRing(ringARef.current, phase, false);
    if (magnitude >= 4.8) animateRing(ringBRef.current, phaseB, true);
  });

  const coreRadius = THREE.MathUtils.lerp(0.010, 0.018, strength);

  return (
    <group ref={groupRef} position={point} quaternion={quaternion}>
      <mesh ref={glowRef} renderOrder={10}>
        <circleGeometry args={[coreRadius * 2.35, 32]} />
        <meshBasicMaterial
          color={palette.glow}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={ringARef} renderOrder={9}>
        <ringGeometry args={[coreRadius * 2.25, coreRadius * 2.52, 48]} />
        <meshBasicMaterial
          color={palette.ring}
          transparent
          opacity={0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {magnitude >= 4.8 && (
        <mesh ref={ringBRef} renderOrder={9}>
          <ringGeometry args={[coreRadius * 2.1, coreRadius * 2.35, 48]} />
          <meshBasicMaterial
            color={palette.ring}
            transparent
            opacity={0.10}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}

      <mesh ref={coreRef} renderOrder={11}>
        <circleGeometry args={[coreRadius, 28]} />
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
        const scoreA = a.magnitude * 1.8 + Math.max(0, 1 - (now - a.time) / 86400000) * 1.2;
        const scoreB = b.magnitude * 1.8 + Math.max(0, 1 - (now - b.time) / 86400000) * 1.2;
        return scoreB - scoreA;
      })
      .slice(0, 42);
  }, [events]);

  return (
    <group>
      {visibleEvents.map((event, index) => (
        <SeismicMarker key={event.id} event={event} index={index} />
      ))}
    </group>
  );
}


function StormMarker({ storm, index }: { storm: TropicalStorm; index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const arcRef = useRef<THREE.Mesh>(null);

  const point = useMemo(
    () => globeWorldPoint(storm.latitude, storm.longitude, 0.026),
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
  const radius = THREE.MathUtils.lerp(0.026, 0.046, strength);

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
      const pulse = 1 + Math.sin((t * 1.2 + index * 0.7) * Math.PI * 2) * 0.08;
      coreRef.current.scale.setScalar(pulse);
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.72 + strength * 0.18) * horizonFade;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = -t * (0.26 + strength * 0.18);
      const material = ringRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.18 + strength * 0.08) * horizonFade;
    }

    if (arcRef.current) {
      arcRef.current.rotation.z = t * (0.34 + strength * 0.22);
      const material = arcRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.12 + strength * 0.10) * horizonFade;
    }
  });

  return (
    <group ref={groupRef} position={point} quaternion={quaternion}>
      <mesh ref={ringRef} renderOrder={13}>
        <ringGeometry args={[radius * 1.35, radius * 1.52, 64, 1, 0.22, Math.PI * 1.52]} />
        <meshBasicMaterial
          color="#8fd2ff"
          transparent
          opacity={0.22}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={arcRef} renderOrder={13}>
        <ringGeometry args={[radius * 1.72, radius * 1.86, 64, 1, 2.55, Math.PI * 1.10]} />
        <meshBasicMaterial
          color="#d9efff"
          transparent
          opacity={0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={coreRef} renderOrder={14}>
        <circleGeometry args={[radius * 0.44, 32]} />
        <meshBasicMaterial
          color="#f3fbff"
          transparent
          opacity={0.84}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function StormLayer({ storms }: { storms: TropicalStorm[] }) {
  return (
    <group>
      {storms.slice(0, 12).map((storm, index) => (
        <StormMarker key={storm.id} storm={storm} index={index} />
      ))}
    </group>
  );
}


function LightningLayer() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const currentTextureRef = useRef<THREE.Texture | null>(null);
  const currentEuropeTextureRef = useRef<THREE.Texture | null>(null);
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
    const loader = new THREE.TextureLoader();

    const prepareLightningTexture = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    };

    const load = () => {
      if (cancelled || loading) return;
      loading = true;
      const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
      let pending = 2;

      const finish = () => {
        pending -= 1;
        if (pending <= 0) loading = false;
      };

      loader.load(
        LIGHTNING_TEXTURE + "?v=" + bucket,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            finish();
            return;
          }

          prepareLightningTexture(texture);
          const previous = currentTextureRef.current;
          currentTextureRef.current = texture;
          uniforms.lightningTexture.value = texture;
          if (previous && previous !== texture) previous.dispose();
          finish();
        },
        undefined,
        () => finish(),
      );

      loader.load(
        LIGHTNING_EUMETSAT_TEXTURE + "?v=" + bucket,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            finish();
            return;
          }

          prepareLightningTexture(texture);
          const previous = currentEuropeTextureRef.current;
          currentEuropeTextureRef.current = texture;
          uniforms.lightningEuropeTexture.value = texture;
          if (previous && previous !== texture) previous.dispose();
          finish();
        },
        undefined,
        () => finish(),
      );
    };

    load();
    const interval = window.setInterval(load, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (currentTextureRef.current) currentTextureRef.current.dispose();
      if (currentEuropeTextureRef.current) currentEuropeTextureRef.current.dispose();
      currentTextureRef.current = null;
      currentEuropeTextureRef.current = null;
      transparentFallback.dispose();
    };
  }, [transparentFallback, uniforms]);

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
  const radius = THREE.MathUtils.lerp(0.012, 0.026, strength);

  useFrame(({ clock, camera }) => {
    const viewDir = camera.position.clone().sub(worldPoint).normalize();
    const facing = THREE.MathUtils.clamp(normal.dot(viewDir), -1, 1);
    const horizonFade = THREE.MathUtils.smoothstep(facing, 0.03, 0.18);

    if (groupRef.current) {
      groupRef.current.visible = horizonFade > 0.01;
    }

    if (glowRef.current) {
      const pulse = 0.86 + Math.sin((clock.elapsedTime * (0.48 + strength * 0.24) + index) * Math.PI * 2) * 0.10;
      glowRef.current.scale.setScalar(pulse);
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = (0.035 + strength * 0.055) * horizonFade;
    }
  });

  return (
    <group ref={groupRef} position={worldPoint} quaternion={quaternion}>
      <mesh ref={glowRef} renderOrder={12}>
        <circleGeometry args={[radius * 2.4, 24]} />
        <meshBasicMaterial
          color="#6ea8ff"
          transparent
          opacity={0.05}
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
      {points.slice(0, 90).map((point, index) => (
        <LightningModelPointMarker
          key={point.latitude + ":" + point.longitude}
          point={point}
          index={index}
        />
      ))}
    </group>
  );
}

function Scene(props: { layers: { clouds: boolean; cityLights: boolean; aurora: boolean; precipitation: boolean; earthquakes: boolean; storms: boolean; lightning: boolean }; mode: ExperienceMode; view: ViewMode; marker?: { lat: number; lon: number } | null; windSpeed?: number | null; temperature?: number | null; weatherLayer?: WeatherLayer | null; earthquakes: EarthquakeEvent[]; auroraPoints: AuroraPoint[]; storms: TropicalStorm[]; lightningModelPoints: LightningModelPoint[] }) {
  const preset = props.mode === "CINEMA" ? { ...CINEMA_PRESET, exposure: 1.08, bloomIntensity: 0.22, bloomThreshold: 0.94 } : LIVE_PRESET;
  const controls = useRef<any>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const { camera, size, gl } = useThree();
  const flyTarget = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = preset.exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl, props.mode, preset.exposure]);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height, props.view]);

  useEffect(() => {
    if (!controls.current) return;
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
  }, [props.view, props.mode]);

  useEffect(() => {
    if (!props.marker || !controls.current) return;
    const normal = globeWorldNormal(props.marker.lat, props.marker.lon);
    const distance =
      props.view === "ISS CUPOLA" ? GLOBE_RADIUS + 2.15 :
      props.view === "GEOSTATIONARY" ? GLOBE_RADIUS + 4.75 :
      props.view === "SUN–EARTH L1" ? GLOBE_RADIUS + 5.8 :
      props.view === "MOON" ? GLOBE_RADIUS + 7.1 :
      GLOBE_RADIUS + 3.0;
    flyTarget.current = GLOBE_CENTER.clone().add(normal.multiplyScalar(distance));
  }, [props.marker, props.view]);

  useFrame((_state, delta) => {
    if (sunLight.current) {
      const sun = getSunDirection(new Date());
      sunLight.current.position.copy(GLOBE_CENTER).add(sun.multiplyScalar(24));
      sunLight.current.target.position.copy(GLOBE_CENTER);
      sunLight.current.target.updateMatrixWorld();
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
      <Stars radius={95} depth={60} count={2600} factor={1.65} saturation={0.18} fade speed={0.08} />
      <Earth clouds={props.layers.clouds} cityLights={props.layers.cityLights} aurora={props.layers.aurora} precipitation={props.layers.precipitation} cinematic={props.mode === "CINEMA"} marker={props.marker} windSpeed={props.windSpeed} temperature={props.temperature} weatherLayer={props.weatherLayer} />
      {props.layers.aurora && <AuroraOvalLayer points={props.auroraPoints} />}
      {props.layers.earthquakes && <EarthquakeLayer events={props.earthquakes} />}
      {props.layers.storms && <StormLayer storms={props.storms} />}
      {props.layers.lightning && <LightningLayer />}
      {props.layers.lightning && <LightningModelLayer points={props.lightningModelPoints} />}
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={props.mode === "CINEMA" ? Math.max(1.34, preset.bloomIntensity) : 1.14}
          luminanceThreshold={props.mode === "CINEMA" ? 0.92 : 0.98}
          luminanceSmoothing={props.mode === "CINEMA" ? 0.52 : 0.48}
        />
      </EffectComposer>
      <OrbitControls
        ref={controls}
        enablePan={false}
        minDistance={GLOBE_RADIUS + 0.72}
        maxDistance={11}
        autoRotate={props.mode === "CINEMA"}
        autoRotateSpeed={0.14}
        enableDamping
        dampingFactor={0.035}
        rotateSpeed={0.28}
        zoomSpeed={0.45}
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
  const [layers, setLayers] = useState({ clouds: true, cityLights: true, aurora: false, precipitation: false, earthquakes: false, storms: true, lightning: true });
  const [now, setNow] = useState(new Date());
  const [iss, setIss] = useState<IssData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
  const [nightLightsMeta, setNightLightsMeta] = useState<NightLightsMeta | null>(null);
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([]);
  const [earthquakeUpdatedAt, setEarthquakeUpdatedAt] = useState<string | null>(null);
  const [storms, setStorms] = useState<TropicalStorm[]>([]);
  const [stormsUpdatedAt, setStormsUpdatedAt] = useState<string | null>(null);
  const [lightningModelPoints, setLightningModelPoints] = useState<LightningModelPoint[]>([]);
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
        const response = await fetch("/api/lightning-model", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setLightningModelPoints(Array.isArray(data.points) ? data.points : []);
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
    setSelectedPlace(place);
    setCoords({ lat: place.latitude, lon: place.longitude });
    setSearchOpen(false);
    setSearchResults([]);
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: Number(position.coords.latitude.toFixed(4)), lon: Number(position.coords.longitude.toFixed(4)) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  };

  const utc = now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateLabel = now.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  const currentLat = coords ? coords.lat : iss ? iss.latitude : 31.441;
  const currentLon = coords ? coords.lon : iss ? iss.longitude : -158.92;
  const localTime = weather?.timezone ? now.toLocaleTimeString("en-GB", { timeZone: weather.timezone, hour12: false, hour: "2-digit", minute: "2-digit" }) : null;
  const sunriseLabel = weather?.sunrise ? new Date(weather.sunrise).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const sunsetLabel = weather?.sunset ? new Date(weather.sunset).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  const kpAge = formatUpdatedAge(spaceWeather?.updatedAt, now);
  const weatherAge = formatUpdatedAge(weather?.updatedAt, now);
  const earthquakeAge = formatUpdatedAge(earthquakeUpdatedAt, now);
  const stormsAge = formatUpdatedAge(stormsUpdatedAt, now);
  const auroraAge = formatUpdatedAge(auroraData?.updatedAt, now);
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
            <Scene layers={layers} mode={mode} view={view} marker={coords} windSpeed={weather?.windSpeed ?? null} temperature={weather?.temperature ?? null} weatherLayer={surfaceMode === "WEATHER" ? weatherLayer : null} earthquakes={earthquakes} auroraPoints={auroraData?.points ?? []} storms={storms} lightningModelPoints={lightningModelPoints} />
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
            {weatherLayer === "RAIN" ? "PRECIPITATION · NASA GIBS IMERG NRT" : weatherLayer === "CLOUDS" ? "CLOUDS · GOES / HIMAWARI NRT · MODIS FALLBACK" : "LOCAL CONDITIONS · OPEN-METEO"}
          </div>
        </section>
      )}

      <section className="right-now panel hud">
        <div className="panel-title">RIGHT NOW</div>
        <div className="event-row">
          <div><Satellite size={14} /><span><strong>ISS</strong><small>{iss ? "Orbit position · refreshed every 15s" : "Acquiring orbit…"}</small></span></div>
          <StatusPill>LIVE</StatusPill>
        </div>
        <div className="event-row">
          <div><Sparkles size={14} /><span><strong>SPACE WEATHER</strong><small>{spaceWeather ? "Planetary Kp " + spaceWeather.kp.toFixed(1) + " · NOAA SWPC" + (kpAge ? " · " + kpAge + " AGO" : "") : "Acquiring space weather…"}</small></span></div>
          <StatusPill>{spaceWeather ? "LIVE KP" : "LIVE"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Crosshair size={14} /><span><strong>EARTHQUAKES</strong><small>{earthquakes.length ? earthquakes.length + " events M2.5+ · USGS" + (earthquakeAge ? " · " + earthquakeAge + " AGO" : "") : "Acquiring seismic feed…"}</small></span></div>
          <StatusPill>LIVE</StatusPill>
        </div>
        <div className="event-row">
          <div><Wind size={14} /><span><strong>ACTIVE STORMS</strong><small>{storms.length ? storms.length + " tropical cyclone" + (storms.length === 1 ? "" : "s") + " · NOAA NHC" + (stormsAge ? " · " + stormsAge + " AGO" : "") : "No active NHC tropical cyclones"}</small></span></div>
          <StatusPill tone="forecast">{storms.length ? "NHC NRT" : "CLEAR"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Sun size={14} /><span><strong>SUN</strong><small>Day/night model active</small></span></div>
          <StatusPill tone="model">MODEL</StatusPill>
        </div>
        <div className="night-lights-meta">
          <span>CITY LIGHTS</span>
          <small>{nightLightsMeta ? (nightLightsMeta.imageryDate === "2016-composite" ? "STATIC · BLACK MARBLE 2016" : cityLightsStatus + " · VIIRS BRDF · " + nightLightsMeta.imageryDate) : "ACQUIRING SATELLITE PASS…"}</small>
        </div>
      </section>

      <aside className="controls panel hud">
        <div className="panel-title">VIEW</div>
        {(["ISS CUPOLA", "GEOSTATIONARY", "SUN–EARTH L1", "MOON", "FREE CAMERA"] as ViewMode[]).map((item) => (
          <button className="radio-row" key={item} onClick={() => setView(item)}>
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
        <LayerRow checked={layers.aurora} label="Aurora oval" status={auroraData?.points.length ? "NOAA NRT" : "NOAA"} tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
        <LayerRow checked={layers.earthquakes} label="Earthquakes" status={earthquakeAge ? "USGS " + earthquakeAge : "USGS LIVE"} tone="live" onChange={() => setLayers({ ...layers, earthquakes: !layers.earthquakes })} />
        <LayerRow checked={layers.storms} label="Active storms" status={storms.length ? "NHC " + storms.length : "NHC"} tone="forecast" onChange={() => setLayers({ ...layers, storms: !layers.storms })} />
        <LayerRow checked={layers.lightning} label="Lightning" status="OBS + MODEL" tone="forecast" onChange={() => setLayers({ ...layers, lightning: !layers.lightning })} />
        <div className="weather-entry">
          <button onClick={() => setSurfaceMode(surfaceMode === "WEATHER" ? "EARTH" : "WEATHER")}>{surfaceMode === "WEATHER" ? "BACK TO EARTH" : "WEATHER FROM SPACE"}</button>
        </div>
      </aside>

      <section className="location-card hud">
        <div className="eyebrow">{selectedPlace ? "VIEWING" : coords ? "YOU ARE HERE" : "NOW ABOVE"}</div>
        <h1>{selectedPlace ? selectedPlace.name.toUpperCase() : coords ? "YOUR LOCATION" : "EARTH ORBIT"}</h1>
        <div className="coords">{Math.abs(currentLat).toFixed(4)}° {currentLat >= 0 ? "N" : "S"} · {Math.abs(currentLon).toFixed(4)}° {currentLon >= 0 ? "E" : "W"}</div>
        <div className="location-actions">
          <button className="locate-button" onClick={locateMe}><LocateFixed size={16} />{locating ? "LOCATING…" : coords ? "CENTER ON ME" : "FIND ME"}</button>
          {weather && <div className="weather-mini"><Cloud size={15} /><span>{Math.round(weather.temperature)}°C</span><small>CURRENT{weatherAge ? " · " + weatherAge + " AGO" : ""} · {weather.cloudCover}% CLOUD · {Math.round(weather.windSpeed)} KM/H WIND</small></div>}
          <button className="locate-button secondary" onClick={() => setSearchOpen(true)}><Search size={16} />SEARCH EARTH</button>
        </div>
        {weather && (
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
              <LayerRow checked={layers.aurora} label="Aurora oval" status="NOAA NRT" tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
              <LayerRow checked={layers.earthquakes} label="Earthquakes" status="USGS LIVE" tone="live" onChange={() => setLayers({ ...layers, earthquakes: !layers.earthquakes })} />
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
