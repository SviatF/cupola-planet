"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Cloud, CloudRain, Crosshair, Layers3, LocateFixed, Pause, Play, Satellite, Search, Share2, Sparkles, Sun, Thermometer, Volume2, VolumeX, Wind, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CINEMA_PRESET, LIVE_PRESET } from "@/lib/earth/presets";
import { LIVE_CLOUD_FRAGMENT_SHADER, LIVE_CLOUD_VERTEX_SHADER } from "@/lib/earth/liveCloudShader";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "SUN–EARTH L1" | "MOON" | "FREE CAMERA";
type ExperienceMode = "CINEMA" | "EXPLORE";
type SurfaceMode = "EARTH" | "WEATHER";
type WeatherLayer = "CLOUDS" | "RAIN" | "WIND" | "TEMPERATURE";
type IssData = { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number };
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; weatherCode: number; isDay: boolean; sunrise: string | null; sunset: string | null; timezone: string; updatedAt: string };
type SpaceWeatherData = { kp: number; updatedAt: string; source: string };
type NightLightsMeta = { source: string; imageryDate: string; ageHours: number | null };
type PlaceResult = { id: number; name: string; country: string; admin1: string | null; latitude: number; longitude: number; timezone: string };

const DAY_TEXTURE = "/api/earth-texture?type=day";
const NIGHT_TEXTURE = "/api/night-lights";
const NIGHT_BASE_TEXTURE = "/api/earth-texture?type=night";
const STATIC_CLOUD_TEXTURE = "/api/earth-texture?type=clouds";
const LIVE_CLOUD_TEXTURE = "/api/clouds-live";
const PRECIP_TEXTURE = "/api/precipitation";
const NORMAL_TEXTURE = "/api/earth-texture?type=normal";
const SPECULAR_TEXTURE = "/api/earth-texture?type=specular";

const EARTH_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*worldPosition; }";
const EARTH_FRAGMENT_SHADER = "uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 s=normalize(sunDirection); vec3 v=normalize(cameraPosition-vWorldPosition); float sunDot=dot(n,s); float dayMix=smoothstep(-0.10,0.20,sunDot); vec3 day=texture2D(dayTexture,vUv).rgb; day=pow(day,vec3(0.93)); day*=vec3(0.96,0.99,1.025); vec3 night=texture2D(nightTexture,vUv).rgb; night=pow(night,vec3(0.78)); float ocean=smoothstep(0.015,0.16,day.b-max(day.r,day.g)*0.78); float diffuse=0.58+0.52*max(sunDot,0.0); vec3 h=normalize(s+v); float spec=pow(max(dot(n,h),0.0),90.0)*ocean*max(sunDot,0.0)*0.28; float twilight=1.0-smoothstep(0.01,0.20,abs(sunDot)); vec3 dayLit=day*diffuse+vec3(0.42,0.62,0.95)*spec; vec3 nightSide=day*0.010+night*vec3(1.0,0.72,0.34)*1.55*lightsEnabled; vec3 color=mix(nightSide,dayLit,dayMix); color+=vec3(1.0,0.37,0.10)*twilight*0.045; float limb=pow(1.0-max(dot(n,v),0.0),4.0); color+=vec3(0.08,0.23,0.52)*limb*0.10; gl_FragColor=vec4(color,1.0); }"

