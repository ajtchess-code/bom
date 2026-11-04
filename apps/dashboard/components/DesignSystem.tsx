"use client";
import type { ReactNode } from "react";
import HelpTip from "./HelpTip";

export function Surface({
  children,
  className = "",
  level = 1,
}: {
  children: ReactNode;
  className?: string;
  level?: 1 | 2 | 3;
}) {
  return <section className={`uiSurface uiSurface${level} ${className}`}>{children}</section>;
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral" | "live";
}) {
  return (
    <span className={`uiStatus ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function EmptyState({
  icon = "◇",
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="uiEmpty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`uiSkeleton ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
export function SettingRow({
  title,
  description,
  help,
  children,
}: {
  title: string;
  description?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="uiSettingRow">
      <span>
        <b>
          {title}
          {help && <HelpTip title={title}>{help}</HelpTip>}
        </b>
        {description && <small>{description}</small>}
      </span>
      <span className="uiSettingControl">{children}</span>
    </label>
  );
}
export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset?: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="uiSaveBar">
      <span>
        <b>Unsaved changes</b>
        <small>Review and save before leaving this page.</small>
      </span>
      {onReset && (
        <button className="outlineButton" onClick={onReset}>
          Reset
        </button>
      )}
      <button className="goldButton" disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
