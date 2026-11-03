'use client';
import {useState} from 'react';
import '../../../apps/dashboard/app/globals.css';
import Dashboard from '../../../apps/dashboard/components/EventToolDashboard';
export default function Page(){const [visible,setVisible]=useState(true);return <><button data-qa-toggle type="button" onClick={()=>setVisible(v=>!v)}>Toggle Halloween preview</button>{visible&&<Dashboard/>}</>;}
