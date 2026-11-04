import test from 'node:test';import assert from 'node:assert/strict';
import {buildSignupModal,parseSignupForm,shipGroups} from '../../apps/controller/dist/pbSignupForm.js';
const ships12=['Victory','Bellona','Phoenix','Le Ocean','Santisima','Royal Sovereign','Prince','Montanes','Sultan','Hermione','Black Prince','Wasa'];
const fields=(v)=>({getRadioGroup:id=>v[id]??null,getCheckboxGroup:id=>v[id]??[],getStringSelectValues:id=>v['sel_'+id]??[]});
test('short ship lists use one checkbox group and stay within Discord limits',()=>{
 const m=buildSignupModal({id:'b',port_name:'Aruba',rate:1},ships12.slice(0,8),{ships:['Victory'],preferred:['Victory'],hornCapable:true}).toJSON();
 assert.ok(m.components.length<=5);assert.ok(m.title.length<=45);
 const types=m.components.map(c=>[c.type,c.component.type]);
 assert.deepEqual(types,[[18,21],[18,22],[18,22],[18,22]]);
 const radio=m.components[0].component;assert.ok(radio.options.some(o=>o.value==='TENSIONING'&&/Tensioning/.test(o.label)));
 assert.equal(radio.options.find(o=>o.default)?.value,'ATTENDING');
 const duties=m.components[3].component.options.map(o=>o.value);assert.ok(!duties.some(v=>/blue/i.test(v)));assert.ok(m.components[3].component.options.find(o=>o.value==='HORN').default);
});
test('12-ship rates split into two groups of at most 10 and use a dropdown for preferred',()=>{
 assert.deepEqual(shipGroups(ships12).map(g=>g.length),[6,6]);
 const m=buildSignupModal({id:'b',port_name:'A very long port name that goes on',rate:3},ships12,{status:'LATE',lateMinutes:30}).toJSON();
 assert.equal(m.components.length,5);assert.ok(m.title.length<=45);
 for(const c of m.components)if(c.component.type===22)assert.ok(c.component.options.length<=10);
 assert.equal(m.components[3].component.type,3);assert.equal(m.components[3].component.max_values,2);
 assert.equal(m.components[0].component.options.find(o=>o.default)?.value,'LATE_30');
});
test('submission adds preferred ships to ships, maps late minutes and drops unknown ships',()=>{
 const r=parseSignupForm(fields({status:'LATE_45',ships_0:['Victory','Hacked'],sel_preferred:['Wasa'],duties:['HORN_PREF','Gold Flare']}),ships12,'Cap');
 assert.equal(r.error,null);assert.equal(r.body.status,'LATE');assert.equal(r.body.lateMinutes,45);
 assert.deepEqual(r.body.ships.sort(),['Victory','Wasa']);assert.deepEqual(r.body.preferredShips,['Wasa']);
 assert.equal(r.body.hornCapable,true);assert.equal(r.body.hornPreferred,true);assert.deepEqual(r.body.flareCapabilities,['Gold Flare']);
});
test('attending with no ships asks to try again; tensioning needs no ships',()=>{
 assert.match(parseSignupForm(fields({status:'ATTENDING'}),ships12,'Cap').error,/at least one ship/);
 const t=parseSignupForm(fields({status:'TENSIONING'}),ships12,'Cap');assert.equal(t.error,null);assert.equal(t.body.status,'TENSIONING');
});
