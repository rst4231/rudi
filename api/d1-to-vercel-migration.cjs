const crypto=require('node:crypto');
const {createD1StateClient}=require('./d1-state-client.cjs');
const {createVercelStateClient}=require('./vercel-state-client.cjs');
const {STORAGE_META_NAMESPACE,STORAGE_META_KEY,clearRudiStateModeCache}=require('./rudi-state-client.cjs');
const MIGRATION_ID='d1-to-vercel-2026-10-05-v1';
const NAMESPACES=Object.freeze(['rudi-activity-journal-v1','rudi-browser-auth-v1','rudi-camera-status-v1','rudi-car-state-v1','rudi-control-plane-v1','rudi-daily-question-history-v1','rudi-daily-question-v1','rudi-date-generation-limit-v1','rudi-fasting-v1','rudi-feed-v1','rudi-for-di-feed-v1','rudi-for-di-private-v1','rudi-holiday-calendar-v1','rudi-holiday-highlights-v1','rudi-labor-code-v1','rudi-lulu-v1','rudi-market-ticker-v2','rudi-mood-analysis-v4','rudi-morning-summary-v1','rudi-partner-message-v1','rudi-partner-notifications-v1','rudi-private-cycle-v1','rudi-product-list-v1','rudi-reactions-v1','rudi-saved-items-v1','rudi-score-v1','rudi-shared-album-v1','rudi-shared-task-meta-v1','rudi-smart-saves-v1','rudi-supplements-v1','rudi-system-v1','rudi-ticktick-checklist-audit','rudi-ticktick-oauth-v1','rudi-topic-maintenance-v1','rudi-ui-preferences-v1','rudi-wishlist-v1','rudi-work-calendar-v1']);
function canon(v){if(Array.isArray(v))return v.map(canon);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])]));return v}
function content(r){return{namespace:String(r?.namespace||''),key:String(r?.key||''),value:r?.value,tags:[...new Set((Array.isArray(r?.tags)?r.tags:[]).map(String))].sort(),expires_at:r?.expires_at?new Date(r.expires_at).toISOString():null}}
function checksum(rows){return crypto.createHash('sha256').update(JSON.stringify(canon((rows||[]).map(content).sort((a,b)=>(a.namespace+'\0'+a.key).localeCompare(b.namespace+'\0'+b.key))))).digest('hex')}
function summary(rows){const x={};for(const r of rows||[])x[r.namespace]=(x[r.namespace]||0)+1;return Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)))}
const migrationToken=s=>crypto.createHmac('sha256',String(s||'')).update('rudi-storage-migrate-v1').digest('base64url');
function safeEqual(a,b){a=Buffer.from(String(a||''));b=Buffer.from(String(b||''));return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b)}
function isMigrationAuthorized(req,env=process.env){const s=String(env.RUDI_ADMIN_SECRET||'').trim();return Boolean(s)&&safeEqual(req?.query?.token,migrationToken(s))}
async function sourceRows(source){const all=[];for(const ns of NAMESPACES)for(const r of await source.list(ns)||[])all.push(r);return all}
async function destRows(dest){return(await dest.allRows()).filter(r=>!(r.namespace===STORAGE_META_NAMESPACE&&r.key===STORAGE_META_KEY))}
async function upsert(dest,rows){let n=0;for(const r of rows){await dest.setRecord(r);n++}return n}
function checks(rows){const s=summary(rows),auth=rows.filter(r=>r.namespace==='rudi-browser-auth-v1'),states=auth.map(r=>r?.value?.pin_record?.__rudi_app_state||{});return{browserAuth:Number(s['rudi-browser-auth-v1']||0),reactions:Number(s['rudi-reactions-v1']||0),score:Number(s['rudi-score-v1']||0),sharedTaskMeta:Number(s['rudi-shared-task-meta-v1']||0),pushActors:states.filter(v=>v?.['push-subscriptions:v1']).length,habitActors:states.filter(v=>v?.['habits:v1']).length}}
async function setPhase(dest,p,extra={}){const value={migrationId:MIGRATION_ID,phase:p,verified:p==='ready',updatedAt:new Date().toISOString(),...extra};await dest.setRecord({namespace:STORAGE_META_NAMESPACE,key:STORAGE_META_KEY,value,tags:['rudi-storage-primary'],expires_at:null});clearRudiStateModeCache();return value}
async function migrateD1ToVercel(o={}){
  const source=o.source||createD1StateClient({env:o.env||process.env,fetchImpl:o.fetchImpl||globalThis.fetch,timeoutMs:30000}),dest=o.destination||createVercelStateClient({env:o.env||process.env});
  const [sh,dh]=await Promise.all([source.health(),dest.health()]);if(!sh?.ok)throw new Error('migration-d1-health-failed');if(!dh?.ok)throw new Error('migration-vercel-health-failed');
  const current=await dest.getRecord(STORAGE_META_NAMESPACE,STORAGE_META_KEY).catch(()=>null);if(current?.value?.phase==='ready'&&current?.value?.verified&&!o.force)return{status:'already-complete',marker:current.value};
  const startedAt=new Date().toISOString();await setPhase(dest,'dual-write',{startedAt});await new Promise(r=>setTimeout(r,1200));await dest.clearExcept(STORAGE_META_NAMESPACE,STORAGE_META_KEY);
  let first=await sourceRows(source),written=await upsert(dest,first);await new Promise(r=>setTimeout(r,450));let second=await sourceRows(source);written+=await upsert(dest,second);
  if(checksum(first)!==checksum(second)){await new Promise(r=>setTimeout(r,450));second=await sourceRows(source);written+=await upsert(dest,second)}
  const dst=await destRows(dest),sourceHash=checksum(second),destHash=checksum(dst),sk=new Set(second.map(r=>r.namespace+'\0'+r.key)),dk=new Set(dst.map(r=>r.namespace+'\0'+r.key)),missing=[...sk].filter(k=>!dk.has(k)),extra=[...dk].filter(k=>!sk.has(k)),critical=checks(second);
  const complete=second.length===dst.length&&!missing.length&&!extra.length&&sourceHash===destHash&&critical.browserAuth===2&&critical.score>0;
  const result={migrationId:MIGRATION_ID,status:complete?'complete':'verification-failed',startedAt,completedAt:new Date().toISOString(),source:{rows:second.length,namespaces:summary(second),checksum:sourceHash},destination:{rows:dst.length,namespaces:summary(dst),checksum:destHash},written,missing:missing.slice(0,20),extra:extra.slice(0,20),checks:critical};
  if(!complete){await setPhase(dest,'d1',{failure:{source:result.source,destination:result.destination,checks:critical}});throw Object.assign(new Error('migration-verification-failed'),{detail:result})}
  await setPhase(dest,'ready',{sourceRows:second.length,destinationRows:dst.length,sourceChecksum:sourceHash,destinationChecksum:destHash,checks:critical,completedAt:result.completedAt});return result;
}
async function storageMigrationStatus(o={}){const d=o.destination||createVercelStateClient({env:o.env||process.env});return{marker:(await d.getRecord(STORAGE_META_NAMESPACE,STORAGE_META_KEY).catch(()=>null))?.value||null}}
async function rollbackStorageToD1(o={}){const d=o.destination||createVercelStateClient({env:o.env||process.env});return setPhase(d,'d1',{rollbackAt:new Date().toISOString()})}
module.exports={MIGRATION_ID,NAMESPACES,checksum,summary,migrationToken,isMigrationAuthorized,migrateD1ToVercel,storageMigrationStatus,rollbackStorageToD1,checks};
