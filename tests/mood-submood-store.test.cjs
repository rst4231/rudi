'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mood=require('../api/daily-mood-store.cjs');
const backup=require('../api/rudi-backup.cjs');
const {encodeSession}=require('../api/rudi-session.cjs');
const {APP_STATE_NAMESPACE,appStateRecordKey}=require('../api/rudi-auth-db.cjs');
const date='2026-10-23',stamp='2026-10-23T09:00:00.000Z',now=Date.parse(stamp);
test.before(()=>test.mock.method(globalThis,'fetch',async()=>{throw Error('external-network-disabled-for-mood-tests');}));

// Only the external HTTP storage boundary is replaced; normalization and writes are real.
function fixture(){
 const records=new Map(),writes=[];
 for(const actor of ['Рустам','Диана'])records.set(APP_STATE_NAMESPACE+'|'+appStateRecordKey(actor,mood.APP_STATE_KEY),{initialized:true,version:1,days:{},analyses:{}});
 const options={now,botToken:'123:test-mood-secret',env:{RUDI_API_SECRET:'test',RUDI_STORAGE_FORCE_D1:'1'},moodCache:{get:async()=>null},fetchImpl:async(url,input)=>{
  const body=JSON.parse(input.body||'{}'),key=body.namespace+'|'+body.key,path=new URL(url).pathname;
  if(path==='/get')return new Response(JSON.stringify(records.has(key)?{ok:true,value:records.get(key)}:{ok:false}),{status:records.has(key)?200:404});
  if(path==='/set'){records.set(key,structuredClone(body.value));writes.push(structuredClone(body));return new Response('{"ok":true}');}
  if(path==='/list')return new Response('{"ok":true,"items":[]}');
  throw Error('unexpected-test-storage-endpoint:'+path);
 }};
 return {options,records,writes};
}

test('a single durable write contains mood, subtype and custom reason together',async()=>{
 const h=fixture();
 const result=await mood.setDailyMood(date,'Рустам','joy',{...h.options,submood:'Предвкушение',reason:'other',reasonText:'  Скоро   отпуск  '});
 assert.deepEqual(result.moods['Рустам'].samples,[{mood:'joy',submood:'Предвкушение',updatedAt:stamp,reason:'other',reasonText:'Скоро отпуск'}]);
 assert.equal(result.moods['Рустам'].submood,'Предвкушение');
 assert.equal(h.writes.length,1);
 assert.equal(h.writes[0].value.days[date].samples[0].reasonText,'Скоро отпуск');
 assert.equal(result.moods['Диана'],null);
});

test('changing only subtype appends one sample and exact retry does not append',async()=>{
 const h=fixture();
 await mood.setDailyMood(date,'Рустам','joy',{...h.options,submood:'Предвкушение',reason:'work'});
 const changed=await mood.setDailyMood(date,'Рустам','joy',{...h.options,now:now+1000,submood:'Восторг',reason:'food'});
 assert.deepEqual(changed.moods['Рустам'].samples.map(s=>[s.submood,s.reason]),[['Предвкушение','work'],['Восторг','food']]);
 const retry=await mood.setDailyMood(date,'Рустам','joy',{...h.options,now:now+2000,submood:'Восторг',reason:'food'});
 assert.equal(retry.moods['Рустам'].samples.length,2);
 const legacyRetry=await mood.setDailyMood(date,'Рустам','joy',{...h.options,now:now+3000});
 assert.equal(legacyRetry.moods['Рустам'].submood,'Восторг');
 assert.equal(legacyRetry.moods['Рустам'].samples.length,2);
});

test('invalid subtype or atomic reason fails before any write',async()=>{
 const h=fixture();
 await assert.rejects(mood.setDailyMood(date,'Рустам','joy',{...h.options,submood:'Неизвестная эмоция',reason:'work'}),/mood-submood-invalid/);
 await assert.rejects(mood.setDailyMood(date,'Рустам','joy',{...h.options,submood:'Предвкушение',reason:'invalid'}),/mood-reason-invalid/);
 assert.equal(h.writes.length,0);
});

