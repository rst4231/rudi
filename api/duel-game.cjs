'use strict';
/* Two-player tic-tac-toe. Durable D1 state and exclusive short-lived mutation lease. */
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NS='rudi-duel-tictactoe-v1',ROOM='pair',LOCK='pair-lock';
const PRESENCE='online:',PRESENCE_TTL=75,PRESENCE_ACTIVE_MS=47000;
const ROLES={'Рустам':'X','Диана':'O'};
const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const TTL=60*60*24*90;
const defaultRoom=()=>({board:Array(9).fill(''),status:'waiting',turn:'Рустам',winner:'',endedBy:'',round:0,version:0,updatedAt:'',lastStarter:''});
function normalizeRoom(raw){
 const room=raw&&typeof raw==='object'?raw:{};
 return {
  board:Array.isArray(room.board)&&room.board.length===9?room.board.map(x=>x==='X'||x==='O'?x:''):Array(9).fill(''),
  status:['waiting','playing','won','draw','ended'].includes(room.status)?room.status:'waiting',
  turn:room.turn==='Диана'?'Диана':'Рустам',
  winner:room.winner==='Диана'||room.winner==='Рустам'?room.winner:'',
  endedBy:room.endedBy==='Диана'||room.endedBy==='Рустам'?room.endedBy:'',
  round:Number.isSafeInteger(room.round)&&room.round>=0?room.round:0,
  version:Number.isSafeInteger(room.version)&&room.version>=0?room.version:0,
  updatedAt:String(room.updatedAt||''),
  lastStarter:room.lastStarter==='Диана'?'Диана':room.lastStarter==='Рустам'?'Рустам':''
 };
}
function nextMove(state,actor,operation,index,now=new Date().toISOString()){
 if(!ROLES[actor])throw Error('duel-forbidden');
 const s=normalizeRoom(state);
 if(operation==='start'){
  if(s.status==='playing')return {ok:false,error:'duel-in-progress',room:s};
  const starter=s.lastStarter==='Рустам'?'Диана':'Рустам';
  return {ok:true,room:{...defaultRoom(),status:'playing',turn:starter,lastStarter:starter,round:s.round+1,version:s.version+1,updatedAt:now}};
 }
 if(operation==='end'){
  if(s.status!=='playing')return {ok:false,error:'duel-not-playing',room:s};
  return {ok:true,room:{...s,status:'ended',turn:'',winner:'',endedBy:actor,version:s.version+1,updatedAt:now}};
 }
 if(operation!=='move')throw Error('duel-operation-invalid');
 if(s.status!=='playing')return {ok:false,error:'duel-not-playing',room:s};
 if(s.turn!==actor)return {ok:false,error:'duel-not-your-turn',room:s};
 if(!Number.isInteger(index)||index<0||index>8||s.board[index])return {ok:false,error:'duel-cell-invalid',room:s};
 const board=[...s.board];board[index]=ROLES[actor];
 const won=LINES.some(line=>line.every(cell=>board[cell]===ROLES[actor]));
 const draw=!won&&board.every(Boolean);
 return {ok:true,room:{...s,board,turn:won||draw?'':actor==='Рустам'?'Диана':'Рустам',
  status:won?'won':draw?'draw':'playing',winner:won?actor:'',version:s.version+1,updatedAt:now}};
}
function validSession(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{8,90}$/.test(value)?value:''}
async function readPresence(cache,now){
 const at=Date.parse(now);
 const actors=Object.keys(ROLES);
 const records=await Promise.all(actors.map(actor=>cache.get(PRESENCE+actor)));
 return Object.fromEntries(actors.map((actor,i)=>{
  const ms=Date.parse(records[i]?.seenAt||'');
  return [actor,Number.isFinite(ms)&&Number.isFinite(at)&&ms<=at&&at-ms<PRESENCE_ACTIVE_MS];
 }));
}
function notifyGameStart(actor,round,deps={}){
 const recipient=actor==='Рустам'?'Диана':'Рустам';
 const verb=actor==='Диана'?'начала':'начал';
 const send=deps.sendPushImpl||((to,payload)=>require('./web-push.cjs').sendPushNotification(to,payload));
 const promise=Promise.resolve().then(()=>send(recipient,{
  title:'🎮 Крестики-нолики',
  body:actor+' '+verb+' новую партию. Заходи играть!',
  tag:'rudi-duel-start-'+round,
  url:'/?tab=home&game=duel',
  id:'rudi-duel-start-'+round+'-'+recipient
 })).catch(error=>{console.warn('RUDI_DUEL_PUSH_WARN',String(error?.message||error));return {sent:false}});
 const waitUntil=deps.waitUntilImpl||((task)=>require('@vercel/functions').waitUntil(task));
 try{waitUntil(promise)}catch(error){console.warn('RUDI_DUEL_PUSH_BACKGROUND_WARN',String(error?.message||error))}
 return promise;
}
function createHandler(deps={}){
 const auth=deps.authorizeRequest||authorizeRequest;
 const cache=deps.cache||createStrictRuntimeCache({namespace:NS,...(deps.cacheOptions||{})});
 const now=deps.now||(()=>new Date().toISOString());
 return async function duelHandler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  let actor;
  try{actor=auth(req,body.initData).actor}
  catch(error){const code=statusForError(error);return res.status(code).json({ok:false,error:code>=500?'server-error':String(error.message||error)})}
  if(!ROLES[actor])return res.status(403).json({ok:false,error:'duel-forbidden'});
  const operation=String(body.operation||'get');
  if(!['get','start','move','end','leave'].includes(operation))return res.status(400).json({ok:false,error:'duel-operation-invalid'});
  const sessionId=validSession(body.sessionId);
  if(operation==='leave'){
   if(!sessionId)return res.status(400).json({ok:false,error:'duel-session-invalid'});
   try{
    const key=PRESENCE+actor;
    const previous=await cache.get(key);
    if(previous?.sessionId===sessionId)await cache.delete(key);
    return res.status(200).json({ok:true,actor,presence:await readPresence(cache,now())});
   }catch(error){console.error('RUDI_DUEL_PRESENCE_LEAVE_ERROR',String(error?.message||error));return res.status(503).json({ok:false,error:'duel-store-unavailable'})}
  }
  if(operation==='get'){
   try{
    // Presence heartbeat piggybacks on the existing 6.5s room poll.
    // Client writes every ~22s; remaining polls are read-only.
    if(sessionId&&body.active===true)
     await cache.set(PRESENCE+actor,{sessionId,seenAt:now()},{ttl:PRESENCE_TTL});
    const [room,presence]=await Promise.all([cache.get(ROOM),readPresence(cache,now())]);
    return res.status(200).json({ok:true,actor,room:normalizeRoom(room),presence});
   }catch(error){console.error('RUDI_DUEL_READ_ERROR',String(error?.message||error));return res.status(503).json({ok:false,error:'duel-store-unavailable'})}
  }
  if(operation==='move'&&(!Number.isInteger(body.index)||body.index<0||body.index>8))
   return res.status(400).json({ok:false,error:'duel-cell-invalid'});
  let acquired=false;
  try{
   acquired=await cache.setIfAbsent(LOCK,{actor,at:now()},{ttl:20});
   if(!acquired)return res.status(409).json({ok:false,error:'duel-busy'});
   const current=normalizeRoom(await cache.get(ROOM));
   // Concurrent or stale device clicks cannot overwrite newer board versions.
   if((operation==='move'||operation==='end')&&body.version!==current.version)
    return res.status(409).json({ok:false,error:'duel-outdated',room:current});
   const outcome=nextMove(current,actor,operation,body.index,now());
   if(!outcome.ok)return res.status(409).json(outcome);
   await cache.set(ROOM,outcome.room,{ttl:TTL});
   // Only a successful durable new round triggers partner push once.
   if(operation==='start')notifyGameStart(actor,outcome.room.round,deps);
   return res.status(200).json({ok:true,actor,room:outcome.room});
  }catch(error){
   console.error('RUDI_DUEL_WRITE_ERROR',String(error?.message||error));
   return res.status(503).json({ok:false,error:'duel-store-unavailable'});
  }finally{if(acquired)try{await cache.delete(LOCK)}catch(error){console.warn('RUDI_DUEL_UNLOCK_WARN',String(error?.message||error))}}
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.normalizeRoom=normalizeRoom;
module.exports.nextMove=nextMove;
module.exports.NS=NS;
module.exports.readPresence=readPresence;
module.exports.validSession=validSession;
module.exports.notifyGameStart=notifyGameStart;
