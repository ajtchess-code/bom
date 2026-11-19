"use client";
// Compendium release controls for dashboard admins: what's live, the Workbench upload token,
// a manual upload of a Workbench "WikiSite" ZIP, and switching back to the previous release.
import { useEffect, useState } from "react";

async function call(body?: any) {
  const r = await fetch("/api/compendium/admin", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
  return j;
}
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function CompendiumAdmin() {
  const [s, setS] = useState<any>(null);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => call().then(setS).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
  }, []);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    try {
      const parts = [] as { index: number; size: number; sha256: string; buf: ArrayBuffer }[];
      for (const [i, f] of [...files].sort((a, b) => a.name.localeCompare(b.name)).entries()) {
        const buf = await f.arrayBuffer();
        parts.push({ index: i, size: buf.byteLength, sha256: await sha256(buf), buf });
      }
      const release = "compendium-" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const post = (b: any) => fetch("/api/compendium/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
      const begun = await post({ action: "begin", release, parts: parts.map(({ buf, ...p }) => p) });
      if (!begun.id) throw new Error(begun.message || "Upload refused");
      for (const p of parts) {
        if (begun.completed?.includes(p.index)) continue;
        setMsg(`Uploading part ${p.index + 1} of ${parts.length} (${mb(p.size)})…`);
        const r = await fetch(`/api/compendium/upload?id=${begun.id}&part=${p.index}`, { method: "PUT", headers: { "content-type": "application/zip" }, body: p.buf });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || `Part ${p.index + 1} failed`);
      }
      const done = await post({ action: "finish", id: begun.id });
      if (!done.ok) throw new Error(done.message || "Activation failed");
      setMsg(`Release ${done.release} is live (${done.files.toLocaleString()} files).`);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }
  const active = s?.active;
  return (
    <section>
      <h3>WoSB Wiki</h3>
      <p>
        The public wiki at bandofmisfits.org is built by WoSB Workbench. In the Workbench, run <b>Build wiki website</b>, then{" "}
        <b>Publish wiki to Band of Misfits</b> with the upload token below.
      </p>
      {active ? (
        <p>
          Live: <b>{active.release}</b> · {active.files?.toLocaleString()} files · {mb(active.bytes || 0)} · since{" "}
          {new Date(active.activatedAt).toLocaleString()}{" "}
          <a href="/compendium/" target="_blank" rel="noreferrer">
            Open
          </a>
        </p>
      ) : (
        <p>The WoSB Wiki isn't installed yet, so visitors still see the old encyclopedia.</p>
      )}
      <h4>Workbench upload token</h4>
      <p>
        {s?.token ? `Created by ${s.token.createdBy} on ${new Date(s.token.createdAt).toLocaleString()}.` : "No token yet."}
        {s?.envToken ? " COMPENDIUM_UPLOAD_TOKEN from .env is also accepted." : ""}
      </p>
      <button type="button" className="whCta" onClick={() => call({ action: "token" }).then((j) => { setToken(j.token); load(); }).catch((e) => setMsg(e.message))}>
        {s?.token ? "Replace upload token" : "Create upload token"}
      </button>{" "}
      {s?.token && (
        <button type="button" onClick={() => call({ action: "revoke" }).then(() => { setToken(""); load(); })}>
          Revoke token
        </button>
      )}
      {token && (
        <p>
          Copy it now; it won't be shown again: <code style={{ userSelect: "all" }}>{token}</code>
        </p>
      )}
      <h4>Upload manually</h4>
      <p>Choose the ZIP part(s) of a built WikiSite folder (one ZIP of the whole folder works when it's under 95 MB).</p>
      <input type="file" accept=".zip" multiple onChange={(e) => upload(e.target.files)} />
      {s?.releases?.length > 1 && (
        <>
          <h4>Earlier releases</h4>
          {s.releases.filter((r: any) => r.release !== active?.release).map((r: any) => (
            <p key={r.release}>
              {r.release}{" "}
              <button type="button" onClick={() => call({ action: "activate", release: r.release }).then(load).catch((e) => setMsg(e.message))}>
                Switch back to this
              </button>
            </p>
          ))}
        </>
      )}
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
