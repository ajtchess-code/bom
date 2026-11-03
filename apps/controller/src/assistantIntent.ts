/** Pure intent parsing. Plans contain data only, never URLs, SQL or executable code. */
export type MisfitAction={kind:'leave'|'returned'|'pb_signup'|'pb_roster';days?:number;until?:string;reason?:string;player?:string;port?:string;day?:'today'|'tomorrow';time?:string;ship?:string;horn?:string;commander?:string;confirm?:boolean;replace?:boolean;awaitingConfirmation?:boolean;battleId?:string};
const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fourteen:14,fifteen:15,thirty:30};
export function actionCandidate(text:string){return /\b(?:sign\s*up|register|assign|confirm|leave request|request leave|away|absent|vacation|returned|back from leave|who.*(?:confirm|roster|signed up))\b/i.test(text);}
export function correctionStatement(raw:string,roleName?:string){
 const m=raw.match(/^\s*(?:@no|<@&(\d{15,22})>)[\s:,.—-]+([\s\S]+)$/i);if(!m||m[1]&&!['no','incorrect','wrong answer','wiki no'].includes(String(roleName??'').toLowerCase().trim()))return null;
 return m[2].trim().slice(0,2000);
}
export function factualCorrection(text:string){return !/\b(?:meant|asking|asked|try again|look again|you (?:do |should )?know)\b/i.test(text)&&(/\d/.test(text)||/\b(?:description|recipe|costs|requires|should be|instead)\b/i.test(text));}
export function normalizeAction(value:any,raw:string):MisfitAction|null{
 if(!value||!['leave','returned','pb_signup','pb_roster'].includes(value.kind))return null;
 const a:MisfitAction={kind:value.kind};
 for(const k of ['reason','player','port','ship','time','until'] as const){if(value[k]!=null){if(typeof value[k]!=='string'||value[k].length>500)return null;a[k]=value[k].trim();}}
 if(value.days!=null){if(typeof value.days!=='number'||!Number.isInteger(value.days)||value.days<1||value.days>365)return null;a.days=value.days;}
 if(value.day!=null){if(!['today','tomorrow'].includes(value.day))return null;a.day=value.day;}
 if(value.horn!=null){if(!['Primary Horn','Secondary Horn'].includes(value.horn))return null;a.horn=value.horn;}
 if(value.commander!=null){if(!['Fleet Commander','Flank Commander','Siege Commander'].includes(value.commander))return null;a.commander=value.commander;}
 // A model cannot silently turn a signup into a confirmation or a duty transfer.
 a.confirm=/\bconfirm(?:ed)?\b/i.test(raw)&&value.confirm===true;
 a.replace=/\b(?:replace|transfer|take over)\b/i.test(raw)&&value.replace===true;
 return a;
}
export function localAction(raw:string):MisfitAction|null{
 const text=raw.trim();
 if(/^(?:how|what|where|why)\b/i.test(text)||/\b(?:for example|hypothetically|suppose|if someone|how (?:do|can|would))\b/i.test(text)||/[`\n]/.test(text))return null;
 if(/\b(?:I(?:'m| am)? back from leave|I (?:have )?returned|mark me (?:as )?returned)\b/i.test(text))return {kind:'returned'};
 if(/\b(?:away|absent|vacation|request leave|leave request)\b/i.test(text)&&/\b(?:I|my|me|ill|i'll|i’m|i'm)\b/i.test(text)){
  const duration=text.match(/\b(?:for\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|thirty)\s+(days?|weeks?)\b/i);
  const until=text.match(/\buntil\s+(\d{4}-\d{2}-\d{2})\b/i);
  const days=duration?(Number(duration[1])||words[duration[1].toLowerCase()])*(/^week/i.test(duration[2])?7:1):undefined;
  return normalizeAction({kind:'leave',days,until:until?.[1],reason:text.match(/\b(?:because|reason:)\s*(.+)$/i)?.[1]},raw);
 }
 const m=text.match(/\b(?:sign\s*up|register|confirm)\s+(.+?)\s+for\s+(?:the\s+)?(.+?)\s+(?:as|in)\s+(?:an?\s+)?([^,;]+)(?:[,;]|$)/i);
 if(m){const port=m[2].replace(/\b(?:port battle|battle|pb|tonight|today|tomorrow|at\s+\d{1,2}:\d{2})\b/gi,'').trim(),ship=m[3].replace(/\s+(?:they(?:'ll| will)|he(?:'ll| will)|she(?:'ll| will))\b.*$/i,'').trim();return normalizeAction({kind:'pb_signup',player:m[1],port,ship,day:/\btomorrow\b/i.test(text)?'tomorrow':/\b(?:tonight|today)\b/i.test(text)?'today':undefined,time:text.match(/\bat\s+(\d{1,2}:\d{2})\b/i)?.[1],horn:/\bprimary horn\b/i.test(text)?'Primary Horn':/\bsecondary horn\b/i.test(text)?'Secondary Horn':undefined,commander:/\bflank commander\b/i.test(text)?'Flank Commander':/\bfleet commander\b/i.test(text)?'Fleet Commander':/\bsiege commander\b/i.test(text)?'Siege Commander':undefined,confirm:/\bconfirm\b/i.test(text),replace:/\b(?:replace|transfer|take over)\b/i.test(text)},raw);}
 return null;
}
export function calendarDay(date:Date,timeZone:string){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function battleMatches(b:any,a:MisfitAction,now=new Date(),timeZone='Etc/GMT-4'){
 const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const port=norm(a.port??''),name=norm(String(b.port_name??''));const aliases:Record<string,string>={thermo:'thermopylae'};
 if(!port||name!==(aliases[port]??port)||b.status!=='OPEN'||!b.starts_at)return false;
 const starts=new Date(b.starts_at);if(!Number.isFinite(starts.getTime())||starts<=now)return false;
 if(a.day){const d=new Date(now);if(a.day==='tomorrow')d.setUTCDate(d.getUTCDate()+1);if(calendarDay(starts,timeZone)!==calendarDay(d,timeZone))return false;}
 if(a.time){const t=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(starts);if(t!==a.time.padStart(5,'0'))return false;}
 return true;
}
