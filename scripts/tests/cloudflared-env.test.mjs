import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloudflaredEnv} from '../cloudflared-env.mjs';
test('cloudflared receives its masked native token without aliases or bot credentials',()=>{
 const host={PATH:'/usr/bin',HOME:'/host',HTTPS_PROXY:'http://proxy:8080',SSL_CERT_FILE:'/cert.pem',TUNNEL_TRANSPORT_PROTOCOL:'auto',CLOUDFLARE_TUNNEL_TOKEN:'exposed-alias',CLOUDFLARE_TUNNEL_TOKEN_FILE:'/token.txt',CLOUDFLARE_API_TOKEN:'other-secret',TUNNEL_TOKEN:'stale-token',TUNNEL_TOKEN_FILE:'/stale.txt',DISCORD_BOT_TOKEN:'discord-secret',OPENAI_API_KEY:'openai-secret',DATABASE_URL:'db-secret',INTERNAL_API_TOKEN:'internal-secret'};
 const env=cloudflaredEnv(host,' native-token ');assert.equal(env.TUNNEL_TOKEN,'native-token');for(const key of ['PATH','HOME','HTTPS_PROXY','SSL_CERT_FILE','TUNNEL_TRANSPORT_PROTOCOL'])assert.equal(env[key],host[key]);for(const key of ['CLOUDFLARE_TUNNEL_TOKEN','CLOUDFLARE_TUNNEL_TOKEN_FILE','CLOUDFLARE_API_TOKEN','TUNNEL_TOKEN_FILE','DISCORD_BOT_TOKEN','OPENAI_API_KEY','DATABASE_URL','INTERNAL_API_TOKEN'])assert.equal(env[key],undefined);assert.equal(host.CLOUDFLARE_TUNNEL_TOKEN,'exposed-alias');assert.equal(host.TUNNEL_TOKEN,'stale-token');assert.throws(()=>cloudflaredEnv(host,''),/token is required/);
});
test('launcher uses the isolated cloudflared environment for its service',async()=>{const code=await readFile(new URL('../novonode.mjs',import.meta.url),'utf8');assert.match(code,/spawnService\("cloudflared"[^\n]+env:cloudflaredEnv\(process\.env,tunnel\.token\)/);});
