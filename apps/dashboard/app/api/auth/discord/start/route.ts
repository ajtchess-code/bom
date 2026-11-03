import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export async function GET(){
  const clientId=process.env.DISCORD_CLIENT_ID, publicUrl=process.env.PUBLIC_DASHBOARD_URL;
  if(!clientId||!publicUrl)return NextResponse.json({error:"OAuth is not configured"},{status:500});
  const state=randomBytes(24).toString("hex");
  const origin=new URL(publicUrl).origin;
  const redirect=`${origin}/api/auth/discord/callback`;
  const u=new URL("https://discord.com/oauth2/authorize");
  u.search=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirect,scope:"identify",state}).toString();
  const r=NextResponse.redirect(u);
  r.cookies.set("bom_oauth_state",state,{httpOnly:true,secure:origin.startsWith("https://"),sameSite:"lax",path:"/",maxAge:600});
  return r;
}
