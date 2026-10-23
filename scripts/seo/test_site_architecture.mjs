#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";

const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const policy = readJSON("config/seo/page-families.json");
const cityRegistry = readJSON("data/seo/city-page-candidates.json");
const source = readFileSync("lib/seo/satellites.ts", "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function("module", "exports", transpiled)(module, module.exports);
const { satelliteProfiles } = module.exports;
const sitemap = readFileSync("app/sitemap.ts", "utf8");
const robots = readFileSync("app/robots.ts", "utf8");

assert.equal(policy.schemaVersion, 1, "check registry schema version");
assert.equal(policy.canonicalOrigin, "https://cupola.earth");
assert.equal(policy.sitemap.currentlyPublishedPages, 11 + satelliteProfiles.length,
  "declared sitemap count must match exactly the two published hubs + curated satellite profiles");
assert.ok(sitemap.includes('absoluteUrl("/")') && sitemap.includes('absoluteUrl("/satellites")'));
assert.ok(sitemap.includes("satelliteProfiles.map"), "live sitemap must enumerate reviewed satellite profiles");
assert.ok(!sitemap.includes("cityRegistry") && !sitemap.includes("city-page-candidates"),
  "pilot city candidates MUST NOT leak into sitemap");
assert.ok(robots.includes('"/eclipse-lab"') && robots.includes('"/api/"'));
const paths = new Set();
const ids = new Set();
const allowedPhases = new Set(["live", "phase-1", "phase-2", "phase-3", "conditional", "internal"]);
const allowedIndexing = new Set(["published", "quality-gated", "never"]);
const allowedRendering=new Set(["ssg-shell","ssg-approved-only","ssg-shell-plus-webgl","ssr-cached-live","non-indexable-private"]);
const buckets=new Set(["core","cities","satellites","conditions","astronomy","editorial","events"]);

const staticRouteFiles = new Map([
  ["/", "app/page.tsx"],
  ["/satellites", "app/satellites/page.tsx"],
  ["/satellites/[slug]", "app/satellites/[slug]/page.tsx"],
  ["/explore", "app/explore/page.tsx"],
  ["/earth", "app/earth/page.tsx"],
  ["/earth/clouds", "app/earth/clouds/page.tsx"],
  ["/earth/day-and-night", "app/earth/day-and-night/page.tsx"],
  ["/earth/night-lights", "app/earth/night-lights/page.tsx"],
  ["/events", "app/events/page.tsx"],
  ["/learn", "app/learn/page.tsx"],
  ["/methodology", "app/methodology/page.tsx"],
  ["/data-sources", "app/data-sources/page.tsx"],
]);
for (const family of policy.families) {
  assert.match(family.id, /^[a-z][a-z0-9-]*$/);
  assert.ok(!ids.has(family.id), "duplicate family ID: " + family.id);
  ids.add(family.id);
  assert.ok(family.pattern.startsWith("/") && !family.pattern.includes("//"));
  assert.ok(!paths.has(family.pattern), "duplicate URL pattern: " + family.pattern);
  paths.add(family.pattern);
  assert.ok(allowedPhases.has(family.phase), "unknown stage: " + family.id);
  assert.ok(allowedIndexing.has(family.indexing), "unknown index state: " + family.id);
  assert.ok(allowedRendering.has(family.targetRendering),
    "every page family must have a declared caching/render target: " + family.id);
  if(family.indexing==="never"){
    assert.equal(family.targetRendering,"non-indexable-private");
    assert.equal(family.sitemapBucket,null);
  } else {
    assert.ok(buckets.has(family.sitemapBucket),"missing planned sitemap partition");
    if(family.targetRendering==="ssr-cached-live")
      assert.equal(family.pattern,"/earth/today","only the dynamic day overview needs SSR");
    else assert.ok(family.targetRendering.startsWith("ssg"),
      "SEO routes should default to build-time prerendering");
  }

  if (family.phase === "live") {
    assert.equal(family.indexing, "published", family.id + " has wrong index policy");
    assert.ok(staticRouteFiles.has(family.pattern), family.id + " is listed live without known Next route");
    assert.ok(existsSync(staticRouteFiles.get(family.pattern)), "missing published page " + family.pattern);
  } else {
    assert.notEqual(family.indexing, "published", "planned routes cannot appear in sitemap");
  }
  if (family.indexing === "quality-gated") {
    assert.ok(Array.isArray(family.requires) && family.requires.length > 0,
      family.id + " lacks unique-value source/quality requirements");
  }
  if (family.indexing === "never") {
    assert.equal(family.group, "technical");
    assert.equal(family.phase, "internal");
  }
}
assert.equal([...policy.families].filter(p => p.phase === "live").length, 12,
  "published families must match exactly the reviewed route registry");
assert.equal(cityRegistry.schemaVersion, 1);
assert.ok(cityRegistry.canonicalPattern === "/earth/cities/{iso2}/{slug}");
assert.ok(!existsSync("app/earth/cities/[country]/[city]/page.tsx"),
  "city routes require capture approval and must not be created before content QA");
const keys = new Set();
for (const city of cityRegistry.cities) {
  assert.match(city.country, /^[a-z]{2}$/);
  assert.match(city.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const path = "/earth/cities/" + city.country + "/" + city.slug;
  assert.ok(!keys.has(path), "duplicate canonical city path: " + path);
  keys.add(path);
  assert.equal(city.status, "candidate", "unverified city must stay unpublished: " + path);
  assert.equal(city.geoSource, null, "candidate requires authoritative geographic source review");
  assert.equal(city.sourceCityId, null, "do not invent geodata IDs");
  assert.equal(city.assetManifestKey, null, "do not present nonexistent WebP as an indexed asset");
}
assert.ok(cityRegistry.cities.length >= 3 && cityRegistry.cities.length <= 20,
  "pilot candidate list should stay limited");
const document = readFileSync("docs/seo/site-architecture-v1.md", "utf8");
for (const key of ["sourceObservedAt", "renderedAt", "CANDIDATE", "NOINDEX", "WebP"]) {
  assert.ok(document.includes(key), "missing explicit architecture disclosure: " + key);
}
console.log("PASS: " + policy.families.length + " page families; 17 reviewed sitemap URLs; " +
  cityRegistry.cities.length + " unindexed city candidates; technical URLs excluded.");
