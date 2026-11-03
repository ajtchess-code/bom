import { internalFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import {AdminDirectory} from "@/components/AdminNavigation";

export default async function AdminPage(){
  const r=await internalFetch("/v1/admin/summary");
  if(r.status===401)redirect("/");
  if(r.status===403)redirect("/dashboard");
  if(!r.ok)throw new Error("Failed to load administration");
  return <AdminDirectory/>;
}
