// Upload endpoint used by WoSB Workbench ("Publish wiki to Band of Misfits") and the dashboard's manual upload.
// Authorization: Bearer <upload token created in Dashboard → Wiki → Compendium>, or a signed-in dashboard admin.
import { beginUpload, finishUpload, receivePart, verifyUploadToken, PART_LIMIT } from "@/lib/compendium";
import { isDashboardAdmin, sameOrigin } from "@/lib/compendiumAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

async function allowed(req: Request) {
  if (await verifyUploadToken(req.headers.get("authorization"))) return true;
  // Signed-in admins can upload from the dashboard itself, never from another site.
  return sameOrigin(req) && Boolean(await isDashboardAdmin(req));
}
const fail = (e: any) => Response.json({ error: "upload_failed", message: String(e?.message ?? e) }, { status: Number(e?.status) || 500 });

export async function POST(req: Request) {
  if (!(await allowed(req))) return Response.json({ error: "unauthorized", message: "Upload token missing or wrong." }, { status: 401 });
  try {
    const body = await req.json();
    if (body?.action === "begin") {
      const u = await beginUpload(body);
      return Response.json({ id: u.id, release: u.release, completed: u.completed, parts: u.parts.length });
    }
    if (body?.action === "finish") {
      const a = await finishUpload(String(body.id ?? ""));
      return Response.json({ ok: true, release: a.release, files: a.files, bytes: a.bytes });
    }
    return Response.json({ error: "bad_action", message: "Use action begin or finish." }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  if (!(await allowed(req))) return Response.json({ error: "unauthorized", message: "Upload token missing or wrong." }, { status: 401 });
  try {
    const url = new URL(req.url);
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > PART_LIMIT) return Response.json({ error: "too_large", message: "Each part must be under 95 MB." }, { status: 413 });
    const bytes = Buffer.from(await req.arrayBuffer());
    const r = await receivePart(String(url.searchParams.get("id") ?? ""), Number(url.searchParams.get("part")), bytes);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return fail(e);
  }
}
