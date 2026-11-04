"use client";
import BattleHourButtons from "./BattleHourButtons";
export default function TerritoryWindowTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? ""),
    hour = match ? Number(match[1]) : null;
  const choose = (h: number, m: number) =>
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return (
    <div className="territoryWindowTime">
      <div className="panelHead">
        <strong>{label} · In-game</strong>
        <output aria-label={`${label} selected`}>{value || "Not set"}</output>
        {value && (
          <button
            type="button"
            className="outlineButton territoryTimerAdjust"
            aria-label={`${label} clear`}
            onClick={() => onChange("")}
          >
            Clear
          </button>
        )}
      </div>
      <BattleHourButtons value={hour} onChange={(h) => choose(h, 0)} label={label} allowOtherHours />
    </div>
  );
}
