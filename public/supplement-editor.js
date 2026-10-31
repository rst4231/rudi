(()=>{'use strict';
let modal=null,form=null,itemId='',notesBox=null,historyBox=null,timeInputsWrap=null,draftTimes=[],previousFocus=null,editorActor='';
const app=()=>window.RudiSupplementApp;
const req=(op,payload)=>app().request(op,payload);
const rows=()=>app().getItems();
const setRows=value=>app().setItems(value);
const setStatus=(text,error=false)=>app().setStatus(text,error);
function statusLabel(v){return v==='paused'?'На паузе':v==='finished'?(app().getActor()==='Диана'?'Закончила':'Закончил'):'Принимаю'}
function field(label,type,name,options=[]){
  const wrap=document.createElement('label');wrap.className='supplement-editor-field';
  const title=document.createElement('span');title.textContent=label;let input;
  if(type==='select'){
    input=document.createElement('select');
    for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;input.appendChild(option)}
  }else if(type==='textarea'){
    input=document.createElement('textarea');input.rows=2;
  }else{
    input=document.createElement('input');input.type=type;
  }
  input.name=name;wrap.append(title,input);return wrap;
}
function plannedTimes(){
  return Math.max(1,Math.min(12,Math.round(Number(form?.elements.timesPerDay?.value)||1)));
}
function renderTimeInputs(){
  if(!timeInputsWrap)return;
  const count=plannedTimes();
  timeInputsWrap.replaceChildren();
  const heading=document.createElement('span');
  heading.className='supplement-editor-times-heading';
  heading.textContent=count===1?'Время приёма':'Время каждого приёма';
  timeInputsWrap.appendChild(heading);
  const grid=document.createElement('div');
  grid.className='supplement-editor-times-grid';
  for(let index=0;index<count;index++){
    const row=field(count===1?'Время':'Приём '+(index+1),'time','intakeTime'+index);
    const input=row.querySelector('input');
    input.value=draftTimes[index]||'';
    input.addEventListener('input',()=>{draftTimes[index]=input.value});
    grid.appendChild(row);
  }
  timeInputsWrap.appendChild(grid);
}
function close({fromHistory=false}={}){
  if(!modal||modal.hidden)return;
  modal.hidden=true;itemId='';draftTimes=[];document.body.classList.remove('supplement-editor-open');
  if(!fromHistory&&history.state?.rudiSupplementEditor)history.back();
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
}
function build(){
  if(modal)return;
  modal=document.createElement('section');modal.className='supplement-editor-modal supplement-editor-page';modal.hidden=true;modal.setAttribute('aria-labelledby','supplementEditorTitle');modal.dataset.noPullRefresh='true';
  const sheet=document.createElement('section');sheet.className='supplement-editor-sheet';
  const head=document.createElement('header');head.className='supplement-editor-head rudi-app-page-head';
  const title=document.createElement('h1');title.id='supplementEditorTitle';title.tabIndex=-1;
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='supplement-editor-back fasting-back-button rudi-app-page-back';closeButton.setAttribute('aria-label','Назад');closeButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg>';head.append(closeButton,title);

  form=document.createElement('form');form.className='supplement-editor-form';
  form.append(
    field('Зачем принимаю','textarea','goal'),
    field('Состав / активные вещества','textarea','ingredients'),
    field('Дозировка','text','dosage'),
    field('Приёмов в день','number','timesPerDay'),
    timeInputsWrap=document.createElement('div'),
    field('Относительно еды','select','food',[['any','Не важно'],['before','До еды'],['with','Во время еды'],['after','После еды']]),
    field('Начало курса','date','startDate'),
    field('Длительность курса, дней','number','durationDays'),
    field('Статус','select','status',[['active','Принимаю'],['paused','На паузе'],['finished',app().getActor()==='Диана'?'Закончила':'Закончил']]),
    field('Срок годности','date','expirationDate')
  );
  timeInputsWrap.className='supplement-editor-times';
  const timesPerDay=form.elements.timesPerDay;if(timesPerDay){timesPerDay.min='1';timesPerDay.max='12';timesPerDay.step='1';timesPerDay.inputMode='numeric';timesPerDay.addEventListener('input',renderTimeInputs);timesPerDay.addEventListener('change',renderTimeInputs)}
  const save=document.createElement('button');save.type='submit';save.className='supplement-editor-save';save.textContent='Сохранить';form.appendChild(save);

  const noteSection=document.createElement('section');noteSection.className='supplement-editor-section';
  const noteTitle=document.createElement('strong');noteTitle.textContent='Самочувствие / заметки';
  const noteForm=document.createElement('form');noteForm.className='supplement-note-form';
  const noteInput=document.createElement('input');noteInput.maxLength=500;noteInput.placeholder='Короткая заметка';
  const noteButton=document.createElement('button');noteButton.type='submit';noteButton.textContent='Добавить';
  noteForm.append(noteInput,noteButton);notesBox=document.createElement('div');notesBox.className='supplement-notes-list';
  noteSection.append(noteTitle,noteForm,notesBox);

  const historySection=document.createElement('section');historySection.className='supplement-editor-section';
  const historyTitle=document.createElement('strong');historyTitle.textContent='История приёма';
  historyBox=document.createElement('div');historyBox.className='supplement-history-list';historySection.append(historyTitle,historyBox);

  const content=document.createElement('div');content.className='supplement-editor-content';content.append(form,noteSection,historySection);
  sheet.append(head,content);modal.append(sheet);document.body.appendChild(modal);
  closeButton.addEventListener('click',()=>close());
  form.addEventListener('submit',saveSettings);
  noteForm.addEventListener('submit',async event=>{
    event.preventDefault();const text=noteInput.value.trim();if(!text||!itemId)return;
    noteButton.disabled=true;
    try{
      const data=await req('note',{id:itemId,text});setRows(data.items||rows());noteInput.value='';open(itemId);
    }catch(error){setStatus('Не удалось сохранить заметку.',true)}
    finally{noteButton.disabled=false}
  });
}
function renderNotes(item){
  notesBox.replaceChildren();
  const notes=[...(item.notes||[])].reverse().slice(0,20);
  if(!notes.length){notesBox.textContent='Заметок пока нет.';return}
  for(const note of notes){const row=document.createElement('div');row.className='supplement-note-row';row.textContent=note.date+' — '+note.text;notesBox.appendChild(row)}
}
let historyPeriod='month';
function supplementHistorySeries(item,period='month',now=new Date()){
 const dayKey=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 const today=dayKey(now),end=Date.parse(today+'T00:00:00Z'),day=86400000,monthly=['half','year'].includes(period);
 const n=period==='day'?24:period==='week'?7:period==='half'?6:period==='year'?12:30;
 let start=period==='day'?end:end-(n-1)*day;
 if(monthly){const d=new Date(end);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-n+1);start=d.getTime()}
 const buckets=Array.from({length:n},(_,i)=>{
  const d=new Date(start);if(monthly)d.setUTCMonth(d.getUTCMonth()+i);else if(period!=='day')d.setUTCDate(d.getUTCDate()+i);
  return{key:monthly?d.toISOString().slice(0,7):period==='day'?String(i):d.toISOString().slice(0,10),label:monthly?new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'}).format(d).replace('.',''):period==='day'?String(i).padStart(2,'0'):String(d.getUTCDate()),taken:0,skipped:0};
 });
 const byKey=new Map(buckets.map(b=>[b.key,b]));
 for(const [records,field] of [[item.intakes,'taken'],[item.skips,'skipped']])for(const row of Array.isArray(records)?records:[]){
  const at=new Date(row.at);if(!Number.isFinite(at.getTime())||at>now)continue;
  const date=dayKey(at);if(date<new Date(start).toISOString().slice(0,10)||date>today)continue;
  const key=monthly?date.slice(0,7):period==='day'?String(Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(at))):date;
  const bucket=byKey.get(key);if(bucket)bucket[field]++;
 }
 const created=Date.parse(item.createdAt||''),createdDay=Number.isFinite(created)?Date.parse(dayKey(new Date(created))+'T00:00:00Z'):start;
 const days=Math.max(1,Math.round((end-Math.max(start,Math.min(end,createdDay)))/day)+1);
 return{buckets,days,start:new Date(start).toISOString().slice(0,10),end:today,taken:buckets.reduce((s,b)=>s+b.taken,0),skipped:buckets.reduce((s,b)=>s+b.skipped,0)};
}
function renderHistoryChart(item){
 const model=supplementHistorySeries(item,historyPeriod),root=document.createElement('section');root.className='supplement-history-chart';
 const tabs=document.createElement('div');tabs.className='supplement-history-periods';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Период истории приёма');
 for(const [key,label] of [['day','ДН'],['week','НЕД'],['month','МЕС'],['half','6 МЕС'],['year','ГОД']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(historyPeriod===key));b.onclick=()=>{historyPeriod=key;renderHistory(item);historyBox.querySelectorAll('.supplement-history-periods button')[[ 'day','week','month','half','year'].indexOf(key)]?.focus({preventScroll:true})};tabs.append(b)}
 root.append(tabs);
 const stats=document.createElement('div');stats.className='supplement-history-stats';
 for(const [field,label] of [['taken','Принято'],['skipped','Пропущено']]){const block=document.createElement('div');block.className='is-'+field;const title=document.createElement('span');title.textContent=(historyPeriod==='day'?'':'В среднем за день · ')+label;const value=document.createElement('strong');value.textContent=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(model[field]/(historyPeriod==='day'?1:model.days));const unit=document.createElement('small');unit.textContent=historyPeriod==='day'?'отметок':'отметок / день';block.append(title,value,unit);stats.append(block)}
 root.append(stats);
 const dates=document.createElement('p');dates.className='supplement-history-range';const fmt=key=>new Date(key+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});dates.textContent=fmt(model.start)+(model.start===model.end?'':' — '+fmt(model.end));root.append(dates);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 360 210');svg.setAttribute('role','img');svg.setAttribute('aria-label','История приёма: принято '+model.taken+', отмечено пропусков '+model.skipped);
 const max=Math.max(2,...model.buckets.map(b=>b.taken+b.skipped)),top=Math.ceil(max/2)*2,plot=320,height=165,step=plot/model.buckets.length;
 let content='';for(let i=0;i<=3;i++){const y=10+height*i/3;content+='<path class="history-grid" d="M0 '+y+'H320"/><text x="326" y="'+(y+4)+'">'+Math.round(top*(1-i/3))+'</text>'}
 model.buckets.forEach((b,i)=>{const x=i*step+step*.17,w=step*.66,ht=b.taken/top*height,hs=b.skipped/top*height;content+='<path class="history-grid history-vertical" d="M'+(i*step)+' 10V175"/>';if(ht)content+='<rect class="history-taken" x="'+x+'" y="'+(175-ht)+'" width="'+w+'" height="'+ht+'"><title>'+b.key+': принято '+b.taken+'</title></rect>';if(hs)content+='<rect class="history-skipped" x="'+x+'" y="'+(175-ht-hs)+'" width="'+w+'" height="'+hs+'"><title>'+b.key+': пропущено '+b.skipped+'</title></rect>';if(model.buckets.length<=12||i%Math.ceil(model.buckets.length/6)===0)content+='<text text-anchor="middle" x="'+(i*step+step/2)+'" y="194">'+b.label+'</text>'});
 svg.innerHTML=content;root.append(svg);
 const note=document.createElement('p');note.className='supplement-history-caption';note.textContent=model.taken+model.skipped?'Пропуски учитываются только по явным отметкам. Одна отметка — один приём, не количество таблеток.':'За этот период нет отметок приёма или пропуска.';root.append(note);historyBox.append(root);
}

