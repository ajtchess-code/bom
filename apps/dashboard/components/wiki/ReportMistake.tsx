"use client";
// "Report a mistake": sends a note about any wiki page to the officers' review queue.
import { useState } from "react";

const KINDS: [string, string][] = [
  ["CORRECTION", "Something is wrong"],
  ["MISSING_INFO", "Something is missing"],
  ["CLARITY", "It's hard to understand"],
  ["SOURCE", "I have a source"],
];

export default function ReportMistake({ page, label }: { page: string; label: string }) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("CORRECTION"),
    [body, setBody] = useState(""),
    [state, setState] = useState<"" | "sending" | "sent" | string>("");
  const send = async () => {
    setState("sending");
    try {
      const r = await fetch(`/api/internal/wiki/portal/articles/${encodeURIComponent(page)}/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, body: `[${label}] ${body.trim()}` }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.message || "Couldn't send that. Try again.");
      setState("sent");
      setBody("");
    } catch (e: any) {
      setState(e.message);
    }
  };
  if (!open)
    return (
      <button type="button" className="rmOpen" onClick={() => setOpen(true)}>
        ⚑ Report a mistake
      </button>
    );
  return (
    <section className="rmForm" aria-label="Report a mistake">
      {state === "sent" ? (
        <p role="status">
          Thanks! Officers will review it.{" "}
          <button
            type="button"
            className="whLink"
            onClick={() => {
              setState("");
              setOpen(false);
            }}
          >
            Close
          </button>
        </p>
      ) : (
        <>
          <h3>Report a mistake on “{label}”</h3>
          <div className="rmKinds" role="radiogroup" aria-label="What's wrong?">
            {KINDS.map(([k, l]) => (
              <label key={k} className={kind === k ? "active" : ""}>
                <input type="radio" name="rm-kind" checked={kind === k} onChange={() => setKind(k)} /> {l}
              </label>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="What should it say? A screenshot link or game version helps."
            aria-label="Details"
          />
          {state && state !== "sending" && <p className="gwError">{state}</p>}
          <div className="rmActions">
            <button
              type="button"
              className="whCta"
              disabled={body.trim().length < 5 || state === "sending"}
              onClick={send}
            >
              {state === "sending" ? "Sending…" : "Send to officers"}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
