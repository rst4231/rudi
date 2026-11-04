(()=>{
 'use strict';
 const core=window.RudiMonthlyPlanCore;if(!core)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const host=document.getElementById('financeMonthlyPlan');if(!host)return;
 let snapshot=null,context={},owner='',busy=false,proposal=null;
 const actor=()=>document.body.dataset.rudiActor||'';
 const masked=()=>document.getElementById('financeBalanceEyeButton')?.getAttribute('aria-pressed')==='true';
 const money=(value,currency='RUB')=>masked()?'••••':value===null||value===undefined?'Не указан':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:currency==='RUB'?0:2}).format(value)+' '+({RUB:'₽',USD:'$',EUR:'€'}[currency]||currency);
 const monthName=month=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
 const request=async(operation,payload)=>{
  try{await window.__rudiTelegramSdkReady}catch(_){}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch('/api/finances',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',signal:controller.signal,body:JSON.stringify({operation,initData:window.Telegram?.WebApp?.initData||'',...payload})});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'finance-unavailable');return data}finally{clearTimeout(timer)}
 };
 function render(){
  if(!snapshot||owner!==actor()){host.hidden=true;host.replaceChildren();return}
  proposal=core.build(snapshot,Date.now(),context);const p=proposal;
  const short=p.cashflow.firstShortfall,notes=[];
  if(short)notes.push('К '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(short.date+'T12:00:00Z'))+' на обязательные платежи может не хватить '+money(short.amount)+'.');
  if(p.remaining!==null&&p.remaining<0)notes.push('План превышает доход на '+money(-p.remaining)+'. Проверь обязательства и заданные вручную лимиты.');
  if(p.habitualDeficit>0)notes.push('Привычный бюджет выше дохода на '+money(p.habitualDeficit)+'. Предложенные свободные лимиты уменьшены.');
  const missing=[...new Set([...p.missing,...p.cashflow.missing])];
  host.hidden=false;host.innerHTML=`<div class="rudi-planning-head"><div><span class="rudi-planning-eyebrow">План на месяц</span><h2 id="financeMonthlyPlanTitle">${esc(monthName(p.month))}</h2></div><span class="rudi-planning-badge">Автоматически</span></div>
   <div class="rudi-planning-totals"><div><span>Ожидаемый доход</span><strong>${esc(money(p.income.amount))}</strong></div><div><span>Обязательства</span><strong>${esc(money(p.fixedTotal))}</strong></div><div><span>Лимиты на покупки</span><strong>${esc(money(p.variableTotal))}</strong></div><div><span>Остаток после плана${p.savings?' и накоплений':''}</span><strong>${esc(money(p.remaining))}</strong></div></div>
   ${notes.length?'<div class="rudi-planning-warning" role="status">'+notes.map(esc).join('<br>')+'</div>':''}
   <p class="rudi-planning-note">${p.historyMonths.length?'Основа: история расходов за '+p.historyMonths.length+' мес. и регулярные платежи. Запас на переменные расходы: 10%.':'Пока мало истории. Использую текущие лимиты и регулярные платежи.'} ${p.income.source==='history'?'Доход взят из истории поступлений.':''} ${p.obligations.some(o=>o.estimated)?'Жильё оценено по последнему известному месяцу.':''}</p>
   <details><summary>Лимиты по категориям · ${p.categories.length}</summary><div class="rudi-planning-list">${p.categories.map(c=>`<div><span>${esc(c.name)}${c.locked?'<small>Задан вручную на этот месяц</small>':''}</span><b>${esc(money(c.limit,c.currency))}</b></div>`).join('')||'<p>Добавь категории расходов, чтобы получить лимиты.</p>'}</div></details>
   ${missing.length?'<p class="rudi-planning-note">Для точного прогноза нужны: '+esc(missing.join(', '))+'.</p>':''}
   <button id="financeMonthlyPlanApply" class="rudi-planning-primary" type="button" ${!p.canApply||busy||navigator.onLine===false?'disabled':''}>${busy?'Сохраняю…':!p.canApply&&p.categories.length&&p.categories.every(c=>c.locked)?'Лимиты на месяц уже заданы':'Принять лимиты'}</button>
   <details id="financeMonthlyIncomeDetails" ${masked()?'hidden':''}><summary>Уточнить ожидаемый доход</summary><form id="financeMonthlyIncomeForm" class="rudi-planning-form"><label>Доход за месяц, ₽<input name="amount" type="number" min="0" max="100000000" step="0.01" inputmode="decimal" value="${esc(snapshot.plan?.expectedMonthlyIncome??'')}" placeholder="По истории поступлений"></label><label>День поступления<input name="day" type="number" min="1" max="31" step="1" inputmode="numeric" value="${esc(snapshot.plan?.expectedIncomeDay??'')}" placeholder="1–31"></label><button type="submit" class="rudi-planning-secondary" ${busy?'disabled':''}>Сохранить доход</button></form></details><p id="financeMonthlyPlanStatus" class="rudi-planning-note" role="status" aria-live="polite"></p>`;
  host.querySelector('#financeMonthlyPlanApply').addEventListener('click',()=>save('apply-monthly-plan',{month:p.month,id:p.id}));
  host.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const raw=form.elements.amount.value,day=form.elements.day.value;void save('save-plan',{expectedMonthlyIncome:raw===''?null:Number(raw),expectedIncomeDay:day===''?null:Number(day)})});
 }
 async function save(operation,payload){
  if(busy||navigator.onLine===false)return;const expected=owner;busy=true;render();
  try{const data=await request(operation,payload);if(expected!==actor()||data.actor!==expected)return;document.dispatchEvent(new CustomEvent('rudi-finance-monthly-plan-applied',{detail:data}));if(snapshot!==data){snapshot=data;render()}const status=host.querySelector('#financeMonthlyPlanStatus');if(status)status.textContent=operation==='apply-monthly-plan'?'Лимиты сохранены на '+monthName(payload.month)+'.':'Доход сохранён, план пересчитан.'}
  catch(error){if(expected===actor()){const status=host.querySelector('#financeMonthlyPlanStatus');if(status)status.textContent=String(error.message).includes('stale')?'Данные изменились. Обнови финансы и прими свежий план.':'Не удалось сохранить. Попробуй ещё раз.'}}
  finally{busy=false;const button=host.querySelector('#financeMonthlyPlanApply');if(button){button.disabled=!proposal?.canApply||navigator.onLine===false;button.textContent=proposal?.canApply?'Принять лимиты':'Лимиты на месяц уже заданы'}host.querySelector('button[type="submit"]')?.removeAttribute('disabled')}
 }
 document.addEventListener('rudi-finances-updated',event=>{const data=event.detail;if(!data?.actor||data.actor!==actor())return;if(owner!==data.actor)context={};owner=data.actor;snapshot=data;if(data.monthlyPlanContext)context=data.monthlyPlanContext;render()});
 new MutationObserver(()=>{if(owner!==actor()){snapshot=null;context={};owner=''}render()}).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
 const eye=document.getElementById('financeBalanceEyeButton');if(eye)new MutationObserver(render).observe(eye,{attributes:true,attributeFilter:['aria-pressed']});
 window.addEventListener('online',render);window.addEventListener('offline',render);window.addEventListener('pageshow',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();
