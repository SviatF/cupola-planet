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
