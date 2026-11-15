const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function page({fail=false,now='2026-11-15T08:00:00Z'}={}){
 const nodes=new Map(),calls=[];
 const element=id=>({id,hidden:false,textContent:'',disabled:false,checked:true,dataset:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn}});
 for(const id of ['financeCryptoPanel','financeCryptoAutoSync','financeCryptoSyncHint','financeCryptoStatus','financeCryptoSentimentValue','financeCryptoSentimentLabel','financeCryptoSentimentDate','financeCryptoSentiment','financeCryptoSentimentMeter'])nodes.set(id,element(id));
 const document={readyState:'loading',visibilityState:'visible',getElementById:id=>nodes.get(id),addEventListener(){},querySelectorAll:()=>[],dispatchEvent(){}};
 const window={addEventListener(){}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return Date.parse(now)}}
 const context={window,document,Date:Clock,Intl,console,Event:class{},setInterval(){},fetch:async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);if(fail)throw Error('offline');return {ok:true,json:async()=>({ok:true,connections:[],sync:{enabled:body.enabled},sentiment:{available:true,value:10,label:'Сильный страх',at:now,stale:false}})}}};
 const code=fs.readFileSync(require.resolve('../public/crypto-wallets.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.test={boot,refresh,loadSentiment,renderSyncSetting,automaticSyncAllowed,setup(value){actor='Рустам';connections=[{walletId:'a'}];syncSettings=value}};})();`);
 vm.runInNewContext(code,context);window.test.setup({enabled:true});
 return {api:window.test,nodes,calls};
}
test('weekend UI skips automatic requests but keeps explicit refresh available',async()=>{const p=page();await p.api.refresh(false);assert.equal(p.calls.length,0);assert.match(p.nodes.get('financeCryptoSyncHint').textContent,/выходные/);await p.api.refresh(true);assert.equal(p.calls[0].operation,'crypto-refresh');assert.equal(p.calls[0].force,true)});
test('switch saves owner preference, restores previous value after failure',async()=>{const p=page({fail:true});p.api.boot();p.nodes.get('financeCryptoAutoSync').checked=false;await p.nodes.get('financeCryptoAutoSync').listeners.change();assert.equal(p.calls[0].operation,'crypto-sync-settings');assert.equal(p.calls[0].enabled,false);assert.equal(p.nodes.get('financeCryptoAutoSync').checked,true);assert.match(p.nodes.get('financeCryptoStatus').textContent,/Не удалось сохранить/)});
test('sentiment displays provider score and date even on weekend and caches requests',async()=>{const p=page();await p.api.loadSentiment();await p.api.loadSentiment();assert.equal(p.calls.length,1);assert.equal(p.nodes.get('financeCryptoSentimentValue').textContent,'10 / 100');assert.equal(p.nodes.get('financeCryptoSentiment').dataset.tone,'fear');assert.match(p.nodes.get('financeCryptoSentimentDate').textContent,/15/)});
