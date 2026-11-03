"use client";
import {useState} from 'react';
import CommunityAdmin from './CommunityAdmin';
export default function CommunitySettingsPage({initial}:{initial:any}){const [discord,setDiscord]=useState(initial);async function refresh(){const r=await fetch('/api/internal/membership/discord-context',{cache:'no-store'});if(r.ok)setDiscord((await r.json()).discord)}return <CommunityAdmin discord={discord} onRefresh={()=>void refresh()}/>}
