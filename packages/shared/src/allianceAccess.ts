/** Default-deny API and page surface for a dashboard alliance-role account. */
export function allianceDashboardPath(path:string){return ['/dashboard/events','/dashboard/music','/dashboard/port-battles','/dashboard/diplomacy'].includes(path.replace(/\/$/,''));}
export function allianceApiAllowed(path:string,method:string){
 if(method==='GET'&&['/v1/access','/v1/event-tool','/v1/event-tool/summary','/v1/community/diplomacy','/v1/community/diplomacy/chart','/v1/wosb/map','/v1/wosb/catalogue','/v1/wosb/builds','/v1/wosb/pb-config','/v1/wosb/pb-access','/v1/wosb/port-battles','/v1/wosb/port-battle-templates'].includes(path))return true;
 if(method==='GET'&&/^\/v1\/wosb\/port-battles\/[a-f0-9-]{36}$/i.test(path))return true;
 if(/^\/v1\/wosb\/port-battles\/[a-f0-9-]{36}\/signup$/i.test(path))return ['POST','DELETE'].includes(method);
 if(path==='/v1/wosb/pb-preferences'||/^\/v1\/wosb\/pb-preferences\/rates\/[1-7]$/.test(path))return ['GET','PUT'].includes(method);
 if(/^\/v1\/event-tool\/(items|quests)\/[^/]+$/.test(path)||['/v1/event-tool/reminders','/v1/event-tool/earnings'].includes(path))return method==='PUT';
 if(method==='GET'&&['summary','features','source-capabilities','history/search','community','stats','achievements','profile','preferences','recommendations','events'].some(s=>path==='/v1/music/'+s))return true;
 if(method==='GET'&&/^\/v1\/music\/room\/[a-f0-9-]{36}\/live$/i.test(path))return true;
 if(method==='POST'&&['/v1/music/actions','/v1/music/feedback','/v1/music/favorites','/v1/music/queue/reorder'].includes(path))return true;
 if(method==='POST'&&/^\/v1\/music\/rooms\/[a-f0-9-]{36}\/actions$/i.test(path))return true;
 if(method==='PUT'&&['/v1/music/preferences','/v1/music/room-settings','/v1/music/profile'].includes(path))return true;
 return method==='DELETE'&&/^\/v1\/music\/favorites\/[^/]+\/[^/]+$/.test(path);
}
export function allianceOnlyRole(roles:string[],cfg:any,admin=false){const members=[cfg?.member_role_id,cfg?.bom2_member_role_id,cfg?.afk_role_id,cfg?.bom2_afk_role_id,...(cfg?.leave_member_role_ids??[])].filter(Boolean);return !admin&&Boolean(cfg?.alliance_role_id&&roles.includes(cfg.alliance_role_id))&&!members.some(id=>roles.includes(id));}
export function dashboardRoleScope(roles:string[],cfg:any,admin=false):'MEMBER'|'ALLIANCE'|'GUEST'{
 if(admin)return 'MEMBER';
 const memberRoles=[cfg?.member_role_id,cfg?.bom2_member_role_id,cfg?.afk_role_id,cfg?.bom2_afk_role_id,...(Array.isArray(cfg?.leave_member_role_ids)?cfg.leave_member_role_ids:[]),...(Array.isArray(cfg?.officer_role_ids)?cfg.officer_role_ids:[])].filter(Boolean);
 if(memberRoles.some(id=>roles.includes(id)))return 'MEMBER';
 if(cfg?.alliance_role_id&&roles.includes(cfg.alliance_role_id))return 'ALLIANCE';
 return memberRoles.length?'GUEST':'MEMBER';
}
