(()=>{'use strict';

let started=false;
let statsNode=null,duplicatePanel=null,actionRow=null,drawer=null;
let searchInput=null,sortSelect=null,interactionChoices=null,interactionRun=null,interactionResult=null;
let interactionCheck=null,openActionName='',selectedInteractionIds=new Set();
const actionButtons=new Map(),actionPanels=new Map();

const app=()=>window.RudiSupplementApp;
const req=(op,payload)=>app().request(op,payload);
const getItems=()=>app().getItems();
const setItems=value=>app().setItems(value);
const setStatus=(text,error=false)=>app().setStatus(text,error);
const isDiana=()=>app().getActor()==='Диана';

function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function dateMs(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||'')))return null;const [y,m,d]=key.split('-').map(Number);return Date.UTC(y,m-1,d,12)}
function addDays(key,days){const value=dateMs(key);return value===null?'':new Date(value+Number(days||0)*86400000).toISOString().slice(0,10)}
function daysBetween(left,right){const a=dateMs(left),b=dateMs(right);return a===null||b===null?null:Math.round((a-b)/86400000)}
function statusLabel(value){return value==='paused'?'Пауза':value==='finished'?'Закончил':'Принимаю'}
function evidenceLabel(value){return value==='strong'?'🟢 Высокая':value==='moderate'?'🟢 Умеренная':value==='limited'?'🟡 Ограниченная':value==='insufficient'?'⚪ Данных мало':''}
function foodLabel(value){return value==='before'?'до еды':value==='with'?'во время еды':value==='after'?'после еды':''}
function takenToday(item){return(item.intakes||[]).some(row=>row.date===today())}
function takeIdleLabel(){return isDiana()?'✓ Приняла':'✓ Принял'}
function takeDoneLabel(){return isDiana()?'✓ Приняла сегодня':'✓ Принято сегодня'}

function streak(item){
  const dates=[...new Set((item.intakes||[]).map(row=>row.date).filter(Boolean))].sort();
  if(!dates.length)return 0;
  const gap=daysBetween(today(),dates[dates.length-1]);if(gap===null||gap>1)return 0;
  let count=1;for(let i=dates.length-1;i>0;i--){if(daysBetween(dates[i],dates[i-1])===1)count++;else break}
  return count;
}
function courseText(item){
  const start=item.course?.startDate,duration=Number(item.course?.durationDays||0);if(!start||duration<=0)return'';
  const end=addDays(start,duration-1),left=daysBetween(end,today());
  if(left<0)return'Курс завершён';if(left===0)return'Последний день курса';return'До конца курса '+left+' дн.';
}
function chip(text){const node=document.createElement('span');node.className='supplement-chip';node.textContent=text;return node}

function makeActionButton(name,icon,label){
  const button=document.createElement('button');button.type='button';button.className='supplement-action-icon';button.dataset.action=name;
  button.setAttribute('aria-label',label);button.setAttribute('title',label);button.setAttribute('aria-expanded','false');
  const glyph=document.createElement('span');glyph.className='supplement-action-glyph';glyph.textContent=icon;
  button.appendChild(glyph);actionButtons.set(name,button);
  button.addEventListener('click',()=>toggleAction(name));
  return button;
}
function makePanel(name){
  const panel=document.createElement('section');panel.className='supplement-action-panel';panel.dataset.panel=name;panel.hidden=true;
  actionPanels.set(name,panel);return panel;
}
function toggleAction(name){
  const next=openActionName===name?'':name;openActionName=next;
  for(const [key,button] of actionButtons){const active=key===next;button.classList.toggle('is-active',active);button.setAttribute('aria-expanded',String(active))}
  for(const [key,panel] of actionPanels){const active=key===next;panel.hidden=!active;panel.classList.toggle('is-open',active)}
  drawer?.classList.toggle('is-open',Boolean(next));
  if(next==='search')setTimeout(()=>searchInput?.focus({preventScroll:true}),120);
  if(next==='interactions')renderInteractionChoices();
}

