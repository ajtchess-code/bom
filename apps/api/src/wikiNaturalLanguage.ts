import {db,oneOrNone,many} from "@bom/db";
import {openAIEnabled,openAIResponse} from "./openai.js";
import {detectBOMLanguage,normalizeBOMQuery,languageNames as bomLanguageNames,isIntelligenceLanguage,type IntelligenceLanguage} from "./multilingualIntelligence.js";

export type WikiLanguage=IntelligenceLanguage;
export type WikiContextState={
  subject?:string|null;
  subjectKind?:string|null;
  quantity?:number|null;
  taxPercent?:number|null;
  unitCost?:number|null;
  unitSale?:number|null;
  discountPreset?:number|null;
  discountPercent?:number|null;
  marketPrices?:Record<string,number>;
  language?:WikiLanguage;
  lastIntent?:string|null;
  lastQuestion?:string|null;
};
export type DiscountPreset={preset_no:number;label:string;active:boolean;modifiers:any;description:string|null};

const CONTEXT_TTL_MS=60*60*1000;
let tablesReady=false;

export async function ensureNaturalLanguageTables(guildId?:string){
  if(!tablesReady){
    await db.query(`CREATE TABLE IF NOT EXISTS assistant_conversation_context (
      guild_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      system TEXT NOT NULL,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(guild_id,actor_id,system)
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_assistant_context_expiry ON assistant_conversation_context(expires_at)`);
    await db.query(`CREATE TABLE IF NOT EXISTS assistant_user_preferences (
      guild_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'auto',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(guild_id,actor_id)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS wiki_discount_presets (
      guild_id TEXT NOT NULL,
      preset_no INTEGER NOT NULL CHECK(preset_no BETWEEN 1 AND 8),
      label TEXT NOT NULL,
      description TEXT,
      modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      PRIMARY KEY(guild_id,preset_no)
    )`);
    tablesReady=true;
  }
  if(guildId){
    const defaults=[
      [1,'Base rates','No discounts. Uses the standard recipe/rate.',{discountPercent:0,scope:'all'}],
      [2,'20% ingredient discount','Applies a 20% discount to recipe ingredients.',{discountPercent:20,scope:'ingredients'}],
      [3,'Carpentry — 7% cheaper in ports','Applies to Beam and Bulkhead production in ports. Other discounts are only combined when they are explicitly configured.',{discountPercent:7,scope:'port',appliesTo:['Beam','Bulkhead'],sourceSkill:'Carpentry'}],
      [4,'Preset 4','Reserved for a BOM-configured common discount grouping.',{},false],
      [5,'Preset 5','Reserved for a BOM-configured common discount grouping.',{},false],
      [6,'Preset 6','Reserved for a BOM-configured common discount grouping.',{},false],
      [7,'Preset 7','Reserved for a BOM-configured common discount grouping.',{},false],
      [8,'Preset 8','Reserved for a BOM-configured common discount grouping.',{},false]
    ] as any[];
    for(const row of defaults){
      const [n,label,description,modifiers,active=true]=row;
      await db.query(`INSERT INTO wiki_discount_presets(guild_id,preset_no,label,description,modifiers,active)
        VALUES($1,$2,$3,$4,$5::jsonb,$6)
        ON CONFLICT(guild_id,preset_no) DO NOTHING`,[guildId,n,label,description,JSON.stringify(modifiers),active]);
    }
  }
}

function obj(v:any){if(v&&typeof v==='object')return v;if(typeof v==='string')try{return JSON.parse(v);}catch{}return {};}
export async function loadContext(guildId:string,actorId:string,system='wiki'):Promise<WikiContextState>{
  await ensureNaturalLanguageTables(guildId);
  const row=await oneOrNone<any>(`SELECT state,expires_at FROM assistant_conversation_context WHERE guild_id=$1 AND actor_id=$2 AND system=$3`,[guildId,actorId,system]);
  if(!row)return {};
  if(new Date(row.expires_at).getTime()<=Date.now()){
    await db.query(`DELETE FROM assistant_conversation_context WHERE guild_id=$1 AND actor_id=$2 AND system=$3`,[guildId,actorId,system]);
    return {};
  }
  return obj(row.state) as WikiContextState;
}
export async function saveContext(guildId:string,actorId:string,state:WikiContextState,system='wiki'){
  await ensureNaturalLanguageTables(guildId);
  await db.query(`INSERT INTO assistant_conversation_context(guild_id,actor_id,system,state,updated_at,expires_at)
    VALUES($1,$2,$3,$4::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '1 hour')
    ON CONFLICT(guild_id,actor_id,system) DO UPDATE SET state=EXCLUDED.state,updated_at=CURRENT_TIMESTAMP,expires_at=CURRENT_TIMESTAMP + INTERVAL '1 hour'`,
    [guildId,actorId,system,JSON.stringify(state??{})]);
}
export async function clearContext(guildId:string,actorId:string,system='wiki'){
  await ensureNaturalLanguageTables(guildId);
  await db.query(`DELETE FROM assistant_conversation_context WHERE guild_id=$1 AND actor_id=$2 AND system=$3`,[guildId,actorId,system]);
}
export function contextExpiresAt(){return new Date(Date.now()+CONTEXT_TTL_MS).toISOString();}

