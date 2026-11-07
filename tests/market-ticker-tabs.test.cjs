const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('finance ticker switches fiat/crypto without changing valuation inputs',()=>{
 const dom=new JSDOM('<body><div id="marketTickerTile"><div id="marketTickerTrack"></div><div id="marketTickerA11y"></div></div></body>',{runScripts:'outside-only'}),w=dom.window;
 const src=fs.readFileSync('public/app.js','utf8');let valuation=0;
 for(const name of ['renderFinanceObligationCoverage','renderFinanceCapitalHistory','restartRudiMotion'])w[name]=()=>{};
 w.renderFinanceWalletTotal=()=>valuation++;
 w.eval("let marketTickerLastPayload=null,currentAppTab='finances',activeFinanceTab='personal';function recordFinanceCapitalSnapshot(){return Promise.resolve()}\n"+src.slice(src.indexOf('      function marketTickerNumber'),src.indexOf('      function applyMarketTickerVisibility'))+'\nwindow.draw=renderMarketTicker;');
 const payload={items:['usd-rub','eur-rub','btcusdt','ethusdt','usdtusd'].map((id,i)=>({id,label:id,value:100+i}))};
 const labels=()=>[...w.document.querySelectorAll('.market-ticker-group:first-child .market-ticker-label')].map(el=>el.textContent);
 w.document.body.dataset.financeTone='personal';w.draw(payload);assert.deepEqual(labels(),['usd-rub','eur-rub']);
 w.document.body.dataset.financeTone='crypto';w.draw(payload,{visualOnly:true});assert.deepEqual(labels(),['btcusdt','ethusdt']);assert.equal(valuation,1);
 w.document.body.dataset.financeTone='personal';w.draw(payload,{visualOnly:true});assert.deepEqual(labels(),['usd-rub','eur-rub']);
 w.document.body.dataset.financeTone='crypto';w.draw({items:payload.items.filter(x=>x.id==='usd-rub')},{visualOnly:true});assert.match(w.document.getElementById('marketTickerTrack').textContent,/недоступны/);
 dom.window.close();
});
