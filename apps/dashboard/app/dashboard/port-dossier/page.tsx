import PortDossier from '@/components/PortDossier';
export default async function Page({searchParams}:{searchParams:Promise<{port?:string}>}){const p=await searchParams;return <PortDossier portKey={p.port??''}/>;}
