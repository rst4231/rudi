/* Calendar search uses the existing authenticated calendar readers. */
(()=>{'use strict';
 let config=null,dialog=null,timer=0,sequence=0,controller=null,opener=null;
 const fold=text=>String(text||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const matches=(row,query)=>fold(query).split(' ').filter(Boolean).every(word=>fold([row.title,row.description,row.date,row.source].join(' ')).includes(word));
 function close(){sequence++;clearTimeout(timer);controller?.abort();dialog?.close();opener?.focus?.()}
 function paint(rows,message='Ничего не найдено'){
  const host=dialog.querySelector('.calendar-search-results');host.replaceChildren();
  if(!rows.length){const text=document.createElement('p');text.textContent=message;host.append(text);return}
  for(const row of rows.slice(0,100)){
   const button=document.createElement('button');button.type='button';const title=document.createElement('strong'),meta=document.createElement('small');
   title.textContent=row.title;meta.textContent=[row.date,row.startTime,row.source].filter(Boolean).join(' · ');button.append(title,meta);
   button.addEventListener('click',()=>{close();config.openResult(row)});host.append(button);
  }
 }
 async function search(){
  clearTimeout(timer);controller?.abort();dialog.querySelector('.calendar-search-status').textContent='';const token=++sequence,actor=config.actor(),query=dialog.querySelector('input').value.trim();
  if(!query){paint([],'Личный, общий и подключённые календари');return}
  if(query.length<2){paint([],'Введите хотя бы два символа');return}
  const local=(config.localEntries?.()||[]).filter(row=>matches(row,query));paint(local,'Ищу…');
  timer=setTimeout(async()=>{
   controller=new AbortController();try{
    const result=await config.search(query,controller.signal);if(token!==sequence||config.actor()!==actor||!dialog.open)return;
    const rows=[],seen=new Set();for(const row of [...result.rows,...local]){const key=[row.scope,row.id||row.title,row.date,row.startTime].join('|');if(!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date||''))||!row.title||seen.has(key)||!matches(row,query))continue;seen.add(key);rows.push(row)}
    rows.sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||'').localeCompare(String(b.startTime||'')));
    paint(rows,result.partial?'Часть календарей сейчас недоступна. Попробуйте позже.':'Ничего не найдено');
    dialog.querySelector('.calendar-search-status').textContent=result.partial&&rows.length?'Показаны доступные результаты. Часть календарей сейчас недоступна.':'';
   }catch(error){if(token===sequence&&error.name!=='AbortError')paint(local,'Нет связи. Поиск доступен по загруженным записям.')}
  },250);
 }
 function open(){
  if(!config)return;opener=document.activeElement;
  if(!dialog){dialog=document.createElement('dialog');dialog.className='calendar-search-dialog';dialog.setAttribute('aria-label','Поиск по всем календарям');dialog.innerHTML='<form method="dialog"><h2>Поиск по календарям</h2><button type="submit" aria-label="Закрыть">×</button></form><input type="search" autocomplete="off" maxlength="100" placeholder="Название дела или события…" aria-label="Поиск по всем календарям"><p class="calendar-search-status" role="status" aria-live="polite"></p><div class="calendar-search-results"></div>';document.body.append(dialog);dialog.querySelector('input').addEventListener('input',search);dialog.addEventListener('close',()=>{sequence++;clearTimeout(timer);controller?.abort()})}
  dialog.querySelector('input').value='';dialog.querySelector('.calendar-search-status').textContent='';paint([],'Личный, общий и подключённые календари');dialog.showModal();dialog.querySelector('input').focus();
 }
 window.RudiCalendarSearch={configure:value=>{config=value},open,matches};
 window.addEventListener('rudi:auth-ready',()=>{if(dialog?.open)close()});
})();