export async function getPreferredLanguage(guildId:string,actorId:string):Promise<WikiLanguage|null>{
  await ensureNaturalLanguageTables(guildId);
  const row=await oneOrNone<any>(`SELECT language FROM assistant_user_preferences WHERE guild_id=$1 AND actor_id=$2`,[guildId,actorId]);
  const x=String(row?.language??'auto').toLowerCase();return isIntelligenceLanguage(x)?x:null;
}
export async function setPreferredLanguage(guildId:string,actorId:string,language:WikiLanguage){
  await ensureNaturalLanguageTables(guildId);
  await db.query(`INSERT INTO assistant_user_preferences(guild_id,actor_id,language,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id,actor_id) DO UPDATE SET language=EXCLUDED.language,updated_at=CURRENT_TIMESTAMP`,[guildId,actorId,language]);
}

export function explicitLanguageRequest(text:string):WikiLanguage|null{
  const s=text.toLowerCase();
  if(/(?:answer|reply|respond|speak|language).{0,20}(?:korean|한국어)|(?:한국어).{0,20}(?:답변|대답)/iu.test(text))return 'ko';
  if(/(?:answer|reply|respond|speak|language).{0,20}(?:russian|русск)|(?:по[- ]?русски|русский)/iu.test(text))return 'ru';
  if(/(?:answer|reply|respond|speak|language).{0,20}(?:spanish|español)|(?:en español|español por favor)/iu.test(text))return 'es';
  if(/(?:answer|reply|respond|speak|language).{0,20}(?:english)|(?:in english)/iu.test(text))return 'en';
  if(/(?:in|answer in|reply in|language[: ]+)(?:simplified chinese|mandarin)|用简体中文|简体中文/iu.test(text))return 'zh';
  if(/(?:in|answer in|reply in|language[: ]+)(?:traditional chinese|cantonese)|繁體中文|用繁體/iu.test(text))return 'zh-tw';
  if(/(?:in|answer in|reply in|language[: ]+)(?:japanese)|日本語で|日本語/iu.test(text))return 'ja';
  if(/(?:in|answer in|reply in|language[: ]+)(?:portuguese)|em português|português/iu.test(text))return 'pt';
  if(/(?:in|answer in|reply in|language[: ]+)(?:french)|en français/iu.test(text))return 'fr';
  if(/(?:in|answer in|reply in|language[: ]+)(?:german)|auf deutsch/iu.test(text))return 'de';
  return null;
}
export function detectLanguage(text:string,preferred?:WikiLanguage|null):WikiLanguage{
  const explicit=explicitLanguageRequest(text);if(explicit)return explicit;
  if(preferred)return preferred;
  return detectBOMLanguage(text);
}

