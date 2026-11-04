"use client";
import { useCallback, useEffect, useState } from "react";
import ProgressionTools from "./clash/ProgressionTools";
import ArsenalTools from "./clash/ArsenalTools";
import OfficerTools from "./clash/OfficerTools";
import CoachingTools from "./clash/CoachingTools";
import s from "./clash-tools.module.css";
export const tools = [
  ["Village import", "Progression", false],
  ["Builder timeline", "Progression", false],
  ["Upgrade advisor", "Progression", false],
  ["Magic items", "Progression", false],
  ["Equipment & ore", "Progression", false],
  ["Army library", "Arsenal", false],
  ["Base library", "Arsenal", false],
  ["Attack planner", "Arsenal", false],
  ["Spell calculator", "Arsenal", false],
  ["Attack reviews", "Coaching", false],
  ["Practice board", "Coaching", false],
  ["War readiness", "Coaching", false],
  ["War performance", "Clan tools", false],
  ["CWL lineup", "Clan tools", true],
  ["CWL scenarios", "Clan tools", false],
  ["Clan health", "Clan tools", true],
  ["Recruit comparison", "Clan tools", true],
  ["Clan transfers", "Clan tools", true],
  ["Clan Games", "Clan tools", false],
  ["Capital priorities", "Clan tools", false],
  ["Season reports", "Clan tools", true],
  ["Recognition", "Clan tools", false],
] as const;
export type ToolContext = {
  state: any;
  busy: boolean;
  act: (path: string, body?: any, method?: string) => Promise<any>;
  refresh: () => Promise<void>;
  message: (s: string) => void;
};
export async function toolRequest(path: string, body?: any, method?: string) {
  const r = await fetch("/api/internal/games/clash/tools" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message ?? data.error ?? "Clash tool request failed");
  return data;
}
export default function ClashTools() {
  const [state, setState] = useState<any>(null),
    [tool, setTool] = useState("Village import"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setState(await toolRequest("/state"));
    } catch (e: any) {
      setNotice(e.message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function act(path: string, body?: any, method?: string) {
    setBusy(true);
    setNotice("");
    try {
      const d = await toolRequest(path, body, method);
      await refresh();
      setNotice("Saved.");
      return d;
    } catch (e: any) {
      setNotice(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const ctx = { state, busy, act, refresh, message: setNotice };
  if (!state)
    return (
      <section className={s.panel}>
        <h2>Clash workshop</h2>
        <p role="status">{notice || "Loading tools and pinned game data…"}</p>
        <button onClick={() => void refresh()}>Retry</button>
      </section>
    );
  return (
    <section className={s.workshop}>
      <header className={s.intro}>
        <span className={s.tag}>BOM Clash workshop</span>
        <h2>Plan. Practice. Improve.</h2>
        <p>Village progression, attack preparation and a clearer view of your clan.</p>
      </header>
      <div className={s.toolbar}>
        <label>
          Clash tool
          <select
            aria-label="Clash tool"
            value={tool}
            onChange={(e) => {
              setTool(e.target.value);
              setNotice("");
            }}
          >
            {["Progression", "Arsenal", "Coaching", "Clan tools"].map((group) => (
              <optgroup key={group} label={group}>
                {tools
                  .filter(([, g, manager]) => g === group && (!manager || state.manager))
                  .map(([name]) => (
                    <option key={name}>{name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => void refresh()}>
          Refresh tools
        </button>
      </div>
      {notice && (
        <p className={s.notice} role="status">
          {notice}
        </p>
      )}
      {["Village import", "Builder timeline", "Upgrade advisor", "Magic items", "Equipment & ore"].includes(
        tool,
      ) && <ProgressionTools key={tool} tool={tool} ctx={ctx} />}
      {["Army library", "Base library", "Attack planner", "Spell calculator"].includes(tool) && (
        <ArsenalTools key={tool} tool={tool} ctx={ctx} />
      )}
      {["Attack reviews", "Practice board", "War readiness"].includes(tool) && (
        <CoachingTools key={tool} tool={tool} ctx={ctx} />
      )}
      {[
        "War performance",
        "CWL lineup",
        "CWL scenarios",
        "Clan health",
        "Recruit comparison",
        "Clan transfers",
        "Clan Games",
        "Capital priorities",
        "Season reports",
        "Recognition",
      ].includes(tool) && <OfficerTools key={tool} tool={tool} ctx={ctx} />}
      <footer className={s.details}>
        Catalog {state.catalog.source.packageVersion} · source snapshot {state.catalog.source.retrieved} ·{" "}
        {state.catalog.items.length} entries. Imported timers are snapshots; plans and declarations are
        manual.{" "}
        <a href="https://github.com/chiefpansancolt/clash-of-clans-data" target="_blank" rel="noreferrer">
          Game-data source
        </a>{" "}
        ·{" "}
        <a href="https://github.com/LukasMFR/clash-potion-calculator" target="_blank" rel="noreferrer">
          Potion calculation source
        </a>
      </footer>
    </section>
  );
}
