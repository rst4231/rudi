'use strict';
const crypto=require('node:crypto');
const {importTelegramNote}=require('./shared-notes-telegram.cjs');
const NS='rudi-shared-notes-v1';
function legacyNoteInput(item){const raw=String(item.rawText||item.title||'');const parts=[raw];for(const value of [item.description,item.url,item.imageUrl])if(value&&!parts.some(p=>p.includes(value)))parts.push(value);if(item.category)parts.push('Категория: '+item.category);return {id:'legacy_'+crypto.createHash('sha256').update(String(item.id)).digest('hex').slice(0,32),actor:item.actor,title:item.title,text:parts.join('\n\n'),images:[],savedAt:item.createdAt,source:'saved-migration',allowMigration:true};}
async function migrateSavedNotes(o={}){
 const state=o.stateClient||require('./rudi-state-client.cjs').createRudiStateClient();const progress=(await state.getRecord(NS,'saved-migration-v1'))?.value;if(progress?.complete)return progress;
 const legacy=await(o.readLegacy?o.readLegacy():require('./smart-saves-store.cjs').readSmartSaves(o));
 if(!legacy.initialized&&!(legacy.items||[]).length)return {complete:true,processed:0,empty:true};
 const items=(legacy.items||[]).filter(x=>['Рустам','Диана'].includes(x.actor)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 const start=Math.max(0,Number(progress?.processed)||0),end=Math.min(items.length,start+5);
 for(const item of items.slice(start,end))await importTelegramNote(legacyNoteInput(item),{...o,stateClient:state});
 const latest=(await state.getRecord(NS,'saved-migration-v1'))?.value;const processed=Math.max(end,Number(latest?.processed)||0);const result={processed,total:items.length,complete:processed>=items.length};await state.set(NS,'saved-migration-v1',result);return result;
}
module.exports={legacyNoteInput,migrateSavedNotes};
