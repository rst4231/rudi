const MODEL='openai/gpt-oss-20b';
const LABELS={sadness:'грусть',boredom:'скука',anger:'злость',joy:'радость',love:'любовь'};
const REASONS={work:'работа',relationship:'отношения',money:'деньги',health:'самочувствие',fatigue:'усталость',sleep:'сон',fasting:'голодание',other:'другое'};

function clean(value,max=7000){return String(value||'').replace(/\r\n?/g,'\n').trim().slice(0,max)}
function rowLine(row){
  const parts=[];
  const reasons=[...new Set((Array.isArray(row?.samples)?row.samples:[]).map(s=>REASONS[String(s?.reason||'')]).filter(Boolean))];
  if(reasons.length)parts.push('причины: '+reasons.join(', '));
  const h=row?.context?.habits;
  if(h&&Number(h.total)>0)parts.push('привычки: '+Number(h.done||0)+' из '+Number(h.total||0)+' выполнено'+(Number(h.notDone||0)?', '+Number(h.notDone)+' не выполнено':''));
  const f=row?.context?.fasting;
  if(f?.active)parts.push('голодание: '+Number(f.hours||0).toFixed(1)+' ч'+(f.goalReached===true?', цель достигнута':f.goalReached===false?', цель не достигнута':''));
  return String(row?.date||'')+' — '+(LABELS[row?.mood]||'нет отметки')+(parts.length?' | '+parts.join(' | '):'');
}
function promptForMoodAnalysis({history,cycle,windowDays=30,level='full',contextSummary=[]}={}){
  const rows=(Array.isArray(history)?history:[]).filter(r=>LABELS[r?.mood]).slice(-Math.max(7,Number(windowDays)||30));
  const lines=rows.map(rowLine).join('\n')||'Нет отметок';
  const cycleText=cycle?[
    cycle.phase?'фаза: '+cycle.phase:'',
    Number.isFinite(Number(cycle.cycleDay))?'день цикла: '+Number(cycle.cycleDay):'',
    cycle.periodActive?'месячные идут сейчас':'',
    Number.isFinite(Number(cycle.periodDay))?'день месячных: '+Number(cycle.periodDay):''
  ].filter(Boolean).join(', '):'';
  const summary=(Array.isArray(contextSummary)?contextSummary:[]).filter(Boolean).slice(0,8).join('\n');
  return[
    'Сделайте бережный персональный разбор истории настроения пользователя RUDI.',
    'Обращайтесь к пользователю напрямую и только на «вы», во втором лице. Не называйте пользователя по имени.',
    'Не ставьте диагнозы, не изображайте врача или психотерапевта и не выдумывайте причины.',
    'Строго разделяйте связь и причинность: привычка, сон, голодание, цикл или другое событие не считаются причиной без доказательств.',
    'Корреляции формулируйте как «в такие дни чаще отмечалось...», а не «из-за этого...».',
    level==='preliminary'?'Данных пока немного: прямо назовите разбор предварительным и избегайте сильных выводов.':'Данных достаточно для обычного разбора, но отмечайте неопределённость.',
    'Причины, выбранные самим пользователем после отметки настроения, можно использовать как прямой контекст, не расширяя их смысл.',
    'Учитывайте привычки и трекер голодания только когда они реально присутствуют в данных.',
    'Дайте практичные рекомендации на ближайшие 1–3 дня.',
    'Период анализа: последние '+Number(windowDays||30)+' дней.',
    cycleText?'Дополнительный контекст цикла: '+cycleText+'. Не утверждайте, что цикл является причиной настроения.':'',
    summary?'Проверенные сводные наблюдения:\n'+summary:'',
    'История:',
    lines,
    '',
    'Ответ по-русски, без таблиц, до 1600 знаков. Четыре коротких раздела: «Что видно», «Связи», «На что обратить внимание», «Что можно попробовать». Если надёжных связей нет, так и напишите.'
  ].filter(Boolean).join('\n');
}
async function generateMoodAnalysis(input={},options={}){
  if(!(Array.isArray(input.history)&&input.history.length))throw new Error('mood-analysis-no-data');
  const env=options.env||process.env,apiKey=clean(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey)throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function')throw new Error('mood-analysis-unavailable');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.max(6000,Number(options.timeoutMs)||12000));
  let response;
  try{
    response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
      signal:controller.signal,
      body:JSON.stringify({model:MODEL,messages:[{role:'user',content:promptForMoodAnalysis(input)}],temperature:.45,max_completion_tokens:900,stream:false})
    });
  }catch(error){
    if(error?.name==='AbortError')throw new Error('mood-analysis-timeout');
    throw new Error('mood-analysis-unavailable');
  }finally{clearTimeout(timeout)}
  if(response.status===429)throw new Error('mood-analysis-quota');
  if(!response.ok)throw new Error('mood-analysis-provider');
  const payload=await response.json().catch(()=>null),text=clean(payload?.choices?.[0]?.message?.content,5000);
  if(!text)throw new Error('mood-analysis-empty');
  return{text,model:MODEL};
}
module.exports={MODEL,promptForMoodAnalysis,generateMoodAnalysis};
