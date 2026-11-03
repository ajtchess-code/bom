import GameHub from '../../apps/dashboard/components/game-hubs/GameHub';
export default async function Page({searchParams}:{searchParams:Promise<{module?:string}>}){const q=await searchParams;return <GameHub module={q.module==='clash'?'clash':'minecraft'}/>}
