'use client';
const choices=[['1h',60],['6h',360],['12h',720],['1d',1440],['2d',2880],['3.2d',4608]] as const;
export default function DurationQuickButtons({days,hours,minutes,onChange,label}:{days:number|string;hours:number|string;minutes:number|string;onChange:(v:{protectionDays:number;protectionHours:number;protectionMinutes:number})=>void;label:string}){
 const selected=Number(days)*1440+Number(hours)*60+Number(minutes);
 return <div className="territoryQuickDuration"><small>Quick duration</small><div className="pbTimeButtons" role="group" aria-label={label}>{choices.map(([text,total])=><button type="button" key={text} className={selected===total?'active':''} aria-pressed={selected===total} onClick={()=>onChange({protectionDays:Math.floor(total/1440),protectionHours:Math.floor(total/60)%24,protectionMinutes:total%60})}>{text}</button>)}</div></div>;
}
