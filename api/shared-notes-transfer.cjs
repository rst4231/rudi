'use strict';
const crypto=require('node:crypto');
async function invoke(handler,req,body){let code=200,data;await handler({...req,method:'POST',body:{initData:req.body?.initData,...body}},{setHeader(){},status(n){code=n;return this},json(v){data=v}});if(code>=400||!data?.ok){const e=Error(data?.error||'transfer-failed');e.status=code;throw e;}return data;}
async function transferNote(req,authorization,o={}){
 const b=req.body||{},actor=authorization.actor,from=b.scope,to=from==='personal'?'shared':'personal';
 if(!['personal','shared'].includes(from)||typeof b.id!=='string'||!/^[\w-]{1,80}$/.test(b.id)||typeof b.expectedUpdatedAt!=='string'||!b.expectedUpdatedAt)throw Error('invalid-transfer');
 const personalFactory=o.personalFactory||require('./home-note.cjs').createHandler;
 const sharedFactory=o.sharedFactory||require('./shared-notes.cjs').createHandler;
 const personal=personalFactory(o.personalDeps||{}),shared=o.sharedHandler||sharedFactory(o),source=from==='personal'?personal:shared;
 const transferSource={actor,scope:from,id:b.id,updatedAt:b.expectedUpdatedAt};
 const id='transfer_'+crypto.createHash('sha256').update(JSON.stringify(transferSource)).digest('hex').slice(0,40);
 const target=to==='personal'?personal:shared;
 const get=async(handler,which,noteId)=>{try{return (await invoke(handler,req,{operation:which==='personal'?'get-history':'get',id:noteId})).note;}catch(e){if(e.status===404)return null;throw e;}};
 const existing=await get(target,to,id);
 const matches=existing&&!existing.deleted&&JSON.stringify(existing.transferSource)===JSON.stringify(transferSource);
 let note=await get(source,from,b.id);
 if(!note||note.deleted||!note.updatedAt){if(matches)return {id,scope:to,moved:true,repeated:true};throw Error('note-not-found');}
 if(note.updatedAt!==b.expectedUpdatedAt)throw Error('note-conflict');
 if(existing?.updatedAt&&!matches)throw Error('note-conflict');
 if(!matches){
  const importMetadata={...Object.fromEntries(['attachments','savedBy','savedAt','source'].filter(k=>note[k]!==undefined).map(k=>[k,note[k]])),transferSource};
  const writer=to==='personal'?personalFactory({...o.personalDeps,importMetadata}):sharedFactory({...o,importMetadata});
  await invoke(writer,req,{operation:'save',id,title:note.title||'Без названия',text:note.text||'',images:note.images||[],expectedUpdatedAt:''});
 }
 const owned=from==='personal'||note.author===actor;
 if(owned){
  try{await invoke(source,req,{operation:'delete',id:note.id,expectedUpdatedAt:b.expectedUpdatedAt});}
  catch(e){return {id,scope:to,moved:false,warning:'copy-kept',reason:e.message};}
  // Keep this person's selected home note pointing to its new location.
  try{const selected=await invoke(shared,req,{operation:'home-get'});if(selected.selection?.scope===from&&selected.selection.id===b.id)await invoke(shared,req,{operation:'home-set',id,scope:to});}catch(_){/* Both note copies remain safe even if the home preference is unavailable. */}
 }
 return {id,scope:to,moved:owned,copied:!owned};
}
module.exports={transferNote,invoke};
