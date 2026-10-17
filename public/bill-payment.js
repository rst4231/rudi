/* A bill's accounting entry is explicit; opening the picker performs no mutation. */
(function(){
'use strict';
let active=null,revision=0;
const inflight=new Map();
const actor=()=>String(document.body?.dataset?.rudiActor||'');
function el(tag,text,className){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item}
function close(result={saved:false}){
 const state=active;if(!state)return;
 revision++;active=null;state.observer?.disconnect();state.root.remove();
 if(state.focus?.isConnected)state.focus.focus();state.resolve(result);
}
function live(state){return active===state&&state.revision===revision&&actor()===state.actor}
function message(state,text){if(live(state))state.status.textContent=text}
function options(select,rows,placeholder){
 select.replaceChildren();const empty=el('option',placeholder);empty.value='';select.append(empty);
 for(const row of rows){const option=el('option',String(row.name||row.title||'Без названия'));option.value=String(row.id);select.append(option)}
}
function open(config={}){
 if(active)close();
 if(!['Рустам','Диана'].includes(config.actor)||actor()!==config.actor)return Promise.resolve({saved:false});
 const root=el('div',undefined,'bill-payment-backdrop');
 root.innerHTML='<form class="bill-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="billPaymentTitle"><header><h2 id="billPaymentTitle">Записать оплату</h2><button class="bill-payment-close" type="button" aria-label="Закрыть">×</button></header><p class="bill-payment-name"></p><strong class="bill-payment-amount"></strong><label>Кошелёк<select name="walletId" aria-label="Кошелёк" required disabled></select></label><label>Категория<select name="categoryId" aria-label="Категория" required disabled></select></label><p class="bill-payment-status" role="status" aria-live="polite">Загружаю кошельки и категории…</p><button class="bill-payment-save" type="submit" disabled>Записать расход</button></form>';
 let resolve;const result=new Promise(done=>{resolve=done});
 const state={root,revision:++revision,actor:config.actor,resolve,focus:document.activeElement,busy:false,loaded:false,
  wallet:root.querySelector('[name="walletId"]'),category:root.querySelector('[name="categoryId"]'),save:root.querySelector('.bill-payment-save'),status:root.querySelector('.bill-payment-status'),wallets:[],categories:[]};
 active=state;
 const obligation=config.obligation||{},amount=Number(obligation.amount??obligation.amountRUB);
 root.querySelector('.bill-payment-name').textContent=String(obligation.title||obligation.name||'Обязательный платёж');
 root.querySelector('.bill-payment-amount').textContent=Number.isFinite(amount)&&amount>0?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(amount):'Сумма не указана';
 const key=JSON.stringify([config.actor,String(config.month||''),String(obligation.id||obligation.title||obligation.name||''),amount]);
 document.body.append(root);root.querySelector('.bill-payment-close').addEventListener('click',()=>close());
 root.addEventListener('click',event=>{if(event.target===root)close()});
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();return}
  if(event.key==='Tab'){
   const controls=[...root.querySelectorAll('button,select')].filter(item=>!item.disabled),first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
 });
 root.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(!live(state)){if(active===state)close();return}
  if(state.busy||!state.loaded)return;
  const walletId=state.wallet.value,categoryId=state.category.value;
  if(!state.wallets.some(row=>String(row.id)===walletId)||!state.categories.some(row=>String(row.id)===categoryId)){message(state,'Выбери кошелёк и категорию');return}
  if(!(Number.isFinite(amount)&&amount>0)){message(state,'У платежа не указана сумма');return}
  if(inflight.has(key)){message(state,'Этот расход уже записывается');return}
  state.busy=true;state.save.disabled=true;state.wallet.disabled=true;state.category.disabled=true;message(state,'Записываю расход…');
  const task=Promise.resolve().then(()=>{if(!live(state))throw Error('Действие отменено');return config.save({walletId,categoryId})});inflight.set(key,task);
  try{const saved=await task;if(saved?.ok===false)throw Error('Не удалось записать расход');if(live(state))close({saved:true,walletId,categoryId})}
  catch(error){message(state,error?.message||'Не удалось записать расход. Попробуй ещё раз.')}
  finally{if(inflight.get(key)===task)inflight.delete(key);if(live(state)){state.busy=false;state.save.disabled=false;state.wallet.disabled=false;state.category.disabled=false}}
 });
 if(typeof MutationObserver!=='undefined'){state.observer=new MutationObserver(()=>{if(active===state&&actor()!==state.actor)close()});state.observer.observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']})}
 root.querySelector('.bill-payment-close').focus();
 Promise.resolve().then(()=>{if(!live(state))return null;return config.load()}).then(data=>{
  if(!live(state)||!data)return;
  state.wallets=(Array.isArray(data.wallets)?data.wallets:[]).filter(row=>row&&row.id&&!row.archived);
  state.categories=(Array.isArray(data.categories)?data.categories:[]).filter(row=>row&&row.id&&!row.archived);
  options(state.wallet,state.wallets,'Выбери кошелёк');options(state.category,state.categories,'Выбери категорию');
  state.loaded=true;state.wallet.disabled=false;state.category.disabled=false;state.save.disabled=!state.wallets.length||!state.categories.length||!(Number.isFinite(amount)&&amount>0);
  message(state,!state.wallets.length?'Добавь кошелёк в разделе финансов':!state.categories.length?'Добавь категорию расходов':!(amount>0)?'У платежа не указана сумма':'Выбери, откуда списать деньги и к какой категории отнести расход.');
 }).catch(error=>message(state,error?.message||'Не удалось загрузить кошельки и категории. Закрой окно и попробуй снова.'));
 return result;
}
window.RUDIBillPayment={open,close};
})();
