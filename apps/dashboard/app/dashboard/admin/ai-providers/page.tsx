import {internalFetch} from '@/lib/api';
import {redirect} from 'next/navigation';
import AiProvidersDashboard from '@/components/AiProvidersDashboard';
import OpenAIAdmin from '@/components/OpenAIAdmin';
export default async function AiProvidersPage(){
  const result=await internalFetch('/v1/ai/settings');
  if(result.status===401)redirect('/');
  if(result.status===403)redirect('/dashboard');
  if(!result.ok)throw new Error('AI provider settings could not be loaded. Verify the database migration and API process.');
  return <div className="uiStack"><AiProvidersDashboard initial={await result.json()}/><div id="openai"><OpenAIAdmin/></div></div>;
}
