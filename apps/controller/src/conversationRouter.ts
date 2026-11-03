import {redis} from '@bom/redis';
export type ConversationOwner='banter'|'wiki'|'sentinel'|'community'|'assistant'|'none';
type Matcher=(message:any)=>Promise<boolean>;
const matchers=new Map<ConversationOwner,{priority:number;match:Matcher}>();
const decisions=new WeakMap<object,Promise<ConversationOwner>>();
export function registerConversationMatcher(owner:ConversationOwner,priority:number,match:Matcher){matchers.set(owner,{priority,match});}
export async function rememberConversationReply(messageId:string,owner:ConversationOwner){await redis.set(`conversation:reply:${messageId}`,owner,'EX',604800);}
export async function referencedConversationOwner(message:any):Promise<ConversationOwner>{
  if(!message.reference?.messageId)return 'none';
  const referenced=message.channel?.messages?.cache?.get?.(message.reference.messageId)??await message.channel?.messages?.fetch?.(message.reference.messageId).catch(()=>null);
  if(referenced?.author?.id!==message.client.user?.id)return 'none';
  const stored=await redis.get(`conversation:reply:${referenced.id}`);
  if(['banter','wiki','sentinel','community','assistant'].includes(stored))return stored;
  // Recognize pre-upgrade Wiki/Sentinel cards; other bot panels never imply Banter.
  const cards=JSON.stringify((referenced.components??[]).map((x:any)=>x.toJSON?.()??x));
  if(/wiki:(?:correct|share):|Open Wiki/.test(cards))return 'wiki';
  if(/Open Sentinel/.test(cards))return 'sentinel';
  return 'none';
}
/** Every listener awaits the same decision for this message, independent of event order. */
export function conversationOwner(message:any):Promise<ConversationOwner>{
  const existing=decisions.get(message);if(existing)return existing;
  const next=(async()=>{
    if(message.author?.bot)return 'none' as const;
    const text=String(message.content??'').replace(/<@!?\d+>/g,'').trim();
    if(/^wiki\b/i.test(text)&&message.mentions?.users?.has?.(message.client.user?.id))return 'wiki' as const;
    for(const [owner,{priority,match}] of [...matchers.entries()].sort((a,b)=>b[1].priority-a[1].priority))if(priority>=200&&await match(message))return owner;
    const replyOwner=await referencedConversationOwner(message);
    if(replyOwner!=='none')return replyOwner;
    // Replies to unrelated bot controls are not conversational triggers.
    if(message.reference?.messageId){const ref=message.channel?.messages?.cache?.get?.(message.reference.messageId)??await message.channel?.messages?.fetch?.(message.reference.messageId).catch(()=>null);if(ref?.author?.id===message.client.user?.id)return 'none' as const;}
    for(const [owner,{match}] of [...matchers.entries()].sort((a,b)=>b[1].priority-a[1].priority))if(await match(message))return owner;
    return 'none' as const;
  })();decisions.set(message,next);return next;
}
