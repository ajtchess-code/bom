import {db,many,oneOrNone,pool} from '@bom/db';
import {redis,keys,publishWorkerCommand,getRoomState} from '@bom/redis';
import {randomUUID} from 'node:crypto';
export function registerMusicSessionTools(app:any,{guildId,requireMember,requirePermission,userId,ensureVoiceRoom}:any){
 const session=async(req:any,reply:any,permission='USE_MUSIC')=>{if(!(await requireMember(req,reply))?.member||!await requirePermission(req,reply,permission))return null;return ensureVoiceRoom(userId(req));};
 app.get('/v1/music/session-tools',async(req:any,reply:any)=>{const s=await session(req,reply);if(!s)return;
  const suggestions=await many<any>(`SELECT s.id,s.query,s.created_by,s.status,s.created_at,COUNT(v.user_id)::int votes,COALESCE(bool_or(v.user_id=$3),false) voted FROM music_session_suggestions s LEFT JOIN music_session_votes v ON v.suggestion_id=s.id WHERE s.guild_id=$1 AND s.room_id=$2 AND s.created_at>now()-INTERVAL '1 day' GROUP BY s.id ORDER BY votes DESC,s.created_at LIMIT 50`,[guildId,s.room.id,userId(req)]);
  const settings=await oneOrNone<any>('SELECT fair_queue FROM room_music_settings WHERE room_id=$1',[s.room.id]);return {fairQueue:settings?.fair_queue===true,suggestions};
 });
 app.put('/v1/music/fair-queue',async(req:any,reply:any)=>{const s=await session(req,reply,'MANAGE_QUEUE');if(!s)return;if(typeof req.body?.enabled!=='boolean')return reply.code(400).send({error:'invalid_setting'});await db.query('INSERT INTO room_music_settings(room_id,fair_queue) VALUES($1,$2) ON CONFLICT(room_id) DO UPDATE SET fair_queue=EXCLUDED.fair_queue',[s.room.id,req.body.enabled]);await redis.set(`music:room:${s.room.id}:fair-queue`,req.body.enabled?'1':'0','EX',60);return {ok:true};});
 app.post('/v1/music/session-suggestions',async(req:any,reply:any)=>{const s=await session(req,reply);if(!s)return;const query=String(req.body?.query??'').trim().slice(0,300);if(query.length<2)return reply.code(400).send({error:'query_required'});
  const count=await oneOrNone<any>(`SELECT COUNT(*)::int n FROM music_session_suggestions WHERE room_id=$1 AND created_by=$2 AND status='OPEN' AND created_at>now()-INTERVAL '1 day'`,[s.room.id,userId(req)]);if(count.n>=10)return reply.code(429).send({error:'suggestion_limit'});
  await db.query(`INSERT INTO music_session_suggestions(id,guild_id,room_id,created_by,query) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),guildId,s.room.id,userId(req),query]);return {ok:true};
 });
 app.put('/v1/music/session-suggestions/:id/vote',async(req:any,reply:any)=>{const s=await session(req,reply);if(!s)return;if(typeof req.body?.voted!=='boolean')return reply.code(400).send({error:'invalid_vote'});const x=await oneOrNone<any>(`SELECT id FROM music_session_suggestions WHERE id=$1 AND guild_id=$2 AND room_id=$3 AND status='OPEN' AND created_at>now()-INTERVAL '1 day'`,[req.params.id,guildId,s.room.id]);if(!x)return reply.code(404).send({error:'suggestion_not_found'});
  if(req.body.voted)await db.query('INSERT INTO music_session_votes(suggestion_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[x.id,userId(req)]);else await db.query('DELETE FROM music_session_votes WHERE suggestion_id=$1 AND user_id=$2',[x.id,userId(req)]);return {ok:true};
 });
 app.post('/v1/music/session-suggestions/:id/queue',async(req:any,reply:any)=>{const s=await session(req,reply,'MANAGE_QUEUE');if(!s)return;
  const tx=await pool.connect();try{await tx.query('BEGIN');const x=(await tx.query(`SELECT * FROM music_session_suggestions WHERE id=$1 AND guild_id=$2 AND room_id=$3 FOR UPDATE`,[req.params.id,guildId,s.room.id])).rows[0];if(!x){await tx.query('ROLLBACK');return reply.code(404).send({error:'not_found'});}if(x.status==='QUEUED'){await tx.query('COMMIT');return {ok:true};}
   // Stable action ID lets the controller suppress an immediate retry after an ambiguous response.
   await redis.xadd(keys.controllerCommands,'MAXLEN','~',2000,'*','payload',JSON.stringify({type:'QUEUE',roomId:s.room.id,requesterId:x.created_by,query:x.query,actionId:x.id}));await tx.query("UPDATE music_session_suggestions SET status='QUEUED' WHERE id=$1",[x.id]);await tx.query('COMMIT');return {ok:true};
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 });
 app.post('/v1/music/lyrics/retry',async(req:any,reply:any)=>{const s=await session(req,reply);if(!s)return;const state=await getRoomState(s.room.id);if(!state.workerId)return reply.code(409).send({error:'no_playback'});if(!await redis.set(`music:lyrics-manual:${s.room.id}`,'1','EX',30,'NX'))return reply.code(429).send({error:'retry_cooldown'});await publishWorkerCommand(state.workerId,{type:'LYRICS',roomId:s.room.id,guildId});return {ok:true};});
}
