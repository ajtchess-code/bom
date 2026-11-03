import { readFile,readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { pool } from "./index.js";

const here=dirname(fileURLToPath(import.meta.url));
const migrationDir=join(here,"../migrations");
const files=(await readdir(migrationDir)).filter(name=>/^\d{3}_.+\.sql$/i.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
if(!files.length)throw new Error(`No SQL migrations found in ${migrationDir}`);

const client=await pool.connect();
try{
  await client.query(`SELECT pg_advisory_lock(hashtext('bom-schema-migrations'))`);
  await client.query(`CREATE TABLE IF NOT EXISTS bom_schema_migrations(
    filename text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  let applied=0,skipped=0;
  for(const filename of files){
    const sql=await readFile(join(migrationDir,filename),"utf8");
    const checksum=createHash("sha256").update(sql).digest("hex");
    const existing=await client.query<{checksum:string}>(`SELECT checksum FROM bom_schema_migrations WHERE filename=$1`,[filename]);
    if(existing.rowCount){
      if(existing.rows[0]?.checksum!==checksum){
        console.warn(`[migration] ${filename} checksum differs from the version previously recorded; leaving the applied database migration unchanged.`);
      }
      skipped++;
      continue;
    }
    console.log(`[migration] applying ${filename}`);
    await client.query("BEGIN");
    try{
      // Historical migrations are intentionally idempotent. On installations that predate
      // the migration ledger, replaying them safely establishes the ledger without a
      // destructive baseline operation.
      await client.query(sql);
      await client.query(`INSERT INTO bom_schema_migrations(filename,checksum) VALUES($1,$2)`,[filename,checksum]);
      await client.query("COMMIT");
      applied++;
    }catch(error){
      await client.query("ROLLBACK").catch(()=>{});
      throw Object.assign(new Error(`Migration ${filename} failed: ${error instanceof Error?error.message:String(error)}`),{cause:error});
    }
  }
  console.log(`PostgreSQL migrations complete (${applied} applied, ${skipped} already recorded, ${files.length} total)`);
}catch(error){
  throw error;
}finally{
  await client.query(`SELECT pg_advisory_unlock(hashtext('bom-schema-migrations'))`).catch(()=>{});
  client.release();
  await pool.end();
}
