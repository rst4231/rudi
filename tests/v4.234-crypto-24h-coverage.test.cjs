'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compare24h}=require('../api/crypto-pnl.cjs');
const H=3600000,now=Date.parse('2026-10-14T12:00:00.000Z');
const mark=(hours,usd,partial=false)=>({at:new Date(now-hours*H).toISOString(),usd,partial});

test('real mark 45m away from 24h boundary yields explicitly approximate valuation',()=>{
  const p=compare24h([mark(24.75,1000),mark(0.05,1050)],now);
  assert.equal(p.available,true);
  assert.equal(p.deltaUsd,50);
  assert.equal(p.baselineMethod,'nearby-observation');
  assert.equal(p.approximate,true);
  assert.equal(p.verifiedPnl,false);
  assert.equal(p.observedHours,24.7);
  assert.match(p.note,/24.7 ч/);
});

test('bracketed real full observations interpolate the 24h mark',()=>{
  const p=compare24h([mark(26,1000),mark(22,1040),mark(0.01,1100)],now);
  assert.equal(p.available,true);
  assert.equal(p.deltaUsd,80);
  assert.equal(p.baselineMethod,'interpolated');
  assert.equal(p.approximate,true);
  assert.equal(p.from,new Date(now-24*H).toISOString());
});

test('13h or very sparse past observations never create fake 24h results',()=>{
  for(const marks of [[mark(13,1000),mark(.01,1100)],
    [mark(33,1000),mark(.01,1100)],
    [mark(24,1000,true),mark(.01,1100)]]){
    const p=compare24h(marks,now);
    assert.equal(p.available,false);
    assert.equal(p.deltaUsd,undefined);
  }
});
test('stale current sync and partial-only records cannot appear as current 24h PNL',()=>{
  assert.equal(compare24h([mark(24,1000),mark(1,1100)],now).reason,'last-sync-stale');
  assert.equal(compare24h([mark(25,1000,true),mark(.01,1100,true)],now).reason,'partial-history');
});
test('client explains approximations and error state without masking missing history',()=>{
  const code=fs.readFileSync('public/crypto-wallets.js','utf8');
  assert.match(code,/За ≈24 ч/);
  assert.match(code,/pnl24h=\{total:\{available:false,reason:'history-unavailable'\}/);
  assert.match(code,/не все счета Bybit учтены/);
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/crypto-wallets\.js\?v=4\.234/);
  assert.match(fs.readFileSync('public/sw.js','utf8'),/rudi-shell-v4\.234/);
});
