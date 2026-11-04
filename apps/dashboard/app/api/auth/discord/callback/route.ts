import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const publicUrl = process.env.PUBLIC_DASHBOARD_URL;
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!publicUrl || !guildId || !botToken || !clientId || !clientSecret)
    return NextResponse.json(
      { error: "Discord single-guild OAuth is not fully configured" },
      { status: 500 },
    );
  const origin = new URL(publicUrl).origin;
  const url = new URL(req.url),
    code = url.searchParams.get("code"),
    state = url.searchParams.get("state"),
    expected = req.cookies.get("bom_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected)
    return NextResponse.redirect(new URL("/?auth=state", origin));
  const redirect = `${origin}/api/auth/discord/callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
  });
  const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!tokenResponse.ok) return NextResponse.redirect(new URL("/?auth=exchange", origin));
  const token: any = await tokenResponse.json();
  const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return NextResponse.redirect(new URL("/?auth=user", origin));
  const user: any = await userResponse.json();

  // OAuth proves identity; the API checks BOM membership or explicit allied PB access.
  const checked = await fetch(`${process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100"}/v1/access`, {
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
      "x-discord-user-id": String(user.id),
    },
    cache: "no-store",
  });
  if (!checked.ok) return NextResponse.redirect(new URL("/?auth=member", origin));
  const access = await checked.json();
  const jwt = await signSession({
    id: user.id,
    username: user.username,
    globalName: user.global_name,
    avatar: user.avatar,
  });
  const response = NextResponse.redirect(
    new URL(
      access.guestOnly
        ? "/dashboard/recruitment"
        : access.allianceOnly
          ? "/dashboard/events"
          : access.pbOnly
            ? "/dashboard/port-battles"
            : "/dashboard",
      origin,
    ),
  );
  response.cookies.set("bom_session", jwt, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  response.cookies.delete("bom_oauth_state");
  return response;
}
