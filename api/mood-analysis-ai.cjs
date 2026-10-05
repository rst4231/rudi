const MODEL='openai/gpt-oss-20b';
const LABELS={sadness:'грусть',boredom:'скука',neutral:'нейтрально',fatigue:'усталость',anger:'злость',joy:'радость',love:'любовь'};
const REASONS={work:'работа',food:'еда',relationship:'отношения',money:'деньги',health:'самочувствие',sport:'спорт',fatigue:'усталость',sleep:'сон',fasting:'голодание',other:'другое'};

function reasonLabel(sample){
  const reason=String(sample?.reason||'');
  const custom=String(sample?.reasonText||'').trim();
  return reason==='other'&&custom?custom:(REASONS[reason]||'');
}

function factorSummary(rows){
  const factors=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    for(const sample of Array.isArray(row?.samples)?row.samples:[]){
      const label=reasonLabel(sample);
      if(!label) continue;
      const mood=LABELS[sample?.mood]?String(sample.mood):String(row?.mood||'');
      const current=factors.get(label)||{total:0,moods:new Map()};
      current.total+=1;
      if(LABELS[mood]) current.moods.set(mood,(current.moods.get(mood)||0)+1);
      factors.set(label,current);
    }
  }
  return [...factors.entries()]
    .sort((a,b)=>b[1].total-a[1].total)
    .slice(0,8)
    .map(([label,data])=>{
      const top=[...data.moods.entries()].sort((a,b)=>b[1]-a[1])[0];
      return label+': '+data.total+' '+(data.total===1?'отметка':'отметок')+(top?' · чаще '+LABELS[top[0]]+' ('+top[1]+'/'+data.total+')':'');
    });
}

function clean(value,max=7000){return String(value||'').replace(/\r\n?/g,'\n').trim().slice(0,max)}
function rowLine(row){
  const parts=[];
  const reasons=[...new Set((Array.isArray(row?.samples)?row.samples:[]).map(reasonLabel).filter(Boolean))];
  if(reasons.length)parts.push('причины: '+reasons.join(', '));
  const h=row?.context?.habits;
  if(h&&Number(h.total)>0)parts.push('привычки: '+Number(h.done||0)+' из '+Number(h.total||0)+' выполнено'+(Number(h.notDone||0)?', '+Number(h.notDone)+' не выполнено':''));
  const f=row?.context?.fasting;
  if(f?.active)parts.push('голодание: '+Number(f.hours||0).toFixed(1)+' ч'+(f.goalReached===true?', цель достигнута':f.goalReached===false?', цель не достигнута':''));
  const supplements=(Array.isArray(row?.context?.supplements?.taken)?row.context.supplements.taken:[]).map(value=>String(value||'').trim()).filter(Boolean);
  if(supplements.length)parts.push('БАДы приняты: '+supplements.join(', '));
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
  const factors=factorSummary(rows);
  return[
    'Сделайте бережный персональный разбор истории настроения пользователя RUDI.',
    'Обращайтесь к пользователю напрямую и только на «вы», во втором лице. Не называйте пользователя по имени.',
    'Не ставьте диагнозы, не изображайте врача или психотерапевта и не выдумывайте причины.',
    'Строго разделяйте связь и причинность: привычка, сон, голодание, цикл или другое событие не считаются причиной без доказательств.',
    'Корреляции формулируйте как «в такие дни чаще отмечалось...», а не «из-за этого...».',
    level==='preliminary'?'Данных пока немного: прямо назовите разбор предварительным и избегайте сильных выводов.':'Данных достаточно для обычного разбора, но отмечайте неопределённость.',
    'Причины, выбранные самим пользователем после отметки настроения, считаются важным пользовательским контекстом и должны учитываться в анализе.',
    'Если один и тот же фактор выбран минимум два раза, отдельно проверьте, с каким настроением он чаще совпадал. Не называйте это причиной, если данных недостаточно.',
    'В разделе «Связи» при наличии данных обязательно упомяните 1–3 наиболее повторяющихся выбранных фактора. Для единичной отметки прямо укажите, что данных мало для вывода.',
    'Учитывайте привычки, трекер голодания и отмеченные приёмы БАДов только когда они реально присутствуют в данных.',
    'Для БАДов не делайте выводов по единичным дням и не утверждайте лечебный эффект. Связь с настроением описывайте только при повторяющихся наблюдениях и только как корреляцию, а не причину.',
    'Дайте практичные рекомендации на ближайшие 1–3 дня.',
    'Период анализа: последние '+Number(windowDays||30)+' дней.',
    cycleText?'Дополнительный контекст цикла: '+cycleText+'. Не утверждайте, что цикл является причиной настроения.':'',
    summary?'Проверенные сводные наблюдения:\n'+summary:'',
    factors.length?'Факторы, которые пользователь сам выбрал после отметки настроения:\n'+factors.join('\n'):'',
    'История:',
    lines,
    '',
    'Пишите коротко, естественно и конкретно, без канцелярита. Не повторяйте одну и ту же статистику в нескольких разделах.',
    'Не пересказывайте все числа подряд: выбирайте только те, которые помогают понять повторяющуюся связь или заметное отклонение.',
    'Не давайте общих советов вроде «наладить сон» или «больше двигаться», если они прямо не следуют из данных пользователя.',
    'В «Что видно» дайте 2–4 предложения с главным выводом периода. В «Связи» оставьте максимум 3 наиболее повторяющиеся корреляции. В «На что обратить внимание» — максимум 3 конкретных наблюдения. В «Что можно попробовать» — максимум 3 небольших действия, основанных именно на этих данных.',
    'Ответ по-русски, без таблиц, до 1400 знаков. Четыре коротких раздела: «Что видно», «Связи», «На что обратить внимание», «Что можно попробовать». Если надёжных связей нет, так и напишите.'
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
