'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 let root=null,observed;const document={body:{dataset:{rudiActor:'Рустам'},append(value){root=value}},activeElement:{isConnected:true,focus(){document.activeElement=this}}};
 const make=tag=>({tag,handlers:{},children:[],disabled:false,textContent:'',value:'',isConnected:true,append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},addEventListener(type,fn){this.handlers[type]=fn},setAttribute(){},remove(){this.isConnected=false;if(root===this)root=null},focus(){document.activeElement=this},querySelector(key){this.nodes??={};return this.nodes[key]??=(make(key))},querySelectorAll(){return [this.querySelector('.bill-payment-close'),this.querySelector('[name="walletId"]'),this.querySelector('[name="categoryId"]'),this.querySelector('.bill-payment-save')]}});
 document.createElement=make;const window={};
 class MutationObserver{constructor(fn){observed=fn}observe(){}disconnect(){}}
 vm.runInNewContext(fs.readFileSync('public/bill-payment.js','utf8'),{window,document,MutationObserver,Intl});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {api:window.RUDIBillPayment,document,root:()=>root,tick,actor(value){document.body.dataset.rudiActor=value;observed?.()},submit(){return root.querySelector('form').handlers.submit({preventDefault(){}})},select(){root.querySelector('[name="walletId"]').value='wallet';root.querySelector('[name="categoryId"]').value='category'}};
}
const details={obligation:{id:'bill',title:'Интернет <script>',amount:1500},month:'2026-10',actor:'Рустам'};
const load=async()=>({wallets:[{id:'wallet',name:'Карта'}],categories:[{id:'category',name:'Связь'}]});
test('bill popup loads only on open, requires both selections and saves explicitly once',async()=>{
 const h=fixture();let reads=0,writes=0;assert.equal(h.root(),null);
 const result=h.api.open({...details,load:async()=>{reads++;return load()},save:async params=>{writes++;assert.equal(params.walletId,'wallet');assert.equal(params.categoryId,'category');return {ok:true}}});
 assert.equal(reads,0);await h.tick();assert.equal(reads,1);
 assert.equal(h.root().querySelector('.bill-payment-name').textContent,'Интернет <script>');
 await h.submit();assert.equal(writes,0);assert.match(h.root().querySelector('.bill-payment-status').textContent,/Выбери/);
 h.select();const first=h.submit(),second=h.submit();await Promise.all([first,second]);assert.equal(writes,1);assert.equal((await result).saved,true);assert.equal(h.root(),null);
});
test('save error retains chosen wallet/category and re-enables retry; X closes and restores focus',async()=>{
 const h=fixture(),focus=h.document.activeElement;const result=h.api.open({...details,load,save:async()=>{throw Error('Нет соединения')}});await h.tick();h.select();await h.submit();
 assert.equal(h.root().querySelector('[name="walletId"]').value,'wallet');assert.equal(h.root().querySelector('.bill-payment-save').disabled,false);assert.equal(h.root().querySelector('.bill-payment-status').textContent,'Нет соединения');
 h.root().querySelector('.bill-payment-close').handlers.click();assert.equal((await result).saved,false);assert.equal(h.document.activeElement,focus);
});
test('closing or switching actor ignores pending load and never invokes save',async()=>{
 const h=fixture();let resolve,writes=0;
 const result=h.api.open({...details,load:()=>new Promise(done=>{resolve=done}),save:async()=>{writes++}});await h.tick();h.actor('Диана');assert.equal((await result).saved,false);resolve(await load());await h.tick();assert.equal(h.root(),null);assert.equal(writes,0);
 const denied=await h.api.open({...details,load:()=>{throw Error('must not run')},save:async()=>{writes++}});assert.equal(denied.saved,false);
});
test('Escape/backdrop close safely and invalid amount or missing lists cannot save',async()=>{
 for(const key of ['escape','backdrop']){
  const h=fixture(),result=h.api.open({...details,load,save:async()=>{throw Error('must not save')}});await h.tick();const root=h.root();
  if(key==='escape')root.handlers.keydown({key:'Escape',preventDefault(){}});else root.handlers.click({target:root});assert.equal((await result).saved,false);
 }
 const h=fixture();h.api.open({...details,obligation:{...details.obligation,amount:0},load:async()=>({wallets:[],categories:[]}),save:async()=>{throw Error('must not save')}});await h.tick();assert.equal(h.root().querySelector('.bill-payment-save').disabled,true);h.api.close();
});
