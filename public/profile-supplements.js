(()=>{'use strict';
const API='/api/supplements';
const HABITS_API='/api/habits';
const STORAGE='rudi-personal-profile-v1:';
let actor='',items=[],profile=null,overlay=null,list=null,statusNode=null,tile=null,summary=null,summaryMeta=null,recommendationNode=null,recommendationWrap=null,recommendationToggle=null,collapseButton=null,undoTimer=null,trackerGroup=null;
let habitState={habits:[],completedIds:[],collapsed:false,today:'',done:0,total:0},habitTile=null,habitList=null,habitProgressText=null,habitProgressFill=null,habitCollapseButton=null,habitAddButton=null,habitForm=null,habitInput=null,habitStatusNode=null;

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
function habitEmoji(name){const value=String(name||'').toLowerCase().replace(/ё/g,'е');if(/вод|пить/.test(value))return'💧';if(/заряд|трен|спорт|ходь|шаг/.test(value))return'🏃';if(/чит|книг/.test(value))return'📚';if(/медит|дых/.test(value))return'🧘';if(/сон|спать|ложиться/.test(value))return'🌙';if(/сахар|слад/.test(value))return'🍎';if(/уч|англ|язык/.test(value))return'🧠';return'🌱'}
function applyHabitView(data){habitState={habits:Array.isArray(data?.habits)?data.habits:[],completedIds:Array.isArray(data?.completedIds)?data.completedIds:[],collapsed:Boolean(data?.collapsed),today:String(data?.today||''),done:Number(data?.done||0),total:Number(data?.total||0)};renderHabits();applyHabitCollapse()}
function applyHabitCollapse(){if(!habitTile||!habitCollapseButton)return;habitTile.classList.toggle('is-collapsed',habitState.collapsed===true);habitCollapseButton.setAttribute('aria-expanded',String(!habitState.collapsed));habitCollapseButton.setAttribute('aria-label',habitState.collapsed?'Развернуть «Трекер привычек»':'Свернуть «Трекер привычек»')}
function renderHabits(){
  if(!habitList||!habitProgressText||!habitProgressFill)return;
  const completed=new Set((habitState.completedIds||[]).map(String));
  const habits=Array.isArray(habitState.habits)?habitState.habits:[];
  const done=habits.filter(row=>completed.has(String(row.id))).length,total=habits.length,percent=total?Math.round(done/total*100):0;
  habitProgressText.textContent=total?done+' из '+total+' выполнено':'Добавь первую привычку';
  habitProgressFill.style.width=percent+'%';
  habitList.replaceChildren();
  if(!habits.length){
    const empty=document.createElement('div');empty.className='personal-habits-empty';empty.textContent='Например: пить воду, читать 20 минут или ложиться спать до 23:00.';habitList.appendChild(empty);return;
  }
  for(const habit of habits){
    const id=String(habit.id||''),isDone=completed.has(id);
    const row=document.createElement('div');row.className='personal-habit-row';row.classList.toggle('is-done',isDone);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='personal-habit-toggle';toggle.setAttribute('aria-pressed',String(isDone));toggle.setAttribute('aria-label',(isDone?'Отменить выполнение: ':'Отметить выполненной: ')+habit.name);
    const emoji=document.createElement('span');emoji.className='personal-habit-emoji';emoji.textContent=habit.emoji||habitEmoji(habit.name);
    const name=document.createElement('span');name.className='personal-habit-name';name.textContent=String(habit.name||'Привычка');
    const check=document.createElement('span');check.className='personal-habit-check';check.textContent=isDone?'✓':'';
    toggle.append(emoji,name,check);
    const remove=document.createElement('button');remove.type='button';remove.className='personal-habit-remove';remove.setAttribute('aria-label','Удалить привычку '+habit.name);remove.textContent='×';
    toggle.addEventListener('click',async()=>{
      if(toggle.disabled)return;toggle.disabled=true;remove.disabled=true;setHabitStatus('');
      try{applyHabitView(await habitRequest('toggle',{id}))}
      catch(error){console.error('RUDI_HABIT_TOGGLE_UI_ERROR',error);setHabitStatus('Не удалось сохранить отметку.',true)}
      finally{toggle.disabled=false;remove.disabled=false}
    });
    remove.addEventListener('click',async()=>{
      if(remove.disabled||!window.confirm('Удалить привычку «'+String(habit.name||'')+'»?'))return;
      toggle.disabled=true;remove.disabled=true;setHabitStatus('');
      try{applyHabitView(await habitRequest('remove',{id}))}
      catch(error){console.error('RUDI_HABIT_REMOVE_UI_ERROR',error);setHabitStatus('Не удалось удалить привычку.',true);toggle.disabled=false;remove.disabled=false}
    });
    row.append(toggle,remove);habitList.appendChild(row);
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
function applyCollapse(){
  if(!tile||!collapseButton)return;
  const collapsed=prefs().collapsed===true;
  tile.classList.toggle('is-collapsed',collapsed);
  collapseButton.setAttribute('aria-expanded',String(!collapsed));
  collapseButton.setAttribute('aria-label',collapsed?'Развернуть «Мои БАДы»':'Свернуть «Мои БАДы»');
}
function applyPosition(){
  if(!trackerGroup||!summary)return;
  const host=summary.parentElement;if(!host)return;
  if(prefs().position==='top')host.insertBefore(trackerGroup,summary);else host.insertBefore(trackerGroup,summary.nextSibling);
}
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

  habitTile=document.createElement('article');habitTile.className='personal-habits-tile';
  const habitHead=document.createElement('div');habitHead.className='personal-habits-head';
  const habitTitleWrap=document.createElement('div');habitTitleWrap.className='personal-habits-title-wrap';
  const habitHeading=document.createElement('h2');habitHeading.textContent='🌱 Трекер привычек';
  habitProgressText=document.createElement('div');habitProgressText.className='personal-habits-progress-text';habitProgressText.textContent='Загружаю…';
  habitTitleWrap.append(habitHeading,habitProgressText);
  habitCollapseButton=document.createElement('button');habitCollapseButton.type='button';habitCollapseButton.className='personal-habits-collapse';habitCollapseButton.textContent='⌄';
  habitHead.append(habitTitleWrap,habitCollapseButton);
  const habitBody=document.createElement('div');habitBody.className='personal-habits-body';
  const habitProgress=document.createElement('div');habitProgress.className='personal-habits-progress';
  habitProgressFill=document.createElement('span');habitProgressFill.className='personal-habits-progress-fill';habitProgress.append(habitProgressFill);
  habitList=document.createElement('div');habitList.className='personal-habits-list';
  habitStatusNode=document.createElement('div');habitStatusNode.className='personal-habits-status';habitStatusNode.hidden=true;
  habitAddButton=document.createElement('button');habitAddButton.type='button';habitAddButton.className='personal-habits-add';habitAddButton.textContent='+ Добавить привычку';
  habitForm=document.createElement('form');habitForm.className='personal-habits-form';habitForm.hidden=true;
  habitInput=document.createElement('input');habitInput.type='text';habitInput.maxLength=80;habitInput.autocomplete='off';habitInput.placeholder='Например: Читать 20 минут';
  const habitFormActions=document.createElement('div');habitFormActions.className='personal-habits-form-actions';
  const habitCancel=document.createElement('button');habitCancel.type='button';habitCancel.className='personal-habits-cancel';habitCancel.textContent='Отмена';
  const habitSave=document.createElement('button');habitSave.type='submit';habitSave.className='personal-habits-save';habitSave.textContent='Добавить';
  habitFormActions.append(habitCancel,habitSave);habitForm.append(habitInput,habitFormActions);
  habitBody.append(habitProgress,habitList,habitStatusNode,habitAddButton,habitForm);habitTile.append(habitHead,habitBody);

  tile=document.createElement('article');tile.className='personal-supplements-tile';
  const head=document.createElement('div');head.className='personal-supplements-head';
  const heading=document.createElement('h2');heading.textContent='Мои БАДы';
  const actions=document.createElement('div');actions.className='personal-supplements-actions';
  const drag=document.createElement('button');drag.type='button';drag.className='personal-supplements-drag';drag.setAttribute('aria-label','Перетащить блок «Мои БАДы»');drag.innerHTML='<span></span><span></span><span></span><span></span><span></span><span></span>';
  collapseButton=document.createElement('button');collapseButton.type='button';collapseButton.className='personal-supplements-collapse';collapseButton.textContent='⌄';
  actions.append(drag,collapseButton);head.append(heading,actions);
  const body=document.createElement('div');body.className='personal-supplements-body';
  const form=document.createElement('form');form.className='personal-supplements-form';
  const input=document.createElement('input');input.type='text';input.maxLength=120;input.placeholder='Название БАДа';input.autocomplete='off';
  const add=document.createElement('button');add.type='submit';add.textContent='Добавить';form.append(input,add);
  statusNode=document.createElement('div');statusNode.className='personal-supplements-status';statusNode.hidden=true;
  list=document.createElement('div');list.className='personal-supplements-list';
  body.append(form,statusNode,list);tile.append(head,body);
  trackerGroup=document.createElement('div');trackerGroup.className='personal-tracker-group';trackerGroup.append(habitTile,tile);
  content.append(summary,trackerGroup);overlay.append(bar,content);document.body.appendChild(overlay);
  back.addEventListener('click',close);
  habitCollapseButton.addEventListener('click',async()=>{
    if(habitCollapseButton.disabled)return;
    const previous=habitState.collapsed;habitState={...habitState,collapsed:!previous};applyHabitCollapse();habitCollapseButton.disabled=true;setHabitStatus('');
    try{applyHabitView(await habitRequest('collapse',{collapsed:habitState.collapsed}))}
    catch(error){habitState={...habitState,collapsed:previous};applyHabitCollapse();setHabitStatus('Не удалось сохранить состояние блока.',true)}
    finally{habitCollapseButton.disabled=false}
  });
  habitAddButton.addEventListener('click',()=>{habitAddButton.hidden=true;habitForm.hidden=false;habitInput.value='';requestAnimationFrame(()=>habitInput.focus({preventScroll:true}))});
  habitCancel.addEventListener('click',()=>{habitForm.hidden=true;habitAddButton.hidden=false;habitInput.value='';setHabitStatus('')});
  habitForm.addEventListener('submit',async(event)=>{
    event.preventDefault();const name=habitInput.value.trim();if(!name||habitSave.disabled)return;
    habitSave.disabled=true;habitInput.disabled=true;habitCancel.disabled=true;setHabitStatus('');
    try{applyHabitView(await habitRequest('add',{name}));habitInput.value='';habitForm.hidden=true;habitAddButton.hidden=false}
    catch(error){const code=String(error?.message||error);setHabitStatus(code==='habit-duplicate'?'Такая привычка уже есть.':'Не удалось добавить привычку.',true)}
    finally{habitSave.disabled=false;habitInput.disabled=false;habitCancel.disabled=false}
  });
  collapseButton.addEventListener('click',()=>{writePrefs({collapsed:!tile.classList.contains('is-collapsed')});applyCollapse()});
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
  setupDrag(drag);setupEdgeSwipeBack();return overlay;
}
async function open(){
  actor=String(document.body.dataset.rudiActor||'').trim();if(!actor)return;
  build();document.getElementById('personalProfileName').textContent=actor;applyPosition();applyCollapse();
  overlay.hidden=false;document.body.classList.add('personal-profile-open');setStatus('Загружаю…');setHabitStatus('');
  const [supplementsResult,habitsResult]=await Promise.allSettled([request('list'),habitRequest('list')]);
  if(supplementsResult.status==='fulfilled'){
    const data=supplementsResult.value;items=Array.isArray(data.items)?data.items:[];profile=data.profile||null;renderProfileMeta();render();setStatus('');loadDailyRecommendation();
  }else setStatus(errorText(supplementsResult.reason),true);
  if(habitsResult.status==='fulfilled')applyHabitView(habitsResult.value);
  else{habitProgressText.textContent='Не удалось загрузить';habitList.replaceChildren();setHabitStatus('Не удалось загрузить привычки.',true)}
}
function close(){if(!overlay)return;overlay.hidden=true;document.body.classList.remove('personal-profile-open')}
function bindName(){
  const name=document.getElementById('displayName');if(!name||name.dataset.personalProfileBound==='1')return;
  name.dataset.personalProfileBound='1';name.classList.add('personal-profile-name-link');name.setAttribute('role','button');name.tabIndex=0;
  const update=()=>{const who=String(document.body.dataset.rudiActor||'').trim();if(who)name.setAttribute('aria-label','Открыть личную страницу '+who)};
  name.addEventListener('click',open);name.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
  update();new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
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
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindName,{once:true});else bindName();
})();