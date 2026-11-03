/** Shared, evidence-preserving input normalization for BOM Wiki and Sentinel.
 * No language model is needed for these rules. Models may be used by the caller
 * solely to route to existing authorized queries; this module never fabricates data.
 */
import {db,many} from '@bom/db';

export type IntelligenceScope='wiki'|'sentinel'|'both';
export const intelligenceLanguages=['en','es','ru','ko','zh','zh-tw','ja','pt','fr','de'] as const;
export type IntelligenceLanguage=typeof intelligenceLanguages[number];
export const languageNames:Record<IntelligenceLanguage,string>={en:'English',es:'Spanish',ru:'Russian',ko:'Korean',zh:'Simplified Chinese','zh-tw':'Traditional Chinese',ja:'Japanese',pt:'Portuguese',fr:'French',de:'German'};
export const isIntelligenceLanguage=(x:string):x is IntelligenceLanguage=>(intelligenceLanguages as readonly string[]).includes(x);

const builtins:[RegExp,string][]=[
  [/\b(?:wut|wat|wht|whut)\b/giu,'what'],[/\b(?:plz|pls|porfa|porfis|xfa)\b/giu,'please'],
  [/\b(?:gimme|gib)\b/giu,'give me'],[/\b(?:yoinked|yoinkd|yoink|yanked|stripped)\b/giu,'removed'],
  [/\b(?:perms|permz|permissionz)\b/giu,'permissions'],[/\b(?:last nite|las nite|yday|ystrday)\b/giu,'yesterday'],
  [/\b(?:ppl|peeps)\b/giu,'members'],[/\b(?:vc|vchat)\b/giu,'voice channel'],
  [/\b(?:pb|portbattle|port-btl)\b/giu,'port battle'],[/\b(?:santi|santissima|santísima)\b/giu,'Santisima Trinidad'],
  [/\b(?:12 apostles|12 apostols|12 apostolov|12 apostolovv)\b/giu,'12 Apostolov'],
  [/\b(?:san martin|san martín)\b/giu,'San Martin'],
  [/\b(?:tanky|tankiness)\b/giu,'durability'],[/\b(?:dmg|deeps)\b/giu,'damage'],
  [/\b(?:speedy|speediest)\b/giu,'fast'],[/\b(?:nerfd|nerfed)\b/giu,'reduced stats'],
  [/\b(?:craftin|craftng)\b/giu,'craft'],[/\b(?:cannons|canons|cannnons)\b/giu,'cannons'],
  [/\b(?:cuánto|cuantos|cuantas|cuántos|cuántas|cuanto)\b/giu,'how much'],
  [/\b(?:quién|quien|kien)\b/giu,'who'],[/\b(?:cuándo|cuando)\b/giu,'when'],
  [/\b(?:dónde|donde)\b/giu,'where'],[/\b(?:barquitos|barcos|barco|navíos|navio|navíos)\b/giu,'ship'],
  [/\b(?:quitó|quitaron|sacó|sacaron|removió|removieron)\b/giu,'removed'],
  [/\b(?:rol|roles)\b/giu,'role'],[/\b(?:canal|canales)\b/giu,'channel'],
  [/\b(?:ayer|anoche)\b/giu,'yesterday'],[/\b(?:flota|escuadra)\b/giu,'fleet'],
  [/\b(?:ganancia|beneficio)\b/giu,'profit'],[/\b(?:precio|preço)\b/giu,'price'],
  [/\b(?:cuesta|custa|custou)\b/giu,'cost'],[/\b(?:armadura|blindaje)\b/giu,'armor'],
  [/\b(?:velocidad|rapidez|velocidade)\b/giu,'speed'],[/\b(?:necesito|preciso)\b/giu,'need'],
  [/\b(?:fabri(?:car|qué|qué)|craftear|fabricar)\b/giu,'craft'],
  [/\b(?:quem|quém)\b/giu,'who'],[/\b(?:quanto|quantos)\b/giu,'how much'],
  [/\b(?:navire|bateau|schiff)\b/giu,'ship'],[/\b(?:combien|wieviel)\b/giu,'how much'],
  [/\b(?:wer|qui)\b/giu,'who'],[/\b(?:wann|quand)\b/giu,'when'],
  [/누가|누구/gu,'who'],[/언제/gu,'when'],[/어디/gu,'where'],[/왜/gu,'why'],
  [/역할/gu,'role'],[/채널/gu,'channel'],[/삭제|제거|뺐/gu,'removed'],
  [/함선|배\b/gu,'ship'],[/속도|빠르/gu,'speed'],[/방어력|장갑/gu,'armor'],
  [/제작|만들/gu,'craft'],[/얼마나|얼마/gu,'how much'],[/대포/gu,'cannon'],
  [/\bсан[ -]?мартин\b/giu,'San Martin'],[/\bазов\b/giu,'Azov'],
  [/\bсант[иі]с[иі]ма\b/giu,'Santisima Trinidad'],
  [/누가|谁|誰|谁的|誰的|哪个人|哪個人/gu,'who'],
  [/什么时候|什麼時候|何时|何時/gu,'when'],[/在哪里|在哪裡|哪里|哪裡/gu,'where'],
  [/为什么|為什麼|为何|為何/gu,'why'],[/最近|最新/gu,'last'],
  [/移除|删除|刪除|撤销|撤銷|踢掉|拿掉/gu,'removed'],
  [/权限|權限/gu,'permissions'],[/角色|身分組|身份组/gu,'role'],[/频道|頻道/gu,'channel'],
  [/成员|成員/gu,'member'],[/战舰|戰艦|舰船|艦船|船只|船隻/gu,'ship'],
  [/速度|航速/gu,'speed'],[/装甲|裝甲/gu,'armor'],[/伤害|傷害/gu,'damage'],
  [/制造|製造|制作|製作|打造/gu,'craft'],[/横梁|橫樑/gu,'Beam'],
  [/木材|木头|木頭/gu,'wood'],[/金币|金幣/gu,'gold'],[/价格|價格/gu,'price'],
  [/多少|几多|幾多/gu,'how much'],[/比较|比較/gu,'compare'],
  [/アゾフ/gu,'Azov'],[/サン[・\s]?マルティン/gu,'San Martin'],
  [/誰|だれ/gu,'who'],[/いつ/gu,'when'],[/どこ/gu,'where'],
  [/艦船|船/gu,'ship'],[/速度/gu,'speed'],[/比較/gu,'compare'],
];
// Protect Discord mentions, links, IDs, and backtick quoted entities from heuristic replacement.
const preserved=/(?:<[@#!&]{0,2}\d{15,22}>|https?:\/\/[^\s]+|`[^`]+`|\b\d{15,22}\b)/gu;
export function normalizeBOMQuery(question:string){
  const protectedBits:string[]=[];
  let q=String(question??'').normalize('NFKC').replace(preserved,x=>{const i=protectedBits.push(x)-1;return `\uE100${i}\uE101`;});
  for(const [re,to] of builtins)q=q.replace(re,to);
  return q.replace(/\s+/g,' ').trim().replace(/\uE100(\d+)\uE101/gu,(_,i)=>protectedBits[Number(i)]??'');
}
function escapeRegex(x:string){return x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
let tableReady:Promise<void>|null=null;
export function ensureLexiconTable(){if(!tableReady)tableReady=db.query(`CREATE TABLE IF NOT EXISTS assistant_lexicon (
 id UUID PRIMARY KEY, guild_id TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('wiki','sentinel','both')),
 language TEXT NOT NULL, phrase TEXT NOT NULL, canonical TEXT NOT NULL, created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(guild_id,scope,language,phrase))`).then(async()=>{await db.query(`CREATE INDEX IF NOT EXISTS assistant_lexicon_lookup ON assistant_lexicon(guild_id,scope)`);}).catch(e=>{tableReady=null;throw e;});return tableReady;}
const cache=new Map<string,{until:number;entries:{phrase:string;canonical:string}[]}>();
export function invalidateLexicon(guildId:string){for(const k of cache.keys())if(k.startsWith(`${guildId}:`))cache.delete(k);}
export async function applyGuildLexicon(guildId:string,q:string,scope:'wiki'|'sentinel'){
  await ensureLexiconTable();const key=`${guildId}:${scope}`,old=cache.get(key);
  let entries=old&&old.until>Date.now()?old.entries:null;
  if(!entries){const rows=await many<any>(`SELECT phrase,canonical FROM assistant_lexicon WHERE guild_id=$1 AND scope IN ('both',$2) ORDER BY length(phrase) DESC LIMIT 500`,[guildId,scope]);entries=rows.map((r:any)=>({phrase:String(r.phrase),canonical:String(r.canonical)}));cache.set(key,{entries,until:Date.now()+60_000});}
  let out=q;
  for(const e of entries){if(!e.phrase.trim())continue;const words=/^[a-z\d\s_-]+$/i.test(e.phrase);const re=new RegExp(`${words?'(?<![\\p{L}\\p{N}])':''}${escapeRegex(e.phrase)}${words?'(?![\\p{L}\\p{N}])':''}`,'giu');out=out.replace(re,()=>e.canonical);}
  return out;
}
export function detectBOMLanguage(text:string):IntelligenceLanguage{
  if(/[ぁ-んァ-ン]/u.test(text))return 'ja';
  if(/[가-힣]/u.test(text))return 'ko';
  if(/[\u3400-\u9FFF]/u.test(text))return /[體國學風語這個為麼關嗎說頭價錢幣樑權頻刪]/u.test(text)?'zh-tw':'zh';
  if(/[А-Яа-яЁё]/u.test(text))return 'ru';
  if(/[¿¡ñáéíóúü]/u.test(text)||/\b(?:que|quién|como|cuanto|porque|ayer|anoche|barco|cual|donde|puerto|necesito|cuesta|mejor)\b/iu.test(text))return 'es';
  if(/\b(?:você|voce|quanto|preciso|navio|preço|qual|obrigado)\b/iu.test(text))return 'pt';
  if(/\b(?:combien|quel|pourquoi|bonjour|bateau)\b/iu.test(text))return 'fr';
  if(/\b(?:wieviel|welche|warum|schiff|gestern)\b/iu.test(text))return 'de';
  return 'en';
}
