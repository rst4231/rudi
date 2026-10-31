'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {partnerBodyMetrics}=require('../api/partner-body-metrics.cjs');
test('AI profile values use latest weight and birthday in Moscow',()=>{
 const data={profile:{height:168,birthDate:'1996-06-30'},weights:[{kg:63},{kg:62.4}]};
 assert.deepEqual(partnerBodyMetrics(data,Date.parse('2026-06-29T20:59:00Z')),{height:168,weight:62.4,age:29});
 assert.equal(partnerBodyMetrics(data,Date.parse('2026-06-29T21:00:00Z')).age,30);
 for(const birthDate of ['', 'bad','1996-02-31','1996-99-99'])assert.equal(partnerBodyMetrics({profile:{birthDate}}).age,null);
 assert.deepEqual(partnerBodyMetrics(),{height:null,weight:null,age:null});
});
test('partner endpoint returns only body metrics and aggregated mood shares for authenticated partner, ignoring supplied actor',async()=>{
 for(const actor of ['Рустам','Диана']){
  const partner=actor==='Рустам'?'Диана':'Рустам';let selected,moodActor;
  const box={module:{exports:{}},require:p=>{
   if(p==='./rudi-request-auth.cjs')return {authorizeRequest:()=>({actor}),statusForError:()=>500};
   if(p==='./personal-center-store.cjs')return {read:async a=>{selected=a;return {profile:{height:170,birthDate:'1990-03-03',private:'secret'},weights:[{kg:65}],symptoms:['secret']}}};
   if(p==='./partner-body-metrics.cjs')return {partnerBodyMetrics};
   if(p==='./daily-mood-store.cjs')return {readMoodHistory:async a=>{moodActor=a;return [{date:'2026-10-23',samples:[{mood:'joy',reason:'secret'},{mood:'anxiety'}]},{date:'2026-10-24',mood:'love',reason:'secret'}]}};
   if(p==='./personal-center-emotions.cjs')return require('../api/personal-center-emotions.cjs');
   return {};
  }};
  vm.runInNewContext(fs.readFileSync('api/personal-center-handler.cjs','utf8'),box);
  let result,status;const res={setHeader(){},status(s){status=s;return this},json(v){result=v}};
  await box.module.exports({method:'POST',body:{operation:'partner-profile',actor:partner}},res);
  assert.equal(status,200);assert.equal(moodActor,partner);
  assert.equal(result.emotions.daily.length,2);assert.equal(result.emotions.daily[0].positive,1);assert.equal(result.emotions.daily[0].total,2);
  assert.deepEqual(Object.keys(result.emotions.daily[0]).sort(),['date','positive','total']);assert.equal(selected,partner);assert.equal(result.actor,actor);assert.equal(result.partner,partner);
  assert.deepEqual(Object.keys(result.metrics).sort(),['age','height','weight']);assert.equal(result.metrics.weight,65);
  assert.equal(JSON.stringify(result).includes('secret'),false);
 }
});