const dictionary:Partial<Record<WikiLanguage,[RegExp,string][]>>={
  es:[
    [/\bcu[aá]nto(?:s|as)?\b/giu,'how much'],[/\bganar(?:é|ia|ía|ias|ías)?\b/giu,'profit'],[/\bganancia\b/giu,'profit'],[/\bvender\b/giu,'sell'],[/\bventa\b/giu,'sale'],[/\bcostar|cuesta|costo\b/giu,'cost'],[/\bimpuesto\b/giu,'tax'],[/\bdescuento\b/giu,'discount'],[/\bfabricar|crear|hacer\b/giu,'craft'],[/\bbarco\b/giu,'ship'],[/\bcañ[oó]n(?:es)?\b/giu,'cannon'],[/\bpuerto\b/giu,'port'],[/\bprecio\b/giu,'price'],[/\búltim[oa]\b/giu,'last'],[/\bqui[eé]n\b/giu,'who'],[/\bcomparar\b/giu,'compare'],[/\bnecesito\b/giu,'need']
  ],
  ru:[
    [/\bсколько\b/giu,'how much'],[/\bприбыл\w*\b/giu,'profit'],[/\bпрод\w*\b/giu,'sell'],[/\bстоим\w*\b/giu,'cost'],[/\bналог\w*\b/giu,'tax'],[/\bскидк\w*\b/giu,'discount'],[/\bсозда\w*|крафт\w*\b/giu,'craft'],[/\bкорабл\w*\b/giu,'ship'],[/\bпушк\w*|оруди\w*\b/giu,'cannon'],[/\bпорт\w*\b/giu,'port'],[/\bцен\w*\b/giu,'price'],[/\bпоследн\w*\b/giu,'last'],[/\bкто\b/giu,'who'],[/\bсравн\w*\b/giu,'compare']
  ],
  ko:[
    [/얼마나|얼마/gu,'how much'],[/이익|수익/gu,'profit'],[/판매|팔/gu,'sell'],[/비용|원가/gu,'cost'],[/세금/gu,'tax'],[/할인/gu,'discount'],[/제작|만들/gu,'craft'],[/함선|배/gu,'ship'],[/대포|포/gu,'cannon'],[/항구/gu,'port'],[/가격/gu,'price'],[/최근|마지막/gu,'last'],[/누가|누구/gu,'who'],[/비교/gu,'compare']
  ]
};
export function dictionaryCanonical(text:string,language:WikiLanguage){if(language==='en')return text;let out=text;for(const [re,to] of dictionary[language]??[])out=out.replace(re,to);return out;}

