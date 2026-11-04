export async function operationsApi(path: string, init: RequestInit = {}) {
  const r = await fetch("/api/internal/" + path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(
        (b.message ?? b.error ?? "Request failed") + (b.requestId ? " · reference " + b.requestId : ""),
      ),
      { body: b },
    );
  return b;
}
export const displayDate = (value: any) => (value ? new Date(value).toLocaleString() : "—");
export function downloadCsv(name: string, rows: any[][]) {
  const csv = rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v ?? "")
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
