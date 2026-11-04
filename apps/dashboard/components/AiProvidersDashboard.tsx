"use client";
import { useMemo, useState } from "react";

type Feature = "banter" | "wiki" | "sentinel";
type Provider = "groq" | "gemini" | "openai" | "none";
type Route = {
  feature: Feature;
  enabled: boolean;
  primary_provider: Provider;
  fallback_provider: Provider;
  groq_model: string;
  gemini_model: string;
  openai_model: string;
  allow_gemini_fallback: boolean;
  allow_private_gemini: boolean;
  daily_limit: number;
  minute_limit: number;
  updated_at?: string;
};
type ProviderState = { configured: boolean; blockedSeconds: number };
type Usage = {
  usage_date: string;
  feature: Feature;
  provider: string;
  requests: number;
  successes: number;
  failures: number;
  estimated_input_tokens: number;
  latency_total_ms: number;
};
type Initial = {
  rateLimiterAvailable?: boolean;
  providers: Record<"groq" | "gemini" | "openai", ProviderState>;
  routes: Route[];
  usage: Usage[];
};
const features: Feature[] = ["banter", "wiki", "sentinel"];
const labels: { [P in Provider]: string } = {
  groq: "Groq",
  gemini: "Google Gemini",
  openai: "OpenAI (optional)",
  none: "Disabled",
};
const providerOptions: Provider[] = ["groq", "gemini", "openai", "none"];
const help: Record<Feature, string> = {
  banter: "Short, sarcastic guild responses. Lowest priority and strict anti-spam limits.",
  wiki: "Grounded ship data, guides, follow-up questions and explanations. Database-first.",
  sentinel: "Guild permissions, logs and administrative analysis. Keep private data protected.",
};
const modelHelp: Record<"groq" | "gemini" | "openai", string> = {
  groq: "Groq model ID (for example openai/gpt-oss-20b)",
  gemini: "Gemini model ID (for example gemini-3.5-flash-lite)",
  openai: "OpenAI model ID (used only if selected)",
};
async function api(path: string, method = "GET", body?: unknown) {
  const result = await fetch(`/api/internal/ai${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await result.text();
  let data: any = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw };
  }
  if (!result.ok) throw new Error(String(data?.error ?? `Request failed (${result.status})`));
  return data;
}
function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (x: boolean) => void;
}) {
  return (
    <label className="aiConfigToggle">
      <span>
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e: any) => onChange(e.target.checked)} />
      <span className={`aiConfigSwitch ${checked ? "enabled" : "disabled"}`}>{checked ? "ON" : "OFF"}</span>
    </label>
  );
}
export default function AiProvidersDashboard({ initial }: { initial: Initial }) {
  const [active, setActive] = useState<Feature>("banter");
  const [routes, setRoutes] = useState<Record<Feature, Route>>(
    () => Object.fromEntries(initial.routes.map((x) => [x.feature, x])) as Record<Feature, Route>,
  );
  const [providers, setProviders] = useState(initial.providers),
    [usage, setUsage] = useState(initial.usage ?? []);
  const [loading, setLoading] = useState(false),
    [testing, setTesting] = useState<Provider | null>(null),
    [notice, setNotice] = useState(""),
    [testResults, setTestResults] = useState<Record<string, string>>({});
  const current = routes[active];
  function change<K extends keyof Route>(key: K, value: Route[K]) {
    setRoutes((r) => ({ ...r, [active]: { ...r[active], [key]: value } }));
  }
  async function reload() {
    setLoading(true);
    setNotice("");
    try {
      const status: Initial = await api("/settings");
      setProviders(status.providers);
      setUsage(status.usage ?? []);
      setRoutes(Object.fromEntries(status.routes.map((x) => [x.feature, x])) as Record<Feature, Route>);
      setNotice("Provider status refreshed.");
    } catch (e: any) {
      setNotice(String(e.message));
    } finally {
      setLoading(false);
    }
  }
  async function save() {
    setLoading(true);
    setNotice("");
    try {
      const { feature, updated_at, ...editable } = routes[active];
      const output = await api(`/settings/${active}`, "PUT", editable);
      setRoutes((r) => ({ ...r, [active]: output.route }));
      setNotice(
        `${active[0].toUpperCase() + active.slice(1)} routing saved. Changes take effect within 10 seconds.`,
      );
    } catch (e: any) {
      setNotice(`Could not save: ${String(e.message)}`);
    } finally {
      setLoading(false);
    }
  }
  async function testProvider(p: Provider) {
    if (p === "none") return;
    setTesting(p);
    setTestResults((x) => ({ ...x, [p]: "" }));
    try {
      const result = await api("/test", "POST", { feature: active, provider: p });
      setTestResults((x) => ({ ...x, [p]: `Connected · ${result.model} · ${result.reply}` }));
    } catch (e: any) {
      setTestResults((x) => ({ ...x, [p]: `Unavailable: ${String(e.message)}` }));
    } finally {
      setTesting(null);
    }
  }
  const totals = useMemo(() => {
    return Object.fromEntries(
      features.map((f) => {
        const items = usage.filter((u) => u.feature === f);
        return [
          f,
          {
            requests: items.reduce((a, u) => a + Number(u.requests), 0),
            success: items.reduce((a, u) => a + Number(u.successes), 0),
          },
        ];
      }),
    ) as Record<Feature, { requests: number; success: number }>;
  }, [usage]);
  return (
    <main className="aiConfigPage">
      <header className="experienceHero aiConfigHero">
        <div>
          <span className="eyebrow">ADMINISTRATION · AI SERVICES</span>
          <h1>AI Providers</h1>
          <p>
            Choose a primary AI and a backup independently for Banter, Wiki and Sentinel. API keys stay on the
            server; prompts are never saved to usage logs.
          </p>
        </div>
        <button type="button" className="outlineButton" onClick={() => void reload()} disabled={loading}>
          ↻ Refresh status
        </button>
      </header>
      <section className="aiConfigProviders">
        {(["groq", "gemini", "openai"] as const).map((p) => (
          <article className="panel aiConfigProvider" key={p}>
            <div className="aiConfigProviderHead">
              <strong>{labels[p]}</strong>
              <span className={`aiConfigStatus ${providers[p]?.configured ? "ready" : "missing"}`}>
                {providers[p]?.configured ? "Key configured" : "Not configured"}
              </span>
            </div>
            <p>
              {p === "groq"
                ? "Primary provider · fast inference"
                : p === "gemini"
                  ? "Backup provider · explicit private-data controls"
                  : "Optional provider · not automatically enabled"}
            </p>
            <small>
              {providers[p]?.blockedSeconds
                ? `Cooling down for ${providers[p].blockedSeconds}s`
                : "No active provider cooldown reported"}
            </small>
            <button
              type="button"
              onClick={() => void testProvider(p)}
              disabled={testing !== null || !providers[p]?.configured}
            >
              {testing === p ? "Testing…" : `Test ${labels[p]}`}
            </button>
            {testResults[p] && (
              <p className="aiConfigResult" role="status">
                {testResults[p]}
              </p>
            )}
          </article>
        ))}
      </section>
      {initial.rateLimiterAvailable === false && (
        <p className="aiConfigNotice" role="alert">
          AI requests require a Redis connection for safe shared rate limits. Check REDIS_URL on Novonode.
        </p>
      )}
      {notice && (
        <p className="aiConfigNotice" role="status">
          {notice}
        </p>
      )}
      <div className="aiConfigGrid">
        <section className="panel aiConfigMain">
          <div className="aiConfigTabs" role="tablist" aria-label="AI feature configuration">
            {features.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={active === f}
                className={active === f ? "selected" : ""}
                onClick={() => setActive(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <h2>{active[0].toUpperCase() + active.slice(1)} routing</h2>
          <p className="aiConfigMuted">{help[active]}</p>
          {!current ? (
            <p>AI route is not available yet. Run migration 031.</p>
          ) : (
            <>
              <Toggle
                label="AI enabled for this system"
                sub="Disables generation for this module without changing the others"
                checked={current.enabled}
                onChange={(v) => change("enabled", v)}
              />
              <div className="aiConfigFields">
                <label>
                  Primary provider
                  <select
                    value={current.primary_provider}
                    onChange={(e: any) => change("primary_provider", e.target.value as Provider)}
                  >
                    {providerOptions.map((p) => (
                      <option key={p} value={p}>
                        {labels[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fallback provider
                  <select
                    value={current.fallback_provider}
                    onChange={(e: any) => change("fallback_provider", e.target.value as Provider)}
                  >
                    {providerOptions.map((p) => (
                      <option key={p} value={p}>
                        {labels[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Daily request budget
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={current.daily_limit}
                    onChange={(e: any) => change("daily_limit", Number(e.target.value))}
                  />
                </label>
                <label>
                  Requests per minute
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={current.minute_limit}
                    onChange={(e: any) => change("minute_limit", Number(e.target.value))}
                  />
                </label>
                {(["groq", "gemini", "openai"] as const).map((p) => (
                  <label className="aiConfigFull" key={p}>
                    {modelHelp[p]}
                    <input
                      type="text"
                      spellCheck={false}
                      value={current[`${p}_model`]}
                      onChange={(e: any) => change(`${p}_model`, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <Toggle
                label="Allow Gemini as a fallback"
                sub="Must be enabled before content can leave Groq for Gemini"
                checked={current.allow_gemini_fallback}
                onChange={(v) => change("allow_gemini_fallback", v)}
              />
              <Toggle
                label="Allow private content on Gemini"
                sub="Off by default. Only enable if your guild approves the provider's data practices."
                checked={current.allow_private_gemini}
                onChange={(v) => change("allow_private_gemini", v)}
              />
              <div className="aiConfigPrivacy">
                The Gemini free tier may use submitted content to improve Google products. Private
                Sentinel/member data is blocked from Gemini unless both privacy switches are enabled. Changing
                settings does not create API keys or change your billing tier.
              </div>
              <div className="aiConfigActions">
                <button type="button" className="goldButton" disabled={loading} onClick={() => void save()}>
                  {loading ? "Saving…" : "Save routing"}
                </button>
                <small>Provider changes take effect within 10 seconds</small>
              </div>
            </>
          )}
        </section>
        <aside className="panel aiConfigSidebar">
          <span className="cardKicker">LAST 7 DAYS</span>
          <h2>Usage & reliability</h2>
          {features.map((f) => (
            <div className="aiConfigMetric" key={f}>
              <strong>{f[0].toUpperCase() + f.slice(1)}</strong>
              <span>
                {totals[f]?.success ?? 0} successful / {totals[f]?.requests ?? 0} requests
              </span>
            </div>
          ))}
          <h3>Provider attempts</h3>
          <div className="aiConfigUsageList">
            {usage.slice(0, 25).map((u, i) => (
              <div key={`${u.usage_date}-${u.feature}-${u.provider}-${i}`}>
                <b>
                  {u.feature} · {u.provider}
                </b>
                <span>
                  {String(u.usage_date).slice(0, 10)} · {u.successes}/{u.requests} succeeded
                </span>
              </div>
            ))}
            {usage.length === 0 && <p className="uiEmpty">No usage recorded yet.</p>}
          </div>
          <p className="aiConfigMuted">
            Request counts are estimated from gateway traffic. No conversation text is stored in these
            reports.
          </p>
        </aside>
      </div>
    </main>
  );
}
