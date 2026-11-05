const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
test('global precipitation follows automatic weather rather than the manual forecast city',async()=>{
 const dom=new JSDOM('<body data-rudi-actor="Рустам"></body>',{url:'https://rudi.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let manualCalls=0,automaticCalls=0,code=61,resolved=true;
 w.setInterval=()=>1;w.matchMedia=()=>({matches:false});w.RUDI_WEATHER={get:async()=>{manualCalls++;return {current:{weather_code:0}}},getAutomatic:async()=>{automaticCalls++;return {location:{city:'bangkok',resolved},current:{weather_code:code},fetchedAt:Date.now()}}};
 try{
  w.eval(fs.readFileSync('public/rudi-effects.js','utf8'));w.RUDI_EFFECTS.init({actor:'Рустам'});await new Promise(setImmediate);
  assert.ok(w.document.getElementById('rudi-effect-rain'));assert.equal(manualCalls,0);assert.equal(automaticCalls,1);
  code=75;await w.RUDI_EFFECTS.refreshWeather();assert.ok(w.document.getElementById('rudi-effect-snow'));assert.equal(w.document.getElementById('rudi-effect-rain'),null);
  w.RUDI_EFFECTS.setEnabled('snow',false);assert.equal(w.document.getElementById('rudi-effect-snow'),null);
  w.RUDI_EFFECTS.setEnabled('snow',true);resolved=false;await w.RUDI_EFFECTS.refreshWeather();assert.equal(w.document.getElementById('rudi-effect-snow'),null);
  resolved=true;code=0;await w.RUDI_EFFECTS.refreshWeather();assert.equal(w.document.getElementById('rudi-effect-rain'),null);
 }finally{w.close()}
});
