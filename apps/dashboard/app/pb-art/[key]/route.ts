import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{64}\.png$/.test(key)) return new Response("Not found", { status: 404 });
  const root = process.cwd().replace(/\\/g, "/").endsWith("/apps/dashboard")
    ? resolve(process.cwd(), "../..")
    : process.cwd();
  try {
    const image = await readFile(join(root, "data/pb-art", key));
    return new Response(new Uint8Array(image), {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
