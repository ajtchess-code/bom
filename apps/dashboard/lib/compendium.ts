// The WoSB Wiki (internally "the Compendium"): the public wiki built by WoSB Workbench and served at bandofmisfits.org.
// Releases arrive as verified ZIP parts (see /api/compendium/upload), are unpacked under
// data/compendium/releases/<id>/ and switched on atomically through data/compendium-active.json.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

export const PART_LIMIT = 95_000_000;
export const MAX_PARTS = 400;
export const KEEP_RELEASES = 2;

export function repoRoot() {
  const cwd = process.cwd().replace(/\\/g, "/");
  return cwd.endsWith("/apps/dashboard") ? resolve(process.cwd(), "../..") : process.cwd();
}
const dataDir = () => join(repoRoot(), "data", "compendium");
const activeFile = () => join(repoRoot(), "data", "compendium-active.json");
const tokenFile = () => join(dataDir(), "upload-token.json");

export type ActiveRelease = { release: string; directory: string; activatedAt: string; files: number; bytes: number; meta?: any };

let cache: { at: number; value: ActiveRelease | null } | null = null;
/** The live release, re-read at most every 5 seconds. */
export async function activeRelease(): Promise<ActiveRelease | null> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  let value: ActiveRelease | null = null;
  try {
    value = JSON.parse(await readFile(activeFile(), "utf8"));
    if (value && !(await stat(join(value.directory, "index.html")).catch(() => null))) value = null;
  } catch {
    value = null;
  }
  cache = { at: Date.now(), value };
  return value;
}

/** A file inside the active release, or null for anything outside it. */
export function safeJoin(base: string, parts: string[]) {
  if (parts.some((p) => !p || p === "." || p === ".." || /[\\\0]/.test(p))) return null;
  const full = resolve(base, ...parts);
  return full === resolve(base) || full.startsWith(resolve(base) + sep) ? full : null;
}

export const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream", ".glb": "model/gltf-binary", ".wav": "audio/wav", ".ogg": "audio/ogg", ".woff2": "font/woff2",
};
export const typeFor = (file: string) => TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";

// ---------------------------------------------------------------- upload tokens
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export async function createUploadToken(by: string) {
  const token = "bomc_" + randomBytes(24).toString("base64url");
  await mkdir(dataDir(), { recursive: true });
  await writeFile(tokenFile(), JSON.stringify({ sha256: sha(token), createdBy: by, createdAt: new Date().toISOString() }));
  return token;
}
export async function tokenInfo() {
  try {
    const t = JSON.parse(await readFile(tokenFile(), "utf8"));
    return { createdBy: t.createdBy, createdAt: t.createdAt };
  } catch {
    return null;
  }
}
export async function revokeUploadToken() {
  await rm(tokenFile(), { force: true });
}
/** Accepts the dashboard-created token, or COMPENDIUM_UPLOAD_TOKEN from .env. */
export async function verifyUploadToken(header: string | null) {
  const token = String(header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token.length < 20) return false;
  const want: string[] = [];
  if (process.env.COMPENDIUM_UPLOAD_TOKEN) want.push(sha(process.env.COMPENDIUM_UPLOAD_TOKEN));
  try {
    want.push(JSON.parse(await readFile(tokenFile(), "utf8")).sha256);
  } catch {}
  const got = Buffer.from(sha(token), "hex");
  return want.some((w) => {
    const b = Buffer.from(String(w), "hex");
    return b.length === got.length && timingSafeEqual(b, got);
  });
}

// ---------------------------------------------------------------- staged uploads
type Part = { index: number; size: number; sha256: string };
type Upload = { id: string; release: string; parts: Part[]; completed: number[]; meta: any; startedAt: string };
const uploadsDir = () => join(dataDir(), "uploads");
const uploadFile = (id: string) => join(uploadsDir(), `${id}.json`);
const validId = (v: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v) && v !== "." && v !== "..";
const releaseDir = (release: string) => {
  if (!validId(release)) throw httpError(400, "Invalid release name.");
  const root = resolve(dataDir(), "releases");
  const full = resolve(root, release);
  if (!full.startsWith(root + sep)) throw httpError(400, "Invalid release path.");
  return full;
};
const uploadLocks = new Map<string, Promise<unknown>>();
async function withUploadLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = uploadLocks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.then(() => {}, () => {});
  uploadLocks.set(id, tail);
  try {
    return await next;
  } finally {
    if (uploadLocks.get(id) === tail) uploadLocks.delete(id);
  }
}

