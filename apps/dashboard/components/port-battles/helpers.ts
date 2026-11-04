// Shared helpers for the Port Battles dashboard.
export const base = "/api/internal/wosb";
export async function api(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: h,
    cache: "no-store",
  });
  const t = await r.text();
  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { error: t };
  }
  if (!r.ok)
    throw Object.assign(new Error(j.message ?? j.error ?? `Request failed (${r.status})`), {
      status: r.status,
      data: j,
    });
  return j;
}
export function fmt(v: any) {
  return v
    ? new Date(v).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Time TBD";
}
export function rateLabel(r: any) {
  const n = Number(r);
  return n ? `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} Rate` : "Rate TBD";
}
export function localDateKey(d = new Date()) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function shiftedLocalDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return localDateKey(d);
}
export function gameSelectionToIso(date: string, hour: number, offsetMinutes: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, Number(hour) || 0, Number(offsetMinutes) || 0, 0, 0).toISOString();
}
export function gameSelectionFromIso(value: any, offsetMinutes: number) {
  const shifted = new Date(new Date(value).getTime() - (Number(offsetMinutes) || 0) * 60000);
  return { date: localDateKey(shifted), hour: shifted.getHours() };
}
export function cleanName(v: any) {
  return String(v ?? "").trim();
}
