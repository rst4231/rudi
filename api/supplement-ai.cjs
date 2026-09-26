const DEFAULT_MODEL='openai/gpt-oss-20b';
function cleanText(value,max=700){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function promptFor(name){
  const supplement=cleanText(name,120);if(!supplement)throw new Error('supplement-name-required');
  return [
    'Ты создаёшь краткую справку о БАДе для личного раздела приложения RUDI.',
    'Название БАДa: '+supplement,
    'Опирайся только на устоявшиеся научные данные, клинические исследования, систематические обзоры и авторитетные медицинские источники, которые тебе надёжно известны.',
    'Не придумывай исследования, ссылки, DOI, цифры эффективности, механизмы действия или обещания пользы.',
    'Если название неоднозначно или вещество нельзя надёжно определить, прямо скажи, что достоверное описание сформировать нельзя.',
    'Если доказательность ограниченная, слабая или смешанная, обязательно скажи об этом.',
    'Не назначай дозировку и не давай персональных медицинских рекомендаций.',
    'Дай 2–4 коротких предложения: что это, для чего обычно используют, что известно о доказательности и один важный риск или ограничение при наличии.',
    'Без Markdown и без ссылок.'
  ].join('\n');
}
function parseJsonText(text){
  const raw=String(text||'').trim().replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim();
  if(!raw)throw new Error('supplement-ai-empty');
  try{return JSON.parse(raw)}catch{throw new Error('supplement-ai-invalid-json')}
}
async function generateSupplementDescription(name,options={}){
  const env=options.env||process.env,apiKey=cleanText(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey)throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||global.fetch;if(typeof fetchImpl!=='function')throw new Error('supplement-ai-fetch-unavailable');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(3000,Number(options.timeoutMs)||12000));
  let response;
  try{
    response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},signal:controller.signal,body:JSON.stringify({
      model:DEFAULT_MODEL,
      messages:[{role:'user',content:promptFor(name)}],
      reasoning_effort:'low',
      include_reasoning:false,
      temperature:0.1,
      max_completion_tokens:420,
      stream:false,
      response_format:{type:'json_schema',json_schema:{name:'rudi_supplement_description',strict:true,schema:{type:'object',properties:{description:{type:'string'}},required:['description'],additionalProperties:false}}}
    })});
  }catch(error){if(error?.name==='AbortError')throw new Error('supplement-ai-timeout');throw new Error('supplement-ai-unavailable')}finally{clearTimeout(timer)}
  if(response.status===429)throw new Error('supplement-ai-quota');
  if(!response.ok){const detail=await response.text().catch(()=>'');console.warn('RUDI_SUPPLEMENT_AI_PROVIDER_WARN',DEFAULT_MODEL,response.status,detail.slice(0,300));throw new Error([500,502,503,504].includes(response.status)?'supplement-ai-busy':'supplement-ai-provider')}
  const payload=await response.json().catch(()=>null),parsed=parseJsonText(payload?.choices?.[0]?.message?.content);
  const description=cleanText(parsed?.description,700);if(!description)throw new Error('supplement-ai-empty');
  return{description,model:DEFAULT_MODEL,provider:'groq'};
}

function dailyRecommendationPrompt(input={}){
  const age=Math.max(18,Math.min(100,Math.round(Number(input.age)||0)));
  const sex=String(input.sex||'').trim();
  if(!age||!['male','female'].includes(sex))throw new Error('supplement-recommendation-profile-invalid');
  const sexLabel=sex==='male'?'мужчина':'женщина';
  return [
    'Ты создаёшь одну короткую ежедневную рекомендацию для личной страницы RUDI.',
    'Возраст: '+age+' лет. Пол: '+sexLabel+'.',
    'Рекомендация должна быть уместна для здорового взрослого этого возраста и пола и опираться на современные научные данные, клинические рекомендации, систематические обзоры и авторитетные медицинские источники.',
    'Не придумывай исследования, ссылки, DOI, статистику или гарантированный эффект.',
    'Не ставь диагнозы, не назначай лекарства, гормоны, БАДы или индивидуальные дозировки.',
    'Предпочитай рекомендации по сну, физической активности, питанию, профилактике и доказательным скринингам, если они действительно уместны для этого возраста и пола.',
    'Если рекомендация зависит от анамнеза или факторов риска, прямо обозначь это.',
    'Дай ровно 1 практическую рекомендацию в 2–3 коротких предложениях. Без Markdown и ссылок.'
  ].join('\n');
}

async function generateDailyProfileRecommendation(input={},options={}){
  const env=options.env||process.env,apiKey=cleanText(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey)throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||global.fetch;if(typeof fetchImpl!=='function')throw new Error('supplement-ai-fetch-unavailable');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(3000,Number(options.timeoutMs)||12000));
  let response;
  try{
    response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},signal:controller.signal,body:JSON.stringify({
      model:DEFAULT_MODEL,
      messages:[{role:'user',content:dailyRecommendationPrompt(input)}],
      reasoning_effort:'low',
      include_reasoning:false,
      temperature:0.2,
      max_completion_tokens:320,
      stream:false,
      response_format:{type:'json_schema',json_schema:{name:'rudi_daily_profile_recommendation',strict:true,schema:{type:'object',properties:{recommendation:{type:'string'}},required:['recommendation'],additionalProperties:false}}}
    })});
  }catch(error){if(error?.name==='AbortError')throw new Error('supplement-ai-timeout');throw new Error('supplement-ai-unavailable')}finally{clearTimeout(timer)}
  if(response.status===429)throw new Error('supplement-ai-quota');
  if(!response.ok){const detail=await response.text().catch(()=>'');console.warn('RUDI_PROFILE_RECOMMENDATION_AI_WARN',DEFAULT_MODEL,response.status,detail.slice(0,300));throw new Error([500,502,503,504].includes(response.status)?'supplement-ai-busy':'supplement-ai-provider')}
  const payload=await response.json().catch(()=>null),parsed=parseJsonText(payload?.choices?.[0]?.message?.content);
  const recommendation=cleanText(parsed?.recommendation,900);if(!recommendation)throw new Error('supplement-ai-empty');
  return{recommendation,model:DEFAULT_MODEL,provider:'groq'};
}

module.exports={DEFAULT_MODEL,promptFor,dailyRecommendationPrompt,parseJsonText,generateSupplementDescription,generateDailyProfileRecommendation};