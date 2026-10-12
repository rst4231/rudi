'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {moscowToday,birthdayForActor,generateBirthdayGreeting,handleBirthdayGreeting}=require('../api/birthday-greeting.cjs');
const {normalizeUiPreferencesState,saveUiPreferences,readUiPreferences}=require('../api/ui-preferences-store.cjs');
const {encodeSession}=require('../api/rudi-session.cjs');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function effects(){
 const storage=new Map();const listeners={};
 const browser={matchMedia:()=>({matches:false}),addEventListener(){}};
 const context={window:browser,document:{addEventListener(){},getElementById:()=>null},localStorage:{
   getItem:k=>storage.has(k)?storage.get(k):null,
   setItem:(k,v)=>storage.set(k,String(v))
 },setInterval:()=>1,Intl,Date,Number,Promise,console};
 vm.runInNewContext(src('public/rudi-effects.js'),context);
 return {browser,storage,logic:browser.RUDI_EFFECTS.logic};
}
test('rain/snow uses present weather code and ignores a clear forecast',()=>{
 const {logic}=effects();
 for(const code of [51,55,61,65,80,82,95,99])assert.equal(logic.classify(code),'rain');
 for(const code of [71,73,75,77,85,86])assert.equal(logic.classify(code),'snow');
 for(const code of [0,1,3,45,48,null,undefined,''])assert.equal(logic.classify(code),'');
});
test('new year fireworks obey Moscow date and minute boundaries',()=>{
 const {logic}=effects();
 for(const [input,expected]of [
  ['2026-12-31T20:54:00Z',false], // 23:54 Moscow
  ['2026-12-31T20:55:00Z',true],
  ['2026-12-31T20:59:59Z',true],
  ['2026-12-31T21:00:00Z',true], // Jan 1 midnight
  ['2027-01-01T01:59:00Z',true], // 04:59 Moscow
  ['2027-01-01T02:00:00Z',false] // 05:00 Moscow
 ])assert.equal(logic.newYear(logic.moscow(new Date(input))),expected,input);
});
test('balloons follow birthday config for Rustam, Diana, Lulu for entire Moscow day',()=>{
 const {logic}=effects(),people=require('../rudi-config.json').birthdays;
 for(const [date,name] of [['2027-03-03T00:00:00+03:00','Рустам'],['2027-06-30T23:59:00+03:00','Диана'],['2027-05-05T12:00:00+03:00','Лулу']]){
  assert.ok(logic.birthdayNow(logic.moscow(new Date(date)),people).some(x=>x.name===name),name);
 }
 assert.equal(logic.birthdayNow(logic.moscow(new Date('2027-10-12T12:00:00+03:00')),people).length,0);
});
test('rain and snow switches are on by default and save separately for each actor',()=>{
 const {browser,storage}=effects();
 assert.equal(browser.RUDI_EFFECTS.enabled('rain'),true);
 assert.equal(browser.RUDI_EFFECTS.enabled('snow'),true);
 browser.RUDI_EFFECTS.setEnabled('rain',false);
 assert.equal(browser.RUDI_EFFECTS.enabled('rain'),false);
 assert.equal(browser.RUDI_EFFECTS.enabled('snow'),true);
 assert.equal(storage.get('rudi:weather-effects:rain:rustam'),'0');
});
test('persistent UI preferences keep independent weather switches',async()=>{
 let state=null;const cache={get:async()=>state,set:async(_key,v)=>{state=v;return true}};
 const defaults=normalizeUiPreferencesState({});
 assert.equal(defaults.rainAnimationEnabled,true);
 assert.equal(defaults.snowAnimationEnabled,true);
 await saveUiPreferences('Рустам',{rainAnimationEnabled:false},{uiPreferencesCache:cache});
 const saved=await readUiPreferences('Рустам',{uiPreferencesCache:cache});
 assert.equal(saved.rainAnimationEnabled,false);
 assert.equal(saved.snowAnimationEnabled,true);
});
test('birthday greeting uses correct birthday owner and Moscow date',()=>{
 assert.equal(moscowToday(Date.parse('2027-03-02T21:00:00Z')).key,'2027-03-03');
 const day=moscowToday(Date.parse('2027-03-03T10:00:00Z'));
 assert.equal(birthdayForActor('Рустам',day).name,'Рустам');
 assert.equal(birthdayForActor('Диана',day),null);
});
test('personal greeting uses AI output if available and fallback if unavailable',async()=>{
 const greeting=await generateBirthdayGreeting('Диана',{apiKey:'demo',fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:'Диана, пусть каждый новый день приносит тебе вдохновение, чудесные моменты с Рустамом и Лулу и радостные открытия!'}}]})})});
 assert.equal(greeting.aiGenerated,true);
 assert.match(greeting.greeting,/Диана/);
 const fallback=await generateBirthdayGreeting('Рустам',{apiKey:''});
 assert.equal(fallback.aiGenerated,false);
 assert.match(fallback.greeting,/Рустам/);
});
test('birthday API validates session and restricts greeting to owner birthday',async()=>{
 const now=Date.parse('2027-03-03T10:00:00Z'),cacheValue=new Map();
 const cache={get:async key=>cacheValue.get(key),set:async(key,val)=>{cacheValue.set(key,val);return true}};
 const response=()=>({code:200,status(v){this.code=v;return this},json(data){this.value=data;return this}});
 const req=(actor)=>({method:'POST',body:{},headers:{cookie:'rudi_session='+encodeURIComponent(encodeSession(actor,'mock-bot-secret',now))}});
 const opts={now,botToken:'mock-bot-secret',cache,apiKey:'',env:{GROQ_API_KEY:''},birthdays:require('../rudi-config.json').birthdays};
 const yes=response();await handleBirthdayGreeting(req('Рустам'),yes,opts);
 assert.equal(yes.code,200);assert.match(yes.value.greeting,/Рустам/);
 const no=response();await handleBirthdayGreeting(req('Диана'),no,opts);
 assert.equal(no.code,403);
});
test('birthday modal shows once per birthday and requires authenticated actor',()=>{
 const js=src('public/rudi-effects.js'),app=src('public/app.js');
 assert.match(js,/rudi:birthday:greeting:v1:/);
 assert.match(js,/localStorage\.getItem\(seen\)==='1'/);
 assert.match(js,/localStorage\.setItem\(seen,'1'\)/);
 assert.match(js,/if\(birthday\.some\(x=>x\.name===actor\)\)birthdayWindow\(d\)/);
 assert.match(js,/С днём рождения, /);
 assert.match(js,/birthday-greeting/);
 assert.match(app,/window\.RUDI_EFFECTS\?\.init\?\.\(\{actor:currentActor,birthdays:config\?\.birthdays/);
 const html=src('public/index.html');
 assert.ok(html.indexOf('/rudi-effects.js?v=4.199')<html.indexOf('/app.js?v=4.199'));
});
test('decorative animations are non-interactive across every app screen and respect reduced motion',()=>{
 const css=src('public/rudi-effects.css'),js=src('public/rudi-effects.js'),sw=src('public/sw.js');
 assert.match(css,/\.rudi-effects-layer,\.rudi-effect\{[^}]*pointer-events:none!important/s);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(js,/window\.matchMedia\?\./);
 assert.match(sw,/rudi-effects\.js\?v=4\.199/);
 assert.match(sw,/rudi-effects\.css\?v=4\.199/);
});
