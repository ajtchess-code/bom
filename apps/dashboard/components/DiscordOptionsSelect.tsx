"use client";
import type { ReactNode, SelectHTMLAttributes } from "react";
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  onRefresh: () => void;
  refreshing?: boolean;
};
export default function DiscordOptionsSelect({ children, onRefresh, refreshing = false, ...props }: Props) {
  return (
    <span className="discordOptionsSelect">
      <select {...props}>{children}</select>
      <button
        type="button"
        className="discordOptionsReload"
        title="Refresh Discord roles, channels and categories"
        aria-label="Refresh Discord options"
        disabled={refreshing}
        onClick={onRefresh}
      >
        {refreshing ? "…" : "↻"}
      </button>
    </span>
  );
}
