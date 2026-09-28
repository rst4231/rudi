(()=>{'use strict';
const TZ='Europe/Moscow';
const META={
  sadness:{emoji:'😢',label:'Грусть'},
  boredom:{emoji:'🥱',label:'Скука'},
  anger:{emoji:'😡',label:'Злость'},
  joy:{emoji:'😄',label:'Радость'},
  love:{emoji:'🥰',label:'Любовь'}
};
const REASONS={work:'Работа',relationship:'Отношения',money:'Деньги',health:'Самочувствие',fatigue:'Усталость',sleep:'Сон',fasting:'Голодание',other:'Другое'};
let state=null,visibleMonth='',windowDays=30,selectedDate='';

function initData(){return String(window.Telegram?.WebApp?.initData||'')}
function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function shiftDate(key,days){const d=new Date(String(key||'')+'T12:00:00Z');if(Number.isNaN(d.getTime()))return'';d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function monthShift(key,delta){const[y,m]=String(key||todayKey()).slice(0,7).split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7)}
function fmtTime(value){const ms=Date.parse(String(value||''));return Number.isFinite(ms)?new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):''}
function fmtDate(key){const ms=Date.parse(String(key||'')+'T12:00:00Z');return Number.isFinite(ms)?new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,day:'numeric',month:'long'}).format(new Date(ms)):String(key||'')}
function plural(n,a,b,c){const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c}

async function api(operation,extra={}){
  const response=await fetch('/api/mood',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,windowDays,initData:initData(),...(extra||{})}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.ok)throw new Error(String(data?.error||'mood-request-failed'));
  return data;
}

function close(){
  const page=document.getElementById('moodHistoryPage');
  if(!page)return;
  page.hidden=true;
  document.body.classList.remove('mood-history-open');
}

function setupEdgeSwipeBack(page){
  if(!page||page.dataset.edgeSwipeBound==='1')return;
  page.dataset.edgeSwipeBound='1';
  let tracking=false,startX=0,startY=0;
  const reset=()=>{tracking=false;startX=startY=0};
  page.addEventListener('pointerdown',e=>{
    if(page.hidden||e.clientX>32||(e.pointerType==='mouse'&&e.button!==0))return;
    tracking=true;startX=e.clientX;startY=e.clientY;
  },{passive:true});
  page.addEventListener('pointerup',e=>{
    if(!tracking)return;
    const dx=e.clientX-startX,dy=Math.abs(e.clientY-startY);
    reset();
    if(dx>=70&&dx>=dy*1.35)close();
  },{passive:true});
  page.addEventListener('pointercancel',reset,{passive:true});
}