const NIGHT_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vUv=uv; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const NIGHT_FRAGMENT_SHADER = "uniform sampler2D nightTexture; uniform sampler2D baseNightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; float lum(vec3 c){ return max(max(c.r,c.g),c.b); } void main(){ vec3 n=normalize(vWorldNormal); float sunDot=dot(n,normalize(sunDirection)); float nightMask=1.0-smoothstep(-0.12,0.015,sunDot); float deepNight=1.0-smoothstep(-0.28,-0.10,sunDot); vec2 px=vec2(1.0/4096.0,1.0/2048.0); float d0=lum(texture2D(nightTexture,vUv).rgb); float dn=0.25*(lum(texture2D(nightTexture,vUv+vec2(px.x,0.0)).rgb)+lum(texture2D(nightTexture,vUv-vec2(px.x,0.0)).rgb)+lum(texture2D(nightTexture,vUv+vec2(0.0,px.y)).rgb)+lum(texture2D(nightTexture,vUv-vec2(0.0,px.y)).rgb)); float b0=lum(texture2D(baseNightTexture,vUv).rgb); float bn=0.25*(lum(texture2D(baseNightTexture,vUv+vec2(px.x,0.0)).rgb)+lum(texture2D(baseNightTexture,vUv-vec2(px.x,0.0)).rgb)+lum(texture2D(baseNightTexture,vUv+vec2(0.0,px.y)).rgb)+lum(texture2D(baseNightTexture,vUv-vec2(0.0,px.y)).rgb)); float dailySignal=max(0.0,d0-dn*0.72); float baseSignal=max(0.0,b0-bn*0.74); float dailyCore=pow(clamp(dailySignal*7.4,0.0,1.0),0.88); float baseCore=pow(clamp(baseSignal*3.4,0.0,1.0),0.94); float dailyWide=pow(clamp(d0*2.7,0.0,1.0),1.28); float baseWide=pow(clamp(b0*1.5,0.0,1.0),1.20); float confidence=smoothstep(0.003,0.030,d0); float core=max(dailyCore,baseCore*0.58*(1.0-confidence)); float halo=max(dailyWide,baseWide*0.34*(1.0-confidence))*0.33; float signal=max(core,halo); float coreMix=smoothstep(0.34,0.92,core); vec3 amber=vec3(1.00,0.48,0.16); vec3 warmWhite=vec3(1.00,0.84,0.61); vec3 lightColor=mix(amber,warmWhite,coreMix); float brightness=(halo*0.72+core*2.15)*deepNight+(halo*0.30+core*1.05)*(nightMask-deepNight); float alpha=smoothstep(0.028,0.62,signal)*nightMask*lightsEnabled; gl_FragColor=vec4(lightColor*brightness,alpha); }";

const ATMOSPHERE_VERTEX_SHADER = "varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }";
const ATMOSPHERE_FRAGMENT_SHADER = "uniform vec3 sunDirection; uniform float density; uniform float warmBoost; uniform float airglowBoost; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPosition); vec3 s=normalize(sunDirection); float ndv=max(dot(n,v),0.0); float nds=dot(n,s); float softHorizon=pow(1.0-ndv,1.72); float rim=pow(1.0-ndv,7.0); float daylight=smoothstep(-0.24,0.20,nds); float sunset=exp(-pow((nds+0.015)*7.4,2.0)); float nightside=1.0-smoothstep(-0.20,0.04,nds); float forward=pow(max(dot(v,s),0.0),10.0)*smoothstep(-0.18,0.10,nds); vec3 rayleigh=vec3(0.095,0.36,0.94)*daylight; vec3 mie=vec3(1.0,0.48,0.20)*sunset*(0.68+warmBoost*0.58); vec3 forwardGlow=vec3(1.0,0.72,0.42)*forward*1.35; vec3 airglow=vec3(0.055,0.14,0.32)*nightside*airglowBoost; vec3 color=rayleigh*(0.28+0.72*softHorizon)+mie*rim+forwardGlow*(0.18+0.82*softHorizon)+airglow*softHorizon; float broad=softHorizon*(0.040+0.155*daylight+0.046*nightside); float edge=rim*(0.060+0.205*daylight+0.245*sunset+0.038*nightside); float solar=forward*softHorizon*0.18; float alpha=(broad+edge+solar)*density; gl_FragColor=vec4(color,alpha); }";

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
const HERO_CAMERA = new THREE.Vector3(-0.28, 0.62, 7.18);
const HERO_TARGET = GLOBE_CENTER.clone().add(new THREE.Vector3(0.18, 0.52, 0));
const CINEMA_TARGET = GLOBE_CENTER.clone().add(new THREE.Vector3(0.52, 1.38, 0));

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


