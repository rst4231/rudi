'use strict';
const NS='rudi-shared-notes-v1';
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x);
function validate(body){
 if(!validId(body.id)||typeof body.title!=='string'||!body.title.trim()||body.title.length>100||typeof body.text!=='string'||body.text.length>16000)throw Error('invalid-note');
 const images=body.images===undefined?[]:body.images;
 if(!Array.isArray(images)||images.length>3||images.some(x=>typeof x!=='string'||x.length>420000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(x)))throw Error('invalid-images');
 return {title:body.title.trim(),text:body.text.replace(/\r\n?/g,'\n'),images};
}
function createHandler(deps={}){
 const auth=deps.authorize||((req,init)=>require('./rudi-request-auth.cjs').authorizeRequest(req,init));
 let client=deps.state;
 const state=()=>client||(client=require('./rudi-state-client.cjs').createRudiStateClient());
 const now=deps.now||(()=>new Date().toISOString());
 const read=async key=>(await state().getRecord(NS,key))?.value;
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  let locked=false;
  try{
   const b=req.body||{}, authorization=auth(req,b.initData),{actor}=authorization;
   if(!['Рустам','Диана'].includes(actor))throw Error('rudi-access-denied');
   const op=b.operation||'list';
   if(op==='transfer'){return res.status(200).json({ok:true,...await require('./shared-notes-transfer.cjs').transferNote(req,authorization,{...deps,sharedHandler:createHandler(deps)})});}
   if(op==='migrate-saved'){const migration=await require('./shared-notes-migration.cjs').migrateSavedNotes({...deps,stateClient:state()});return res.status(200).json({ok:true,migration});}
   if(op==='list'){
    const index=(await read('index'))?.notes||[];
    if(b.expanded!==true)return res.status(200).json({ok:true,notes:index});
    const notes=await Promise.all(index.map(async row=>{const note=await read('note:'+row.id);if(!note||note.deleted)return null;const {images,...textNote}=note;return {...textNote,images:[],imageCount:(images||[]).length};}));
    return res.status(200).json({ok:true,notes:notes.filter(Boolean)});
   }
   if(op==='home-get')return res.status(200).json({ok:true,selection:await read('home:'+actor)||null});
   if(op==='home-set'){
    if(!validId(b.id)||!['personal','shared'].includes(b.scope))throw Error('invalid-note');
    await state().set(NS,'home:'+actor,{id:b.id,scope:b.scope});
    return res.status(200).json({ok:true});
   }
   if(!validId(b.id))throw Error('invalid-note');
   if(op==='get'){
    const note=await read('note:'+b.id);
    return note&&!note.deleted?res.status(200).json({ok:true,note}):res.status(404).json({ok:false,error:'note-not-found'});
   }
   if(op==='send-attachment'){const note=await read('note:'+b.id);if(!note||note.deleted)return res.status(404).json({ok:false,error:'note-not-found'});try{const result=await require('./shared-notes-telegram.cjs').sendNoteAttachment(note,b.attachmentId,authorization,state(),deps);return res.status(200).json({ok:true,...result});}catch(e){return res.status(e.message==='attachment-not-found'?404:503).json({ok:false,error:e.message==='telegram-recipient-missing'?'telegram-recipient-missing':'attachment-unavailable'});}}
   if(!['save','delete'].includes(op))throw Error('invalid-operation');
   const clean=op==='save'?validate(b):null;
   locked=await state().setIfAbsent(NS,'write-lock',{locked:true},{ttl:90});
   if(!locked)return res.status(503).json({ok:false,error:'note-busy'});
   const previous=await read('note:'+b.id);
   if(previous?.deleted)return res.status(409).json({ok:false,error:'note-deleted'});
   if(op==='delete'&&(!previous||previous.author!==actor))return res.status(403).json({ok:false,error:'note-delete-forbidden'});
   if(String(previous?.updatedAt||'')!==String(b.expectedUpdatedAt||''))return res.status(409).json({ok:false,error:'note-conflict'});
   const index=(await read('index'))?.notes||[];
   if(op==='save'&&!previous&&index.length>=600)return res.status(400).json({ok:false,error:'note-limit'});
   let updatedAt=now();
   if(previous?.updatedAt&&updatedAt<=previous.updatedAt)updatedAt=new Date(Date.parse(previous.updatedAt)+1).toISOString();
   const retained=Object.fromEntries(['savedBy','savedAt','source','attachments','transferSource'].filter(key=>previous?.[key]!==undefined).map(key=>[key,previous[key]]));
   const note=op==='delete'?{id:b.id,deleted:true,updatedAt}:{id:b.id,...clean,...retained,...(deps.importMetadata||{}),author:previous?.author||actor,updatedBy:actor,createdAt:previous?.createdAt||updatedAt,updatedAt};
   // Register new IDs first so a retry after a partial failure remains discoverable.
   if(op==='save'&&!index.some(x=>x.id===b.id))await state().set(NS,'index',{notes:[...index,{id:b.id,title:clean.title,updatedAt,author:actor}]});
   await state().set(NS,'note:'+b.id,note);
   const latest=(await read('index'))?.notes||[];
   const remaining=latest.filter(x=>x.id!==b.id);
   if(op==='save')remaining.unshift({id:note.id,title:note.title,preview:note.text.slice(0,180),author:note.author,updatedBy:actor,updatedAt,imageCount:note.images.length});
   await state().set(NS,'index',{notes:remaining});
   return res.status(200).json({ok:true,note});
  }catch(e){
   const error=String(e?.message||e);
   const status=error.startsWith('invalid-')?400:error==='note-conflict'?409:error==='note-not-found'?404:error==='rudi-access-denied'?403:require('./rudi-request-auth.cjs').statusForError(e);
   return res.status(status).json({ok:false,error:status>=500?'storage-unavailable':error});
  }finally{if(locked)await state().remove(NS,'write-lock').catch(()=>{});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.validate=validate;
