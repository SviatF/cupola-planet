#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assessScienceCandidate} from "../../lib/scene-media/science-gate.mjs";
const file=process.argv[2];
if(!file||!file.endsWith(".json"))throw Error("Expected candidate JSON");
const meta=JSON.parse(fs.readFileSync(file,"utf8"));
const assessment=assessScienceCandidate(meta);
const report={
 schemaVersion:1,preset:meta.preset,renderedAt:meta.renderedAt,
 heroSha256:meta.heroSha256,sceneRevision:meta.sceneRevision,
 status:assessment.eligible?"ELIGIBLE_FOR_HUMAN_REVIEW":"SCIENCE_BLOCKED",
 approved:false,published:false,issues:assessment.issues,
 classification:assessment.classification,observedFootprint:assessment.observedFootprint,
 caveat:"Regionally observed clouds do not make the full scene a live satellite photograph. Human science + visual review remains mandatory."
};
const out=path.join(path.dirname(file),meta.preset+"-science-assessment.json");
fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(report.status,assessment.issues.join(" | ")||"manual review required");
if(process.env.CUPOLA_REQUIRE_SCIENCE_READY==="1"&&!assessment.eligible)process.exitCode=1;
