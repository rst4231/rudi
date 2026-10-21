'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function browser(fetchHandler){
 const nodes=new Map(),events={};
 function element(){return {value:'',hidden:false,textContent:'',checked:false,disabled:false,dataset:{},children:[],listeners:{},classList:{values:new Set(),add(x){this.values.add(x)},remove(x){this.values.delete(x)},toggle(x,enabled){if(enabled)this.values.add(x);else this.values.delete(x)},contains(x){return this.values.has(x)}},setAttribute(){},append(...xs){this.children.push(...xs);},replaceChildren(...xs){this.children=xs;},addEventListener(k,fn){this.listeners[k]=fn;}};}
 const html=fs.readFileSync('public/index.html','utf8');for(const m of html.matchAll(/id="(cryptoLive[^"]*)"/g))nodes.set(m[1],element());
 nodes.get('cryptoLiveProvider').value='pionex';let requests=[];
 const document={readyState:'complete',getElementById:id=>nodes.get(id)||null,createElement:element,querySelectorAll:()=>[],addEventListener:(k,f)=>events[k]=f,dispatchEvent(){},activeElement:null};
 const window={addEventListener(){},Telegram:{WebApp:{initData:'test-auth'}}};
 const data={accounts:[{provider:'pionex',connected:true,enabled:false,settings:{},status:{equity:321.5,available:200,positions:[],at:new Date().toISOString()}}],trades:[],scheduler:{healthy:true}};
 const ctx={window,document,Event,Date,Number,console,setTimeout,clearTimeout,AbortController,fetch:async(url,init)=>{requests.push(JSON.parse(init.body));return fetchHandler?fetchHandler(url,init):{ok:true,json:async()=>({ok:true,...data})};}};
 vm.runInNewContext(fs.readFileSync('public/crypto-live.js','utf8'),ctx);
 return {nodes,window,requests,data};
}
test('one existing Artemyev scanner contains live exchange controls and virtual archive',()=>{
 const html=fs.readFileSync('public/index.html','utf8');assert.equal((html.match(/id="financeCryptoSignalsOpen"/g)||[]).length,1);
 assert.match(html,/<details[^>]*id="cryptoSignalsArchive"/);
 assert.ok(html.indexOf('id="cryptoSignalsArchive"')<html.indexOf('id="cryptoVirtualEquity"'));
 assert.match(html,/id="cryptoLiveProvider" type="hidden" value="pionex"/);assert.doesNotMatch(html,/<option value="okx">/);assert.match(html,/id="cryptoLivePassphrase"/);
});
test('Pionex screen shows exchange balances, hides passphrase, and POSTs credentials safely',async()=>{
 const b=browser();b.window.RudiCryptoLive.render(b.data);
 assert.match(b.nodes.get('cryptoLiveEquity').textContent,/321/);
 assert.match(b.nodes.get('cryptoLiveAvailable').textContent,/200/);
 assert.equal(b.nodes.get('cryptoLivePassphraseField').hidden,true);
 b.nodes.get('cryptoLiveApiKey').value='pionex-key';
 b.nodes.get('cryptoLiveApiSecret').value='pionex-secret';
 await b.nodes.get('cryptoLiveConnect').listeners.click();
 assert.equal(b.requests[0].operation,'crypto-live-connect');
 assert.equal(b.requests[0].provider,'pionex');
 assert.equal(b.requests[0].apiSecret,'pionex-secret');
 assert.equal(b.nodes.get('cryptoLiveApiSecret').value,'');
});
test('unknown exchange-closed PNL is shown as unknown, never as zero',()=>{
 const b=browser();b.data.trades=[{provider:'pionex',symbol:'BTCUSDT',side:'Buy',signalId:1,state:'closed-external',realizedPnlUsd:null,grossPnlUsd:0}];b.window.RudiCryptoLive.render(b.data);
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

test('unverified Pionex shows account warning without claiming there are zero positions',()=>{
 const b=browser();
 b.nodes.get('cryptoLiveProvider').value='pionex';
 b.data.accounts=[{provider:'pionex',connected:true,enabled:false,settings:{},status:{equity:null,available:null,verified:false,error:'live-account-unverified',positions:[]}}];
 b.window.RudiCryptoLive.render(b.data);
 assert.match(b.nodes.get('cryptoLiveConnection').textContent,/данные счёта не подтверждены/);
 assert.equal(b.nodes.get('cryptoLivePositionCount').textContent,'—');
 assert.match(b.nodes.get('cryptoLivePositions').textContent,/Позиции не подтверждены/);
 assert.match(b.nodes.get('cryptoLiveStatus').textContent,/Торговля заблокирована/);
});
test('Passphrase remains hidden and OKX is unavailable from Artemyev scanner UI',()=>{
 const css=require('node:fs').readFileSync('public/crypto-signals.css','utf8');
 const html=require('node:fs').readFileSync('public/index.html','utf8');
 assert.match(css,/\\.crypto-live-field\\[hidden\\]\\s*\\{\\s*display\\s*:\\s*none/);
 assert.doesNotMatch(html,/<option value="okx"/);
 const b=browser();b.window.RudiCryptoLive.render(b.data);
 assert.equal(b.nodes.get('cryptoLivePassphraseField').hidden,true);
 b.nodes.get('cryptoLiveProvider').value='okx';
 b.window.RudiCryptoLive.render(b.data);
 assert.equal(b.nodes.get('cryptoLivePassphraseField').hidden,true);
 assert.match(b.nodes.get('cryptoLiveConnection').textContent,/API подключён/);
});
test('Pionex shows scheduler outage before the activation button',async()=>{
 const b=browser(async()=>({ok:false,json:async()=>({ok:false,error:'live-scheduler-stale'})}));
 b.nodes.get('cryptoLiveProvider').value='pionex';
 b.data.accounts=[{provider:'pionex',connected:true,enabled:false,settings:{marginUsd:10,marginCapUsd:50,dailyLossUsd:50,leverage:3,maxOpen:1,slippagePct:2},status:{verified:true,equity:100,available:80,positions:[]}}];
 b.data.scheduler={healthy:false,lastAt:''};
 b.window.RudiCryptoLive.render(b.data);
 assert.match(b.nodes.get('cryptoLivePreflight').textContent,/планировщик ни разу не подтвердил запуск/);
 b.nodes.get('cryptoLiveConsent').checked=true;
 b.nodes.get('cryptoLiveProgrammatic').checked=true;
 await b.nodes.get('cryptoLiveStart').listeners.click();
 assert.equal(b.requests[0].operation,'crypto-live-configure');
 assert.equal(b.requests[0].enabled,true);
 assert.match(b.nodes.get('cryptoLiveStatus').textContent,/Торговля заблокирована/);
 assert.equal(b.nodes.get('cryptoLiveStart').disabled,false);
 assert.equal(b.nodes.get('cryptoLiveMode').textContent,'Выключена');
});
test('Trade activation preflight clears when the scheduler heartbeat is healthy',()=>{
 const b=browser();
 b.nodes.get('cryptoLiveProvider').value='pionex';
 b.data.accounts=[{provider:'pionex',connected:true,enabled:false,settings:{},status:{verified:true,equity:100,available:80,positions:[]}}];
 b.data.scheduler={healthy:true,lastAt:new Date().toISOString()};
 b.window.RudiCryptoLive.render(b.data);
 assert.match(b.nodes.get('cryptoLivePreflight').textContent,/API и планировщик подтверждены/);
});

test('Enabled Pionex shows green status dot and saved server activation datetime',()=>{
 const b=browser(),activatedAt='2026-10-21T11:30:00.000Z';
 b.data.accounts[0].enabled=true;
 b.data.accounts[0].activatedAt=activatedAt;
 b.window.RudiCryptoLive.render(b.data);
 const label=b.nodes.get('cryptoLiveMode'),started=b.nodes.get('cryptoLiveActivatedAt');
 assert.equal(label.textContent,'Включена');
 assert.equal(label.classList.contains('is-enabled'),true);
 assert.equal(started.hidden,false);
 const d=new Date(activatedAt);
 assert.equal(started.textContent,'С '+d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})+' в '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
});
test('When trading stops, green dot disappears and activation date hides',()=>{
 const b=browser();
 b.data.accounts[0].enabled=true;
 b.data.accounts[0].activatedAt='2026-10-21T10:00:00Z';
 b.window.RudiCryptoLive.render(b.data);
 b.data.accounts[0].enabled=false;
 b.window.RudiCryptoLive.render(b.data);
 assert.equal(b.nodes.get('cryptoLiveMode').textContent,'Выключена');
 assert.equal(b.nodes.get('cryptoLiveMode').classList.contains('is-enabled'),false);
 assert.equal(b.nodes.get('cryptoLiveActivatedAt').hidden,true);
 assert.equal(b.nodes.get('cryptoLiveActivatedAt').textContent,'');
});
test('Activation time is not invented if server has no saved timestamp',()=>{
 const b=browser();b.data.accounts[0].enabled=true;b.data.accounts[0].activatedAt='';
 b.window.RudiCryptoLive.render(b.data);
 assert.equal(b.nodes.get('cryptoLiveActivatedAt').textContent,'Время включения не сохранено');
});
