const test=require('node:test');
const assert=require('node:assert/strict');
const {requestOrigin,registrationOptions,verifyRegistration}=require('../api/rudi-passkeys.cjs');
const DENO='https://rudi-proxy.rst4231.deno.net';
function req(extra={}){return {headers:{host:'spb-daily-guide-bot.vercel.app','x-forwarded-host':'spb-daily-guide-bot.vercel.app','x-forwarded-proto':'https','x-rudi-proxy':'deno','x-rudi-public-origin':DENO,origin:DENO,...extra}}}
test('Deno proxy registration binds WebAuthn to the visible Deno hostname',()=>{
  assert.deepEqual(requestOrigin(req()),{rpID:'rudi-proxy.rst4231.deno.net',origin:DENO});
});
test('Deno Origin fallback works if proxy headers are removed',()=>{
  assert.deepEqual(requestOrigin(req({'x-rudi-proxy':'','x-rudi-public-origin':''})),{rpID:'rudi-proxy.rst4231.deno.net',origin:DENO});
});
test('Untrusted proxy origin and forged arbitrary browser Origin are ignored',()=>{
  const invalid=req({'x-rudi-public-origin':'https://evil.rst4231.deno.net',origin:'https://evil.example'});
  assert.deepEqual(requestOrigin(invalid),{rpID:'spb-daily-guide-bot.vercel.app',origin:'https://spb-daily-guide-bot.vercel.app'});
});
test('Existing Render and Vercel authentication origins continue working',()=>{
  assert.equal(requestOrigin(req({'x-rudi-proxy':'render','x-rudi-public-origin':'https://rudi-proxy.onrender.com',origin:'https://rudi-proxy.onrender.com'})).rpID,'rudi-proxy.onrender.com');
  assert.equal(requestOrigin(req({'x-rudi-proxy':'','x-rudi-public-origin':'',origin:'https://spb-daily-guide-bot.vercel.app'})).rpID,'spb-daily-guide-bot.vercel.app');
});
test('Deno challenge registration and verification use the same origin/RP ID',async()=>{
  const map=new Map();
  const cache={get:async key=>map.get(key)||null,set:async(key,v)=>map.set(key,structuredClone(v))};
  const webauthn={
    generateRegistrationOptions:async data=>{assert.equal(data.rpID,'rudi-proxy.rst4231.deno.net');return {challenge:'placeholder'}},
    verifyRegistrationResponse:async data=>{assert.equal(data.expectedOrigin,DENO);assert.equal(data.expectedRPID,'rudi-proxy.rst4231.deno.net');return {verified:true,registrationInfo:{credential:{id:'deno-credential',publicKey:new Uint8Array([1,2,3]),counter:0,transports:['internal']},credentialDeviceType:'multiDevice',credentialBackedUp:true}}}
  };
  const options={botToken:'123456:proxy-test',cache,webauthn,now:Date.UTC(2026,9,10,15)};
  const setup=await registrationOptions(req(),'Рустам',options);
  const verified=await verifyRegistration(req(),'Рустам',setup.challenge,{id:'deno-credential'},options);
  assert.equal(verified.configured,true);
  assert.equal(verified.passkeys[0].rpID,'rudi-proxy.rst4231.deno.net');
});
