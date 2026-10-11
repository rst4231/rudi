const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
function setup(){
 const first=app.indexOf('// Per-account iPhone Face ID unlock:');
 const last=app.indexOf('function showIphoneFaceIdErrorRetry',first);
 assert.ok(first>=0&&last>first);
 const local=new Map(),store={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
 let clock=2e12;
 return {
  start(actor){
   const ctx={currentActor:actor,navigator:{userAgent:'iPhone'},localStorage:store,
    Date:class extends Date{static now(){return clock}},Number,Object,String,Math,JSON,
    appAccessReady:false,setTimeout:()=>{},clearTimeout:()=>{},requireIphoneFaceIdLock:()=>{},telegramInitData:()=>''};
   return new Function('ctx','with(ctx){'+app.slice(first,last)+';return {interval:iphoneFaceIdInterval,grant:grantIphoneFaceIdWindow,deadline:iphoneFaceIdDeadline,save:saveIphoneFaceIdInterval}}')(ctx);
  },
  advance(ms){clock+=ms}
 };
}
test('hour default persists after PWA restart and expires',()=>{
 const s=setup(),a=s.start('Рустам');
 assert.equal(a.interval(),'1h');a.grant('Рустам');
 assert.ok(s.start('Рустам').deadline()>0);
 s.advance(3600001);assert.equal(s.start('Рустам').deadline(),0);
});
test('immediate overrides old session and always prompts on PWA relaunch',()=>{
 const s=setup(),a=s.start('Рустам');
 a.grant('Рустам');a.save('immediate');
 assert.equal(a.deadline(),0);a.grant('Рустам');
 assert.ok(a.deadline()>0);
 assert.equal(s.start('Рустам').interval(),'immediate');
 assert.equal(s.start('Рустам').deadline(),0);
});
test('Diana and Rustam have independent settings and active sessions',()=>{
 const s=setup(),r=s.start('Рустам');r.save('10m');r.grant('Рустам');
 const d=s.start('Диана');d.save('5h');d.grant('Диана');
 assert.equal(s.start('Диана').interval(),'5h');
 assert.equal(s.start('Рустам').interval(),'10m');
 s.advance(600001);
 assert.equal(s.start('Рустам').deadline(),0);
 assert.ok(s.start('Диана').deadline()>0);
});
test('Face ID setup and fallback PIN bind to selected identity',()=>{
 assert.match(app,/finished=true;grantIphoneFaceIdWindow\(lockedActor\)/);
 assert.match(app,/if\(actor!==lockedActor\)throw new Error\('rudi-actor-mismatch'\)/);
 assert.match(app,/browserAuthRequest\('login',\{actor:lockedActor,pin:value\}\)/);
});
test('security settings offer all four intervals and installed PWA hides reinstall item',()=>{
 for(const value of ['immediate','10m','1h','5h'])assert.ok(app.includes('<option value="'+value+'"'));
 assert.match(app,/settingsFaceIdIntervalRow/);
 assert.match(app,/pwaRow\.hidden=browser\|\|isStandalonePwa\(\)/);
});

test('raising Face ID interval from one to five hours ignores the obsolete one-hour expiry',()=>{
 const s=setup(),auth=s.start('Рустам');auth.save('1h');auth.grant('Рустам');
 s.advance(10*60000);auth.save('5h');
 s.advance(51*60000);
 assert.ok(s.start('Рустам').deadline()>0,'old one-hour limit must not lock the PWA');
 s.advance(5*3600000-61*60000+1);
 assert.equal(s.start('Рустам').deadline(),0,'five hours must expire from last verification');
});
test('shortening Face ID interval to one hour does not prolong the session',()=>{
 const s=setup(),auth=s.start('Рустам');auth.save('5h');auth.grant('Рустам');
 auth.save('1h');s.advance(3600001);
 assert.equal(s.start('Рустам').deadline(),0);
});
test('a second PWA tab refreshes the verified window without the first tab locking early',()=>{
 const s=setup(),first=s.start('Рустам');first.save('1h');first.grant('Рустам');
 s.advance(30*60000);s.start('Рустам').grant('Рустам');
 s.advance(31*60000);
 assert.ok(first.deadline()>0,'persisted verification must beat the first tabs old grant');
 s.advance(30*60000);
 assert.equal(first.deadline(),0);
});
