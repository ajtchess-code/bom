export const DESK_DESTINATIONS=[
 {value:'home',label:'Dashboard',path:'/dashboard'},
 {value:'battles',label:'Port Battles · Signups & Schedule',path:'/dashboard/port-battles'},
 {value:'prep',label:'Battle Prep',path:'/dashboard/battle-prep'},
 {value:'review',label:'Battle Review · VODs',path:'/dashboard/battle-review'},
 {value:'aar',label:'After Action Reports',path:'/dashboard/after-action-reports'},
 {value:'wiki',label:'Wiki',path:'/dashboard/wiki'},
 {value:'builder',label:'Build Library',path:'/dashboard/ship-builder'},
 {value:'ships',label:'Ships',path:'/dashboard/ships'},
 {value:'alliances',label:'Guilds & Alliances',path:'/dashboard/diplomacy'},
 {value:'map',label:'Battle Map',path:'/dashboard/map'},
 {value:'recruitment',label:'Applications & Recruitment',path:'/dashboard/recruitment'},
 {value:'feedback',label:'Feedback & Bug Reports',path:'/dashboard/feedback'}
];
const text=(content:string)=>({type:10,content});
const button=(id:string,label:string,style=2)=>({type:2,style,custom_id:id,label});
const link=(url:string,label:string)=>({type:2,style:5,url,label});
const row=(...components:any[])=>({type:1,components});
const menu=(id:string,placeholder:string,options:{label:string;value:string}[])=>row({type:3,custom_id:id,placeholder,min_values:1,max_values:1,options});
const container=(components:any[])=>({type:17,accent_color:0xd9aa3c,components});
const sep=()=>({type:14,divider:true,spacing:1});
export function deskPayload(url:string,leaveEnabled:boolean){return {flags:32768,allowedMentions:{parse:[]},components:[container([
 text('## Band of Misfits · Control Desk'),
 text('### Leave / Away\nSet a return date, extend your leave, or mark yourself active.'),
 {...menu('membership:leave:choose','Request or extend leave',[{label:'3 days',value:'3'},{label:'7 days',value:'7'},{label:'14 days',value:'14'},{label:'30 days',value:'30'},{label:'Choose a return date',value:'custom'}]),components:[{...menu('x','x',[]).components[0],custom_id:'membership:leave:choose',placeholder:'Request or extend leave',disabled:!leaveEnabled,options:[{label:'3 days',value:'3'},{label:'7 days',value:'7'},{label:'14 days',value:'14'},{label:'30 days',value:'30'},{label:'Choose a return date',value:'custom'}]}]},
 row(button('membership:leave:return','I Have Returned (Mark as Active)',3),link(url+'/dashboard/members/leave','Leave of Absence')),
 menu('membership:leave:view','View away information',[{label:'All away members',value:'all'},{label:'Returning in the next week',value:'week'},{label:'Overdue returns',value:'overdue'},{label:'My leave',value:'mine'}]),sep(),
 text('### Personal Discord Requests'),
 menu('membership:services','Choose a request',[{label:'Custom role',value:'role'},{label:'Custom emoji',value:'emoji'},{label:'Animated emoji',value:'animated_emoji'},{label:'Custom sticker',value:'sticker'},{label:'Custom soundboard',value:'soundboard'}]),sep(),
 text('### Guild Services'),row(link(url+'/dashboard/members?view=profile','My Profile & Ships'),link(url+'/dashboard/members','Guild Roster'),button('pbprefs:open','Set Preferred Ships'),button('membership:donation','Submit Donation',3),button('membership:welcome:diplo','Request Diplomacy')),
 row(link(url+'/dashboard/guild-ledger','Donations & Treasury')),sep(),text('### Guild Tools'),menu('membership:navigate','Open a dashboard tool',DESK_DESTINATIONS)
 ])]};}
export function musicDeskPayload(url:string){return {flags:32768,allowedMentions:{parse:[]},components:[container([
 text('## BOM Music'),text('Join a voice channel, then request music here or send a song name, playlist link, or music link in this channel.'),
 row(button('console:music:add','Request Music',3),button('console:music:queue','View Queue'),link(url+'/dashboard/music','Music Dashboard')),
 menu('console:music:menu','Playback and music options',[{label:'Pause / resume',value:'pause'},{label:'Vote to skip',value:'skip'},{label:'Lyrics',value:'lyrics'},{label:'Audio filters',value:'filters'},{label:'Recommendations',value:'recommend'},{label:'Toggle autoplay',value:'autoplay'},{label:'Stop playback',value:'stop'}])
 ])]};}
export function battleDiplomacyPayload(summary:string,mapFile:string,chartFile:string,url:string){return {flags:32768,allowedMentions:{parse:[]},components:[container([
 text('## WoSB Battle Map & Diplomacy'),text(summary),
 {type:12,items:[{media:{url:'attachment://'+mapFile},description:'WoSB Battle Map — remaining attack opportunities today'},{media:{url:'attachment://'+chartFile},description:'WoSB Alliance Chart'}]},
 row(button('membership:map:detail','Detailed Battle Map'),button('membership:map:update','Update Battle Map'),link(url+'/dashboard/diplomacy','Guilds & Alliances'))
 ])]};}
