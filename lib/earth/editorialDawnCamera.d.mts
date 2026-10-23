export type DawnVec3={x:number;y:number;z:number};
export type DawnCameraFrame={
 normal:DawnVec3;up:DawnVec3;right:DawnVec3;
 distance:number;earthLimbAngleRad:number;sunCenterSeparationRad:number;
 daylightFractionApprox:number;frameKind:"CUPOLA_EARTH_FIXED_DAWN_CAMERA";
};
export function editorialDawnCamera(solarWorldDirection:DawnVec3,earthRadius:number):DawnCameraFrame;
