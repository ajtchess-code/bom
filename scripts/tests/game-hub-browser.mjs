import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWriteStream} from 'node:fs';
const server=spawn(process.execPath,['--require',fileURLToPath(new URL('./fixtures/network-interfaces.cjs',import.meta.url)),'node_modules/next/dist/bin/next','dev','test-preview','--webpack','-H','127.0.0.1','-p','4311'],{stdio:['ignore','pipe','pipe']});server.stdout.pipe(createWriteStream('../preview-qa-log.txt'));server.stderr.pipe(createWriteStream('../preview-qa-errors.txt'));
for(let attempt=0;attempt<60;attempt++){try{const r=await fetch('http://127.0.0.1:4311');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{server.kill();console.error(e);process.exit(1);});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),results=[];
const tabSets={minecraft:['Overview','Join','World Map','Players','Projects','Economy','Guides','Operations'],clash:['Overview','Clan','Wars','CWL','Capital','My Accounts','Guides','Management']};
for(const width of [390,1440])for(const module of ['minecraft','clash']){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base={module,viewerId:'captain',manager:true,admin:true,settings:{readerRoleIds:[],managerRoleIds:[],clanTags:[],address:'mc.bandofmisfits.org',version:'Paper',bedrockEnabled:false,rules:'Respect the crew',whitelistApproval:true,reminderMinutes:60,discordReminders:false},records:[{id:'guide-1',kind:'guide',title:'Getting started',body:'## Join\nRead the server rules.',data:{version:1},updated_at:new Date().toISOString(),owner_id:'system'}],links:[],snapshots:[],jobs:[],notices:[],history:[],reservations:[],integrations:{clash:false,bridge:false,map:false}};
 await page.route('**/api/internal/games/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(base)}));
 await page.goto('http://127.0.0.1:4311/?module='+module);await page.getByRole('navigation').waitFor();
 for(const tab of tabSets[module]){await page.getByRole('navigation').getByRole('button',{name:tab,exact:true}).click();await page.waitForTimeout(70);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow)console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,text:e.textContent?.slice(0,80)}))));assert.equal(overflow,false,`${module}/${tab} overflow at ${width}`);results.push({module,tab,width});}
 assert.deepEqual(errors,[]);await page.getByRole('navigation').getByRole('button',{name:'Guides',exact:true}).click();await page.getByRole('textbox',{name:'Search game guides'}).fill('no match');await page.getByText('No matching articles.').waitFor();
 if(width===390&&module==='minecraft'){await page.getByRole('navigation').getByRole('button',{name:'Overview',exact:true}).click();await page.screenshot({path:'../qa-minecraft-mobile.png',fullPage:true});}
 await page.close();
}
await browser.close();server.kill();console.log(JSON.stringify({passed:results.length,results},null,2));