/** Normalize casual member phrasing without answering or inventing game facts. */
export function normalizeConversationalWikiQuestion(text:string){
  let q=String(text??'').trim().replace(/\s+/g,' ');
  const replacements:[RegExp,string][]=[
    [/\bwhats\b/gi,"what's"],[/\b(?:wut|wat)\b/gi,'what'],[/\bgimme\b/gi,'give me'],[/\blemme\b/gi,'let me'],[/\btell me (?:about|bout)\b/gi,'information about'],[/\bshow me (?:the )?stats (?:for|of)\b/gi,'stats of'],
    [/\bhow much (?:can|will|would) i (?:make|earn)\b/gi,'profit'],[/\bhow much do i (?:make|earn)\b/gi,'profit'],
    [/\bwhat(?: do| would)? i need (?:to|for) (?:make|craft|build)\b/gi,'recipe for'],[/\bwhat does it take to (?:make|craft|build)\b/gi,'recipe for'],[/\bcost to (?:make|craft|build)\b/gi,'craft cost for'],
    [/\bwhere do i (?:get|find|buy)\b/gi,'where to get'],[/\bwhere can i (?:farm|grab|find|buy)\b/gi,'where to get'],[/\bwhat'?s good for\b/gi,'what is useful for'],
    [/\bcompare (?:it|that) (?:to|with)\b/gi,'compare with'],[/\bwhat(?:'s| is) the best\b/gi,'compare the best'],
    [/\bhow fast is\b/gi,'speed of'],[/\bhow tanky is\b/gi,'durability of'],[/\bhow tough is\b/gi,'durability of'],
    [/\bhow many guns does\b/gi,'guns on'],[/\bhow much cargo does\b/gi,'cargo capacity of'],[/\bbiggest hold\b/gi,'largest cargo capacity'],[/\bfastest\b/gi,'highest speed'],[/\bcheapest to (?:make|craft)\b/gi,'lowest craft cost'],
    [/\bmake me a build (?:for|with)\b/gi,'build guidance for'],[/\bbuild me (?:a )?\b/gi,'build guidance for '],[/\bhow do i unlock\b/gi,'how to unlock']
  ];
  for(const [re,to] of replacements)q=q.replace(re,to);
  return q.replace(/\s+([?.!,])/g,'$1').replace(/([?!]){2,}/g,'$1').trim();
}

function extractJson(raw:string){const x=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const a=x.indexOf('{'),b=x.lastIndexOf('}');if(a<0||b<=a)return null;try{return JSON.parse(x.slice(a,b+1));}catch{return null;}}
export async function canonicalizeMultilingualQuestion(text:string,language:WikiLanguage,candidates:string[]=[]){
  const local=normalizeConversationalWikiQuestion(normalizeBOMQuery(dictionaryCanonical(text,language)));
  if(openAIEnabled('OPENAI_WIKI_ENABLED')){
    const out=await openAIResponse({model:process.env.OPENAI_WIKI_MODEL?.trim()||'gpt-6-luna',maxOutputTokens:220,timeoutMs:7000,
      instructions:'Normalize the user question into concise English for a World of Sea Battles deterministic knowledge engine. Fix casual wording and obvious typos, resolve ordinary pronouns only when context makes them unambiguous, and preserve all numbers, percentages, exact proper names, ship/item names, Discord names, and quoted strings. Do not answer the question and do not invent an entity name. Return JSON only as {"question":"..."}.',
      input:JSON.stringify({language,question:local,candidateEntityNames:candidates.slice(0,40)})});
    const j=out?extractJson(out.text):null;if(j?.question)return normalizeConversationalWikiQuestion(String(j.question));
  }
  return local;
}

const languageNames=bomLanguageNames;
export async function translateWikiAnswer(text:string,language:WikiLanguage){
  if(language==='en'||!text)return text;
  if(openAIEnabled('OPENAI_WIKI_ENABLED')){
    const out=await openAIResponse({model:process.env.OPENAI_WIKI_MODEL?.trim()||'gpt-6-luna',maxOutputTokens:700,timeoutMs:8000,
      instructions:`Translate the supplied World of Sea Battles answer into ${languageNames[language]}. Preserve exact game entity names when no official localized name is supplied, all numbers, percentages, formulas, markdown emphasis, and compact tables. Do not add facts, explanations, sources, caveats, or commentary.`,input:text});
    if(out?.text?.trim())return out.text.trim();
  }
  const fallback:Record<string,string>={
    es:'La respuesta está disponible, pero la traducción automática no está habilitada. ',
    ru:'Ответ доступен, но автоматический перевод сейчас не включён. ',
    ko:'답변은 사용할 수 있지만 자동 번역이 현재 활성화되어 있지 않습니다. '
  };
  return (fallback[language]??'An automatic translation is unavailable; showing English: ')+text;
}

export async function listDiscountPresets(guildId:string,all=false):Promise<DiscountPreset[]>{
  await ensureNaturalLanguageTables(guildId);
  return many<any>(`SELECT preset_no,label,description,modifiers,active FROM wiki_discount_presets WHERE guild_id=$1 ${all?'':'AND active=TRUE'} ORDER BY preset_no`,[guildId]).then(xs=>xs.map(x=>({...x,modifiers:obj(x.modifiers)})));
}
export async function updateDiscountPreset(guildId:string,presetNo:number,body:any,actorId:string){
  await ensureNaturalLanguageTables(guildId);const n=Math.max(1,Math.min(8,Math.trunc(presetNo)));const existing=await oneOrNone<any>(`SELECT * FROM wiki_discount_presets WHERE guild_id=$1 AND preset_no=$2`,[guildId,n]);
  const label=String(body?.label??existing?.label??`Preset ${n}`).slice(0,100),description=body?.description===null?null:String(body?.description??existing?.description??'').slice(0,500),active=body?.active===undefined?Boolean(existing?.active):Boolean(body.active),modifiers=body?.modifiers??obj(existing?.modifiers);
  await db.query(`INSERT INTO wiki_discount_presets(guild_id,preset_no,label,description,modifiers,active,updated_at,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,CURRENT_TIMESTAMP,$7)
    ON CONFLICT(guild_id,preset_no) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,modifiers=EXCLUDED.modifiers,active=EXCLUDED.active,updated_at=CURRENT_TIMESTAMP,updated_by=EXCLUDED.updated_by`,[guildId,n,label,description,JSON.stringify(modifiers??{}),active,actorId]);
  return oneOrNone<any>(`SELECT preset_no,label,description,modifiers,active,updated_at,updated_by FROM wiki_discount_presets WHERE guild_id=$1 AND preset_no=$2`,[guildId,n]);
}

export function isContextReset(text:string){return /^(?:reset|start over|clear(?: my)? (?:context|assumptions)|forget (?:the )?(?:current|last) (?:calculation|question)|new question)\s*[.!]?$/i.test(text.trim());}

function n(v:any){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:null;}
export function parseProfitInputs(question:string,state:WikiContextState={}){
  const q=question.replace(/,/g,'');const next:{unitCost:number|null;unitSale:number|null;taxPercent:number|null;quantity:number|null}={unitCost:state.unitCost??null,unitSale:state.unitSale??null,taxPercent:state.taxPercent??null,quantity:state.quantity??1};
  let m=q.match(/(?:costs?(?:\s+me)?|cost(?:\s+is)?|buy(?:ing)?(?:\s+for)?|pay(?:ing)?(?:\s+for)?)\s*(?:me\s*)?(\d+(?:\.\d+)?)/i);if(m)next.unitCost=n(m[1]);
  m=q.match(/sell(?:ing)?\s+each(?:\s+[\p{L}\p{N}_-]+){0,3}\s+(?:for|at)\s*(\d+(?:\.\d+)?)/iu)??q.match(/(?:sell(?:ing)?(?:\s+(?:it|them|each|for))?|sale(?:\s+price)?(?:\s+is)?|price(?:\s+is)?)\s*(?:each\s*)?(?:for\s*)?(\d+(?:\.\d+)?)/i);if(m)next.unitSale=n(m[1]);
  // "400 per plate ... 600" fallback only when profit language is explicit.
  if((/profit|make|earn|margin|break[- ]?even/i.test(q))&&(next.unitCost===null||next.unitSale===null)){
    const nums=[...q.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$|%)/g)].map(x=>n(x[1])).filter((x):x is number=>x!==null);
    const nonPct=nums.filter(x=>!new RegExp(`${x}\\s*%`).test(q));if(next.unitCost===null&&nonPct.length>=1)next.unitCost=nonPct[0];if(next.unitSale===null&&nonPct.length>=2)next.unitSale=nonPct[1];
  }
  m=q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:tax|fee)/i)??q.match(/(?:tax|fee)\s*(?:is|of|at)?\s*(\d+(?:\.\d+)?)\s*%/i);if(m)next.taxPercent=n(m[1]);
  if(state.lastIntent==='economics.profit'){
    const correctionPct=q.match(/(?:actually|make that|change (?:it|tax) to|what about)\s*(\d+(?:\.\d+)?)\s*%/i);if(correctionPct)next.taxPercent=n(correctionPct[1]);
    const numericOnly=q.match(/^\s*(?:actually|make that|what about|try)?\s*(\d+(?:\.\d+)?)\s*(?:gold)?\s*[?.!]?\s*$/i);if(numericOnly)next.unitSale=n(numericOnly[1]);
  }
  m=q.match(/(?:make|craft|produce|quantity(?:\s+is)?)\s+(\d{1,9})\b/i)
    ??q.match(/\bfor\s+(\d{1,9})\s+(?:units?|items?|plates?|beams?|of them)\b/i)
    ??q.match(/(?:sell|buy)\s+(\d{1,9})\s+(?:units?|items?|plates?|beams?)\b/i);if(m&&Number(m[1])>1)next.quantity=n(m[1]);
  if(/(?:ignore|without|no)\s+(?:the\s+)?(?:tax|fee)/i.test(q))next.taxPercent=0;
  return next;
}
export function isProfitQuestion(question:string,state:WikiContextState={}){const x=parseProfitInputs(question,state);return (/profit|how much.*(?:make|earn)|margin|break[- ]?even|sell/i.test(question)||state.lastIntent==='economics.profit'&&/\d|tax|price|quantity|make|sell|without|ignore/i.test(question))&&x.unitCost!==null&&x.unitSale!==null;}
export function profitAnswer(question:string,state:WikiContextState={}){
  const x=parseProfitInputs(question,state);
  if(x.unitCost===null||x.unitSale===null)return null;
  // Copy narrowed nullable properties into local constants before entering callbacks.
  // TypeScript does not preserve object-property narrowing inside Array.map closures.
  const unitCost=x.unitCost;
  const unitSale=x.unitSale;
  const tax=Math.max(0,Math.min(100,x.taxPercent??0))/100,qty=Math.max(1,x.quantity??1);
  const net=unitSale*(1-tax),taxAmt=unitSale*tax,profit=net-unitCost,total=profit*qty,margin=net?profit/net*100:0,roi=unitCost?profit/unitCost*100:0,breakEven=(1-tax)>0?unitCost/(1-tax):null;
  const step=Math.max(25,Math.round(unitSale/12/25)*25);
  const candidates=[unitSale-step,unitSale,unitSale+step,unitSale+step*2].filter(v=>v>0);
  const scenarioTable=candidates.map(sale=>{const after=sale*(1-tax),p=after-unitCost;return {salePrice:sale,afterTax:after,profitPerUnit:p,totalProfit:p*qty};});
  const f=(v:number)=>Number.isInteger(v)?v.toLocaleString('en-US'):Number(v.toFixed(2)).toLocaleString('en-US');
  let answer=`At ${f(unitSale)} gold per unit with ${f((x.taxPercent??0))}% tax, you keep ${f(net)} after tax. With a ${f(unitCost)} unit cost, your profit is **${f(profit)} gold per unit**`;
  if(qty!==1)answer+=` and **${f(total)} gold total** for ${f(qty)} units`;
  answer+=`. Profit margin on net revenue is ${f(margin)}%, and return on cost is ${f(roi)}%.`;
  if(breakEven!==null)answer+=` Break-even sale price is about **${f(breakEven)} gold**.`;
  return {answer,data:{unitCost,unitSale,taxPercent:x.taxPercent??0,quantity:qty,netRevenuePerUnit:net,taxPerUnit:taxAmt,profitPerUnit:profit,totalProfit:total,profitMarginPercent:margin,returnOnCostPercent:roi,breakEvenSalePrice:breakEven,scenarioTable},contextPatch:{unitCost,unitSale,taxPercent:x.taxPercent??0,quantity:qty}};
}

