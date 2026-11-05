const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const turn=()=>new Promise(setImmediate);
function fixture(get){
 const dom=new JSDOM('<body data-rudi-actor="Рустам"></body>',{url:'https://rudi.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.setInterval=()=>1;w.matchMedia=()=>({matches:false});w.RUDI_WEATHER={get,getAutomatic:()=>{throw Error('Must use shared selection')}};
 w.eval(fs.readFileSync('public/rudi-effects.js','utf8'));w.RUDI_EFFECTS.init({actor:'Рустам'});return {w,dom};
}
const data=(code,resolved=true)=>({location:{city:'murino',resolved},current:{weather_code:code},fetchedAt:Date.now()});
test('global precipitation uses the shared selected-city service and updates on city change',async()=>{
 let code=61,calls=0;const {w}=fixture(async()=>{calls++;return data(code)});
 try{await turn();assert.ok(w.document.getElementById('rudi-effect-rain'));assert.equal(calls,1);
 code=75;w.dispatchEvent(new w.CustomEvent('rudi:weather-city-change'));await turn();assert.ok(w.document.getElementById('rudi-effect-snow'));assert.equal(w.document.getElementById('rudi-effect-rain'),null);
 w.RUDI_EFFECTS.setEnabled('snow',false);assert.equal(w.document.getElementById('rudi-effect-snow'),null);
 }finally{w.close()}
});
test('automatic choice without a resolved location and expired weather suppress effects',async()=>{
 let value=data(61,false);const {w}=fixture(async()=>value);
 try{await turn();assert.equal(w.document.getElementById('rudi-effect-rain'),null);value=data(61);value.fetchedAt=Date.now()-36*60000;await w.RUDI_EFFECTS.refreshWeather();assert.equal(w.document.getElementById('rudi-effect-rain'),null);
 value=data(75);await w.RUDI_EFFECTS.refreshWeather();assert.ok(w.document.getElementById('rudi-effect-snow'));
 }finally{w.close()}
});
test('changing the city during an in-flight request ignores old precipitation and reloads selection',async()=>{
 let done,calls=0;const {w}=fixture(()=>{calls++;return calls===1?new Promise(resolve=>done=resolve):Promise.resolve(data(75))});
 try{await turn();w.dispatchEvent(new w.CustomEvent('rudi:weather-city-change'));done(data(61));await turn();await turn();assert.equal(calls,2);assert.equal(w.document.getElementById('rudi-effect-rain'),null);assert.ok(w.document.getElementById('rudi-effect-snow'));
 }finally{w.close()}
});
