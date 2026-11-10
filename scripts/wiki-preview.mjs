import Fastify from 'fastify';
import {registerGameWiki} from '../apps/api/src/gameWiki.ts';
const app=Fastify();registerGameWiki(app,{requireMember:async()=>({member:true}),requireAdmin:async(_req,reply)=>{reply.code(403).send({error:'preview_read_only'});return false;}});
await app.listen({port:4127,host:'127.0.0.1'});console.log('Wiki preview data on http://127.0.0.1:4127');