function ensure(){
  let page=document.getElementById('moodHistoryPage');
  if(page)return page;
  page=document.createElement('section');
  page.id='moodHistoryPage';
  page.className='mood-history-page';
  page.hidden=true;
  page.innerHTML=
    '<header class="mood-history-head"><button id="moodHistoryBack" class="mood-history-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><div><span>Настроение</span><h2>История</h2></div></header>'+
    '<div class="mood-history-content">'+
      '<section class="mood-history-card">'+
        '<div class="mood-history-month-nav"><button id="moodMonthPrev" type="button" aria-label="Предыдущий месяц">‹</button><div><strong id="moodHistoryMonth"></strong><span id="moodHistoryMeta"></span></div><button id="moodMonthNext" type="button" aria-label="Следующий месяц">›</button></div>'+
        '<div id="moodHistoryCalendar" class="mood-history-calendar"></div>'+
        '<div id="moodDayDetail" class="mood-day-detail" hidden></div>'+
      '</section>'+
      '<section class="mood-stats-card"><div class="mood-stats-head"><strong>Статистика</strong><span id="moodStatsPeriod"></span></div><div id="moodStats" class="mood-stats"></div></section>'+
      '<section class="mood-analysis-card">'+
        '<div class="mood-analysis-head"><div class="mood-analysis-profile"><span class="mood-analysis-avatar" aria-hidden="true">🧠</span><div><strong>Анализатор настроения</strong><span>Только наблюдения по вашим данным</span></div></div><button id="moodAnalyzeButton" type="button">Анализ</button></div>'+
        '<div id="moodRangeTabs" class="mood-range-tabs"><button data-days="7" type="button">7 дней</button><button data-days="30" type="button" class="active">30 дней</button><button data-days="90" type="button">3 месяца</button></div>'+
        '<div id="moodAnalysisStatus"></div><div id="moodAnalysisResult" hidden></div>'+
        '<div id="moodAnalysisFeedback" class="mood-analysis-feedback" hidden><span>Разбор пригодился?</span><button data-feedback="up" type="button">👍 Да</button><button data-feedback="down" type="button">👎 Нет</button></div>'+
      '</section>'+
    '</div>';
  document.body.append(page);
  page.querySelector('#moodHistoryBack').addEventListener('click',close);
  page.querySelector('#moodMonthPrev').addEventListener('click',()=>{visibleMonth=monthShift(visibleMonth,-1);selectedDate='';render(state)});
  page.querySelector('#moodMonthNext').addEventListener('click',()=>{visibleMonth=monthShift(visibleMonth,1);selectedDate='';render(state)});
  page.querySelector('#moodAnalyzeButton').addEventListener('click',runAnalysis);
  page.querySelector('#moodRangeTabs').addEventListener('click',async e=>{
    const button=e.target.closest('[data-days]');if(!button)return;
    windowDays=Number(button.dataset.days)||30;
    page.querySelectorAll('[data-days]').forEach(item=>item.classList.toggle('active',item===button));
    await reload();
  });
  page.querySelector('#moodAnalysisFeedback').addEventListener('click',async e=>{
    const button=e.target.closest('[data-feedback]');if(!button)return;
    try{
      const data=await api('feedback',{value:button.dataset.feedback});
      state={...(state||{}),feedback:data.feedback};
      renderFeedback(data.feedback);
    }catch{}
  });
  setupEdgeSwipeBack(page);
  return page;
}

function monthLabel(key){
  const[y,m]=String(key||todayKey()).split('-').map(Number);
  const t=new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,month:'long',year:'numeric'}).format(new Date(Date.UTC(y,m-1,2)));
  return t.charAt(0).toUpperCase()+t.slice(1);
}

function rowsForWindow(history,today,days){
  const cutoff=shiftDate(today,-(days-1));
  return(history||[]).filter(row=>String(row?.date||'')>=cutoff&&String(row?.date||'')<=today);
}

function appendInlineMarkdown(node,text){
  const source=String(text||'');let cursor=0;
  for(const match of source.matchAll(/\*\*([^*]+)\*\*/g)){
    const index=match.index??0;
    if(index>cursor)node.append(document.createTextNode(source.slice(cursor,index)));
    const strong=document.createElement('strong');strong.textContent=match[1];node.append(strong);
    cursor=index+match[0].length;
  }
  if(cursor<source.length)node.append(document.createTextNode(source.slice(cursor)));
}

