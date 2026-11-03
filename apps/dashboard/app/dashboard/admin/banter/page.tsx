import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import BanterDashboard from '@/components/BanterDashboard';
export default async function BanterAdminPage(){
  const response=await internalFetch('/v1/banter/settings');
  if(response.status===401)redirect('/');
  if(response.status===403)redirect('/dashboard');
  if(!response.ok)throw new Error('Banter settings could not be loaded');
  return <BanterDashboard initial={await response.json()}/>;
}
