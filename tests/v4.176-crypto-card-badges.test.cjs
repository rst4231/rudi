'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('public/crypto-wallets.js','utf8');
const css=fs.readFileSync('public/crypto-wallets.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('crypto cards do not render repetitive partial-balance badges',()=>{
  assert.ok(!src.includes("badge.textContent='Частичный баланс'"));
  assert.ok(!src.includes("card.append(badge)"));
});
test('incomplete wallet data remains guarded and is not considered exact PNL',()=>{
  assert.match(src,/link\.incomplete&&typeof link\.partialUsd==='number'/);
  assert.match(src,/if\(link\.lastError\)complete=false/);
  assert.match(src,/periodBadges\(dailyChange,monthlyChange\)/);
});

test('Uniswap pool uses per-position green/red halo; unknown status stays neutral',()=>{
  assert.match(src,/pos\.inRange===true\?'in-range':pos\.inRange===false\?'out-of-range':'unknown'/);
  assert.match(src,/box\.className='finance-crypto-lp finance-crypto-lp--'\+rangeState/);
  assert.match(src,/Диапазон не определён/);
  assert.match(css,/\.finance-crypto-lp\.finance-crypto-lp--in-range\{/);
  assert.match(css,/\.finance-crypto-lp\.finance-crypto-lp--out-of-range\{/);
  assert.match(css,/box-shadow:0 0 0 1px rgba\(36,186,112/);
  assert.match(css,/box-shadow:0 0 0 1px rgba\(232,78,94/);
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.slice(1);
  assert.ok(html.includes('/crypto-wallets.css?v='+version));
});
