import {utcWindow,previousUtcDay} from "./dailyFacts.mjs";
export function selectDailyEditorialDay(requested,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("Invalid UTC clock");
 const day=(typeof requested==="string"?requested.trim():"")||previousUtcDay(now);
 const {end}=utcWindow(day);
 const earliest=end+20*60_000;
 if(now.getTime()<earliest)return {day,ready:false,reason:"day-incomplete",notBefore:new Date(earliest).toISOString()};
 if(now.getTime()>end+36*3_600_000)return {day,ready:false,reason:"source-window-expired",notBefore:null};
 return {day,ready:true,reason:null,notBefore:null};
}
