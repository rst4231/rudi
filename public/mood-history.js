(()=>{'use strict';
const TZ='Europe/Moscow';
const META={
  sadness:{emoji:'😢',label:'Грусть'},
  boredom:{emoji:'🥱',label:'Скука'},
  neutral:{emoji:'😐',label:'Нейтрально'},
  fatigue:{emoji:'😩',label:'Усталость'},
  anger:{emoji:'😡',label:'Злость'},
  joy:{emoji:'😄',label:'Радость'},
  love:{emoji:'🥰',label:'Любовь'}
};
const REASONS={work:'Работа',food:'Еда',relationship:'Отношения',money:'Деньги',health:'Здоровье',sport:'Спорт',fatigue:'Усталость',sleep:'Сон',fasting:'Голодание',other:'Другое'};
function reasonLabel(sample){const custom=String(sample?.reasonText||'').trim();return sample?.reason==='other'&&custom?custom:(REASONS[sample?.reason]||'')}
let state=null,visibleWeekEnd='',windowDays=30,selectedDate='',restoreAnalysisWindow=true;

function initData(){
  const direct=String(window.Telegram?.WebApp?.initData||'').trim();
  if(direct)return direct;
  try{
    const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,'')),query=new URLSearchParams(location.search||'');
    return String(hash.get('tgWebAppData')||query.get('tgWebAppData')||'').trim();
  }catch(_){return''}
}
function backupToken(){try{return String(window.RUDI_STATE_BACKUP?.getToken?.()||'').trim()}catch(_){return''}}
function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function shiftDate(key,days){const d=new Date(String(key||'')+'T12:00:00Z');if(Number.isNaN(d.getTime()))return'';d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function monthShift(key,delta){const[y,m]=String(key||todayKey()).slice(0,7).split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7)}
function fmtTime(value){const ms=Date.parse(String(value||''));return Number.isFinite(ms)?new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):''}
function fmtDate(key){const ms=Date.parse(String(key||'')+'T12:00:00Z');return Number.isFinite(ms)?new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,day:'numeric',month:'long'}).format(new Date(ms)):String(key||'')}
function plural(n,a,b,c){const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c}

