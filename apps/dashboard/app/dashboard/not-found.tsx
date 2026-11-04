import {EmptyState} from "@/components/ui/State";
export default function DashboardNotFound(){return <EmptyState title="That page doesn't exist" icon="search" actions={[{label:"Go home",href:"/dashboard",primary:true}]}>It may have moved when the dashboard was reorganized. Everything is now under the seven sections in the sidebar.</EmptyState>;}
