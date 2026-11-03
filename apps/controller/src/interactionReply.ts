import {MessageFlags} from 'discord.js';
const V2=MessageFlags.IsComponentsV2;
const deferredV2=new WeakSet<object>();
function json(value:any){return typeof value?.toJSON==='function'?value.toJSON():value;}
/** Message edits must opt in to V2, even after a deferred reply. */
export function replyEditPayload(payload:any,existingFlags=0):any{
 const value=typeof payload==='string'?{content:payload}:{...payload};
 const components=Array.isArray(value.components)?value.components.map(json):[];
 const requestedFlags=Number(value.flags?.bitfield??value.flags??0);
 const needsV2=Boolean(requestedFlags&V2)||components.some((c:any)=>c&&c.type!==1)||Boolean((existingFlags&V2)&&!value.embeds?.length);
 if(!needsV2)return payload;
 const text=typeof value.content==='string'?value.content:'';
 const rendered=text?[{type:10,content:text},...components]:components;
 return {...value,flags:(requestedFlags&MessageFlags.SuppressEmbeds)|V2,content:null,embeds:[],components:rendered};
}
export async function deferInteractionReply(interaction:any,options:any={}){
 const flags=Number(options.flags?.bitfield??options.flags??0);
 const result=await interaction.deferReply({...options,flags:flags&MessageFlags.Ephemeral});
 if(flags&V2)deferredV2.add(interaction);
 return result;
}
export async function editInteractionReply(interaction:any,payload:any){
 const originalV2=(deferredV2.has(interaction)||interaction.message?.flags?.has?.(V2))?V2:0;
 return await interaction.editReply(replyEditPayload(payload,originalV2));
}
/** Exclude Discord request URLs/bodies, which can include webhook tokens. */
export function discordErrorSummary(error:any){return {name:String(error?.name??'Error'),code:error?.code??error?.rawError?.code??null,status:error?.status??null,message:String(error?.message??'Discord request failed').replace(/https?:\/\/\S+/g,'[redacted URL]').slice(0,1000)};}
