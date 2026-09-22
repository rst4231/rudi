const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requestOrigin,
  passkeyStatus,
  registrationOptions,
  verifyRegistration,
  authenticationOptions,
  verifyAuthentication,
} = require('../api/rudi-passkeys.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value) { map.set(key, structuredClone(value)); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

function req(host='spb-daily-guide-bot.vercel.app') {
  return { headers: { host, 'x-forwarded-proto':'https' } };
}

test('passkey origin is bound to the current RUDI host', () => {
  assert.deepEqual(requestOrigin(req()), {
    rpID:'spb-daily-guide-bot.vercel.app',
    origin:'https://spb-daily-guide-bot.vercel.app',
  });
});

test('registration stores only public credential material and enables status', async () => {
  const cache=memoryCache();
  const webauthn={
    async generateRegistrationOptions(input){
      assert.equal(input.userName,'Рустам');
      assert.equal(input.authenticatorSelection.userVerification,'preferred');
      assert.equal(input.authenticatorSelection.residentKey,'preferred');
      assert.equal(input.preferredAuthenticatorType,'localDevice');
      assert.deepEqual(input.supportedAlgorithmIDs,[-8,-7,-257]);
      return { challenge:'reg-challenge', user:{id:'abc',name:'Рустам',displayName:'Рустам'} };
    },
    async verifyRegistrationResponse(input){
      assert.equal(input.expectedChallenge,'reg-challenge');
      assert.equal(input.requireUserVerification,true);
      return {
        verified:true,
        registrationInfo:{
          credential:{id:'cred-r',publicKey:new Uint8Array([1,2,3]),counter:0,transports:['internal']},
          credentialDeviceType:'multiDevice',
          credentialBackedUp:true,
        },
      };
    },
  };
  const opts={cache,webauthn,now:Date.UTC(2026,8,22)};
  const generated=await registrationOptions(req(),'Рустам',opts);
  const saved=await verifyRegistration(req(),'Рустам',generated.challenge,{id:'cred-r'},opts);
  assert.equal(saved.actor,'Рустам');
  assert.deepEqual(await passkeyStatus(req(),'Рустам',opts),{
    configured:true,count:1,rpID:'spb-daily-guide-bot.vercel.app',
  });
  assert.doesNotMatch(JSON.stringify(await cache.get('passkeys:Рустам')),/secret|private/i);
});

test('authentication resolves the credential owner and advances counter', async () => {
  const cache=memoryCache();
  const webauthn={
    async generateRegistrationOptions(){return {challenge:'reg-d',user:{id:'d'}}},
    async verifyRegistrationResponse(){
      return {
        verified:true,
        registrationInfo:{
          credential:{id:'cred-d',publicKey:new Uint8Array([8,9]),counter:2,transports:['internal']},
          credentialDeviceType:'multiDevice',
          credentialBackedUp:true,
        },
      };
    },
    async generateAuthenticationOptions(input){
      assert.equal(input.userVerification,'required');
      return {challenge:'auth-challenge',allowCredentials:input.allowCredentials};
    },
    async verifyAuthenticationResponse(input){
      assert.equal(input.credential.id,'cred-d');
      assert.equal(input.credential.counter,2);
      assert.equal(input.requireUserVerification,true);
      return {verified:true,authenticationInfo:{newCounter:3}};
    },
  };
  const opts={cache,webauthn,now:Date.UTC(2026,8,22)};
  const reg=await registrationOptions(req(),'Диана',opts);
  await verifyRegistration(req(),'Диана',reg.challenge,{id:'cred-d'},opts);
  const auth=await authenticationOptions(req(),opts);
  const verified=await verifyAuthentication(req(),auth.challenge,{id:'cred-d'},opts);
  assert.equal(verified.actor,'Диана');
  const rows=await cache.get('passkeys:Диана');
  assert.equal(rows[0].counter,3);
});
