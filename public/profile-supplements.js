(()=>{'use strict';
const API='/api/supplements';
const HABITS_API='/api/habits';
const STORAGE='rudi-personal-profile-v1:';
let actor='',items=[],profile=null,overlay=null,list=null,statusNode=null,tile=null,summary=null,summaryMeta=null,recommendationNode=null,recommendationWrap=null,recommendationToggle=null,collapseButton=null,undoTimer=null,habitUndoTimer=null,trackerGroup=null,homeToolsLoadedActor='',homeToolsLoadPromise=null,habitInfoModal=null,habitInfoClose=null,supplementSummaryNode=null,supplementProgressFill=null,supplementPercentNode=null,guidanceEnrichmentPromise=null,supplementInfoModal=null,supplementInfoTitle=null,supplementInfoBody=null,supplementInfoClose=null;
let habitState={habits:[],archivedHabits:[],completedIds:[],notDoneIds:[],statuses:{},streaks:{},bonusIds:[],collapsed:false,today:'',date:'',done:0,total:0,canCompleteToday:false},habitTile=null,habitList=null,habitProgressText=null,habitProgressFill=null,habitPercentNode=null,habitCollapseButton=null,habitInfoButton=null,habitInfoPanel=null,habitAddButton=null,habitForm=null,habitInput=null,habitPurposeInput=null,habitStatusNode=null,habitDateStrip=null,habitDateInput=null,habitSelectedDate='';

function initData(){return String(window.Telegram?.WebApp?.initData||'')}
function storageKey(){return STORAGE+(actor||'unknown')}
function readPrefs(){try{return JSON.parse(localStorage.getItem(storageKey())||'{}')||{}}catch{return{}}}
function writePrefs(patch){try{localStorage.setItem(storageKey(),JSON.stringify({...readPrefs(),...patch}))}catch{}}
async function request(operation,payload={}){
  const response=await fetch(API,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:initData(),...payload})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.ok){const error=new Error(String(data?.error||'supplements-request-failed'));error.status=response.status;throw error}
  return data;
}
async function habitRequest(operation,payload={}){
  const response=await fetch(HABITS_API,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:initData(),...payload})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.ok){const error=new Error(String(data?.error||'habits-request-failed'));error.status=response.status;throw error}
  if(data.score)document.dispatchEvent(new CustomEvent('rudi:score-updated',{detail:{score:data.score}}));
  return data;
}
function errorText(error){
  const code=String(error?.message||error);
  if(code==='supplement-duplicate')return 'Такой БАД уже есть.';
  if(code==='supplement-ai-quota')return 'Groq временно достиг лимита. Попробуй позже.';
  if(code.startsWith('supplement-ai-')||code==='groq-api-key-missing')return 'Не удалось получить описание от AI.';
  return 'Не удалось выполнить действие.';
}
function setStatus(text,error=false){if(!statusNode)return;statusNode.textContent=text||'';statusNode.hidden=!text;statusNode.classList.toggle('is-error',Boolean(error))}
function setHabitStatus(text,error=false){if(!habitStatusNode)return;habitStatusNode.textContent=text||'';habitStatusNode.hidden=!text;habitStatusNode.classList.toggle('is-error',Boolean(error))}
function habitDateKey(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function habitParseDateKey(value){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12)):null}
function habitDateLabel(value){
  const date=habitParseDateKey(value);if(!date)return'';
  const today=habitState.today||habitDateKey(new Date());
  if(value===today)return'Сегодня';
  const base=habitParseDateKey(today),yesterday=base?habitDateKey(new Date(base.getTime()-86400000)):'';
  if(value===yesterday)return'Вчера';
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(date);
}
function renderHabitDates(){
  if(!habitDateStrip)return;
  const today=habitState.today||habitDateKey(new Date()),selected=habitSelectedDate||habitState.date||today;
  habitDateStrip.replaceChildren();
  const base=habitParseDateKey(today);if(!base)return;
  for(let offset=6;offset>=0;offset--){
    const date=new Date(base.getTime()-offset*86400000),key=habitDateKey(date);
    const button=document.createElement('button');button.type='button';button.className='personal-habit-date';button.classList.toggle('is-selected',key===selected);button.dataset.date=key;
    const weekday=document.createElement('span');weekday.textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:'Europe/Moscow'}).format(date).replace('.','');
    const day=document.createElement('strong');day.textContent=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',timeZone:'Europe/Moscow'}).format(date);
    button.append(weekday,day);
    button.addEventListener('click',()=>loadHabitsForDate(key));
    habitDateStrip.appendChild(button);
  }
  if(habitDateInput){habitDateInput.max=today;habitDateInput.value=selected}
}
async function loadHabitsForDate(date){
  const target=String(date||'').trim();if(!target)return;
  habitSelectedDate=target;setHabitStatus('');
  try{applyHabitView(await habitRequest('list',{date:target}))}
  catch(error){console.error('RUDI_HABIT_DATE_UI_ERROR',error);setHabitStatus('Не удалось загрузить выбранную дату.',true)}
}
function habitEmoji(name){const value=String(name||'').toLowerCase().replace(/ё/g,'е');if(/вод|пить/.test(value))return'💧';if(/заряд|трен|спорт|ходь|шаг/.test(value))return'🏃';if(/чит|книг/.test(value))return'📚';if(/медит|дых/.test(value))return'🧘';if(/сон|спать|ложиться/.test(value))return'🌙';if(/сахар|слад/.test(value))return'🍎';if(/уч|англ|язык/.test(value))return'🧠';return'🌱'}
function applyHabitView(data){
  habitState={
    habits:Array.isArray(data?.habits)?data.habits:[],
    archivedHabits:Array.isArray(data?.archivedHabits)?data.archivedHabits:[],
    completedIds:Array.isArray(data?.completedIds)?data.completedIds:[],
    notDoneIds:Array.isArray(data?.notDoneIds)?data.notDoneIds:[],
    statuses:data?.statuses&&typeof data.statuses==='object'?data.statuses:{},
    streaks:data?.streaks&&typeof data.streaks==='object'?data.streaks:{},
    bonusIds:Array.isArray(data?.bonusIds)?data.bonusIds:[],
    collapsed:Boolean(data?.collapsed),today:String(data?.today||''),date:String(data?.date||data?.today||''),
    done:Number(data?.done||0),total:Number(data?.total||0),canCompleteToday:Boolean(data?.canCompleteToday)
  };
  habitSelectedDate=habitState.date||habitState.today||habitSelectedDate;
  renderHabitDates();renderHabits();applyHabitCollapse();
}
function applyHabitCollapse(){if(!habitTile||!habitCollapseButton)return;habitTile.classList.toggle('is-collapsed',habitState.collapsed===true);habitCollapseButton.setAttribute('aria-expanded',String(!habitState.collapsed));habitCollapseButton.setAttribute('aria-label',habitState.collapsed?'Развернуть «Трекер привычек»':'Свернуть «Трекер привычек»')}
function habitStreakText(value){const n=Math.max(0,Math.round(Number(value)||0)),m100=n%100,m10=n%10,w=m100>=11&&m100<=14?'дней':m10===1?'день':m10>=2&&m10<=4?'дня':'дней';return n+' '+w+' подряд'}
function habitScoreMeta(id){if(habitSelectedDate!==habitState.today)return'За прошлые даты звёзды не меняются';return (habitState.bonusIds||[]).includes(id)?'+0,1 ⭐ за выполнение · −0,1 ⭐ за невыполнение':'Без бонуса и штрафа'}
function habitScoreMessage(data,id,status){if(habitSelectedDate!==habitState.today)return'Статус сохранён. За прошлые даты звёзды не меняются.';if(!(habitState.bonusIds||[]).includes(id))return'Статус сохранён. Эта привычка без бонуса и штрафа.';const d=Number(data?.scoreDelta||0);if(d>0)return'Баланс: +'+String(Number(d.toFixed(2))).replace('.',',')+' ⭐';if(d<0)return'Баланс: '+String(Number(d.toFixed(2))).replace('.',',')+' ⭐';return status==='done'?'Выполнение сохранено.':'Статус «Не выполнено» сохранён.'}
function launchHabitConfetti(anchor){
  if(!anchor||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
  const rect=anchor.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const layer=document.createElement('div');
  layer.setAttribute('aria-hidden','true');
  Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'7200',pointerEvents:'none',overflow:'hidden'});
  const colors=['#45c77a','#f0b84b','#ff718d','#70a7ff','#b58cff','#ffffff'];
  for(let i=0;i<30;i++){
    const piece=document.createElement('span');
    const size=5+Math.random()*5,tx=(Math.random()-.5)*220,lift=55+Math.random()*105,fall=110+Math.random()*150,rot=(Math.random()-.5)*900;
    Object.assign(piece.style,{position:'fixed',left:x+'px',top:y+'px',width:size+'px',height:(size*1.55)+'px',borderRadius:Math.random()>.55?'50%':'2px',background:colors[i%colors.length],boxShadow:'0 1px 2px rgba(0,0,0,.12)',willChange:'transform,opacity'});
    layer.appendChild(piece);
    piece.animate([
      {transform:'translate(-50%,-50%) scale(.7) rotate(0deg)',opacity:1},
      {transform:'translate('+tx*.42+'px,'+(-lift)+'px) scale(1) rotate('+(rot*.45)+'deg)',opacity:1,offset:.38},
      {transform:'translate('+tx+'px,'+fall+'px) scale(.9) rotate('+rot+'deg)',opacity:0}
    ],{duration:820+Math.random()*360,delay:Math.random()*90,easing:'cubic-bezier(.2,.72,.24,1)',fill:'forwards'});
  }
  document.body.appendChild(layer);
  setTimeout(()=>layer.remove(),1400);
}
function showHabitUndo({id,date,previousStatus,nextStatus}){
  if(!id||!date)return;
  let bar=document.getElementById('personalHabitsUndo');
  if(!bar){
    bar=document.createElement('div');
    bar.id='personalHabitsUndo';
    bar.className='personal-supplements-undo personal-habits-undo';
    document.body.appendChild(bar);
  }
  clearTimeout(habitUndoTimer);
  bar.replaceChildren();
  const text=document.createElement('span');
  text.textContent=nextStatus==='notdone'?'Отмечено: не выполнено':'Привычка выполнена';
  const button=document.createElement('button');
  button.type='button';
  button.textContent='Отменить';
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const data=await habitRequest('status',{id,status:previousStatus||'pending',date});
      applyHabitView(data);
      setHabitStatus('Изменение отменено.');
      bar.classList.remove('is-visible');
      try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}
    }catch(error){
      button.disabled=false;
      setHabitStatus('Не удалось отменить изменение.',true);
    }
  });
  bar.append(text,button);
  bar.classList.add('is-visible');
  habitUndoTimer=setTimeout(()=>bar.classList.remove('is-visible'),5000);
}
function renderHabits(){
  if(!habitList||!habitProgressText||!habitProgressFill)return;
  const habits=Array.isArray(habitState.habits)?habitState.habits:[],statuses=habitState.statuses||{},done=habits.filter(h=>statuses[h.id]==='done').length,total=habits.length,percent=total?Math.round(done/total*100):0;
  habitProgressText.textContent=total?done+' из '+total+' выполнено'+(habitSelectedDate&&habitSelectedDate!==habitState.today?' · '+habitDateLabel(habitSelectedDate):''):'Добавь первую привычку';
  habitProgressFill.style.width=percent+'%';if(habitPercentNode)habitPercentNode.textContent=percent+'%';habitList.replaceChildren();
  if(!habits.length){const empty=document.createElement('div');empty.className='personal-habits-empty';empty.textContent='Например: пить воду, читать 20 минут или ложиться спать до 23:00.';habitList.appendChild(empty)}
  for(const habit of habits){
    const id=String(habit.id||''),status=String(statuses[id]||'pending'),isDone=status==='done',isNotDone=status==='notdone';
    const row=document.createElement('div');row.className='personal-habit-row';row.classList.toggle('is-done',isDone);row.classList.toggle('is-notdone',isNotDone);
    const main=document.createElement('div');main.className='personal-habit-main';
    const emoji=document.createElement('span');emoji.className='personal-habit-emoji';emoji.textContent=habit.emoji||habitEmoji(habit.name);
    const copy=document.createElement('div');copy.className='personal-habit-copy';
    const name=document.createElement('div');name.className='personal-habit-name';name.textContent=String(habit.name||'Привычка');
    const purpose=document.createElement('div');purpose.className='personal-habit-purpose';purpose.textContent=String(habit.purpose||'').trim();purpose.hidden=!purpose.textContent;
    const streak=document.createElement('div');streak.className='personal-habit-streak';streak.textContent=habitStreakText(habitState.streaks?.[id]);
    const meta=document.createElement('div');meta.className='personal-habit-score-meta';meta.textContent=habitScoreMeta(id);copy.append(name,purpose,streak,meta);
    const remove=document.createElement('button');remove.type='button';remove.className='personal-habit-remove';remove.textContent='×';remove.setAttribute('aria-label','Переместить привычку в архив: '+habit.name);main.append(emoji,copy,remove);
    const actions=document.createElement('div');actions.className='personal-habit-actions';
    const yes=document.createElement('button');yes.type='button';yes.className='personal-habit-status-button is-done';yes.textContent='Выполнено';yes.classList.toggle('is-active',isDone);
    const doneLocked=isNotDone||(habitSelectedDate===habitState.today&&!habitState.canCompleteToday&&!isDone);
    yes.disabled=doneLocked;yes.title=isNotDone?'После «Не выполнено» изменить на «Выполнено» нельзя':doneLocked?'Можно отметить после 20:00 МСК':'';
    const no=document.createElement('button');no.type='button';no.className='personal-habit-status-button is-notdone';no.textContent='Не выполнено';no.classList.toggle('is-active',isNotDone);actions.append(yes,no);
    const save=async(next)=>{
      if((next==='done'&&yes.disabled)||(next==='notdone'&&no.disabled))return;
      const previousStatus=status;
      const actionDate=habitSelectedDate||habitState.today;
      yes.disabled=true;no.disabled=true;remove.disabled=true;setHabitStatus('');
      try{
        const data=await habitRequest('status',{id,status:next,date:actionDate});
        if(next==='done'&&previousStatus!=='done')launchHabitConfetti(yes);
        applyHabitView(data);
        setHabitStatus(habitScoreMessage(data,id,next));
        if(previousStatus!==next){
          showHabitUndo({id,date:actionDate,previousStatus,nextStatus:next});
        }
      }
      catch(error){console.error('RUDI_HABIT_STATUS_UI_ERROR',error);setHabitStatus(String(error?.message||'')==='habit-done-too-early'?'«Выполнено» можно отметить только после 20:00 МСК.':'Не удалось сохранить статус.',true);yes.disabled=doneLocked;no.disabled=false;remove.disabled=false}
    };
    yes.addEventListener('click',()=>save('done'));no.addEventListener('click',()=>save('notdone'));
    remove.addEventListener('click',async()=>{if(remove.disabled)return;yes.disabled=no.disabled=remove.disabled=true;setHabitStatus('');try{const data=await habitRequest('archive',{id,date:habitSelectedDate||habitState.today});applyHabitView(data);setHabitStatus('Привычка перемещена в архив. Восстановить её нельзя.')}catch(error){console.error('RUDI_HABIT_ARCHIVE_UI_ERROR',error);setHabitStatus('Не удалось переместить привычку в архив.',true);yes.disabled=no.disabled=remove.disabled=false}});
    row.append(main,actions);habitList.appendChild(row);
  }
  const archived=Array.isArray(habitState.archivedHabits)?habitState.archivedHabits:[];
  if(archived.length){
    const section=document.createElement('div');section.className='personal-habits-archive';
    const title=document.createElement('div');title.className='personal-habits-archive-title';title.textContent='Архив · '+archived.length;
    section.appendChild(title);
    for(const habit of archived){
      const row=document.createElement('div');row.className='personal-habit-archive-row';
      const emoji=document.createElement('span');emoji.textContent=habit.emoji||habitEmoji(habit.name);
      const name=document.createElement('span');name.textContent=habit.name;
      row.append(emoji,name);section.appendChild(row);
    }
    habitList.appendChild(section);
  }
}
function prefs(){return readPrefs()}
function ageText(age){const n=Math.max(0,Math.round(Number(age)||0));const mod100=n%100,mod10=n%10;const word=mod100>=11&&mod100<=14?'лет':mod10===1?'год':mod10>=2&&mod10<=4?'года':'лет';return n+' '+word}
function emojiForSupplement(name){const value=String(name||'').toLowerCase().replace(/ё/g,'е');if(/креатин/.test(value))return'🏋️';if(/теанин|l[-\s]?theanine/.test(value))return'🍵';if(/витамин\s*d|d3|к2|k2/.test(value))return'☀️';if(/магни/.test(value))return'⚡';if(/омега|рыб/.test(value))return'🐟';if(/желез/.test(value))return'🩸';if(/цинк/.test(value))return'🛡️';if(/мелатонин/.test(value))return'🌙';if(/коллаген/.test(value))return'🦴';if(/протеин|белок/.test(value))return'🥛';if(/витамин\s*c|аскорб/.test(value))return'🍊';return'💊'}
function renderProfileMeta(){if(!summaryMeta)return;summaryMeta.textContent=profile?.age&&profile?.sexLabel?ageText(profile.age)+' · '+profile.sexLabel:'Твоя личная страница в RUDI'}
function activeSupplementItems(){return items.filter(item=>String(item?.status||'active')==='active')}
function todaySupplementCount(){const today=habitDateKey(new Date());return activeSupplementItems().filter(item=>Array.isArray(item?.intakes)&&item.intakes.some(row=>String(row?.date||'')===today)).length}
function renderSupplementSummary(){
  if(!supplementSummaryNode)return;
  const active=activeSupplementItems(),taken=todaySupplementCount(),percent=active.length?Math.round(taken/active.length*100):0;
  supplementSummaryNode.textContent='Сегодня принято: '+taken+' из '+active.length;
  if(supplementProgressFill)supplementProgressFill.style.width=percent+'%';
  if(supplementPercentNode)supplementPercentNode.textContent=percent+'%';
}
function supplementDescriptionText(item){
  const description=String(item?.description||'').trim();
  const guidance=String(item?.intakeGuidance||'').trim();
  return description+(guidance?'\n\nКогда лучше принимать: '+guidance:'');
}
function ensureSupplementInfoModal(){
  if(supplementInfoModal)return supplementInfoModal;
  supplementInfoModal=document.createElement('div');supplementInfoModal.className='habit-info-modal supplement-info-modal';supplementInfoModal.hidden=true; supplementInfoModal.setAttribute('role','presentation');
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='habit-info-modal-backdrop';backdrop.setAttribute('aria-label','Закрыть описание');
  const dialog=document.createElement('section');dialog.className='habit-info-modal-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','supplementInfoModalTitle');
  supplementInfoClose=document.createElement('button');supplementInfoClose.type='button';supplementInfoClose.className='habit-info-modal-close';supplementInfoClose.setAttribute('aria-label','Закрыть');supplementInfoClose.textContent='×';
  supplementInfoTitle=document.createElement('strong');supplementInfoTitle.id='supplementInfoModalTitle';supplementInfoTitle.className='habit-info-modal-title';
  supplementInfoBody=document.createElement('div');supplementInfoBody.className='habit-info-modal-copy';
  dialog.append(supplementInfoClose,supplementInfoTitle,supplementInfoBody);supplementInfoModal.append(backdrop,dialog);document.body.appendChild(supplementInfoModal);
  const closeInfo=()=>{supplementInfoModal.hidden=true;document.body.classList.remove('habit-info-modal-open')};
  backdrop.addEventListener('click',closeInfo);supplementInfoClose.addEventListener('click',closeInfo);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!supplementInfoModal.hidden)closeInfo()});
  return supplementInfoModal;
}
async function openSupplementInfo(item){
  ensureSupplementInfoModal();
  supplementInfoTitle.textContent=String(item?.name||'БАД');
  supplementInfoBody.textContent='Загружаю описание…';
  supplementInfoModal.hidden=false;document.body.classList.add('habit-info-modal-open');
  let current=item;
  if(!current?.description||!current?.intakeGuidance){
    try{
      const data=await request('describe',{id:item.id});
      if(data?.item){
        current=data.item;
        const index=items.findIndex(row=>row.id===current.id);
        if(index>=0)items[index]=current;
      }
    }catch(error){
      console.warn('RUDI_SUPPLEMENT_INFO_WARN',String(error?.message||error));
    }
  }
  supplementInfoTitle.textContent=String(current?.name||item?.name||'БАД');
  supplementInfoBody.textContent=supplementDescriptionText(current)||'Описание пока недоступно.';
}
async function enrichExistingSupplementGuidance(){
  if(guidanceEnrichmentPromise)return guidanceEnrichmentPromise;
  const pending=items.filter(item=>item?.description&&!item?.intakeGuidance).map(item=>String(item.id||'')).filter(Boolean);
  if(!pending.length)return null;
  guidanceEnrichmentPromise=(async()=>{
    for(const id of pending){
      try{
        const data=await request('describe',{id});
        const index=items.findIndex(row=>row.id===id);
        if(index>=0&&data?.item)items[index]=data.item;
      }catch(error){
        console.warn('RUDI_SUPPLEMENT_GUIDANCE_ENRICH_WARN',id,String(error?.message||error));
      }
    }
    render();
  })().finally(()=>{guidanceEnrichmentPromise=null});
  return guidanceEnrichmentPromise;
}
function applyCollapse(collapsed=true){
  if(!tile||!collapseButton)return;
  tile.classList.toggle('is-collapsed',Boolean(collapsed));
  collapseButton.setAttribute('aria-expanded',String(!collapsed));
  collapseButton.setAttribute('aria-label',collapsed?'Развернуть «БАДы и витамины»':'Свернуть «БАДы и витамины»');
}
function applyPosition(){}
function render(){
  if(!list)return;
  renderSupplementSummary();
  list.replaceChildren();
  if(!items.length){
    const empty=document.createElement('div');empty.className='personal-supplements-empty';empty.textContent='Пока ничего не добавлено.';list.appendChild(empty);document.dispatchEvent(new CustomEvent('rudi:supplements-render'));return;
  }
  for(let item of items){
    const card=document.createElement('article');card.className='supplement-card';card.dataset.id=item.id;
    const top=document.createElement('div');top.className='supplement-card-top';
    const name=document.createElement('div');name.className='supplement-card-name';const emoji=document.createElement('span');emoji.className='supplement-card-emoji';emoji.textContent=emojiForSupplement(item.name);const label=document.createElement('span');label.textContent=item.name;name.append(emoji,label);
    const info=document.createElement('button');info.type='button';info.className='supplement-info-button';info.setAttribute('aria-label','Информация о '+item.name);info.title='Описание';info.textContent='ⓘ';
    const topActions=document.createElement('div');topActions.className='supplement-card-top-actions';topActions.append(info);top.append(name,topActions);
    card.append(top);
    info.addEventListener('click',event=>{event.stopPropagation();openSupplementInfo(item)});
    list.appendChild(card);
  }
  document.dispatchEvent(new CustomEvent('rudi:supplements-render'));
}
function showUndo(removed){
  if(!removed)return;
  let bar=document.getElementById('personalSupplementsUndo');
  if(!bar){bar=document.createElement('div');bar.id='personalSupplementsUndo';bar.className='personal-supplements-undo';document.body.appendChild(bar)}
  clearTimeout(undoTimer);bar.replaceChildren();
  const text=document.createElement('span');text.textContent='БАД удалён';
  const button=document.createElement('button');button.type='button';button.textContent='Отменить';
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{const data=await request('restore',{item:removed});items=data.items||[];render();bar.classList.remove('is-visible')}
    catch(error){button.disabled=false;setStatus(errorText(error),true)}
  });
  bar.append(text,button);bar.classList.add('is-visible');
  undoTimer=setTimeout(()=>bar.classList.remove('is-visible'),6000);
}
function setupDrag(handle){
  let dragging=false,startY=0;
  handle.addEventListener('pointerdown',(event)=>{
    if(!overlay||overlay.hidden)return;
    dragging=true;startY=event.clientY;handle.setPointerCapture?.(event.pointerId);tile.classList.add('is-dragging');document.body.classList.add('personal-supplement-dragging');event.preventDefault();
  });
  handle.addEventListener('pointermove',(event)=>{
    if(!dragging)return;
    const rect=summary.getBoundingClientRect();
    if(event.clientY<rect.top+rect.height/2)summary.parentElement.insertBefore(trackerGroup,summary);
    else summary.parentElement.insertBefore(trackerGroup,summary.nextSibling);
  });
  const finish=(event)=>{
    if(!dragging)return;dragging=false;tile.classList.remove('is-dragging');document.body.classList.remove('personal-supplement-dragging');
    const position=trackerGroup.nextElementSibling===summary?'top':'bottom';writePrefs({position});
    try{handle.releasePointerCapture?.(event.pointerId)}catch{}
  };
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
}
function setupEdgeSwipeBack(){
  if(!overlay||overlay.dataset.edgeSwipeBound==='1')return;
  overlay.dataset.edgeSwipeBound='1';
  let tracking=false,startX=0,startY=0,lastX=0,lastY=0;
  const reset=()=>{tracking=false;startX=0;startY=0;lastX=0;lastY=0};
  overlay.addEventListener('pointerdown',event=>{
    if(overlay.hidden||document.body.classList.contains('supplement-editor-open'))return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(event.clientX>32)return;
    tracking=true;startX=lastX=event.clientX;startY=lastY=event.clientY;
  },{passive:true});
  overlay.addEventListener('pointermove',event=>{
    if(!tracking)return;
    lastX=event.clientX;lastY=event.clientY;
    const dx=lastX-startX,dy=Math.abs(lastY-startY);
    if(dx<0||dy>42&&dy>Math.abs(dx)*0.8)reset();
  },{passive:true});
  overlay.addEventListener('pointerup',event=>{
    if(!tracking)return;
    lastX=event.clientX;lastY=event.clientY;
    const dx=lastX-startX,dy=Math.abs(lastY-startY);
    const shouldClose=dx>=70&&dx>=dy*1.35;
    reset();
    if(shouldClose)close();
  },{passive:true});
  overlay.addEventListener('pointercancel',reset,{passive:true});
}
function build(){
  if(overlay)return overlay;
  overlay=document.createElement('section');overlay.id='personalProfilePage';overlay.className='personal-profile-page';overlay.hidden=true;overlay.setAttribute('aria-label','Личная страница');
  const bar=document.createElement('header');bar.className='personal-profile-bar';
  const back=document.createElement('button');back.type='button';back.className='personal-profile-back';back.setAttribute('aria-label','Назад');back.textContent='‹';
  const title=document.createElement('div');title.className='personal-profile-title';title.textContent='Личная страница';
  const spacer=document.createElement('span');spacer.className='personal-profile-spacer';bar.append(back,title,spacer);
  const content=document.createElement('div');content.className='personal-profile-content';
  summary=document.createElement('article');summary.className='personal-summary-card';
  const summaryName=document.createElement('div');summaryName.id='personalProfileName';summaryName.className='personal-summary-name';
  summaryMeta=document.createElement('div');summaryMeta.className='personal-summary-text';summaryMeta.textContent='Твоя личная страница в RUDI';
  recommendationWrap=document.createElement('div');recommendationWrap.className='personal-daily-recommendation';
  const recommendationLabel=document.createElement('div');recommendationLabel.className='personal-daily-recommendation-label';recommendationLabel.textContent='Рекомендация дня';
  recommendationNode=document.createElement('div');recommendationNode.className='personal-daily-recommendation-text';recommendationNode.textContent='Загружаю…';
  recommendationToggle=document.createElement('button');recommendationToggle.type='button';recommendationToggle.className='personal-daily-recommendation-toggle';recommendationToggle.textContent='Показать полностью';recommendationToggle.hidden=true;
  recommendationToggle.addEventListener('click',()=>{const expanded=recommendationWrap.classList.toggle('is-expanded');recommendationToggle.textContent=expanded?'Свернуть':'Показать полностью'});
  recommendationWrap.append(recommendationLabel,recommendationNode,recommendationToggle);summary.append(summaryName,summaryMeta,recommendationWrap);

  const habitCalendar=document.createElement('div');habitCalendar.className='personal-habits-calendar';
  habitDateStrip=document.createElement('div');habitDateStrip.className='personal-habits-date-strip';
  const habitCalendarPicker=document.createElement('label');habitCalendarPicker.className='personal-habits-calendar-picker';habitCalendarPicker.setAttribute('aria-label','Выбрать прошлую дату');habitCalendarPicker.title='Выбрать прошлую дату';habitCalendarPicker.innerHTML='<span aria-hidden="true">📅</span>';
  habitDateInput=document.createElement('input');habitDateInput.type='date';habitDateInput.className='personal-habits-date-input';habitCalendarPicker.appendChild(habitDateInput);
  habitCalendar.append(habitDateStrip,habitCalendarPicker);

  const homeToolsHost=document.getElementById('homeTileHost')||document.querySelector('.shell');
  habitTile=document.getElementById('habitHomeTile');
  if(!habitTile){habitTile=document.createElement('section');habitTile.id='habitHomeTile';habitTile.className='personal-habits-tile home-tools-tile';habitTile.dataset.appTabSection='home';habitTile.dataset.homeTile='habits';homeToolsHost?.appendChild(habitTile)}
  const habitHead=document.createElement('div');habitHead.className='personal-habits-head';
  const habitLead=document.createElement('div');habitLead.className='personal-home-tile-lead';
  const habitIcon=document.createElement('span');habitIcon.className='personal-home-tile-icon is-habit';habitIcon.textContent='🌱';
  const habitTitleWrap=document.createElement('div');habitTitleWrap.className='personal-habits-title-wrap';
  const habitHeading=document.createElement('h2');habitHeading.textContent='Трекер привычек';
  habitProgressText=document.createElement('div');habitProgressText.className='personal-habits-progress-text';habitProgressText.textContent='Загружаю…';
  habitTitleWrap.append(habitHeading,habitProgressText);habitLead.append(habitIcon,habitTitleWrap);
  const habitHeadActions=document.createElement('div');habitHeadActions.className='personal-habits-head-actions';
  habitInfoButton=document.createElement('button');habitInfoButton.type='button';habitInfoButton.className='personal-habits-info';habitInfoButton.textContent='ⓘ';habitInfoButton.setAttribute('aria-label','Как работают звёзды за привычки');
  habitCollapseButton=document.createElement('button');habitCollapseButton.type='button';habitCollapseButton.className='personal-habits-collapse';habitCollapseButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
  habitHeadActions.append(habitInfoButton,habitCollapseButton);habitHead.append(habitLead,habitHeadActions);
  habitInfoModal=document.createElement('div');habitInfoModal.className='habit-info-modal';habitInfoModal.hidden=true;habitInfoModal.setAttribute('role','presentation');
  const habitInfoBackdrop=document.createElement('button');habitInfoBackdrop.type='button';habitInfoBackdrop.className='habit-info-modal-backdrop';habitInfoBackdrop.setAttribute('aria-label','Закрыть информацию');
  const habitInfoDialog=document.createElement('section');habitInfoDialog.className='habit-info-modal-dialog';habitInfoDialog.setAttribute('role','dialog');habitInfoDialog.setAttribute('aria-modal','true');habitInfoDialog.setAttribute('aria-labelledby','habitInfoModalTitle');
  habitInfoClose=document.createElement('button');habitInfoClose.type='button';habitInfoClose.className='habit-info-modal-close';habitInfoClose.setAttribute('aria-label','Закрыть');habitInfoClose.textContent='×';
  const habitInfoTitle=document.createElement('strong');habitInfoTitle.id='habitInfoModalTitle';habitInfoTitle.className='habit-info-modal-title';habitInfoTitle.textContent='Как работают звёзды';
  habitInfoPanel=document.createElement('div');habitInfoPanel.className='habit-info-modal-copy';
  const habitFemale=actor==='Диана';habitInfoPanel.innerHTML='<p><b>Здесь всё просто.</b></p><p>Первые <b>3 привычки</b> дают или забирают звёзды.</p><p>🟢 '+(habitFemale?'Сделала':'Сделал')+' привычку → получишь <b>+0,1 ⭐</b>.<br>🔴 '+(habitFemale?'Не сделала':'Не сделал')+' → снимется <b>−0,1 ⭐</b>.</p><p>Кнопку <b>«Выполнено»</b> за сегодня можно нажать после <b>20:00 МСК</b>. Само начисление звёзд от времени не зависит.</p><p>Если до конца дня не выбрать статус у бонусной привычки, снимется <b>−0,1 ⭐</b>.</p><p>Остальные привычки можно просто отмечать. За них звёзды не добавляются и не снимаются.</p><p>В <b>21:00</b> RUDI напомнит, если ты что-то '+(habitFemale?'не отметила':'не отметил')+'.</p><p>Если случайно '+(habitFemale?'нажала':'нажал')+' <b>«Выполнено»</b> или <b>«Не выполнено»</b>, у тебя есть <b>5 секунд</b>, чтобы нажать <b>«Отменить»</b>.</p><p>За прошлые дни звёзды не меняются. Если нажмёшь кнопку несколько раз, звёзды дважды не начислятся и не спишутся.</p>';
  habitInfoDialog.append(habitInfoClose,habitInfoTitle,habitInfoPanel);habitInfoModal.append(habitInfoBackdrop,habitInfoDialog);document.body.appendChild(habitInfoModal);
  const habitBody=document.createElement('div');habitBody.className='personal-habits-body';
  const habitProgressRow=document.createElement('div');habitProgressRow.className='personal-habits-progress-row';
  const habitProgress=document.createElement('div');habitProgress.className='personal-habits-progress';
  habitProgressFill=document.createElement('span');habitProgressFill.className='personal-habits-progress-fill';habitProgress.append(habitProgressFill);
  habitPercentNode=document.createElement('span');habitPercentNode.className='personal-habits-percent';habitPercentNode.textContent='0%';
  habitProgressRow.append(habitProgress,habitPercentNode);
  habitList=document.createElement('div');habitList.className='personal-habits-list';
  habitStatusNode=document.createElement('div');habitStatusNode.className='personal-habits-status';habitStatusNode.hidden=true;
  habitAddButton=document.createElement('button');habitAddButton.type='button';habitAddButton.className='personal-habits-add';habitAddButton.textContent='+ Добавить привычку';
  habitForm=document.createElement('form');habitForm.className='personal-habits-form';habitForm.hidden=true;
  habitInput=document.createElement('input');habitInput.type='text';habitInput.maxLength=80;habitInput.autocomplete='off';habitInput.placeholder='Например: Читать 20 минут';
  habitPurposeInput=document.createElement('input');habitPurposeInput.type='text';habitPurposeInput.maxLength=180;habitPurposeInput.autocomplete='off';habitPurposeInput.placeholder='Зачем тебе эта привычка?';
  const habitFormActions=document.createElement('div');habitFormActions.className='personal-habits-form-actions';
  const habitCancel=document.createElement('button');habitCancel.type='button';habitCancel.className='personal-habits-cancel';habitCancel.textContent='Отмена';
  const habitSave=document.createElement('button');habitSave.type='submit';habitSave.className='personal-habits-save';habitSave.textContent='Добавить';
  habitFormActions.append(habitCancel,habitSave);habitForm.append(habitInput,habitPurposeInput,habitFormActions);
  habitBody.append(habitList,habitStatusNode,habitAddButton,habitForm);habitTile.append(habitHead,habitProgressRow,habitCalendar,habitBody);

  tile=document.getElementById('supplementsHomeTile');
  if(!tile){tile=document.createElement('section');tile.id='supplementsHomeTile';tile.className='personal-supplements-tile home-tools-tile';tile.dataset.appTabSection='home';tile.dataset.homeTile='supplements';homeToolsHost?.appendChild(tile)}
  const head=document.createElement('div');head.className='personal-supplements-head';
  const supplementLead=document.createElement('div');supplementLead.className='personal-home-tile-lead';
  const supplementIcon=document.createElement('span');supplementIcon.className='personal-home-tile-icon is-supplement';supplementIcon.textContent='💊';
  const supplementTitleWrap=document.createElement('div');supplementTitleWrap.className='personal-supplements-title-wrap';
  const heading=document.createElement('h2');heading.textContent='БАДы и витамины';
  supplementSummaryNode=document.createElement('div');supplementSummaryNode.className='personal-supplements-summary';supplementSummaryNode.textContent='Сегодня принято: 0 из 0';
  supplementTitleWrap.append(heading,supplementSummaryNode);supplementLead.append(supplementIcon,supplementTitleWrap);
  const actions=document.createElement('div');actions.className='personal-supplements-actions';
  collapseButton=document.createElement('button');collapseButton.type='button';collapseButton.className='personal-supplements-collapse';collapseButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
  actions.append(collapseButton);head.append(supplementLead,actions);
  const supplementProgressRow=document.createElement('div');supplementProgressRow.className='personal-supplements-progress-row';
  const supplementProgress=document.createElement('div');supplementProgress.className='personal-supplements-progress';
  supplementProgressFill=document.createElement('span');supplementProgressFill.className='personal-supplements-progress-fill';supplementProgress.append(supplementProgressFill);
  supplementPercentNode=document.createElement('span');supplementPercentNode.className='personal-supplements-percent';supplementPercentNode.textContent='0%';
  supplementProgressRow.append(supplementProgress,supplementPercentNode);
  const body=document.createElement('div');body.className='personal-supplements-body';
  const form=document.createElement('form');form.className='personal-supplements-form';
  const input=document.createElement('input');input.type='text';input.maxLength=120;input.placeholder='Название БАДа';input.autocomplete='off';
  const add=document.createElement('button');add.type='submit';add.textContent='Добавить';form.append(input,add);
  statusNode=document.createElement('div');statusNode.className='personal-supplements-status';statusNode.hidden=true;
  list=document.createElement('div');list.className='personal-supplements-list';
  body.append(form,statusNode,list);tile.append(head,supplementProgressRow,body);
  const movedNotice=document.createElement('article');movedNotice.className='personal-tools-moved-notice';movedNotice.innerHTML='<strong>Трекер привычек и БАДы теперь на главной</strong>';
  content.append(summary,movedNotice);overlay.append(bar,content);document.body.appendChild(overlay);
  back.addEventListener('click',close);
  habitInfoButton.setAttribute('aria-controls','habitInfoModalTitle');
  const setHabitInfoOpen=(open)=>{
    habitInfoModal.hidden=!open;
    document.body.classList.toggle('habit-info-modal-open',open);
    habitInfoButton.classList.toggle('is-active',open);
    habitInfoButton.setAttribute('aria-expanded',String(open));
    if(open)requestAnimationFrame(()=>habitInfoClose.focus({preventScroll:true}));
    else requestAnimationFrame(()=>habitInfoButton.focus({preventScroll:true}));
  };
  habitInfoButton.addEventListener('click',()=>setHabitInfoOpen(true));
  habitInfoClose.addEventListener('click',()=>setHabitInfoOpen(false));
  habitInfoBackdrop.addEventListener('click',()=>setHabitInfoOpen(false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!habitInfoModal.hidden)setHabitInfoOpen(false)});
  const interactiveTap=(target,root)=>{
    if(!(target instanceof Element))return true;
    if(window.getSelection?.()?.toString?.().trim())return true;
    const hit=target.closest('button,a,input,select,textarea,label,[role="button"],[role="link"],[contenteditable="true"],[data-action],[onclick],.score-sticker,.profile-score-sticker,[data-score-actor]');
    return Boolean(hit&&root.contains(hit));
  };
  const toggleHabitCollapse=async()=>{
    if(habitCollapseButton.disabled)return;
    const previous=habitState.collapsed;habitState={...habitState,collapsed:!previous};applyHabitCollapse();habitCollapseButton.disabled=true;setHabitStatus('');
    try{applyHabitView(await habitRequest('collapse',{collapsed:habitState.collapsed,date:habitSelectedDate||habitState.today}))}
    catch(error){habitState={...habitState,collapsed:previous};applyHabitCollapse();setHabitStatus('Не удалось сохранить состояние блока.',true)}
    finally{habitCollapseButton.disabled=false}
  };
  habitCollapseButton.addEventListener('click',toggleHabitCollapse);
  habitDateInput.addEventListener('change',()=>{const value=habitDateInput.value;if(value)loadHabitsForDate(value)});
  habitAddButton.addEventListener('click',()=>{habitAddButton.hidden=true;habitForm.hidden=false;habitInput.value='';habitPurposeInput.value='';requestAnimationFrame(()=>habitInput.focus({preventScroll:true}))});
  habitCancel.addEventListener('click',()=>{habitForm.hidden=true;habitAddButton.hidden=false;habitInput.value='';habitPurposeInput.value='';setHabitStatus('')});
  habitForm.addEventListener('submit',async(event)=>{
    event.preventDefault();const name=habitInput.value.trim(),purpose=habitPurposeInput.value.trim();if(!name||!purpose||habitSave.disabled){if(name&&!purpose){setHabitStatus('Напиши, зачем тебе эта привычка.',true);habitPurposeInput.focus({preventScroll:true})}return}
    habitSave.disabled=true;habitInput.disabled=true;habitPurposeInput.disabled=true;habitCancel.disabled=true;setHabitStatus('');
    try{applyHabitView(await habitRequest('add',{name,purpose,date:habitSelectedDate||habitState.today}));habitInput.value='';habitPurposeInput.value='';habitForm.hidden=true;habitAddButton.hidden=false}
    catch(error){const code=String(error?.message||error);setHabitStatus(code==='habit-duplicate'?'Такая привычка уже есть.':code==='habit-purpose-required'?'Напиши, зачем тебе эта привычка.':'Не удалось добавить привычку.',true)}
    finally{habitSave.disabled=false;habitInput.disabled=false;habitPurposeInput.disabled=false;habitCancel.disabled=false}
  });
  const toggleSupplementsCollapse=()=>applyCollapse(!tile.classList.contains('is-collapsed'));
  collapseButton.addEventListener('click',toggleSupplementsCollapse);
  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const name=input.value.trim();
    if(!name||add.disabled)return;
    let success=false;
    add.disabled=true;input.disabled=true;setStatus('');
    add.classList.remove('is-success');add.classList.add('is-loading');add.textContent='Добавляю…';
    try{
      const data=await request('add',{name});
      items=data.items||[];input.value='';render();success=true;
      add.classList.remove('is-loading');add.classList.add('is-success');add.textContent='✓ Добавлено';
    }catch(error){
      console.error('RUDI_SUPPLEMENT_ADD_UI_ERROR',error);
      setStatus(errorText(error),true);
    }finally{
      input.disabled=false;
      if(success){
        setTimeout(()=>{add.disabled=false;add.classList.remove('is-success');add.textContent='Добавить';input.focus({preventScroll:true})},650);
      }else{
        add.disabled=false;add.classList.remove('is-loading','is-success');add.textContent='Добавить';
      }
    }
  });
  applyCollapse(true);document.dispatchEvent(new CustomEvent('rudi:home-tiles-ready'));setupEdgeSwipeBack();return overlay;
}
async function loadHomeTools({force=false}={}){
  const nextActor=String(document.body.dataset.rudiActor||'').trim();if(!nextActor)return;
  if(!force&&homeToolsLoadedActor===nextActor)return;
  if(homeToolsLoadPromise)return homeToolsLoadPromise;
  actor=nextActor;build();
  if(homeToolsLoadedActor!==actor)applyCollapse(true);
  setStatus('Загружаю…');setHabitStatus('');
  homeToolsLoadPromise=(async()=>{
    const [supplementsResult,habitsResult]=await Promise.allSettled([request('list'),habitRequest('list')]);
    if(supplementsResult.status==='fulfilled'){
      const data=supplementsResult.value;items=Array.isArray(data.items)?data.items:[];profile=data.profile||null;renderProfileMeta();render();setStatus('');enrichExistingSupplementGuidance();
    }else{console.error('RUDI_SUPPLEMENTS_HOME_LOAD_ERROR',supplementsResult.reason);setStatus(errorText(supplementsResult.reason),true)}
    if(habitsResult.status==='fulfilled'){
      habitSelectedDate=String(habitsResult.value?.date||habitsResult.value?.today||'');applyHabitView(habitsResult.value);
    }else{
      console.error('RUDI_HABITS_HOME_LOAD_ERROR',habitsResult.reason);habitProgressText.textContent='Не удалось загрузить';habitList.replaceChildren();setHabitStatus('Не удалось загрузить привычки.',true);
    }
    homeToolsLoadedActor=actor;
  })().finally(()=>{homeToolsLoadPromise=null});
  return homeToolsLoadPromise;
}
async function open(){return loadHomeTools()}
function close(){}
function bindName(){
  const name=document.getElementById('displayName');
  if(name){name.classList.remove('personal-profile-name-link');name.removeAttribute('role');name.removeAttribute('tabindex');name.removeAttribute('aria-label')}
  const update=()=>{const who=String(document.body.dataset.rudiActor||'').trim();if(who)loadHomeTools()};
  update();new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
  window.addEventListener('focus',()=>loadHomeTools({force:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadHomeTools({force:true})});
}
window.RudiSupplementApp={
  request,
  getActor:()=>actor,
  getItems:()=>items,
  setItems:(next)=>{items=Array.isArray(next)?next:items;render()},
  render,
  setStatus,
  open,
  close,
  emojiForSupplement,
  showUndo,
  loadHomeTools,
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindName,{once:true});else bindName();
})();