import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
const pg=new PGlite(),root=new URL('../../packages/db/migrations/',import.meta.url);let count=0;
try{for(const file of (await readdir(root)).filter(n=>/^\d{3}_.+\.sql$/.test(n)).sort()){try{await pg.exec(await readFile(new URL(file,root),'utf8'));count++;}catch(e){throw Error(file+': '+e.message);}}await pg.exec(await readFile(new URL('100_community_operations.sql',root),'utf8'));console.log(`${count} migrations applied successfully; v4.3.7 migration is idempotent.`);}finally{await pg.close();}
