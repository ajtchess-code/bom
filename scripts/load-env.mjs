import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tiny dependency-free .env loader for bot hosts. Real process environment
// values always win so Novonode panel variables can override an uploaded file.
export function loadRootEnv(){
  const file=resolve(process.cwd(),process.env.ENV_FILE||".env");
  if(!existsSync(file))return false;
  for(const raw of readFileSync(file,"utf8").split(/\r?\n/)){
    let line=raw.trim();
    if(!line||line.startsWith("#"))continue;
    if(line.startsWith("export "))line=line.slice(7).trim();
    const eq=line.indexOf("=");
    if(eq<=0)continue;
    const key=line.slice(0,eq).trim();
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)||process.env[key]!==undefined)continue;
    let value=line.slice(eq+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))){
      const quote=value[0];value=value.slice(1,-1);
      if(quote==='"')value=value.replace(/\\n/g,"\n").replace(/\\r/g,"\r").replace(/\\t/g,"\t").replace(/\\"/g,'"').replace(/\\\\/g,"\\");
    }else{
      // Treat a whitespace-prefixed # as a comment, while preserving # inside
      // passwords/URLs such as abc#123.
      value=value.replace(/\s+#.*$/," ").trim();
    }
    process.env[key]=value;
  }
  return true;
}
