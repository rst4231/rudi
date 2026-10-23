/* Reuse the live partner card and its existing data, without duplicating IDs or requests. */
(()=>{'use strict';
 let active=null;
 const bindings=new WeakMap();
 function selectPartnerPlans(actor,data={},now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const today=p.year+'-'+p.month+'-'+p.day,clock=Number(p.hour)*60+Number(p.minute),valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
  let dayOff=null;
  if(actor==='Рустам')for(let i=0;i<8;i++){const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);if([0,6].includes(date.getUTCDay())){dayOff=date.toISOString().slice(0,10);break}}
  else if(data.work?.configured)dayOff=(data.work.days||[]).filter(d=>valid(d.date)&&d.date>=today&&d.working===false).sort((a,b)=>a.date.localeCompare(b.date))[0]?.date||null;
  const events=[];
  for(const day of data.shared?.days||[]){
   if(!valid(day.date)||day.date<today)continue;
   for(const event of day.events||[]){
    const assigned=String(event.assignee||'').trim();
    if(event.completed||event.personal||event.privateLocal||event.assigned!==false&&assigned&&!['Вместе','вместе'].includes(assigned))continue;
    const time=String(event.startTime||''),end=String(event.endTime||time),m=end.match(/^(\d{1,2}):(\d{2})$/);
    if(day.date===today&&!event.allDay&&m&&Number(m[1])*60+Number(m[2])<clock)continue;
    events.push({title:String(event.title||'Совместное дело'),date:day.date,time:event.allDay?'':time});
   }
  }
  events.sort((a,b)=>(a.date+' '+(a.time||'00:00')).localeCompare(b.date+' '+(b.time||'00:00')));
  return {dayOff,event:events[0]||null};
 }
 function addPlans(page,actor,loadPlans){
  const card=document.createElement('section');card.className='partner-plans';
  card.innerHTML='<h2>Ближайшее</h2><div class="partner-plan-row"><span class="partner-plan-icon" aria-hidden="true">☀</span><div><h3>Ближайший выходной</h3><p class="partner-day-off">Обновляю график…</p></div></div><div class="partner-plan-row"><span class="partner-plan-icon" aria-hidden="true">♡</span><div><h3>Совместное событие</h3><p class="partner-next-event">Обновляю календарь…</p><small class="partner-event-time"></small></div></div>';
  page.querySelector('.profile-person-head').after(card);
  const off=card.querySelector('.partner-day-off'),event=card.querySelector('.partner-next-event'),time=card.querySelector('.partner-event-time');
  const dateLabel=date=>new Intl.DateTimeFormat('ru-RU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  Promise.resolve().then(()=>loadPlans?.()).then(data=>{
   if(!card.isConnected)return;
   const next=selectPartnerPlans(actor,data||{});
   off.textContent=next.dayOff?dateLabel(next.dayOff)+(actor==='Рустам'?' · По графику 5/2':''):data?.work?.configured?'В календаре пока нет выходных':'График пока недоступен';
   event.textContent=next.event?.title||(data?.shared?.connected===false?'Совместный календарь не подключён':data?.shared?.unavailable?'Не удалось обновить календарь':'Пока нет совместных событий');
   time.textContent=next.event?[dateLabel(next.event.date),next.event.time].filter(Boolean).join(' · '):'';
  }).catch(()=>{if(card.isConnected){off.textContent='Не удалось обновить график';event.textContent='Не удалось обновить календарь'}});
 }
 function composePage(page,energy,advice,details){
  const parts=[],groups=[],layout=page.querySelector('.partner-profile-layout');
  const move=(node,target)=>{if(!node)return;const marker=document.createComment('partner-group');node.before(marker);parts.push({node,marker});target.append(node)};
  if(energy){const group=document.createElement('section');group.className='partner-energy-card';energy.before(group);group.append(energy);if(advice)group.append(advice)}
  const meditation=details.querySelector('.meditation-partner-summary:not(.home-partner-last-expense)'),habits=details.querySelector('.profile-partner-habits-summary'),expense=details.querySelector('.home-partner-last-expense'),cbt=details.querySelector('.partner-cbt-status'),intakes=details.querySelector('.profile-supplement-intakes');
  const today=document.createElement('section');today.className='partner-today';today.innerHTML='<h2>Сегодня</h2>';
  const first=meditation||habits||expense||cbt||intakes;if(first)first.before(today);else details.append(today);groups.push(today);
  for(const node of [meditation,habits,expense])move(node,today);
  if(cbt)today.append(cbt);
  move(intakes,today);
  const cycle=details.querySelector('.home-cycle-summary');
  if(cycle){const more=document.createElement('details');more.className='partner-cycle-more';more.innerHTML='<summary>Подробнее о самочувствии</summary>';cycle.append(more);groups.push(more);for(const node of [...cycle.querySelectorAll('.home-cycle-insight')])move(node,more)}
  const birthday=page.querySelector('.partner-birthday'),wishes=page.querySelector('.partner-profile-wishes');
  const gifts=document.createElement('section');gifts.className='partner-gifts';gifts.innerHTML='<h2>Подарки</h2>';birthday.before(gifts);gifts.append(birthday,wishes);
  return {parts,groups};
 }
 function birthdayInfo(actor,now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now).map(p=>[p.type,p.value]));
  const month=actor==='Диана'?5:2,day=actor==='Диана'?30:3,year=Number(parts.year);
  const today=Date.UTC(year,Number(parts.month)-1,Number(parts.day));
  let target=Date.UTC(year,month,day);if(target<today)target=Date.UTC(year+1,month,day);
  const days=Math.round((target-today)/86400000),n=days%100,last=days%10;
  return {days,date:actor==='Диана'?'30 июня':'3 марта',name:actor==='Диана'?'Дианы':'Рустама',unit:n>=11&&n<=14?'дней':last===1?'день':last>=2&&last<=4?'дня':'дней'};
 }
 function addBirthday(page,actor){
  const card=document.createElement('section');card.className='partner-birthday';
  card.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V11h16v10H4Zm0-5c2 2 3-2 5 0s3-2 5 0 4-1 6 0M8 11V7m4 4V7m4 4V7M8 3v1m4-2v2m4-1v1"/></svg><div class="partner-birthday-copy"><h2></h2><span></span></div><div class="partner-birthday-count"><strong></strong><small></small></div>';
  page.querySelector('.partner-profile-wishes').before(card);
  function update(){
   const info=birthdayInfo(actor),today=info.days===0;
   card.classList.toggle('is-today',today);
   card.querySelector('h2').textContent=today?'Сегодня день рождения '+info.name:'До дня рождения '+info.name;
   card.querySelector('.partner-birthday-copy>span').textContent=info.date;
   card.querySelector('strong').textContent=today?'Сегодня':String(info.days);
   card.querySelector('small').textContent=today?'':info.unit;
  }
  update();return update;
 }
 function addCbtStatus(page,actor,loadCbtStatus){
  const row=document.createElement('div');row.className='partner-cbt-status';row.setAttribute('aria-live','polite');
  row.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6c-2-5-7-3-6 1-4 0-4 6-1 7-2 4 3 7 5 4V6m2 0c2-5 7-3 6 1 4 0 4 6 1 7 2 4-3 7-5 4V6M5 10l3 1m-3 4 3-1m11-4-3 1m3 4-3-1"/></svg><span>Обновляю статус КПТ…</span>';
  const habits=page.querySelector('.profile-partner-habits-summary'),details=page.querySelector('.profile-person-details');
  if(habits)habits.after(row);else details.append(row);
  const text=row.querySelector('span');
  Promise.resolve().then(()=>loadCbtStatus?.()).then(data=>{
   if(!row.isConnected)return;
   if(data?.partner!==actor||typeof data.active!=='boolean')throw Error('status-unavailable');
   row.classList.toggle('is-active',data.active);
   text.textContent=data.active?'Проходит когнитивно-поведенческую терапию':'Не проходит когнитивно-поведенческую терапию';
  }).catch(()=>{if(row.isConnected)text.textContent='Статус КПТ пока недоступен'});
 }
 function addWishes(page,actor,loadWishes,openWish){
  const section=document.createElement('section');section.className='partner-profile-wishes';section.setAttribute('aria-label','Желания '+actor);
  section.innerHTML='<div class="partner-wishes-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg><h2>Желания</h2><span class="partner-wishes-count" hidden></span></div><div class="partner-wishes-list" aria-live="polite"></div>';
  page.querySelector('.partner-profile-layout').append(section);
  const list=section.querySelector('.partner-wishes-list'),count=section.querySelector('.partner-wishes-count');
  async function refresh(){
   list.textContent='Загружаю желания…';list.classList.add('is-message');
   try{
    const all=await (loadWishes?.()??[]);
    if(!section.isConnected)return;
    const items=(Array.isArray(all)?all:[]).filter(item=>item?.owner===actor);
    list.replaceChildren();list.classList.toggle('is-message',!items.length);count.hidden=!items.length;count.textContent=String(items.length);
    if(!items.length){list.textContent='Пока нет желаний';return}
    for(const item of items){
     let url='';try{const parsed=new URL(String(item.url||''),location.origin);if(item.url&&['https:','http:'].includes(parsed.protocol))url=parsed.href}catch(_){}
     const row=document.createElement(url?'a':'div');row.className='partner-wish-row'+(url?' partner-wish-link':'')+(item.done?' is-done':'');
     const text=document.createElement('span');text.className='partner-wish-text';text.textContent=String(item.text||'Желание');row.append(text);
     if(item.done){const status=document.createElement('span');status.className='partner-wish-done';status.textContent='Исполнено';row.append(status)}
     if(url){row.href=url;row.target='_blank';row.rel='noopener noreferrer';const arrow=document.createElement('span');arrow.className='partner-wish-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');row.append(arrow);if(openWish)row.addEventListener('click',event=>{event.preventDefault();openWish(url)})}
     list.append(row);
    }
   }catch(_){
    if(!section.isConnected)return;
    list.textContent='Не удалось загрузить желания. ';list.classList.add('is-message');
    const retry=document.createElement('button');retry.type='button';retry.className='partner-wishes-retry';retry.textContent='Повторить';retry.onclick=refresh;list.append(retry);
   }
  }
  void refresh();
 }

 function close(fromHistory=false){
  if(!active)return;
  const saved=active;active=null;
  saved.page.querySelector('.partner-cbt-status')?.remove();
  for(const {node,marker} of saved.parts||[])marker.replaceWith(node);
  for(const group of saved.groups||[])group.remove();
  clearInterval(saved.birthdayTimer);
  for(const {node,marker,style} of saved.slots){marker.replaceWith(node);if(style===null)node.removeAttribute('style');else node.setAttribute('style',style)}
  for(const {node,style} of saved.paints){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style)}
  saved.tile.hidden=saved.hidden;
  saved.details.hidden=true;
  saved.page.remove();
  document.body.classList.remove('partner-profile-open');
  window.scrollTo({top:saved.scroll,left:0,behavior:'instant'});
  if(!fromHistory&&history.state?.rudiPartnerProfile)history.back();
  saved.trigger?.focus?.({preventScroll:true});
 }
 function bind(tile,actor,{openStars,balance,refreshBalance,loadWishes,openWish,loadCbtStatus,loadPlans}){
  if(bindings.has(tile))return;
  const details=tile.querySelector('.profile-person-details');
  if(!details)return;
  details.hidden=true;
  const energy=tile.querySelector('.profile-energy-strip');
  tile.classList.add('partner-profile-card');
  function open(trigger){
   if(active)return;
   const head=tile.querySelector('.profile-person-head');
   const advice=details.querySelector('.rhythm-advice');
   const slots=[energy,advice,head,details].filter(Boolean).map(node=>{const marker=document.createComment('partner-content');node.before(marker);const style=node.getAttribute('style');node.removeAttribute('style');return {node,marker,style}});
   const page=document.createElement('section');page.className='rudi-meditation-page partner-profile-page';
   page.dataset.noPullRefresh='true';page.dataset.noSwipeBack='true';
   page.setAttribute('aria-label','Профиль: '+actor);
   page.innerHTML='<header class="rudi-app-page-head personal-tool-page-head fasting-page-head meditation-head partner-profile-bar"><button type="button" class="fasting-back-button rudi-app-page-back partner-profile-back" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><div class="fasting-page-title"><h1></h1></div><button type="button" class="partner-profile-stars"></button></header><div class="partner-profile-content"><div class="partner-profile-layout profile-person-card"></div></div>';
   page.querySelector('h1').textContent=actor;
   const stars=page.querySelector('.partner-profile-stars');
   const updateBalance=()=>{
    const count=balance();
    stars.textContent='⭐ '+(count==null?'…':Number(count).toLocaleString('ru-RU',{maximumFractionDigits:2}));
    stars.setAttribute('aria-label','Звёзды '+actor+': '+(count==null?'загружаются':stars.textContent.slice(3))+'. Открыть историю');
   };
   const paints=[...head.querySelectorAll('#partnerHeaderName,.profile-work-status'),...details.querySelectorAll('.rhythm-advice,.meditation-partner-summary,.profile-partner-habits-summary,.home-cycle-status,.home-cycle-advice,.home-cycle-insight')].map(node=>({node,style:node.getAttribute('style')}));
   for(const {node} of paints){node.style.setProperty('color','var(--text)','important');node.style.setProperty('-webkit-text-fill-color','var(--text)','important')}
   active={tile,details,slots,paints,page,trigger,actor,hidden:tile.hidden,scroll:window.scrollY,updateBalance};
   tile.hidden=true;
   details.hidden=false;
   if(energy)energy.hidden=false;
   page.querySelector('.partner-profile-layout').append(...slots.map(slot=>slot.node));
   document.body.append(page);
   addWishes(page,actor,loadWishes,openWish);
   active.updateBirthday=addBirthday(page,actor);
   active.birthdayTimer=setInterval(active.updateBirthday,60000);
   addCbtStatus(page,actor,loadCbtStatus);
   Object.assign(active,composePage(page,energy,advice,details));
   addPlans(page,actor,loadPlans);
   document.body.classList.add('partner-profile-open');
   window.RudiViewport?.sync();
   history.pushState({...history.state,rudiPartnerProfile:actor},'','#partner-'+(actor==='Диана'?'diana':'rustam'));
   page.querySelector('.partner-profile-back').onclick=()=>close();
   stars.onclick=()=>{
    page.hidden=true;
    document.body.classList.remove('partner-profile-open');
    openStars(actor);
   };
   updateBalance();page.querySelector('.partner-profile-back').focus({preventScroll:true});
   if(balance()==null)refreshBalance?.();
  }
  const triggers=tile.querySelectorAll('#partnerHeaderName,.partner-header-avatar');
  for(const trigger of triggers){
   trigger.setAttribute('role','button');trigger.tabIndex=0;
   trigger.setAttribute('aria-label','Открыть профиль: '+actor);trigger.removeAttribute('title');
   trigger.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();open(trigger)},{capture:true});
   trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopImmediatePropagation();open(trigger)}},{capture:true});
  }
  tile.addEventListener('click',event=>{
   if(active||event.defaultPrevented||document.body.classList.contains('home-layout-editing'))return;
   if(event.target.closest('button,a,input,select,textarea,[role="button"],.profile-energy-strip'))return;
   open(tile.querySelector('#partnerHeaderName'));
  });
  bindings.set(tile,{actor,open});
 }
 window.addEventListener('popstate',()=>{
  if(!active)return;
  if(history.state?.rudiPartnerProfile===active.actor){
   active.page.hidden=false;
   document.body.classList.add('partner-profile-open');
  }else close(true);
 });
 window.addEventListener('rudi:app-tab-change',()=>{
  if(!active)return;
  const visible=document.body.dataset.appTab==='home';
  active.page.hidden=!visible;
  document.body.classList.toggle('partner-profile-open',visible);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)active?.updateBirthday?.()});
 document.addEventListener('keydown',event=>{if(active&&!active.page.hidden&&event.key==='Escape')close()});
 new MutationObserver(()=>{if(active)close(true)}).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
 window.RudiPartnerProfile={bind,close,refresh:()=>active?.updateBalance()};
})();
