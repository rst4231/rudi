const DEFAULT_MODEL='openai/gpt-oss-20b';
function cleanText(value,max=1800){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function parseJsonText(text){const raw=String(text||'').trim().replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim();if(!raw)throw new Error('supplement-ai-empty');try{return JSON.parse(raw)}catch{throw new Error('supplement-ai-invalid-json')}}
async function callGroq(prompt,schema,options={}){
  const env=options.env||process.env,apiKey=cleanText(options.apiKey||env.GROQ_API_KEY,500);if(!apiKey)throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||global.fetch;if(typeof fetchImpl!=='function')throw new Error('supplement-ai-fetch-unavailable');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(3000,Number(options.timeoutMs)||15000));let response;
  try{response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},signal:controller.signal,body:JSON.stringify({model:DEFAULT_MODEL,messages:[{role:'user',content:prompt}],reasoning_effort:'low',include_reasoning:false,temperature:0.1,max_completion_tokens:900,stream:false,response_format:{type:'json_schema',json_schema:{name:schema.name,strict:true,schema:schema.schema}}})})}
  catch(error){if(error?.name==='AbortError')throw new Error('supplement-ai-timeout');throw new Error('supplement-ai-unavailable')}finally{clearTimeout(timer)}
  if(response.status===429)throw new Error('supplement-ai-quota');
  if(!response.ok){const detail=await response.text().catch(()=>'');console.warn('RUDI_SUPPLEMENT_AI_PROVIDER_WARN',DEFAULT_MODEL,response.status,detail.slice(0,300));throw new Error([500,502,503,504].includes(response.status)?'supplement-ai-busy':'supplement-ai-provider')}
  const payload=await response.json().catch(()=>null);return parseJsonText(payload?.choices?.[0]?.message?.content);
}
function promptFor(name){
  const supplement=cleanText(name,120);if(!supplement)throw new Error('supplement-name-required');
  return[
    'Ты создаёшь краткую научно-ориентированную справку о БАДе для личного раздела RUDI.',
    'Название: '+supplement+'.',
    'Опирайся только на устоявшиеся научные данные, клинические исследования, систематические обзоры и авторитетные медицинские источники, которые тебе надёжно известны.',
    'Не придумывай исследования, ссылки, DOI, цифры эффективности, механизмы действия или обещания пользы.',
    'Если название неоднозначно или вещество нельзя надёжно определить, прямо скажи это и выбери insufficient.',
    'evidenceLevel означает качество доказательной базы по типичным заявляемым эффектам, а не оценку безопасности и не рекомендацию к приёму.',
    'ingredients — только те активные вещества, которые можно уверенно определить из названия; не угадывай состав бренда.',
    'Не назначай дозировку и не давай персональных медицинских рекомендаций.',
    'Описание 2–4 коротких предложения. Без Markdown и ссылок.'
  ].join('\n');
}
async function generateSupplementDescription(name,options={}){
  const parsed=await callGroq(promptFor(name),{name:'rudi_supplement_description_v2',schema:{type:'object',properties:{description:{type:'string'},evidenceLevel:{type:'string',enum:['strong','moderate','limited','insufficient']},ingredients:{type:'array',items:{type:'string'},maxItems:12}},required:['description','evidenceLevel','ingredients'],additionalProperties:false}},options);
  const description=cleanText(parsed?.description,900);if(!description)throw new Error('supplement-ai-empty');
  return{description,evidenceLevel:String(parsed.evidenceLevel||'insufficient'),ingredients:Array.isArray(parsed.ingredients)?parsed.ingredients.map(x=>cleanText(x,80)).filter(Boolean):[],model:DEFAULT_MODEL,provider:'groq'};
}
function dailyRecommendationPrompt(input={}){
  const age=Math.max(18,Math.min(100,Math.round(Number(input.age)||0))),sex=String(input.sex||'').trim();if(!age||!['male','female'].includes(sex))throw new Error('supplement-recommendation-profile-invalid');
  const sexLabel=sex==='male'?'мужчина':'женщина';
  return[
    'Ты создаёшь одну короткую ежедневную рекомендацию для личной страницы RUDI.',
    'Возраст: '+age+' лет. Пол: '+sexLabel+'.',
    'Рекомендация должна быть уместна для здорового взрослого этого возраста и пола и опираться на современные научные данные, клинические рекомендации, систематические обзоры и авторитетные медицинские источники.',
    'Не придумывай исследования, ссылки, DOI, статистику или гарантированный эффект.',
    'Не ставь диагнозы, не назначай лекарства, гормоны, БАДы или индивидуальные дозировки.',
    'Предпочитай сон, физическую активность, питание, профилактику и доказательные скрининги, если они действительно уместны.',
    'Дай ровно 1 практическую рекомендацию в 2–3 коротких предложениях. Без Markdown и ссылок.'
  ].join('\n');
}
async function generateDailyProfileRecommendation(input={},options={}){
  const parsed=await callGroq(dailyRecommendationPrompt(input),{name:'rudi_daily_profile_recommendation',schema:{type:'object',properties:{recommendation:{type:'string'}},required:['recommendation'],additionalProperties:false}},options);
  const recommendation=cleanText(parsed?.recommendation,900);if(!recommendation)throw new Error('supplement-ai-empty');
  return{recommendation,model:DEFAULT_MODEL,provider:'groq'};
}
function interactionPrompt(items=[]){
  const rows=(Array.isArray(items)?items:[]).map(item=>({name:cleanText(item?.name,120),goal:cleanText(item?.goal,180),dosage:cleanText(item?.schedule?.dosage,80),ingredients:(Array.isArray(item?.ingredients)?item.ingredients:[]).map(x=>cleanText(x,80)).filter(Boolean)})).filter(x=>x.name);
  return[
    'Проверь сочетание текущих БАДов пользователя RUDI. Это справочный анализ, не назначение.',
    'Список: '+JSON.stringify(rows)+'.',
    'Сообщай только о взаимодействиях, дублировании активных веществ и ограничениях, которые достаточно известны из клинических данных или авторитетных медицинских источников.',
    'Не придумывай взаимодействия. Если данные слабые или неоднозначные, evidenceLevel=limited или insufficient и прямо укажи неопределённость.',
    'Не делай вывод, что сочетание безопасно только потому, что взаимодействие неизвестно.',
    'duplicates: только реально совпадающие активные вещества между двумя и более позициями.',
    'warnings: только конкретные потенциально значимые сочетания или ограничения. Не назначай дозировки и лекарства.',
    'summary: короткий общий итог 2–4 предложения. Без Markdown и ссылок.'
  ].join('\n');
}
async function analyzeSupplementSet(items,options={}){
  const parsed=await callGroq(interactionPrompt(items),{name:'rudi_supplement_interactions',schema:{type:'object',properties:{summary:{type:'string'},warnings:{type:'array',items:{type:'object',properties:{title:{type:'string'},detail:{type:'string'},evidenceLevel:{type:'string',enum:['strong','moderate','limited','insufficient']}},required:['title','detail','evidenceLevel'],additionalProperties:false},maxItems:20},duplicates:{type:'array',items:{type:'object',properties:{ingredient:{type:'string'},items:{type:'array',items:{type:'string'},minItems:2,maxItems:12}},required:['ingredient','items'],additionalProperties:false},maxItems:20}},required:['summary','warnings','duplicates'],additionalProperties:false}},options);
  return{summary:cleanText(parsed?.summary,1800)||'Значимых выводов сформировать не удалось.',warnings:Array.isArray(parsed?.warnings)?parsed.warnings:[],duplicates:Array.isArray(parsed?.duplicates)?parsed.duplicates:[],model:DEFAULT_MODEL,provider:'groq'};
}
module.exports={DEFAULT_MODEL,promptFor,dailyRecommendationPrompt,interactionPrompt,parseJsonText,generateSupplementDescription,generateDailyProfileRecommendation,analyzeSupplementSet};