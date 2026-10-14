// Read-only events from the same weekly collectors that power RUDI's feed.
(function(){
 'use strict';
 const lists=new Map(),busy=new Set(),lastFetch=new Map(),icons={concert:'🎤',standup:'🎙️',cinema:'🎬'};
 const localDay=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return [parts.year,parts.month,parts.day].join('-')};
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render()})}
 function load(key){
  if(busy.has(key))return;
  const storage='rudi-entertainment-'+key;
  if(!lists.has(key))try{const cached=JSON.parse(localStorage.getItem(storage)||'null');
    if(cached?.days){lists.set(key,cached.days);lastFetch.set(key,Number(cached.at)||0)}}
  catch(_){}
  if(!navigator.onLine||Date.now()-(lastFetch.get(key)||0)<300000)return;
  busy.add(key);lastFetch.set(key,Date.now());
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
 function sortedByTime(items){
  // Unknown showtimes (including theatrical premiere dates) follow timed performances.
  const clock=value=>/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(String(value||''))?value:'99:99';
  return [...items].sort((a,b)=>clock(a.time).localeCompare(clock(b.time))||a.title.localeCompare(b.title,'ru'));
 }
 function group(items){
  const wrapper=document.createElement('div');wrapper.className='calendar-selected-group rudi-entertainment-group';
  wrapper.dataset.rudiEntertainment='1';
  for(const item of sortedByTime(items)){
   if(!icons[item.kind])continue;
   const linked=/^https?:\\/\\/[^\\s]+$/i.test(item.href||'');
   const row=document.createElement(linked?'a':'span');
   row.className='rudi-entertainment-event calendar-selected-row';
   if(linked){row.href=item.href;row.target='_blank';row.rel='noopener noreferrer'}
   else row.classList.add('rudi-entertainment-event-unlinked');
   const icon=document.createElement('span');icon.className='rudi-entertainment-icon';
   icon.textContent=icons[item.kind];icon.setAttribute('aria-hidden','true');row.append(icon);
   if(/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(item.time||'')){
    const clock=document.createElement('time');clock.className='rudi-entertainment-time';
    clock.textContent=item.time;clock.dateTime=item.time;row.append(clock);
   }
   const title=document.createElement('span');title.className='rudi-entertainment-event-title';
   title.textContent=item.title+(item.kind==='concert'&&item.genre?' ('+item.genre+')':'');
   row.append(title);wrapper.append(row);
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
   if(rows(key).length&&!marker){const dot=document.createElement('span');dot.className='rudi-entertainment-marker';dot.setAttribute('aria-hidden','true');(cell.querySelector('.calendar-day-indicators')||cell).append(dot)}
   if(marker&&rows(key).length&&cell.querySelector('.calendar-day-indicators')&&marker.parentElement!==cell.querySelector('.calendar-day-indicators'))cell.querySelector('.calendar-day-indicators').append(marker);
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
  window.addEventListener('online',()=>{lastFetch.clear();schedule()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
