"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
export const ADMIN_SECTIONS=[
['event-crafting','Event Crafting Costs','Configure Halloween ship resource requirements'],
['permission-presets','Permission Presets','Save channel permission layouts and apply them to selected channels'],
['membership','Membership & Welcome','Onboarding, roles, roster, prefixes and custom requests'],
['ask-rules','Ask Settings & Rules','Ask channel, assistance, corrections, server and Trade rules'],
['banter','BOM Banter','Personality, spontaneous channels, cooldowns and reply limits'],
['ai-providers','AI Providers','Groq, Gemini and per-feature routing and budgets'],
['openai','OpenAI Connection','API key, encrypted credentials and connection test'],
['recruitment','Recruitment','Applications, trials, recruiter roles and response templates'],
['port-battles','Port Battles','Officer access, signup roles, ships and fleet defaults'],
['music','Music','Permissions, playback defaults, radio and recommendations'],
['automations','Automations & Social','Voice rooms, threads, reactions and social feeds'],
['brand-kit','Branding','Bot identity, welcome art, logos and visual assets'],
['wiki','Wiki & Knowledge','Articles, sources, corrections and language intelligence'],
['sentinel','Sentinel','Archive policy, retention and recovery permissions'],
['platform','Platform & Access','Feature flags, setup and platform permissions'],
['diagnostics','Diagnostics','Services, workers and performance']
];
export default function AdminNavigation(){const path=usePathname(),[query,setQuery]=useState('');return <aside className="adminSectionNav"><Link href="/dashboard/admin" className={path==='/dashboard/admin'?'active':''}>Admin Overview</Link><label>Find Configuration<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search settings…"/></label><label className="adminMobileSection">Configuration Section<select value={ADMIN_SECTIONS.some(([key])=>path.split('/')[3]===key)?path.split('/')[3]:'admin'} onChange={e=>window.location.assign(e.target.value==='admin'?'/dashboard/admin':'/dashboard/admin/'+e.target.value)}><option value="admin">Admin Overview</option>{ADMIN_SECTIONS.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><nav className={query?"searchResults":""} aria-label="Admin sections">{ADMIN_SECTIONS.filter(s=>s.join(' ').toLowerCase().includes(query.toLowerCase())).map(([key,title,description])=><Link key={key} href={'/dashboard/admin/'+key} aria-current={path==='/dashboard/admin/'+key?'page':undefined} className={path==='/dashboard/admin/'+key?'active':''}><b>{title}</b><small>{description}</small></Link>)}</nav></aside>}
export function AdminDirectory(){return <div><h1>Administration</h1><p>All server configuration in one place. Choose a section or use Find Configuration.</p><div className="adminDirectory">{ADMIN_SECTIONS.map(([key,title,description])=><Link className="panel" key={key} href={'/dashboard/admin/'+key}><h2>{title}</h2><p>{description}</p><span>Open Settings →</span></Link>)}</div></div>}
