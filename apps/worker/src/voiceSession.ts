type JoinOptions={guildId:string;channelId:string;shardId:number;deaf?:boolean};
const locks=new WeakMap<object,Map<string,Promise<any>>>();
/** Reuse a healthy same-channel player; retire orphaned/stale state before rejoining. */
export async function getOrJoinVoicePlayer(manager:any,options:JoinOptions,onRetire?:(player:any)=>void):Promise<any>{
 let guildLocks=locks.get(manager);if(!guildLocks){guildLocks=new Map();locks.set(manager,guildLocks);}
 const previous=guildLocks.get(options.guildId);
 const operation=(previous??Promise.resolve()).catch(()=>{}).then(async()=>{
  const player=manager.players.get(options.guildId),connection=manager.connections.get(options.guildId);
  if(player&&connection&&connection.channelId===options.channelId&&connection.state===1&&player.node?.state===1)return player;
  if(player||connection){if(player)onRetire?.(player);await manager.leaveVoiceChannel(options.guildId);}
  return manager.joinVoiceChannel(options);
 });
 guildLocks.set(options.guildId,operation);
 try{return await operation;}finally{if(guildLocks.get(options.guildId)===operation)guildLocks.delete(options.guildId);}
}
/** Late events from a retired player or replaced request cannot end the new track. */
export function isCurrentPlayerEvent(runtime:any,player:any,event:any){
 if(!runtime||runtime.player!==player)return false;
 const requestId=event?.track?.userData?.requestId;
 return !requestId||requestId===runtime.requestId;
}
