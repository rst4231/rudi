'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const records = new Map();
const wallets = [
  { id: 'bybit-wallet', name: 'Bybit', currency: 'RUB', type: 'regular', balance: 100, archived: false },
  { id: 'uniswap-wallet', name: 'Uniswap', currency: 'USD', type: 'regular', balance: 800, archived: false },
];
const financeMock = {
  readFinanceState: async () => ({ wallets: { 'Рустам': wallets, 'Диана': [] } }),
  syncLinkedWalletBalance: async (actor, id, balance) => {
    assert.equal(actor, 'Рустам');
    const row = wallets.find(w => w.id === id);
    row.balance = balance;
  },
};
const client = {
  async getRecord(ns, key) { return records.get(ns + ':' + key) || null; },
  async setRecord(record) { records.set(record.namespace + ':' + record.key, { value: structuredClone(record.value) }); },
};
const rates = { items: [
  { id: 'usd-rub', value: 90 }, { id: 'eur-rub', value: 100 },
  { id: 'btcusdt', value: 60000 }, { id: 'ethusdt', value: 3000 }, { id: 'usdtusd', value: 1 },
]};
const deps = {
  './rudi-state-client.cjs': { createRudiStateClient: () => client },
  './products-bought.cjs': { resolveTelegramBotToken: () => 'test-server-only-secret' },
  './finance-store.cjs': financeMock,
  './market-ticker.cjs': { readMarketTicker: async () => rates },
};
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename?.endsWith('/api/crypto-wallets.cjs') && deps[request]) return deps[request];
  return original.apply(this, arguments);
};
let cryptoWallets;
try { cryptoWallets = require('../api/crypto-wallets.cjs'); }
finally { Module._load = original; }

const response = data => ({ ok: true, json: async () => data });
const dataFetch = async (url, init) => {
  const path = String(url);
  if (path.includes('/v5/user/query-api')) return response({ retCode: 0, result: { readOnly: 1 } });
  if (path.includes('/v5/account/wallet-balance')) return response({ retCode: 0, result: { list: [
    { accountType: 'UNIFIED', totalEquity: '200', coin: [{ coin: 'USDT', walletBalance: '200' }] },
  ] } });
  if (path.includes('/v5/asset/transfer/query-account-coins-balance')) return response({ retCode: 0, result: {
    balance: [{ coin: 'USDT', walletBalance: '100' }],
  } });
  if (path.includes('/v5/market/tickers')) return response({ retCode: 0, result: {
    list: [{ symbol: 'ETHUSDT', lastPrice: '3000' }, { symbol: 'BTCUSDT', lastPrice: '60000' }],
  } });
  if (path.includes('ethereum-rpc')) {
    const rpc = JSON.parse(init.body);
    if (rpc.method === 'eth_chainId') return response({ result: '0x1' });
    if (rpc.method === 'eth_getBalance') return response({ result: '0x0' });
    if (rpc.method === 'eth_call') {
      const address = String(rpc.params[0]?.to || '').toLowerCase();
      return response({ result: address.startsWith('0xc36442') ? '0x01' : '0x0' });
    }
  }
  throw new Error('unexpected-mock-endpoint: ' + path);
};

test('restricts API operations to the Rustam account', async () => {
  await assert.rejects(() => cryptoWallets.list('Диана', { client }), /crypto-owner-only/);
  await assert.rejects(() => cryptoWallets.refresh('Диана', { client }), /crypto-owner-only/);
  await assert.rejects(() => cryptoWallets.connect('Диана', { walletId: 'bybit-wallet' }, { client }), /crypto-owner-only/);
});

test('encrypts Bybit secrets and does not return them to the UI', async () => {
  const previous = process.env.RUDI_CRYPTO_ENCRYPTION_KEY;
  process.env.RUDI_CRYPTO_ENCRYPTION_KEY = '77'.repeat(32);
  try {
    const link = await cryptoWallets.connect('Рустам', {
      walletId: 'bybit-wallet', provider: 'bybit', apiKey: 'test-api-key-001', apiSecret: 'private-test-secret-001',
    }, { client, fetchImpl: dataFetch });
    assert.equal(link.provider, 'bybit');
    assert.equal(link.secret, undefined);
    const saved = records.get(cryptoWallets.NS + ':' + cryptoWallets.KEY).value;
    assert.doesNotMatch(JSON.stringify(saved), /private-test-secret-001|test-api-key-001/);
    const publicList = await cryptoWallets.list('Рустам', { client });
    assert.equal(publicList[0].secret, undefined);
    const result = await cryptoWallets.refresh('Рустам', { client, fetchImpl: dataFetch, force: true });
    assert.equal(result[0].balanceUsd, 200);
    assert.match(result[0].warning, /Funding/);
    assert.equal(wallets[0].balance, 18000);
  } finally {
    if (previous === undefined) delete process.env.RUDI_CRYPTO_ENCRYPTION_KEY;
    else process.env.RUDI_CRYPTO_ENCRYPTION_KEY = previous;
  }
});

