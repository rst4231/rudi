const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {
  ISSUER,AUDIENCE,REPOSITORY,WORKFLOW_REF,verifyGitHubActionsToken,resetJwksCacheForTests
}=require('../api/github-actions-oidc.cjs');

function tokenFor(payload,privateKey,kid='test-key'){
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input=header+'.'+body;
  const sig=crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  return input+'.'+sig;
}

test.beforeEach(()=>resetJwksCacheForTests());

test('GitHub Actions OIDC token is accepted only for the Lulu workflow on main',async()=>{
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk=publicKey.export({format:'jwk'});
  jwk.kid='test-key';
  const now=Date.parse('2026-09-25T14:00:00.000Z');
  const nowSec=Math.floor(now/1000);
  const payload={
    iss:ISSUER,aud:AUDIENCE,repository:REPOSITORY,ref:'refs/heads/main',
    event_name:'schedule',workflow_ref:WORKFLOW_REF,iat:nowSec-10,exp:nowSec+300
  };
  const token=tokenFor(payload,privateKey);
  assert.ok(await verifyGitHubActionsToken(token,{jwks:{keys:[jwk]},now}));
  assert.equal(await verifyGitHubActionsToken(tokenFor({...payload,repository:'other/repo'},privateKey),{jwks:{keys:[jwk]},now}),null);
});
