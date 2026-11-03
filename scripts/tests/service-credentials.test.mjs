import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgresql://offline:offline@127.0.0.1:1/offline';
const {pool,saveOpenAIKey,getOpenAIKey,openAICredentialStatus,removeOpenAIKey}=await import('../../packages/db/dist/index.js');
test('dashboard credentials encrypt, authenticate, rotate, and never disclose the key in status',async()=>{
 const original=pool.query;let row=null;
 pool.query=async(sql,args=[])=>{if(sql.startsWith('INSERT'))row={ciphertext:args[0],updated_at:new Date()};if(sql.startsWith('DELETE'))row=null;return {rows:row?[row]:[],rowCount:1}};
 try{process.env.INTERNAL_API_TOKEN='offline-stable-encryption-secret-at-least-32';process.env.OPENAI_API_KEY='environment-fallback-key';assert.equal(await getOpenAIKey(),'environment-fallback-key');const key='sk-offline-test-secret-123456789';await saveOpenAIKey(key,'captain');assert.ok(!row.ciphertext.includes(key));assert.equal(await getOpenAIKey(),key);assert.ok(!JSON.stringify(await openAICredentialStatus()).includes(key));const first=row.ciphertext;await saveOpenAIKey(key,'captain');assert.notEqual(first,row.ciphertext,'unique IV for each save');row.ciphertext=row.ciphertext.slice(0,-4)+'AAAA';await assert.rejects(getOpenAIKey());await removeOpenAIKey();assert.equal(await getOpenAIKey(),'environment-fallback-key');delete process.env.INTERNAL_API_TOKEN;await assert.rejects(()=>saveOpenAIKey(key,'captain'),/encryption_not_configured/);assert.equal(row,null);}finally{pool.query=original;delete process.env.OPENAI_API_KEY;delete process.env.INTERNAL_API_TOKEN;await pool.end();}
});
