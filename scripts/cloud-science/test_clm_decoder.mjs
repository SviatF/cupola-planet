#!/usr/bin/env node
/**
 * Real PNG codec regression for the public EUMETView MSG Cloud Mask
 * visual supplement. Entirely synthetic fixture, NEVER satellite pixels.
 * Confirms white cloud, green clear land, blue clear ocean and unknown RGB
 * genuinely absent. Also verifies no input mutation and no IR guessing.
 */
import fs from "node:fs";
import vm from "node:vm";
import {deflateSync,inflateSync} from "node:zlib";
import ts from "typescript";
import assert from "node:assert/strict";

const W=256,H=128;
function crc(bytes) {
  let crc=0xffffffff;
  for (const x of bytes) {
    crc ^= x;
    for(let b=0;b<8;b++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data){
  const tag=Buffer.from(type,"ascii");
  const n=Buffer.alloc(12+data.length);
  n.writeUInt32BE(data.length,0);tag.copy(n,4);data.copy(n,8);
  n.writeUInt32BE(crc(n.subarray(4,8+data.length)),8+data.length);
  return n;
}
const ihdr=Buffer.alloc(13);
ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
const raw=Buffer.alloc(H*(W*4+1));
for(let y=0;y<H;y++) for(let x=0;x<W;x++){
  const p=y*(W*4+1)+1+x*4;
  // Typical styled WMS palette; last segment intentionally ambiguous.
  const color=x<80?[255,255,255,255]
    :x<160?[1,192,1,255]
    :x<224?[1,1,255,255]
    :[135,150,160,255];
  for(let k=0;k<4;k++) raw[p+k]=color[k];
}
const source=Buffer.concat([
  Buffer.from("89504e470d0a1a0a","hex"),
  chunk("IHDR",ihdr),
  chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0)),
]);
const input=Uint8Array.from(source);
const tsSource=fs.readFileSync("lib/earth/cloudMask.ts","utf8");
const js=ts.transpileModule(tsSource,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
}}).outputText;
const mod={exports:{}};
const context=vm.createContext({
  exports:mod.exports,module:mod,
  Uint8Array,Uint8ClampedArray,ArrayBuffer,Blob,Response,
  CompressionStream,DecompressionStream,DataView,Math,Number,String,
});
vm.runInContext(js,context);
const mask=await mod.exports.buildCloudMaskFromInfraredPng(
  input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),"meteosat-clm"
);
assert.ok(mask instanceof ArrayBuffer,"expected real mask PNG");
const png=Buffer.from(mask);
assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
assert.equal(png.readUInt32BE(16),W);
assert.equal(png.readUInt32BE(20),H);
const decoded=inflateSync(png.subarray(41,png.length-16)); // our encoder writes one IDAT
assert.equal(decoded.length,H*(W*4+1));
const alpha=(x,y=H/2)=>decoded[y*(W*4+1)+1+x*4+3];
const rgb=(x,y=H/2)=>Array.from(decoded.subarray(
  y*(W*4+1)+1+x*4,y*(W*4+1)+1+x*4+3
));
assert.ok(alpha(40)>=200,"cloud must be visible");
assert.equal(alpha(120),8,"clear land must NOT be cloud");
assert.equal(alpha(190),8,"clear sea must NOT be cloud");
assert.equal(alpha(242),0,"unknown RGB must NEVER invent clouds");
assert.deepEqual(rgb(40),[255,255,255]);
assert.deepEqual(rgb(120),[255,255,255]);
assert.deepEqual(rgb(190),[255,255,255]);
assert.equal(Buffer.compare(source,Buffer.from(input)),0,"original WMS must not mutate");
const invalid=await mod.exports.buildCloudMaskFromInfraredPng(
  new ArrayBuffer(28),"meteosat-clm");
assert.equal(invalid,null,"invalid PNG must be rejected");
console.log(JSON.stringify({test:"MSG Cloud Mask WMS PNG",
  source:"SYNTHETIC TEST ONLY",decoded:true,cloudAlpha:alpha(40),
  clearLandAlpha:alpha(120),clearSeaAlpha:alpha(190),
  unknownAlpha:alpha(242),originalUntouched:true}));
