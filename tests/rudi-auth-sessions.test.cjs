const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {requestIp,requestCountryCode,normalizeSessions,listAuthSessions,recordAuthSession}=require('../api/rudi-auth-sessions.cjs');

function memoryStore(){
  const map=new Map();
  return {
    readState:async(actor,key)=>map.get(actor+':'+key)||null,
    writeState:async(actor,key,value)=>{map.set(actor+':'+key,structuredClone(value));return value},
  };
}

test('valid proxy IP and country are recorded; actor history is isolated and latest five retained',async()=>{
  const store=memoryStore();
  for(let i=0;i<7;i++){
    await recordAuthSession({headers:{'x-forwarded-for':'203.0.113.'+(i+1),'x-vercel-ip-country':'DE'}},'Рустам','pin',{...store,now:Date.UTC(2026,9,10,10,i)});
  }
  await recordAuthSession({headers:{'x-forwarded-for':'198.51.100.4','x-vercel-ip-country':'RU'}},'Диана','telegram',{...store,now:Date.UTC(2026,9,10,10,9)});
  const rustam=await listAuthSessions('Рустам',store);
  const diana=await listAuthSessions('Диана',store);
  assert.equal(rustam.length,5);
  assert.equal(rustam[0].ip,'203.0.113.7');
  assert.equal(rustam[4].ip,'203.0.113.3');
  assert.equal(rustam[0].countryCode,'DE');
  assert.equal(rustam[0].country,'Германия');
  assert.equal(diana.length,1);
  assert.equal(diana[0].ip,'198.51.100.4');
});

test('missing and invalid IP are not invented; malformed entries are ignored',async()=>{
  const store=memoryStore();
  const record=await recordAuthSession({headers:{'x-forwarded-for':'malformed','x-vercel-ip-country':'ZZ'}},'Рустам','face-id',{...store,now:Date.UTC(2026,9,10,10,0)});
  assert.equal(record.ip,'');
  assert.equal(record.country,'Не определена');
  assert.equal(requestIp({headers:{'x-forwarded-for':'::ffff:203.0.113.18, 10.0.0.1'}}),'203.0.113.18');
  assert.equal(requestCountryCode({headers:{'x-vercel-ip-country':'gb'}}),'GB');
  assert.deepEqual(normalizeSessions([{createdAt:'not-a-date',ip:'4.4.4.4'}]),[]);
});

test('Face ID settings show confirmation and keep registration errors visible',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const partner=fs.readFileSync('api/partner-message.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/settingsFaceIdConnecting=true/);
  assert.match(app,/const confirmation=await passkeyRequest\('status'\)/);
  assert.match(app,/if\(!confirmation\.configured\)throw new Error\('rudi-passkey-confirmation-failed'\)/);
  assert.match(app,/status\.textContent=faceIdConnectionError\(error\)/);
  assert.match(app,/renewFaceIdPreparation\(seq,button\)/);
  assert.match(app,/settingsAuthSessionsList/);
  assert.match(app,/auth-sessions/);
  assert.match(css,/\.settings-auth-session-item/);
  assert.match(partner,/action === 'auth-sessions'/);
  assert.match(partner,/authorizeRequest\(req, body\.initData, options\)/);
  assert.match(partner,/await safelyRecordAuthSession\(req, verified\.actor, 'face-id', options\)/);
});
