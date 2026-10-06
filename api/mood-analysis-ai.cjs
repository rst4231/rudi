const MODEL='openai/gpt-oss-20b';
const LABELS={sadness:'грусть',boredom:'скука',neutral:'нейтрально',fatigue:'усталость',anger:'злость',joy:'радость',love:'любовь'};
const REASONS={work:'работа',food:'еда',relationship:'отношения',money:'деньги',health:'самочувствие',sport:'спорт',fatigue:'усталость',sleep:'сон',fasting:'голодание',other:'другое'};
const POSITIVE_MOODS=new Set(['joy','love']);
const NEGATIVE_MOODS=new Set(['sadness','boredom','fatigue','anger']);
function moodGroup(value){const mood=String(value||'');return POSITIVE_MOODS.has(mood)?'positive':NEGATIVE_MOODS.has(mood)?'negative':mood==='neutral'?'neutral':'';}

function reasonLabel(sample){
  const reason=String(sample?.reason||'');
  const custom=String(sample?.reasonText||'').trim();
  return reason==='other'&&custom?custom:(REASONS[reason]||'');
}

function factorSummary(rows){
  const factors=new Map();
  const add=(label,mood)=>{
    const safe=String(label||'').trim(),group=moodGroup(mood);
    if(!safe||!group)return;
    const current=factors.get(safe)||{total:0,positive:0,negative:0,neutral:0};
    current.total+=1;
    current[group]+=1;
    factors.set(safe,current);
  };
  for(const row of Array.isArray(rows)?rows:[]){
    for(const sample of Array.isArray(row?.samples)?row.samples:[]){
      const label=reasonLabel(sample);
      if(label)add('Причина: '+label,LABELS[sample?.mood]?sample.mood:row?.mood);
    }
    const habits=row?.context?.habits||{};
    for(const name of [...new Set(Array.isArray(habits.doneNames)?habits.doneNames:[])])add('Привычка выполнена: '+name,row?.mood);
    for(const name of [...new Set(Array.isArray(habits.notDoneNames)?habits.notDoneNames:[])])add('Привычка не выполнена: '+name,row?.mood);
    for(const name of [...new Set(Array.isArray(row?.context?.supplements?.taken)?row.context.supplements.taken:[])])add('БАД: '+name,row?.mood);
    if(row?.context?.fasting?.active)add('Голодание',row?.mood);
    const cycle=row?.context?.cycle;
    if(cycle?.phase)add('Фаза цикла: '+cycle.phase,row?.mood);
    if(cycle?.periodActive)add('Месячные',row?.mood);
  }
  return [...factors.entries()]
    .sort((a,b)=>b[1].total-a[1].total||a[0].localeCompare(b[0],'ru'))
    .slice(0,30)
    .map(([label,data])=>label+': '+data.total+' наблюдений · позитивные '+data.positive+', негативные '+data.negative+', нейтральные '+data.neutral);
}

