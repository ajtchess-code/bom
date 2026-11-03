import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {normalizeVillageExport} from '../../packages/shared/dist/clashToolkit.js';
const catalog=JSON.parse(await readFile('data/clash/catalog.json','utf8'));
const normalized=normalizeVillageExport({tag:'#PYY',timestamp:Date.now(),buildings:[{data:1000001,lvl:10},{data:1000008,lvl:2}],units:[{data:4000000,lvl:2}]},catalog);
const toolState={catalog,imports:[{account_id:'#PYY',owner_id:'captain',normalized,exported_at:normalized.exportedAt,imported_at:normalized.exportedAt}],documents:[],links:[{account_id:'#PYY',user_id:'captain',display_name:'Captain'}],manager:true,viewerId:'captain',analysis:{players:[],observedWars:0,dataLabel:'Observed data'},health:[]};
const allTools=['Village import','Builder timeline','Upgrade advisor','Magic items','Equipment & ore','Army library','Base library','Attack planner','Spell calculator','Attack reviews','Practice board','War readiness','War performance','CWL lineup','CWL scenarios','Clan health','Recruit comparison','Clan transfers','Clan Games','Capital priorities','Season reports','Recognition'];
const server=spawn(process.execPath,['--require',fileURLToPath(new URL('./fixtures/network-interfaces.cjs',import.meta.url)),'node_modules/next/dist/bin/next','dev','test-preview','--webpack','-H','127.0.0.1','-p','4311'],{stdio:['ignore','pipe','pipe']});server.stdout.pipe(createWriteStream('../preview-qa-log.txt'));server.stderr.pipe(createWriteStream('../preview-qa-errors.txt'));
for(let attempt=0;attempt<60;attempt++){try{const r=await fetch('http://127.0.0.1:4311');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{server.kill();console.error(e);process.exit(1);});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),results=[];
const tabSets={minecraft:['Overview','Join','World Map','Players','Projects','Economy','Guides','Operations'],clash:['Overview','Clan','Wars','CWL','Capital','My Accounts','Tools','Guides','Management']};
for(const width of [390,1440])for(const module of ['minecraft','clash']){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
 const base={module,viewerId:'captain',manager:true,admin:true,settings:{readerRoleIds:[],managerRoleIds:[],clanTags:[],address:'mc.bandofmisfits.org',version:'Paper',bedrockEnabled:false,rules:'Respect the crew',whitelistApproval:true,reminderMinutes:60,discordReminders:false},records:[{id:'guide-1',kind:'guide',title:'Getting started',body:'## Join\nRead the server rules.',data:{version:1},updated_at:new Date().toISOString(),owner_id:'system'}],links:[],snapshots:[],jobs:[],notices:[],history:[],reservations:[],integrations:{clash:false,bridge:false,map:false}};
 await page.route('**/api/internal/games/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/tools/state')?toolState:base)}));
 await page.goto('http://127.0.0.1:4311/?module='+module);await page.getByRole('navigation').waitFor();
 for(const tab of tabSets[module]){await page.getByRole('navigation').getByRole('button',{name:tab,exact:true}).click();await page.waitForTimeout(70);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow)console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,text:e.textContent?.slice(0,80)}))));assert.equal(overflow,false,`${module}/${tab} overflow at ${width}`);results.push({module,tab,width});}
 if(module==='clash'){await page.getByRole('navigation').getByRole('button',{name:'Tools',exact:true}).click();await page.getByLabel('Clash tool',{exact:true}).waitFor();for(const tool of allTools){await page.getByLabel('Clash tool',{exact:true}).selectOption({label:tool});await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,tool+' overflow at '+width);results.push({module,tool,width});}
 await page.getByLabel('Clash tool',{exact:true}).selectOption({label:'Army library'});await page.getByLabel('Inspect an army link').fill('u10x0s2x0');await page.getByRole('button',{name:'Inspect Army',exact:true}).click();await page.getByText('10 known troop space', {exact:false}).waitFor();await page.getByRole('button',{name:'Add army',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.getByLabel('Close editor').click();
 await page.getByLabel('Clash tool',{exact:true}).selectOption({label:'Builder timeline'});await page.getByRole('button',{name:'Select up to 100 eligible upgrades'}).click();await page.getByRole('button',{name:'Save private plan'}).waitFor({state:'visible'});assert.equal(await page.getByRole('button',{name:'Save private plan'}).isEnabled(),true);
 await page.getByLabel('Clash tool',{exact:true}).selectOption({label:'Attack planner'});const canvas=page.getByRole('img',{name:'Attack annotation canvas'}),box=await canvas.boundingBox();await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+100,box.y+100,{steps:3});await page.mouse.up();assert.equal(await canvas.locator('polyline').count(),1);
 if(width===1440)await page.screenshot({path:'../qa-clash-workshop.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);await page.getByRole('navigation').getByRole('button',{name:'Guides',exact:true}).click();await page.getByRole('textbox',{name:'Search game guides'}).fill('no match');await page.getByText('No matching articles.').waitFor();
 if(width===390&&module==='minecraft'){await page.getByRole('navigation').getByRole('button',{name:'Overview',exact:true}).click();await page.screenshot({path:'../qa-minecraft-mobile.png',fullPage:true});}
 await page.close();
}
await browser.close();server.kill();console.log(JSON.stringify({passed:results.length,widths:[390,1440],tools:allTools.length},null,2));
