'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('public/finance-wallet-currency.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
function fixture(){
  const buttonHandlers={};
  const rubTile={textContent:'380 ₽',dataset:{},classList:{toggle(){}},title:''};
  const dollarTile={textContent:'99,57 $',dataset:{},classList:{toggle(){}},title:''};
  const list={querySelectorAll:()=>[rubTile,dollarTile]};
  const symbol={textContent:'₽'},button={addEventListener:(n,f)=>buttonHandlers[n]=f};
  const ticker={textContent:'USD/RUB 85,00 ₽ 0,0% EUR/RUB 94,97 ₽'},a11y={textContent:''};
  const parts={financeWalletList:list,financeBalanceCurrencySymbol:symbol,
    financeBalanceCurrencyButton:button,marketTickerTrack:ticker,marketTickerA11y:a11y};
  const observers=[];
  const MutationObserver=class{constructor(f){this.f=f;observers.push(this)}observe(){}};
  vm.runInNewContext(script,{document:{getElementById:k=>parts[k]},requestAnimationFrame:f=>f(),
    MutationObserver,Intl,Number,String});
  return {rubTile,dollarTile,symbol,ticker,buttonHandlers,observers};
}
test('switching to dollar mode shows RUB wallet with USD equivalent, not editing balance',()=>{
  const w=fixture();
  assert.equal(w.rubTile.textContent,'380 ₽');
  w.symbol.textContent='$';w.buttonHandlers.click();
  assert.equal(w.rubTile.textContent,'380 ₽ (4,47 $)');
  assert.equal(w.dollarTile.textContent,'99,57 $');
  assert.equal(w.rubTile.dataset.rudiWalletRubOriginal,'380 ₽');
  w.symbol.textContent='₽';w.buttonHandlers.click();
  assert.equal(w.rubTile.textContent,'380 ₽');
});
test('new exchange rate updates only display; the original wallet amount remains RUB',()=>{
  const w=fixture();
  w.symbol.textContent='$';w.buttonHandlers.click();
  w.ticker.textContent='USD/RUB 100,00 ₽ EUR/RUB 94,97 ₽';
  w.buttonHandlers.click();
  assert.equal(w.rubTile.textContent,'380 ₽ (3,80 $)');
  assert.equal(w.rubTile.dataset.rudiWalletRubOriginal,'380 ₽');
});
test('without trusted USD/RUB ticker, no made-up equivalent is shown',()=>{
  const w=fixture();
  w.ticker.textContent='Курсы загружаются…';
  w.symbol.textContent='$';w.buttonHandlers.click();
  assert.equal(w.rubTile.textContent,'380 ₽');
});
test('finance enhancement has no extra network or writes and runs after base app script',()=>{
  const appPosition=html.indexOf('src="/app.js?v=');
  const currencyPosition=html.search(/src="\/finance-wallet-currency\.js\?v=\d+\.\d+"/);
  assert.ok(appPosition>=0&&currencyPosition>appPosition,'finance script must be loaded after app.js');
  assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|localStorage|\.setRecord|\.balance\s*=/);
  assert.match(script,/financeWalletList/);
  assert.match(script,/rudi-wallet-usd-equivalent/);
});
