// cloudflared logs CLOUDFLARE_* variables without masking our token alias.
// Pass only its runtime settings and its native, masked TUNNEL_TOKEN field.
const RUNTIME=new Set(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','TUNNEL_TRANSPORT_PROTOCOL','TUNNEL_LOGLEVEL','TUNNEL_LOGFILE','TUNNEL_LOGFORMAT','TUNNEL_METRICS','TUNNEL_REGION','TUNNEL_EDGE_IP_VERSION','TUNNEL_EDGE_BIND_ADDRESS','TUNNEL_HA_CONNECTIONS','TUNNEL_NO_AUTOUPDATE','TUNNEL_GRACE_PERIOD']);
export function cloudflaredEnv(host,token){
 if(typeof token!=='string'||!token.trim())throw new Error('Cloudflare tunnel token is required');
 const env={};for(const [key,value]of Object.entries(host))if(RUNTIME.has(key)&&value!==undefined)env[key]=value;
 env.TUNNEL_TOKEN=token.trim();return env;
}
