// Pull BOM-Bot's source from GitHub on launch, so a host only needs this one-time upload.
//
// On every start (index.js runs this before scripts/bootstrap.mjs):
//   1. Ask GitHub for the newest commit on BOM_REPO_REF (default main) of BOM_REPO (default ajtchess-code/bom).
//   2. If it differs from the installed commit, stream the source archive, verify it unpacked completely
//      into a staging folder, then copy it over the install. Files the previous sync installed that the
//      new commit no longer has are removed. .env, node_modules, runtime data and anything not from the
//      repository are never touched.
//   3. The replaced files are kept so bootstrap can roll back if the new code fails to build.
// If GitHub can't be reached, the bot starts with what is already installed.
//
// Settings (.env or the host panel):
//   BOM_REPO_SYNC=off          turn it off (e.g. while testing a hand-uploaded build)
//   BOM_REPO=ajtchess-code/bom BOM_REPO_REF=main
//   GITHUB_TOKEN=              optional: higher rate limit, or a private repository
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

const STATE = ".bom-repo-sync.json";
const STAGING = ".repo-sync-staging";
const BACKUP = ".repo-sync-backup";
// Paths a sync never writes or deletes, even if the repository contains them.
const PROTECTED = [/^\.env($|\.(?!example$))/, /^node_modules\//, /^\.git\//, /^data\/(compendium|redis|pb-art|wiki-v2|wiki-releases)(\/|$)/,
  /^data\/[^/]*-active\.json$/, /^build-tmp\//, /^cloudflared$/, /^cloudflare-token/, /^config\/redis/, new RegExp(`^${STAGING}/`), new RegExp(`^${BACKUP}/`), new RegExp(`^${STATE.replace(".", "\\.")}$`)];
const isProtected = (p) => PROTECTED.some((r) => r.test(p));

const log = (...a) => console.log("[repo-sync]", ...a);
const readState = () => { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return null; } };
const writeJson = (file, value) => { writeFileSync(file + ".tmp", JSON.stringify(value)); renameSync(file + ".tmp", file); };

