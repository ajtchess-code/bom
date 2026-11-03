import Dashboard from '../../../apps/dashboard/components/PrepReviewDashboard';
import '../../../apps/dashboard/app/globals.css';
export default function Page(){return <Dashboard initialKind="REVIEW" initialPorts={[{name:'Aruba',rate:'5th',size:25,mapFile:null,mapUrl:null,archivedMap:false}]} initialSessions={[{id:'fixture',kind:"REVIEW",title:'Fullscreen fixture',port_name:'Aruba',map_key:null,video_url:'/fixture.webm',version:1,updated_at:'2026-10-23T12:00:00Z'}]}/>;}