test('legacy reason edits preserve the saved subtype',async()=>{
 const h=fixture();
 await mood.setDailyMood(date,'Рустам','joy',{...h.options,submood:'Предвкушение',reason:'work'});
 const changed=await mood.setDailyMoodReason(date,'Рустам','other',{...h.options,reasonText:'Планы на выходные'});
 assert.equal(changed.moods['Рустам'].submood,'Предвкушение');
 assert.deepEqual(changed.moods['Рустам'].samples,[{mood:'joy',submood:'Предвкушение',updatedAt:stamp,reason:'other',reasonText:'Планы на выходные'}]);
});

test('normalization, merge and encrypted backup restore preserve subtype samples',async()=>{
 const h=fixture();
 await mood.setDailyMood(date,'Рустам','joy',{...h.options,submood:'Предвкушение',reason:'work'});
 const snapshot=await mood.readDailyMoodState(h.options);
 const normalized=mood.normalizeMoodState(snapshot,{now});
 assert.equal(normalized.days[date].moods['Рустам'].submood,'Предвкушение');
 const token=backup.sealSnapshot({version:2,dailyMood:snapshot},h.options);
 const restored=fixture();
 await mood.restoreDailyMoodState(backup.openSnapshot(token,h.options).dailyMood,restored.options);
 const history=await mood.readMoodHistory('Рустам',restored.options);
 assert.equal(history[0].samples[0].submood,'Предвкушение');
 const legacy={initialized:true,days:{[date]:{moods:{'Рустам':{mood:'joy',updatedAt:stamp}}}}};
 assert.equal(mood.mergeMoodStates(legacy,snapshot,{now}).days[date].moods['Рустам'].samples[0].submood,'Предвкушение');
});

test('new fear category remains distinct from legacy fear alias in analysis and signals',()=>{
 const anxiety=mood.normalizeMoodEntry({mood:'anxiety',updatedAt:stamp});
 assert.equal(anxiety?.mood,'anxiety');
 assert.equal(mood.normalizeMoodEntry({mood:'fear',updatedAt:stamp}).mood,'boredom');
 const signals=require('../api/personal-center-emotions.cjs').computeEmotionSignals([{date,mood:'anxiety',samples:[{mood:'anxiety'}]}]);
 assert.equal(signals.latest?.negativePercent,100);
 const prompt=require('../api/mood-analysis-ai.cjs').promptForMoodAnalysis({history:[{date,mood:'anxiety',samples:[{mood:'anxiety',reason:'work'}]}]});
 assert.match(prompt,/2026-10-23 — страх/);
 assert.match(require('../api/mood-notification-ai.cjs').promptForMood('Рустам','Диана','anxiety'),/страх/);
});

test('analysis sees selected subtype even when optional reason is skipped',()=>{
 const ai=require('../api/mood-analysis-ai.cjs');
 for(const reason of ['','work']){
  const prompt=ai.promptForMoodAnalysis({history:[{date,mood:'joy',samples:[{mood:'joy',submood:'Предвкушение',reason}]}]});
  assert.match(prompt,/Предвкушение/);
 }
});

test('mood API saves atomic payload and history plus backup retain subtype',async()=>{
 const h=fixture(),api=require('../api/partner-message.js');
 // An existing parent emotion isolates subtype-only changes from unrelated score/notification stores.
 await mood.setDailyMood(date,'Рустам','joy',h.options);
 const request=async body=>{
  const res={status(code){this.code=code;return this},json(value){this.body=value;return this}};
  await api.handleRudiAction({method:'POST',headers:{cookie:'rudi_session='+encodeSession('Рустам',h.options.botToken,now)},body},res,'mood',h.options);
  return res;
 };
 const invalid=await request({operation:'set',mood:'joy',submood:'invalid',reason:'work'});
 assert.equal(invalid.code,400);
 const saved=await request({operation:'set',mood:'joy',submood:'Предвкушение',reason:'work'});
 assert.equal(saved.code,200);
 assert.equal(saved.body.mine.samples[0].submood,'Предвкушение');
 assert.equal(saved.body.mine.samples[0].reason,'work');
 assert.equal(backup.openSnapshot(saved.body.backupToken,h.options).dailyMood.days[date].moods['Рустам'].samples[0].submood,'Предвкушение');
 const history=await request({operation:'history'});
 assert.equal(history.code,200);
 assert.equal(history.body.history[0].samples[0].submood,'Предвкушение');
 assert.match(api.moodNotificationText('Диана','Рустам','anxiety'),/боится|страх/);
});
