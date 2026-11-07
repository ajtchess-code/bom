import { redirect } from "next/navigation";
// Event crafting costs were part of the retired Halloween 2026 event.
export default function Page() {
  redirect("/dashboard/admin");
}
