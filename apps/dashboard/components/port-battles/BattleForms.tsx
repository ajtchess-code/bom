"use client";
import ScheduleMessagePreview from "../DiscordPayloadPreview";
import SavedViewControl from "../SavedViewControl";
import BattleHourButtons from "../BattleHourButtons";
import CancelPortBattle from "../CancelPortBattle";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PortBattleInvitations from "../PortBattleInvitations";
import TerritoryMap from "../TerritoryMap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { emitInspector, emitRecent, emitToast, usePersistedState } from "@/lib/dashboardQoL";
import { rateLabel, shiftedLocalDate, gameSelectionToIso, gameSelectionFromIso } from "./helpers";

export function CreateBattle({
  activeBattles,
  ports,
  guilds,
  ownerTags,
  gameTimeOffsetMinutes,
  onClose,
  onSubmit,
}: {
  activeBattles: any[];
  ports: any[];
  guilds: any[];
  ownerTags?: string[];
  gameTimeOffsetMinutes: number;
  onClose: () => void;
  onSubmit: (v: any) => void;
}) {
  const [signupGuild, setSignupGuild] = useState(ownerTags?.[0] ?? "BOM");
  const [portName, setPortName] = useState(""),
    [attacker, setAttacker] = useState("BOM"),
    [defender, setDefender] = useState(""),
    [date, setDate] = useState(shiftedLocalDate()),
    [hour, setHour] = useState(19);
  useEffect(() => {
    if (ownerTags?.length && !ownerTags.includes(signupGuild)) setSignupGuild(ownerTags[0]);
  }, [ownerTags, signupGuild]);
  const port = ports.find((p: any) => p.name === portName);
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!port) return;
          void onSubmit({
            signupGuild,
            portName: port.name,
            attacker,
            defender,
            startsAt: gameSelectionToIso(date, hour, gameTimeOffsetMinutes),
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">SCHEDULE</span>
            <h2>Schedule Port Battle</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Signup guild
          <select
            aria-label="Signup guild"
            value={signupGuild}
            onChange={(e) => setSignupGuild(e.target.value)}
          >
            {(
              ownerTags ?? ["BOM", ...guilds.filter((g) => g.allied && g.tag !== "BOM").map((g) => g.tag)]
            ).map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label>
          Port
          <select required value={portName} onChange={(e) => setPortName(e.target.value)}>
            <option value="">Choose Port…</option>
            {ports.map((p: any) => (
              <option key={p.entityKey ?? p.name} value={p.name}>
                {p.name} · {rateLabel(p.rate)} · {p.size}v{p.size}
              </option>
            ))}
          </select>
        </label>
        {port && (
          <div className="pbDerivedPort">
            <span>
              <small>Rate</small>
              <b>{rateLabel(port.rate)}</b>
            </span>
            <span>
              <small>Team Size</small>
              <b>
                {port.size}v{port.size}
              </b>
            </span>
          </div>
        )}
        <GuildSelector label="Attacker" value={attacker} onChange={setAttacker} guilds={guilds} />
        <GuildSelector label="Defender" value={defender} onChange={setDefender} guilds={guilds} />
        <label>
          Battle Date
          <div className="pbDateQuick">
            <button
              type="button"
              className={date === shiftedLocalDate() ? "active" : ""}
              onClick={() => setDate(shiftedLocalDate())}
            >
              Today
            </button>
            <button
              type="button"
              className={date === shiftedLocalDate(1) ? "active" : ""}
              onClick={() => setDate(shiftedLocalDate(1))}
            >
              Tomorrow
            </button>
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Battle Time · In-Game
          <BattleHourButtons value={hour} onChange={setHour} />
          <small>
            Choose the hour exactly as it appears in-game. BOM applies the configured clock offset, then
            Discord displays the resulting instant correctly for every viewer.
          </small>
        </label>
        {port && (
          <ScheduleMessagePreview
            active={activeBattles}
            guilds={guilds}
            battle={{
              id: "preview",
              port_name: port.name,
              rate: port.rate,
              team_size: port.size ?? port.team_size,
              attacker,
              defender,
              signup_guild: signupGuild,
              status: "OPEN",
              starts_at: gameSelectionToIso(date, hour, gameTimeOffsetMinutes),
            }}
          />
        )}
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton" disabled={!portName || !attacker || !defender}>
            Schedule Port Battle
          </button>
        </div>
      </form>
    </div>
  );
}
export function GuildSelector({
  label,
  value,
  onChange,
  guilds,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  guilds: any[];
}) {
  return (
    <label>
      {label}
      <div className="pbGuildQuick">
        {["BOM", "FAT", "DPS"].map((tag) => (
          <button
            type="button"
            className={value === tag ? "active" : ""}
            key={tag}
            onClick={() => onChange(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Choose Guild…</option>
        {guilds.map((g: any) => (
          <option key={g.reference || g.tag} value={g.reference || g.tag}>
            {g.tag}
            {g.name && g.name !== g.tag ? ` · ${g.name}` : ""}
            {g.faction ? ` · ${g.faction}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ManageBattleModal({
  allowOwnerChange = true,
  battle,
  ports,
  guilds,
  gameTimeOffsetMinutes,
  onClose,
  onSave,
}: {
  allowOwnerChange?: boolean;
  battle: any;
  ports: any[];
  guilds: any[];
  gameTimeOffsetMinutes: number;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const shown = battle.starts_at
      ? gameSelectionFromIso(battle.starts_at, gameTimeOffsetMinutes)
      : { date: shiftedLocalDate(), hour: 19 },
    review = battle.review ?? {};
  const [portName, setPortName] = useState(battle.port_name),
    [attacker, setAttacker] = useState(battle.attacker ?? ""),
    [defender, setDefender] = useState(battle.defender ?? ""),
    [date, setDate] = useState(shown.date),
    [hour, setHour] = useState(shown.hour);
  const port = ports.find((p: any) => p.name === portName);
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget),
            issueTags = String(fd.get("issueTags") ?? "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
          void onSave({
            signupGuild: String(fd.get("signupGuild") ?? battle.signup_guild ?? "BOM"),
            portName,
            attacker,
            defender,
            startsAt: gameSelectionToIso(date, hour, gameTimeOffsetMinutes),
            status: ["WIN","DRAW","LOSS"].includes(String(fd.get("result"))) ? "FINISHED" : String(fd.get("status") ?? battle.status),
            result: String(fd.get("result") ?? review.result ?? "UNKNOWN"),
            issueTags,
            reviewNotes: String(fd.get("reviewNotes") ?? ""),
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">OFFICER TOOL</span>
            <h2>Manage Battle</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {allowOwnerChange && (
          <label>
            Signup guild
            <select aria-label="Signup guild" name="signupGuild" defaultValue={battle.signup_guild ?? "BOM"}>
              {[
                ...new Set([
                  "BOM",
                  battle.signup_guild ?? "BOM",
                  ...guilds.filter((g) => g.allied).map((g) => g.tag),
                ]),
              ].map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Port
          <select value={portName} onChange={(e) => setPortName(e.target.value)}>
            {ports.map((p: any) => (
              <option key={p.entityKey ?? p.name} value={p.name}>
                {p.name} · {rateLabel(p.rate)} · {p.size}v{p.size}
              </option>
            ))}
          </select>
        </label>
        {port && (
          <div className="pbDerivedPort">
            <span>
              <small>Rate</small>
              <b>{rateLabel(port.rate)}</b>
            </span>
            <span>
              <small>Team Size</small>
              <b>
                {port.size}v{port.size}
              </b>
            </span>
          </div>
        )}
        <GuildSelector label="Attacker" value={attacker} onChange={setAttacker} guilds={guilds} />
        <GuildSelector label="Defender" value={defender} onChange={setDefender} guilds={guilds} />
        <label>
          Battle Date
          <div className="pbDateQuick">
            <button type="button" onClick={() => setDate(shiftedLocalDate())}>
              Today
            </button>
            <button type="button" onClick={() => setDate(shiftedLocalDate(1))}>
              Tomorrow
            </button>
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Battle Time · In-Game
          <BattleHourButtons value={hour} onChange={setHour} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={battle.status}>
            <option value="OPEN">Open Signup</option>
            <option value="CLOSED">Closed Signup</option>
            <option value="FINISHED">Finished</option>
          </select>
        </label>
        <fieldset className="pbBattleReviewFields">
          <legend>Finished Battle Review · Officer Only</legend>
          <div className="formGrid">
            <label>
              Result
              <select name="result" defaultValue={review.result ?? "UNKNOWN"}>
                <option value="UNKNOWN">Not Recorded</option>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
                <option value="DRAW">Draw</option>
              </select>
            </label>
            <label>
              Issue Tags
              <input
                name="issueTags"
                defaultValue={(review.issue_tags ?? []).join(", ")}
                placeholder="positioning, focus fire, mines…"
              />
            </label>
          </div>
          <label>
            Review Note
            <textarea name="reviewNotes" defaultValue={review.notes ?? ""} />
          </label>
        </fieldset>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton">Save Battle</button>
        </div>
      </form>
    </div>
  );
}
