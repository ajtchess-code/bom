"use client";
import { useState } from "react";
export default function BattleHourButtons({
  value,
  onChange,
  label = "Battle hour",
  allowOtherHours = false,
}: {
  value: number | null;
  onChange: (hour: number) => void;
  label?: string;
  allowOtherHours?: boolean;
}) {
  const [more, setMore] = useState(false);
  const hours = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => i + start).map((hour) => (
      <button
        type="button"
        key={hour}
        className={value === hour ? "active" : ""}
        aria-pressed={value === hour}
        onClick={() => onChange(hour)}
      >
        {String(hour).padStart(2, "0")}
      </button>
    ));
  return (
    <div role="group" aria-label={label}>
      <div className="pbTimeButtons">{hours(12, 12)}</div>
      {allowOtherHours && (
        <>
          <button
            type="button"
            className="outlineButton territoryTimerAdjust"
            aria-expanded={more || (value !== null && value < 12)}
            onClick={() => setMore(!more)}
          >
            Other hours · 00–11
          </button>
          {(more || (value !== null && value < 12)) && <div className="pbTimeButtons">{hours(0, 12)}</div>}
        </>
      )}
    </div>
  );
}
