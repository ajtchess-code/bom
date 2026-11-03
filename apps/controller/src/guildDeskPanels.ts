const text=(content:string)=>({type:10,content});
const separator={type:14,divider:true,spacing:1};
const button=(label:string,id:string,style=2)=>({type:2,label,custom_id:id,style});
const link=(label:string,url:string)=>({type:2,label,url,style:5});
const row=(...components:any[])=>({type:1,components});
export function guildDeskPanels(settings:any,leaves:any[],base:string){
 const url=(path:string)=>base.replace(/\/$/,'')+path;
 const container=(components:any[])=>({flags:32768,components:[{type:17,accent_color:0xD9AA3C,components}],allowedMentions:{parse:[]}});
 const music=container([text('## ♫ Misfit · Music Lounge'),text('Your room. Your soundtrack.\nJoin a voice channel, then request a track or open your room’s player.'),separator,row(button('Request a Song','console:music:add',3),button('Player Controls','console:music:controls',1),button('View Queue','console:music:queue')),row(link('Open Music Dashboard',url('/dashboard/music')))]);
 const away=leaves.length?leaves.slice(0,8).map(x=>`• <@${x.user_id}> · returns <t:${Math.floor(new Date(x.return_at).getTime()/1000)}:D>`).join('\n'):'All hands accounted for. Nobody is currently marked away.';
 const desk=container([text('## ⚓ Misfit · Crew Control Desk'),text('**Different ships. Same crew.**\nYour profile, fleet preferences and guild services, one click away.'),separator,text('### Captain’s Quarters\nKeep your ships current, find the crew, or request a Discord role.'),row(link('My Profile & Ships',url('/dashboard/members?view=profile')),link('Guild Roster',url('/dashboard/members')),link('Request a Role',url('/dashboard/members?view=role'))),separator,text(`### Shore Leave · ${leaves.length}\n${away}`),row({...button('Request / Update Leave','membership:leave:request',1),disabled:!settings.leave_enabled},{...button('I Have Returned','membership:leave:return',3),disabled:!settings.leave_enabled}),row(link('Port Battles',url('/dashboard/port-battles')),link('Command Deck',url('/dashboard')))]);
 return {music,desk};
}
