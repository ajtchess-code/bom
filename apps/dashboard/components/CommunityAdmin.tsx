"use client";
import { useEffect, useState } from "react";
import DiscordOptionsSelect from "./DiscordOptionsSelect";
import SettingToggle from "./SettingToggle";
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch("/api/internal/community/" + path, {
    ...init,
    headers: { "content-type": "application/json" },
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Request failed");
  return b;
}
export default function CommunityAdmin({ discord, onRefresh }: { discord: any; onRefresh: () => void }) {
  const [s, setS] = useState<any>(null),
    [queue, setQueue] = useState<any[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [settings, corrections] = await Promise.all([api("settings"), api("corrections")]);
    setS(settings);
    setQueue(corrections);
  }
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
  }, []);
  async function save() {
    setBusy(true);
    try {
      const {
        revision,
        ask_enabled,
        ask_channel_id,
        assistance_role_id,
        no_role_id,
        correction_role_id,
        rules_channel_id,
        rules,
        trade_rules,
      } = s;
      await api("settings", {
        method: "PUT",
        body: JSON.stringify({
          revision,
          ask_enabled,
          ask_channel_id,
          assistance_role_id,
          no_role_id,
          correction_role_id,
          rules_channel_id,
          rules,
          trade_rules,
        }),
      });
      await load();
      setNotice("Saved. Rules update in Discord within 30 seconds.");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (key: string, label: string, options: any[]) => (
    <label key={key}>
      {label}
      <DiscordOptionsSelect
        onRefresh={onRefresh}
        value={s[key] ?? ""}
        onChange={(e: any) => setS({ ...s, [key]: e.target.value || null })}
      >
        {<option value="">Not Configured</option>}
        {options.map((x: any) => (
          <option value={x.id} key={x.id}>
            {x.name}
          </option>
        ))}
      </DiscordOptionsSelect>
    </label>
  );
  return (
    <section className="membershipPanel communityAdmin">
      <header>
        <h2>Ask & Numbered Rules</h2>
        <p>
          Answers use published Wiki data, live fleet records, and documented bot features. AI answers use the
          Wiki route in Administration → AI Providers. Configure Groq or another enabled provider there.
        </p>
      </header>
      {notice && <p role="status">{notice}</p>}
      {s && (
        <>
          <SettingToggle
            checked={s.ask_enabled}
            onChange={(value: any) =>
              setS({ ...s, ask_enabled: typeof value === "boolean" ? value : value.target.checked })
            }
            label="Enable #ask"
          />
          <div className="formGrid">
            {field("ask_channel_id", "Ask Channel", discord.textChannels ?? [])}
            {field("assistance_role_id", "Assistance Role", discord.roles ?? [])}
            {field("no_role_id", "No Role · Correction Trigger", discord.roles ?? [])}
            {field("correction_role_id", "Trusted Correction Role", discord.roles ?? [])}
            {field("rules_channel_id", "Server Rules Channel", discord.textChannels ?? [])}
          </div>
          {[
            ["rules", "Server Rules"],
            ["trade_rules", "Trade Rules"],
          ].map(([key, label]) => (
            <fieldset key={key}>
              <legend>{label}</legend>
              <p>
                One rule per row. Numbering is automatic.
                {key === "trade_rules"
                  ? " Sent by DM after a member requests Trade access."
                  : " Published in your configured rules channel."}
              </p>
              {s[key].map((text: string, i: number) => (
                <div className="communityRuleRow" key={i}>
                  <b>{i + 1}.</b>
                  <textarea
                    value={text}
                    maxLength={900}
                    rows={2}
                    onChange={(e) =>
                      setS({
                        ...s,
                        [key]: s[key].map((v: string, n: number) => (n === i ? e.target.value : v)),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove Rule ${i + 1}`}
                    onClick={() => setS({ ...s, [key]: s[key].filter((_: any, n: number) => n !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="outlineButton"
                disabled={s[key].length >= 40}
                onClick={() => setS({ ...s, [key]: [...s[key], ""] })}
              >
                Add Rule
              </button>
            </fieldset>
          ))}
          <button type="button" disabled={busy} className="goldButton" onClick={() => void save()}>
            Save Ask & Rules
          </button>
          <h3>Correction Reviews</h3>
          <p>
            Reply to an answer and mention the No role with the correct information. Members submit proposals;
            trusted correctors and server managers can apply revisions.
          </p>
          {queue.map((c) => (
            <article className="communityCorrection" key={c.id}>
              <b>
                {c.source_id} · {c.status}
              </b>
              <details>
                <summary>Previous Source</summary>
                <pre>{c.old_content}</pre>
              </details>
              <p>{c.new_content}</p>
              {c.status === "PENDING" && (
                <div className="buttonRow">
                  {[true, false].map((approve) => (
                    <button
                      key={String(approve)}
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(`corrections/${c.id}/decision`, {
                            method: "POST",
                            body: JSON.stringify({ approve }),
                          });
                          await load();
                        } catch (e: any) {
                          setNotice(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {approve ? "Approve Correction" : "Decline"}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
