const crypto=require('node:crypto');
const {createBlobJsonStore,markMigrationReadyForProcess}=require('./blob-json-store.cjs');
const {
  durableRequest,
  blobDurableSetRecord,
  blobDurableGetRecord,
}=require('./strict-runtime-cache.cjs');
const {
  APP_STATE_FIELD,
  listLegacyRawRecords,
  writeRawBlobRecord,
  readRawRecord,
}=require('./rudi-auth-db.cjs');

const MIGRATION_ID='neon-to-blob-2026-10-03-v1';
const MIGRATION_TOKEN='rudi-migrate-20261003-8f7c1e4b6a2d9c53';
const MISSED_TASK_COMPENSATION=Object.freeze({
  taskId:'6ac0c3d78f08929497a1e5f3',
  actor:'Рустам',
  title:'🛒 Купить продукты',
  dateKey:'2026-10-03',
  completedAt:'2026-10-03T08:59:03.000Z',
  units:20,
  dedupeKey:'score:task:6ac0c3d78f08929497a1e5f3:2026-10-03:Рустам',
});

function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));
  }
  return value;
}
function canonicalJson(value){return JSON.stringify(canonicalize(value))}
function checksum(value){return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}
function actorSlug(actor){return String(actor||'')==='Диана'?'diana':'rustam'}
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function sanitizeHabitState(value){
  const source=plain(value);
  const clean={...source};
  delete clean.collapsed;
  return clean;
}
function sanitizeAuthRowForBlob(row){
  const source=plain(row);
  const pin=plain(source.pin_record);
  const appState=plain(pin[APP_STATE_FIELD]);
  const nextAppState={...appState};
  if(nextAppState['habits:v1'])nextAppState['habits:v1']=sanitizeHabitState(nextAppState['habits:v1']);
  return{
    ...source,
    pin_record:{...pin,[APP_STATE_FIELD]:nextAppState},
  };
}
function compensateMissedTaskScore(value){
  const source=plain(value);
  const history=Array.isArray(source.history)?source.history.map(row=>({...plain(row)})):[];
  const dedupe={...plain(source.dedupe)};
  const key=MISSED_TASK_COMPENSATION.dedupeKey;
  if(dedupe[key]||history.some(row=>String(row?.dedupeKey||'')===key)){
    return{value:source,applied:false};
  }
  const actor=MISSED_TASK_COMPENSATION.actor;
  const dateKey=MISSED_TASK_COMPENSATION.dateKey;
  const balances={...plain(source.balances)};
  const lifetimeEarned={...plain(source.lifetimeEarned)};
  const dailyEarned={...plain(source.dailyEarned)};
  const day={...plain(dailyEarned[dateKey])};
  balances[actor]=Number(balances[actor]||0)+MISSED_TASK_COMPENSATION.units;
  lifetimeEarned[actor]=Number(lifetimeEarned[actor]||0)+MISSED_TASK_COMPENSATION.units;
  day[actor]=Number(day[actor]||0)+MISSED_TASK_COMPENSATION.units;
  dailyEarned[dateKey]=day;
  const createdAt=new Date().toISOString();
  history.unshift({
    id:crypto.randomUUID(),
    actor,
    kind:'earn',
    units:MISSED_TASK_COMPENSATION.units,
    requestedUnits:MISSED_TASK_COMPENSATION.units,
    label:'Задача',
    detail:MISSED_TASK_COMPENSATION.title,
    icon:'✅',
    dedupeKey:key,
    rewardId:'',
    dateKey,
    createdAt,
    reversedAt:'',
  });
  dedupe[key]=createdAt;
  return{
    applied:true,
    value:{
      ...source,
      initialized:true,
      version:Math.max(0,Number(source.version||0))+1,
      balances,
      lifetimeEarned,
      dailyEarned,
      history,
      dedupe,
    },
  };
}
function newer(left,right){
  const a=Date.parse(String(left||'')),b=Date.parse(String(right||''));
  return Number.isFinite(a)&&Number.isFinite(b)&&a>b;
}
async function mapLimit(items,limit,worker){
  const rows=Array.isArray(items)?items:[];
  const results=new Array(rows.length);
  let cursor=0;
  async function run(){
    while(true){
      const index=cursor++;
      if(index>=rows.length)return;
      results[index]=await worker(rows[index],index);
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit),rows.length||1)},run));
  return results;
}
async function readLegacyDurableRows(options={}){
  const query=new URLSearchParams({
    select:'namespace,key,value,tags,expires_at,updated_at',
    order:'namespace.asc,key.asc',
    limit:'1000',
  }).toString();
  const rows=await durableRequest(options,'GET',query);
  return Array.isArray(rows)?rows:[];
}
function namespaceSummary(rows){
  const map=new Map();
  for(const row of rows){
    const ns=String(row?.namespace||'');
    map.set(ns,(map.get(ns)||0)+1);
  }
  return Object.fromEntries([...map.entries()].sort(([a],[b])=>a.localeCompare(b)));
}
async function migrateNeonToBlob(options={}){
  const coreStore=options.coreStore||createBlobJsonStore({
    prefix:'rudi-state-v2',
    env:options.env||process.env,
    ...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{}),
    ...(options.blobClient?{client:options.blobClient}:{}),
  });
  const specializedStore=options.specializedStore||createBlobJsonStore({
    prefix:'rudi-state-v1',
    env:options.env||process.env,
    ...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{}),
    ...(options.blobClient?{client:options.blobClient}:{}),
  });

  const markerKey='migration/'+MIGRATION_ID;
  const existingMarker=await coreStore.read(markerKey).catch(()=>null);
  if(existingMarker?.status==='complete'&&options.force!==true)return existingMarker;

  const startedAt=new Date().toISOString();
  const [authRows,durableRows]=await Promise.all([
    listLegacyRawRecords(options),
    readLegacyDurableRows(options),
  ]);

  const source={
    exportedAt:startedAt,
    database:'rudi_auth',
    tables:{
      rudi_browser_auth:authRows,
      rudi_durable_state:durableRows,
    },
  };
  const sourceChecksum=checksum(source.tables);
  const backupKey='backups/neon/'+MIGRATION_ID;
  await coreStore.write(backupKey,{...source,checksum:sourceChecksum});

  let durableWritten=0,durablePreservedNewer=0;
  await mapLimit(durableRows,12,async row=>{
    const current=await blobDurableGetRecord(options,row.namespace,row.key).catch(()=>null);
    if(current&&newer(current.updated_at,row.updated_at)){
      durablePreservedNewer+=1;
      return;
    }
    await blobDurableSetRecord(options,row);
    durableWritten+=1;
  });

  let authWritten=0,authPreservedNewer=0;
  await mapLimit(authRows,2,async row=>{
    const cleanRow=sanitizeAuthRowForBlob(row);
    const current=await readRawRecord(row.actor,{...options,authBlobStore:coreStore,bypassMigrationGate:true}).catch(()=>null);
    if(current&&newer(current.updated_at,row.updated_at)){
      authPreservedNewer+=1;
      return;
    }
    await writeRawBlobRecord(row.actor,cleanRow,{...options,authBlobStore:coreStore,bypassMigrationGate:true});
    authWritten+=1;
  });

  let habitsWritten=0,habitsPreservedNewer=0;
  await mapLimit(authRows,2,async row=>{
    const rawState=plain(row?.pin_record)?.[APP_STATE_FIELD]?.['habits:v1'];
    if(!rawState)return;
    const sourceState=sanitizeHabitState(rawState);
    const key='habits/'+actorSlug(row.actor);
    const current=await specializedStore.read(key).catch(()=>null);
    if(current&&newer(current.updatedAt,sourceState.updatedAt)){
      habitsPreservedNewer+=1;
      return;
    }
    await specializedStore.write(key,sourceState);
    habitsWritten+=1;
  });

  const supplementRows=durableRows.filter(row=>String(row?.namespace||'')==='rudi-supplements-v1');
  let supplementsWritten=0,supplementsPreservedNewer=0;
  await mapLimit(supplementRows,2,async row=>{
    const actor=String(row?.key||'').includes('Диана')?'Диана':'Рустам';
    const key='supplements/'+actorSlug(actor);
    const current=await specializedStore.read(key).catch(()=>null);
    if(current&&newer(current.updatedAt,row?.value?.updatedAt)){
      supplementsPreservedNewer+=1;
      return;
    }
    await specializedStore.write(key,row.value);
    supplementsWritten+=1;
  });

  let durableVerified=0,durableMismatches=[];
  await mapLimit(durableRows,12,async row=>{
    const stored=await blobDurableGetRecord(options,row.namespace,row.key).catch(()=>null);
    if(stored&&canonicalJson(stored.value)===canonicalJson(row.value)){
      durableVerified+=1;
      return;
    }
    if(stored&&newer(stored.updated_at,row.updated_at))return;
    durableMismatches.push(row.namespace+'\0'+row.key);
  });

  let taskCompensationApplied=false;
  const scoreSource=durableRows.find(row=>String(row?.namespace||'')==='rudi-score-v1'&&String(row?.key||'')==='score-state');
  if(scoreSource){
    const stored=await blobDurableGetRecord(options,'rudi-score-v1','score-state');
    if(stored){
      const compensation=compensateMissedTaskScore(stored.value);
      taskCompensationApplied=compensation.applied;
      if(compensation.applied){
        await blobDurableSetRecord(options,{
          ...stored,
          value:compensation.value,
          updated_at:new Date().toISOString(),
        });
      }
    }
  }

  let authVerified=0,authMismatches=[];
  await mapLimit(authRows,2,async row=>{
    const desired=sanitizeAuthRowForBlob(row);
    const stored=await coreStore.read('auth/'+actorSlug(row.actor)).catch(()=>null);
    if(stored&&canonicalJson(stored)===canonicalJson(desired)){
      authVerified+=1;
      return;
    }
    if(stored&&newer(stored.updated_at,row.updated_at))return;
    authMismatches.push(String(row.actor||''));
  });

  let habitsVerified=0,supplementsVerified=0;
  for(const row of authRows){
    const rawState=plain(row?.pin_record)?.[APP_STATE_FIELD]?.['habits:v1'];
    if(!rawState)continue;
    const sourceState=sanitizeHabitState(rawState);
    const stored=await specializedStore.read('habits/'+actorSlug(row.actor)).catch(()=>null);
    if(stored&&canonicalJson(stored)===canonicalJson(sourceState))habitsVerified+=1;
    else if(!(stored&&newer(stored.updatedAt,sourceState.updatedAt)))authMismatches.push('habits:'+row.actor);
  }
  for(const row of supplementRows){
    const actor=String(row?.key||'').includes('Диана')?'Диана':'Рустам';
    const stored=await specializedStore.read('supplements/'+actorSlug(actor)).catch(()=>null);
    if(stored&&canonicalJson(stored)===canonicalJson(row.value))supplementsVerified+=1;
    else if(!(stored&&newer(stored.updatedAt,row?.value?.updatedAt)))durableMismatches.push('supplements:'+actor);
  }

  const completedAt=new Date().toISOString();
  const complete=durableMismatches.length===0&&authMismatches.length===0;
  const result={
    migrationId:MIGRATION_ID,
    status:complete?'complete':'verification-failed',
    startedAt,
    completedAt,
    source:{
      authRows:authRows.length,
      durableRows:durableRows.length,
      namespaces:namespaceSummary(durableRows),
      checksum:sourceChecksum,
    },
    backup:{key:backupKey,checksum:sourceChecksum},
    migrated:{
      durableWritten,
      durablePreservedNewer,
      authWritten,
      authPreservedNewer,
      habitsWritten,
      habitsPreservedNewer,
      supplementsWritten,
      supplementsPreservedNewer,
      taskCompensationApplied,
    },
    verified:{
      durable:durableVerified,
      auth:authVerified,
      habits:habitsVerified,
      supplements:supplementsVerified,
      durableMismatches:durableMismatches.slice(0,20),
      authMismatches:authMismatches.slice(0,20),
    },
    neonDeleted:false,
  };
  await coreStore.write(markerKey,result);
  if(complete)markMigrationReadyForProcess();
  return result;
}

module.exports={
  MIGRATION_ID,
  MIGRATION_TOKEN,
  migrateNeonToBlob,
  canonicalJson,
  checksum,
};
