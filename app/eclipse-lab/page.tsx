"use client";
import dynamic from "next/dynamic";
const EclipseLab=dynamic(()=>import("@/components/EclipseLab"),{
  ssr:false,loading:()=><main style={{padding:"3rem",color:"#fff"}}>CUPOLA° · Loading Eclipse Lab…</main>
});
export default function EclipseLabPage(){return <EclipseLab/>;}
