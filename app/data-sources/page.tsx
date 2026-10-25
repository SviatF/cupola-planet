import type {Metadata} from "next";
import {EditorialPage,ExploreCallout} from "@/components/editorial/EditorialShell";
export const metadata:Metadata={title:"Data Sources — Scientific Provenance | CUPOLA",description:"Explore CUPOLA's primary science sources and what they actually measure: NASA, NOAA, USGS, JMA, NHC, CelesTrak and astronomical computations.",alternates:{canonical:"/data-sources"}};
const sources=[
["NOAA GOES GLM / ABI","https://www.nesdis.noaa.gov/","Regional geostationary Earth imagery and lightning observations. Observation times and footprint are product specific."],
["JMA Himawari","https://www.jma.go.jp/jma/en/Activities/satellite.html","Geostationary imagery over Asia and the Pacific. It does not constitute direct imagery of the entire planet."],
["NASA GIBS / VIIRS","https://www.earthdata.nasa.gov/data/tools/gibs","Date-labelled satellite imagery, which may have acquisition gaps or geographic limits; the CUPOLA land layer is not guaranteed current at every pixel."],
["NASA Black Marble","https://blackmarble.gsfc.nasa.gov/","Night-light radiation composite products, which can include historical and gap-filled datasets."],
["USGS Earthquake Hazards","https://earthquake.usgs.gov/","Event IDs, magnitudes, hypocentres and source-report times for monitored earthquakes."],
["NOAA National Hurricane Center","https://www.nhc.noaa.gov/","Official advisories and track forecasts, primarily for NHC geographic responsibility basins."],
["NASA FIRMS","https://firms.modaps.eosdis.nasa.gov/","VIIRS thermal anomalies. Hotspot detection is not a validated fire perimeter."],
["NOAA SWPC OVATION","https://www.swpc.noaa.gov/products/aurora-30-minute-forecast","Aurora likelihood model and forecast validity times rather than direct observations of every sky."],
["CelesTrak / SGP4","https://celestrak.org/","Orbital element distribution and computational position estimates, never direct live spacecraft GPS telemetry."]
];
export default function Sources(){return <EditorialPage eyebrow="CUPOLA / OPEN SOURCES" title="Follow the evidence." intro="Wherever CUPOLA makes a claim about our world, there should be a source, measurement time and a clear explanation of the geographic and scientific limits.">
 <div className="ae26-sources-list">{sources.map(([title,url,detail],i)=><section className="ae26-source-row" key={title}><span>{String(i+1).padStart(2,"0")}</span><div><h2>{title}</h2><p>{detail}</p></div><a href={url} target="_blank" rel="noopener noreferrer">Official source ↗</a></section>)}</div>
 <ExploreCallout body="The Earth Data layer in our 3D scene brings source state and coverage into view alongside events and orbital predictions."/>
 </EditorialPage>}
