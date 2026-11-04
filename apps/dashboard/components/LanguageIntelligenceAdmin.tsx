"use client";
import { useEffect, useState } from "react";
type Row = {
  id: string;
  scope: "wiki" | "sentinel" | "both";
  language: string;
  phrase: string;
  canonical: string;
};
const names: Record<string, string> = {
  en: "English",
  es: "Spanish",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  ru: "Russian",
  ja: "Japanese",
  pt: "Portuguese",
  fr: "French",
  de: "German",
};
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`/api/internal/wiki/intelligence/lexicon${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...((init.headers as Record<string, string>) ?? {}) },
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j;
}
export default function LanguageIntelligenceAdmin() {
  const [entries, setEntries] = useState<Row[]>([]),
    [language, setLanguage] = useState("en"),
    [scope, setScope] = useState<"both" | "wiki" | "sentinel">("both"),
    [phrase, setPhrase] = useState(""),
    [canonical, setCanonical] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function reload() {
    try {
      const x = await api("");
      setEntries(x.entries ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("", { method: "POST", body: JSON.stringify({ scope, language, phrase, canonical }) });
      setPhrase("");
      setCanonical("");
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await api(`/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel bomLanguageStudio" aria-label="Multilingual Intelligence">
      <div className="panelHead">
        <div>
          <span className="cardKicker">ADMIRALTY · SHARED LANGUAGE ENGINE</span>
          <h3>Language & Terminology</h3>
          <p>
            Add guild slang, localized ship names, nicknames, and common typos. Rules apply to the Wiki,
            Sentinel, or both, without granting extra permissions or creating new facts.
          </p>
        </div>
      </div>
      <form className="bomLanguageForm" onSubmit={save}>
        <label>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(names).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Applies to
          <select value={scope} onChange={(e) => setScope(e.target.value as any)}>
            <option value="both">Wiki + Sentinel</option>
            <option value="wiki">Wiki only</option>
            <option value="sentinel">Sentinel only</option>
          </select>
        </label>
        <label>
          Member says
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="e.g. 산마르틴, hounddawg, yoinkd"
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <label>
          Canonical meaning
          <input
            value={canonical}
            onChange={(e) => setCanonical(e.target.value)}
            placeholder="e.g. San Martin, Hounnddawg, removed"
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <button
          className="goldButton"
          disabled={busy || phrase.trim().length < 2 || canonical.trim().length < 2}
        >
          Save alias
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="bomLanguageTable">
        {entries.map((r) => (
          <div key={r.id}>
            <b>{r.phrase}</b>
            <span>→ {r.canonical}</span>
            <small>
              {names[r.language] ?? r.language} · {r.scope === "both" ? "Both systems" : r.scope}
            </small>
            <button type="button" disabled={busy} onClick={() => void remove(r.id)}>
              Remove
            </button>
          </div>
        ))}
        {!entries.length && (
          <p className="muted">No Admiralty custom aliases yet. Built-in terms are already available.</p>
        )}
      </div>
    </section>
  );
}
