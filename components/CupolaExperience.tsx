"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Cloud, CloudRain, Crosshair, Layers3, LocateFixed, Pause, Play, Satellite, Search, Share2, Sparkles, Sun, Thermometer, Volume2, VolumeX, Wind, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type ViewMode = "ISS CUPOLA" | "GEOSTATIONARY" | "SUN–EARTH L1" | "MOON" | "FREE CAMERA";
type ExperienceMode = "CINEMA" | "EXPLORE";
type SurfaceMode = "EARTH" | "WEATHER";
type WeatherLayer = "CLOUDS" | "RAIN" | "WIND" | "TEMPERATURE";
type IssData = { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number };
type WeatherData = { temperature: number; cloudCover: number; windSpeed: number; weatherCode: number; isDay: boolean; sunrise: string | null; sunset: string | null; timezone: string; updatedAt: string };
type SpaceWeatherData = { kp: number; updatedAt: string; source: string };
type PlaceResult = { id: number; name: string; country: string; admin1: string | null; latitude: number; longitude: number; timezone: string };

const DAY_TEXTURE = "/api/earth-texture?type=day";
const NIGHT_TEXTURE = "/api/earth-texture?type=night";
const CLOUD_TEXTURE = "/api/earth-texture?type=clouds";
const PRECIP_TEXTURE = "/api/precipitation";
const NORMAL_TEXTURE = "/api/earth-texture?type=normal";
const SPECULAR_TEXTURE = "/api/earth-texture?type=specular";

const EARTH_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vUv=uv; vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*worldPosition; }";
const EARTH_FRAGMENT_SHADER = "uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main(){ vec3 n=normalize(vWorldNormal); vec3 s=normalize(sunDirection); vec3 v=normalize(cameraPosition-vWorldPosition); float sunDot=dot(n,s); float dayMix=smoothstep(-0.10,0.20,sunDot); vec3 day=texture2D(dayTexture,vUv).rgb; day=pow(day,vec3(0.93)); day*=vec3(0.96,0.99,1.025); vec3 night=texture2D(nightTexture,vUv).rgb; night=pow(night,vec3(0.78)); float ocean=smoothstep(0.015,0.16,day.b-max(day.r,day.g)*0.78); float diffuse=0.58+0.52*max(sunDot,0.0); vec3 h=normalize(s+v); float spec=pow(max(dot(n,h),0.0),90.0)*ocean*max(sunDot,0.0)*0.28; float twilight=1.0-smoothstep(0.01,0.20,abs(sunDot)); vec3 dayLit=day*diffuse+vec3(0.42,0.62,0.95)*spec; vec3 nightSide=day*0.010+night*vec3(1.0,0.72,0.34)*1.55*lightsEnabled; vec3 color=mix(nightSide,dayLit,dayMix); color+=vec3(1.0,0.37,0.10)*twilight*0.045; float limb=pow(1.0-max(dot(n,v),0.0),4.0); color+=vec3(0.08,0.23,0.52)*limb*0.10; gl_FragColor=vec4(color,1.0); }"

const NIGHT_VERTEX_SHADER = "varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vUv=uv; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const NIGHT_FRAGMENT_SHADER = "uniform sampler2D nightTexture; uniform vec3 sunDirection; uniform float lightsEnabled; varying vec2 vUv; varying vec3 vWorldNormal; void main(){ vec3 n=normalize(vWorldNormal); float sunDot=dot(n,normalize(sunDirection)); float deepNight=1.0-smoothstep(-0.20,-0.02,sunDot); float twilight=1.0-smoothstep(-0.06,0.08,sunDot); float nightMask=max(deepNight,twilight*0.18); vec3 lights=texture2D(nightTexture,vUv).rgb; float lum=max(max(lights.r,lights.g),lights.b); float city=smoothstep(0.045,0.30,lum); float alpha=city*nightMask*lightsEnabled; vec3 warm=pow(lights,vec3(0.82))*vec3(1.18,0.90,0.58)*1.18; gl_FragColor=vec4(warm,alpha); }";

