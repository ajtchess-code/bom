import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual,createHash } from 'node:crypto';
import type { AccountManager } from '../accounts/manager.js';
export class DashboardServer {
  private server: http.Server;
  private sessions = new Map<string, number>();
  private attempts = new Map<string, { count: number; until: number }>();
  private hash: Buffer;
  private salt = randomBytes(16);
  constructor(private manager: AccountManager, password: string, private secure: boolean, private htmlPath: string, private publicOrigin?: string) {
    this.hash = scryptSync(password, this.salt, 32);
    this.server = http.createServer((req, res) => { void this.handle(req, res).catch(() => { if (!res.headersSent) this.json(res, 500, { error: 'Request failed. Check local service logs.' }); else res.end(); }); });
    this.server.requestTimeout = 120_000; this.server.headersTimeout = 15_000;
  }
  public async start(host: string, port: number) { await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(port, host, resolve); }); }
  public address() { return this.server.address(); }
  public async stop() { this.server.closeIdleConnections(); await new Promise<void>((resolve, reject) => this.server.close(e => e ? reject(e) : resolve())); }
  private json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }
  private async body(req: IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0, text = '';
    for await (const chunk of req) { size += chunk.length; if (size > 128_000) throw new Error('Request too large.'); text += chunk; }
    const data: unknown = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid JSON object.');
    return data as Record<string, unknown>;
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') return this.json(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(this.htmlPath, 'utf8').replaceAll('__NONCE__', nonce)); return; }
    if (req.method !== 'GET') {
      const expected = this.publicOrigin ?? `${this.secure ? 'https' : 'http'}://${req.headers.host}`;
      if (req.headers.origin !== expected || !req.headers['content-type']?.startsWith('application/json')) return this.json(res, 403, { error: 'Same-origin JSON request required.' });
    }
    const now = Date.now();
    for (const [key, expiry] of this.sessions) if (expiry <= now) this.sessions.delete(key);
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)relay_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress ?? 'unknown';
      const attempts = this.attempts.get(ip) ?? { count: 0, until: now + 15 * 60_000 };
      if (attempts.count >= 10 || this.attempts.size > 10000 || this.sessions.size >= 1000) return this.json(res, 429, { error: 'Too many login attempts. Try again later.' });
      const body = await this.body(req); attempts.count++; this.attempts.set(ip, attempts);
      if (typeof body.password !== 'string' || body.password.length > 1024 || !timingSafeEqual(scryptSync(body.password, this.salt, 32), this.hash)) return this.json(res, 401, { error: 'Incorrect password.' });
      this.attempts.delete(ip); const session = randomBytes(32).toString('hex'); this.sessions.set(session, now + 8 * 3600_000);
      res.setHeader('Set-Cookie', `relay_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${this.secure ? '; Secure' : ''}`);
      return this.json(res, 200, { ok: true });
    }
    if (!cookie || !this.sessions.has(cookie)) return this.json(res, 401, { error: 'Sign in to continue.' });
    const actor='session-'+createHash('sha256').update(cookie).digest('hex').slice(0,10);
    try {
      if (url.pathname === '/api/logout' && req.method === 'POST') { this.sessions.delete(cookie); res.setHeader('Set-Cookie', 'relay_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return this.json(res, 200, { ok: true }); }
      if (url.pathname === '/api/feed' && req.method === 'GET') return this.json(res, 200, this.manager.feed(Object.fromEntries([...url.searchParams].filter(([, v]) => v !== ''))));
      if (url.pathname === '/api/accounts' && req.method === 'GET') return this.json(res, 200, this.manager.list());
      if (url.pathname === '/api/accounts' && req.method === 'POST') return this.json(res, 200, { id: await this.manager.save(null, await this.body(req),actor) });
      const match = url.pathname.match(/^\/api\/accounts\/([a-f0-9-]+)(?:\/(guilds|channels|toggle|search|conversations|history|tools))?$/);
      if (match) {
        const id = match[1]!;
        if(req.method==='POST'&&match[2]==='tools')return this.json(res,200,await this.manager.tools(id,await this.body(req),actor));
        if(req.method==='GET'&&match[2]==='conversations')return this.json(res,200,this.manager.conversations(id));
        if(req.method==='POST'&&match[2]==='history')return this.json(res,200,await this.manager.history(id,await this.body(req))); 
        if (req.method === 'POST' && match[2] === 'search') return this.json(res, 200, await this.manager.search(id, await this.body(req)));
        if (req.method === 'GET' && match[2] === 'search') return this.json(res, 200, await this.manager.search(id, {guildId:url.searchParams.get('guildId')??url.searchParams.get('guild'),query:url.searchParams.get('query')??url.searchParams.get('q'),offset:Number(url.searchParams.get('offset')??0)}));
        if (req.method === 'GET' && match[2] === 'guilds') return this.json(res, 200, this.manager.guilds(id));
        if (req.method === 'GET' && match[2] === 'channels') return this.json(res, 200, await this.manager.channels(id, url.searchParams.get('guild') ?? ''));
        if (req.method === 'POST' && match[2] === 'toggle') { const body = await this.body(req); if (typeof body.enabled !== 'boolean') throw new Error('enabled must be boolean.'); await this.manager.toggle(id, body.enabled); return this.json(res, 200, { ok: true }); }
        if (req.method === 'PUT' && !match[2]) return this.json(res, 200, { id: await this.manager.save(id, await this.body(req),actor) });
        if (req.method === 'DELETE' && !match[2]) { await this.manager.remove(id); return this.json(res, 200, { ok: true }); }
      }
      return this.json(res, 404, { error: 'Not found.' });
    } catch (error) {
      // Validation reports paths only; never echo token/webhook input or upstream errors.
      const message = error instanceof Error && ['Each source server must have one route.','Overlapping routes to the same destination are not allowed.', 'Sub-relay not found.', 'Account not found.', 'This token is already configured.', 'Connect this account first.', 'Guild not available to this account.'].includes(error.message) ? error.message : 'Could not complete request. Check the fields, account connection and channel access.';
      return this.json(res, 400, { error: message });
    }
  }
}