function clean(value,max=7000){return String(value||'').replace(/\r\n?/g,'\n').trim().slice(0,max)}
function rowLine(row){
  const parts=[];
  const reasons=(Array.isArray(row?.samples)?row.samples:[]).map(sample=>{
    const label=reasonLabel(sample),mood=LABELS[sample?.mood]?LABELS[sample.mood]:LABELS[row?.mood];
    return label?(label+(mood?' → '+mood:'')):'';
  }).filter(Boolean);
  if(reasons.length)parts.push('причины: '+reasons.join('; '));
  const h=row?.context?.habits||{};
  const doneNames=[...new Set((Array.isArray(h.doneNames)?h.doneNames:[]).map(v=>String(v||'').trim()).filter(Boolean))];
  const notDoneNames=[...new Set((Array.isArray(h.notDoneNames)?h.notDoneNames:[]).map(v=>String(v||'').trim()).filter(Boolean))];
  if(doneNames.length)parts.push('привычки выполнены: '+doneNames.join(', '));
  if(notDoneNames.length)parts.push('привычки не выполнены: '+notDoneNames.join(', '));
  if(!doneNames.length&&!notDoneNames.length&&Number(h.total)>0)parts.push('привычки: '+Number(h.done||0)+' из '+Number(h.total||0)+' выполнено');
  const f=row?.context?.fasting;
  if(f?.active)parts.push('голодание: '+Number(f.hours||0).toFixed(1)+' ч'+(f.goalReached===true?', цель достигнута':f.goalReached===false?', цель не достигнута':''));
  const supplements=(Array.isArray(row?.context?.supplements?.taken)?row.context.supplements.taken:[]).map(value=>String(value||'').trim()).filter(Boolean);
  if(supplements.length)parts.push('БАДы приняты: '+supplements.join(', '));
  const cycle=row?.context?.cycle;
  if(cycle?.phase)parts.push('цикл: '+cycle.phase+(Number.isFinite(Number(cycle.cycleDay))?', день '+Number(cycle.cycleDay):'')+(cycle.periodActive?', месячные':''));
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
  const summary=(Array.isArray(contextSummary)?contextSummary:[]).filter(Boolean).slice(0,10).join('\n');
  const factors=factorSummary(rows);
  return[
    'Проанализируйте историю настроения пользователя RUDI и покажите только то, с чем чаще совпадают три группы эмоций.',
    'Группы фиксированы: позитивные — радость и любовь; негативные — грусть, скука, усталость и злость; нейтральные — нейтральное состояние.',
    'Обращайтесь к пользователю только на «вы». Не называйте пользователя по имени.',
    'Учитывайте только реальные данные из истории. Не ставьте диагнозы и не выдумывайте причины.',
    'Обязательно анализируйте конкретные названия привычек, конкретные названия БАДов и конкретные причины настроения, выбранные пользователем. Не заменяйте их общими словами вроде «привычки» или «добавки», если конкретное название есть в данных.',
    'Для привычек различайте, какая конкретная привычка была выполнена и какая конкретная привычка была явно отмечена как невыполненная.',
    'Для причин настроения учитывайте связь причины именно с той эмоцией, при которой пользователь её указал.',
    'Учитывайте голодание как отдельный фактор. Для Дианы учитывайте фазу цикла, день цикла и месячные, если эти данные есть.',
    'Строго разделяйте связь и причинность. Пишите «чаще совпадало», «чаще отмечалось», «наблюдается связь», а не «вызывает» или «приводит к».',
    'Для БАДов не делайте выводов по единичным дням и описывайте наблюдения только как корреляцию, а не причину.',
    'Один случай не является закономерностью и не должен попадать в вывод как влияние. Два совпадения можно упомянуть только как слабую связь. Три и более повторяющихся наблюдения можно описывать увереннее, но всё равно только как связь.',
    'Если один фактор встречается примерно одинаково с разными группами эмоций, не относите его искусственно к одной группе.',
    level==='preliminary'?'Данных немного: особенно осторожно относитесь к слабым связям.':'Выбирайте только наиболее повторяющиеся и понятные связи.',
    'Не давайте рекомендаций и советов. Не перечисляйте отдельные даты. Не добавляйте вступление или заключение.',
    'Период анализа: последние '+Number(windowDays||30)+' дней.',
    cycleText?'Текущий контекст цикла: '+cycleText+'.':'',
    summary?'Проверенные сводные наблюдения:\n'+summary:'',
    factors.length?'Сводка конкретных факторов:\n'+factors.join('\n'):'',
    'История по дням:',
    lines,
    '',
    'Не повторяйте одну и ту же статистику в нескольких разделах.',
    'В каждом разделе показывайте максимум 3 наиболее повторяющиеся корреляции. Если надёжных связей нет, напишите «Явных факторов пока не видно».',
    'Ответ по-русски, без таблиц, до 1400 знаков. Ровно три коротких раздела:',
    '### 🟢 Позитивные эмоции',
    'Покажите, какие конкретные причины, выполненные или невыполненные привычки, БАДы, голодание или факторы цикла чаще совпадают с радостью и любовью.',
    '### 🔴 Негативные эмоции',
    'Покажите, какие конкретные факторы чаще совпадают с грустью, скукой, усталостью или злостью.',
    '### ⚪ Нейтральные эмоции',
    'Покажите, какие конкретные факторы чаще совпадают с нейтральным состоянием.'
  ].filter(Boolean).join('\n');
}
async function requestMoodCompletion(fetchImpl,apiKey,prompt,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.max(8000,Number(options.timeoutMs)||16000));
  let response;
  try{
    response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        messages:[{role:'user',content:prompt}],
        temperature:Number.isFinite(Number(options.temperature))?Number(options.temperature):.3,
        max_completion_tokens:Math.max(1400,Number(options.maxCompletionTokens)||2200),
        reasoning_effort:'low',
        stream:false
      })
    });
  }catch(error){
    if(error?.name==='AbortError')throw new Error('mood-analysis-timeout');
    throw new Error('mood-analysis-unavailable');
  }finally{clearTimeout(timeout)}
  if(response.status===429)throw new Error('mood-analysis-quota');
  if(!response.ok)throw new Error('mood-analysis-provider');
  const payload=await response.json().catch(()=>null);
  return clean(payload?.choices?.[0]?.message?.content,5000);
}
async function generateMoodAnalysis(input={},options={}){
  if(!(Array.isArray(input.history)&&input.history.length))throw new Error('mood-analysis-no-data');
  const env=options.env||process.env,apiKey=clean(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey)throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function')throw new Error('mood-analysis-unavailable');
  const prompt=promptForMoodAnalysis(input);
  let text=await requestMoodCompletion(fetchImpl,apiKey,prompt,{timeoutMs:16000,maxCompletionTokens:2400,temperature:.3});
  if(!text){
    console.warn('RUDI_MOOD_AI_EMPTY_RETRY');
    text=await requestMoodCompletion(fetchImpl,apiKey,prompt+'\n\nВажно: верните именно итоговый текст ответа, не оставляйте поле ответа пустым.',{timeoutMs:18000,maxCompletionTokens:3200,temperature:.2});
  }
  if(!text)throw new Error('mood-analysis-empty');
  return{text,model:MODEL};
}
module.exports={MODEL,promptForMoodAnalysis,generateMoodAnalysis};
