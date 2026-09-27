(()=>{'use strict';
const API='/api/supplements';
const HABITS_API='/api/habits';
const STORAGE='rudi-personal-profile-v1:';
let actor='',items=[],profile=null,overlay=null,list=null,statusNode=null,tile=null,summary=null,summaryMeta=null,recommendationNode=null,recommendationWrap=null,recommendationToggle=null,collapseButton=null,undoTimer=null,trackerGroup=null,homeToolsLoadedActor='',homeToolsLoadPromise=null,habitInfoModal=null,habitInfoClose=null;
let habitState={habits:[],completedIds:[],notDoneIds:[],statuses:{},streaks:{},bonusIds:[],collapsed:false,today:'',date:'',done:0,total:0,canCompleteToday:false},habitTile=null,habitList=null,habitProgressText=null,habitProgressFill=null,habitPercentNode=null,habitCollapseButton=null,habitInfoButton=null,habitInfoPanel=null,habitAddButton=null,habitForm=null,habitInput=null,habitStatusNode=null,habitDateStrip=null,habitDateInput=null,habitSelectedDate='';

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
function habitScoreMeta(id){if(habitSelectedDate!==habitState.today)return'За прошлые даты звёзды не меняются';return (habitState.bonusIds||[]).includes(id)?'+0,05 ⭐ за выполнение · −0,1 ⭐ за невыполнение':'Без бонуса и штрафа'}
function habitScoreMessage(data,id,status){if(habitSelectedDate!==habitState.today)return'Статус сохранён. За прошлые даты звёзды не меняются.';if(!(habitState.bonusIds||[]).includes(id))return'Статус сохранён. Эта привычка без бонуса и штрафа.';const d=Number(data?.scoreDelta||0);if(d>0)return'Баланс: +'+String(Number(d.toFixed(2))).replace('.',',')+' ⭐';if(d<0)return'Баланс: '+String(Number(d.toFixed(2))).replace('.',',')+' ⭐';return status==='done'?'Выполнение сохранено.':'Статус «Не выполнено» сохранён.'}
function renderHabits(){
  if(!habitList||!habitProgressText||!habitProgressFill)return;
  const habits=Array.isArray(habitState.habits)?habitState.habits:[],statuses=habitState.statuses||{},done=habits.filter(h=>statuses[h.id]==='done').length,total=habits.length,percent=total?Math.round(done/total*100):0;
  habitProgressText.textContent=total?done+' из '+total+' выполнено'+(habitSelectedDate&&habitSelectedDate!==habitState.today?' · '+habitDateLabel(habitSelectedDate):''):'Добавь первую привычку';
  habitProgressFill.style.width=percent+'%';if(habitPercentNode)habitPercentNode.textContent=percent+'%';habitList.replaceChildren();
  if(!habits.length){const empty=document.createElement('div');empty.className='personal-habits-empty';empty.textContent='Например: пить воду, читать 20 минут или ложиться спать до 23:00.';habitList.appendChild(empty);return}
  for(const habit of habits){
    const id=String(habit.id||''),status=String(statuses[id]||'pending'),isDone=status==='done',isNotDone=status==='notdone';
    const row=document.createElement('div');row.className='personal-habit-row';row.classList.toggle('is-done',isDone);row.classList.toggle('is-notdone',isNotDone);
    const main=document.createElement('div');main.className='personal-habit-main';
    const emoji=document.createElement('span');emoji.className='personal-habit-emoji';emoji.textContent=habit.emoji||habitEmoji(habit.name);
    const copy=document.createElement('div');copy.className='personal-habit-copy';
    const name=document.createElement('div');name.className='personal-habit-name';name.textContent=String(habit.name||'Привычка');
    const streak=document.createElement('div');streak.className='personal-habit-streak';streak.textContent=habitStreakText(habitState.streaks?.[id]);
    const meta=document.createElement('div');meta.className='personal-habit-score-meta';meta.textContent=habitScoreMeta(id);copy.append(name,streak,meta);
    const remove=document.createElement('button');remove.type='button';remove.className='personal-habit-remove';remove.textContent='×';remove.setAttribute('aria-label','Удалить привычку '+habit.name);main.append(emoji,copy,remove);
    const actions=document.createElement('div');actions.className='personal-habit-actions';
    const yes=document.createElement('button');yes.type='button';yes.className='personal-habit-status-button is-done';yes.textContent='Выполнено';yes.classList.toggle('is-active',isDone);
    const doneLocked=habitSelectedDate===habitState.today&&!habitState.canCompleteToday&&!isDone;
    yes.disabled=doneLocked;yes.title=doneLocked?'Можно отметить после 20:00 МСК':'';
    const no=document.createElement('button');no.type='button';no.className='personal-habit-status-button is-notdone';no.textContent='Не выполнено';no.classList.toggle('is-active',isNotDone);actions.append(yes,no);
    const save=async(next)=>{
      if((next==='done'&&yes.disabled)||(next==='notdone'&&no.disabled))return;
      yes.disabled=true;no.disabled=true;remove.disabled=true;setHabitStatus('');
      try{const data=await habitRequest('status',{id,status:next,date:habitSelectedDate||habitState.today});applyHabitView(data);setHabitStatus(habitScoreMessage(data,id,next))}
      catch(error){console.error('RUDI_HABIT_STATUS_UI_ERROR',error);setHabitStatus(String(error?.message||'')==='habit-done-too-early'?'«Выполнено» можно отметить только после 20:00 МСК.':'Не удалось сохранить статус.',true);yes.disabled=doneLocked;no.disabled=false;remove.disabled=false}
    };
    yes.addEventListener('click',()=>save('done'));no.addEventListener('click',()=>save('notdone'));
    remove.addEventListener('click',async()=>{if(remove.disabled||!window.confirm('Удалить привычку «'+String(habit.name||'')+'»?'))return;yes.disabled=no.disabled=remove.disabled=true;setHabitStatus('');try{const data=await habitRequest('remove',{id,date:habitSelectedDate||habitState.today});applyHabitView(data);setHabitStatus('Привычка удалена. Она больше не участвует в бонусах и штрафах.')}catch(error){console.error('RUDI_HABIT_REMOVE_UI_ERROR',error);setHabitStatus('Не удалось удалить привычку.',true);yes.disabled=no.disabled=remove.disabled=false}});
    row.append(main,actions);habitList.appendChild(row);
  }
}
function prefs(){return readPrefs()}
function ageText(age){const n=Math.max(0,Math.round(Number(age)||0));const mod100=n%100,mod10=n%10;const word=mod100>=11&&mod100<=14?'лет':mod10===1?'год':mod10>=2&&mod10<=4?'года':'лет';return n+' '+word}
function emojiForSupplement(name){const value=String(name||'').toLowerCase().replace(/ё/g,'е');if(/креатин/.test(value))return'🏋️';if(/теанин|l[-\s]?theanine/.test(value))return'🍵';if(/витамин\s*d|d3|к2|k2/.test(value))return'☀️';if(/магни/.test(value))return'⚡';if(/омега|рыб/.test(value))return'🐟';if(/желез/.test(value))return'🩸';if(/цинк/.test(value))return'🛡️';if(/мелатонин/.test(value))return'🌙';if(/коллаген/.test(value))return'🦴';if(/протеин|белок/.test(value))return'🥛';if(/витамин\s*c|аскорб/.test(value))return'🍊';return'💊'}
function renderProfileMeta(){if(!summaryMeta)return;summaryMeta.textContent=profile?.age&&profile?.sexLabel?ageText(profile.age)+' · '+profile.sexLabel:'Твоя личная страница в RUDI'}
async function loadDailyRecommendation(){
  if(!recommendationNode)return;
  recommendationNode.classList.remove('is-error');recommendationNode.textContent='Groq готовит рекомендацию дня…';
  try{const data=await request('recommendation');profile=data.profile||profile;renderProfileMeta();recommendationNode.textContent=data.recommendation?.text||'Сегодня рекомендации нет.';if(recommendationToggle){recommendationWrap?.classList.remove('is-expanded');recommendationToggle.textContent='Показать полностью';recommendationToggle.hidden=recommendationNode.textContent.length<180}}
  catch(error){console.error('RUDI_PROFILE_RECOMMENDATION_UI_ERROR',error);recommendationNode.classList.add('is-error');recommendationNode.textContent='Не удалось загрузить рекомендацию дня.'}
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
  list.replaceChildren();
  if(!items.length){
    const empty=document.createElement('div');empty.className='personal-supplements-empty';empty.textContent='Пока ничего не добавлено.';list.appendChild(empty);document.dispatchEvent(new CustomEvent('rudi:supplements-render'));return;
  }
  for(let item of items){
    const card=document.createElement('article');card.className='supplement-card';card.dataset.id=item.id;card.tabIndex=0;card.setAttribute('role','button');
    const top=document.createElement('div');top.className='supplement-card-top';
    const name=document.createElement('div');name.className='supplement-card-name';const emoji=document.createElement('span');emoji.className='supplement-card-emoji';emoji.textContent=emojiForSupplement(item.name);const label=document.createElement('span');label.textContent=item.name;name.append(emoji,label);
    const del=document.createElement('button');del.type='button';del.className='supplement-delete';del.setAttribute('aria-label','Удалить '+item.name);del.textContent='×';
    top.append(name,del);
    const hint=document.createElement('div');hint.className='supplement-card-hint';hint.textContent=item.description?'Нажми, чтобы открыть описание':'Нажми, чтобы AI создал краткое описание';
    const desc=document.createElement('div');desc.className='supplement-card-description';desc.hidden=true;desc.textContent=item.description||'';
    card.append(top,hint,desc);
    const open=async()=>{
      if(card.classList.contains('is-loading'))return;
      if(item.description){const next=desc.hidden;desc.hidden=!next;card.classList.toggle('is-open',next);hint.textContent=next?'Скрыть описание':'Нажми, чтобы открыть описание';return}
      card.classList.add('is-loading');hint.textContent='Groq проверяет научные данные…';setStatus('');
      try{
        const data=await request('describe',{id:item.id});item=data.item;const index=items.findIndex(row=>row.id===item.id);if(index>=0)items[index]=item;
        desc.textContent=item.description;desc.hidden=false;card.classList.add('is-open');hint.textContent='Скрыть описание';
      }catch(error){console.error('RUDI_SUPPLEMENT_DESCRIBE_UI_ERROR',error);hint.textContent='Нажми, чтобы AI попробовал снова';setStatus(errorText(error),true)}
      finally{card.classList.remove('is-loading')}
    };
    card.addEventListener('click',(event)=>{if(event.target.closest('.supplement-delete'))return;open()});
    card.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
    del.addEventListener('click',async(event)=>{
      event.stopPropagation();del.disabled=true;setStatus('');
      try{
        const data=await request('remove',{id:item.id});items=data.items||[];render();showUndo(data.removed);
      }catch(error){del.disabled=false;setStatus(errorText(error),true)}
    });
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

  habitTile=document.getElementById('habitHomeTile');
  if(!habitTile){habitTile=document.createElement('section');habitTile.id='habitHomeTile';habitTile.className='personal-habits-tile home-tools-tile';habitTile.dataset.appTabSection='home';habitTile.dataset.homeTile='habits';document.querySelector('.shell')?.appendChild(habitTile)}
  const habitHead=document.createElement('div');habitHead.className='personal-habits-head';
  const habitTitleWrap=document.createElement('div');habitTitleWrap.className='personal-habits-title-wrap';
  const habitHeading=document.createElement('h2');habitHeading.textContent='🌱 Трекер привычек';
  habitProgressText=document.createElement('div');habitProgressText.className='personal-habits-progress-text';habitProgressText.textContent='Загружаю…';
  habitTitleWrap.append(habitHeading,habitProgressText);
  const habitHeadActions=document.createElement('div');habitHeadActions.className='personal-habits-head-actions';
  habitInfoButton=document.createElement('button');habitInfoButton.type='button';habitInfoButton.className='personal-habits-info';habitInfoButton.textContent='ⓘ';habitInfoButton.setAttribute('aria-label','Как работают звёзды за привычки');
  habitCollapseButton=document.createElement('button');habitCollapseButton.type='button';habitCollapseButton.className='personal-habits-collapse';habitCollapseButton.textContent='⌄';
  habitHeadActions.append(habitInfoButton,habitCollapseButton);habitHead.append(habitTitleWrap,habitHeadActions);
  habitInfoModal=document.createElement('div');habitInfoModal.className='habit-info-modal';habitInfoModal.hidden=true;habitInfoModal.setAttribute('role','presentation');
  const habitInfoBackdrop=document.createElement('button');habitInfoBackdrop.type='button';habitInfoBackdrop.className='habit-info-modal-backdrop';habitInfoBackdrop.setAttribute('aria-label','Закрыть информацию');
  const habitInfoDialog=document.createElement('section');habitInfoDialog.className='habit-info-modal-dialog';habitInfoDialog.setAttribute('role','dialog');habitInfoDialog.setAttribute('aria-modal','true');habitInfoDialog.setAttribute('aria-labelledby','habitInfoModalTitle');
  habitInfoClose=document.createElement('button');habitInfoClose.type='button';habitInfoClose.className='habit-info-modal-close';habitInfoClose.setAttribute('aria-label','Закрыть');habitInfoClose.textContent='×';
  const habitInfoTitle=document.createElement('strong');habitInfoTitle.id='habitInfoModalTitle';habitInfoTitle.className='habit-info-modal-title';habitInfoTitle.textContent='Как работают звёзды';
  habitInfoPanel=document.createElement('div');habitInfoPanel.className='habit-info-modal-copy';
  habitInfoPanel.innerHTML='<p>За сегодня кнопку 🟢 <b>«Выполнено»</b> можно нажать только после <b>20:00 МСК</b>. Ограничение относится только к кнопке — начисление награды не привязано ко времени.</p><p>Первые 3 привычки в списке — бонусные.</p><p>🟢 Выполнено сегодня → <b>+0,05 ⭐</b>. 🔴 Не выполнено → <b>−0,1 ⭐</b>.</p><p>Если бонусная привычка останется без статуса до конца дня, после завершения дня спишется <b>−0,1 ⭐</b>.</p><p>Остальные привычки работают без бонуса и штрафа. За прошлые даты звёзды не меняются.</p><p>В 21:00 приходит напоминание, если остались привычки без статуса. Для бонусных привычек оно предупреждает о штрафе.</p><p>Удалённая привычка больше не участвует в наградах, штрафах и напоминаниях. Под названием показывается серия выполнения.</p><p>Повторные переключения защищены от двойных начислений и списаний.</p>';
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
  const habitFormActions=document.createElement('div');habitFormActions.className='personal-habits-form-actions';
  const habitCancel=document.createElement('button');habitCancel.type='button';habitCancel.className='personal-habits-cancel';habitCancel.textContent='Отмена';
  const habitSave=document.createElement('button');habitSave.type='submit';habitSave.className='personal-habits-save';habitSave.textContent='Добавить';
  habitFormActions.append(habitCancel,habitSave);habitForm.append(habitInput,habitFormActions);
  habitBody.append(habitProgressRow,habitList,habitStatusNode,habitAddButton,habitForm);habitTile.append(habitHead,habitCalendar,habitBody);

  tile=document.getElementById('supplementsHomeTile');
  if(!tile){tile=document.createElement('section');tile.id='supplementsHomeTile';tile.className='personal-supplements-tile home-tools-tile';tile.dataset.appTabSection='home';tile.dataset.homeTile='supplements';document.querySelector('.shell')?.appendChild(tile)}
  const head=document.createElement('div');head.className='personal-supplements-head';
  const heading=document.createElement('h2');heading.textContent='💊 БАДы и витамины';
  const actions=document.createElement('div');actions.className='personal-supplements-actions';
  collapseButton=document.createElement('button');collapseButton.type='button';collapseButton.className='personal-supplements-collapse';collapseButton.textContent='⌄';
  actions.append(collapseButton);head.append(heading,actions);
  const body=document.createElement('div');body.className='personal-supplements-body';
  const form=document.createElement('form');form.className='personal-supplements-form';
  const input=document.createElement('input');input.type='text';input.maxLength=120;input.placeholder='Название БАДа';input.autocomplete='off';
  const add=document.createElement('button');add.type='submit';add.textContent='Добавить';form.append(input,add);
  statusNode=document.createElement('div');statusNode.className='personal-supplements-status';statusNode.hidden=true;
  list=document.createElement('div');list.className='personal-supplements-list';
  body.append(form,statusNode,list);tile.append(head,body);
  const movedNotice=document.createElement('article');movedNotice.className='personal-tools-moved-notice';movedNotice.innerHTML='<strong>Трекер привычек и БАДы перенесены</strong><p>Оба блока теперь находятся на главной странице. Смотрите их на главной.</p>';
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
  habitCollapseButton.addEventListener('click',async()=>{
    if(habitCollapseButton.disabled)return;
    const previous=habitState.collapsed;habitState={...habitState,collapsed:!previous};applyHabitCollapse();habitCollapseButton.disabled=true;setHabitStatus('');
    try{applyHabitView(await habitRequest('collapse',{collapsed:habitState.collapsed,date:habitSelectedDate||habitState.today}))}
    catch(error){habitState={...habitState,collapsed:previous};applyHabitCollapse();setHabitStatus('Не удалось сохранить состояние блока.',true)}
    finally{habitCollapseButton.disabled=false}
  });
  habitDateInput.addEventListener('change',()=>{const value=habitDateInput.value;if(value)loadHabitsForDate(value)});
  habitAddButton.addEventListener('click',()=>{habitAddButton.hidden=true;habitForm.hidden=false;habitInput.value='';requestAnimationFrame(()=>habitInput.focus({preventScroll:true}))});
  habitCancel.addEventListener('click',()=>{habitForm.hidden=true;habitAddButton.hidden=false;habitInput.value='';setHabitStatus('')});
  habitForm.addEventListener('submit',async(event)=>{
    event.preventDefault();const name=habitInput.value.trim();if(!name||habitSave.disabled)return;
    habitSave.disabled=true;habitInput.disabled=true;habitCancel.disabled=true;setHabitStatus('');
    try{applyHabitView(await habitRequest('add',{name,date:habitSelectedDate||habitState.today}));habitInput.value='';habitForm.hidden=true;habitAddButton.hidden=false}
    catch(error){const code=String(error?.message||error);setHabitStatus(code==='habit-duplicate'?'Такая привычка уже есть.':'Не удалось добавить привычку.',true)}
    finally{habitSave.disabled=false;habitInput.disabled=false;habitCancel.disabled=false}
  });
  collapseButton.addEventListener('click',()=>applyCollapse(!tile.classList.contains('is-collapsed')));
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
  applyCollapse(true);setupEdgeSwipeBack();return overlay;
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
      const data=supplementsResult.value;items=Array.isArray(data.items)?data.items:[];profile=data.profile||null;renderProfileMeta();render();setStatus('');
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
async function open(){
  actor=String(document.body.dataset.rudiActor||'').trim();if(!actor)return;
  build();document.getElementById('personalProfileName').textContent=actor;renderProfileMeta();
  overlay.hidden=false;document.body.classList.add('personal-profile-open');loadDailyRecommendation();
}
function close(){if(!overlay)return;overlay.hidden=true;document.body.classList.remove('personal-profile-open')}
function bindName(){
  build();
  const name=document.getElementById('displayName');if(!name||name.dataset.personalProfileBound==='1')return;
  name.dataset.personalProfileBound='1';name.classList.add('personal-profile-name-link');name.setAttribute('role','button');name.tabIndex=0;
  const update=()=>{const who=String(document.body.dataset.rudiActor||'').trim();if(who){name.setAttribute('aria-label','Открыть личную страницу '+who);loadHomeTools()}};
  name.addEventListener('click',open);name.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
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
  loadHomeTools,
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindName,{once:true});else bindName();
})();