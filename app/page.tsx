"use client";

import dynamic from "next/dynamic";

const CupolaExperience = dynamic(() => import("@/components/CupolaExperience"), {
  ssr: false,
  loading: () => (
    <main className="boot-screen">
      <div className="boot-logo">CUPOLA°</div>
      <div className="boot-line" />
      <p>Establishing orbital view…</p>
    </main>
  ),
});

export default function Home() {
  return <CupolaExperience />;
}
