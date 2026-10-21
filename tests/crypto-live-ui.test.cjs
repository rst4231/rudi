'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function browser(fetchHandler){
 const nodes=new Map(),events={};
 function element(){return {value:'',hidden:false,textContent:'',checked:false,disabled:false,dataset:{},children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},append(...xs){this.children.push(...xs);},replaceChildren(...xs){this.children=xs;},addEventListener(k,fn){this.listeners[k]=fn;}};}
 const html=fs.readFileSync('public/index.html','utf8');for(const m of html.matchAll(/id="(cryptoLive[^"]*)"/g))nodes.set(m[1],element());
 nodes.get('cryptoLiveProvider').value='okx';let requests=[];
 const document={readyState:'complete',getElementById:id=>nodes.get(id)||null,createElement:element,querySelectorAll:()=>[],addEventListener:(k,f)=>events[k]=f,dispatchEvent(){},activeElement:null};
 const window={addEventListener(){},Telegram:{WebApp:{initData:'test-auth'}}};
 const data={accounts:[{provider:'okx',connected:true,enabled:false,settings:{},status:{equity:321.5,available:200,positions:[],at:new Date().toISOString()}}],trades:[],scheduler:{healthy:true}};
 const ctx={window,document,Event,Date,Number,console,setTimeout,clearTimeout,AbortController,fetch:async(url,init)=>{requests.push(JSON.parse(init.body));return fetchHandler?fetchHandler(url,init):{ok:true,json:async()=>({ok:true,...data})};}};
 vm.runInNewContext(fs.readFileSync('public/crypto-live.js','utf8'),ctx);
 return {nodes,window,requests,data};
}
test('one existing Artemyev scanner contains live exchange controls and virtual archive',()=>{
 const html=fs.readFileSync('public/index.html','utf8');assert.equal((html.match(/id="financeCryptoSignalsOpen"/g)||[]).length,1);
 assert.match(html,/<details[^>]*id="cryptoSignalsArchive"/);
 assert.ok(html.indexOf('id="cryptoSignalsArchive"')<html.indexOf('id="cryptoVirtualEquity"'));
 assert.match(html,/id="cryptoLiveProvider"/);assert.match(html,/value="okx">OKX/);assert.match(html,/id="cryptoLivePassphrase"/);
});
test('live screen uses exchange balances, clears secrets when switching exchanges, and sends connection credentials only in POST',async()=>{
 const b=browser();b.window.RudiCryptoLive.render(b.data);assert.match(b.nodes.get('cryptoLiveEquity').textContent,/321/);assert.match(b.nodes.get('cryptoLiveAvailable').textContent,/200/);
 b.nodes.get('cryptoLiveApiKey').value='key-secret';b.nodes.get('cryptoLiveApiSecret').value='secret';b.nodes.get('cryptoLivePassphrase').value='pass';
 b.nodes.get('cryptoLiveProvider').value='pionex';await b.nodes.get('cryptoLiveProvider').listeners.change();
 assert.equal(b.nodes.get('cryptoLiveApiKey').value,'');assert.equal(b.nodes.get('cryptoLivePassphraseField').hidden,true);
 b.nodes.get('cryptoLiveApiKey').value='pionex-key';b.nodes.get('cryptoLiveApiSecret').value='pionex-secret';
 await b.nodes.get('cryptoLiveConnect').listeners.click();
 assert.equal(b.requests[0].operation,'crypto-live-connect');assert.equal(b.requests[0].provider,'pionex');assert.equal(b.requests[0].apiSecret,'pionex-secret');assert.equal(b.nodes.get('cryptoLiveApiSecret').value,'');
});

test('unknown exchange-closed PNL is shown as unknown, never as zero',()=>{
 const b=browser();b.data.trades=[{provider:'okx',symbol:'BTCUSDT',side:'Buy',signalId:1,state:'closed-external',realizedPnlUsd:null,grossPnlUsd:0}];b.window.RudiCryptoLive.render(b.data);
 const row=b.nodes.get('cryptoLiveTrades').children[0];assert.equal(row.children[1].textContent,'Результат уточняется');
});

test('failed Pionex API connection gives immediate inline error, retains credentials, and re-enables button',async()=>{
 const b=browser(async()=>({ok:false,json:async()=>({ok:false,error:'live-key-permission'})}));
 b.nodes.get('cryptoLiveProvider').value='pionex';
 b.nodes.get('cryptoLiveApiKey').value='pionex-sample-key';
 b.nodes.get('cryptoLiveApiSecret').value='pionex-sample-secret';
 await b.nodes.get('cryptoLiveConnect').listeners.click();
 assert.match(b.nodes.get('cryptoLiveConnectStatus').textContent,/ключу нужны чтение и торговля/i);
 assert.equal(b.nodes.get('cryptoLiveApiKey').value,'pionex-sample-key');
 assert.equal(b.nodes.get('cryptoLiveApiSecret').value,'pionex-sample-secret');
 assert.equal(b.nodes.get('cryptoLiveConnect').disabled,false);
 assert.equal(b.nodes.get('cryptoLiveConnect').textContent,'Подключить API');
});
test('successful Pionex connection shows success inline and clears credentials',async()=>{
 const b=browser();
 b.nodes.get('cryptoLiveProvider').value='pionex';
 b.nodes.get('cryptoLiveApiKey').value='pionex-sample-key';
 b.nodes.get('cryptoLiveApiSecret').value='pionex-sample-secret';
 await b.nodes.get('cryptoLiveConnect').listeners.click();
 assert.match(b.nodes.get('cryptoLiveConnectStatus').textContent,/API подключён/);
 assert.equal(b.nodes.get('cryptoLiveApiKey').value,'');
 assert.equal(b.nodes.get('cryptoLiveApiSecret').value,'');
 assert.equal(b.requests.length,2);
});