function ensureToolbar(){
  const form=document.querySelector('.personal-supplements-form');
  if(!form||document.getElementById('supplementAdvancedToolbar'))return;

  const wrap=document.createElement('div');wrap.id='supplementAdvancedToolbar';wrap.className='supplement-advanced-toolbar';
  statsNode=document.createElement('div');statsNode.className='supplement-summary-stats';
  duplicatePanel=document.createElement('div');duplicatePanel.className='supplement-auto-duplicates';duplicatePanel.hidden=true;

  actionRow=document.createElement('div');actionRow.className='supplement-action-icons';actionRow.setAttribute('aria-label','Действия с БАДами');
  actionRow.append(
    makeActionButton('add','＋','Добавить БАД'),
    makeActionButton('search','⌕','Поиск'),
    makeActionButton('sort','⇅','Сортировка'),
    makeActionButton('interactions','🧪','Проверить сочетания')
  );

  drawer=document.createElement('div');drawer.className='supplement-action-drawer';
  const addPanel=makePanel('add');form.classList.add('supplement-action-add-form');addPanel.appendChild(form);

  const searchPanel=makePanel('search');
  searchInput=document.createElement('input');searchInput.type='search';searchInput.className='supplement-action-input';searchInput.placeholder='Поиск по названию, цели или составу';searchInput.setAttribute('aria-label','Поиск БАДов');
  searchPanel.appendChild(searchInput);

  const sortPanel=makePanel('sort');
  sortSelect=document.createElement('select');sortSelect.className='supplement-action-select';sortSelect.setAttribute('aria-label','Сортировка БАДов');
  for(const pair of [['added','Сначала новые'],['name','По названию'],['time','По времени'],['status','По статусу']]){const option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];sortSelect.appendChild(option)}
  sortPanel.appendChild(sortSelect);

  const interactionPanel=makePanel('interactions');
  const interactionHint=document.createElement('div');interactionHint.className='supplement-interaction-hint';interactionHint.textContent='Выбери минимум 2 БАДа для проверки';
  interactionChoices=document.createElement('div');interactionChoices.className='supplement-interaction-choices';
  interactionRun=document.createElement('button');interactionRun.type='button';interactionRun.className='supplement-interaction-run';interactionRun.disabled=true;interactionRun.textContent='Проверить выбранные';
  interactionResult=document.createElement('div');interactionResult.className='supplement-interaction-panel';interactionResult.hidden=true;
  interactionPanel.append(interactionHint,interactionChoices,interactionRun,interactionResult);

  drawer.append(addPanel,searchPanel,sortPanel,interactionPanel);
  wrap.append(statsNode,duplicatePanel,actionRow,drawer);
  const body=document.querySelector('.personal-supplements-body');body?.insertBefore(wrap,body.firstChild);

  searchInput.addEventListener('input',applyFilterSort);
  sortSelect.addEventListener('change',applyFilterSort);
  interactionRun.addEventListener('click',checkSelectedInteractions);
}