test('fails closed if a Bybit API key is not read-only', async () => {
  const badFetch = async (url, init) => {
    if (String(url).includes('/v5/user/query-api')) return response({ retCode: 0, result: { readOnly: 0 } });
    return dataFetch(url, init);
  };
  await assert.rejects(() => cryptoWallets.connect('Рустам', {
    walletId: 'bybit-wallet', provider: 'bybit', apiKey: 'unsafe-key-0001', apiSecret: 'unsafe-secret-001',
  }, { client, fetchImpl: badFetch }), /crypto-bybit-readonly-required/);
});

test('protects a Uniswap LP wallet from being overwritten by its spot balance', async () => {
  await cryptoWallets.connect('Рустам', {
    walletId: 'uniswap-wallet', provider: 'uniswap', address: '0x' + 'a'.repeat(40), scopeConfirm: 'ethereum-mainnet-spot-only',
  }, { client });
  const original = wallets[1].balance;
  const result = await cryptoWallets.refresh('Рустам', { client, fetchImpl: dataFetch, force: true });
  assert.equal(wallets[1].balance, original);
  assert.equal(result.find(row => row.walletId === 'uniswap-wallet').lastError, 'crypto-lp-ownership-changed');
});

test('Ethereum uses existing price feed and switches RPC when primary returns HTTP 429', async () => {
  const visited = [];
  const resilientFetch = async (url, init) => {
    const endpoint = String(url);
    visited.push(endpoint);
    if (endpoint.includes('api.bybit.com')) throw new Error('Bybit not reachable from US');
    if (endpoint.includes('ethereum-rpc.publicnode.com')) return { ok: false, status: 429 };
    if (endpoint.includes('public.1rpc.io/eth')) {
      const payload = JSON.parse(init.body);
      if (payload.method === 'eth_chainId') return response({ result: '0x1' });
      if (payload.method === 'eth_getBalance') return response({ result: '0xde0b6b3a7640000' });
      if (payload.method === 'eth_call') return response({ result: '0x0' });
    }
    throw new Error('unexpected-url');
  };
  const snapshot = await cryptoWallets.uniswapSnapshot('0x' + 'b'.repeat(40), { fetchImpl: resilientFetch });
  assert.equal(snapshot.balanceUsd, 3000);
  assert.ok(visited.some(url => url.includes('ethereum-rpc.publicnode.com')));
  assert.ok(visited.some(url => url.includes('public.1rpc.io/eth')));
  assert.ok(!visited.some(url => url.includes('api.bybit.com')));
});

test('Arbitrum RPC only reads chain 42161 and uses Arbitrum ERC20 addresses', async () => {
  const called=[];
  const fetchImpl=async (url, init) => {
    assert.ok(String(url).includes('arbitrum'));
    const payload=JSON.parse(init.body),tx=payload.params?.[0];
    if(payload.method==='eth_chainId')return response({result:'0xa4b1'});
    if(payload.method==='eth_getBalance')return response({result:'0x0'});
    if(payload.method==='eth_call'){
      const contract=String(tx.to).toLowerCase();called.push(contract);
      if(contract==='0x82af49447d8a07e3bd95bd0d56f35241523fbab1')return response({result:'0xde0b6b3a7640000'}); // 1 WETH
      if(contract==='0xaf88d065e77c8cc2239327c5edb3a432268e5831')return response({result:'0x5f5e100'}); // 100 USDC
      return response({result:'0x0'});
    }
    throw new Error('unexpected RPC');
  };
  const result=await cryptoWallets.uniswapSnapshot('0x'+'a'.repeat(40),{
    chain:'arbitrum',fetchImpl,
  });
  assert.equal(result.balanceUsd,3100);
  assert.equal(result.positions.length,0);
  assert.match(result.scope,/arbitrum/);
  assert.ok(called.includes('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'));
  assert.ok(called.includes('0xaf88d065e77c8cc2239327c5edb3a432268e5831'));
  assert.ok(!called.includes('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'));
});

test('Arbitrum RPC wrong chain is rejected before any finance overwrite', async()=>{
  const fetchImpl=async()=>response({result:'0x1'});
  await assert.rejects(()=>cryptoWallets.uniswapSnapshot('0x'+'b'.repeat(40),{
    chain:'arbitrum',fetchImpl,
  }),/crypto-network-rpc-mismatch/);
});

test('requires explicit consent before replacing any Ethereum wallet value', async () => {
  await assert.rejects(() => cryptoWallets.connect('Рустам', {
    walletId: 'uniswap-wallet', provider: 'uniswap', address: '0x' + 'a'.repeat(40),
  }, { client }), /crypto-uniswap-scope-confirm-required/);
});

test('disconnect removes the encrypted key without clearing the finance balance', async () => {
  const before = wallets[0].balance;
  await cryptoWallets.disconnect('Рустам', 'bybit-wallet', { client });
  const items = await cryptoWallets.list('Рустам', { client });
  assert.ok(!items.some(item => item.walletId === 'bybit-wallet'));
  assert.equal(wallets[0].balance, before);
});
