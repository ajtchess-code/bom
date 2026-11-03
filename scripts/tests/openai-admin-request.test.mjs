import test from 'node:test';
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
import Fastify from 'fastify';
process.env.DATABASE_URL='postgresql://offline:offline@127.0.0.1:1/offline';
const {forwardBody}=await tsImport('../../apps/dashboard/lib/forwardBody.ts',import.meta.url);
const {registerCommunityRoutes}=await import('../../apps/api/dist/community.js');
const {pool}=await import('../../packages/db/dist/index.js');
test('proxy omits JSON headers on empty actions and preserves actual JSON and upload bodies',()=>{
 assert.deepEqual(forwardBody('POST','application/json',''),{body:undefined,contentType:null});assert.deepEqual(forwardBody('DELETE','application/json; charset=utf-8',''),{body:undefined,contentType:null});assert.deepEqual(forwardBody('POST','application/json','{}'),{body:'{}',contentType:'application/json'});assert.deepEqual(forwardBody('POST','multipart/form-data; boundary=qa','bytes'),{body:'bytes',contentType:'multipart/form-data; boundary=qa'});assert.equal(forwardBody('PUT','application/json',' ').body,' ');
});
test('real Fastify OpenAI test and removal actions accept normalized bodyless requests',async()=>{
 const oldQuery=pool.query,oldFetch=globalThis.fetch;let admin=true,called=0;process.env.OPENAI_API_KEY='sk-offline-test-key-1234567890';pool.query=async()=>({rows:[],rowCount:0});globalThis.fetch=async()=>{called++;return Response.json({data:[]})};const app=Fastify();registerCommunityRoutes(app,{guildId:'123456789012345678',userId:()=> '234567890123456789',requireAdmin:async(req,reply)=>admin?true:(reply.code(403).send({error:'forbidden'}),false)});
 try{const broken=await app.inject({method:'POST',url:'/v1/community/openai/test',headers:{'content-type':'application/json'}});assert.equal(broken.statusCode,400);assert.equal(broken.json().code,'FST_ERR_CTP_EMPTY_JSON_BODY');assert.equal(called,0);const shape=forwardBody('POST','application/json','');const r=await app.inject({method:'POST',url:'/v1/community/openai/test',headers:shape.contentType?{'content-type':shape.contentType}:{},payload:shape.body});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().ok,true);assert.equal(called,1);const removed=await app.inject({method:'DELETE',url:'/v1/community/openai'});assert.equal(removed.statusCode,200);admin=false;const denied=await app.inject({method:'POST',url:'/v1/community/openai/test'});assert.equal(denied.statusCode,403);assert.equal(called,1);}finally{pool.query=oldQuery;globalThis.fetch=oldFetch;delete process.env.OPENAI_API_KEY;await app.close();await pool.end();}
});
