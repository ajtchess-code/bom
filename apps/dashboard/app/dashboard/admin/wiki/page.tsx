import {internalFetch} from "@/lib/api";
import {redirect} from "next/navigation";
export default async function WikiAdminPage(){const response=await internalFetch("/v1/access");if(!response.ok)redirect("/dashboard/wiki");const access=await response.json();redirect(access.dashboardAdmin?"/dashboard/wiki?tool=install":"/dashboard/wiki");}
