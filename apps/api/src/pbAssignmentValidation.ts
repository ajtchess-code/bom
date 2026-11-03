export function checkedAssignment(old:any,body:any){
 const fail=(message:string)=>{throw Object.assign(new Error(message),{statusCode:400});};
 const field=(key:string,oldKey:string)=>body[key]===undefined?old[oldKey]:(body[key]||null);
 const status=body.status??old.signup_status;
 if(!['ATTENDING','LATE','WAITLIST'].includes(status))fail('Invalid signup status.');
 const ship=status==='WAITLIST'?null:field('confirmedShip','confirmed_ship');
 const rawShips=typeof old.ships==='string'?JSON.parse(old.ships):old.ships;const ships=Array.isArray(rawShips)?rawShips:[];
 if(ship&&ship!==old.confirmed_ship&&!ships.includes(ship))fail('Assign only a ship this captain has selected as playable.');
 const horn=ship?field('hornDuty','horn_duty'):null,formation=ship?field('formation','formation'):null,commander=ship?field('commanderDuty','commander_duty'):null,buildId=ship?field('buildId','build_id'):null,flare=ship?field('flareDuty','flare_duty'):null;
 if(horn&&!['Primary Horn','Secondary Horn'].includes(horn))fail('Invalid Horn duty.');
 if(formation&&!['Mainline','Flank','Edge'].includes(formation))fail('Invalid formation.');
 if(commander&&!['Fleet Commander','Flank Commander','Siege Commander'].includes(commander))fail('Invalid commander duty.');
 if(buildId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buildId))fail('Invalid build reference.');
 return {ship,status,horn,formation,commander,buildId,flare};
}
