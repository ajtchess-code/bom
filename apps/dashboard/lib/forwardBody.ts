/** An empty JSON content type makes Fastify reject bodyless actions before routing. */
export function forwardBody(method: string, contentType: string | null, rawBody?: string) {
  const body = method === "GET" || method === "HEAD" || rawBody === "" ? undefined : rawBody;
  const emptyJson =
    body === undefined && /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType ?? "");
  return { body, contentType: emptyJson ? null : contentType };
}
