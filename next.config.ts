import type { NextConfig } from "next";
import {execFileSync} from "node:child_process";

/**
 * Build-attested repository revision for render provenance.
 * The production Cloudflare Builder normally checks out a Git commit.
 * If the environment exposes no valid SHA and no Git checkout, OMIT the
 * header entirely; never substitute the requesting capture Action's SHA.
 */
function captureBuiltRevision(): string | null {
 const env=[process.env.CF_PAGES_COMMIT_SHA,process.env.GITHUB_SHA,
   process.env.VERCEL_GIT_COMMIT_SHA,process.env.CUPOLA_BUILD_GIT_SHA];
 for(const raw of env)if(raw && /^[a-f0-9]{40}$/i.test(raw.trim()))return raw.trim().toLowerCase();
 try {
  const git=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:1000}).trim();
  return /^[a-f0-9]{40}$/i.test(git)?git.toLowerCase():null;
 }catch {return null;}
}
const builtRevision=captureBuiltRevision();

const nextConfig: NextConfig = {
 async headers() {
  // Only the actual 3D source can attest its deployed version to captures.
  return builtRevision?[{source:"/explore",headers:[
   {key:"X-Cupola-Revision",value:builtRevision},
   {key:"X-Cupola-Scene-Type",value:"CUPOLA_3D_VISUALIZATION"}
  ]}]:[];
 },
  reactStrictMode: true,
  // Preserve bookmarks from CUPOLA's former fullscreen-root era.
  // Plain / stays the new cinematic Atlas; NORAD deep links open /explore.
  async redirects() {
    return [{
      source: "/",
      has: [{type:"query" as const,key:"satellite",value:"(?<norad>\\d{4,6})"}],
      destination:"/explore?satellite=:norad",
      permanent:false,
    }];
  },
};

export default nextConfig;
