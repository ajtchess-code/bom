/** A reference distinguishes guilds whose visible tags are identical. */
export const guildReference=(g:any):string=>String(g?.reference||g?.tag||'');
export function resolveCatalogueGuild(guilds:any[],reference:string):any {
 const direct=guilds.find(g=>guildReference(g)===reference);if(direct)return direct;
 const alias=guilds.filter(g=>(g.aliases??[]).includes(reference));if(alias.length===1)return alias[0];
 const folded=guilds.filter(g=>guildReference(g).toLowerCase()===reference.toLowerCase());return folded.length===1?folded[0]:undefined;
}
export function mergeGuildCatalogue(defaults:any[],saved:any[]):any[]{
 const records=defaults.map(g=>({...g}));
 for(const g of Array.isArray(saved)?saved:[]){if(!g?.tag)continue;
 const previous=records.find(d=>g.id&&d.id===g.id)||resolveCatalogueGuild(records,guildReference(g));
 if(previous)Object.assign(previous,g);else records.push({...g});
 }return records.filter(g=>String(g.tag).trim().toUpperCase()!=='YIP');
}
