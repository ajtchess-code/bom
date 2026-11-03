import {zonedParts} from './territory.js';
export const EVENT_GUIDANCE='Complete your daily event quest first. For event farming, whaling and collecting Pumpkins are highly useful; killing Ghost Ships is not a good use of time. If you only want to collect Pumpkins, use a very fast ship such as a speed-built Flying Cloud. Pumpkins can contain Insurance, Construction Licenses, Heavy Shot, Voodoo Skulls and Escudo. These are reported drops, not guaranteed rewards or known drop rates. Pirate Treasure Maps, Merchant Supply Maps and Fanatic Camp Maps can also provide event currency. Compare the exchange rates below before spending your Lollipops.';
export type EventItem={key:string;group:string;name:string;note:string;priority:'PRIORITY'|'ENCOURAGED'|'OPTIONAL'|'SUPPLIES';target?:number;preferred?:number;image?:string;coinCost?:number};
export const EVENT_ITEMS:EventItem[]=[
 {key:'12-apostolov',group:'1st Rate',name:'12 Apostolov',note:'Prioritize this ship. The guild will supply the Construction License.',priority:'PRIORITY'},
 {key:'sovereign',group:'1st Rate',name:'Sovereign',note:'Optional, but nice to have.',priority:'OPTIONAL'},
 {key:'st-pavel',group:'2nd Rate',name:'St. Pavel',note:'Preferred 2nd rate; prioritize this ship.',priority:'PRIORITY'},
 {key:'montanes',group:'2nd Rate',name:'Montanes',note:'Acquire from the event.',priority:'SUPPLIES'},
 {key:'azov',group:'2nd Rate',name:'Azov',note:'Acquire from the event.',priority:'SUPPLIES'},
 {key:'vasa',group:'2nd Rate',name:'Vasa',note:'Optional, but nice to have.',priority:'OPTIONAL'},
 {key:'georgy',group:'3rd Rate',name:'Georgy Pobedonosec',note:'Preferred 3rd rate; prioritize this ship.',priority:'PRIORITY'},
 {key:'al-fatih',group:'3rd Rate',name:'Al-Fatih',note:'Optional, but HIGHLY ENCOURAGED to prioritize.',priority:'ENCOURAGED'},
 ...[['san-leandro','San Leandro'],['san-juan','San Juan Nepomuceno'],['deadfish','Deadfish']].map(([key,name])=>({key,group:'3rd Rate',name,note:'Optional, but nice to have.',priority:'OPTIONAL' as const})),
 {key:'constitution-or-hierarchs',group:'4th Rate',name:'Constitution OR Three Hierarchs',note:'Preferred 4th rate; either ship completes this goal. Prioritize getting one.',priority:'PRIORITY'},
 {key:'friedrich',group:'4th Rate',name:'Friedrich Wilhelm',note:'Optional, but super useful for open-world PvP and tournaments.',priority:'ENCOURAGED'},
 {key:'rota',group:'5th Rate',name:'Rota',note:'Preferred 5th rate; prioritize this ship.',priority:'PRIORITY'},
 {key:'diana',group:'5th Rate',name:'Diana',note:'Optional, but highly useful.',priority:'ENCOURAGED'},
 {key:'shunsen',group:'6th Rate',name:'Shunsen',note:'Preferred 6th rate; prioritize this ship.',priority:'PRIORITY'},
 {key:'heavy-shot',group:'Other Event Items',name:'Heavy Shot',note:'50,000 minimum; 75,000+ highly preferred.',priority:'SUPPLIES',target:50000,preferred:75000,image:'/event-guide/heavy-shot.png'},
 {key:'saxon-shot',group:'Other Event Items',name:'Saxon Shot',note:'100,000 minimum; 200,000+ highly preferred.',priority:'SUPPLIES',target:100000,preferred:200000,image:'/event-guide/saxon-shot.png'},
 {key:'gold-lantern',group:'Other Event Items',name:'Golden Lantern',note:'Please get one if you do not have it. This is our primary Port Battle Lantern.',priority:'PRIORITY',coinCost:757,image:'/event-guide/gold-lantern.png'},
 {key:'white-lantern',group:'Other Event Items',name:'White Lantern',note:'Optional lantern.',priority:'OPTIONAL',coinCost:259,image:'/event-guide/white-lantern.png'},
 {key:'green-lantern',group:'Other Event Items',name:'Green Lantern',note:'Optional lantern.',priority:'OPTIONAL',coinCost:259,image:'/event-guide/green-lantern.png'},
 {key:'ice-lantern',image:'/event-guide/icons/ice-lantern.png',group:'Other Event Items',name:'Ice Lantern',note:'Optional, highly encouraged if you will actively play until the next event.',priority:'ENCOURAGED'},
 ...[['32-long','32-pdr Long Cannons',170],['36-unicorn','36-pdr Unicorns / Inrogs',170],['42-carronade','42-pdr Carronades',170],['18-long','18-pdr Long Cannons',80],['28-carronade','28-pdr Carronades',80],['16-carronade','16-pdr Carronades',55]].map(([key,name,n])=>({key:String(key),group:'Cannons',name:String(name),note:`${n}+ preferred.`,preferred:Number(n),priority:'SUPPLIES' as const})),
 {key:'8-culverin',group:'Cannons',name:'8-pdr Culverin',note:'65 preferred.',priority:'SUPPLIES',preferred:65}
];
export function eventDays(start:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(Date.parse(start+'T00:00:00Z'))||new Date(start+'T00:00:00Z').toISOString().slice(0,10)!==start)throw Error('Choose a valid start date');return Array.from({length:14},(_,n)=>new Date(Date.parse(start+'T00:00:00Z')+n*86400000).toISOString().slice(0,10));}
export function eventToday(zone:string,now=Date.now()){const p=zonedParts(now,zone);return `${p.year}-${p.month}-${p.day}`;}
export function validEventTimezone(zone:string){try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return true;}catch{return false;}}
export function nextEventReminder(pref:{mode:string;times?:string[];interval_minutes?:number;timezone:string},now=Date.now()){
 if(pref.mode==='INTERVAL')return new Date(now+Number(pref.interval_minutes)*60000);
 const times=new Set(pref.times??[]);for(let t=Math.floor(now/60000)*60000+60000;t<now+3*86400000;t+=60000){const p=zonedParts(t,pref.timezone);if(times.has(`${p.hour}:${p.minute}`))return new Date(t);}throw Error('No reminder time available');
}
