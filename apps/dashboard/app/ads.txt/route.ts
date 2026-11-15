// ads.txt for Google AdSense, built from PUBLIC_ADSENSE_CLIENT.
export function GET() {
  const client = (process.env.PUBLIC_ADSENSE_CLIENT ?? "").trim();
  const pub = client.replace(/^ca-/, "");
  const body = /^pub-\d{10,20}$/.test(pub) ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : "";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