const ATMOSPHERE_VERTEX_SHADER = "varying vec3 vNormal; varying vec3 vViewDir; void main(){ vec4 mvPosition=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vViewDir=normalize(-mvPosition.xyz); gl_Position=projectionMatrix*mvPosition; }";
const ATMOSPHERE_FRAGMENT_SHADER = "varying vec3 vNormal; varying vec3 vViewDir; void main(){ float fresnel=pow(1.0-max(dot(normalize(vNormal),normalize(vViewDir)),0.0),6.0); float edge=smoothstep(0.48,1.0,fresnel); vec3 blue=vec3(0.10,0.34,0.95); vec3 cyan=vec3(0.30,0.72,1.0); vec3 color=mix(blue,cyan,edge); gl_FragColor=vec4(color,fresnel*0.36); }";


function getSunDirection(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const dec = 0.006918 - 0.399912*Math.cos(g) + 0.070257*Math.sin(g) - 0.006758*Math.cos(2*g) + 0.000907*Math.sin(2*g) - 0.002697*Math.cos(3*g) + 0.00148*Math.sin(3*g);
  const lon = THREE.MathUtils.degToRad((12 - hour) * 15);
  return new THREE.Vector3(Math.cos(dec)*Math.cos(lon), Math.sin(dec), Math.cos(dec)*Math.sin(lon)).normalize();
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

function Earth(props: { clouds: boolean; cityLights: boolean; aurora: boolean; precipitation: boolean; cinematic: boolean; marker?: { lat: number; lon: number } | null; windSpeed?: number | null; temperature?: number | null; weatherLayer?: WeatherLayer | null }) {
  const earthRef = useRef<THREE.Mesh>(null);
  const { gl } = useThree();
  const cloudsRef = useRef<THREE.Mesh>(null);
  const textures = useTexture([DAY_TEXTURE, NIGHT_TEXTURE, CLOUD_TEXTURE, PRECIP_TEXTURE, NORMAL_TEXTURE, SPECULAR_TEXTURE]);
  const dayTexture = textures[0];
  const nightTexture = textures[1];
  const cloudTexture = textures[2];
  const precipTexture = textures[3];
  const normalTexture = textures[4];
  const specularTexture = textures[5];
  const uniforms = useMemo(() => ({
    dayTexture: { value: dayTexture },
    nightTexture: { value: nightTexture },
    sunDirection: { value: getSunDirection(new Date()) },
    lightsEnabled: { value: props.cityLights ? 1 : 0 },
  }), [dayTexture, nightTexture]);

  useEffect(() => {
    const anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    [dayTexture, nightTexture, cloudTexture, precipTexture].forEach((texture) => {
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
    normalTexture.anisotropy = anisotropy;
    specularTexture.anisotropy = anisotropy;
    normalTexture.minFilter = THREE.LinearMipmapLinearFilter;
    specularTexture.minFilter = THREE.LinearMipmapLinearFilter;
    normalTexture.magFilter = THREE.LinearFilter;
    specularTexture.magFilter = THREE.LinearFilter;
    normalTexture.needsUpdate = true;
    specularTexture.needsUpdate = true;
  }, [dayTexture, nightTexture, cloudTexture, precipTexture, normalTexture, specularTexture, gl]);

  useEffect(() => { uniforms.lightsEnabled.value = props.cityLights ? 1 : 0; }, [props.cityLights, uniforms]);

  useFrame((_state, delta) => {
    uniforms.sunDirection.value.copy(getSunDirection(new Date()));
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.0015;
  });

  const markerPoint = props.marker ? latLonToPoint(props.marker.lat, props.marker.lon) : null;

  return (
    <group position={GLOBE_CENTER} scale={GLOBE_SCALE} rotation={GLOBE_ROTATION}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[2.5, 192, 192]} />
        <meshPhysicalMaterial
          map={dayTexture}
          normalMap={normalTexture}
          normalScale={new THREE.Vector2(0.34, 0.34)}
          roughness={0.68}
          metalness={0.0}
          clearcoat={0.14}
          clearcoatMap={specularTexture}
          clearcoatRoughness={0.52}
        />
      </mesh>

      {props.cityLights && (
        <mesh scale={1.0015}>
          <sphereGeometry args={[2.5, 160, 160]} />
          <shaderMaterial
            uniforms={{
              nightTexture: { value: nightTexture },
              sunDirection: uniforms.sunDirection,
              lightsEnabled: uniforms.lightsEnabled,
            }}
            vertexShader={NIGHT_VERTEX_SHADER}
            fragmentShader={NIGHT_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {props.clouds && (
        <group>
          <mesh ref={cloudsRef} scale={1.009}>
            <sphereGeometry args={[2.5, 144, 144]} />
            <meshStandardMaterial
              map={cloudTexture}
              transparent
              opacity={0.22}
              depthWrite={false}
              roughness={0.92}
              metalness={0.0}
              blending={THREE.NormalBlending}
            />
          </mesh>
          <mesh scale={1.014} rotation={[0.002, 0.014, -0.004]}>
            <sphereGeometry args={[2.5, 112, 112]} />
            <meshBasicMaterial
              map={cloudTexture}
              transparent
              opacity={0.030}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      )}

      {props.precipitation && (
        <mesh scale={1.012}>
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

      {props.aurora && (
        <group>
          <mesh position={[0, 2.23, 0]} scale={[1.95, 0.10, 1.95]} rotation={[0,0,0.06]}>
            <torusGeometry args={[0.66, 0.15, 32, 160]} />
            <meshBasicMaterial color="#65ffb5" transparent opacity={0.030} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh position={[0, 2.20, 0]} scale={[1.82, 0.08, 1.82]} rotation={[0.14,0,-0.04]}>
            <torusGeometry args={[0.72, 0.11, 24, 140]} />
            <meshBasicMaterial color="#8c72ff" transparent opacity={0.018} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}

      <mesh scale={1.010}>
        <sphereGeometry args={[2.5, 144, 144]} />
        <shaderMaterial
          vertexShader={ATMOSPHERE_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
          side={THREE.BackSide}
          transparent
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
  const controls = useRef<any>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const { camera, size } = useThree();
  const flyTarget = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height, props.view]);

  useEffect(() => {
    if (!controls.current) return;
    const camera = controls.current.object;
    if (props.view === "GEOSTATIONARY") camera.position.set(0.32, 0.20, 8.75);
    if (props.view === "ISS CUPOLA") camera.position.copy(HERO_CAMERA);
    if (props.view === "SUN–EARTH L1") camera.position.set(-0.9, 0.25, 7.7);
    if (props.view === "MOON") camera.position.set(0.2, 0.2, 9.8);
    if (props.view === "FREE CAMERA") camera.position.set(0.35, 0.38, 6.9);
    controls.current.target.copy(HERO_TARGET);
    camera.lookAt(HERO_TARGET);
    controls.current.update();
  }, [props.view]);

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
      <ambientLight intensity={0.022} />
      <directionalLight ref={sunLight} intensity={2.15} color="#fff3df" />
      <Stars radius={95} depth={60} count={2600} factor={1.65} saturation={0.18} fade speed={0.08} />
      <Earth clouds={props.layers.clouds} cityLights={props.layers.cityLights} aurora={props.layers.aurora} precipitation={props.layers.precipitation} cinematic={props.mode === "CINEMA"} marker={props.marker} windSpeed={props.windSpeed} temperature={props.temperature} weatherLayer={props.weatherLayer} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.28} luminanceThreshold={0.96} luminanceSmoothing={0.06} />
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
  const [layers, setLayers] = useState({ clouds: true, cityLights: true, aurora: true, precipitation: false });
  const [now, setNow] = useState(new Date());
  const [iss, setIss] = useState<IssData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
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
          dpr={[1, 2]}
          camera={{ position: [HERO_CAMERA.x, HERO_CAMERA.y, HERO_CAMERA.z], fov: 41, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.12;
            gl.outputColorSpace = THREE.SRGBColorSpace;
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
            {weatherLayer === "RAIN" ? "PRECIPITATION · NASA GIBS IMERG NRT" : weatherLayer === "CLOUDS" ? "CLOUDS · SATELLITE VISUALIZATION" : "LOCAL CONDITIONS · OPEN-METEO"}
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
        <LayerRow checked={layers.clouds} label="Clouds" status="SATELLITE" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
        <LayerRow checked={layers.precipitation} label="Precipitation" status="NRT" tone="forecast" onChange={() => setLayers({ ...layers, precipitation: !layers.precipitation })} />
        <LayerRow checked={layers.cityLights} label="City lights" status="OBSERVED" tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
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
              <LayerRow checked={layers.clouds} label="Clouds" status="SATELLITE" tone="live" onChange={() => setLayers({ ...layers, clouds: !layers.clouds })} />
              <LayerRow checked={layers.precipitation} label="Precipitation" status="NRT" tone="forecast" onChange={() => setLayers({ ...layers, precipitation: !layers.precipitation })} />
              <LayerRow checked={layers.cityLights} label="City lights" status="OBSERVED" tone="live" onChange={() => setLayers({ ...layers, cityLights: !layers.cityLights })} />
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