function updateStats(){
  if(!statsNode)return;
  const all=getItems(),active=all.filter(item=>item.status==='active'),paused=all.filter(item=>item.status==='paused').length;
  const morning=active.filter(item=>item.schedule?.time&&item.schedule.time<'12:00').length;
  const evening=active.filter(item=>item.schedule?.time&&item.schedule.time>='18:00').length;
  statsNode.textContent=active.length+' активных · '+morning+' утром · '+evening+' вечером'+(paused?' · '+paused+' на паузе':'');
  renderAutomaticDuplicates(active);
}
function renderAutomaticDuplicates(active){
  if(!duplicatePanel)return;
  const map=new Map();
  for(const item of active){
    for(const raw of item.ingredients||[]){
      const key=String(raw||'').trim().toLowerCase();if(!key)continue;
      const row=map.get(key)||{ingredient:String(raw).trim(),items:[]};row.items.push(item.name);map.set(key,row);
    }
  }
  const duplicates=[...map.values()].filter(row=>new Set(row.items).size>=2);
  duplicatePanel.replaceChildren();duplicatePanel.hidden=!duplicates.length;
  if(!duplicates.length)return;
  const title=document.createElement('strong');title.textContent='⚠️ Найдены дубли состава';duplicatePanel.appendChild(title);
  for(const row of duplicates){const p=document.createElement('p');p.textContent=row.ingredient+': '+[...new Set(row.items)].join(', ');duplicatePanel.appendChild(p)}
}
function applyFilterSort(){
  const list=document.querySelector('.personal-supplements-list');if(!list)return;
  const query=(searchInput?.value||'').trim().toLowerCase(),sort=sortSelect?.value||'added';
  const rows=getItems().map(item=>({item,card:list.querySelector('[data-id="'+CSS.escape(item.id)+'"]')})).filter(row=>row.card);
  for(const row of rows)row.card.hidden=Boolean(query)&&![row.item.name,row.item.goal,...(row.item.ingredients||[])].join(' ').toLowerCase().includes(query);
  if(sort==='name')rows.sort((a,b)=>a.item.name.localeCompare(b.item.name,'ru'));
  else if(sort==='time')rows.sort((a,b)=>(a.item.schedule?.time||'99:99').localeCompare(b.item.schedule?.time||'99:99'));
  else if(sort==='status')rows.sort((a,b)=>((({active:0,paused:1,finished:2})[a.item.status]??3)-((({active:0,paused:1,finished:2})[b.item.status]??3))));
  for(const row of rows)list.appendChild(row.card);
}

function enhanceCards(){
  ensureToolbar();updateStats();
  const validIds=new Set(getItems().map(item=>item.id));selectedInteractionIds=new Set([...selectedInteractionIds].filter(id=>validIds.has(id)));
  for(const item of getItems()){
    const card=document.querySelector('.supplement-card[data-id="'+CSS.escape(item.id)+'"]');if(!card||card.dataset.advanced==='1')continue;
    card.dataset.advanced='1';card.tabIndex=-1;card.removeAttribute('role');
    const top=card.querySelector('.supplement-card-top'),del=card.querySelector('.supplement-delete'),hint=card.querySelector('.supplement-card-hint');
    const badge=document.createElement('span');badge.className='supplement-status is-'+item.status;badge.textContent=statusLabel(item.status);top.insertBefore(badge,del);
    const meta=document.createElement('div');meta.className='supplement-card-meta';
    if(item.goal)meta.appendChild(chip('🎯 '+item.goal));
    const schedule=[item.schedule?.dosage,item.schedule?.time,foodLabel(item.schedule?.food)].filter(Boolean).join(' · ');if(schedule)meta.appendChild(chip('⏰ '+schedule));
    const course=courseText(item);if(course)meta.appendChild(chip('📅 '+course));
    if(item.expirationDate)meta.appendChild(chip('📦 до '+item.expirationDate));
    const run=streak(item);if(run)meta.appendChild(chip('🔥 '+run+' дн.'));
    if(meta.childNodes.length)top.insertAdjacentElement('afterend',meta);
    if(item.evidenceLevel){const ev=document.createElement('div');ev.className='supplement-evidence';ev.textContent='Доказательность: '+evidenceLabel(item.evidenceLevel);hint.insertAdjacentElement('beforebegin',ev)}
    const actions=document.createElement('div');actions.className='supplement-card-actions';
    const take=document.createElement('button');take.type='button';take.className='supplement-take';take.textContent=takenToday(item)?takeDoneLabel():takeIdleLabel();take.disabled=takenToday(item)||item.status!=='active';
    const edit=document.createElement('button');edit.type='button';edit.className='supplement-edit';edit.textContent='Настроить';actions.append(take,edit);card.appendChild(actions);
    take.addEventListener('click',async event=>{
      event.stopPropagation();take.disabled=true;take.textContent='Отмечаю…';
      try{const data=await req('take',{id:item.id});setItems(data.items||getItems());setStatus(data.duplicate?'Уже отмечено сегодня.':'Приём отмечен ✓')}
      catch(error){take.disabled=false;take.textContent=takeIdleLabel();setStatus('Не удалось отметить приём.',true)}
    });
    edit.addEventListener('click',event=>{event.stopPropagation();window.RudiSupplementEditor?.open(item.id)});
    badge.addEventListener('click',event=>event.stopPropagation());
  }
  if(openActionName==='interactions')renderInteractionChoices();
  applyFilterSort();
}

