"""Build a pinned, attributed catalog from a local MIT-licensed source checkout."""
import json,hashlib,subprocess,argparse
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('checkout');args=parser.parse_args();src=Path(args.checkout);root=Path(__file__).resolve().parents[1]
commit=subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip()
def seconds(value):
 if not isinstance(value,dict):return None
 return sum(float(value.get(k,0))*n for k,n in [('days',86400),('hours',3600),('minutes',60),('seconds',1)])
items=[];sources=[]
for p in sorted((src/'data').rglob('*.json')):
 d=json.loads(p.read_text())
 if not isinstance(d,dict) or not isinstance(d.get('levels'),list) or not d.get('dataId'):continue
 levels=[]
 for l in d['levels']:
  if not isinstance(l,dict) or not isinstance(l.get('level'),int):continue
  levels.append({'level':l['level'],'supercharge':bool(l.get('supercharge',False)),'cost':l.get('buildCost',l.get('researchCost',l.get('upgradeCost'))),'resource':l.get('buildCostResource',l.get('researchCostResource',l.get('upgradeCostResource'))),'seconds':seconds(l.get('buildTime',l.get('researchTime',l.get('upgradeTime')))),'hall':l.get('townHallRequired',l.get('builderHallRequired',l.get('builderHallLevelRequired',l.get('capitalHallRequired')))),'laboratory':l.get('laboratoryRequired',l.get('starLabRequired')),'heroHall':l.get('heroHallLevelRequired'),'petHouse':l.get('petHouseLevelRequired'),'blacksmith':l.get('blacksmithLevelRequired'),'hitpoints':l.get('hitpoints'),'damage':l.get('damage'),'earthquakePercent':l.get('buildingDamagePercent'),'ore':{'shiny':l.get('upgradeShinyOre',0),'glowing':l.get('upgradeGlowingOre',0),'starry':l.get('upgradeStarryOre',0)},'stats':l.get('stats',{})})
 item={'id':str(d['dataId']),'slug':d['id'],'name':d['name'],'base':d.get('base'),'category':d.get('category'),'housing':d.get('housingSpace'),'hero':d.get('hero'),'rarity':d.get('rarity'),'availability':d.get('availablePerTownHall',d.get('availablePerBuilderHall',[])),'levels':levels,'sourcePath':p.relative_to(src).as_posix()};items.append(item)
 sources.append({'path':p.relative_to(src).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 # Preserve super troop IDs only when upstream explicitly supplies one; do not invent them.
manifest={'repository':'https://github.com/chiefpansancolt/clash-of-clans-data','commit':commit,'packageVersion':json.loads((src/'package.json').read_text())['version'],'license':'MIT','retrieved':'2026-10-21','files':sources}
(root/'data/clash/catalog.json').write_text(json.dumps({'source':{k:v for k,v in manifest.items() if k!='files'},'items':items},separators=(',',':'))+'\n')
(root/'third_party/clash-of-clans-data/SOURCE.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'third_party/clash-of-clans-data/LICENSE').write_text((src/'LICENSE').read_text())
print('Catalog entries:',len(items),'level rows:',sum(len(i['levels']) for i in items))
