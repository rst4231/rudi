const MODEL = 'openai/gpt-oss-20b';

const MOODS = {
  sadness: { label: 'грусть', emoji: '😢' },
  fear: { label: 'страх', emoji: '😨' },
  anger: { label: 'гнев', emoji: '😡' },
  joy: { label: 'радость', emoji: '😄' },
  love: { label: 'любовь', emoji: '🥰' },
};

function clean(value,max=240){
  return String(value||'').replace(/\r\n?/g,'\n').replace(/\s+/g,' ').trim().slice(0,max);
}

function normalizeOneSentence(value){
  let text=clean(value,180).replace(/^["«]+|["»]+$/g,'').trim();
  if(!text) throw new Error('mood-ai-empty');
  if(/\n/.test(text)) throw new Error('mood-ai-multiline');
  const pieces=text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if(pieces.length!==1) throw new Error('mood-ai-multiple-sentences');
  if(text.length>160) text=text.slice(0,157).trimEnd()+'…';
  return text;
}

function promptForMood(actor,recipient,mood){
  const view=MOODS[String(mood||'')];
  if(!view) throw new Error('mood-ai-invalid-mood');
  return [
    'Напиши ровно одно короткое естественное предложение на русском для Telegram-уведомления в приложении пары RUDI.',
    'Получатель: '+recipient+'. Партнёр: '+actor+'.',
    actor+' только что выбрал настроение «'+view.label+'» '+view.emoji+'.',
    'Сообщи об этом тепло и по-человечески, но не выдумывай причины, мысли, диагнозы или факты, которых нет.',
    'Для грусти, страха или гнева можно мягко предложить поддержку; для радости или любви можно разделить хорошее настроение.',
    'Максимум 140 символов. Без Markdown, без заголовка, без кавычек, без переноса строки. Только одно предложение.',
  ].join('\n');
}

async function generateMoodMessage(input={},options={}){
  const actor=clean(input.actor,20);
  const recipient=clean(input.recipient,20);
  const mood=String(input.mood||'').trim();
  if(!MOODS[mood]) throw new Error('mood-ai-invalid-mood');
  const env=options.env||process.env;
  const apiKey=clean(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey) throw new Error('groq-api-key-missing');
  const fetchImpl=options.fetch||options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function') throw new Error('mood-ai-fetch-unavailable');

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Math.max(3500,Number(options.timeoutMs)||7000));
  let response;
  try{
    response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        messages:[{role:'user',content:promptForMood(actor,recipient,mood)}],
        temperature:0.9,
        max_completion_tokens:90,
        stream:false,
      }),
    });
  }catch(error){
    if(error?.name==='AbortError') throw new Error('mood-ai-timeout');
    throw new Error('mood-ai-unavailable');
  }finally{
    clearTimeout(timeout);
  }
  if(response.status===429) throw new Error('mood-ai-quota');
  if(!response.ok) throw new Error('mood-ai-provider');
  const payload=await response.json().catch(()=>null);
  return normalizeOneSentence(payload?.choices?.[0]?.message?.content||'');
}

module.exports={MODEL,MOODS,normalizeOneSentence,promptForMood,generateMoodMessage};
