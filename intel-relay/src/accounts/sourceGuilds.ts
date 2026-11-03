/** Freeze legacy routes to servers with explicitly selected channels, never every joined guild. */
export function primarySourceGuilds(account:{guildId?:string;monitoredGuildIds?:string[]|undefined;channels:string[];subRelays?:Array<{guildId:string}>},client:any){
 const excluded=new Set((account.subRelays??[]).map(s=>s.guildId));
 if(account.guildId)return [account.guildId];
 if(account.monitoredGuildIds!==undefined)return [...new Set(account.monitoredGuildIds)].filter(id=>!excluded.has(id));
 const ids=new Set<string>();
 for(const id of account.channels){const cached=client.channels?.cache?.get(id);const guildId=cached?.guild?.id??[...client.guilds.cache.values()].find((g:any)=>g.channels?.cache?.has(id))?.id;if(guildId&&!excluded.has(guildId))ids.add(guildId);}
 return [...ids];
}
