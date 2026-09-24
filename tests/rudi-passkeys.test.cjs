const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requestOrigin,
  createChallengeToken,
  consumeChallenge,
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

function renderProxyReq(origin='https://rudi-proxy.onrender.com') {
  return {
    headers: {
      host:'spb-daily-guide-bot.vercel.app',
      'x-forwarded-host':'spb-daily-guide-bot.vercel.app',
      'x-forwarded-proto':'https',
      'x-rudi-proxy':'render',
      'x-rudi-public-origin':origin,
    },
  };
}

test('passkey origin is bound to the current RUDI host', () => {
  assert.deepEqual(requestOrigin(req()), {
    rpID:'spb-daily-guide-bot.vercel.app',
    origin:'https://spb-daily-guide-bot.vercel.app',
  });
});

test('passkey origin trusts only the allowlisted Render proxy origin', () => {
  assert.deepEqual(requestOrigin(renderProxyReq()), {
    rpID:'rudi-proxy.onrender.com',
    origin:'https://rudi-proxy.onrender.com',
  });

  assert.deepEqual(requestOrigin(renderProxyReq('https://evil.example')), {
    rpID:'spb-daily-guide-bot.vercel.app',
    origin:'https://spb-daily-guide-bot.vercel.app',
  });
});

test('registration and verification use the Render origin consistently', async () => {
  const cache=memoryCache();
  const webauthn={
    async generateRegistrationOptions(){
      return {challenge:'render-reg',user:{id:'render-user'}};
    },
    async verifyRegistrationResponse(input){
      assert.equal(input.expectedOrigin,'https://rudi-proxy.onrender.com');
      assert.equal(input.expectedRPID,'rudi-proxy.onrender.com');
      return {
        verified:true,
        registrationInfo:{
          credential:{id:'cred-render',publicKey:new Uint8Array([7,7,7]),counter:0,transports:['internal']},
          credentialDeviceType:'singleDevice',
          credentialBackedUp:false,
        },
      };
    },
  };
  const opts={cache,webauthn,botToken:'123456:render-test',now:Date.UTC(2026,8,24,19,50)};
  const generated=await registrationOptions(renderProxyReq(),'Рустам',opts);
  const saved=await verifyRegistration(renderProxyReq(),'Рустам',generated.challenge,{id:'cred-render'},opts);
  assert.equal(saved.configured,true);
  assert.equal(saved.passkeys[0].rpID,'rudi-proxy.onrender.com');
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
      assert.equal(typeof input.expectedChallenge,'string');
      assert.ok(input.expectedChallenge.length>40);
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
  const opts={cache,webauthn,botToken:'123456:test-secret',now:Date.UTC(2026,8,22)};
  const generated=await registrationOptions(req(),'Рустам',opts);
  const saved=await verifyRegistration(req(),'Рустам',generated.challenge,{id:'cred-r'},opts);
  assert.equal(saved.actor,'Рустам');
  assert.equal(saved.configured,true);
  assert.equal(saved.passkeys?.length,1);
  assert.equal(saved.passkeys?.[0]?.id,'cred-r');
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
  const opts={cache,webauthn,botToken:'123456:test-secret',now:Date.UTC(2026,8,22)};
  const reg=await registrationOptions(req(),'Диана',opts);
  await verifyRegistration(req(),'Диана',reg.challenge,{id:'cred-d'},opts);
  const auth=await authenticationOptions(req(),opts);
  const verified=await verifyAuthentication(req(),auth.challenge,{id:'cred-d'},opts);
  assert.equal(verified.actor,'Диана');
  assert.equal(verified.passkeys?.[0]?.counter,3);
  const rows=await cache.get('passkeys:Диана');
  assert.equal(rows[0].counter,3);
});


test('registration challenge survives a different empty serverless cache', async () => {
  const optionsCache=memoryCache();
  const verifyCache=memoryCache();
  const botToken='123456:stateless-test';
  const now=Date.UTC(2026,8,22,18,0,0);
  const webauthn={
    async generateRegistrationOptions(){
      return {challenge:'ignored-by-rudi',user:{id:'abc',name:'Рустам',displayName:'Рустам'}};
    },
    async verifyRegistrationResponse(input){
      assert.ok(input.expectedChallenge.length>40);
      assert.equal(input.expectedOrigin,'https://spb-daily-guide-bot.vercel.app');
      assert.equal(input.expectedRPID,'spb-daily-guide-bot.vercel.app');
      return {
        verified:true,
        registrationInfo:{
          credential:{id:'cred-stateless',publicKey:new Uint8Array([4,5,6]),counter:0,transports:['internal']},
          credentialDeviceType:'singleDevice',
          credentialBackedUp:false,
        },
      };
    },
  };

  const generated=await registrationOptions(req(),'Рустам',{
    cache:optionsCache,webauthn,botToken,now
  });

  assert.notEqual(generated.challenge,'ignored-by-rudi');
  assert.equal(await optionsCache.get('challenge:register:Рустам:'+generated.challenge),null);

  const result=await verifyRegistration(
    req(),
    'Рустам',
    generated.challenge,
    {id:'cred-stateless'},
    {cache:verifyCache,webauthn,botToken,now:now+1000}
  );
  assert.equal(result.configured,true);
  assert.equal(result.credentialId,'cred-stateless');
});

test('signed passkey challenge rejects tampering, wrong origin and expiration', () => {
  const botToken='123456:stateless-test';
  const now=Date.UTC(2026,8,22,18,0,0);
  const rp={rpID:'spb-daily-guide-bot.vercel.app',origin:'https://spb-daily-guide-bot.vercel.app'};
  const token=createChallengeToken('register','Рустам',rp,{botToken,now});

  assert.equal(
    consumeChallenge('register','Рустам',token,rp,{botToken,now:now+1000}).actor,
    'Рустам'
  );

  const tampered=token.slice(0,-1)+(token.endsWith('A')?'B':'A');
  assert.throws(
    ()=>consumeChallenge('register','Рустам',tampered,rp,{botToken,now:now+1000}),
    /rudi-passkey-challenge-invalid/
  );
  assert.throws(
    ()=>consumeChallenge(
      'register','Рустам',token,
      {rpID:rp.rpID,origin:'https://evil.example'},
      {botToken,now:now+1000}
    ),
    /rudi-passkey-challenge-invalid/
  );
  assert.throws(
    ()=>consumeChallenge('register','Рустам',token,rp,{botToken,now:now+11*60*1000}),
    /rudi-passkey-challenge-invalid/
  );
});
