import {basename} from 'node:path';
export function wikiImageResolver(inventory:any[],links:Record<string,any[]>){
  const names=new Map<string,any[]>();
  for(const image of inventory){const key=basename(image.PNGPath,'.png');names.set(key,[...(names.get(key)??[]),image]);}
  const match=(reference:string)=>{
    const found=names.get(reference)??[];
    // Exact client texture names can have alternate exports; keep every variant.
    return found.map(i=>({...i,Relationship:'Explicit client image reference matched to exported texture name'}));
  };
  return (table:string,row:any)=>{
    if(table==='Crafting_Recipes'&&row.OutputType==='resource')return links[`Resources:res_${row.OutputID}`]??[];
    if(String(row.PNGPath??'').startsWith('Images/'))return [{...row,Relationship:row.Relationship??'Exported source image'}];
    const rectangle=String(row.IconName??'').trim().match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if(rectangle){
      const [lx,ly,lw,lh]=rectangle.slice(2).map(Number);
      return match(rectangle[1]).flatMap(i=>{
        const scale=i.SourceSHA256==='1a515fbf3dd1d071052ce67e69415772e038343875e2251e1d39a693e504dced'&&i.Width===1920&&i.Height===390&&lw===64&&lh===64?2:1;
        const x=lx*scale,y=ly*scale,width=lw*scale,height=lh*scale;
        return width>0&&height>0&&x+width<=i.Width&&y+height<=i.Height?[{...i,ImageID:`${i.ImageID}:${x}:${y}:${width}:${height}`,Rect:{x,y,width,height},LogicalRect:{x:lx,y:ly,width:lw,height:lh},RectScale:scale,Relationship:scale===2?'Client icon rectangle mapped to verified 2× exported sheet':'Explicit client icon rectangle'}]:[];
      });
    }

    const explicit=String(row.IconName||row.IconTextureName||row.IconTexture||row.Icon||row.Texture||'').trim();
    let exact=explicit&&!/\s/.test(explicit)?match(explicit):[];
    if(!exact.length&&row.Category==='SailTexture'&&String(row.Texture??'').endsWith('_')){
      for(const part of ['main','mini','side','triangle']){
        const target=String(row.Texture)+part;
        const candidates=inventory.filter(i=>basename(i.PNGPath,'.png').toLowerCase()===target.toLowerCase());
        exact.push(...candidates.map(i=>({...i,Relationship:`Texture-prefix component candidate (inferred): ${part}; not a 3D sail preview`})));
      }
    }
    const alias:Record<string,string>={Crew_Sailors:'UnitsInfo',Crew_Boarding:'UnitsInfo',Crew_Special:'UnitsInfo'};
    const ids=[row.ID,row.Name,row.EntityID,row.Key].filter(v=>v!=null).map(String);
    const linked=ids.flatMap(id=>links[`${alias[table]??table}:${id}`]??[]);
    const seen=new Set<string>();return [...exact,...linked].filter(i=>{const key=`${i.PNGPath}:${JSON.stringify(i.Rect??null)}`;if(seen.has(key))return false;seen.add(key);return true;});
  };
}
