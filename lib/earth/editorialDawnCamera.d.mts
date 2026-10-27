export type DawnVec3={x:number;y:number;z:number};
export type DawnCameraShot="daylit"|"classic";
export type DawnCameraFrame={
 normal:DawnVec3;up:DawnVec3;right:DawnVec3;
 lookDirection:DawnVec3;distance:number;earthLimbAngleRad:number;sunCenterSeparationRad:number;
 compositionOffsetRad:number;
 daylightFractionApprox:number;frameKind:"CUPOLA_EARTH_FIXED_DAWN_CAMERA";
 shot:DawnCameraShot;
};
export function editorialDawnCamera(solarWorldDirection:DawnVec3,earthRadius:number,shot?:DawnCameraShot):DawnCameraFrame;

export type WideOrbitCameraFrame=Omit<DawnCameraFrame,"shot"|"frameKind"> & {
 frameKind:"CUPOLA_EARTH_FIXED_WIDE_ORBIT_CAMERA";
 shot:"wide";
 distanceEarthRadii:number;
};
export function editorialWideOrbitCamera(solarWorldDirection:DawnVec3,
 earthRadius:number):WideOrbitCameraFrame;

export type TwilightHeroFrame=Omit<DawnCameraFrame,"shot"|"frameKind"> & {
  frameKind:"CUPOLA_EARTH_FIXED_TWILIGHT_HERO_CAMERA";
  shot:"twilight";
  distanceEarthRadii:number;
};
export function editorialTwilightHeroCamera(solarWorldDirection:DawnVec3,
  earthRadius:number):TwilightHeroFrame;

export type SolarTwilightHeroFrame=Omit<DawnCameraFrame,"shot"|"frameKind"> & {
  frameKind:"CUPOLA_EARTH_FIXED_SOLAR_TWILIGHT_HERO_CAMERA";
  shot:"solar-twilight";
  distanceEarthRadii:number;
  verticalFovDegrees:number;
};
export function editorialSolarTwilightHeroCamera(solarWorldDirection:DawnVec3,
  earthRadius:number):SolarTwilightHeroFrame;
