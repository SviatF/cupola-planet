import CupolaClient from "@/components/CupolaClient";
import Link from "next/link";

// The WebGL viewport is intentionally client-only. Its companion is server
// rendered for crawlers, assistive technology and visitors who need context
// before using the globe. All content is user-accessible via ABOUT.
export default function Home() {
  return (
    <>
      <CupolaClient />
      <aside className="cupola-ssr-about" aria-label="About CUPOLA Earth observatory">
        <details>
          <summary>ABOUT CUPOLA</summary>
          <section className="cupola-ssr-about-content">
            <p className="cupola-ssr-kicker">EARTH / SATELLITES / SPACE WEATHER</p>
            <h1>Explore Earth and satellites in 3D</h1>
            <p>
              CUPOLA is an interactive Earth observatory combining satellite
              observations, calculated orbital positions and astronomical
              models. Explore the globe, locate spacecraft and discover
              earthquakes, storms, lightning and other Earth events.
            </p>
            <p>
              Not every pixel is live. Some cloud observations are near-live,
              other areas rely on visual sources or weather models, and the
              land basemap may contain historical imagery. Satellite positions
              are SGP4 predictions, not direct telemetry.
            </p>
            <nav aria-label="Explore CUPOLA resources">
              <Link href="/satellites">Explore the Satellite Atlas →</Link>
            </nav>
          </section>
        </details>
      </aside>
    </>
  );
}