export async function beginUpload(body: any): Promise<Upload> {
  const release = String(body?.release ?? "");
  if (!validId(release)) throw httpError(400, "Release names may use letters, numbers, dot, dash and underscore.");
  const parts: Part[] = Array.isArray(body?.parts) ? body.parts : [];
  if (!parts.length || parts.length > MAX_PARTS) throw httpError(400, "The upload needs between 1 and 400 parts.");
  parts.forEach((p, i) => {
    if (p.index !== i || !(p.size > 0 && p.size <= PART_LIMIT) || !/^[a-f0-9]{64}$/.test(String(p.sha256)))
      throw httpError(400, `Part ${i + 1} is not described correctly.`);
  });
  const active = await activeRelease();
  if (active?.release === release) throw httpError(409, "That release is already live. Build again to publish a new one.");
  const id = sha(release + JSON.stringify(parts)).slice(0, 24);
  await mkdir(uploadsDir(), { recursive: true });
  const existing: Upload | null = await readFile(uploadFile(id), "utf8").then(JSON.parse).catch(() => null);
  if (existing) return existing; // resume
  await rm(releaseDir(release), { recursive: true, force: true });
  const upload: Upload = { id, release, parts, completed: [], meta: body?.meta ?? {}, startedAt: new Date().toISOString() };
  await writeFile(uploadFile(id), JSON.stringify(upload));
  return upload;
}

export async function receivePart(id: string, index: number, bytes: Buffer) {
  if (!validId(id)) throw httpError(400, "Unknown upload.");
  if (!Number.isInteger(index) || index < 0) throw httpError(400, "Unknown part.");
  return withUploadLock(id, async () => {
    const upload: Upload | null = await readFile(uploadFile(id), "utf8").then(JSON.parse).catch(() => null);
    if (!upload) throw httpError(404, "Unknown upload. Start again.");
    const part = upload.parts[index];
    if (!part) throw httpError(400, "Unknown part.");
    if (bytes.length !== part.size || sha(bytes) !== part.sha256) throw httpError(422, `Part ${index + 1} arrived damaged; it will be retried.`);
    if (!upload.completed.includes(index)) {
      await extractZip(bytes, releaseDir(upload.release));
      upload.completed.push(index);
      await writeFile(uploadFile(id), JSON.stringify(upload));
    }
    return { completed: upload.completed.length, total: upload.parts.length };
  });
}

export async function finishUpload(id: string) {
  const upload: Upload | null = validId(id) ? await readFile(uploadFile(id), "utf8").then(JSON.parse).catch(() => null) : null;
  if (!upload) throw httpError(404, "Unknown upload.");
  const missing = upload.parts.filter((p) => !upload.completed.includes(p.index)).map((p) => p.index + 1);
  if (missing.length) throw httpError(409, `Parts still missing: ${missing.slice(0, 10).join(", ")}`);
  const dir = releaseDir(upload.release);
  if (!(await stat(join(dir, "index.html")).catch(() => null))) throw httpError(422, "The upload has no index.html; it isn't a Compendium build.");
  const { files, bytes } = await countFiles(dir);
  const value: ActiveRelease = { release: upload.release, directory: dir, activatedAt: new Date().toISOString(), files, bytes, meta: upload.meta };
  const tmp = activeFile() + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 1));
  await rename(tmp, activeFile());
  cache = null;
  await rm(uploadFile(id), { force: true });
  await pruneReleases(upload.release);
  return value;
}