function renderHistory(item){
  historyBox.replaceChildren();
  renderHistoryChart(item);
  const sorted=events=>events.filter(event=>Number.isFinite(Date.parse(event.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const makeRow=(event,text)=>{const row=document.createElement('div');row.className='supplement-history-row';row.textContent=new Date(event.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' — '+text;return row};
  const intakes=sorted([...(item.intakes||[])]),list=document.createElement('div');list.className='supplement-history-intakes';historyBox.append(list);
  if(!intakes.length)list.textContent='Приёмов пока нет.';
  for(const intake of intakes.slice(0,3))list.append(makeRow(intake,'✓ Приём отмечен'));
  if(intakes.length>3){
    const toggle=document.createElement('button');toggle.type='button';toggle.className='supplement-history-more';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','supplementHistoryRest');
    const rest=document.createElement('div');rest.id='supplementHistoryRest';rest.className='supplement-history-rest';rest.hidden=true;
    const label='Развернуть историю · ещё '+(intakes.length-3);toggle.textContent=label;
    for(const intake of intakes.slice(3))rest.append(makeRow(intake,'✓ Приём отмечен'));
    toggle.onclick=()=>{rest.hidden=!rest.hidden;toggle.setAttribute('aria-expanded',String(!rest.hidden));toggle.textContent=rest.hidden?label:'Свернуть историю'};
    list.append(toggle,rest);
  }
  const states=sorted([...(item.statusHistory||[])]);
  if(states.length){const details=document.createElement('details');details.className='supplement-status-history';const summary=document.createElement('summary');summary.textContent='Изменения статуса';details.append(summary);for(const state of states)details.append(makeRow(state,'Статус: '+statusLabel(state.status)));historyBox.append(details)}
}
function open(id,{fromHistory=false}={}){
  build();const item=rows().find(row=>row.id===id);if(!item)return;const entering=modal.hidden;if(entering)previousFocus=document.activeElement;if(itemId!==id)historyPeriod='month';itemId=id;editorActor=app().getActor();
  document.getElementById('supplementEditorTitle').textContent=(app().emojiForSupplement?.(item.name)||'💊')+' '+item.name;
  const e=form.elements;
  e.goal.value=item.goal||'';e.ingredients.value=(item.ingredients||[]).join(', ');e.dosage.value=item.schedule?.dosage||'';e.timesPerDay.value=Math.max(1,Number(item.schedule?.timesPerDay)||1);
  draftTimes=Array.isArray(item.schedule?.times)?[...item.schedule.times]:[item.schedule?.time||''];
  if(!draftTimes[0])draftTimes[0]=item.schedule?.time||'';
  renderTimeInputs();
  e.food.value=item.schedule?.food||'any';
  e.startDate.value=item.course?.startDate||'';e.durationDays.value=item.course?.durationDays||'';e.status.value=item.status||'active';e.expirationDate.value=item.expirationDate||'';
  renderNotes(item);renderHistory(item);modal.hidden=false;document.body.classList.add('supplement-editor-open');
  if(entering){modal.querySelector('.supplement-editor-content').scrollTop=0;document.getElementById('supplementEditorTitle').focus({preventScroll:true});if(!fromHistory)history.pushState({...history.state,rudiSupplementEditor:id,rudiSupplementActor:editorActor},'')}

}
async function saveSettings(event){
  event.preventDefault();if(!itemId)return;
  const e=form.elements,button=form.querySelector('.supplement-editor-save');button.disabled=true;button.textContent='Сохраняю…';
  const patch={
    goal:e.goal.value,ingredients:e.ingredients.value,
    schedule:{dosage:e.dosage.value,timesPerDay:plannedTimes(),time:draftTimes[0]||'',times:Array.from({length:plannedTimes()},(_,index)=>draftTimes[index]||''),food:e.food.value},
    course:{startDate:e.startDate.value,durationDays:Number(e.durationDays.value||0)},
    status:e.status.value,expirationDate:e.expirationDate.value
  };
  try{
    const data=await req('update',{id:itemId,patch});setRows(data.items||rows());close();setStatus('Настройки сохранены ✓');
    document.dispatchEvent(new CustomEvent('rudi:supplements-settings-updated'));
  }catch(error){setStatus('Не удалось сохранить настройки.',true)}
  finally{button.disabled=false;button.textContent='Сохранить'}
}
window.addEventListener('popstate',event=>{
  const state=event.state;
  if(state?.rudiSupplementEditor&&state.rudiSupplementActor===app()?.getActor()){
    if(modal?.hidden)open(state.rudiSupplementEditor,{fromHistory:true});
  }else close({fromHistory:true});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal&&!modal.hidden){event.preventDefault();close()}});
new MutationObserver(()=>{if(modal&&!modal.hidden&&editorActor!==app()?.getActor())close({fromHistory:true})}).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
document.addEventListener('rudi:supplement-intake-updated',()=>{const item=rows().find(row=>row.id===itemId);if(modal&&!modal.hidden&&item)renderHistory(item)});
window.RudiSupplementEditor={open,close};
})();