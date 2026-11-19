// Dashboard admin controls for the Compendium: status, upload token, switching back to an older release.
import { activate, activeRelease, createUploadToken, releases, revokeUploadToken, tokenInfo } from "@/lib/compendium";
import { isDashboardAdmin, sameOrigin } from "@/lib/compendiumAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isDashboardAdmin(req))) return Response.json({ error: "admin_role_required" }, { status: 403 });
  return Response.json({ active: await activeRelease(), releases: await releases(), token: await tokenInfo(), envToken: Boolean(process.env.COMPENDIUM_UPLOAD_TOKEN) });
}

export async function POST(req: Request) {
  const admin = await isDashboardAdmin(req);
  if (!admin) return Response.json({ error: "admin_role_required" }, { status: 403 });
  if (!sameOrigin(req)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "token") return Response.json({ token: await createUploadToken(admin.globalName || admin.username) });
    if (body.action === "revoke") {
      await revokeUploadToken();
      return Response.json({ ok: true });
    }
    if (body.action === "activate") {
      await activate(String(body.release ?? ""));
      return Response.json({ ok: true });
    }
  } catch (e: any) {
    return Response.json({ error: "failed", message: String(e?.message ?? e) }, { status: Number(e?.status) || 500 });
  }
  return Response.json({ error: "bad_action" }, { status: 400 });
}
