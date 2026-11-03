import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export function validateIntelRuntime(version = process.versions.node, executable = process.execPath, loadSqlite = () => createRequire(import.meta.url)('node:sqlite')) {
  const detail = `Node.js ${version} (${executable})`;
  const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const major=Number(match?.[1]),minor=Number(match?.[2]);
  if(!match||!(major===22&&minor>=21||major>=24))throw new Error(`Intel relay requires Node.js 22.21.0+ (22.x) or 24+; detected ${detail}.`);
  let database;
  try {
    const { DatabaseSync } = loadSqlite();
    database = new DatabaseSync(':memory:', { timeout: 5000 });
    database.exec('CREATE TABLE runtime_check (value TEXT) STRICT;');
    database.prepare('INSERT INTO runtime_check VALUES (?)').run('{"ok":1}');
    if (database.prepare("SELECT json_extract(value, '$.ok') AS ok FROM runtime_check").get()?.ok !== 1) throw new Error('SQLite JSON query failed');
    if (Number(database.prepare('PRAGMA busy_timeout').get()?.timeout) !== 5000) throw new Error('SQLite busy timeout unavailable');
  } catch (error) {
    throw new Error(`Intel relay SQLite check failed under ${detail}: ${error.message}`);
  } finally {
    database?.close();
  }
  return detail;
}

// Keep root bot credentials and DASHBOARD_PORT out of the relay process.
export function isolatedIntelEnv(hostEnv, values, relayRoot) {
  const env = {};
  for (const key of ['PATH','HOME','TMPDIR','TMP','TEMP','SystemRoot','USERPROFILE','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy']) {
    if (hostEnv[key] !== undefined) env[key] = hostEnv[key];
  }
  Object.assign(env, { NODE_ENV: 'production', DASHBOARD_HOST: '127.0.0.1', DASHBOARD_PORT: '8196', PUBLIC_ORIGIN: 'https://intel.bandofmisfits.org', COOKIE_SECURE: 'true', DATA_DIR: resolve(relayRoot, 'data'), LOG_LEVEL: 'info' });
  for (const key of ['DASHBOARD_PASSWORD','DASHBOARD_HOST','DASHBOARD_PORT','PUBLIC_ORIGIN','COOKIE_SECURE','DATA_DIR','LOG_LEVEL']) {
    if (values[key] !== undefined && values[key] !== '') env[key] = values[key];
  }
  env.DESTINATION_GUILD_IDS = String(values.DESTINATION_GUILD_IDS || hostEnv.DISCORD_GUILD_ID || '');
  env.DATA_DIR = resolve(relayRoot, env.DATA_DIR);
  return env;
}
export function parseIntelEnv(text) {
  const values = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim(); if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) throw new Error('Malformed intel-relay/.env line. Use KEY=value entries.');
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0]; value = value.slice(1,-1);
      if (quote === '"') value = value.replace(/\\n/g,'\n').replace(/\\r/g,'\r');
    } else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}
export function validateIntelEnv(env, occupiedPorts = []) {
  if (!env.DASHBOARD_PASSWORD || env.DASHBOARD_PASSWORD.length < 16) throw new Error('Set DASHBOARD_PASSWORD (at least 16 characters) in intel-relay/.env.');
  const port = Number(env.DASHBOARD_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid intel-relay DASHBOARD_PORT.');
  if (occupiedPorts.map(Number).includes(port)) throw new Error(`Intel relay port ${port} conflicts with an existing BOM service. Choose a different relay port and update its Cloudflare route.`);
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or trailing slash.');
  if (origin.protocol === 'https:' && env.COOKIE_SECURE !== 'true') throw new Error('Set COOKIE_SECURE=true for the HTTPS intel dashboard.');
  if (!['true','false'].includes(env.COOKIE_SECURE)) throw new Error('COOKIE_SECURE must be true or false.');
}
export function prepareIntelRelay({ root, occupiedPorts = [], hostEnv = process.env, run = spawnSync }) {
  const flag = hostEnv.INTEL_RELAY_ENABLED;
  if (flag && /^(0|false|no|off)$/i.test(flag)) { console.log('[intel] Disabled by INTEL_RELAY_ENABLED.'); return null; }
  const directory = resolve(root, 'intel-relay');
  const envFile = resolve(directory, '.env');
  if (!existsSync(resolve(directory, 'package.json'))) {
    if (flag && /^(1|true|yes|on)$/i.test(flag)) throw new Error('intel-relay/package.json is missing. Extract the complete integration archive into the root.');
    return null;
  }
  if (!existsSync(envFile)) { console.warn('[intel] Not started: copy intel-relay/.env.example to intel-relay/.env and set the dashboard password.'); return null; }
  console.log(`[intel] Runtime verified: ${validateIntelRuntime()}`);
  const env = isolatedIntelEnv(hostEnv, parseIntelEnv(readFileSync(envFile, 'utf8')), directory);
  validateIntelEnv(env, occupiedPorts);
  const lockPath = resolve(directory, 'package-lock.json');
  if (!existsSync(lockPath)) throw new Error('intel-relay/package-lock.json is missing. Re-extract the integration archive.');
  const fingerprint = createHash('sha256').update(readFileSync(lockPath)).update(readFileSync(resolve(directory,'package.json'))).digest('hex');
  const stamp = resolve(directory, 'node_modules', '.intel-install-stamp');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const execute = args => {
    const result = run(npm, args, { cwd: directory, env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`Relay ${args[0]} failed. See the preceding npm output; existing BOM services are unaffected.`);
  };
  const missing = ['discord.js-selfbot-v13','discord.js','dotenv','zod','typescript'].some(name => !existsSync(resolve(directory,'node_modules',name,'package.json')));
  if (missing || !existsSync(stamp) || readFileSync(stamp,'utf8') !== fingerprint) {
    console.log('[intel] Installing isolated relay dependencies...');
    execute(['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund','--workspaces=false']);
    writeFileSync(stamp, fingerprint);
  }
  console.log('[intel] Building relay from current source...');
  execute(['run','build','--workspaces=false']);
  return { cwd: directory, env, entry: resolve(directory,'dist/src/index.js') };
}
