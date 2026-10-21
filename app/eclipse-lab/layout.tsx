import type {Metadata} from "next";
export const metadata:Metadata={
  title:"CUPOLA° — Eclipse Lab (Simulation)",
  description:"Scientific quality-assurance replay of lunar eclipse geometry. Not a live sky.",
  robots:{index:false,follow:false}
};
export default function EclipseLabLayout({children}:{children:React.ReactNode}){
  return children;
}
