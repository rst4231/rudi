'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertOwner,safeConfig,safePortfolio,encryptCredentials,decryptCredentials,
  verifyBybitReadOnly,units,
} = require('../api/crypto-handler.cjs');

test('cryptocurrency access is exclusively Rustam',()=>{
  assert.doesNotThrow(()=>assertOwner('Рустам'));
  assert.throws(()=>assertOwner('Диана'),/crypto-owner-only/);
  assert.throws(()=>assertOwner(''),/crypto-owner-only/);
});

test('wallet list accepts only valid public Ethereum addresses',()=>{
  const wallet='0x'+('a'.repeat(40));
  const config=safeConfig({addresses:[wallet,'wallet','0x123']});
  assert.deepEqual(config.addresses,[wallet]);
  assert.deepEqual(safeConfig({addresses:[wallet]}).addresses,[wallet]);
});

test('portfolio preserves missing dollar total instead of fabricating zero',()=>{
  assert.equal(safePortfolio({totalUsd:null}).totalUsd,null);
  assert.equal(safePortfolio({}).totalUsd,null);
  assert.equal(safePortfolio({totalUsd:0}).totalUsd,0);
});

test('Bybit secret and key are encrypted with AES-GCM at rest',()=>{
  const env={RUDI_CRYPTO_MASTER_KEY:'only-for-tests-and-never-production'};
  const secret={apiKey:'key-ABC123987654',apiSecret:'secret-ABC123987654'};
  const encrypted=encryptCredentials(secret,env);
  assert.equal(encrypted.version,1);
  assert.equal(JSON.stringify(encrypted).includes(secret.apiSecret),false);
  assert.equal(JSON.stringify(encrypted).includes(secret.apiKey),false);
  assert.deepEqual(decryptCredentials(encrypted,env),secret);
  assert.throws(()=>decryptCredentials(encrypted,{RUDI_CRYPTO_MASTER_KEY:'incorrect-key'}));
});

test('read-only Bybit key is mandatory',async()=>{
  const buildResponse=readOnly=>async()=>({
    ok:true,json:async()=>({retCode:0,result:{readOnly}})
  });
  await assert.rejects(
    verifyBybitReadOnly('api-key','api-secret',buildResponse(0)),
    /crypto-bybit-readonly-required/
  );
  const result=await verifyBybitReadOnly('api-key','api-secret',buildResponse(1));
  assert.equal(result.readOnly,1);
});

test('ERC-20 balances decode fractional amounts correctly',()=>{
  assert.equal(units('1500000',6),1.5);
  assert.equal(units('1000000000000000000',18),1);
  assert.equal(units('0',18),0);
});