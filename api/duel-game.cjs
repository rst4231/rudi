'use strict';
/* Two-player tic-tac-toe. Durable D1 state and exclusive short-lived mutation lease. */
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NS='rudi-duel-tictactoe-v1',ROOM='pair',LOCK='pair-lock';
const ROLES={'Рустам':'X','Диана':'O'};
const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const TTL=60*60*24*90;
const defaultRoom=()=>({board:Array(9).fill(''),status:'waiting',turn:'Рустам',winner:'',round:0,version:0,updatedAt:'',lastStarter:''});
function normalizeRoom(raw){
 const room=raw&&typeof raw==='object'?raw:{};
 return {
  board:Array.isArray(room.board)&&room.board.length===9?room.board.map(x=>x==='X'||x==='O'?x:''):Array(9).fill(''),
  status:['waiting','playing','won','draw'].includes(room.status)?room.status:'waiting',
  turn:room.turn==='Диана'?'Диана':'Рустам',
  winner:room.winner==='Диана'||room.winner==='Рустам'?room.winner:'',
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
  if(!['get','start','move'].includes(operation))return res.status(400).json({ok:false,error:'duel-operation-invalid'});
  if(operation==='get'){
   try{return res.status(200).json({ok:true,actor,room:normalizeRoom(await cache.get(ROOM))})}
   catch(error){console.error('RUDI_DUEL_READ_ERROR',String(error?.message||error));return res.status(503).json({ok:false,error:'duel-store-unavailable'})}
  }
  if(operation==='move'&&(!Number.isInteger(body.index)||body.index<0||body.index>8))
   return res.status(400).json({ok:false,error:'duel-cell-invalid'});
  let acquired=false;
  try{
   acquired=await cache.setIfAbsent(LOCK,{actor,at:now()},{ttl:20});
   if(!acquired)return res.status(409).json({ok:false,error:'duel-busy'});
   const current=normalizeRoom(await cache.get(ROOM));
   // Concurrent or stale device clicks cannot overwrite newer board versions.
   if(operation==='move'&&body.version!==current.version)
    return res.status(409).json({ok:false,error:'duel-outdated',room:current});
   const outcome=nextMove(current,actor,operation,body.index,now());
   if(!outcome.ok)return res.status(409).json(outcome);
   await cache.set(ROOM,outcome.room,{ttl:TTL});
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