export async function releases() {
  const names = await readdir(join(dataDir(), "releases")).catch(() => [] as string[]);
  const out = [];
  for (const n of names) {
    const s = await stat(join(dataDir(), "releases", n)).catch(() => null);
    if (s?.isDirectory()) out.push({ release: n, modified: s.mtime.toISOString() });
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}
async function pruneReleases(keep: string) {
  const all = await releases();
  for (const r of all.filter((r) => r.release !== keep).slice(KEEP_RELEASES - 1))
    await rm(releaseDir(r.release), { recursive: true, force: true });
}
/** Switch back to an older release that is still on disk. */
export async function activate(release: string) {
  if (!validId(release)) throw httpError(400, "Unknown release.");
  const dir = releaseDir(release);
  if (!(await stat(join(dir, "index.html")).catch(() => null))) throw httpError(404, "That release is no longer on disk.");
  const { files, bytes } = await countFiles(dir);
  await writeFile(activeFile(), JSON.stringify({ release, directory: dir, activatedAt: new Date().toISOString(), files, bytes }, null, 1));
  cache = null;
}
async function countFiles(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const c = await countFiles(p);
      files += c.files; bytes += c.bytes;
    } else {
      files++; bytes += (await stat(p)).size;
    }
  }
  return { files, bytes };
}