function renderInteractionChoices(){
  if(!interactionChoices)return;
  interactionChoices.replaceChildren();
  const all=getItems();
  if(all.length<2){
    const empty=document.createElement('div');empty.className='supplement-interaction-empty';empty.textContent='Нужно минимум два БАДа в списке.';interactionChoices.appendChild(empty);
  }else{
    for(const item of all){
      const label=document.createElement('label');label.className='supplement-interaction-choice';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=item.id;checkbox.checked=selectedInteractionIds.has(item.id);
      const icon=document.createElement('span');icon.className='supplement-interaction-choice-icon';icon.textContent=app().emojiForSupplement?.(item.name)||'💊';
      const copy=document.createElement('span');copy.className='supplement-interaction-choice-copy';
      const name=document.createElement('strong');name.textContent=item.name;
      const meta=document.createElement('small');meta.textContent=statusLabel(item.status);
      copy.append(name,meta);label.append(checkbox,icon,copy);
      checkbox.addEventListener('change',()=>{
        if(checkbox.checked)selectedInteractionIds.add(item.id);else selectedInteractionIds.delete(item.id);
        interactionCheck=null;renderInteractionResult();updateInteractionRun();
      });
      interactionChoices.appendChild(label);
    }
  }
  updateInteractionRun();
}
function updateInteractionRun(){
  if(!interactionRun)return;
  const count=selectedInteractionIds.size;interactionRun.disabled=count<2;
  interactionRun.textContent=count>=2?'Проверить выбранные ('+count+')':'Проверить выбранные';
}
function renderInteractionResult(){
  if(!interactionResult)return;
  interactionResult.replaceChildren();
  if(!interactionCheck){interactionResult.hidden=true;return}
  interactionResult.hidden=false;
  const summary=document.createElement('p');summary.textContent=interactionCheck.summary||'';interactionResult.appendChild(summary);
  if(interactionCheck.duplicates?.length){
    const title=document.createElement('strong');title.textContent='Дубли состава';interactionResult.appendChild(title);
    for(const row of interactionCheck.duplicates){const p=document.createElement('p');p.textContent='⚠️ '+row.ingredient+': '+row.items.join(', ');interactionResult.appendChild(p)}
  }
  if(interactionCheck.warnings?.length){
    const title=document.createElement('strong');title.textContent='Взаимодействия и ограничения';interactionResult.appendChild(title);
    for(const row of interactionCheck.warnings){const p=document.createElement('p');p.textContent='• '+row.title+' — '+row.detail+' · '+evidenceLabel(row.evidenceLevel);interactionResult.appendChild(p)}
  }
}
async function checkSelectedInteractions(){
  const selectedIds=[...selectedInteractionIds];if(selectedIds.length<2)return;
  interactionRun.disabled=true;interactionRun.textContent='Groq проверяет…';setStatus('');
  try{const data=await req('interactions',{selectedIds});interactionCheck=data.interactionCheck;renderInteractionResult()}
  catch(error){setStatus('Не удалось проверить выбранные сочетания.',true)}
  finally{updateInteractionRun()}
}

function boot(){
  if(started||!app())return;started=true;
  document.addEventListener('rudi:supplements-render',enhanceCards);
  document.addEventListener('rudi:supplements-settings-updated',()=>{interactionCheck=null;renderInteractionResult()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})();