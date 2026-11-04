"use client";
import { useEffect } from "react";
import Link from "next/link";
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const ref = error.digest ?? error.message?.slice(0, 120) ?? "dashboard-error";
  return (
    <div className="dashboardError panel">
      <span className="eyebrow">DASHBOARD ERROR</span>
      <h2>That page hit a problem.</h2>
      <p>You can retry immediately or send the error reference directly into the new Bug Report system.</p>
      <code>{ref}</code>
      <div className="heroActions">
        <button className="goldButton" onClick={reset}>
          Try again
        </button>
        <Link className="outlineButton" href={`/dashboard/feedback?new=bug&error=${encodeURIComponent(ref)}`}>
          Report this error
        </Link>
      </div>
    </div>
  );
}
