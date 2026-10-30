/* Shared care editors for Lulu's profile. */
(()=>{'use strict';
const TZ='Europe/Moscow';
const key=r=>r.kind+':'+r.id;
const day=(value=new Date())=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day};
const dateLabel=value=>value?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:TZ}).format(new Date(value+'T12:00:00Z')):'';
const kg=value=>Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2})+' кг';
const uid=()=>window.crypto?.randomUUID?.()||('care-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const node=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el};
const button=(text,click,cls='')=>{const el=node('button',cls,text);el.type='button';el.addEventListener('click',click);return el};
const schema={
 weight:[['date','Дата','date',true],['kg','Вес, кг','number',true],['note','Комментарий','textarea']],
 goals:[['targetKg','Целевой вес, кг','number']],
 nutrition:[['food','Корм','text'],['grams','Порция за день, г','number'],['treats','Лакомства','text'],['date','Дата смены корма','date'],['note','Комментарий','textarea']],
 prevention:[['type','Что отмечаем','select',true,[['vaccine','Прививка'],['parasite','Обработка от паразитов']]],['product','Препарат','text',true],['date','Дата применения','date',true],['nextDate','Следующая дата','date'],['note','Комментарий','textarea']],
 prescription:[['name','Название назначения','text',true],['dose','Дозировка по назначению','text'],['schedule','Когда принимать','text'],['start','Начало','date',true],['end','Окончание','date'],['doctor','Врач','text'],['note','Комментарий','textarea']]
};
function mount(root,{actor,request}){
 let confirmed=[],revisions={},pending=[],editor=null,disposed=false,status='',loading=true,busy=new Set(),intaking=new Set(),loadPromise=null,generation=0;
 const offline=window.rudiOfflineContent;
 const valid=()=>!disposed&&root.isConnected&&(!offline?.actor||offline.actor()===actor);
 const currentRecords=()=>{const rows=new Map(confirmed.map(r=>[key(r),r]));for(const q of pending){const c=q.data.command;rows.set(key(c),{...c,actor:q.actor,updatedAt:c.expectedUpdatedAt,pendingId:q.id,error:q.error})}return [...rows.values()].filter(r=>!r.deleted)};
 const refreshPending=async()=>{pending=(await offline?.pending?.('lulu','',actor)||[]).filter(row=>row.data?.operation==='care-command')};
 const adopt=record=>{if(Date.parse(revisions[key(record)]||'1970-01-01')>Date.parse(record.updatedAt))return;revisions[key(record)]=record.updatedAt;confirmed=confirmed.filter(r=>key(r)!==key(record));if(!record.deleted)confirmed.push(record)};
 const capture=()=>offline?.capture?.('lulu-care',{records:confirmed,revisions},actor);
 function edit(kind,record){
  const today=day();editor={kind,id:record?.id||(['nutrition','goals'].includes(kind)?'current':uid()),expectedUpdatedAt:record?.updatedAt||revisions[kind+':current']||'',data:structuredClone(record?.data||{})};
  if(!record){if(kind==='weight'||kind==='nutrition'||kind==='prevention')editor.data.date=today;if(kind==='prevention')editor.data.type='vaccine';if(kind==='prescription')editor.data.start=today}
  status='';render();root.querySelector('.lulu-care-editor input,.lulu-care-editor select')?.focus({preventScroll:true});
 }
 async function load(){
  if(loadPromise)return loadPromise;
  const started=generation;
  loadPromise=(async()=>{
   try{
    const saved=await offline?.cached?.('lulu-care',actor);if(!valid()||started!==generation)return;
    if(saved?.records){confirmed=saved.records;revisions=saved.revisions||{}}
    await refreshPending();if(!valid())return;loading=false;render();
    const result=await request('care-get');if(!valid()||started!==generation)return;
    confirmed=result.care?.records||[];revisions=result.care?.revisions||{};await capture();await refreshPending();if(valid())render();
   }catch(_){if(valid()){status=confirmed.length||pending.length?'Без интернета':'Не удалось загрузить записи';loading=false;render()}}
  })().finally(()=>{loadPromise=null});return loadPromise;
 }
 async function submit(command){
  const scope='care:'+key(command);if(busy.has(scope))return false;generation++;busy.add(scope);status='';render();
  try{
   if(pending.some(q=>q.scope===scope)&&offline?.enqueue){
    await offline.enqueue('lulu',scope,{operation:'care-command',command},actor);status=offline.isOffline()?'Сохранено без интернета':'Сохранено';if(!offline.isOffline())void offline.flush();
   }else{
   if(offline?.isOffline?.())throw new TypeError('offline');
   const result=await request('care-command',{command});if(!valid())return false;
   if(!result.record)throw Error('care-response-missing');adopt(result.record);
   const queued=(await offline?.pending?.('lulu',scope,actor))||[];
   for(const q of queued)if(JSON.stringify(q.data.command.data)===JSON.stringify(command.data)&&Boolean(q.data.command.deleted)===Boolean(command.deleted))await offline.discard(q.id,actor);
   await capture();status='Сохранено';
   }
  }catch(error){
   if(!valid())return false;
   const network=['TypeError','AbortError'].includes(error?.name)||/network|fetch|offline|timeout/i.test(error?.message||'');
   if(network&&offline?.enqueue){
    try{await offline.enqueue('lulu',scope,{operation:'care-command',command},actor);status='Сохранено без интернета'}catch(_){status='Не удалось сохранить';return false}
   }else{status=error?.message==='lulu-care-busy'?'Повторите сохранение через пару секунд':error?.message==='lulu-care-conflict'?'Запись уже изменена. Закройте редактор и откройте её снова.':error?.message==='lulu-care-prescription-inactive'?'Назначение уже завершено или ещё не началось':'Проверьте заполненные поля';
    if(error?.message==='lulu-care-conflict'){try{const latest=await request('care-get');if(valid()){confirmed=latest.care?.records||[];revisions=latest.care?.revisions||{}}}catch(_){}}
    return false;
   }
  }finally{await refreshPending().catch(()=>{});busy.delete(scope);if(valid())render()}
  if(editor&&key(editor)===key(command))editor=null;if(valid())render();return true;
 }
 function formFor(kind){
  if(editor?.kind!==kind)return null;
  const draft=editor,form=node('form','lulu-care-editor');form.setAttribute('aria-label','Редактирование: '+({weight:'вес',goals:'целевой вес',nutrition:'питание',prevention:'прививка или обработка',prescription:'назначение'})[kind]);
  for(const [name,label,type,required,options] of schema[kind]){
   const wrap=node('label','lulu-care-field'),title=node('span','',label),input=node(type==='textarea'?'textarea':type==='select'?'select':'input');
   input.name=name;input.required=!!required;input.setAttribute('aria-label',label);
   if(type!=='textarea'&&type!=='select')input.type=type;
   if(type==='select')for(const [value,text]of options){const option=node('option','',text);option.value=value;input.append(option)}
   if(type==='textarea'){input.rows=3;input.maxLength=name==='note'?1000:500}else if(type==='text')input.maxLength=name==='name'||name==='food'||name==='product'||name==='doctor'?160:300;
   if(type==='number'){input.inputMode='decimal';input.min=name==='kg'||name==='targetKg'?'0.1':'1';input.max=name==='grams'?'5000':'100';input.step=name==='grams'?'1':'0.01'}
   if(type==='date'){input.min='2020-01-01';input.max=['date'].includes(name)?day():'2100-12-31'}
   input.value=draft.data[name]??'';
   input.addEventListener('input',()=>{draft.data[name]=type==='number'?(input.value===''?null:Number(input.value)):input.value});wrap.append(title,input);form.append(wrap);
  }
  const actions=node('div','lulu-care-actions'),save=node('button','lulu-care-primary','Сохранить'),cancel=button('Отмена',()=>{editor=null;status='';render()});save.type='submit';save.disabled=busy.has('care:'+key(draft));actions.append(save,cancel);form.append(actions);
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())void submit({kind:draft.kind,id:draft.id,data:structuredClone(draft.data),expectedUpdatedAt:draft.expectedUpdatedAt})});
  return form;
 }
 function actionsFor(record){
  const actions=node('div','lulu-care-row-actions');
  actions.append(button('Изменить',()=>edit(record.kind,record)),button('Удалить',()=>{void submit({kind:record.kind,id:record.id,deleted:true,expectedUpdatedAt:record.updatedAt})},'lulu-care-delete'));
  return actions;
 }
 async function discard(id){await offline?.discard?.(id,actor);await refreshPending();status='Изменение отменено';if(valid())render();void load()}
 function card(title,kind,action){const section=node('section','lulu-care-block lulu-care-'+kind),head=node('div','lulu-care-head');head.append(node('h2','',title),button(action,()=>edit(kind,kind==='nutrition'||kind==='goals'?currentRecords().find(r=>r.kind===kind):null),'lulu-care-add'));section.append(head);return section}
 function row(title,detail,record){const item=node('article','lulu-care-row'),copy=node('div','lulu-care-row-copy');copy.append(node('strong','',title));if(detail)copy.append(node('p','',detail));if(record.pendingId)copy.append(node('small','',record.error?'Нужно проверить изменение':'Без интернета'));item.append(copy);return item}
 function renderWeights(rows){
  const section=card('Вес','weight','Добавить'),weights=rows.filter(r=>r.kind==='weight').sort((a,b)=>(b.data.date+b.updatedAt).localeCompare(a.data.date+a.updatedAt)),target=rows.find(r=>r.kind==='goals');
  const latest=weights[0];section.append(node('div','lulu-care-value',latest?kg(latest.data.kg):'Нет замеров'));
  if(latest)section.append(node('p','lulu-care-muted',dateLabel(latest.data.date)));
  const goal=node('div','lulu-care-goal');goal.append(node('span','',target?.data.targetKg?'Целевой вес: '+kg(target.data.targetKg):'Целевой вес не указан'),button('Указать',()=>edit('goals',target)));section.append(goal);
  if(weights.length>1){
   const series=weights.slice().reverse(),ys=series.map(r=>r.data.kg),low=Math.min(...ys),high=Math.max(...ys),span=high-low||1;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 300 82');svg.setAttribute('class','lulu-care-weight-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','Изменение веса: от '+kg(series[0].data.kg)+' до '+kg(series.at(-1).data.kg));
   const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',series.map((r,i)=>(8+i/(series.length-1)*284).toFixed(1)+','+(68-(r.data.kg-low)/span*52).toFixed(1)).join(' '));svg.append(line);section.append(svg);
  }
  const f=formFor('weight')||formFor('goals');if(f)section.append(f);
  if(weights.length){const details=node('details','lulu-care-history'),summary=node('summary','','История веса');details.append(summary);for(const r of weights){const item=row(kg(r.data.kg),[dateLabel(r.data.date),r.data.note].filter(Boolean).join(' · '),r);item.append(actionsFor(r));details.append(item)}section.append(details)}
  return section;
 }
 function renderNutrition(rows){
  const r=rows.find(r=>r.kind==='nutrition'),section=card('Питание','nutrition',r?'Изменить':'Добавить');
  if(r){section.append(node('strong','lulu-care-value',r.data.food||'Корм не указан'));const lines=[r.data.grams?'Порция за день: '+r.data.grams+' г':'',r.data.treats?'Лакомства: '+r.data.treats:'',r.data.date?'С '+dateLabel(r.data.date):'',r.data.note];for(const line of lines.filter(Boolean))section.append(node('p','lulu-care-muted',line))}else section.append(node('p','lulu-care-muted','Пока не заполнено'));
  if(r)section.append(button('Удалить',()=>void submit({kind:'nutrition',id:r.id,deleted:true,expectedUpdatedAt:r.updatedAt}),'lulu-care-delete'));
  const f=formFor('nutrition');if(f)section.append(f);return section;
 }
 function renderPrevention(rows){
  const section=card('Прививки и обработки','prevention','Добавить'),items=rows.filter(r=>r.kind==='prevention').sort((a,b)=>(a.data.nextDate||'9999').localeCompare(b.data.nextDate||'9999')||b.data.date.localeCompare(a.data.date));
  const f=formFor('prevention');if(f)section.append(f);if(!items.length)section.append(node('p','lulu-care-muted','Пока нет записей'));
  for(const r of items){const title=(r.data.type==='vaccine'?'Прививка · ':'Обработка · ')+r.data.product,item=row(title,dateLabel(r.data.date),r);
   if(r.data.nextDate){const due=node('p','lulu-care-due',(r.data.nextDate<day()?'Плановая дата прошла: ':r.data.nextDate===day()?'Сегодня: ':'Следующая: ')+dateLabel(r.data.nextDate));item.firstChild.append(due)}
   if(r.data.note)item.firstChild.append(node('p','',r.data.note));item.append(actionsFor(r));section.append(item);
  }return section;
 }
 function renderPrescriptions(rows){
  const section=card('Назначения врача','prescription','Добавить'),items=rows.filter(r=>r.kind==='prescription').sort((a,b)=>Number(a.data.completed)-Number(b.data.completed)||b.data.start.localeCompare(a.data.start));
  const f=formFor('prescription');if(f)section.append(f);if(!items.length)section.append(node('p','lulu-care-muted','Пока нет назначений'));
  for(const r of items){
   const ended=r.data.completed||r.data.end&&r.data.end<day(),notStarted=r.data.start>day(),item=row(r.data.name,[r.data.dose,r.data.schedule].filter(Boolean).join(' · '),r),copy=item.firstChild;
   copy.append(node('p','',dateLabel(r.data.start)+(r.data.end?' — '+dateLabel(r.data.end):'')));if(r.data.doctor)copy.append(node('p','','Врач: '+r.data.doctor));if(r.data.note)copy.append(node('p','',r.data.note));
   const doses=rows.filter(d=>d.kind==='intake'&&d.data.prescriptionId===r.id).sort((a,b)=>b.data.at.localeCompare(a.data.at)),today=doses.filter(d=>day(d.data.at)===day());
   copy.append(node('small','lulu-care-muted',ended?'Завершено':notStarted?'Начало '+dateLabel(r.data.start):'Сегодня отмечено приёмов: '+today.length));
   const acts=actionsFor(r);if(!ended&&!notStarted){const take=button('Отметить приём',async()=>{if(intaking.has(r.id))return;intaking.add(r.id);take.disabled=true;try{await submit({kind:'intake',id:uid(),data:{prescriptionId:r.id,at:new Date().toISOString()},expectedUpdatedAt:''})}finally{intaking.delete(r.id);if(valid())render()}},'lulu-care-primary');take.disabled=intaking.has(r.id);acts.prepend(take)}
   acts.append(button(r.data.completed?'Возобновить':'Завершить',()=>void submit({kind:'prescription',id:r.id,data:{...r.data,completed:!r.data.completed},expectedUpdatedAt:r.updatedAt})));item.append(acts);
   if(doses.length){const history=node('details','lulu-care-history');history.append(node('summary','','Приёмы: '+doses.length));for(const d of doses){const line=row(new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(d.data.at)),d.actor,d);line.append(button('Отменить',()=>{void submit({kind:'intake',id:d.id,deleted:true,expectedUpdatedAt:d.updatedAt})}));history.append(line)}item.append(history)}
   section.append(item);
  }return section;
 }
 function render(){
  if(!valid())return;
  const active=root.contains(document.activeElement)?document.activeElement:null,focused=active?.name,selection=active?.selectionStart;
  const rows=currentRecords();root.replaceChildren();
  if(loading)root.append(node('p','lulu-care-muted','Загружаю…'));
  if(status){const msg=node('div','lulu-care-message',status);msg.setAttribute('role','status');root.append(msg)}
  for(const q of pending.filter(row=>row.error)){const error=node('div','lulu-care-message','Не удалось сохранить изменение');error.append(button('Отменить изменение',()=>void discard(q.id)));root.append(error)}
  root.append(renderWeights(rows),renderNutrition(rows),renderPrevention(rows),renderPrescriptions(rows));
  if(focused){const input=root.querySelector('[name="'+focused+'"]');input?.focus({preventScroll:true});if(typeof selection==='number'&&input?.type==='text')input.setSelectionRange(selection,selection)}
 }
 const synced=async event=>{if(event.detail?.actor!==actor||event.detail?.operation!=='care-command'||!valid())return;generation++;if(event.detail.result?.record)adopt(event.detail.result.record);await capture();await refreshPending();if(valid())render()};
 const foreground=()=>{if(valid()){render();void load()}};
 window.addEventListener('rudi-content-operation-synced',synced);window.addEventListener('focus',foreground);
 const visible=()=>{if(!document.hidden)foreground()};document.addEventListener('visibilitychange',visible);
 const timer=setInterval(()=>{if(valid()&&!editor)render()},60000);
 render();void load();
 return ()=>{disposed=true;clearInterval(timer);window.removeEventListener('rudi-content-operation-synced',synced);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',visible)};
}
window.RudiLuluCare={mount};
})();
