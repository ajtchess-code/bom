import { NextResponse } from "next/server";
export async function GET(req:Request){const r=NextResponse.redirect(new URL("/",req.url));r.cookies.delete("bom_session");return r;}
