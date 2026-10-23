import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
