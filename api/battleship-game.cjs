'use strict';
/* RUDI: authenticated shared sea-battle, never reveal opponent ships mid-game. */
const crypto=require('node:crypto');
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NS='rudi-sea-battle-v1',ROOM='pair',LOCK='pair-lock',TTL=86400*90;
const PLAYERS=['Рустам','Диана'],SIZE=7,LENGTHS=[3,2,2];
const other=actor=>actor===PLAYERS[0]?PLAYERS[1]:PLAYERS[0];
function ships(random=crypto.randomInt){
 const occupied=new Set(),cells=[];
 for(const length of LENGTHS){
  let placed=false;
  for(let trial=0;trial<500&&!placed;trial++){
   const horizontal=random(2)===0;
   const row=random(horizontal?SIZE:SIZE-length+1);
   const col=random(horizontal?SIZE-length+1:SIZE);
   const ship=Array.from({length},(_,i)=>(row+(horizontal?0:i))*SIZE+col+(horizontal?i:0));
   const safe=ship.every(cell=>{
    const r=Math.floor(cell/SIZE),c=cell%SIZE;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)
     if(occupied.has((r+dr)*SIZE+c+dc)&&r+dr>=0&&r+dr<SIZE&&c+dc>=0&&c+dc<SIZE)return false;
    return true;
   });
   if(!safe)continue;
   ship.forEach(i=>{occupied.add(i);cells.push(i)});
   placed=true;
  }
  if(!placed)throw Error('battle-ship-placement-failed');
 }
 return cells;
}
function initial(){
 return {status:'waiting',round:0,version:0,turn:'',winner:'',endedBy:'',updatedAt:'',
  lastStarter:'',ships:{'Рустам':[],'Диана':[]},shots:{'Рустам':[],'Диана':[]}};
}
function normalize(raw){
 const s=raw&&typeof raw==='object'?raw:{},def=initial();
 const getBoard=actor=>Array.isArray(s.ships?.[actor])?s.ships[actor].filter(i=>Number.isInteger(i)&&i>=0&&i<49).slice(0,7):[];
 const getShots=actor=>Array.isArray(s.shots?.[actor])?s.shots[actor].filter(x=>x&&Number.isInteger(x.cell)&&x.cell>=0&&x.cell<49&&typeof x.hit==='boolean').slice(0,49):[];
 return {...def,status:['waiting','playing','won','ended'].includes(s.status)?s.status:'waiting',
  round:Number.isSafeInteger(s.round)&&s.round>=0?s.round:0,
  version:Number.isSafeInteger(s.version)&&s.version>=0?s.version:0,
  turn:PLAYERS.includes(s.turn)?s.turn:'',winner:PLAYERS.includes(s.winner)?s.winner:'',
  endedBy:PLAYERS.includes(s.endedBy)?s.endedBy:'',
  lastStarter:PLAYERS.includes(s.lastStarter)?s.lastStarter:'',
  updatedAt:String(s.updatedAt||''),
  ships:Object.fromEntries(PLAYERS.map(a=>[a,getBoard(a)])),
  shots:Object.fromEntries(PLAYERS.map(a=>[a,getShots(a)]))};
}
function publicRoom(raw,actor){
 const s=normalize(raw),enemy=other(actor),done=s.status!=='playing';
 return {status:s.status,round:s.round,version:s.version,turn:s.turn,winner:s.winner,
  endedBy:s.endedBy,updatedAt:s.updatedAt,
  ownShips:s.ships[actor],ownShots:s.shots[actor],enemyShots:s.shots[enemy],
  opponentShips:done?s.ships[enemy]:undefined};
}
function nextMove(raw,actor,operation,index,now=new Date().toISOString(),makeShips=ships){
 if(!PLAYERS.includes(actor))throw Error('battle-forbidden');
 const s=normalize(raw);
 if(operation==='start'){
  if(s.status==='playing')return {ok:false,error:'battle-in-progress',room:s};
  const starter=s.lastStarter?other(s.lastStarter):'Рустам';
  return {ok:true,room:{...initial(),round:s.round+1,version:s.version+1,
   status:'playing',turn:starter,lastStarter:starter,updatedAt:now,
   ships:{'Рустам':makeShips(),'Диана':makeShips()}}};
 }
 if(operation==='end'){
  if(s.status!=='playing')return {ok:false,error:'battle-not-playing',room:s};
  return {ok:true,room:{...s,status:'ended',turn:'',endedBy:actor,version:s.version+1,updatedAt:now}};
 }
 if(operation!=='move')throw Error('battle-operation-invalid');
 if(s.status!=='playing')return {ok:false,error:'battle-not-playing',room:s};
 if(s.turn!==actor)return {ok:false,error:'battle-not-your-turn',room:s};
 if(!Number.isInteger(index)||index<0||index>=49||
  s.shots[actor].some(x=>x.cell===index))return {ok:false,error:'battle-cell-invalid',room:s};
 const opponent=other(actor),hit=s.ships[opponent].includes(index);
 const shots={...s.shots,[actor]:[...s.shots[actor],{cell:index,hit}]};
 const won=shots[actor].filter(x=>x.hit).length===s.ships[opponent].length;
 return {ok:true,room:{...s,shots,version:s.version+1,updatedAt:now,
  status:won?'won':'playing',turn:won?'':opponent,winner:won?actor:''}};
}
function notification(actor,room,operation,deps={}){
 const recipient=other(actor),send=deps.sendPushImpl||((to,payload)=>require('./web-push.cjs').sendPushNotification(to,payload));
 const title='Морской бой',body=operation==='start'?actor+' начинает игру. Заходи!':'Твой ход! '+actor+' сделал'+(actor==='Диана'?'а':'')+' выстрел.';
 const task=Promise.resolve().then(()=>send(recipient,{title,body,tag:'rudi-battle-'+room.round+'-'+room.version,
  id:'rudi-battle-'+room.round+'-'+room.version+'-'+recipient,url:'/?tab=home&game=battleship'}))
  .catch(e=>{console.warn('RUDI_BATTLE_PUSH_WARN',String(e?.message||e));return null});
 const waitUntil=deps.waitUntilImpl||((p)=>require('@vercel/functions').waitUntil(p));
 try{waitUntil(task)}catch(_){}
 return task;
}
function createHandler(deps={}){
 const cache=deps.cache||createStrictRuntimeCache({namespace:NS,...(deps.cacheOptions||{})});
 const auth=deps.authorizeRequest||authorizeRequest,now=deps.now||(()=>new Date().toISOString());
 return async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  let actor;
  try{actor=auth(req,body.initData).actor}
  catch(e){const code=statusForError(e);return res.status(code).json({ok:false,error:code>=500?'server-error':String(e.message||e)})}
  if(!PLAYERS.includes(actor))return res.status(403).json({ok:false,error:'battle-forbidden'});
  const operation=String(body.operation||'get');
  if(!['get','start','move','end'].includes(operation))return res.status(400).json({ok:false,error:'battle-operation-invalid'});
  try{
   if(operation==='get'){
    return res.status(200).json({ok:true,room:publicRoom(await cache.get(ROOM),actor),actor});
   }
   if(operation==='move'&&(!Number.isInteger(body.index)||body.index<0||body.index>=49))
    return res.status(400).json({ok:false,error:'battle-cell-invalid'});
   let locked=false;
   try{
    locked=await cache.setIfAbsent(LOCK,{actor,at:now()},{ttl:20});
    if(!locked)return res.status(409).json({ok:false,error:'battle-busy'});
    const current=normalize(await cache.get(ROOM));
    if((operation==='move'||operation==='end')&&current.version!==body.version)
     return res.status(409).json({ok:false,error:'battle-outdated',room:publicRoom(current,actor)});
    const result=nextMove(current,actor,operation,body.index,now(),deps.makeShips||ships);
    if(!result.ok)return res.status(409).json({ok:false,error:result.error,room:publicRoom(result.room,actor)});
    await cache.set(ROOM,result.room,{ttl:TTL});
    if(operation==='start'||operation==='move'&&result.room.status==='playing')
     notification(actor,result.room,operation,deps);
    return res.status(200).json({ok:true,actor,room:publicRoom(result.room,actor)});
   }finally{if(locked)try{await cache.delete(LOCK)}catch(_){}}
  }catch(e){console.error('RUDI_BATTLE_ERROR',String(e?.message||e));return res.status(503).json({ok:false,error:'battle-store-unavailable'})}
 };
}
module.exports=createHandler();
Object.assign(module.exports,{NS,ROOM,ships,initial,normalize,publicRoom,nextMove,createHandler});