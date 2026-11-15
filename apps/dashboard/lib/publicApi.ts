// Server-side fetch for the public wiki: no session, read-only wiki paths only.
export async function publicFetch(path: string) {
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100";
  return fetch(`${base}${path}`, {
    headers: { "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "", "x-bom-public": "1" },
    next: { revalidate: 300 },
  });
}
/** Public site settings from .env, with BOM's defaults. */
// BOM's AdSense publisher ID (public, safe to commit). PUBLIC_ADSENSE_CLIENT overrides it.
export const DEFAULT_AD_CLIENT = "ca-pub-6442579332215350";

export function publicSettings() {
  const client = (process.env.PUBLIC_ADSENSE_CLIENT || DEFAULT_AD_CLIENT).trim();
  return {
    adClient: /^ca-pub-\d{10,20}$/.test(client) ? client : "",
    adSlots: {
      top: (process.env.PUBLIC_ADSENSE_SLOT_TOP ?? "").trim(),
      bottom: (process.env.PUBLIC_ADSENSE_SLOT_BOTTOM ?? "").trim(),
    },
    donateUrl: (process.env.PUBLIC_DONATE_URL ?? "https://paypal.me/litefootz").trim(),
    loginUrl: process.env.PUBLIC_DASHBOARD_URL ?? "/",
    discordUrl: (process.env.PUBLIC_DISCORD_INVITE ?? "").trim(),
  };
}
