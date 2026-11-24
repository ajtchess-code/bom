import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const base = (process.env.PUBLIC_DASHBOARD_URL ?? "").trim() || req.url;
  const r = NextResponse.redirect(new URL("/", base));
  r.cookies.delete("bom_session");
  return r;
}
