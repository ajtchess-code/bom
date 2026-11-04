"use client";
import ScheduleMessagePreview from "../DiscordPayloadPreview";
import SavedViewControl from "../SavedViewControl";
import BattleCoordination from "../BattleCoordination";
import BattleHourButtons from "../BattleHourButtons";
import CancelPortBattle from "../CancelPortBattle";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PortBattleInvitations from "../PortBattleInvitations";
import TerritoryMap from "../TerritoryMap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { emitInspector, emitRecent, emitToast, usePersistedState } from "@/lib/dashboardQoL";
import { rateLabel } from "./helpers";

export function DetailedSignup({
  battle,
  ships,
  current,
  profile,
  onClose,
  onSave,
}: {
  battle: any;
  ships: string[];
  current: any;
  profile: any;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const saved = profile?.rates?.[String(battle.rate)] ?? {};
  const [picked, setPicked] = useState<string[]>(current?.ships ?? saved.ships ?? []);
  const [preferred, setPreferred] = useState<string[]>(current?.preferred_ships ?? saved.preferred ?? []);
  const [horn, setHorn] = useState<boolean>(current?.horn_capable ?? profile?.horn_capable ?? false);
  const [hornPreferred, setHornPreferred] = useState<boolean>(
    current?.horn_preferred ?? profile?.horn_preferred ?? false,
  );
  const [flareCaps, setFlareCaps] = useState<string[]>(
    Array.isArray(current?.flare_capabilities) ? current.flare_capabilities : [],
  );
  const [status, setStatus] = useState(current?.signup_status ?? "ATTENDING");
  const [late, setLate] = useState(Number(current?.late_minutes ?? 0));
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            ships: picked,
            preferredShips: preferred,
            hornCapable: horn,
            hornPreferred: horn ? hornPreferred : false,
            flareCapabilities: flareCaps,
            status,
            lateMinutes: status === "LATE" ? late : 0,
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">DETAILED SIGNUP</span>
            <h2>Battle of {battle.port_name}</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ATTENDING">Attending</option>
            <option value="LATE">Running Late</option>
            <option value="WAITLIST">Waitlist</option>
          </select>
        </label>
        {status === "LATE" && (
          <label>
            Minutes Late
            <input
              type="number"
              min={5}
              max={60}
              value={late || 5}
              onChange={(e) => setLate(Number(e.target.value))}
            />
          </label>
        )}
        <fieldset>
          <legend>Select All Ships You Can Play</legend>
          <div className="pbShipChecklist">
            {ships.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={picked.includes(s)}
                  onChange={() => {
                    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
                    setPreferred((p) => p.filter((x) => x !== s));
                  }}
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred Ships · Up To Two</legend>
          <div className="pbShipChecklist">
            {picked.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={preferred.includes(s)}
                  onChange={() =>
                    setPreferred((p) =>
                      p.includes(s) ? p.filter((x) => x !== s) : p.length < 2 ? [...p, s] : p,
                    )
                  }
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="pbHornRequirements compact">
          <label className="checkLine">
            <input
              type="checkbox"
              checked={horn}
              onChange={(e) => {
                setHorn(e.target.checked);
                if (!e.target.checked) setHornPreferred(false);
              }}
            />
            <span>
              <b>I Am Willing To / Can Play Horn</b>
              <small>
                Horn players use Filling Ration in slot 2 (C), Horn in slot 3 (V), and maintain 300 of each.
                Configure full Horn eligibility in Preferred Ships.
              </small>
            </span>
          </label>
          {horn && (
            <label className="checkLine">
              <input
                type="checkbox"
                checked={hornPreferred}
                onChange={(e) => setHornPreferred(e.target.checked)}
              />
              <span>
                <b>I Generally Prefer Horn Duty</b>
                <small>Leave this off when you can play Horn but would rather fill another duty.</small>
              </span>
            </label>
          )}
        </div>
        <fieldset className="pbFlareSignup">
          <legend>Signal Flare Duties · Volunteer</legend>
          <p>
            Choose every signal flare color you can handle. Admiralty assigns a single flare duty when
            confirming the fleet.
          </p>
          <div className="pbFlareChoices">
            {["Red Flare", "Gold Flare", "Blue Flare"].map((color) => (
              <label key={color}>
                <input
                  type="checkbox"
                  checked={flareCaps.includes(color)}
                  onChange={() =>
                    setFlareCaps((xs) =>
                      xs.includes(color) ? xs.filter((x) => x !== color) : [...xs, color],
                    )
                  }
                />
                <img
                  className="pbDutyIcon"
                  src={`/wosb/pb/duties/${color.toLowerCase().replace(" ", "-")}.png`}
                  alt=""
                />
                {color}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton" disabled={!picked.length}>
            Save Signup
          </button>
        </div>
      </form>
    </div>
  );
}
export function TargetsButton({
  ships,
  current,
  teamSize,
  rate,
  onSave,
}: {
  ships: string[];
  current: any;
  teamSize: number;
  rate: number;
  onSave: (v: any) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [values, setValues] = useState<Record<string, number>>({ ...current }),
    [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const key = `bom:pb-target-templates:${rate}:${teamSize}`;
  useEffect(() => {
    if (!open) return;
    try {
      setTemplates(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setTemplates([]);
    }
  }, [open, key]);
  function saveTemplate() {
    const name = prompt("Template name", `${rateLabel(rate)} ${teamSize}v${teamSize}`)?.trim();
    if (!name) return;
    const next = [{ name, values: { ...values } }, ...templates.filter((x: any) => x.name !== name)].slice(
      0,
      8,
    );
    setTemplates(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  function removeTemplate(name: string) {
    const next = templates.filter((x: any) => x.name !== name);
    setTemplates(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  return (
    <>
      <button
        className="outlineButton"
        onClick={() => {
          setValues({ ...current });
          setError("");
          setOpen(true);
        }}
      >
        Ship Targets
      </button>
      {open &&
        createPortal(
          <div className="modalBackdrop">
            <form
              className="panel pbModal"
              onSubmit={async (e) => {
                e.preventDefault();
                if (saving) return;
                setSaving(true);
                setError("");
                try {
                  await onSave(values);
                  setOpen(false);
                } catch (e: any) {
                  setError(e.message || "Could not save targets.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {error && <p role="alert">{error}</p>}
              <fieldset disabled={saving} className="uiBareFieldset">
                <div className="panelHead">
                  <div>
                    <h2>Ship Targets</h2>
                    <span>
                      Total {Object.values(values).reduce<number>((a, b) => a + Number(b || 0), 0)}/{teamSize}
                    </span>
                  </div>
                  <button type="button" onClick={() => setOpen(false)}>
                    ×
                  </button>
                </div>
                {templates.length > 0 && (
                  <div className="pbTargetTemplates">
                    <span>Saved templates</span>
                    {templates.map((t: any) => (
                      <div key={t.name}>
                        <button type="button" onClick={() => setValues({ ...t.values })}>
                          {t.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${t.name}`}
                          onClick={() => removeTemplate(t.name)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="controlRow pbTargetQuick">
                  <button type="button" className="tinyButton" onClick={saveTemplate}>
                    Save current as template
                  </button>
                  <button type="button" className="tinyButton" onClick={() => setValues({})}>
                    Clear targets
                  </button>
                </div>
                <div className="pbTargetGrid">
                  {ships.map((s) => (
                    <label key={s}>
                      <span>{s}</span>
                      <span className="pbTargetStepper">
                        <button
                          type="button"
                          onClick={() =>
                            setValues((v) => ({
                              ...v,
                              [s]: Math.max(0, Number(v[s] ?? 0) - 1),
                            }))
                          }
                        >
                          −1
                        </button>
                        <output>{values[s] ?? 0}</output>
                        <button
                          type="button"
                          onClick={() =>
                            setValues((v) => ({
                              ...v,
                              [s]: Math.min(teamSize, Number(v[s] ?? 0) + 1),
                            }))
                          }
                        >
                          +1
                        </button>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className="goldButton"
                  disabled={Object.values(values).reduce<number>((a, b) => a + Number(b || 0), 0) > teamSize}
                >
                  Save Targets
                </button>
              </fieldset>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
export function PreferredShipsModal({
  catalogue,
  allowed,
  current,
  onClose,
  onSave,
}: {
  catalogue: any;
  allowed: any;
  current: any;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const ships = catalogue?.ships ?? [],
    rates = [1, 2, 3, 4, 5, 6, 7],
    initial: any = {};
  for (const rate of rates) {
    const old = current?.rates?.[String(rate)] ?? {};
    initial[String(rate)] = {
      ships: [...(old.ships ?? [])],
      preferred: [...(old.preferred ?? [])],
    };
  }
  const [draft, setDraft] = useState<any>({
      rates: initial,
      horn_capable: Boolean(current?.horn_capable),
      horn_preferred: Boolean(current?.horn_preferred),
      horn_requirements_ack: Boolean(current?.horn_requirements_ack),
    }),
    [rate, setRate] = useState(1);
  const options = ships
      .filter(
        (s: any) =>
          Number(s.rate ?? s.level) === rate &&
          (!Array.isArray(allowed?.[String(rate)]) || allowed[String(rate)].includes(s.name)),
      )
      .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    entry = draft.rates[String(rate)] ?? { ships: [], preferred: [] };
  function toggleShip(name: string) {
    setDraft((d: any) => {
      const e = d.rates[String(rate)] ?? { ships: [], preferred: [] },
        has = e.ships.includes(name),
        nextShips = has ? e.ships.filter((x: string) => x !== name) : [...e.ships, name],
        nextPreferred = e.preferred.filter((x: string) => nextShips.includes(x));
      return {
        ...d,
        rates: {
          ...d.rates,
          [String(rate)]: { ships: nextShips, preferred: nextPreferred },
        },
      };
    });
  }
  function togglePref(name: string) {
    setDraft((d: any) => {
      const e = d.rates[String(rate)],
        has = e.preferred.includes(name),
        preferred = has
          ? e.preferred.filter((x: string) => x !== name)
          : e.preferred.length < 2
            ? [...e.preferred, name]
            : e.preferred;
      return {
        ...d,
        rates: { ...d.rates, [String(rate)]: { ...e, preferred } },
      };
    });
  }
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal preferredModal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draft);
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">PLAYER PROFILE</span>
            <h2>Preferred Ships</h2>
            <span>Save your playable fleet once and reuse it in quick Port Battle signups.</span>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="buildTabs">
          {rates.map((r) => (
            <button type="button" key={r} className={rate === r ? "active" : ""} onClick={() => setRate(r)}>
              {rateLabel(r)}
            </button>
          ))}
        </div>
        <fieldset>
          <legend>Ships you can play</legend>
          <div className="pbShipChecklist pbVisualShipChecklist">
            {options.map((ship: any) => (
              <label key={ship.name} className={entry.ships.includes(ship.name) ? "selected" : ""}>
                <input
                  type="checkbox"
                  checked={entry.ships.includes(ship.name)}
                  onChange={() => toggleShip(ship.name)}
                />
                <img src={ship.image || "/wosb/navigation/ships.png"} alt="" />
                <span>
                  <b>{ship.name}</b>
                  <small>{ship.class ?? ship.type ?? `Rate ${rate}`}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred ships · choose up to two</legend>
          <div className="pbShipChecklist pbPreferredChecklist">
            {entry.ships.map((name: string) => {
              const ship = ships.find((x: any) => x.name === name);
              return (
                <label key={name} className={entry.preferred.includes(name) ? "selected" : ""}>
                  <input
                    type="checkbox"
                    checked={entry.preferred.includes(name)}
                    onChange={() => togglePref(name)}
                  />
                  {ship?.image && <img src={ship.image} alt="" />}
                  <span>
                    <b>{name}</b>
                    <small>{entry.preferred.includes(name) ? "★ Preferred" : "Mark preferred"}</small>
                  </span>
                </label>
              );
            })}
            {!entry.ships.length && <p className="muted">Choose playable ships above first.</p>}
          </div>
        </fieldset>
        <div className="pbHornRequirements">
          <label className="checkLine pbHornPreference">
            <input
              type="checkbox"
              checked={draft.horn_capable}
              onChange={(e) =>
                setDraft((d: any) => ({
                  ...d,
                  horn_capable: e.target.checked,
                  horn_preferred: e.target.checked ? d.horn_preferred : false,
                  horn_requirements_ack: e.target.checked ? d.horn_requirements_ack : false,
                }))
              }
            />
            <span>
              <b>I Am Willing To / Can Play Horn</b>
              <small>
                Horn duty requires the Captain Skill that unlocks the additional consumable slot (<b>F</b>).
              </small>
            </span>
          </label>
          {draft.horn_capable && (
            <>
              <p>
                <strong>Required Horn loadout:</strong> Filling Ration in consumable slot 2 (<b>C</b>) and
                Horn in consumable slot 3 (<b>V</b>). Maintain at least <strong>300 Horns</strong> and{" "}
                <strong>300 Filling Rations</strong>. BOM reimburses the supply cost of running Horn.
              </p>
              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={draft.horn_requirements_ack}
                  onChange={(e) =>
                    setDraft((d: any) => ({
                      ...d,
                      horn_requirements_ack: e.target.checked,
                    }))
                  }
                />
                <span>
                  <b>I Meet The Horn Requirements</b>
                  <small>I have the additional consumable slot and will maintain the required stock.</small>
                </span>
              </label>
              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={draft.horn_preferred}
                  onChange={(e) =>
                    setDraft((d: any) => ({
                      ...d,
                      horn_preferred: e.target.checked,
                    }))
                  }
                />
                <span>
                  <b>I Generally Prefer Horn Duty</b>
                  <small>Leave this off if you can play Horn but generally prefer not to.</small>
                </span>
              </label>
            </>
          )}
        </div>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton" disabled={draft.horn_capable && !draft.horn_requirements_ack}>
            Save Preferred Ships
          </button>
        </div>
      </form>
    </div>
  );
}
export function GuestSignupModal({
  ships,
  onClose,
  onSave,
}: {
  ships: string[];
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]),
    [preferred, setPreferred] = useState<string[]>([]),
    [flares, setFlares] = useState<string[]>([]);
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void onSave({
            name: String(fd.get("name") ?? ""),
            status: String(fd.get("status") ?? "ATTENDING"),
            ships: picked,
            preferredShips: preferred,
            hornCapable: fd.get("horn") === "on",
            flareCapabilities: flares,
            lateMinutes: Number(fd.get("late") ?? 0),
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">OFFICER TOOL</span>
            <h2>Add Non-Discord Player</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Captain name
          <input name="name" required maxLength={80} />
        </label>
        <div className="formGrid">
          <label>
            Status
            <select name="status">
              <option value="ATTENDING">Attending</option>
              <option value="WAITLIST">Waitlist</option>
              <option value="LATE">Running Late</option>
            </select>
          </label>
          <label>
            Minutes late
            <input name="late" type="number" min={0} max={60} defaultValue={0} />
          </label>
        </div>
        <fieldset>
          <legend>Ships they can play</legend>
          <div className="pbShipChecklist">
            {ships.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={picked.includes(name)}
                  onChange={() => {
                    setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
                    setPreferred((p) => p.filter((x) => x !== name));
                  }}
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred · up to two</legend>
          <div className="pbShipChecklist">
            {picked.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={preferred.includes(name)}
                  onChange={() =>
                    setPreferred((p) =>
                      p.includes(name) ? p.filter((x) => x !== name) : p.length < 2 ? [...p, name] : p,
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="checkLine">
          <input name="horn" type="checkbox" /> Can play Horn
        </label>
        <fieldset className="pbFlareSignup">
          <legend>Signal Flare volunteering</legend>
          <div className="pbFlareChoices">
            {["Red Flare", "Gold Flare", "Blue Flare"].map((color) => (
              <label key={color}>
                <input
                  type="checkbox"
                  checked={flares.includes(color)}
                  onChange={() =>
                    setFlares((v) => (v.includes(color) ? v.filter((x) => x !== color) : [...v, color]))
                  }
                />
                <img
                  className="pbDutyIcon"
                  src={`/wosb/pb/duties/${color.toLowerCase().replace(" ", "-")}.png`}
                  alt=""
                />
                {color}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton" disabled={!picked.length}>
            Add Player
          </button>
        </div>
      </form>
    </div>
  );
}