export function presetFromQuestion(question:string){const m=question.match(/(?:preset|discount|option|#)\s*#?\s*([1-8])\b/i)??question.match(/^\s*([1-8])\s*$/);return m?Number(m[1]):null;}
export function explicitDiscountPercent(question:string){const m=question.match(/(\d+(?:\.\d+)?)\s*%\s*(?:ingredient\s+|craft(?:ing)?\s+|port\s+)?discount/i);return m?Number(m[1]):null;}
export function isBaseRateRequest(question:string){return /\b(?:base rates?|base recipe|no discounts?|without discounts?|raw recipe|vanilla cost)\b/i.test(question);}

export function followupWithContext(question:string,state:WikiContextState){
  const q=normalizeConversationalWikiQuestion(question);if(!state.subject)return q;
  const short=q.split(/\s+/).length<=14;
  const contextual=/^(?:what|and|how|why|where|when|which|what about|how about|why about|actually|make that|try|use|with|without|same|now|then|next|instead|okay|ok)\b/i.test(q);
  const pronoun=/\b(?:it|that|this|those|them|this ship|that ship|this gun|that gun|this item|that item|same one)\b/i.test(q);
  if(contextual||pronoun||short&&/\b(?:preset|tax|discount|profit|recipe|cost|price|speed|armor|crew|guns?|cargo|\d+%|\d{2,})\b/i.test(q))return `${state.subject}. ${q}`;
  return q;
}

export function contextSummary(state:WikiContextState){
  const out:any={};for(const k of ['subject','quantity','taxPercent','unitCost','unitSale','discountPreset','discountPercent','language'] as const){const v=state[k];if(v!==undefined&&v!==null)out[k]=v;}return out;
}

export function localizeWikiSuggestion(text:string,language:WikiLanguage){if(language==='en')return text;const preset=text.match(/^Use preset\s+([1-8])$/i);if(preset)return language==='es'?`Usar preajuste ${preset[1]}`:language==='ru'?`Использовать набор ${preset[1]}`:language==='ko'?`프리셋 ${preset[1]} 사용`:language==='zh'?`使用预设 ${preset[1]}`:language==='zh-tw'?`使用預設 ${preset[1]}`:text;const maps:any={
  'Keep base rates':{es:'Mantener tarifas base',ru:'Оставить базовые значения',ko:'기본 수치 유지'},
  'Change sale price':{es:'Cambiar precio de venta',ru:'Изменить цену продажи',ko:'판매 가격 변경'},
  'Change quantity':{es:'Cambiar cantidad',ru:'Изменить количество',ko:'수량 변경'},
  'Calculate break-even':{es:'Calcular punto de equilibrio',ru:'Рассчитать точку безубыточности',ko:'손익분기점 계산'}
};return maps[text]?.[language]??text;}
