(()=>{'use strict';
let modal=null,form=null,itemId='',notesBox=null,historyBox=null;
const app=()=>window.RudiSupplementApp;
const req=(op,payload)=>app().request(op,payload);
const rows=()=>app().getItems();
const setRows=value=>app().setItems(value);
const setStatus=(text,error=false)=>app().setStatus(text,error);
function statusLabel(v){return v==='paused'?'Пауза':v==='finished'?'Закончил':'Принимаю'}
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
function close(){if(modal)modal.hidden=true;itemId='';document.body.classList.remove('supplement-editor-open')}
function build(){
  if(modal)return;
  modal=document.createElement('div');modal.className='supplement-editor-modal';modal.hidden=true;
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='supplement-editor-backdrop';backdrop.setAttribute('aria-label','Закрыть');
  const sheet=document.createElement('section');sheet.className='supplement-editor-sheet';
  const head=document.createElement('div');head.className='supplement-editor-head';
  const title=document.createElement('strong');title.id='supplementEditorTitle';
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='×';head.append(title,closeButton);

  form=document.createElement('form');form.className='supplement-editor-form';
  form.append(
    field('Зачем принимаю','textarea','goal'),
    field('Состав / активные вещества','textarea','ingredients'),
    field('Дозировка','text','dosage'),
    field('Время','time','time'),
    field('Относительно еды','select','food',[['any','Не важно'],['before','До еды'],['with','Во время еды'],['after','После еды']]),
    field('Начало курса','date','startDate'),
    field('Длительность курса, дней','number','durationDays'),
    field('Статус','select','status',[['active','Принимаю'],['paused','Пауза'],['finished','Закончил']]),
    field('Срок годности','date','expirationDate')
  );
  const save=document.createElement('button');save.type='submit';save.className='supplement-editor-save';save.textContent='Сохранить';form.appendChild(save);

  const noteSection=document.createElement('section');noteSection.className='supplement-editor-section';
  const noteTitle=document.createElement('strong');noteTitle.textContent='Самочувствие / заметки';
  const noteForm=document.createElement('form');noteForm.className='supplement-note-form';
  const noteInput=document.createElement('input');noteInput.maxLength=500;noteInput.placeholder='Короткая заметка';
  const noteButton=document.createElement('button');noteButton.type='submit';noteButton.textContent='Добавить';
  noteForm.append(noteInput,noteButton);notesBox=document.createElement('div');notesBox.className='supplement-notes-list';
  noteSection.append(noteTitle,noteForm,notesBox);

  const historySection=document.createElement('section');historySection.className='supplement-editor-section';
  const historyTitle=document.createElement('strong');historyTitle.textContent='История';
  historyBox=document.createElement('div');historyBox.className='supplement-history-list';historySection.append(historyTitle,historyBox);

  sheet.append(head,form,noteSection,historySection);modal.append(backdrop,sheet);document.body.appendChild(modal);
  closeButton.addEventListener('click',close);backdrop.addEventListener('click',close);
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
function renderHistory(item){
  historyBox.replaceChildren();const events=[];
  for(const intake of item.intakes||[])events.push({at:intake.at,text:'✓ Приём отмечен'});
  for(const state of item.statusHistory||[])events.push({at:state.at,text:'Статус: '+statusLabel(state.status)});
  events.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  if(!events.length){historyBox.textContent='История пока пустая.';return}
  for(const event of events.slice(0,30)){const row=document.createElement('div');row.className='supplement-history-row';row.textContent=new Date(event.at).toLocaleString('ru-RU')+' — '+event.text;historyBox.appendChild(row)}
}
function open(id){
  build();const item=rows().find(row=>row.id===id);if(!item)return;itemId=id;
  document.getElementById('supplementEditorTitle').textContent=(app().emojiForSupplement?.(item.name)||'💊')+' '+item.name;
  const e=form.elements;
  e.goal.value=item.goal||'';e.ingredients.value=(item.ingredients||[]).join(', ');e.dosage.value=item.schedule?.dosage||'';e.time.value=item.schedule?.time||'';
  e.food.value=item.schedule?.food||'any';
  e.startDate.value=item.course?.startDate||'';e.durationDays.value=item.course?.durationDays||'';e.status.value=item.status||'active';e.expirationDate.value=item.expirationDate||'';
  renderNotes(item);renderHistory(item);modal.hidden=false;document.body.classList.add('supplement-editor-open');
}
async function saveSettings(event){
  event.preventDefault();if(!itemId)return;
  const e=form.elements,button=form.querySelector('.supplement-editor-save');button.disabled=true;button.textContent='Сохраняю…';
  const patch={
    goal:e.goal.value,ingredients:e.ingredients.value,
    schedule:{dosage:e.dosage.value,time:e.time.value,food:e.food.value},
    course:{startDate:e.startDate.value,durationDays:Number(e.durationDays.value||0)},
    status:e.status.value,expirationDate:e.expirationDate.value
  };
  try{
    const data=await req('update',{id:itemId,patch});setRows(data.items||rows());close();setStatus('Настройки сохранены ✓');
    document.dispatchEvent(new CustomEvent('rudi:supplements-settings-updated'));
  }catch(error){setStatus('Не удалось сохранить настройки.',true)}
  finally{button.disabled=false;button.textContent='Сохранить'}
}
window.RudiSupplementEditor={open,close};
})();