import type {Metadata} from 'next';
import MapUpdate from './MapUpdate';
export const metadata:Metadata={title:'Update Battle Map',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Page(){return <MapUpdate/>;}
