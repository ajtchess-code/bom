/** Safely normalize repeated leading guild tags without deleting distinct, unrecognized ones. */
const leadingTag=/^\s*(\[[^\[\]\r\n]{1,20}\])\s*/u;
export function collapseDuplicateLeadingTags(nickname:string):{value:string,duplicates:string[]}{
  const input=String(nickname??'').trim();let rest=input;const tags:string[]=[];
  for(let count=0;count<20;count++){
    const match=leadingTag.exec(rest);if(!match)break;
    tags.push(match[1]);rest=rest.slice(match[0].length);
  }
  if(!tags.length)return {value:input,duplicates:[]};
  const seen=new Set<string>();const unique:string[]=[];const duplicates:string[]=[];
  for(const tag of tags){const key=tag.toLocaleLowerCase('en-US');if(seen.has(key))duplicates.push(tag);else{seen.add(key);unique.push(tag);}}
  return {value:[...unique,rest.trim()].filter(Boolean).join(' '),duplicates};
}
export function nicknameBase(nickname:string,configuredPrefixes:string[]):string{
  let value=String(nickname??'').trim();
  const known=[...new Set(['[BOM]','[BoM 2]','[AFK]',...configuredPrefixes].filter(Boolean).map(String))].sort((a,b)=>b.length-a.length);
  // Strip only configured/historical membership tags; leave other tags in place.
  for(let n=0;n<20;n++){
    const matched=known.find(tag=>value.slice(0,tag.length).toLowerCase()===tag.toLowerCase());
    if(!matched)break;
    value=value.slice(matched.length).trimStart();
  }
  return collapseDuplicateLeadingTags(value).value||'Member';
}
export function proposedNickname(current:string,configuredPrefixes:string[],expectedTag:string):string{
  const base=nicknameBase(current,configuredPrefixes);
  return (expectedTag?`${expectedTag} ${base}`:base).slice(0,32);
}
