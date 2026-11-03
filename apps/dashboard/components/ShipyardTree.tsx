"use client";

/**
 * The five in-game Shipyard bands, arranged in their original order.
 * Each array represents one physical shipyard row (not an auto-wrapping list).
 * A slot offset is retained as ships are filtered so search never shuffles the tree.
 */
type ShipyardTreeProps={
  ships:any[];
  onSelect:(ship:any)=>void;
  selectedKey?:string|null;
  compact?:boolean;
  title?:string;
};
type ShipyardRow={ships:string[];offset?:number};
type ShipyardGroup={id:string;label:string;rows:ShipyardRow[]};

const normalize=(v:any)=>{
  const key=String(v??"").normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  const aliases:Record<string,string>={
    horizon:"horizont",redoubtable:"redoutable",redoutable:"redoutable",
    twelveapostolov:"12apostolov","12aspotolov":"12apostolov",
    "santissimatrinidad":"santisimatrinidad"
  };
  return aliases[key]??key;
};
const format=(v:any)=>v==null||v===""?"—":typeof v==="number"?v.toLocaleString(undefined,{maximumFractionDigits:2}):String(v);
// The legacy thumbnails below had screenshot scenery baked into their pixels.
// Shipyard-specific transparent cutouts leave the original source files intact
// for the ship builder, wiki, and other consumers.
const SHIPYARD_CUTOUTS=new Set([
  "mBonhommeRichard.png","mBuenViento.png","mDiana.png","mFairAmerican.png",
  "mGeorgyPobedonosec.png","mQingLong.png","mRota.png",
  "mSanJuanNepomuceno.png","mSanLeandro.png","mShen.png","mTieLong.png"
]);
function shipyardArt(ship:any){
  const source=String(ship.image??"");
  const filename=source.split("/").at(-1)??"";
  return SHIPYARD_CUTOUTS.has(filename)?`/wosb/shipyard/cutouts/${filename}`:source||"/wosb/navigation/ships.png";
}


const GROUPS:ShipyardGroup[]=[
  {id:"antilia",label:"ANTILIA",rows:[
    {offset:2,ships:["Southampton","Falmouth","Mordaunt","Bonhomme Richard"]},
    {ships:["Pickle","Fair American","Black Wind","Essex","Anson","Sans Pareil","Victory"]},
    {offset:2,ships:["Rota","Constitution","Bellona"]}
  ]},
  {id:"espanol",label:"ESPAÑOL",rows:[
    {offset:1,ships:["Le Cerf","La Creole","Surprise","Iberia"]},
    {ships:["Friede","Mercury","Buen Viento","San Martin","Le Saint Louis","La Sirene","La Couronne"]},
    {ships:["La Salamandre","Le Requin","Diana","Friedrich Wilhelm","San Leandro","Montanes"]}
  ]},
  {id:"kai",label:"KAI & SEVERIA",rows:[
    {ships:["Horizont","Polacca","Russia","Qing Long","Poltava","Ingermanland"]},
    {offset:1,ships:["Phoenix","Tie Long","Three Hierarchs","Georgy Pobedonosec","St. Pavel","12 Apostolov"]}
  ]},
  {id:"empire",label:"EMPIRE",rows:[
    {ships:["Balloon","Black Prince","Devourer","Deadfish","Octopus","Huracan"]}
  ]},
  {id:"premium",label:"PREMIUM AND UNIQUE SHIPS",rows:[
    {offset:1,ships:["Savannah","Eagle","Red Arrow","Prins Willem","Neptuno","Firestorm"]},
    {offset:1,ships:["Golden Apostle","Axel Thorsen","Sparrow","Shen","Adventure","Santisima Trinidad"]},
    {offset:1,ships:["Shunsen","Kwee Song","Flying Cloud","San Juan Nepomuceno","Azov","De Zeven Provincien"]},
    {offset:3,ships:["Kobukson","Vasa","Sovereign"]},
    {offset:5,ships:["Redoutable","La Royale"]}
  ]},
  {id:"event",label:"EVENT SHIPS",rows:[
    {ships:["Leopard"]}
  ]}
];

// Stars reproduce the markers in the in-game screenshot rather than guessing
// from ship stats. The subdued variant denotes an outline/silver marker.
const STARS:Record<string,"gold"|"silver">={
  essex:"silver",anson:"gold",victory:"gold",constitution:"silver",bellona:"gold",
  sanmartin:"gold",lacouronne:"gold",poltava:"silver","12apostolov":"gold",
  prinswillem:"gold",neptuno:"gold",adventure:"gold",santisimatrinidad:"gold",
  dezevenprovincien:"gold",sovereign:"gold",redoutable:"gold"
};

const PREMIUM_BADGES=new Set([
  "savannah","eagle","redarrow","prinswillem","neptuno","firestorm",
  "goldenapostle","axelthorsen","sparrow","shen","adventure","santisimatrinidad",
  "shunsen","kweesong","flyingcloud","sanjuannepomuceno","azov",
  "dezevenprovincien","kobukson","vasa","sovereign","redoutable","laroyale"
]);

function SailMarker({row}:{row:number}){
  return <span className={`shipyardGameSail shipyardGameSail-${row}`} aria-hidden="true">
    <svg viewBox="0 0 44 38" fill="none">
      <path d="M10 28.5h26l-4.5 4H14.5z" fill="#dbcba5"/>
      <path d="M23 4.5v25" stroke="#a4987b" strokeWidth="1.3"/>
      {row===0?<>
        <path d="M21 7L8 26h13z" fill="#ede8d2"/>
        <path d="M25 6l12 19H25z" fill="#f4eed8"/>
      </>:row===1?<>
        <path d="M21 9L7 27h14z" fill="#eee5c8"/>
        <path d="M25 10l12 17H25z" fill="#ded1aa"/>
        <path d="M9 24h30" stroke="#9e8d65" strokeWidth="1"/>
      </>:<>
        <path d="M20 8L9 27h11z" fill="#e9e3cd"/>
        <path d="M25 5l13 22H25z" fill="#d9cca8"/>
        <path d="M5 28h34" stroke="#b9a981" strokeWidth="1.4"/>
      </>}
    </svg>
  </span>;
}