function headers(token) {
  const h = { "user-agent": "BOM-Bot-repo-sync", accept: "application/vnd.github+json" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function latestCommit({ repo, ref, token, timeoutMs = 20000 }) {
  const r = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, { headers: headers(token), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${repo}@${ref}`);
  const j = await r.json();
  if (!/^[0-9a-f]{40}$/.test(j.sha ?? "")) throw new Error("GitHub did not return a commit id");
  return { sha: j.sha, date: j.commit?.committer?.date ?? null, message: String(j.commit?.message ?? "").split("\n")[0] };
}

/** Unpack a .tar.gz stream into `dir`, dropping the archive's top folder. Returns the list of file paths. */
export async function extractTarGz(stream, dir) {
  const files = [];
  let buf = Buffer.alloc(0), longName = null, paxPath = null, ended = false;
  let cur = null; // {path, size, left, chunks}
  const take = (n) => { const out = buf.subarray(0, n); buf = buf.subarray(n); return out; };
  const field = (h, a, b) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
  const finishFile = () => {
    const data = Buffer.concat(cur.chunks);
    if (cur.path) {
      const target = join(dir, cur.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      files.push(cur.path);
    }
    cur = null;
  };
  const clean = (raw) => {
    const parts = raw.replace(/\\/g, "/").split("/").slice(1); // drop "<repo>-<sha>/"
    const rel = parts.join("/");
    if (!rel || rel.endsWith("/")) return null;
    const n = normalize(rel).replace(/\\/g, "/");
    if (n.startsWith("../") || n.startsWith("/") || n.includes("/../")) throw new Error(`Unsafe path in archive: ${raw}`);
    return n;
  };
  for await (const chunk of stream) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (cur) {
        if (cur.left > 0) {
          const n = Math.min(cur.left, buf.length);
          if (!n) break;
          cur.chunks.push(Buffer.from(take(n)));
          cur.left -= n;
        }
        if (cur.left > 0) break;
        const pad = (512 - (cur.size % 512)) % 512;
        if (buf.length < pad) break;
        take(pad);
        if (cur.kind === "file") finishFile();
        else {
          const body = Buffer.concat(cur.chunks).toString("utf8");
          if (cur.kind === "longname") longName = body.replace(/\0.*$/s, "");
          if (cur.kind === "pax") { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body); if (m) paxPath = m[1]; }
          cur = null;
        }
        continue;
      }
      if (buf.length < 512) break;
      const h = take(512);
      if (h.every((b) => b === 0)) { ended = true; continue; }
      const sum = h.reduce((s, b, i) => s + (i >= 148 && i < 156 ? 32 : b), 0);
      if (sum !== parseInt(field(h, 148, 156).trim(), 8)) throw new Error("Archive header checksum mismatch");
      const type = String.fromCharCode(h[156] || 48);
      const size = parseInt(field(h, 124, 136).trim() || "0", 8);
      const prefix = field(h, 345, 500), name = field(h, 0, 100);
      const raw = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name);
      const kind = type === "0" || type === "7" ? "file" : type === "L" ? "longname" : type === "x" ? "pax" : "skip";
      if (kind === "file") { longName = null; paxPath = null; }
      cur = { kind, size, left: size, chunks: [], path: kind === "file" ? clean(raw) : null, mode: parseInt(field(h, 100, 108).trim() || "0", 8) };
      if (type === "5" || type === "g" || kind === "skip") { if (type === "5") { longName = null; paxPath = null; } }
    }
  }
  if (cur) throw new Error("Archive ended in the middle of a file");
  if (!ended && !files.length) throw new Error("Archive was empty");
  return files;
}

/** Run once at launch. Returns {changed, sha} and never throws for network problems. */
export async function syncFromRepo(env = process.env) {
  if (/^(0|off|false|no)$/i.test(env.BOM_REPO_SYNC ?? "on")) { log("disabled (BOM_REPO_SYNC=off)"); return { changed: false, skipped: true }; }
  const repo = env.BOM_REPO || "ajtchess-code/bom", ref = env.BOM_REPO_REF || "main", token = env.GITHUB_TOKEN || env.BOM_REPO_TOKEN || "";
  const state = readState();
  let head;
  try { head = await latestCommit({ repo, ref, token }); }
  catch (e) { log(`could not reach GitHub (${e.message}); starting the installed version ${state?.sha?.slice(0, 7) ?? "(unknown)"}`); return { changed: false, offline: true }; }
  if (state?.sha === head.sha && !env.BOM_REPO_FORCE) { log(`up to date with ${repo}@${ref} ${head.sha.slice(0, 7)}`); return { changed: false, sha: head.sha }; }
  if (state?.rejected === head.sha && !env.BOM_REPO_FORCE) { log(`commit ${head.sha.slice(0, 7)} failed to build last time; keeping ${state.sha?.slice(0, 7) ?? "the installed version"} until a newer commit is pushed (BOM_REPO_FORCE=1 to retry)`); return { changed: false, sha: state.sha }; }
  log(`updating ${state?.sha?.slice(0, 7) ?? "first sync"} → ${head.sha.slice(0, 7)} “${head.message}”`);
  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(STAGING, { recursive: true });
  let files;
  try {
    const r = await fetch(`https://codeload.github.com/${repo}/tar.gz/${head.sha}`, { headers: headers(token), signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
    files = (await extractTarGz(Readable.fromWeb(r.body).pipe(createGunzip()), STAGING)).filter((f) => !isProtected(f));
    if (!files.includes("package.json") || !files.includes("scripts/bootstrap.mjs")) throw new Error("download is missing package.json or scripts/bootstrap.mjs");
  } catch (e) {
    rmSync(STAGING, { recursive: true, force: true });
    log(`update failed before anything changed (${e.message}); starting the installed version`);
    return { changed: false, error: e.message };
  }
  // Back up what will be replaced or removed, then apply.
  const backup = join(BACKUP, state?.sha ?? "pre-sync");
  rmSync(BACKUP, { recursive: true, force: true });
  mkdirSync(backup, { recursive: true });
  const keep = new Set(files);
  const removed = (state?.files ?? []).filter((f) => !keep.has(f) && !isProtected(f) && existsSync(f));
  const created = [];
  for (const f of [...files, ...removed]) {
    if (existsSync(f)) { mkdirSync(dirname(join(backup, f)), { recursive: true }); copyFileSync(f, join(backup, f)); }
    else created.push(f);
  }
  for (const f of files) { mkdirSync(dirname(f) || ".", { recursive: true }); cpSync(join(STAGING, f), f); }
  for (const f of removed) rmSync(f, { force: true });
  rmSync(STAGING, { recursive: true, force: true });
  writeJson(join(BACKUP, "pending.json"), { from: state?.sha ?? null, to: head.sha, backup, created, removed, at: new Date().toISOString(), previous: state });
  writeJson(STATE, { repo, ref, sha: head.sha, message: head.message, date: head.date, syncedAt: new Date().toISOString(), files });
  log(`installed ${files.length} files from ${head.sha.slice(0, 7)} (${removed.length} removed)`);
  return { changed: true, sha: head.sha };
}

/** Bootstrap calls this after a successful build: the backup is no longer needed. */
export function confirmSync() {
  if (existsSync(join(BACKUP, "pending.json"))) { rmSync(BACKUP, { recursive: true, force: true }); log("new version built; backup cleared"); }
}

/** Bootstrap calls this when the freshly synced code failed to build: put the previous files back. */
export function rollbackSync() {
  let p;
  try { p = JSON.parse(readFileSync(join(BACKUP, "pending.json"), "utf8")); } catch { return false; }
  for (const f of p.created ?? []) rmSync(f, { force: true });
  const restore = (base, rel = "") => {
    const here = join(base, rel);
    for (const name of (statSync(here).isDirectory() ? readdirNames(here) : [])) {
      const r = rel ? `${rel}/${name}` : name, src = join(base, r);
      if (statSync(src).isDirectory()) restore(base, r);
      else { mkdirSync(dirname(r) || ".", { recursive: true }); copyFileSync(src, r); }
    }
  };
  if (existsSync(p.backup)) restore(p.backup);
  writeJson(STATE, { ...(p.previous ?? {}), sha: p.previous?.sha ?? null, files: p.previous?.files ?? [], rejected: p.to, rejectedAt: new Date().toISOString() });
  rmSync(BACKUP, { recursive: true, force: true });
  log(`rolled back to ${p.from?.slice(0, 7) ?? "the uploaded version"}; commit ${p.to.slice(0, 7)} is skipped until a newer one is pushed`);
  return true;
}
const readdirNames = (d) => readdirSync(d);
export const _internal = { isProtected };
