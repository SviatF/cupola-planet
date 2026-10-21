#!/usr/bin/env node
/**
 * Emits CUPOLA's terrestrial vectors for independent SOFA/ERFA comparison.
 * Node and Python use identical deliberately synthetic EOP fixtures.
 * Not a substitute for comparing real JPL vectors with observed sky positions.
 */
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url);
const path="lib/earth/jplEarthFixed.ts";
const compiled=ts.transpileModule(readFileSync(path,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const mod={exports:{}};
new Function("require","module","exports",compiled)(require,mod,mod.exports);
const payload=JSON.parse(readFileSync(0,"utf8"));
if(!Array.isArray(payload.cases)||payload.cases.length<12)
  throw Error("Independent ERFA vector suite is missing or incomplete");
const out=payload.cases.map(item=>{
  const date=new Date(item.at);
  if(!Number.isFinite(date.getTime())||!Array.isArray(item.icrfKm)||item.icrfKm.length!==3)
    throw Error("Bad ERFA reference fixture");
  const jd=date.getTime()/86400000+2440587.5;
  const [x,y,z]=item.icrfKm;
  const vec=mod.exports.horizonsIcrfToCupolaEarthFixed(
    {jdUt:jd,x,y,z},date,item.eop
  );
  return {at:item.at,icrfKm:item.icrfKm,cupolaKm:[vec.x,vec.y,vec.z]};
});
process.stdout.write(JSON.stringify(out));
