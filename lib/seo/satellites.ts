// Curated first-wave pages: not the full /api/satellites catalog.
// Publication is deliberately manual until unique-content and provenance QA exists.
export type SatelliteProfile = {
  slug: string;
  norad: string;
  name: string;
  tag: string;
  orbit: string;
  operator: string;
  intro: string;
  mission: string;
  interpret: string;
  distinction: string;
  officialUrl: string;
  officialLabel: string;
};
export const satelliteProfiles: SatelliteProfile[] = [
  {
    slug: "iss-25544", norad: "25544", name: "International Space Station (ISS)",
    tag: "CREWED RESEARCH", orbit: "Low Earth orbit", operator: "International partnership",
    intro: "The International Space Station is an inhabited research laboratory that circles Earth. Its rapidly changing ground track makes it one of the clearest ways to understand how orbital motion differs from a fixed point on a map.",
    mission: "Astronauts live and work aboard the station, conducting investigations in microgravity and observing Earth. A location on the globe describes the point beneath the station at one instant; it does not say whether you can see the ISS from the ground.",
    interpret: "In CUPOLA, follow NORAD 25544 to view an SGP4-predicted position and the changing ground track. The projected path is calculated from orbital elements, not a live GPS stream from the station. Visibility from a city also depends on sunlight, the horizon and local conditions.",
    distinction: "A predicted pass above your region is not necessarily a visible pass. Use an observer-specific visibility forecast for that question.",
    officialUrl: "https://www.nasa.gov/international-space-station/", officialLabel: "NASA — International Space Station",
  },
  {
    slug: "hubble-20580", norad: "20580", name: "Hubble Space Telescope",
    tag: "SPACE OBSERVATORY", orbit: "Low Earth orbit", operator: "NASA / ESA",
    intro: "Hubble is a space telescope above most of Earth's atmosphere. Unlike Earth-imaging satellites, its scientific purpose is to look outward at galaxies, nebulae, planets and other astronomical targets.",
    mission: "Hubble records observations with scientific instruments designed for astronomy. Tracking the spacecraft around Earth reveals where the observatory is physically located, but not the celestial object that its instruments are observing at that instant.",
    interpret: "The moving marker and orbit shown by CUPOLA represent an SGP4 prediction for NORAD 20580. The ground track is a geometric projection of the spacecraft's orbit; it is not the telescope's line of sight, exposure schedule or a stream of live Hubble photographs.",
    distinction: "Where Hubble is above Earth and where its telescope points in the sky are different questions.",
    officialUrl: "https://science.nasa.gov/mission/hubble/", officialLabel: "NASA — Hubble mission",
  },
  {
    slug: "noaa-20-43013", norad: "43013", name: "NOAA-20 (JPSS-1)",
    tag: "POLAR WEATHER", orbit: "Polar-orbiting environmental satellite", operator: "NOAA / NASA",
    intro: "NOAA-20 is part of the Joint Polar Satellite System, which gathers environmental measurements as its orbit carries it across successive regions of Earth.",
    mission: "Its observations help scientists and forecasters study atmospheric temperature, moisture, clouds, oceans and the land surface. A polar-orbiting satellite differs from a geostationary satellite: it repeatedly passes over different geographic regions rather than remaining above one longitude.",
    interpret: "CUPOLA estimates the position of NOAA-20 using orbital elements for NORAD 43013. A position timestamp is a model calculation, not confirmation that a particular instrument was imaging your location at that moment. Scientific weather-image products have separate acquisition and publication times.",
    distinction: "An overhead orbital pass should not be confused with the acquisition time or coverage of a NOAA weather image.",
    officialUrl: "https://science.nasa.gov/mission/jpss/", officialLabel: "NASA — Joint Polar Satellite System",
  },
  {
    slug: "noaa-21-54234", norad: "54234", name: "NOAA-21 (JPSS-2)",
    tag: "POLAR WEATHER", orbit: "Polar-orbiting environmental satellite", operator: "NOAA / NASA",
    intro: "NOAA-21 extends the Joint Polar Satellite System's polar environmental observations. Its instruments provide measurements that are used in forecasting and Earth-system monitoring.",
    mission: "The spacecraft carries sensors for observing the atmosphere and Earth's surface. Its route differs substantially from the nearly fixed apparent position of a GOES satellite: a polar orbiter moves over many latitudes while Earth turns beneath it.",
    interpret: "Track NORAD 54234 in CUPOLA to see a computed sub-satellite location and orbit. The calculation relies on available OMM/TLE orbital elements and SGP4 propagation. A currently shown orbit is not proof that the VIIRS imagery layer, or any other Earth imagery feed, comes from NOAA-21 at the same time.",
    distinction: "Satellite location, sensor acquisition time and published image freshness are three independently verified quantities.",
    officialUrl: "https://science.nasa.gov/mission/jpss/", officialLabel: "NASA — Joint Polar Satellite System",
  },
  {
    slug: "landsat-9-49260", norad: "49260", name: "Landsat 9",
    tag: "LAND IMAGING", orbit: "Sun-synchronous near-polar orbit", operator: "NASA / USGS",
    intro: "Landsat 9 continues a long-running record of images of Earth's land surface. Its mission is particularly useful for studying how cities, vegetation, water bodies and land use change over time.",
    mission: "The Operational Land Imager and Thermal Infrared Sensor record reflected and emitted radiation in multiple spectral bands. Those observations become calibrated image products for research and public applications; they are not a continuous live video feed.",
    interpret: "CUPOLA can show the estimated location of NORAD 49260 and its orbital ground track. The location tells you where the satellite is predicted to be, not whether a cloud-free Landsat scene for a location is available. Repeat imaging and scene publication have their own schedules.",
    distinction: "For actual Landsat imagery, consult the NASA/USGS products; CUPOLA's orbital marker visualizes the spacecraft rather than downloading a new scene on each pass.",
    officialUrl: "https://science.nasa.gov/mission/landsat-9/", officialLabel: "NASA — Landsat 9",
  },
  {
    slug: "goes-18-51850", norad: "51850", name: "GOES-18 (GOES West)",
    tag: "GEOSTATIONARY WEATHER", orbit: "Geostationary orbit", operator: "NOAA / NASA",
    intro: "GOES-18 is the GOES West operational weather satellite, providing a persistent observing perspective on the Pacific and western parts of the Americas.",
    mission: "Unlike a low-orbit weather satellite that travels across Earth's surface, a geostationary spacecraft orbits at Earth's rotational rate. That makes its apparent sub-satellite longitude change slowly, enabling frequent monitoring of clouds, storms and atmospheric conditions across its viewing region.",
    interpret: "CUPOLA tracks NORAD 51850 using orbital elements and an SGP4 estimate. A nearly stationary position on the globe is expected for a geostationary satellite; it is not a frozen animation. The availability and freshness of GOES imagery are checked separately from the position of the spacecraft.",
    distinction: "The orbital marker is not a measurement of cloud conditions. CUPOLA's cloud layers have their own observational time and source provenance.",
    officialUrl: "https://www.ncei.noaa.gov/products/satellite/goes-r", officialLabel: "NOAA — GOES-R series",
  },
];
export const satellitePath = (profile: SatelliteProfile) => "/satellites/" + profile.slug;
export function satelliteBySlug(slug: string) {
  return satelliteProfiles.find((profile) => profile.slug === slug);
}