function ShipTile({ship,selected,onSelect,premium,compact}:{ship:any;selected:boolean;onSelect:(v:any)=>void;premium:boolean;compact:boolean}){
  const st=ship?.stats??{};
  const key=normalize(ship?.name);
  const star=STARS[key];
  const hasBadge=premium&&PREMIUM_BADGES.has(key);
  return <button type="button" className={`shipyardGameShip shipyardGameShip-${key}${selected?" isSelected":""}`} onClick={()=>onSelect(ship)} aria-pressed={selected} aria-label={`Open ${ship.name} ship details`}>
    <span className={`shipyardGameShipArt shipyardGameShipArt-${key}`}><img className={`shipyardGameShipImg shipyardGameShipImg-${key}`} src={shipyardArt(ship)} alt="" loading="lazy"/></span>
    <span className="shipyardGameShipName">{hasBadge&&<span className="shipyardGamePremiumIcon" title="Premium or unique hull" aria-label="Premium hull">✥</span>}{ship.name}</span>
    <span className={`shipyardGameShipStar ${star??"none"}`} aria-label={star?`${star} shipyard star`:undefined}>{star?"★":"\u00a0"}</span>
    <span className="shipyardGameHover" role="tooltip">
      <strong>{ship.name}</strong>
      <em>{ship.rate?`Rate ${ship.rate}`:"Rate —"}{ship.class?` · ${ship.class}`:""}</em>
      <span><small>Hull</small><b>{format(st.durability)}</b></span>
      <span><small>Speed</small><b>{format(st.speed)}</b></span>
      <span><small>Mnv</small><b>{format(st.maneuverability)}</b></span>
      <span><small>Armor</small><b>{format(st.armor)}</b></span>
      <span><small>Crew</small><b>{format(st.crew)}</b></span>
      <span><small>Hold</small><b>{format(st.hold)}</b></span>
      <i>{compact?"Select this hull":"Click for ship details"}</i>
    </span>
  </button>;
}

export default function ShipyardTree({ships,onSelect,selectedKey,compact=false,title="Shipyard tree"}:ShipyardTreeProps){
  const byName=new Map<string,any>();
  for(const ship of ships??[]){const key=normalize(ship?.name);if(key&&!byName.has(key))byName.set(key,ship);}
  const used=new Set<string>();
  const groups=GROUPS.map(group=>{
    const rows=group.rows.map((row,rowIndex)=>{
      const visible=row.ships.flatMap((name,i)=>{
        const ship=byName.get(normalize(name));
        const key=normalize(ship?.name);
        if(!ship||used.has(key))return [];
        used.add(key);
        return [{ship,column:(row.offset??0)+i+1}];
      });
      return {index:rowIndex,visible};
    }).filter(row=>row.visible.length>0);
    return {...group,rows};
  }).filter(group=>group.rows.length>0);
  const extra=(ships??[]).filter(ship=>!used.has(normalize(ship?.name))).sort((a:any,b:any)=>String(a.name??"").localeCompare(String(b.name??"")));
  if(extra.length){
    const rows=[];
    for(let index=0;index<extra.length;index+=7){rows.push({index:index/7,visible:extra.slice(index,index+7).map((ship:any,i:number)=>({ship,column:i+1}))});}
    groups.push({id:"other",label:"OTHER SHIPS",rows});
  }

  return <div className={`shipyardGameTree${compact?" compact":""}`} aria-label={title}>
    {!compact&&<div className="shipyardGameHeading"><span>THE ARCHIPELAGO SHIPYARDS</span><span>Hover for ship statistics · Select a vessel to open details</span></div>}
    <div className="shipyardGameViewport" role="region" aria-label="Scrollable in-game-style shipyard tree" tabIndex={0}>
      <div className="shipyardGameSections">
        {groups.map(group=><section className={`shipyardGameFaction shipyardGame-${group.id}`} key={group.id} aria-label={`${group.label} shipyard`}>
          <div className="shipyardGameFactionLabel">
            {(group.id==="other"||group.id==="event")?<span className="shipyardGameOtherGlyph" aria-hidden="true">{group.id==="event"?"★":"✦"}</span>:<img src={`/wosb/shipyard/crest-${group.id}.png`} alt="" loading="lazy"/>}
            <strong>{group.label}</strong>
          </div>
          <div className="shipyardGameRows">
            {group.rows.map(row=><div className="shipyardGameRow" key={row.index}>
              <SailMarker row={row.index}/>
              <div className="shipyardGameFleet">
                <span className="shipyardGameWave" aria-hidden="true"/>
                <div className="shipyardGameFleetGrid">
                  {row.visible.map(({ship,column})=><div className="shipyardGameFleetSlot" key={String(ship.entityKey??ship.id??ship.name)} style={{gridColumn:column}}>
                    <ShipTile ship={ship} premium={group.id==="premium"} compact={compact} onSelect={onSelect} selected={selectedKey===String(ship.entityKey??ship.id??ship.name)}/>
                  </div>)}
                </div>
              </div>
            </div>)}
          </div>
        </section>)}
      </div>
    </div>
    {!compact&&<span className="shipyardGameMobileHint">Swipe sideways to explore the complete ship tree on smaller screens.</span>}
  </div>;
}