const CINEMA_CAMERA = new THREE.Vector3(-0.72, 1.58, 8.05);

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
          <circleGeometry args={[0.145, 64]} />
          <meshBasicMaterial color="#fffdf7" transparent opacity={1.0} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh scale={2.4}>
          <circleGeometry args={[0.145, 64]} />
          <meshBasicMaterial color="#fff2cf" transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh scale={5.0}>
          <circleGeometry args={[0.145, 64]} />
          <meshBasicMaterial color="#ffd099" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh scale={10.5}>
          <circleGeometry args={[0.145, 64]} />
          <meshBasicMaterial color="#ff945c" transparent opacity={0.050} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
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
  const transitionRef = useRef<{ active: boolean; start: number; type: "strength" | "blend" }>({
    active: false,
    start: 0,
    type: "strength",
  });

  const uniforms = useMemo(() => ({
    staticCloudTexture: { value: staticCloudTexture },
    liveTextureA: { value: staticCloudTexture },
    liveTextureB: { value: staticCloudTexture },
    baseTexture: { value: dayTexture },
    liveBlend: { value: 0 },
    liveStrength: { value: 0 },
    sunDirection,
    opacity: { value: cinematic ? 0.66 : 0.56 },
    brightness: { value: cinematic ? 1.15 : 1.07 },
    relief: { value: cinematic ? 6.4 : 5.1 },
    rimStrength: { value: cinematic ? 0.42 : 0.29 },
  }), [staticCloudTexture, dayTexture, sunDirection, cinematic]);

  useEffect(() => {
    uniforms.staticCloudTexture.value = staticCloudTexture;
    uniforms.baseTexture.value = dayTexture;
    uniforms.opacity.value = cinematic ? 0.66 : 0.56;
    uniforms.brightness.value = cinematic ? 1.15 : 1.07;
    uniforms.relief.value = cinematic ? 6.4 : 5.1;
    uniforms.rimStrength.value = cinematic ? 0.42 : 0.29;
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

    loadLive();
    const interval = window.setInterval(loadLive, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      const current = currentLiveRef.current;
      const next = nextLiveRef.current;
      if (current && current !== staticCloudTexture) current.dispose();
      if (next && next !== current && next !== staticCloudTexture) next.dispose();
      currentLiveRef.current = null;
      nextLiveRef.current = null;
    };
  }, [gl, staticCloudTexture, uniforms]);

  useFrame(() => {
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
          color={props.cinematic ? "#176fa3" : "#125f91"}
          alphaMap={specularTexture}
          transparent
          opacity={props.cinematic ? 0.22 : 0.18}
          depthTest={false}
          depthWrite={false}
          roughness={props.cinematic ? 0.22 : 0.31}
          metalness={0.0}
          clearcoat={props.cinematic ? 0.58 : 0.46}
          clearcoatRoughness={0.18}
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



      <mesh scale={1.0145} renderOrder={6}>
        <sphereGeometry args={[2.5, 128, 128]} />
        <shaderMaterial
          uniforms={{
            sunDirection: uniforms.sunDirection,
            density: { value: props.cinematic ? 1.18 : Math.min(1.08, preset.atmosphereDensity + 0.20) },
            warmBoost: { value: props.cinematic ? 0.34 : Math.min(0.40, preset.atmosphereWarmth) },
            airglowBoost: { value: props.cinematic ? 0.34 : 0.34 },
          }}
          vertexShader={ATMOSPHERE_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
          side={THREE.BackSide}
          transparent
          depthTest
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh scale={1.024} renderOrder={7}>
        <sphereGeometry args={[2.5, 128, 128]} />
        <shaderMaterial
          uniforms={{
            sunDirection: uniforms.sunDirection,
            density: { value: props.cinematic ? 0.21 : 0.16 },
            warmBoost: { value: props.cinematic ? 0.24 : 0.20 },
            airglowBoost: { value: props.cinematic ? 0.38 : 0.32 },
          }}
          vertexShader={ATMOSPHERE_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
          side={THREE.BackSide}
          transparent
          depthTest
          depthWrite={false}
          blending={THREE.AdditiveBlending}
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

function Scene(props: { layers: { clouds: boolean; cityLights: boolean; aurora: boolean; precipitation: boolean }; mode: ExperienceMode; view: ViewMode; marker?: { lat: number; lon: number } | null; windSpeed?: number | null; temperature?: number | null; weatherLayer?: WeatherLayer | null }) {
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

    camera.fov = props.view === "ISS CUPOLA" ? (props.mode === "CINEMA" ? 28 : 35) : 41;
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
      <ambientLight intensity={props.mode === "CINEMA" ? 0.010 : 0.014} />
      <directionalLight ref={sunLight} intensity={props.mode === "CINEMA" ? 3.05 : 2.55} color="#fff1dc" />
      <SunVisual />
      <Stars radius={95} depth={60} count={2600} factor={1.65} saturation={0.18} fade speed={0.08} />
      <Earth clouds={props.layers.clouds} cityLights={props.layers.cityLights} aurora={props.layers.aurora} precipitation={props.layers.precipitation} cinematic={props.mode === "CINEMA"} marker={props.marker} windSpeed={props.windSpeed} temperature={props.temperature} weatherLayer={props.weatherLayer} />
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={props.mode === "CINEMA" ? Math.max(0.34, preset.bloomIntensity) : 0.16}
          luminanceThreshold={props.mode === "CINEMA" ? 0.88 : 0.965}
          luminanceSmoothing={props.mode === "CINEMA" ? 0.18 : 0.10}
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
  const [layers, setLayers] = useState({ clouds: true, cityLights: true, aurora: false, precipitation: false });
  const [now, setNow] = useState(new Date());
  const [iss, setIss] = useState<IssData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
  const [nightLightsMeta, setNightLightsMeta] = useState<NightLightsMeta | null>(null);
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
            <Scene layers={layers} mode={mode} view={view} marker={coords} windSpeed={weather?.windSpeed ?? null} temperature={weather?.temperature ?? null} weatherLayer={surfaceMode === "WEATHER" ? weatherLayer : null} />
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
          <span><i /> LIVE</span>
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
            <button className={weatherLayer === "CLOUDS" ? "active" : ""} onClick={() => activateWeatherLayer("CLOUDS")}><Cloud size={16} /><span>CLOUDS</span><small>SATELLITE</small></button>
            <button className={weatherLayer === "RAIN" ? "active" : ""} onClick={() => activateWeatherLayer("RAIN")}><CloudRain size={16} /><span>RAIN</span><small>NASA NRT</small></button>
            <button className={weatherLayer === "WIND" ? "active" : ""} onClick={() => activateWeatherLayer("WIND")}><Wind size={16} /><span>WIND</span><small>{weather ? Math.round(weather.windSpeed) + " KM/H" : "SELECT PLACE"}</small></button>
            <button className={weatherLayer === "TEMPERATURE" ? "active" : ""} onClick={() => activateWeatherLayer("TEMPERATURE")}><Thermometer size={16} /><span>TEMP</span><small>{weather ? Math.round(weather.temperature) + "°C" : "SELECT PLACE"}</small></button>
          </div>
          <div className="weather-source-note">
            {weatherLayer === "RAIN" ? "PRECIPITATION · NASA GIBS IMERG NRT" : weatherLayer === "CLOUDS" ? "CLOUDS · NASA GIBS NRT" : "LOCAL CONDITIONS · OPEN-METEO"}
          </div>
        </section>
      )}

      <section className="right-now panel hud">
        <div className="panel-title">RIGHT NOW</div>
        <div className="event-row">
          <div><Satellite size={14} /><span><strong>ISS</strong><small>{iss ? "Orbit position acquired" : "Acquiring orbit…"}</small></span></div>
          <StatusPill>LIVE</StatusPill>
        </div>
        <div className="event-row">
          <div><Sparkles size={14} /><span><strong>AURORA</strong><small>{spaceWeather ? "Planetary Kp " + spaceWeather.kp.toFixed(1) + " · NOAA SWPC" : "Acquiring space weather…"}</small></span></div>
          <StatusPill tone="forecast">{spaceWeather ? "KP " + spaceWeather.kp.toFixed(1) : "FORECAST"}</StatusPill>
        </div>
        <div className="event-row">
          <div><Sun size={14} /><span><strong>SUN</strong><small>Day/night model active</small></span></div>
          <StatusPill tone="model">MODEL</StatusPill>
        </div>
        <div className="night-lights-meta">
          <span>CITY LIGHTS</span>
          <small>{nightLightsMeta ? (nightLightsMeta.imageryDate === "2016-composite" ? "BLACK MARBLE FALLBACK" : "VIIRS BRDF · " + nightLightsMeta.imageryDate) : "ACQUIRING SATELLITE PASS…"}</small>
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
        <div className="source-note">CINEMATIC EARTH · LIVE DATA LAYERS</div>
        <LayerRow checked={layers.clouds} label="Clouds" status="NRT SAT" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
        <LayerRow checked={layers.precipitation} label="Precipitation" status="NRT" tone="forecast" onChange={() => setLayers({ ...layers, precipitation: !layers.precipitation })} />
        <LayerRow checked={layers.cityLights} label="City lights" status={nightLightsMeta?.ageHours != null ? (nightLightsMeta.ageHours < 24 ? "DAILY <24H" : "DAILY " + Math.max(1, Math.round(nightLightsMeta.ageHours / 24)) + "D") : "DAILY NTL"} tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
        <LayerRow checked={layers.aurora} label="Aurora" status="FORECAST" tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
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
          {weather && <div className="weather-mini"><Cloud size={15} /><span>{Math.round(weather.temperature)}°C</span><small>{weather.cloudCover}% CLOUD · {Math.round(weather.windSpeed)} KM/H WIND</small></div>}
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
              <LayerRow checked={layers.aurora} label="Aurora" status="FORECAST" tone="forecast" onChange={() => setLayers({ ...layers, aurora: !layers.aurora })} />
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
