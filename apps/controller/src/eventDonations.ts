import {randomUUID} from 'node:crypto';
async function api(uid:string,path='',init:RequestInit={}){const headers=new Headers(init.headers);headers.set('x-internal-token',process.env.INTERNAL_API_TOKEN??'');headers.set('x-discord-user-id',uid);if(init.body)headers.set('content-type','application/json');const r=await fetch(`${(process.env.INTERNAL_API_URL??'http://127.0.0.1:4100').replace(/\/$/,'')}/v1/event-tool/donations${path}`,{...init,headers,signal:AbortSignal.timeout(20000)});const b:any=await r.json();if(!r.ok)throw Error(b.error??'Donation request failed');return b;}
export async function handleEventDonations(i:any,redis:any){
 if(!i.customId?.startsWith('event:donate'))return false;
 const key=(id:string)=>`event:donation-draft:${i.user.id}:${id}`;
 try{
 if(i.customId==='event:donate'){
 await i.deferReply({flags:64});const d=await api(i.user.id);if(!d.members)throw Error('Only Admiralty may record received donations.');const id=randomUUID();await redis.set(key(id),JSON.stringify({campaignId:d.campaignId,batchId:id}),'EX',900);
 await i.editReply({content:'Select one or more guild members. Next, enter the additional Heavy Shot amount **per member**. Only current Member / AFK role holders can be saved.',components:[{type:1,components:[{type:5,custom_id:`event:donate-pick:${id}`,placeholder:'Search members to record donations',min_values:1,max_values:25}]}]});
 }else if(i.customId.startsWith('event:donate-pick:')){
 const id=i.customId.split(':').at(-1),raw=await redis.get(key(id));if(!raw)throw Error('Donation picker expired. Open Record Donations again.');const draft=JSON.parse(raw);draft.userIds=i.values;await redis.set(key(id),JSON.stringify(draft),'EX',900);
 await i.showModal({custom_id:`event:donate-amount:${id}`,title:'Record Heavy Shot Donation',components:[{type:1,components:[{type:4,custom_id:'amount',label:`Additional amount EACH (${i.values.length} members)`,style:1,required:true,value:'5000',min_length:1,max_length:10}]}]});
 }else if(i.customId.startsWith('event:donate-amount:')){
 await i.deferReply({flags:64});const id=i.customId.split(':').at(-1),raw=await redis.get(key(id));if(!raw)throw Error('Donation form expired. Open Record Donations again.');const amountText=i.fields.getTextInputValue('amount').trim();if(!/^\d+$/.test(amountText))throw Error('Enter a positive whole number without commas.');const amount=Number(amountText),draft=JSON.parse(raw);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000)throw Error('Amount must be 1–1,000,000,000 per member.');
 // Frozen first-submission payload makes retries idempotent, including ambiguous network failures.
 if(draft.amount!==undefined&&draft.amount!==amount)throw Error('This form already submitted another amount. Open a new picker.');draft.amount=amount;await redis.set(key(id),JSON.stringify(draft),'EX',900);await api(i.user.id,'',{method:'POST',body:JSON.stringify(draft)});
 await i.editReply({content:`Recorded **${amount.toLocaleString()} Heavy Shot each** for **${draft.userIds.length}** members (**${(amount*draft.userIds.length).toLocaleString()}** total). The event leaderboard updates automatically.`,components:[]});
 }
 }catch(e:any){const payload={content:e.message,components:[],allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(payload);else await i.reply({...payload,flags:64});}
 return true;
}
