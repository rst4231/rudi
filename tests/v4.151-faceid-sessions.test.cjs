const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {requestOrigin}=require('../api/rudi-passkeys.cjs');
const {requestCity,describeDevice,recordAuthSession,listAuthSessions}=require('../api/rudi-auth-sessions.cjs');

test('Face ID RP ID always resolves to the actual canonical Safari origin',()=>{
  const req={headers:{
    host:'rudi-internal-appteamstore.vercel.app',
    'x-forwarded-host':'rudi-preview-appteamstore.vercel.app',
    origin:'https://spb-daily-guide-bot.vercel.app',
    'x-forwarded-proto':'https',
  }};
  assert.deepEqual(requestOrigin(req),{
    rpID:'spb-daily-guide-bot.vercel.app',
    origin:'https://spb-daily-guide-bot.vercel.app'
  });
  assert.deepEqual(requestOrigin({headers:{
    host:'spb-daily-guide-bot.vercel.app',
    'x-forwarded-host':'rudi-preview-appteamstore.vercel.app',
    'x-forwarded-proto':'https'
  }}),{
    rpID:'spb-daily-guide-bot.vercel.app',
    origin:'https://spb-daily-guide-bot.vercel.app'
  });
});

test('Untrusted origin cannot hijack RUDI RP ID',()=>{
  const rp=requestOrigin({headers:{
    host:'spb-daily-guide-bot.vercel.app',
    origin:'https://evil.example',
    'x-forwarded-proto':'https'
  }});
  assert.equal(rp.rpID,'spb-daily-guide-bot.vercel.app');
});

test('Telegram-like history preserves browser, device, city, country, IP, and timestamp',async()=>{
  const rows=new Map();
  const options={
    readState:async(actor,key)=>rows.get(actor+':'+key)||null,
    writeState:async(actor,key,value)=>{rows.set(actor+':'+key,value)},
    now:Date.UTC(2026,9,10,14,0,0),
    clientMode:'pwa'
  };
  const req={headers:{
    'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'x-vercel-forwarded-for':'203.0.113.18',
    'x-vercel-ip-country':'DE',
    'x-vercel-ip-city':'Berlin'
  }};
  await recordAuthSession(req,'Рустам','pin',options);
  const result=await listAuthSessions('Рустам',options);
  assert.equal(result.length,1);
  assert.equal(result[0].platform,'phone');
  assert.equal(result[0].device,'iPhone');
  assert.equal(result[0].browser,'РуДи (приложение)');
  assert.equal(result[0].city,'Berlin');
  assert.equal(result[0].country,'Германия');
  assert.equal(result[0].ip,'203.0.113.18');
  assert.equal(result[0].method,'pin');
  assert.equal((await listAuthSessions('Диана',options)).length,0);
  assert.equal(requestCity({headers:{'x-vercel-ip-city':'S%C3%A3o%20Paulo'}}),'São Paulo');
  assert.equal(describeDevice(req,'browser').browser,'Safari');
});

test('Face ID keeps native user gesture and logs only technical diagnostic fields',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const start=app.indexOf('async function connectFaceIdFromSettings()');
  const end=app.indexOf('function updateSettingsVersion()',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  assert.match(block,/navigator\.credentials\.create\(\{publicKey:prepared\.publicKey\}\)/);
  assert.match(block,/requestedRp!==window\.location\.hostname\.toLowerCase\(\)/);
  assert.match(block,/const confirmation=await passkeyRequest\('status'\)/);
  assert.match(block,/reportFaceIdError\(error/);
  assert.match(app,/settings-auth-session-badge/);
  assert.match(css,/v4\.151 Telegram-like security sessions/);
  assert.match(api,/operation === 'client-error'/);
  assert.doesNotMatch(api,/console\.warn\('RUDI_PASSKEY_CLIENT_ERROR',\s*JSON\.stringify\(\{[^}]*password/i);
});
