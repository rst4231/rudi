const DEFAULT_MODEL = 'openai/gpt-oss-20b';

function cleanText(value,max=500){
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
}
function normalized(value){
  return cleanText(value,260).normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function tokens(value){
  const stop=new Set([
    'что','как','какой','какая','какие','какое','если','для','про','вам','вас','тебе','тебя',
    'сегодня','вместе','друг','друга','больше','хотел','хотела','бы','вы','ты','мы','наш','наша',
    'ваш','ваша','один','одна','это','этот','эта','когда','где','почему','который','которая'
  ]);
  return new Set(normalized(value).split(' ').filter(word=>word.length>2&&!stop.has(word)));
}
function charNgrams(value,size=3){
  const text=' '+normalized(value)+' ';
  const result=new Set();
  for(let i=0;i<=text.length-size;i+=1) result.add(text.slice(i,i+size));
  return result;
}
function jaccard(left,right){
  if(!left.size||!right.size) return 0;
  let overlap=0;
  for(const value of left) if(right.has(value)) overlap+=1;
  return overlap/new Set([...left,...right]).size;
}
function similarQuestion(left,right){
  const a=normalized(left),b=normalized(right);
  if(!a||!b) return false;
  if(a===b) return true;
  if(a.length>24&&b.length>24&&(a.includes(b)||b.includes(a))) return true;

  const ta=tokens(a),tb=tokens(b);
  const tokenScore=jaccard(ta,tb);
  if(tokenScore>=0.45) return true;

  let overlap=0;
  for(const token of ta) if(tb.has(token)) overlap+=1;
  const smaller=Math.min(ta.size,tb.size);
  if(smaller>=3&&overlap/smaller>=0.67) return true;

  const charScore=jaccard(charNgrams(a),charNgrams(b));
  return Math.min(a.length,b.length)>=24&&charScore>=0.52;
}
function parseJsonText(text){
  const raw=String(text||'').trim().replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim();
  if(!raw) throw new Error('daily-question-ai-empty');
  try{return JSON.parse(raw)}catch{throw new Error('daily-question-ai-invalid-json')}
}
function responseText(payload){return String(payload?.choices?.[0]?.message?.content||'').trim()}
function schema(){
  return {
    type:'object',
    properties:{question:{type:'string'},theme:{type:'string'}},
    required:['question','theme'],
    additionalProperties:false,
  };
}
function prompt(history=[],retry=false){
  const source=Array.isArray(history)?history:[];
  const previous=source.map(row=>cleanText(row?.question||row,220)).filter(Boolean).slice(0,300);
  const recentThemes=[...new Set(source.map(row=>cleanText(row?.theme,60)).filter(Boolean).slice(0,5))];
  return [
    'Ты создаёшь «Вопрос дня» для пары Рустама и Дианы в приложении РуДи.',
    'Сгенерируй ровно один новый вопрос на русском языке.',
    'Он должен быть коротким, естественным, интересным для обоих и таким, чтобы каждый мог ответить самостоятельно.',
    'Темы чередуй: мечты, планы, путешествия, еда, новые впечатления, совместный быт, забавные предпочтения, воспоминания, забота, досуг, желания, отношения и будущее.',
    'Не превращай каждый вопрос в серьёзную психологию. Чередуй лёгкие, тёплые, смешные и более содержательные вопросы.',
    'Не задавай вопросы о сексе, здоровье, политике, деньгах, конфликтах, ревности, травмах или других чувствительных темах.',
    'Не спрашивай то, что требует обязательного правильного ответа или вынуждает критиковать партнёра.',
    'Формулировка — одно предложение, обычно 7–22 слова. Без вступления, пояснений, Markdown и вариантов ответа.',
    'Новый вопрос не должен повторять прошлый вопрос ни дословно, ни по смыслу, ни простой перефразировкой.',
    retry?'Предыдущая попытка была слишком похожа на старый вопрос. Смени и тему, и саму идею вопроса.':'',
    recentThemes.length?'Не используй сейчас одну из последних тем: '+recentThemes.join(', ')+'.':'',
    previous.length?'Уже использованные вопросы, которые нельзя повторять ни дословно, ни перефразировкой: '+previous.join(' | '):'',
  ].filter(Boolean).join('\n');
}
async function generateDailyQuestion(history=[],options={}){
  const env=options.env||process.env;
  const apiKey=cleanText(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey) throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||global.fetch;
  if(typeof fetchImpl!=='function') throw new Error('daily-question-ai-fetch-unavailable');
  let lastError=null;
  const prior=(Array.isArray(history)?history:[])
    .map(row=>({question:cleanText(row?.question||row,220),theme:cleanText(row?.theme,60)}))
    .filter(row=>row.question);
  const recentThemes=new Set(prior.slice(0,4).map(row=>normalized(row.theme)).filter(Boolean));
  for(let attempt=0;attempt<5;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(5000,Number(options.timeoutMs)||10000));
    let response;
    try{
      response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        signal:controller.signal,
        body:JSON.stringify({
          model:DEFAULT_MODEL,
          messages:[{role:'user',content:prompt(prior,attempt>0)}],
          reasoning_effort:'low',
          include_reasoning:false,
          temperature:0.95,
          max_completion_tokens:220,
          stream:false,
          response_format:{type:'json_schema',json_schema:{name:'rudi_daily_question',strict:true,schema:schema()}},
        }),
      });
    }catch(error){
      if(error?.name==='AbortError') throw new Error('daily-question-ai-timeout');
      throw new Error('daily-question-ai-unavailable');
    }finally{clearTimeout(timer)}
    if(response.status===429) throw new Error('daily-question-ai-quota');
    if([500,502,503,504].includes(response.status)) throw new Error('daily-question-ai-busy');
    if(!response.ok) throw new Error('daily-question-ai-provider');
    try{
      const payload=await response.json().catch(()=>null);
      const parsed=parseJsonText(responseText(payload));
      const question=cleanText(parsed?.question,220);
      const theme=cleanText(parsed?.theme,60);
      if(question.length<12) throw new Error('daily-question-ai-too-short');
      if(prior.some(row=>similarQuestion(question,row.question))) throw new Error('daily-question-ai-repeat');
      if(recentThemes.size&&recentThemes.has(normalized(theme))) throw new Error('daily-question-ai-theme-repeat');
      return {question,theme,model:DEFAULT_MODEL,provider:'groq'};
    }catch(error){
      lastError=error;
      if(String(error?.message||error).startsWith('daily-question-ai-')&&attempt<4) continue;
      throw error;
    }
  }
  throw lastError||new Error('daily-question-ai-no-unique-question');
}
module.exports={DEFAULT_MODEL,cleanText,normalized,tokens,charNgrams,jaccard,similarQuestion,prompt,generateDailyQuestion};
