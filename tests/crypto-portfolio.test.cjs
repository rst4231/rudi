'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertOwner,safeConfig,safePortfolio,encryptCredentials,decryptCredentials,
  verifyBybitReadOnly,units,
} = require('../api/crypto-handler.cjs');
const {positionAmounts,readV3Positions} = require('../api/crypto-uniswap.cjs');

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

test('Uniswap V3 computes in-range amounts and displays values without signing transactions',async()=>{
  const amounts=positionAmounts(1000000n,-60,60,2n**96n);
  assert.ok(amounts.raw0>0);
  assert.ok(amounts.raw1>0);
  const word=value=>BigInt(value).toString(16).padStart(64,'0');
  const addr=value=>value.slice(2).toLowerCase().padStart(64,'0');
  const wallet='0x'+'1'.repeat(40);
  const token0='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const token1='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const pool='0x'+'3'.repeat(40);
  const rpc=async(to,data)=>{
    const selector=data.slice(0,10);
    if(selector==='0x70a08231')return '0x'+word(1);
    if(selector==='0x2f745c59')return '0x'+word(123);
    if(selector==='0x99fbab88')return '0x'+[
      word(0),word(0),addr(token0),addr(token1),word(3000),
      word(BigInt.asUintN(256,-120n)),word(120),word(100000000000n),
      word(0),word(0),word(1000000),word(100000000000000000n)
    ].join('');
    if(selector==='0x1698ee82')return '0x'+addr(pool);
    if(selector==='0x3850c7bd')return '0x'+[
      word(2n**96n),word(0),word(0),word(0),word(0),word(0),word(0)
    ].join('');
    throw Error('unsupported-mock-contract-call');
  };
  const positions=await readV3Positions(wallet,{usd:2500},rpc);
  assert.equal(positions.positions.length,1);
  assert.equal(positions.positions[0].id,'123');
  assert.equal(positions.positions[0].pair,'USDC/WETH');
  assert.equal(positions.positions[0].feeTier,3000);
  assert.equal(positions.positions[0].inRange,true);
  assert.ok(positions.positions[0].valueUsd>0);
});
