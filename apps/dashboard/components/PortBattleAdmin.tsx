"use client";
import { useMemo, useState } from "react";
import { emitToast } from "@/lib/dashboardQoL";
type Props = { initial: any; catalogue: any };
async function saveApi(body: any) {
  const r = await fetch("/api/internal/wosb/pb-config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { error: t };
  }
  if (!r.ok) throw new Error(j.message ?? j.error ?? `Request failed (${r.status})`);
  return j;
}
function rateLabel(n: number) {
  return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} Rate`;
}
export default function PortBattleAdmin({ initial, catalogue }: Props) {
  const [dutyEmojis, setDutyEmojis] = useState<any>(initial.dutyEmojis ?? {});
  const [catalog, setCatalog] = useState<any>(() => structuredClone(initial.preferredShipCatalog ?? {})),
    [defaults, setDefaults] = useState<any>(() => structuredClone(initial.defaultShipTargets ?? {})),
    [guilds, setGuilds] = useState<any[]>(() => structuredClone(initial.guilds ?? [])),
    [rate, setRate] = useState(1),
    [portName, setPortName] = useState(initial.ports?.[0]?.name ?? ""),
    [saving, setSaving] = useState(false),
    [gameTimeOffsetMinutes, setGameTimeOffsetMinutes] = useState(Number(initial.gameTimeOffsetMinutes ?? 60));
  const ships = useMemo(
    () =>
      (catalogue.ships ?? [])
        .filter((s: any) => Number(s.rate ?? s.level) === rate)
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [catalogue, rate],
  );
  const port = initial.ports?.find((p: any) => p.name === portName),
    targetShips = (catalogue.ships ?? [])
      .filter((s: any) => Number(s.rate ?? s.level) === Number(port?.rate))
      .map((s: any) => s.name)
      .sort();
  const selected = new Set<string>(catalog[String(rate)] ?? []),
    targets = defaults[portName] ?? {};
  async function save() {
    setSaving(true);
    try {
      await saveApi({
        preferredShipCatalog: catalog,
        defaultShipTargets: defaults,
        guilds: guilds.map((g) => ({
          ...g,
          memberIds:
            g.memberIdsText === undefined ? g.memberIds : g.memberIdsText.split(/[,\s]+/).filter(Boolean),
          managerIds:
            g.managerIdsText === undefined ? g.managerIds : g.managerIdsText.split(/[,\s]+/).filter(Boolean),
        })),
        gameTimeOffsetMinutes,
        dutyEmojis,
      });
      emitToast("Port Battle configuration saved.", { tone: "success" });
    } catch (e: any) {
      emitToast(e.message, { tone: "error", duration: 8000 });
    } finally {
      setSaving(false);
    }
  }
  function toggleShip(name: string) {
    setCatalog((old: any) => {
      const set = new Set<string>(old[String(rate)] ?? []);
      set.has(name) ? set.delete(name) : set.add(name);
      return { ...old, [String(rate)]: [...set].sort() };
    });
  }
  function target(name: string, delta: number) {
    setDefaults((old: any) => {
      const p = { ...(old[portName] ?? {}) },
        next = Math.max(0, Math.min(Number(port?.size ?? 40), Number(p[name] ?? 0) + delta));
      if (next) p[name] = next;
      else delete p[name];
      return { ...old, [portName]: p };
    });
  }
  function updateGuild(i: number, key: string, value: any) {
    setGuilds((rows) => rows.map((g, n) => (n === i ? { ...g, [key]: value } : g)));
  }
  return (
    <div className="adminExperience pbAdminV41">
      <header className="top pageHeading">
        <div>
          <span className="eyebrow">PORT BATTLE ADMINISTRATION</span>
          <h2>Fleet Configuration</h2>
          <p>
            Control the ships players can select, per-port default ship targets, and the guild catalogue used
            by the scheduler.
          </p>
        </div>
        <button className="goldButton" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </header>
      <section className="panel">
        <div className="panelHead">
          <div>
            <span className="cardKicker">PREFERRED SHIPS</span>
            <h3>Available Player Fleet</h3>
            <p>
              Only these ships appear in Preferred Ships and detailed Port Battle signups. All 73 known ships
              are available by rate. Battle signups still use the rate assigned to that port.
            </p>
          </div>
        </div>
        <div className="buildTabs">
          {[1, 2, 3, 4, 5, 6, 7].map((r) => (
            <button type="button" className={rate === r ? "active" : ""} key={r} onClick={() => setRate(r)}>
              {rateLabel(r)}
            </button>
          ))}
        </div>
        <div className="pbAdminShipGrid">
          {ships.map((ship: any) => (
            <label key={ship.name} className={selected.has(ship.name) ? "selected" : ""}>
              <input
                type="checkbox"
                checked={selected.has(ship.name)}
                onChange={() => toggleShip(ship.name)}
              />
              {ship.image && <img src={ship.image} alt="" />}
              <span>
                <b>{ship.name}</b>
                <small>{ship.class ?? ship.type ?? rateLabel(rate)}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panelHead">
          <div>
            <span className="cardKicker">DEFAULT DOCTRINE</span>
            <h3>Per-Port Ship Targets</h3>
            <p>
              Targets prefill when a battle is scheduled. They are planning guidance only; officers may always
              place a captain beyond a target or on an untargeted ship.
            </p>
          </div>
          <select value={portName} onChange={(e) => setPortName(e.target.value)}>
            {initial.ports?.map((p: any) => (
              <option key={p.name} value={p.name}>
                {p.name} · {rateLabel(p.rate)} · {p.size}v{p.size}
              </option>
            ))}
          </select>
        </div>
        {port && (
          <div className="pbTargetGrid pbAdminTargets">
            {targetShips.map((name: string) => (
              <label key={name}>
                <span>{name}</span>
                <span className="pbTargetStepper">
                  <button type="button" onClick={() => target(name, -1)}>
                    −1
                  </button>
                  <output>{targets[name] ?? 0}</output>
                  <button type="button" onClick={() => target(name, 1)}>
                    +1
                  </button>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panelHead">
          <div>
            <span className="cardKicker">BATTLE CLOCK</span>
            <h3>In-Game Time Conversion</h3>
            <p>
              Officers choose the hour exactly as it appears in World of Sea Battle. BOM converts that
              displayed hour into the real timestamp used by Discord.
            </p>
          </div>
        </div>
        <label className="pbGameTimeOffset">
          Actual local battle time is{" "}
          <input
            type="number"
            min={-180}
            max={180}
            step={15}
            value={gameTimeOffsetMinutes}
            onChange={(e) => setGameTimeOffsetMinutes(Number(e.target.value) || 0)}
          />{" "}
          minutes after the in-game displayed hour.
          <small>
            The current default is 60 minutes, matching the observed mapping where an in-game 22 corresponds
            to 23:00 local. Change this only if the game clock behavior changes.
          </small>
        </label>
      </section>
      <section className="panel">
        <div className="panelHead">
          <div>
            <span className="cardKicker">SCHEDULER</span>
            <h3>Guild Catalogue</h3>
            <p>
              These choices populate the Attacker and Defender dropdowns. BOM, FAT and DPS also remain
              one-click choices in the scheduler.
            </p>
          </div>
          <button
            className="outlineButton"
            onClick={() => setGuilds((x) => [...x, { tag: "", name: "", faction: "" }])}
          >
            Add Guild
          </button>
        </div>
        <div className="pbGuildAdminRows">
          <div className="pbGuildAdminHead">
            <span>Tag</span>
            <span>Name</span>
            <span>Faction / Flotilla</span>
            <span>Ally / Remove</span>
          </div>
          {guilds.map((g: any, i: number) => (
            <div key={i}>
              <input
                value={g.tag ?? ""}
                onChange={(e) => updateGuild(i, "tag", e.target.value)}
                placeholder="TAG"
              />
              <input
                value={g.name ?? ""}
                onChange={(e) => updateGuild(i, "name", e.target.value)}
                placeholder="Guild name"
              />
              <input
                value={g.faction ?? ""}
                onChange={(e) => updateGuild(i, "faction", e.target.value)}
                placeholder="Pirates / Antilia / …"
              />
              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={Boolean(g.allied)}
                  onChange={(e) => updateGuild(i, "allied", e.target.checked)}
                />
                Ally
              </label>
              <div className="pbGuildBrandFields">
                <label>
                  Logo URL
                  <input
                    value={g.logoUrl ?? ""}
                    placeholder="BOM logo placeholder until configured"
                    onChange={(e) => updateGuild(i, "logoUrl", e.target.value)}
                  />
                </label>
                <label>
                  Guild emoji
                  <input
                    value={g.emoji ?? ""}
                    placeholder="<:guild_name:emoji_id> or Unicode"
                    onChange={(e) => updateGuild(i, "emoji", e.target.value)}
                  />
                </label>
                {g.allied && (
                  <>
                    <label>
                      Member Discord IDs
                      <textarea
                        aria-label="Member Discord IDs"
                        value={g.memberIdsText ?? (g.memberIds ?? []).join(", ")}
                        onChange={(e) => updateGuild(i, "memberIdsText", e.target.value)}
                      />
                    </label>
                    <label>
                      Manager Discord IDs
                      <textarea
                        aria-label="Manager Discord IDs"
                        value={g.managerIdsText ?? (g.managerIds ?? []).join(", ")}
                        onChange={(e) => updateGuild(i, "managerIdsText", e.target.value)}
                      />
                    </label>
                    <small>
                      These users receive only Port Battle access. Allied managers can manage battles they
                      create for this guild. Removing an ID revokes this grant.
                    </small>
                  </>
                )}
              </div>
              <button
                aria-label={`Remove ${g.tag || "guild"}`}
                onClick={() => setGuilds((x) => x.filter((_, n) => n !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>Horn &amp; Flare Emojis</h3>
        <p>
          The bot creates these custom emojis on startup when it has permission to manage expressions. You can
          override them here with existing Discord custom emojis.
        </p>
        <div className="pbDutyEmojiSettings">
          {["horn", "red-flare", "gold-flare", "blue-flare"].map((key) => (
            <label key={key}>
              <img src={`/wosb/pb/duties/${key}.png`} alt="" width="32" height="32" />
              {key.replaceAll("-", " ")}
              <input
                value={dutyEmojis[key] ?? ""}
                onChange={(e) => setDutyEmojis((old: any) => ({ ...old, [key]: e.target.value }))}
                placeholder="<:name:emoji_id>"
              />
            </label>
          ))}
        </div>
      </section>
      <div className="uiSaveBar">
        <span>
          <b>Fleet Configuration</b>
          <small>Changes affect future scheduler choices and Preferred Ships immediately after save.</small>
        </span>
        <button className="goldButton" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}
