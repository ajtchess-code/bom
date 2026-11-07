import { redirect } from "next/navigation";
// The Halloween 2026 event has ended and its page is retired.
export default function Page() {
  redirect("/dashboard");
}
