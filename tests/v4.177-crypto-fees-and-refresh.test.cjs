'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'public/crypto-wallets.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/crypto-wallets.css'),'utf8');
const wallets=fs.readFileSync(path.join(root,'api/crypto-wallets.cjs'),'utf8');
const finances=fs.readFileSync(path.join(root,'api/finances.js'),'utf8');

test('Uniswap monthly figure has a truthful placeholder, no fake cumulative profit',()=>{
  assert.match(ui,/\['Комиссии в этом месяце',null\]/);
  assert.match(ui,/\['Всего комиссии',unsureFees\?null:link\.feesUsd\]/);
  assert.match(ui,/claimableIncludesPrincipal===true/);
  assert.doesNotMatch(ui,/feeNote\.textContent/); // user's requested compact UI
  assert.match(ui,/\['К получению \(включая возможную ликвидность\)',link\.feesUsd\]/);
});
test('Uniswap LP entries distinguish fees from possible returned principal',()=>{
  assert.match(ui,/pos\.claimableIncludesPrincipal\?'К получению \(возможна ликвидность\)':'Всего комиссии'/);
});
test('each crypto source offers an isolated refresh without forcing others',()=>{
  assert.match(ui,/async function refreshSource\(walletId\)/);
  assert.match(ui,/request\('crypto-refresh',\{force:true,walletId\}\)/);
  assert.match(wallets,/if\(targetId&&id!==targetId\)\{summary\.push/);
  assert.match(finances,/walletId:String\(body\.walletId\)/);
});
test('empty Bybit promotional Earn sections are hidden, funded ones remain visible',()=>{
  assert.match(ui,/const hideEmptyBybitSections=new Set/);
  assert.match(ui,/subaccounts/);
  assert.match(ui,/section\.assets\|\|\[\]/);
});
test('financial summary labels and refresh controls wrap on narrow screens',()=>{
  assert.match(css,/\.finance-crypto-source-refresh/);
  assert.match(css,/\.finance-crypto-breakdown-row>span/);
  assert.match(css,/\.finance-crypto-fee-hint/);
});
