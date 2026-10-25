const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const actorSource=app.slice(app.indexOf('function iphoneFaceIdActor(){'),app.indexOf('function isProtectedIphoneAccount(){'));

function context(actor,initData){
 const calls={pin:0,face:0,auth:0};
 const ctx={currentActor:actor,telegramInitData:()=>initData,navigator:{userAgent:'iPhone',onLine:true},
  appAccessReady:false,currentStateBackupToken:'',appBootstrapPromise:null,DAY:86400000,
  document:{body:{dataset:{}}},localStorage:{getItem:()=>null,setItem:()=>{}},window:{},
  readLocalStateBackupToken:()=>'',restoreHomeFromDisk:async()=>{},appPushSupported:()=>false,
  clearIphoneFaceIdWindow:()=>{calls.face++},ensureIphoneFaceIdAccess:async()=>{calls.face++},
  ensureTelegramPin:async()=>{calls.pin++},showAuthenticatedApp:()=>{},loadAppBootstrap:async()=>{},
  fetchWithTimeout:async(_url,options)=>{calls.auth++;assert.equal(JSON.parse(options.body).initData,initData);return {ok:true,json:async()=>({ok:true,actor})}},
  denyApp:()=>{},console,Date,String,JSON,Number};
 ctx.isProtectedIphoneAccount=new Function('ctx','with(ctx){'+actorSource+';return ()=>Boolean(iphoneFaceIdActor());}')(ctx);
 const start=app.indexOf('async function authenticateApp(){');
 const end=app.indexOf('const preventGestureZoom',start);
 const authenticate=new Function('ctx','with(ctx){'+app.slice(start,end)+';return authenticateApp;}')(ctx);
 return {ctx,calls,authenticate};
}

for(const actor of ['Рустам','Диана']){
 test(actor+': Telegram launch verifies access without Face ID or PIN prompts',async()=>{
  const {ctx,calls,authenticate}=context(actor,'signed-telegram-launch');
  assert.equal(await authenticate(),true);
  assert.equal(calls.auth,1);
  assert.equal(calls.pin,0);
  assert.equal(calls.face,0);
  assert.equal(ctx.appAccessReady,true);
 });
 test(actor+': Telegram foreground and expiry checks never activate the iPhone lock',()=>{
  assert.equal(context(actor,'signed-telegram-launch').ctx.isProtectedIphoneAccount(),false);
 });
 test(actor+': Safari and installed PWA still require the iPhone lock',()=>{
  assert.equal(context(actor,'').ctx.isProtectedIphoneAccount(),true);
 });
}

test('Telegram cannot open the app if server rejects its identity',async()=>{
 const {ctx,authenticate}=context('Рустам','invalid-launch');
 ctx.fetchWithTimeout=async()=>({ok:false,json:async()=>({ok:false,error:'rudi-access-denied'})});
 assert.equal(await authenticate(),false);
 assert.equal(ctx.appAccessReady,false);
});
