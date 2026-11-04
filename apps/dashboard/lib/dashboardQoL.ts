"use client";
import { useEffect, useState } from "react";

export type RecentPayload = {
  kind: string;
  key: string;
  label: string;
  href: string;
  metadata?: Record<string, any>;
};
export type FavoritePayload = RecentPayload & { active?: boolean };
export type ToastPayload = {
  message: string;
  tone?: "success" | "warning" | "error" | "info";
  actionLabel?: string;
  action?: () => void;
  duration?: number;
};
export type InspectorPayload = {
  title: string;
  subtitle?: string;
  kind?: string;
  href?: string;
  fields?: Array<{ label: string; value: any }>;
  actions?: Array<{ label: string; href: string; primary?: boolean }>;
};

export function emitRecent(detail: RecentPayload) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bom:recent", { detail }));
}
export function emitFavorite(detail: FavoritePayload) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bom:favorite", { detail }));
}
export function emitToast(message: string, options: Omit<ToastPayload, "message"> = {}) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("bom:toast", { detail: { message, ...options } }));
}
export function emitInspector(detail: InspectorPayload) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bom:inspect", { detail }));
}

export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`bom:qol:${key}`);
      if (raw != null) setValue(JSON.parse(raw));
    } catch {
    } finally {
      setHydrated(true);
    }
  }, [key]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(`bom:qol:${key}`, JSON.stringify(value));
    } catch {}
  }, [key, value, hydrated]);
  return [value, setValue] as const;
}