function renderAnalysisText(host,text){
  host.replaceChildren();
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
  let list=null;
  for(const raw of lines){
    const line=raw.trim();
    if(!line){list=null;continue}
    const heading=line.match(/^(?:#{1,3}\s*)?\*\*([^*]+)\*\*:?$/)||line.match(/^#{1,3}\s+(.+)$/);
    if(heading){
      list=null;
      const h=document.createElement('h3');
      h.textContent=String(heading[1]||'').replace(/\*\*/g,'').replace(/:$/,'');
      host.append(h);continue;
    }
    const bullet=line.match(/^[-•]\s+(.+)$/);
    if(bullet){
      if(!list){list=document.createElement('ul');host.append(list)}
      const li=document.createElement('li');appendInlineMarkdown(li,bullet[1]);list.append(li);continue;
    }
    list=null;
    const p=document.createElement('p');appendInlineMarkdown(p,line.replace(/^\*\*(.+)\*\*$/,'$1'));host.append(p);
  }
}

function renderStats(history,today){
  const page=ensure(),host=page.querySelector('#moodStats'),rows=rowsForWindow(history,today,windowDays),counts={},reasonCounts={};
  let marks=0;
  for(const row of rows){
    if(META[row?.mood])counts[row.mood]=(counts[row.mood]||0)+1;
    for(const sample of row?.samples||[]){
      marks+=1;
      if(REASONS[sample.reason])reasonCounts[sample.reason]=(reasonCounts[sample.reason]||0)+1;
    }
  }
  host.replaceChildren();
  const total=Math.max(1,rows.length);
  for(const key of ['joy','love','sadness','boredom','anger']){
    if(!counts[key])continue;
    const el=document.createElement('div');el.className='mood-stat-chip';
    el.innerHTML='<b>'+META[key].emoji+' '+Math.round(counts[key]/total*100)+'%</b><span>'+META[key].label+'</span>';
    host.append(el);
  }
  const summary=document.createElement('div');summary.className='mood-stat-summary';
  const topReason=Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1])[0];
  summary.textContent=rows.length+' '+plural(rows.length,'день','дня','дней')+' с настроением · '+marks+' '+plural(marks,'отметка','отметки','отметок')+(topReason?' · чаще причина: '+REASONS[topReason[0]]:'');
  host.append(summary);
  page.querySelector('#moodStatsPeriod').textContent='за '+windowDays+' дней';
}

function renderDayDetail(row){
  const box=ensure().querySelector('#moodDayDetail');
  if(!row){box.hidden=true;box.replaceChildren();return}
  box.hidden=false;box.replaceChildren();
  const h=document.createElement('strong');h.textContent=fmtDate(row.date);box.append(h);
  const samples=Array.isArray(row.samples)&&row.samples.length?row.samples:[{mood:row.mood,updatedAt:row.updatedAt}];
  for(const sample of samples){
    const meta=META[sample.mood];if(!meta)continue;
    const line=document.createElement('div');line.className='mood-day-sample';
    const time=document.createElement('span');time.textContent=fmtTime(sample.updatedAt);
    const mood=document.createElement('b');mood.textContent=meta.emoji+' '+meta.label;
    line.append(time,mood);
    if(REASONS[sample.reason]){const reason=document.createElement('em');reason.textContent=REASONS[sample.reason];line.append(reason)}
    box.append(line);
  }
}

function renderFeedback(feedback){
  const box=ensure().querySelector('#moodAnalysisFeedback');
  if(!state?.analysis){box.hidden=true;return}
  box.hidden=false;
  box.querySelectorAll('[data-feedback]').forEach(button=>button.classList.toggle('active',button.dataset.feedback===feedback?.value));
}

function cacheStatus(analysis){
  if(!analysis?.createdAt)return'';
  const left=24*360000-(Date.now()-(Date.parse(analysis.createdAt)||0));
  if(left<=0)return'Можно сделать новый анализ';
  const h=Math.floor(left/360000),m=Math.max(0,Math.ceil((left%360000)/60000));
  return'Новый анализ через '+(h?h+' ч ':'')+m+' мин';
}

