import type { NextConfig } from "next";
import {execFileSync} from "node:child_process";

// Build from an actual Git checkout. Never guess a remote scene revision from
// the workflow SHA: Cloudflare may be running an older build.
const deployedSourceSha=(()=>{
  try {const sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:2500}).trim();
    return /^[a-f0-9]{40}$/.test(sha)?sha:null;
  } catch {return null;}
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Preserve bookmarks from CUPOLA's former fullscreen-root era.
  // Plain / stays the new cinematic Atlas; NORAD deep links open /explore.
  async headers() {
    // A missing verified build revision intentionally leaves this header absent;
    // media science QA then fails closed instead of approving an unknown renderer.
    return deployedSourceSha?[{source:"/explore",headers:[{key:"x-cupola-revision",value:deployedSourceSha}]}]:[];
  },
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
