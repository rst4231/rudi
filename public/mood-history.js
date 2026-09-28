(()=>{'use strict';
const TZ='Europe/Moscow',META={sadness:'😢',boredom:'🥱',anger:'😡',joy:'😄',love:'🥰'};

function initData(){return String(window.Telegram?.WebApp?.initData||'')}
function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function api(operation){
  const response=await fetch('/api/mood',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:initData()}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.ok)throw new Error(String(data?.error||'mood-request-failed'));
  return data;
}
function close(){
  const page=document.getElementById('moodHistoryPage');
  if(page)page.hidden=true;
  document.body.classList.remove('mood-history-open');
}
function installEdgeSwipe(page){
  if(page.dataset.edgeSwipeBound==='1')return;
  page.dataset.edgeSwipeBound='1';
  let startX=0,startY=0,lastX=0,lastY=0,tracking=false,cancelled=false;
  page.addEventListener('touchstart',event=>{
    if(event.touches.length!==1)return;
    const touch=event.touches[0];
    if(touch.clientX>32)return;
    if(event.target?.closest?.('button,a,input,textarea,select,label'))return;
    startX=lastX=touch.clientX;
    startY=lastY=touch.clientY;
    tracking=true;cancelled=false;
  },{passive:true});
  page.addEventListener('touchmove',event=>{
    if(!tracking||event.touches.length!==1)return;
    const touch=event.touches[0];
    lastX=touch.clientX;lastY=touch.clientY;
    const dx=lastX-startX,dy=lastY-startY;
    if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12)cancelled=true;
  },{passive:true});
  page.addEventListener('touchend',()=>{
    if(tracking&&!cancelled){
      const dx=lastX-startX,dy=lastY-startY;
      if(dx>=72&&Math.abs(dx)>Math.abs(dy)*1.25)close();
    }
    tracking=false;cancelled=false;
  },{passive:true});
  page.addEventListener('touchcancel',()=>{tracking=false;cancelled=false},{passive:true});
}
function ensure(){
  let page=document.getElementById('moodHistoryPage');
  if(page)return page;
  page=document.createElement('section');
  page.id='moodHistoryPage';
  page.className='mood-history-page';
  page.hidden=true;
  page.innerHTML='<header class="mood-history-head"><button id="moodHistoryBack" class="mood-history-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><div><span>Настроение</span><h2>История</h2></div></header><div class="mood-history-content"><section class="mood-history-card"><div class="mood-history-card-head"><div><strong id="moodHistoryMonth"></strong><span id="moodHistoryMeta"></span></div></div><div id="moodHistoryCalendar" class="mood-history-calendar"></div></section><section class="mood-analysis-card"><div class="mood-analysis-head"><div class="mood-therapist"><div class="mood-therapist-avatar" aria-hidden="true">🧑‍⚕️</div><strong>Психотерапевт</strong></div><button id="moodAnalyzeButton" type="button">Анализ</button></div><div id="moodAnalysisStatus"></div><div id="moodAnalysisResult" hidden></div></section></div>';
  document.body.append(page);
  page.querySelector('#moodHistoryBack').addEventListener('click',close);
  page.querySelector('#moodAnalyzeButton').addEventListener('click',runAnalysis);
  installEdgeSwipe(page);
  return page;
}
function monthLabel(key){
  const[y,m]=key.split('-').map(Number);
  const t=new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,month:'long',year:'numeric'}).format(new Date(Date.UTC(y,m-1,2)));
  return t.charAt(0).toUpperCase()+t.slice(1);
}
function plainHeading(value){
  return String(value||'').replace(/^\s{0,3}#{1,6}\s*/,'').replace(/\*\*/g,'').replace(/__/g,'').replace(/:$/,'').trim();
}
function appendInline(node,value){
  const source=String(value||'').replace(/__/g,'**');
  const parts=source.split(/(\*\*[^*]+\*\*)/g);
  for(const part of parts){
    if(!part)continue;
    if(/^\*\*[^*]+\*\*$/.test(part)){
      const strong=document.createElement('strong');
      strong.textContent=part.slice(2,-2);
      node.append(strong);
    }else{
      node.append(document.createTextNode(part.replace(/\*\*/g,'')));
    }
  }
}
function renderAnalysisText(host,text){
  host.replaceChildren();
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
  let list=null,listType='';
  const resetList=()=>{list=null;listType=''};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){resetList();continue}
    const heading=plainHeading(line);
    if(['Что видно','На что обратить внимание','Что можно попробовать'].includes(heading)){
      resetList();
      const h=document.createElement('h3');h.textContent=heading;host.append(h);continue;
    }
    const numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    const bullet=line.match(/^\s*[-•*]\s+(.+)$/);
    if(numbered||bullet){
      const type=numbered?'ol':'ul';
      if(!list||listType!==type){list=document.createElement(type);listType=type;host.append(list)}
      const li=document.createElement('li');appendInline(li,(numbered||bullet)[1]);list.append(li);continue;
    }
    resetList();
    const p=document.createElement('p');appendInline(p,line);host.append(p);
  }
}
function render(data){
  const page=ensure(),today=String(data?.date||todayKey()),month=today.slice(0,7);
  const history=Array.isArray(data?.history)?data.history:[];
  const rows=history.filter(row=>String(row?.date||'').startsWith(month));
  const map=new Map(rows.map(row=>[String(row.date),row]));
  const[y,m]=month.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
  page.querySelector('#moodHistoryMonth').textContent=monthLabel(month);
  const totalMarks=rows.reduce((sum,row)=>sum+Math.max(1,Number(row?.sampleCount)||1),0);
  page.querySelector('#moodHistoryMeta').textContent=totalMarks+' отметок · '+rows.length+' дней · хранение 30 дней';
  const cal=page.querySelector('#moodHistoryCalendar');cal.replaceChildren();
  for(const w of['Пн','Вт','Ср','Чт','Пт','Сб','Вс']){const el=document.createElement('span');el.className='mood-history-weekday';el.textContent=w;cal.append(el)}
  for(let i=0;i<offset;i++){const el=document.createElement('span');el.className='mood-history-day is-empty';cal.append(el)}
  for(let day=1;day<=days;day++){
    const key=month+'-'+String(day).padStart(2,'0'),row=map.get(key),el=document.createElement('div');
    el.className='mood-history-day'+(key===today?' is-today':'')+(row?' has-mood':'');
    const dayNode=document.createElement('span');dayNode.textContent=String(day);
    const moodNode=document.createElement('b');moodNode.textContent=META[row?.mood]||'';
    el.append(dayNode,moodNode);
    if(row)el.title='Среднее настроение за день · '+Math.max(1,Number(row.sampleCount)||1)+' отметок';
    cal.append(el);
  }
  const analysis=data?.analysis||null,button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus'),result=page.querySelector('#moodAnalysisResult');
  const unlimited=data?.unlimitedAnalysis===true||data?.actor==='Рустам';
  if(analysis?.text){
    result.hidden=false;
    renderAnalysisText(result,String(analysis.text));
    button.disabled=!data?.canAnalyze;
    button.textContent=data?.canAnalyze?'Обновить':'Готово';
    status.textContent=data?.canAnalyze?'Можно обновить анализ в любой момент':('Следующий новый анализ будет доступен завтра'+(analysis?.cycle?.phase?' · цикл Дианы учтён':''));
  }else{
    result.hidden=true;result.replaceChildren();
    button.disabled=!history.length;
    button.textContent='Анализ';
    status.textContent=history.length?(unlimited?'Можно запускать анализ без лимита':'Анализ доступен 1 раз в день'):'Сначала отметь настроение хотя бы один раз';
  }
}
async function open(){
  const page=ensure();page.hidden=false;document.body.classList.add('mood-history-open');
  page.querySelector('#moodAnalysisStatus').textContent='Загружаю историю…';
  try{render(await api('history'))}catch{page.querySelector('#moodAnalysisStatus').textContent='Не удалось загрузить историю'}
}
async function runAnalysis(){
  const page=ensure(),button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Анализирую…';status.textContent='Смотрю динамику настроения…';
  try{render(await api('analyze'));window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}
  catch(error){
    const code=String(error?.message||'');
    status.textContent=code==='mood-analysis-no-data'?'Сначала отметь настроение хотя бы один раз':code==='mood-analysis-quota'?'Groq временно занят. Попробуй позже.':'Не удалось сделать анализ. Попробуй ещё раз.';
    button.disabled=false;button.textContent='Анализ';
  }
}
function bind(){
  const button=document.getElementById('moodHistoryButton');
  if(button&&!button.dataset.bound){button.dataset.bound='1';button.addEventListener('click',open)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
