"use client";
import TerritoryGuildSelect from "./TerritoryGuildSelect";
export default function TerritoryTaxes({
  value,
  onChange,
  guilds,
  now,
}: {
  value: any[];
  onChange: (taxes: any[]) => void;
  guilds: any[];
  now: number;
}) {
  const edit = (index: number, patch: any) =>
    onChange(value.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  return (
    <div className="territoryTaxes">
      <header className="panelHead">
        <strong>Taxes</strong>
        <button
          type="button"
          className="outlineButton territoryTimerAdjust"
          onClick={() => onChange([...value, { id: crypto.randomUUID(), tag: "", _new: true }])}
        >
          Add tax
        </button>
      </header>
      {!value.length && <p className="uiEmpty">No taxing guilds recorded.</p>}
      {value.map((tax, index) => {
        const left = Math.max(0, (Date.parse(tax.protected_until ?? "") || 0) - now),
          newTax = tax._new || tax.renew;
        return (
          <section className="territoryTax" key={tax.id}>
            <TerritoryGuildSelect
              label={`Taxing Guild ${index + 1}`}
              value={tax.tag}
              guilds={guilds}
              onChange={(tag) => edit(index, { tag })}
            />
            <small>
              {newTax
                ? "Starts a 3.2 day timer automatically."
                : left
                  ? `Tax remaining: ${(left / 3600000).toFixed(1)} hours`
                  : "Tax timer has expired."}
            </small>
            <div className="controlRow">
              <button
                type="button"
                className="outlineButton territoryTimerAdjust"
                onClick={() => edit(index, { renew: !tax.renew })}
              >
                {tax.renew ? "Cancel renewal" : "Renew tax"}
              </button>
              <button
                type="button"
                className="dangerGhost territoryTimerAdjust"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                Remove tax {index + 1}
              </button>
            </div>
            <label>
              Tax {index + 1} remaining days
              <input
                aria-label={`Tax ${index + 1} remaining days`}
                type="number"
                min="0"
                max="365"
                step="0.1"
                value={
                  tax.adjustProtection ? (tax.protectionDays ?? "") : Number((left / 86400000).toFixed(1))
                }
                onChange={(e) =>
                  edit(index, {
                    adjustProtection: true,
                    protectionDays: e.target.value,
                    protectionHours: 0,
                    protectionMinutes: 0,
                    clearProtection: false,
                  })
                }
              />
            </label>
            <button
              type="button"
              className="dangerGhost"
              onClick={() =>
                edit(index, {
                  adjustProtection: true,
                  clearProtection: true,
                  protectionDays: 0,
                  protectionHours: 0,
                  protectionMinutes: 0,
                })
              }
            >
              Clear tax timer {index + 1}
            </button>
          </section>
        );
      })}
    </div>
  );
}
