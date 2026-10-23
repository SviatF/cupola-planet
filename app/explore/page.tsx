import type {Metadata} from "next";
import CupolaClient from "@/components/CupolaClient";
import Link from "next/link";
export const metadata:Metadata={
 title:"Explore Earth Live in 3D | CUPOLA",
 description:"Explore CUPOLA's interactive 3D Earth: observational clouds, calculated satellite positions, Sun and Moon models, and verified Earth events. Sources and data delay vary by layer.",
 alternates:{canonical:"/explore"},
};
export default function Explore(){
 return <><CupolaClient/><aside className="cupola-ssr-about" aria-label="CUPOLA interactive Earth overview"><details><summary>ABOUT THE 3D SCENE</summary><section className="cupola-ssr-about-content">
 <p className="cupola-ssr-kicker">EARTH / REAL SOURCES / CALCULATED MODELS</p><h1>Explore Earth and satellites in 3D</h1>
 <p>This real-time 3D model combines Earth observations, cloud imagery and calculated orbital geometry. Data products have different observation timestamps and geographic coverage.</p>
 <p>Not every pixel is live: ocean and land use historical background textures in places, satellite trajectories are SGP4 predictions rather than telemetry, and aurora maps are forecast probabilities.</p>
 <nav aria-label="CUPOLA more information"><Link href="/">CUPOLA Atlas →</Link> <Link href="/satellites">Satellite Atlas →</Link></nav>
 </section></details></aside></>;
}
