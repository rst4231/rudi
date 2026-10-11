'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('public/crypto-wallets.js','utf8');
test('crypto cards do not render repetitive partial-balance badges',()=>{
  assert.ok(!src.includes("badge.textContent='Частичный баланс'"));
  assert.ok(!src.includes("card.append(badge)"));
});
test('incomplete wallet data remains guarded and is not considered exact PNL',()=>{
  assert.match(src,/link\.incomplete&&typeof link\.partialUsd==='number'/);
  assert.match(src,/if\(link\.lastError\)complete=false/);
  assert.match(src,/pnlBadge\(pnl24h\?\.items/);
});
