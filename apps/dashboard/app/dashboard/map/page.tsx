import {internalFetch} from "@/lib/api";
import {redirect} from "next/navigation";
import MapDashboard from "@/components/MapDashboard";
async function get(path:string){const r=await internalFetch(path);if(r.status===401||r.status===403)redirect('/?auth=member');if(!r.ok)throw new Error(`Map request failed: ${path}`);return r.json();}
export default async function MapPage(){const [mapData,battles]=await Promise.all([get('/v1/wosb/map'),get('/v1/wosb/port-battles')]);return <MapDashboard mapData={mapData} battles={battles}/>;}