// ---------------------------------------------------------------- ZIP extraction (stored + deflate, CRC-checked)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export async function extractZip(buf: Buffer, directory: string) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw httpError(422, "Not a ZIP file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const root = resolve(directory);
  for (let n = 0; n < count; n++) {
    if (p < 0 || p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw httpError(422, "Damaged ZIP directory.");
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    if (p + 46 + nlen + elen + clen > buf.length) throw httpError(422, "Truncated ZIP directory entry.");
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    const target = resolve(root, name);
    if (!target.startsWith(root + sep) || name.includes("\\") || name.startsWith("/")) throw httpError(422, `Unsafe path in ZIP: ${name}`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw httpError(422, `Damaged ZIP entry header: ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start < 0 || start + csize > buf.length) throw httpError(422, `Truncated ZIP entry data: ${name}`);
    const raw = buf.subarray(start, start + csize);
    const body = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: Math.max(1, size) }) : null;
    if (!body || body.length !== size || crc32(body) !== crc) throw httpError(422, `ZIP entry failed its check: ${name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}

// ---------------------------------------------------------------- BOM chrome around every page
export type Chrome = { adClient: string; adSlots: { top: string; bottom: string }; donateUrl: string; loginUrl: string; discordUrl: string };
const escAttr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function adUnit(client: string, slot: string) {
  return client && slot
    ? `<aside class="bomAd" aria-label="Advertisement"><small>Advertisement</small><ins class="adsbygoogle" style="display:block" data-ad-client="${escAttr(client)}" data-ad-slot="${escAttr(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({})</script></aside>`
    : "";
}
export const CHROME_CSS = `.bomBar{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:7px 16px;background:#0b1620;color:#e9eef0;font:14px system-ui,Segoe UI,sans-serif;position:relative;z-index:50}
.bomBar a{color:#e9eef0;text-decoration:none}.bomBar a:hover{color:#f2d390}.bomBrand{display:flex;align-items:center;gap:8px;font-weight:700}.bomBrand img{width:28px;height:28px}.bomBrand small{font-weight:400;color:#9fb3bf;font-size:12px}
.bomBar nav{display:flex;gap:14px;flex-wrap:wrap;flex:1}.bomLogin{border:1px solid #d8bc81;border-radius:6px;padding:4px 10px;color:#f2d390!important}
.bomPage{position:relative}.bomAd{max-width:980px;margin:10px auto;padding:0 12px}.bomAd small{display:block;font:11px system-ui;color:#889}
.bomFooter{margin:0;display:grid;gap:8px;justify-items:center;text-align:center;padding:22px 16px 28px;background:#0b1620;color:#cfd8dc;font:14px system-ui,Segoe UI,sans-serif}
.bomFooter p{margin:0;max-width:640px}.bomDonate{background:#f2c14e;color:#1b1b1b!important;border-radius:999px;padding:8px 18px;font-weight:700;text-decoration:none}.bomFooter small{color:#90a4ae;max-width:720px}`;
/** Adds the BOM bar, AdSense and the donation footer to a Compendium page. `home` is the site root URL path. */
export function decorate(html: string, c: Chrome, home: string, url = "", baseHref = "") {
  const title = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "WoSB Wiki").trim();
  const firstP = /<main[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? "";
  const description = firstP.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 200) || "World of Sea Battle ships, guns, tools and guides from Band of Misfits.";
  const ogImage = (() => {
    try {
      return url ? new URL("/branding/defaults/bom-logo.png", url).toString() : "/branding/defaults/bom-logo.png";
    } catch {
      return "/branding/defaults/bom-logo.png";
    }
  })();
  const og = html.includes('property="og:title"') ? "" :
    `<meta name="description" content="${escAttr(description)}"><meta property="og:site_name" content="WoSB Wiki">` +
    `<meta property="og:title" content="${escAttr(title)}"><meta property="og:description" content="${escAttr(description)}">` +
    `<meta property="og:image" content="${escAttr(ogImage)}">${url ? `<meta property="og:url" content="${escAttr(url)}">` : ""}<meta name="theme-color" content="#1f6f8b">`;
  const head = og + `<link rel="stylesheet" href="${home}compendium-chrome.css">` +
    (c.adClient ? `<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escAttr(c.adClient)}"></script>` : "");
  // No ads on pages kept out of search (thin stubs, 404s): AdSense wants ads only beside real content.
  const ads = !/<meta name="robots" content="noindex/i.test(html);
  const prepLink = home === "/" ? "/prep" : "/wiki/prep";
  const bar = `<header class="bomBar"><a class="bomBrand" href="${home}"><img src="${home}assets/brand/emblem.svg" alt="" width="28" height="28"><span>WoSB Wiki</span><small>by Band of Misfits</small></a>` +
    `<nav aria-label="Band of Misfits"><a href="${home}">Wiki home</a><a href="${home}tools/ship-viewer.html">3D ships</a><a href="${home}category/ships.html">Shipyard</a><a href="${home}map.html">World map</a>` +
    `<a href="${home}tools/battle-simulator.html">Battle simulator</a><a href="${prepLink}">Battle Prep</a>` +
    (c.discordUrl ? `<a href="${escAttr(c.discordUrl)}" target="_blank" rel="noreferrer">Join BOM</a>` : "") +
    `</nav><a class="bomLogin" href="${escAttr(c.loginUrl)}">Member Login</a></header>` + (ads ? adUnit(c.adClient, c.adSlots.top) : "");
  const foot = (ads ? adUnit(c.adClient, c.adSlots.bottom) : "") +
    `<div class="bomFooter" role="contentinfo"><b>Enjoying the wiki?</b><p>It's free and run by Band of Misfits. Donations help keep it online and up to date.</p>` +
    (c.donateUrl ? `<a class="bomDonate" href="${escAttr(c.donateUrl)}" target="_blank" rel="noreferrer noopener">♥ Donate with PayPal</a>` : "") +
    `<small>A fan site by the Band of Misfits guild. Not affiliated with or endorsed by the makers of World of Sea Battle. Game names and images belong to their owners.</small></div>`;
  // Pages built for the stand-alone site (wosbwiki.org) already carry their own ads, donate footer and metadata.
  if (/<body[^>]*data-host="standalone"/i.test(html)) return baseHref ? html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${escAttr(baseHref)}">`) : html;
  let out = html.includes("</head>") ? html.replace("</head>", () => head + "</head>") : head + html;
  // Under /compendium/ Next drops trailing slashes, so pin relative links to the page's own folder.
  if (baseHref) out = out.replace(/<head[^>]*>/i, (m) => `${m}<base href="${escAttr(baseHref)}">`);
  // Full-screen tools (the battle and boarding simulators) keep their own layout: no bar, ads or footer.
  if (!html.includes('id="side"')) return out;
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body[^>]*>/i, (m) => m + bar + '<div class="bomPage">') : bar + '<div class="bomPage">' + out;
  out = out.includes("</body>") ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => "</div>" + foot + "</body>") : out + "</div>" + foot;
  return out;
}

export function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
