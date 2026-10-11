'use strict';
const crypto = require('node:crypto');
const { createRudiStateClient } = require('./rudi-state-client.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readFinanceState, syncLinkedWalletBalance } = require('./finance-store.cjs');
const { readMarketTicker } = require('./market-ticker.cjs');
const { readLpPositions } = require('./uniswap-lp.cjs');

const NS = 'rudi-crypto-wallet-connections-v1';
const KEY = 'rustam';
const REFRESH_MS = 10 * 60 * 1000;
const RPC_URLS = ['https://ethereum-rpc.publicnode.com', 'https://public.1rpc.io/eth'];
const BYBIT_URL = 'https://api.bybit.com';
const ARBITRUM_RPC_URLS = ['https://arb1.arbitrum.io/rpc','https://arbitrum-one-rpc.publicnode.com'];
const ETHEREUM_TOKENS = [
  { symbol: 'USDT', contract: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
  { symbol: 'USDC', contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  { symbol: 'WETH', contract: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
];
const LP_NFT_CONTRACTS = [
  '0xc36442b4a4522e871399cd717abdd847ab11fe88', // Uniswap V3
  '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e', // Uniswap V4 mainnet
];
const NETWORKS = {
  ethereum: {name:'Ethereum Mainnet', chainId:1n, rpcUrls:RPC_URLS, tokens:ETHEREUM_TOKENS},
  arbitrum: {
    name:'Arbitrum One', chainId:42161n, rpcUrls:ARBITRUM_RPC_URLS,
    tokens:[
      {symbol:'WETH', contract:'0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals:18},
      {symbol:'USDC', contract:'0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals:6},
      {symbol:'USDC.e', contract:'0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', decimals:6},
      {symbol:'USDT', contract:'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals:6},
    ],
  },
};
function networkOf(chain) {
  const name=String(chain||'ethereum').toLowerCase();
  if(!NETWORKS[name])throw new Error('crypto-network-unsupported');
  return {name, ...NETWORKS[name]};
}
let mutationTail = Promise.resolve();

function owner(actor) {
  if (actor !== 'Рустам') throw new Error('crypto-owner-only');
}
function lock(task) {
  const result = mutationTail.then(task, task);
  mutationTail = result.catch(() => {});
  return result;
}
function stateClient(options = {}) {
  return options.client || createRudiStateClient(options);
}
async function readState(options = {}) {
  const row = await stateClient(options).getRecord(NS, KEY);
  const value = row?.value;
  return value && typeof value === 'object' && !Array.isArray(value) && value.connections && typeof value.connections === 'object'
    ? value.connections : {};
}
async function writeState(connections, options = {}) {
  await stateClient(options).setRecord({
    namespace: NS,
    key: KEY,
    value: { connections },
    tags: ['rudi-crypto-wallets', 'Рустам'],
    expires_at: null,
    updated_at: new Date().toISOString(),
  });
}
function encryptionKey() {
  const custom = String(process.env.RUDI_CRYPTO_ENCRYPTION_KEY || '').trim();
  if (custom) {
    if (/^[a-f0-9]{64}$/i.test(custom)) return Buffer.from(custom, 'hex');
    const raw = Buffer.from(custom, 'base64');
    if (raw.length === 32) return raw;
    throw new Error('crypto-encryption-config-invalid');
  }
  // The already configured Telegram bot secret is a server-side fallback.
  // A separate RUDI_CRYPTO_ENCRYPTION_KEY is preferable so bot rotation does not affect encrypted data.
  const botToken = resolveTelegramBotToken();
  if (!botToken) throw new Error('crypto-encryption-unavailable');
  return crypto.createHmac('sha256', botToken).update('rudi-crypto-wallet-keys-v1').digest();
}
function encryptSecret(apiKey, apiSecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const raw = Buffer.concat([cipher.update(JSON.stringify({ apiKey, apiSecret }), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), raw.toString('base64url')].join('.');
}
function decryptSecret(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('crypto-credentials-unavailable');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[1], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8'));
}
async function jsonResponse(url, init = {}, options = {}) {
  const response = await (options.fetchImpl || fetch)(url, { ...init, signal: AbortSignal.timeout(11000), cache: 'no-store' });
  if (!response.ok) throw new Error('crypto-provider-unavailable');
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('crypto-provider-invalid-response');
  return data;
}
async function bybitGet(path, query, keys, options = {}) {
  const params = new URLSearchParams(query || {});
  const search = params.toString();
  const timestamp = String(Date.now());
  const window = '5000';
  const signature = crypto.createHmac('sha256', keys.apiSecret)
    .update(timestamp + keys.apiKey + window + search).digest('hex');
  const url = BYBIT_URL + path + (search ? '?' + search : '');
  const data = await jsonResponse(url, {
    headers: { 'X-BAPI-API-KEY': keys.apiKey, 'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': window, 'X-BAPI-SIGN': signature, 'X-BAPI-SIGN-TYPE': '2' },
  }, options);
  if (Number(data.retCode) !== 0) throw new Error('crypto-bybit-api-rejected');
  return data.result || {};
}
async function marketRates(options = {}) {
  // Use the same cached Kraken-backed prices as the rest of RUDI.
  // Bybit rejects requests originating from US IPs (Vercel iad1), so
  // an Ethereum wallet must never depend on the Bybit market API.
  let ticker;
  try { ticker = await readMarketTicker(options); }
  catch (_) { throw new Error('crypto-price-unavailable'); }
  const rows = new Map((ticker.items || []).map(item => [String(item.id || ''), Number(item.value)]));
  const ethUsd = rows.get('ethusdt');
  const usdtUsd = rows.get('usdtusd');
  if (!(ethUsd > 0) || !(usdtUsd > 0)) throw new Error('crypto-price-unavailable');
  return { USD: 1, ETH: ethUsd, WETH: ethUsd, USDT: usdtUsd, USDC: 1, 'USDC.e':1 };
}
async function bybitSnapshot(keys, options = {}) {
  // The UNIFIED account includes spot, derivatives and total equity.
  // Funding balances require explicit coin filters in newer Bybit API
  // versions; do not represent an unenumerated partial result as all assets.
  const unified = await bybitGet('/v5/account/wallet-balance', { accountType: 'UNIFIED' }, keys, options);
  const account = Array.isArray(unified.list) ? unified.list.find(row => row.accountType === 'UNIFIED') : null;
  if (!account || account.totalEquity === undefined || account.totalEquity === null || account.totalEquity === '') {
    throw new Error('crypto-bybit-balance-unavailable');
  }
  const value = Number(account.totalEquity);
  if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('crypto-balance-invalid');
  const assets = [];
  for (const row of account.coin || []) {
    const amount = Number(row.walletBalance);
    if (!row.coin || !Number.isFinite(amount) || amount === 0) continue;
    assets.push({ symbol: String(row.coin), amount, source: 'Unified' });
  }
  return { balanceUsd: Math.round(value * 1e8) / 1e8,
    assets: assets.slice(0, 100),
    scope: 'Bybit Unified',
    warning: 'Funding и отдельные субаккаунты не включены в баланс' };
}

function paddedAddress(address) { return address.slice(2).toLowerCase().padStart(64, '0'); }
async function rpc(method, params, options = {}) {
  const request = {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  };
  const endpoints = options.rpcUrls || RPC_URLS;
  for (const endpoint of endpoints) {
    try {
      const payload = await jsonResponse(endpoint, request, options);
      if (payload.error || typeof payload.result !== 'string' || !/^0x[0-9a-f]*$/i.test(payload.result)) {
        throw new Error('crypto-rpc-invalid-response');
      }
      return BigInt(payload.result === '0x' ? '0x0' : payload.result);
    } catch (_) {
      // Fail over to a different Ethereum RPC. Never print addresses,
      // credentials or upstream responses in runtime logs.
    }
  }
  throw new Error('crypto-rpc-unavailable');
}
function unitAmount(raw, decimals) {
  const unit = 10n ** BigInt(decimals);
  return Number(raw / unit) + Number(raw % unit) / Number(unit);
}
async function uniswapSnapshot(address, options = {}) {
  const chain=networkOf(options.chain);
  const chainOptions={...options,chain:chain.name,rpcUrls:options.rpcUrls||chain.rpcUrls};
  // Verify RPC network before reading any balances. Never silently switch chain
  // when a configured gateway points to the wrong network.
  if(await rpc('eth_chainId',[],chainOptions)!==chain.chainId)throw new Error('crypto-network-rpc-mismatch');
  const call = contract => rpc('eth_call', [{to:contract,data:'0x70a08231'+paddedAddress(address)},'latest'], chainOptions);
  const [eth,...tokenBalances] = await Promise.all([
    rpc('eth_getBalance',[address,'latest'],chainOptions),
    ...chain.tokens.map(token=>call(token.contract)),
  ]);
  const prices = await marketRates(options);
  const assets = [{symbol:'ETH',amount:unitAmount(eth,18)}];
  for(let i=0;i<chain.tokens.length;i++)assets.push({
    symbol:chain.tokens[i].symbol,
    amount:unitAmount(tokenBalances[i],chain.tokens[i].decimals),
  });
  let walletUsd=0;
  for(const item of assets){
    if(!Number.isFinite(item.amount)||item.amount<0||!(prices[item.symbol]>0))throw new Error('crypto-price-incomplete');
    walletUsd+=item.amount*prices[item.symbol];
  }
  // Do not silently omit v3/v4 NFTs or price unknown LP assets at zero.
  // On ANY incomplete NFT/indexer/fee read the linked wallet's old balance
  // remains intact via refresh() catch and atomic balance mutation.
  const lp=await readLpPositions(address,prices,{rpc,options:chainOptions});
  const total=walletUsd+lp.liquidityUsd+lp.feesUsd;
  if(!Number.isFinite(total)||total<0||total>1e12)throw new Error('crypto-balance-invalid');
  return {
    balanceUsd:Math.round(total*1e8)/1e8,
    walletUsd:Math.round(walletUsd*1e8)/1e8,
    liquidityUsd:Math.round(lp.liquidityUsd*1e8)/1e8,
    feesUsd:Math.round(lp.feesUsd*1e8)/1e8,
    positions:lp.positions.map(p=>({...p,chain:chain.name})),
    assets:assets.filter(x=>x.amount>0),
    scope:chain.name+' · кошелёк, Uniswap v3/v4 LP и суммы к получению',
    warning:lp.positions.some(x=>x.claimableIncludesPrincipal)
      ?'v3: сумма к получению может включать ранее снятую ликвидность; это не обязательно только заработанные комиссии.'
      :'Комиссии в расчёте — начисленные, но ещё не полученные. Выведенные комиссии уже входят в баланс кошелька.',
  };
}
function safeConnection(walletId, conn) {
  return {
    walletId, provider: conn.provider, address: conn.address || '',
    chain: conn.provider==='uniswap'?(conn.chain||'ethereum'):'',
    connectedAt: conn.connectedAt || '', lastSyncAt: conn.lastSyncAt || '',
    balanceUsd: Number.isFinite(conn.balanceUsd) ? conn.balanceUsd : null,
    assets: Array.isArray(conn.assets) ? conn.assets : [],
    positions: Array.isArray(conn.positions) ? conn.positions : [],
    walletUsd: Number.isFinite(conn.walletUsd) ? conn.walletUsd : null,
    liquidityUsd: Number.isFinite(conn.liquidityUsd) ? conn.liquidityUsd : null,
    feesUsd: Number.isFinite(conn.feesUsd) ? conn.feesUsd : null,
    scope: conn.scope || '', warning: conn.warning || '', lastError: conn.lastError || '',
  };
}
async function list(actor, options = {}) {
  owner(actor);
  const links = await readState(options);
  return Object.entries(links).map(([id, conn]) => safeConnection(id, conn));
}
async function assertWallet(walletId, options = {}) {
  const state = await readFinanceState(options);
  const wallet = (state.wallets['Рустам'] || []).find(w => w.id === walletId && !w.archived);
  if (!wallet) throw new Error('crypto-wallet-not-found');
  if (wallet.type === 'credit') throw new Error('crypto-wallet-credit-unsupported');
  if (!['RUB','USD','EUR','USDT','BTC','ETH'].includes(wallet.currency)) throw new Error('crypto-wallet-currency-unsupported');
  return wallet;
}
async function connect(actor, input = {}, options = {}) {
  owner(actor);
  const walletId = String(input.walletId || '').trim();
  const provider = String(input.provider || '').toLowerCase();
  if (!walletId || walletId.length > 100 || !['bybit', 'uniswap'].includes(provider)) throw new Error('crypto-input-invalid');
  await assertWallet(walletId, options);
  let secret = '', address = '', chain = 'ethereum';
  if (provider === 'bybit') {
    const apiKey = String(input.apiKey || '').trim(), apiSecret = String(input.apiSecret || '').trim();
    if (!/^[\w-]{8,150}$/.test(apiKey) || !/^[\w-]{8,200}$/.test(apiSecret)) throw new Error('crypto-credentials-invalid');
    const details = await bybitGet('/v5/user/query-api', {}, { apiKey, apiSecret }, options);
    if (Number(details.readOnly) !== 1) throw new Error('crypto-bybit-readonly-required');
    // Validate wallet read access before persisting anything.
    await bybitSnapshot({ apiKey, apiSecret }, options);
    secret = encryptSecret(apiKey, apiSecret);
  } else {
    if (!['ethereum-mainnet-spot-only','ethereum-mainnet-including-lp','arbitrum-one-including-lp'].includes(String(input.scopeConfirm || ''))) throw new Error('crypto-uniswap-scope-confirm-required');
    chain=networkOf(input.chain||'ethereum').name;
    if(chain==='arbitrum'&&input.scopeConfirm!=='arbitrum-one-including-lp')throw new Error('crypto-uniswap-scope-confirm-required');
    if(chain==='ethereum'&&input.scopeConfirm==='arbitrum-one-including-lp')throw new Error('crypto-uniswap-scope-confirm-required');
    address = String(input.address || '').trim();
    if (!/^0x[a-f0-9]{40}$/i.test(address)) throw new Error('crypto-address-invalid');
    // An address may contain LP positions. Save its public address, but never
    // overwrite the manually entered balance if the portfolio cannot be valued.
  }
  return lock(async () => {
    const connections = await readState(options);
    connections[walletId] = { provider, address, secret, chain:provider==='uniswap'?chain:'', connectedAt: new Date().toISOString(),
      lastSyncAt: '', balanceUsd: null, lastError: '', assets: [] };
    await writeState(connections, options);
    return safeConnection(walletId, connections[walletId]);
  });
}
async function disconnect(actor, walletId, options = {}) {
  owner(actor);
  const id = String(walletId || '').trim();
  return lock(async () => {
    const connections = await readState(options);
    delete connections[id];
    await writeState(connections, options);
    return true;
  });
}
// Change only the selected blockchain, keeping the wallet ID and public
// address. Clear last sync data so values from a different chain cannot be
// mistaken for current holdings.
async function setChain(actor, walletId, chain, options={}) {
  owner(actor);
  const name=networkOf(chain).name;
  const id=String(walletId||'').trim();
  await assertWallet(id,options);
  return lock(async()=>{
    const links=await readState(options),conn=links[id];
    if(!conn || conn.provider!=='uniswap')throw new Error('crypto-wallet-not-found');
    if((conn.chain||'ethereum')===name)return safeConnection(id,conn);
    Object.assign(conn,{chain:name,lastSyncAt:'',balanceUsd:null,walletUsd:null,
      liquidityUsd:null,feesUsd:null,assets:[],positions:[],scope:'',warning:'',lastError:''});
    await writeState(links,options);
    return safeConnection(id,conn);
  });
}

async function usdToWalletCurrency(balanceUsd, currency, options = {}) {
  const code = String(currency || '').toUpperCase();
  if (code === 'USD') return balanceUsd;
  const ticker = await readMarketTicker(options);
  const rates = new Map((ticker.items || []).map(item => [String(item.id || ''), Number(item.value)]));
  const usdRub = rates.get('usd-rub'), eurRub = rates.get('eur-rub');
  const btcUsd = rates.get('btcusdt'), ethUsd = rates.get('ethusdt');
  const usdtUsd = rates.get('usdtusd');
  let converted = NaN;
  if (code === 'USDT' && usdtUsd > 0) converted = balanceUsd / usdtUsd;
  if (code === 'RUB' && usdRub > 0) converted = balanceUsd * usdRub;
  if (code === 'EUR' && usdRub > 0 && eurRub > 0) converted = balanceUsd * usdRub / eurRub;
  if (code === 'BTC' && btcUsd > 0) converted = balanceUsd / btcUsd;
  if (code === 'ETH' && ethUsd > 0) converted = balanceUsd / ethUsd;
  if (!Number.isFinite(converted) || converted < 0 || converted > 1e12) throw new Error('crypto-conversion-unavailable');
  return Math.round(converted * 1e8) / 1e8;
}

async function refresh(actor, options = {}) {
  owner(actor);
  return lock(async () => {
    const connections = await readState(options);
    const now = Date.now();
    const summary = [];
    let changed = false;
    for (const [id, connection] of Object.entries(connections)) {
      const last = Date.parse(connection.lastSyncAt || '') || 0;
      if (!options.force && now - last < REFRESH_MS) { summary.push(safeConnection(id, connection)); continue; }
      try {
        const wallet = await assertWallet(id, options);
        const snapshot = connection.provider === 'bybit'
          ? await bybitSnapshot(decryptSecret(connection.secret), options)
          : await uniswapSnapshot(connection.address, { ...options, chain:connection.chain||'ethereum' });
        const balanceNative = await usdToWalletCurrency(snapshot.balanceUsd, wallet.currency, options);
        await syncLinkedWalletBalance('Рустам', id, balanceNative, options);
        Object.assign(connection, snapshot, { lastSyncAt: new Date().toISOString(), lastError: '' });
        changed = true;
      } catch (error) {
        const code = String(error?.message || '');
        // Never persist/log upstream provider errors that might contain credentials.
        connection.lastError = code.startsWith('crypto-') ? code : 'crypto-sync-unavailable';
        changed = true;
      }
      summary.push(safeConnection(id, connection));
    }
    if (changed) await writeState(connections, options);
    return summary;
  });
}
module.exports = { NS, KEY, REFRESH_MS, list, connect, disconnect, setChain, refresh,
  encryptSecret, decryptSecret, bybitGet, bybitSnapshot, uniswapSnapshot, marketRates, usdToWalletCurrency };
