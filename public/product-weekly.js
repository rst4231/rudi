(()=>{
 'use strict';
 const core=window.RudiProductWeeklyCore,host=document.getElementById('productsWeeklyPlan');if(!core||!host)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actor=()=>document.body.dataset.rudiActor||'';
 let busy=false,owner='',current=null,permittedActor='';const unchecked=new Set();
 function render(){
  current=window.RUDI_PRODUCTS_CURRENT;if(!current||!actor()||permittedActor!==actor()){host.hidden=true;return}owner=actor();const p=core.build(current);
  host.hidden=false;host.innerHTML=`<div class="rudi-planning-head"><div><span class="rudi-planning-eyebrow">Ближайшие 7 дней</span><h2 id="productsWeeklyTitle">Список на неделю</h2></div><span class="rudi-planning-badge">По покупкам</span></div><p class="rudi-planning-note">${p.items.length?'Собран по повторным покупкам. Позиции из корзины уже исключены.':'Пока нет новых предложений. Они появятся по истории повторных покупок.'}</p><div class="rudi-planning-list">${p.items.map(item=>`<label><input type="checkbox" value="${esc(item.id)}" ${unchecked.has(item.id)?'':'checked'} ${busy?'disabled':''}><span>${esc(item.text)}<small>Раз в ${item.intervalDays} дн.${item.quantity?' · в прошлый раз '+esc(item.quantity)+' '+esc(item.unit):''}</small></span></label>`).join('')}</div>${p.items.length?`<button id="productsWeeklyAdd" class="rudi-planning-primary" type="button" ${busy||navigator.onLine===false?'disabled':''}>${busy?'Добавляю…':'Добавить выбранное в корзину'}</button>`:''}<p class="rudi-planning-note">Вы с Дианой можете дополнять общий список в поле выше.</p><p id="productsWeeklyStatus" class="rudi-planning-note" role="status" aria-live="polite"></p>`;
  const button=host.querySelector('button');host.onchange=event=>{if(event.target.type==='checkbox'){if(event.target.checked)unchecked.delete(event.target.value);else unchecked.add(event.target.value)}if(button)button.disabled=busy||navigator.onLine===false||!host.querySelector('input:checked')};
  button?.addEventListener('click',async()=>{
   if(busy||navigator.onLine===false)return;const ids=[...host.querySelectorAll('input:checked')].map(x=>x.value),expected=owner;if(!ids.length)return;busy=true;button.disabled=true;button.textContent='Добавляю…';
   try{const result=await window.RUDI_PRODUCTS_API.request('add-weekly',{ids});if(expected!==actor())return;window.RUDI_PRODUCTS_API.render(result);const status=host.querySelector('#productsWeeklyStatus');if(status)status.textContent='Выбранные продукты добавлены в общую корзину.'}
   catch(_){if(expected===actor())host.querySelector('#productsWeeklyStatus').textContent='Не удалось добавить продукты. Попробуй ещё раз.'}
   finally{busy=false;host.querySelectorAll('input').forEach(input=>input.disabled=false);const active=host.querySelector('button');if(active){active.disabled=navigator.onLine===false||!host.querySelector('input:checked');active.textContent='Добавить выбранное в корзину'}}
  });
 }
 window.addEventListener('rudi-products-update',()=>{permittedActor=actor();render()});window.addEventListener('online',render);window.addEventListener('offline',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current)render()});
 new MutationObserver(()=>{if(owner&&owner!==actor()){current=null;permittedActor='';unchecked.clear();host.hidden=true;host.replaceChildren()}}).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
})();
