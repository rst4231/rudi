(()=>{'use strict';
const TZ='Europe/Moscow',META={sadness:'😢',boredom:'🥱',anger:'😡',joy:'😄',love:'🥰'};
function initData(){return String(window.Telegram?.WebApp?.initData||'')}
function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function api(operation){const response=await fetch('/api/mood',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:initData()}),cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||!data?.ok)throw new Error(String(data?.error||'mood-request-failed'));return data}
function close(){const page=document.getElementById('moodHistoryPage');if(!page)return;page.hidden=true;document.body.classList.remove('mood-history-open')}
function cleanInlineMarkdown(value){return String(value||'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/^#{1,6}\s*/,'').trim()}
function renderAnalysisText(node,value){
  node.replaceChildren();
  const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');
  let list=null;
  const flush=()=>{list=null};
  for(const raw of lines){
    const line=String(raw||'').trim();
    if(!line){flush();continue}
    const bullet=line.match(/^[-•]\s+(.+)$/);
    if(bullet){
      if(!list){list=document.createElement('ul');node.append(list)}
      const item=document.createElement('li');item.textContent=cleanInlineMarkdown(bullet[1]);list.append(item);continue;
    }
    flush();
    const clean=cleanInlineMarkdown(line);
    const heading=/^(Что видно|На что обратить внимание|Что можно попробовать)\s*:?[\s]*$/i.test(clean)||/^\*\*.+\*\*$/.test(line)||/^#{1,6}\s+/.test(line);
    const el=document.createElement(heading?'strong':'p');
    el.textContent=clean;
    if(heading)el.className='mood-analysis-section-title';
    node.append(el);
  }
}
function setupEdgeSwipe(page){
  if(page.dataset.edgeSwipeBound==='1')return;
  page.dataset.edgeSwipeBound='1';
  let startX=0,startY=0,tracking=false;
  page.addEventListener('touchstart',event=>{
    const touch=event.touches?.[0];if(!touch||touch.clientX>34)return;
    startX=touch.clientX;startY=touch.clientY;tracking=true;
  },{passive:true});
  page.addEventListener('touchmove',event=>{
    if(!tracking)return;
    const touch=event.touches?.[0];if(!touch)return;
    const dx=touch.clientX-startX,dy=touch.clientY-startY;
    if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>20)tracking=false;
  },{passive:true});
  page.addEventListener('touchend',event=>{
    if(!tracking)return;
    tracking=false;
    const touch=event.changedTouches?.[0];if(!touch)return;
    const dx=touch.clientX-startX,dy=touch.clientY-startY;
    if(dx>=78&&Math.abs(dx)>Math.abs(dy)*1.25){try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}close()}
  },{passive:true});
}
function ensure(){
  let page=document.getElementById('moodHistoryPage');if(page)return page;
  page=document.createElement('section');page.id='moodHistoryPage';page.className='mood-history-page';page.hidden=true;
  page.innerHTML='<header class="mood-history-head"><button id="moodHistoryBack" class="mood-history-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><div><span>Настроение</span><h2>История</h2></div></header><div class="mood-history-content"><section class="mood-history-card"><div class="mood-history-card-head"><div><strong id="moodHistoryMonth"></strong><span id="moodHistoryMeta"></span></div></div><div id="moodHistoryCalendar" class="mood-history-calendar"></div></section><section class="mood-analysis-card"><div class="mood-analysis-head"><div class="mood-therapist"><div class="mood-therapist-avatar" aria-hidden="true">🧑‍⚕️</div><div class="mood-therapist-copy"><strong>Психотерапевт</strong></div></div><button id="moodAnalyzeButton" type="button">Анализ</button></div><div id="moodAnalysisStatus"></div><div id="moodAnalysisResult" hidden></div></section></div>';
  document.body.append(page);
  page.querySelector('#moodHistoryBack').addEventListener('click',close);
  page.querySelector('#moodAnalyzeButton').addEventListener('click',runAnalysis);
  setupEdgeSwipe(page);
  return page;
}
function monthLabel(key){const[y,m]=key.split('-').map(Number),t=new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,month:'long',year:'numeric'}).format(new Date(Date.UTC(y,m-1,2)));return t.charAt(0).toUpperCase()+t.slice(1)}
function render(data){
  const page=ensure(),today=String(data?.date||todayKey()),month=today.slice(0,7),history=Array.isArray(data?.history)?data.history:[],rows=history.filter(row=>String(row?.date||'').startsWith(month)),map=new Map(rows.map(row=>[String(row.date),row])),[y,m]=month.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
  page.querySelector('#moodHistoryMonth').textContent=monthLabel(month);
  page.querySelector('#moodHistoryMeta').textContent=rows.length+' дней с отметками · показано среднее за день';
  const cal=page.querySelector('#moodHistoryCalendar');cal.replaceChildren();
  for(const w of['Пн','Вт','Ср','Чт','Пт','Сб','Вс']){const el=document.createElement('span');el.className='mood-history-weekday';el.textContent=w;cal.append(el)}
  for(let i=0;i<offset;i++){const el=document.createElement('span');el.className='mood-history-day is-empty';cal.append(el)}
  for(let day=1;day<=days;day++){
    const key=month+'-'+String(day).padStart(2,'0'),row=map.get(key),el=document.createElement('div');
    el.className='mood-history-day'+(key===today?' is-today':'')+(row?' has-mood':'');
    const number=document.createElement('span');number.textContent=String(day);
    const mood=document.createElement('b');mood.textContent=META[row?.mood]||'';
    if(row?.sampleCount>1)el.title='Среднее по '+row.sampleCount+' отметкам за день';
    el.append(number,mood);cal.append(el);
  }
  const analysis=data?.analysis||null,unlimited=data?.unlimitedAnalysis===true,button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus'),result=page.querySelector('#moodAnalysisResult');
  if(analysis?.text){
    result.hidden=false;renderAnalysisText(result,analysis.text);
    button.disabled=!unlimited;button.textContent=unlimited?'Анализ':'Готово сегодня';
    status.textContent=unlimited?'Можно обновить анализ в любое время.':('Следующий новый анализ будет доступен завтра'+(analysis?.cycle?.phase?' · цикл Дианы учтён':''));
  }else{
    result.hidden=true;result.replaceChildren();button.disabled=!history.length;button.textContent='Анализ';
    status.textContent=history.length?'Разбор последних 30 дней по истории настроения.':'Сначала отметь настроение хотя бы один раз';
  }
}
async function open(){const page=ensure();page.hidden=false;document.body.classList.add('mood-history-open');page.querySelector('#moodAnalysisStatus').textContent='Загружаю историю…';try{render(await api('history'))}catch{page.querySelector('#moodAnalysisStatus').textContent='Не удалось загрузить историю'}}
async function runAnalysis(){const page=ensure(),button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus');if(button.disabled)return;button.disabled=true;button.textContent='Анализирую…';status.textContent='Смотрю динамику настроения…';try{render(await api('analyze'));window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(error){const code=String(error?.message||'');status.textContent=code==='mood-analysis-no-data'?'Сначала отметь настроение хотя бы один раз':code==='mood-analysis-quota'?'Groq временно занят. Попробуй позже.':'Не удалось сделать анализ. Попробуй ещё раз.';button.disabled=false;button.textContent='Анализ'}}
function bind(){const button=document.getElementById('moodHistoryButton');if(button&&!button.dataset.bound){button.dataset.bound='1';button.addEventListener('click',open)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();