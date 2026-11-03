import '../../../apps/dashboard/app/globals.css';
import PortBattlesDashboard from '../../../apps/dashboard/components/PortBattlesDashboard';
const battle={id:'00000000-0000-4000-8000-000000000001',port_name:'Aruba',attacker:'BOM',defender:'DVS',status:'OPEN',rate:2,team_size:20,starts_at:'2026-10-24T01:00:00Z',ship_targets:{'St. Pavel':2},commander_slots:{}};
export default function Page(){return <PortBattlesDashboard initialBattles={[battle]} ports={[]} catalogue={{ships:[{id:'pavel',name:'St. Pavel',rate:2}]}} builds={[]} admin signupAllowed viewer={{id:'officer',name:'Officer'}} initialPreferences={{rates:{}}} initialConfig={{guilds:[{tag:'BOM',name:'Band Of Misfits'},{tag:'DVS',name:'DVS'}],ports:[],gameTimeOffsetMinutes:60}}/>;}
