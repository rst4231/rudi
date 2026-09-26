(()=>{'use strict';
let started=false,searchInput=null,sortSelect=null,statsNode=null,duplicatePanel=null,interactionButton=null,interactionPanel=null,interactionCheck=null;
const app=()=>window.RudiSupplementApp;
const req=(op,payload)=>app().request(op,payload);
const getItems=()=>app().getItems();
const setItems=value=>app().setItems(value);
const setStatus=(text,error=false)=>app().setStatus(text,error);
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function dateMs(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||'')))return null;const [y,m,d]=key.split('-').map(Number);return Date.UTC(y,m-1,d,12)}
function addDays(key,days){const value=dateMs(key);return value===null?'':new Date(value+Number(days||0)*86400000).toISOString().slice(0,10)}
function daysBetween(left,right){const a=dateMs(left),b=dateMs(right);return a===null||b===null?null:Math.round((a-b)/86400000)}
function statusLabel(value){return value==='paused'?'Пауза':value==='finished'?'Закончил':'Принимаю'}
function evidenceLabel(value){return value==='strong'?'🟢 Высокая':value==='moderate'?'🟢 Умеренная':value==='limited'?'🟡 Ограниченная':value==='insufficient'?'⚪ Данных мало':''}
function foodLabel(value){return value==='before'?'до еды':value==='with'?'во время еды':value==='after'?'после еды':''}
function takenToday(item){return(item.intakes||[]).some(row=>row.date===today())}
function streak(item){
  const dates=[...new Set((item.intakes||[]).map(row=>row.date).filter(Boolean))].sort();
  if(!dates.length)return 0;
  const gap=daysBetween(today(),dates[dates.length-1]);if(gap===null||gap>1)return 0;
  let count=1;for(let i=dates.length-1;i>0;i--){if(daysBetween(dates[i],dates[i-1])===1)count++;else break}return count;
}
function courseText(item){
  const start=item.course?.startDate,duration=Number(item.course?.durationDays||0);if(!start||duration<=0)return'';
  const end=addDays(start,duration-1),left=daysBetween(end,today());if(left<0)return'Курс завершён';if(left===0)return'Последний день курса';return'До конца курса '+left+' дн.';
}
function chip(text){const node=document.createElement('span');node.className='supplement-chip';node.textContent=text;return node}
function ensureToolbar(){
  const form=document.querySelector('.personal-supplements-form');if(!form||document.getElementById('supplementAdvancedToolbar'))return;
  const wrap=document.createElement('div');wrap.id='supplementAdvancedToolbar';wrap.className='supplement-advanced-toolbar';
  statsNode=document.createElement('div');statsNode.className='supplement-summary-stats';duplicatePanel=document.createElement('div');duplicatePanel.className='supplement-auto-duplicates';duplicatePanel.hidden=true;
  const tools=document.createElement('div');tools.className='supplement-list-tools';
  searchInput=document.createElement('input');searchInput.type='search';searchInput.placeholder='Поиск';
  sortSelect=document.createElement('select');
  for(const pair of [['added','Сначала новые'],['name','По названию'],['time','По времени'],['status','По статусу']]){const option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];sortSelect.appendChild(option)}
  tools.append(searchInput,sortSelect);
  interactionButton=document.createElement('button');interactionButton.type='button';interactionButton.className='supplement-interaction-button';interactionButton.textContent='🧪 Проверить сочетания';
  interactionPanel=document.createElement('div');interactionPanel.className='supplement-interaction-panel';interactionPanel.hidden=true;
  wrap.append(statsNode,duplicatePanel,tools,interactionButton,interactionPanel);form.insertAdjacentElement('afterend',wrap);
  searchInput.addEventListener('input',applyFilterSort);sortSelect.addEventListener('change',applyFilterSort);interactionButton.addEventListener('click',checkInteractions);
}
function updateStats(){
  if(!statsNode)return;const all=getItems(),active=all.filter(item=>item.status==='active'),paused=all.filter(item=>item.status==='paused').length;
  const morning=active.filter(item=>item.schedule?.time&&item.schedule.time<'12:00').length,evening=active.filter(item=>item.schedule?.time&&item.schedule.time>='18:00').length;
  statsNode.textContent=active.length+' активных · '+morning+' утром · '+evening+' вечером'+(paused?' · '+paused+' на паузе':'');
  renderAutomaticDuplicates(active);
}
function renderAutomaticDuplicates(active){
  if(!duplicatePanel)return;const map=new Map();
  for(const item of active){for(const raw of item.ingredients||[]){const key=String(raw||'').trim().toLowerCase();if(!key)continue;const row=map.get(key)||{ingredient:String(raw).trim(),items:[]};row.items.push(item.name);map.set(key,row)}}
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
    const take=document.createElement('button');take.type='button';take.className='supplement-take';take.textContent=takenToday(item)?'✓ Принято сегодня':'✓ Принял';take.disabled=takenToday(item)||item.status!=='active';
    const edit=document.createElement('button');edit.type='button';edit.className='supplement-edit';edit.textContent='Настроить';actions.append(take,edit);card.appendChild(actions);
    take.addEventListener('click',async event=>{event.stopPropagation();take.disabled=true;take.textContent='Отмечаю…';try{const data=await req('take',{id:item.id});setItems(data.items||getItems());setStatus(data.duplicate?'Уже отмечено сегодня.':'Приём отмечен ✓')}catch(error){take.disabled=false;take.textContent='✓ Принял';setStatus('Не удалось отметить приём.',true)}});
    edit.addEventListener('click',event=>{event.stopPropagation();window.RudiSupplementEditor?.open(item.id)});
    badge.addEventListener('click',event=>event.stopPropagation());
  }
  applyFilterSort();
}
function renderInteraction(){
  if(!interactionPanel)return;interactionPanel.replaceChildren();if(!interactionCheck){interactionPanel.hidden=true;return}interactionPanel.hidden=false;
  const summary=document.createElement('p');summary.textContent=interactionCheck.summary||'';interactionPanel.appendChild(summary);
  if(interactionCheck.duplicates?.length){const title=document.createElement('strong');title.textContent='Дубли состава';interactionPanel.appendChild(title);for(const row of interactionCheck.duplicates){const p=document.createElement('p');p.textContent='⚠️ '+row.ingredient+': '+row.items.join(', ');interactionPanel.appendChild(p)}}
  if(interactionCheck.warnings?.length){const title=document.createElement('strong');title.textContent='Взаимодействия и ограничения';interactionPanel.appendChild(title);for(const row of interactionCheck.warnings){const p=document.createElement('p');p.textContent='• '+row.title+' — '+row.detail+' · '+evidenceLabel(row.evidenceLevel);interactionPanel.appendChild(p)}}
}
async function checkInteractions(){
  interactionButton.disabled=true;interactionButton.textContent='Groq проверяет…';
  try{const data=await req('interactions',{});interactionCheck=data.interactionCheck;renderInteraction()}
  catch(error){setStatus('Не удалось проверить сочетания.',true)}
  finally{interactionButton.disabled=false;interactionButton.textContent='🧪 Проверить сочетания'}
}

function boot(){
  if(started||!app())return;started=true;
  document.addEventListener('rudi:supplements-render',enhanceCards);
  document.addEventListener('rudi:supplements-settings-updated',()=>{interactionCheck=null;renderInteraction()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})();