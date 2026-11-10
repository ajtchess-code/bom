import { redirect } from "next/navigation";
export default async function ShipsPage() {
  redirect("/dashboard/wiki?tool=shipyard");
}
