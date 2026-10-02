const MODEL='openai/gpt-oss-20b';

function clean(value,max=1200){
  return String(value||'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}

function parse(text){
  const raw=String(text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  if(!raw) return '';
  try{return clean(JSON.parse(raw)?.text,1000)}catch{return ''}
}

async function correctMessengerText(text,options={}){
  const source=clean(text,1000);
  if(!source) return source;
  const env=options.env||process.env;
  const apiKey=clean(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey) return source;
  const fetchImpl=options.fetch||global.fetch;
  if(typeof fetchImpl!=='function') return source;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(4000,Number(options.timeoutMs)||9000));
  try{
    const response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        messages:[{role:'user',content:[
          'Исправь только орфографию, опечатки и знаки препинания в сообщении.',
          'Не меняй смысл, лексику, тон, порядок мыслей, имена, ссылки, числа, эмодзи, сленг и мат.',
          'Не смягчай и не цензурируй текст. Если не уверен в правке, оставь как было.',
          'Верни JSON с единственным полем text.',
          'Сообщение: '+source
        ].join('\n')}],
        reasoning_effort:'low',
        include_reasoning:false,
        temperature:0,
        max_completion_tokens:700,
        stream:false,
        response_format:{type:'json_schema',json_schema:{name:'rudi_messenger_correction',strict:true,schema:{
          type:'object',
          properties:{text:{type:'string'}},
          required:['text'],
          additionalProperties:false
        }}}
      })
    });
    if(!response.ok) return source;
    const payload=await response.json().catch(()=>null);
    const corrected=parse(payload?.choices?.[0]?.message?.content);
    return corrected||source;
  }catch(_){
    return source;
  }finally{
    clearTimeout(timer);
  }
}

module.exports={MODEL,correctMessengerText};
