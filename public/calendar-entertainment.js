// Read-only events from the same weekly collectors that power RUDI's feed.
(function(){
 'use strict';
 const lists=new Map(),busy=new Set(),names={concert:'🎤 Концерты',standup:'🎙 Stand Up',cinema:'🎬 Кинопремьеры'};
 const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render()})}
 function load(key){
  if(lists.has(key)||busy.has(key))return;
  const storage='rudi-entertainment-'+key;
  try{const cached=JSON.parse(localStorage.getItem(storage)||'null');
    if(cached?.days){lists.set(key,cached.days);if(Date.now()-cached.at<21600000||!navigator.onLine)return}}
  catch(_){}
  if(!navigator.onLine)return;
  busy.add(key);
  fetch('/api/calendar-entertainment?month='+encodeURIComponent(key),{cache:'no-store'})
   .then(r=>r.ok?r.json():null).then(row=>{
    if(!row?.ok||!Array.isArray(row.days))return;
    lists.set(key,row.days);
    try{localStorage.setItem(storage,JSON.stringify({at:Date.now(),days:row.days}))}catch(_){}
    schedule();
   }).catch(()=>{}).finally(()=>busy.delete(key));
 }
 const rows=key=>key>=localDay()?
   (lists.get(key.slice(0,7))||[]).find(row=>row.date===key)?.items||[]:[];
 function group(items){
  const wrapper=document.createElement('div');wrapper.className='calendar-selected-group rudi-entertainment-group';
  wrapper.dataset.rudiEntertainment='1';
  for(const kind of ['concert','standup','cinema']){
   const subset=items.filter(item=>item.kind===kind);if(!subset.length)continue;
   const h=document.createElement('b');h.textContent=names[kind];wrapper.append(h);
   for(const item of subset){
    const card=document.createElement('details');card.className='rudi-entertainment-event calendar-selected-row';
    const title=document.createElement('summary');title.textContent=item.title;card.append(title);
    const info=document.createElement('small');info.className='rudi-entertainment-event-meta';
    info.textContent=[item.date,item.time,item.venue,item.source].filter(Boolean).join(' · ');card.append(info);
    if(/^https?:\/\//i.test(item.href||'')){
     const link=document.createElement('a');link.href=item.href;link.target='_blank';
     link.rel='noopener noreferrer';link.textContent='Билеты и подробности ↗';card.append(link);
    }
    wrapper.append(card);
   }
  }
  return wrapper;
 }
 function render(){
  if(document.body.dataset.calendarScope!=='shared')return;
  const grid=document.getElementById('workCalendarDays'),selected=document.getElementById('workCalendarSelected');
  if(!grid||!selected)return;
  const cells=[...grid.querySelectorAll('.calendar-day-cell[data-date]')];
  for(const cell of cells){
   const key=cell.dataset.date||'',month=key.slice(0,7);
   if(/^\d{4}-\d{2}$/.test(month))load(month);
   const marker=cell.querySelector('.rudi-entertainment-marker');
   if(rows(key).length&&!marker){const dot=document.createElement('span');dot.className='rudi-entertainment-marker';cell.append(dot)}
   if(!rows(key).length&&marker)marker.remove();
  }
  const chosen=grid.querySelector('.calendar-day-cell.selected')?.dataset.date||'';
  const events=rows(chosen),before=selected.querySelector('[data-rudi-entertainment]');
  const key=events.map(e=>e.kind+e.title+e.time).join('|');
  if(before?.dataset.key===key)return;
  before?.remove();if(!events.length)return;
  let details=selected.querySelector('.calendar-selected-details');
  if(!details){details=document.createElement('div');details.className='calendar-selected-details';selected.append(details)}
  const block=group(events);block.dataset.key=key;
  details.insertBefore(block,details.querySelector('.calendar-selected-holidays'));selected.hidden=false;
 }
 function start(){
  for(const id of ['workCalendarDays','workCalendarSelected']){
   const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{subtree:true,childList:true});
  }
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-calendar-scope']});
  window.addEventListener('online',()=>{lists.clear();schedule()});schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