async function api(operation,extra={}){
  const body=JSON.stringify({operation,windowDays,initData:initData(),backupToken:backupToken(),...(extra||{})});
  let response=await fetch('/api/mood',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body,cache:'no-store'});
  if(!response.ok&&response.status>=500){
    response=await fetch('/api/partner-message?rudiAction=mood',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body,cache:'no-store'});
  }
  const data=await response.json().catch(()=>({}));
  if(data?.backupToken)try{await window.RUDI_STATE_BACKUP?.storeToken?.(data.backupToken)}catch(_){}
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
  const START_ZONE=72,MIN_DISTANCE=48,DIRECTION_RATIO=1.08;
  let tracking=false,startX=0,startY=0,lastX=0,lastY=0;
  const reset=()=>{tracking=false;startX=startY=lastX=lastY=0};
  const begin=(x,y)=>{
    if(page.hidden||Number(x)>START_ZONE)return false;
    tracking=true;startX=lastX=Number(x)||0;startY=lastY=Number(y)||0;
    return true;
  };
  const move=(x,y)=>{if(!tracking)return;lastX=Number(x)||lastX;lastY=Number(y)||lastY};
  const finish=(x=lastX,y=lastY)=>{
    if(!tracking)return;
    const dx=(Number(x)||lastX)-startX,dy=Math.abs((Number(y)||lastY)-startY);
    reset();
    if(dx>=MIN_DISTANCE&&dx>=dy*DIRECTION_RATIO)close();
  };

  page.addEventListener('touchstart',e=>{
    if(e.touches?.length!==1)return;
    const touch=e.touches[0];begin(touch.clientX,touch.clientY);
  },{passive:true,capture:true});
  page.addEventListener('touchmove',e=>{
    if(!tracking||e.touches?.length!==1)return;
    const touch=e.touches[0];move(touch.clientX,touch.clientY);
  },{passive:true,capture:true});
  page.addEventListener('touchend',e=>{
    if(!tracking)return;
    const touch=e.changedTouches?.[0];finish(touch?.clientX,touch?.clientY);
  },{passive:true,capture:true});
  page.addEventListener('touchcancel',reset,{passive:true,capture:true});

  page.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||(e.pointerType==='mouse'&&e.button!==0))return;
    begin(e.clientX,e.clientY);
  },{passive:true});
  page.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')move(e.clientX,e.clientY)},{passive:true});
  page.addEventListener('pointerup',e=>{if(e.pointerType!=='touch')finish(e.clientX,e.clientY)},{passive:true});
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
      '<section id="moodHistoryHero" class="mood-history-hero" data-mood="neutral"><span id="moodHistoryHeroEmoji" class="mood-history-hero-emoji" aria-hidden="true">🙂</span><div><span>Эмоциональный ритм</span><strong id="moodHistoryHeroTitle">Настроение за неделю</strong><small id="moodHistoryHeroSubtitle">Отмечай настроение, чтобы видеть динамику</small></div></section>'+
      '<section class="mood-history-card">'+
        '<div class="mood-history-week-nav"><button id="moodWeekPrev" type="button" aria-label="Предыдущая неделя">‹</button><div><strong id="moodHistoryWeekLabel"></strong><span id="moodHistoryMeta"></span></div><button id="moodWeekNext" type="button" aria-label="Следующая неделя">›</button></div>'+
        '<div id="moodHistoryWeekStrip" class="mood-history-week-strip"></div>'+
        '<div id="moodDayDetail" class="mood-day-detail" hidden></div>'+
      '</section>'+
      '<section class="mood-stats-card"><div class="mood-stats-head"><strong>Статистика</strong><span id="moodStatsPeriod"></span></div><div id="moodStats" class="mood-stats"></div></section>'+
      '<section class="mood-analysis-card">'+
        '<div class="mood-analysis-head"><div class="mood-analysis-profile"><span class="mood-analysis-avatar" aria-hidden="true">🧠</span><div><strong>Анализатор настроения</strong><span>Только наблюдения по вашим данным</span></div></div><button id="moodAnalyzeButton" type="button">Анализ</button></div>'+
        '<div id="moodRangeTabs" class="mood-range-tabs"><button data-days="7" type="button">7 дней</button><button data-days="30" type="button" class="active">30 дней</button><button data-days="90" type="button">3 месяца</button></div>'+
        '<div id="moodAnalysisStatus"></div><div id="moodAnalysisResult" hidden></div>'+
      '</section>'+
    '</div>';
  document.body.append(page);
  page.querySelector('#moodHistoryBack').addEventListener('click',close);
  page.querySelector('#moodWeekPrev').addEventListener('click',()=>{visibleWeekEnd=shiftDate(visibleWeekEnd||todayKey(),-7);selectedDate='';render(state)});
  page.querySelector('#moodWeekNext').addEventListener('click',()=>{visibleWeekEnd=shiftDate(visibleWeekEnd||todayKey(),7);selectedDate='';render(state)});
  page.querySelector('#moodAnalyzeButton').addEventListener('click',runAnalysis);
  page.querySelector('#moodRangeTabs').addEventListener('click',async e=>{
    const button=e.target.closest('[data-days]');if(!button)return;
    windowDays=Number(button.dataset.days)||30;
    restoreAnalysisWindow=false;
    page.querySelectorAll('[data-days]').forEach(item=>item.classList.toggle('active',item===button));
    await reload();
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
function minimumAnalysisDays(days){
  const value=Number(days)||30;
  return value>=90?20:value>=30?10:5;
}
function analysisPeriodLabel(days){
  const value=Number(days)||30;
  return value>=90?'3 месяца':value>=30?'30 дней':'7 дней';
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


function clampAnalysisPercent(value){return Math.max(0,Math.min(100,Math.round(Number(value)||0)))}
function renderAnalysisVisuals(host,visuals){
  if(!host||!visuals||typeof visuals!=='object')return;
  const moods=Array.isArray(visuals.moods)?visuals.moods.filter(item=>Number(item?.count)>0):[];
  if(!moods.length)return;
  const wrap=document.createElement('section');
  wrap.className='mood-analysis-visuals mood-analysis-visuals-compact';
  wrap.setAttribute('aria-label','Распределение настроения');
  const bar=document.createElement('div');
  bar.className='mood-analysis-mood-bar';
  bar.setAttribute('role','img');
  bar.setAttribute('aria-label',moods.map(item=>String(item.label||'')+' '+Number(item.percent||0)+'%').join(', '));
  for(const item of moods){
    const segment=document.createElement('span');
    segment.className='mood-analysis-mood-segment';
    segment.dataset.mood=String(item.key||'neutral');
    segment.style.flexGrow=String(Math.max(1,Number(item.count)||1));
    bar.append(segment);
  }
  const legend=document.createElement('div');
  legend.className='mood-analysis-mood-legend';
  for(const item of moods){
    const chip=document.createElement('span');
    chip.dataset.mood=String(item.key||'neutral');
    const dot=document.createElement('i');
    dot.setAttribute('aria-hidden','true');
    const copy=document.createElement('b');
    copy.textContent=String(item.emoji||'')+' '+String(item.label||'')+' '+Number(item.percent||0)+'%';
    chip.append(dot,copy);
    legend.append(chip);
  }
  wrap.append(bar,legend);
  host.append(wrap);
}
function renderAnalysisReport(host,text,visuals){
  host.replaceChildren();
  renderAnalysisVisuals(host,visuals);
  const copy=document.createElement('div');copy.className='mood-analysis-copy';host.append(copy);
  renderAnalysisText(copy,text);
}

function renderAnalysisText(host,text){
  host.replaceChildren();
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
  let list=null,skipDialogueBlock=false;
  for(const raw of lines){
    const line=raw.trim();
    if(!line){list=null;continue}
    const heading=line.match(/^(?:#{1,3}\s*)?\*\*([^*]+)\*\*:?$/)||line.match(/^#{1,3}\s+(.+)$/);
    if(heading){
      const headingText=String(heading[1]||'').replace(/\*\*/g,'').replace(/:$/,'').trim();
      if(/^начни с диалога$/i.test(headingText)){
        skipDialogueBlock=true;
        list=null;
        continue;
      }
      skipDialogueBlock=false;
      list=null;
      const h=document.createElement('h3');
      h.textContent=headingText;
      host.append(h);continue;
    }
    if(skipDialogueBlock||/^напишите пару слов о том, как прош[её]л день/i.test(line))continue;
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
  const page=ensure(),host=page.querySelector('#moodStats'),rows=rowsForWindow(history,today,windowDays),counts={},reasonCounts={},reasonMoods={};
  let marks=0;
  for(const row of rows){
    if(META[row?.mood])counts[row.mood]=(counts[row.mood]||0)+1;
    for(const sample of row?.samples||[]){
      marks+=1;
      const label=reasonLabel(sample);
      if(!label) continue;
      reasonCounts[label]=(reasonCounts[label]||0)+1;
      const mood=String(sample?.mood||row?.mood||'');
      if(META[mood]){
        reasonMoods[label]=reasonMoods[label]||{};
        reasonMoods[label][mood]=(reasonMoods[label][mood]||0)+1;
      }
    }
  }
  host.replaceChildren();
  const total=Math.max(1,rows.length);
  for(const key of ['joy','love','neutral','fatigue','sadness','boredom','anger']){
    if(!counts[key])continue;
    const el=document.createElement('div');el.className='mood-stat-chip';el.dataset.mood=key;
    el.innerHTML='<b>'+META[key].emoji+' '+Math.round(counts[key]/total*100)+'%</b><span>'+META[key].label+'</span>';
    host.append(el);
  }

  const factors=Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1]);
  if(factors.length){
    const factorBlock=document.createElement('div');
    factorBlock.className='mood-factor-stats';
    const title=document.createElement('strong');
    title.textContent='Что влияло на настроение';
    factorBlock.appendChild(title);
    const list=document.createElement('div');
    list.className='mood-factor-list';
    for(const [label,count] of factors.slice(0,8)){
      const moods=reasonMoods[label]||{};
      const topMood=Object.entries(moods).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
      const positive=(Number(moods.joy||0)+Number(moods.love||0));
      const negative=(Number(moods.fatigue||0)+Number(moods.sadness||0)+Number(moods.boredom||0)+Number(moods.anger||0));
      const isPositive=topMood==='joy'||topMood==='love'||(positive>negative&&positive>0);
      const item=document.createElement('div');
      item.className='mood-factor-item'+(isPositive?' is-positive':'');
      const name=document.createElement('b');
      name.textContent=label;
      const meta=document.createElement('span');
      const moodHint=topMood&&META[topMood]?' · '+META[topMood].emoji+' '+META[topMood].label:'';
      meta.textContent=(isPositive?'↑ положительно · ':'')+count+'×'+moodHint;
      item.append(name,meta);
      list.appendChild(item);
    }
    factorBlock.appendChild(list);
    host.appendChild(factorBlock);
  }

  const summary=document.createElement('div');summary.className='mood-stat-summary';
  const topReason=factors[0];
  summary.textContent=rows.length+' '+plural(rows.length,'день','дня','дней')+' с настроением · '+marks+' '+plural(marks,'отметка','отметки','отметок')+(topReason?' · чаще отмечалось: '+topReason[0]:'');
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
    const reasonText=reasonLabel(sample);if(reasonText){const reason=document.createElement('em');reason.textContent=reasonText;line.append(reason)}
    box.append(line);
  }
}

function render(data){
  if(!data)return;
  state=data;
  const page=ensure(),today=String(data.date||todayKey()),history=Array.isArray(data.history)?data.history:[];
  if(restoreAnalysisWindow){
    const savedDays=Number(data.analysis?.windowDays);
    if([7,30,90].includes(savedDays))windowDays=savedDays;
    restoreAnalysisWindow=false;
  }
  page.querySelectorAll('[data-days]').forEach(item=>item.classList.toggle('active',Number(item.dataset.days)===windowDays));
  if(!visibleWeekEnd)visibleWeekEnd=today;
  const earliest=String(history[0]?.date||today);
  if(visibleWeekEnd>today)visibleWeekEnd=today;
  const weekStart=shiftDate(visibleWeekEnd,-6);
  const rows=history.filter(row=>String(row?.date||'')>=weekStart&&String(row?.date||'')<=visibleWeekEnd),map=new Map(rows.map(row=>[String(row.date),row]));
  const totalMarks=rows.reduce((sum,row)=>sum+Math.max(1,Number(row.sampleCount)||0),0);
  const moodCounts={};
  for(const row of rows){const key=row?.averageMood||row?.mood;if(META[key])moodCounts[key]=(moodCounts[key]||0)+1}
  const dominant=Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'neutral',dominantMeta=META[dominant]||META.neutral;
  const hero=page.querySelector('#moodHistoryHero');hero.dataset.mood=dominant;
  page.querySelector('#moodHistoryHeroEmoji').textContent=dominantMeta.emoji;
  page.querySelector('#moodHistoryHeroTitle').textContent=rows.length?'Чаще всего: '+dominantMeta.label:'Настроение за неделю';
  page.querySelector('#moodHistoryHeroSubtitle').textContent=rows.length?totalMarks+' '+plural(totalMarks,'отметка','отметки','отметок')+' за последние 7 дней':'Добавь несколько отметок, и здесь появится динамика';

  page.querySelector('#moodHistoryWeekLabel').textContent=fmtDate(weekStart)+' — '+fmtDate(visibleWeekEnd);
  page.querySelector('#moodHistoryMeta').textContent=totalMarks+' '+plural(totalMarks,'отметка','отметки','отметок')+' · хранение 180 дней';
  page.querySelector('#moodWeekPrev').disabled=weekStart<=earliest;
  page.querySelector('#moodWeekNext').disabled=visibleWeekEnd>=today;

  const strip=page.querySelector('#moodHistoryWeekStrip');strip.replaceChildren();
  for(let offset=0;offset<7;offset++){
    const key=shiftDate(weekStart,offset),row=map.get(key),date=new Date(key+'T12:00:00Z'),el=document.createElement('button');
    el.type='button';
    el.className='mood-history-day'+(key===today?' is-today':'')+(row?' has-mood':'')+(key===selectedDate?' is-selected':'');
    el.dataset.mood=String(row?.averageMood||row?.mood||'');
    const weekday=document.createElement('span');weekday.textContent=new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,weekday:'short'}).format(date).replace('.','');
    const day=document.createElement('strong');day.textContent=new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,day:'2-digit'}).format(date);
    const emoji=document.createElement('b');emoji.textContent=META[row?.averageMood||row?.mood]?.emoji||'';
    el.append(weekday,day,emoji);el.disabled=!row;
    if(row)el.addEventListener('click',()=>{selectedDate=selectedDate===key?'':key;renderDayDetail(selectedDate?row:null);page.querySelectorAll('.mood-history-day').forEach(item=>item.classList.toggle('is-selected',item===el&&Boolean(selectedDate)))});
    strip.append(el);
  }
  if(selectedDate)renderDayDetail(map.get(selectedDate)||history.find(row=>row.date===selectedDate)||null);else renderDayDetail(null);
  renderStats(history,today);

  const analysis=data.analysis||null,button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus'),result=page.querySelector('#moodAnalysisResult');
  const moodDays=rowsForWindow(history,today,windowDays).length;
  const minimumDays=minimumAnalysisDays(windowDays);
  const analysisQuota=data.analysisQuota&&typeof data.analysisQuota==='object'?data.analysisQuota:{max:3,used:0,available:3};
  const analysesLeft=Math.max(0,Number(analysisQuota.available??3));
  const analysisLimitReached=analysesLeft<=0;
  if(analysis?.text){
    result.hidden=false;renderAnalysisReport(result,analysis.text,data.analysisVisuals);
    button.disabled=analysisLimitReached||moodDays<minimumDays;button.textContent='Анализ';
    const savedPeriod=analysisPeriodLabel(Number(analysis.windowDays)||30);
    status.textContent=(analysis.level==='preliminary'?'Предварительный разбор · ':'')+'Сохранённый анализ за '+savedPeriod+' · '+(analysisLimitReached?'Лимит на сегодня исчерпан · снова доступно завтра':'Осталось анализов сегодня: '+analysesLeft+' из '+Number(analysisQuota.max||3))+(analysis?.cycle?.phase?' · цикл Дианы учтён':'');
  }else{
    result.hidden=true;result.replaceChildren();
    button.disabled=analysisLimitReached||moodDays<minimumDays;button.textContent='Анализ';
    status.textContent=moodDays<minimumDays
      ?'Для анализа за '+analysisPeriodLabel(windowDays)+' данных мало: '+moodDays+' из '+minimumDays+' нужных дней с отметками.'
      :analysisLimitReached?'Лимит на сегодня исчерпан · снова доступно завтра'
      :moodDays<10?'Данных немного: получится предварительный разбор · осталось '+analysesLeft+' из '+Number(analysisQuota.max||3):'Можно анализировать '+analysisPeriodLabel(windowDays)+' · осталось '+analysesLeft+' из '+Number(analysisQuota.max||3);
  }
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
  visibleWeekEnd=todayKey();
  selectedDate='';
  restoreAnalysisWindow=true;
  await reload();
}

async function runAnalysis(){
  const page=ensure(),button=page.querySelector('#moodAnalyzeButton'),status=page.querySelector('#moodAnalysisStatus');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Смотрю связи…';status.textContent='Смотрю, что могло влиять на настроение…';
  try{
    render(await api('analyze'));
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
  }catch(error){
    const code=String(error?.message||'');
    status.textContent=code==='mood-analysis-insufficient-data'?'Недостаточно данных для выбранного периода.':code==='mood-analysis-daily-limit'?'Лимит на сегодня исчерпан · снова доступно завтра':code==='mood-analysis-quota'?'Сервис временно занят. Попробуйте позже.':'Не удалось сделать анализ. Попробуйте ещё раз.';
    button.disabled=code==='mood-analysis-daily-limit';button.textContent='Анализ';
  }
}
window.RUDI_MOOD_HISTORY={open,close,reload};
function bind(){const button=document.getElementById('moodHistoryButton');if(button&&!button.dataset.bound){button.dataset.bound='1';button.addEventListener('click',open)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();