function render(data){
  if(!data)return;
  state=data;
  const page=ensure(),today=String(data.date||todayKey()),history=Array.isArray(data.history)?data.history:[];
  if(!visibleMonth)visibleMonth=today.slice(0,7);
  const earliest=history[0]?.date?.slice(0,7)||today.slice(0,7),latest=today.slice(0,7);
  if(visibleMonth<earliest)visibleMonth=earliest;
  if(visibleMonth>latest)visibleMonth=latest;
  const rows=history.filter(row=>String(row?.date||'').startsWith(visibleMonth)),map=new Map(rows.map(row=>[String(row.date),row]));
  const[y,m]=visibleMonth.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
  const totalMarks=rows.reduce((sum,row)=>sum+Math.max(1,Number(row.sampleCount)||0),0);

  page.querySelector('#moodHistoryMonth').textContent=monthLabel(visibleMonth);
  page.querySelector('#moodHistoryMeta').textContent=totalMarks+' '+plural(totalMarks,'отметка','отметки','отметок')+' · настроение по дням · хранение 180 дней';
  page.querySelector('#moodMonthPrev').disabled=visibleMonth<=earliest;
  page.querySelector('#moodMonthNext').disabled=visibleMonth>=latest;

  const cal=page.querySelector('#moodHistoryCalendar');cal.replaceChildren();
  for(const w of['Пн','Вт','Ср','Чт','Пт','Сб','Вс']){const el=document.createElement('span');el.className='mood-history-weekday';el.textContent=w;cal.append(el)}
  for(let i=0;i<offset;i++){const el=document.createElement('span');el.className='mood-history-day is-empty';cal.append(el)}
  for(let day=1;day<=days;day++){
    const key=visibleMonth+'-'+String(day).padStart(2,'0'),row=map.get(key),el=document.createElement('button');
    el.type='button';
    el.className='mood-history-day'+(key===today?' is-today':'')+(row?' has-mood':'')+(key===selectedDate?' is-selected':'');
    el.disabled=!row;
    el.innerHTML='<span>'+day+'</span><b>'+(META[row?.averageMood||row?.mood]?.emoji||'')+'</b>';
    if(row)el.addEventListener('click',()=>{
      selectedDate=selectedDate===key?'':key;
      renderDayDetail(selectedDate?row:null);
      page.querySelectorAll('.mood-history-day').forEach(item=>item.classList.toggle('is-selected',item===el&&Boolean(selectedDate)));
    });
    cal.append(el);
  }
  if(selectedDate)renderDayDetail(map.get(selectedDate)||history.find(row=>row.date===selectedDate)||null);else renderDayDetail(null);
  renderStats(history,today);

  const analysis=data.analysis||null,button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus'),result=page.querySelector('#moodAnalysisResult');
  const moodDays=Number(data.selectedDays||rowsForWindow(history,today,windowDays).length);
  if(analysis?.text){
    result.hidden=false;renderAnalysisText(result,analysis.text);
    button.disabled=true;button.textContent='Готово';
    status.textContent=(analysis.level==='preliminary'?'Предварительный разбор · ':'')+cacheStatus(analysis)+(analysis?.cycle?.phase?' · цикл Дианы учтён':'');
  }else{
    result.hidden=true;result.replaceChildren();
    button.disabled=moodDays<5;button.textContent='Анализ';
    status.textContent=moodDays<5?'Нужно минимум 5 дней с отметками. Сейчас '+moodDays:moodDays<10?'Данных немного: получится предварительный разбор':'Можно анализировать '+windowDays+' дней';
  }
  renderFeedback(data.feedback);
}

async function reload(){
  const page=ensure();
  page.querySelector('#moodAnalysisStatus').textContent='Загружаю историю…';
  try{render(await api('history'))}
  catch{page.querySelector('#moodAnalysisStatus').textContent='Не удалось загрузить историю'}
}

async function open(){
  const page=ensure();
  page.hidden=false;
  document.body.classList.add('mood-history-open');
  visibleMonth=todayKey().slice(0,7);
  selectedDate='';
  await reload();
}

async function runAnalysis(){
  const page=ensure(),button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Анализирую…';status.textContent='Сопоставляю настроение, привычки и голодание…';
  try{
    render(await api('analyze'));
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
  }catch(error){
    const code=String(error?.message||'');
    status.textContent=code==='mood-analysis-insufficient-data'?'Нужно минимум 5 дней с отметками':code==='mood-analysis-quota'?'Сервис временно занят. Попробуйте позже.':'Не удалось сделать анализ. Попробуйте ещё раз.';
    button.disabled=false;button.textContent='Анализ';
  }
}
function bind(){const button=document.getElementById('moodHistoryButton');if(button&&!button.dataset.bound){button.dataset.bound='1';button.addEventListener('click',open)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();