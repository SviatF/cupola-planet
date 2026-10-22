#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const text = (path) => readFileSync(path, "utf8");
const source = text("lib/seo/satellites.ts");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function("module", "exports", transpiled)(module, module.exports);
const { satelliteProfiles, satellitePath, satelliteBySlug } = module.exports;

assert.equal(satelliteProfiles.length, 6, "pilot is deliberately six reviewed profiles");
const slugs = new Set(), ids = new Set();
for (const p of satelliteProfiles) {
  assert.match(p.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/);
  assert.match(p.norad, /^\d{4,6}$/);
  assert.ok(p.slug.endsWith("-" + p.norad));
  assert.ok(!slugs.has(p.slug) && !ids.has(p.norad), "duplicate catalog entry");
  slugs.add(p.slug); ids.add(p.norad);
  assert.ok(p.officialUrl.startsWith("https://"), "missing original mission source");
  assert.equal(satelliteBySlug(p.slug)?.norad, p.norad);
  assert.equal(satellitePath(p), "/satellites/" + p.slug);
  const words = [p.intro, p.mission, p.interpret, p.distinction].join(" ").trim().split(/\s+/);
  assert.ok(words.length >= 90, p.slug + " lacks enough unique mission context");
  assert.ok(p.interpret.includes(p.norad), p.slug + " must explain the exact tracked object");
}
for (const sourcePath of ["app/satellites/page.tsx", "app/satellites/[slug]/page.tsx"]) {
  const page = text(sourcePath);
  assert.ok(page.includes('application/ld+json'), "missing structured data " + sourcePath);
  assert.ok(page.includes("satelliteProfiles") || page.includes("satelliteBySlug"));
  assert.ok(page.includes("canonical"), "no canonical " + sourcePath);
}
assert.ok(text("app/satellites/[slug]/page.tsx").includes("dynamicParams = false"),
  "unknown satellite IDs must not generate thin pages");
const sitemap = text("app/sitemap.ts");
assert.ok(sitemap.includes("satelliteProfiles"));
assert.ok(!sitemap.includes("eclipse-lab"), "simulation is not public SEO content");
const robots = text("app/robots.ts");
assert.ok(robots.includes('"/api/"') && robots.includes('"/eclipse-lab"'));
const globe = text("components/CupolaExperience.tsx");
assert.ok(globe.includes('href="/satellites"'), "must be reachable from the globe");
console.log("PASS: six unique sourced profiles, valid URLs, renderable HTML metadata, crawlable hub, no unreviewed IDs");
