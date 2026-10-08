/**
 * CUPOLA Cinema Director — shot selection only.
 * No renderer, Earth shader, material, exposure or lighting changes.
 * The playlist is derived from existing, currently available NRT/live feeds.
 */
export type CinemaKind =
  | "SUNRISE"
  | "BLUE_EARTH"
  | "NIGHT_CITY"
  | "AURORA"
  | "CYCLONE"
  | "WILDFIRE"
  | "EARTHQUAKE"
  | "OCEAN"
  | "LIMB";

export type CinemaShot = {
  id: string;
  kind: CinemaKind;
  title: string;
  detail: string;
  latitude: number;
  longitude: number;
  /** World-space height above CUPOLA's existing globe radius. */
  height: number;
  /** Target interpolation: 0 = Earth centre, 1 = location on surface. */
  focus: number;
  holdSeconds: number;
};

type EventPoint = { latitude: number; longitude: number };
type Storm = EventPoint & {
  id: string;
  name: string;
  category?: number | null;
  windKnots?: number | null;
};
type Aurora = EventPoint & { intensity: number };
type Fire = EventPoint & { frp?: number | null };
type Quake = EventPoint & { id: string; magnitude: number; place: string; time: number };

export type CinemaDirectorFeeds = {
  sunriseLongitude: number;
  subSolarLongitude: number;
  storms: Storm[];
  aurora: Aurora[];
  wildfires: Fire[];
  earthquakes: Quake[];
};

const wrap = (longitude: number) => ((longitude + 540) % 360) - 180;
const angle = (degrees: number) => degrees * Math.PI / 180;

function nightCity(subSolarLongitude: number) {
  const cities = [
    { title: "TOKYO AFTER DARK", latitude: 35.68, longitude: 139.69 },
    { title: "NEW YORK AT NIGHT", latitude: 40.71, longitude: -74.01 },
    { title: "EUROPE AFTER DARK", latitude: 48.86, longitude: 2.35 },
    { title: "INDIA AT NIGHT", latitude: 19.08, longitude: 72.88 },
    { title: "SÃO PAULO AT NIGHT", latitude: -23.55, longitude: -46.63 },
  ];
  return [...cities].sort((a, b) =>
    Math.cos(angle(b.longitude - subSolarLongitude)) -
    Math.cos(angle(a.longitude - subSolarLongitude))
  )[0];
}

export function buildCinemaPlaylist(feeds: CinemaDirectorFeeds): CinemaShot[] {
  const sunrise = wrap(feeds.sunriseLongitude);
  const city = nightCity(feeds.subSolarLongitude);

  const shots: CinemaShot[] = [
    {
      id: "sunrise", kind: "SUNRISE", title: "CHASING THE SUNRISE",
      detail: "LIVE DAY / NIGHT TERMINATOR",
      latitude: 9, longitude: sunrise, height: 3.7, focus: 0.76, holdSeconds: 24,
    },
    {
      id: "earth", kind: "BLUE_EARTH", title: "EARTH, RIGHT NOW",
      detail: "A LIVING PLANET FROM ORBIT",
      latitude: -11, longitude: wrap(feeds.subSolarLongitude - 32),
      height: 7.0, focus: 0.08, holdSeconds: 22,
    },
  ];

  const strongestAurora = feeds.aurora
    .filter((event) => event.intensity >= 18)
    .sort((a, b) => b.intensity - a.intensity)[0];
  if (strongestAurora) {
    shots.push({
      id: "aurora", kind: "AURORA", title: "POLAR LIGHTS",
      detail: "NOAA OVATION · " + Math.round(strongestAurora.intensity) + "% PROBABILITY",
      latitude: strongestAurora.latitude,
      longitude: wrap(strongestAurora.longitude),
      height: 4.0, focus: 0.74, holdSeconds: 26,
    });
  }

  shots.push({
    id: "night-city", kind: "NIGHT_CITY", title: city.title,
    detail: "CITIES SEEN FROM SPACE · VIIRS / BLACK MARBLE",
    latitude: city.latitude, longitude: city.longitude,
    height: 3.9, focus: 0.76, holdSeconds: 23,
  });

  const activeStorm = feeds.storms
    .filter((storm) => Number.isFinite(storm.latitude) && Number.isFinite(storm.longitude))
    .sort((a, b) => (b.category ?? 0) - (a.category ?? 0) ||
      (b.windKnots ?? 0) - (a.windKnots ?? 0))[0];
  if (activeStorm) {
    shots.push({
      id: "storm:" + activeStorm.id, kind: "CYCLONE",
      title: activeStorm.name.toUpperCase(),
      detail: (activeStorm.category && activeStorm.category > 0
        ? "CATEGORY " + activeStorm.category + " · " : "") + "NOAA NHC",
      latitude: activeStorm.latitude, longitude: wrap(activeStorm.longitude),
      height: 4.1, focus: 0.72, holdSeconds: 27,
    });
  }

  const strongestFire = feeds.wildfires
    .filter((fire) => Number.isFinite(fire.latitude) && Number.isFinite(fire.longitude))
    .sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0))[0];
  if (strongestFire) {
    shots.push({
      id: "fire", kind: "WILDFIRE", title: "WILDFIRES FROM ORBIT",
      detail: "NASA FIRMS / EONET HOTSPOTS",
      latitude: strongestFire.latitude, longitude: wrap(strongestFire.longitude),
      height: 3.5, focus: 0.75, holdSeconds: 22,
    });
  }

  const strongestQuake = feeds.earthquakes
    .filter((quake) => quake.magnitude >= 5 && Number.isFinite(quake.latitude) &&
      Number.isFinite(quake.longitude) && Date.now() - quake.time < 86400000)
    .sort((a, b) => b.magnitude - a.magnitude)[0];
  if (strongestQuake) {
    shots.push({
      id: "quake:" + strongestQuake.id, kind: "EARTHQUAKE",
      title: "EARTH IN MOTION",
      detail: "USGS · M" + strongestQuake.magnitude.toFixed(1) + " · " + strongestQuake.place.toUpperCase(),
      latitude: strongestQuake.latitude, longitude: wrap(strongestQuake.longitude),
      height: 4.0, focus: 0.75, holdSeconds: 20,
    });
  }

  shots.push(
    {
      id: "ocean", kind: "OCEAN", title: "SUNLIGHT ON THE OCEAN",
      detail: "SOLAR REFLECTION · LIVE SUN POSITION",
      latitude: -8, longitude: wrap(feeds.subSolarLongitude),
      height: 4.6, focus: 0.50, holdSeconds: 23,
    },
    {
      id: "limb", kind: "LIMB", title: "THE BLUE HORIZON",
      detail: "CUPOLA · ATMOSPHERIC LIMB",
      latitude: 19, longitude: wrap(sunrise + 26),
      height: 4.0, focus: 0.82, holdSeconds: 25,
    },
  );

  return shots;
}
