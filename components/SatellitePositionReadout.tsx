"use client";

import { useEffect, useState } from "react";

type OrbitPosition = {
  latitude: number;
  longitude: number;
  altitude: number;
  generatedAt: string;
  elementEpoch: string | null;
};
type ReadoutState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; position: OrbitPosition };

function coordinate(value: number, positive: string, negative: string) {
  return Math.abs(value).toFixed(2) + "° " + (value >= 0 ? positive : negative);
}

export default function SatellitePositionReadout({ norad }: { norad: string }) {
  const [readout, setReadout] = useState<ReadoutState>({ status: "loading" });
  useEffect(() => {
    let mounted = true;
    let currentRequest: AbortController | null = null;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      currentRequest?.abort();
      const controller = new AbortController();
      currentRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 18000);
      try {
        const result = await fetch("/api/satellites?track=" + encodeURIComponent(norad), {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!result.ok) throw new Error("Satellite source unavailable");
        const data = await result.json();
        const satellite = data.satellite;
        const generatedAt = String(data.generatedAt || "");
        if (!satellite || String(satellite.id) !== norad ||
          ![satellite.latitude, satellite.longitude, satellite.altitude].every(Number.isFinite) ||
          !Number.isFinite(Date.parse(generatedAt)) ||
          Math.abs(Date.now() - Date.parse(generatedAt)) > 3 * 60 * 1000) {
          throw new Error("No fresh validated orbit");
        }
        if (mounted) setReadout({
          status: "ready",
          position: {
            latitude: satellite.latitude,
            longitude: satellite.longitude,
            altitude: satellite.altitude,
            generatedAt,
            elementEpoch: satellite.epoch || null,
          },
        });
      } catch {
        if (mounted && !controller.signal.aborted) setReadout({ status: "unavailable" });
        if (mounted && controller.signal.aborted) setReadout({ status: "unavailable" });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 120000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      currentRequest?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [norad]);

  return (
    <section className="seo-orbit-readout" aria-label="Satellite SGP4 position">
      <div className="seo-orbit-heading">
        <strong>Calculated orbital position</strong>
        <span>SGP4 ESTIMATE · NOT TELEMETRY</span>
      </div>
      {readout.status === "loading" && <p>Checking validated orbital elements…</p>}
      {readout.status === "unavailable" && (
        <p>Current orbital estimate is temporarily unavailable. No historical coordinates are being presented as live data.</p>
      )}
      {readout.status === "ready" && (
        <>
          <div className="seo-position-values">
            <div><span>LATITUDE</span><strong>{coordinate(readout.position.latitude, "N", "S")}</strong></div>
            <div><span>LONGITUDE</span><strong>{coordinate(readout.position.longitude, "E", "W")}</strong></div>
            <div><span>ALTITUDE</span><strong>{Math.round(readout.position.altitude).toLocaleString("en-US")} km</strong></div>
          </div>
          <p>Computed: <time dateTime={readout.position.generatedAt}>{new Date(readout.position.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</time>. Orbital element epoch: {readout.position.elementEpoch ? new Date(readout.position.elementEpoch).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "unavailable"}.</p>
        </>
      )}
    </section>
  );
}
