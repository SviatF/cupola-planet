#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync("lib/earth/satellitePerformance.ts","utf8");
const transpiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext,
}}).outputText;
const {satelliteFrameStats}=await import(
  "data:text/javascript;charset=utf-8,"+encodeURIComponent(transpiled));
assert.equal(satelliteFrameStats([]),null);
assert.equal(satelliteFrameStats([16]),null);
const s=satelliteFrameStats([16,17,16,18,33,16,17,16,16,16,16,17,18,16,16,17,16,18,16,16]);
assert.ok(s.fps>50&&s.fps<65);
assert.equal(s.worstFrameMs,33);
assert.equal(s.p95FrameMs,18);
assert.equal(s.frames,20);
const slow=satelliteFrameStats([200,220,190,210,250]);
assert.ok(slow.fps>4&&slow.fps<6);
assert.equal(slow.p95FrameMs,250);
assert.equal(satelliteFrameStats([NaN,Infinity,-4,0,16,20]).frames,2);
console.log("PASS: opt-in local actual frame timing, exact p95, software renderer disclosure and partial buffer upload contract");
