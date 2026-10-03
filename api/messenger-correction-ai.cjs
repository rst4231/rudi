const MODEL='openai/gpt-oss-20b';

function clean(value,max=1200){
  return String(value||'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}

function polishText(value){
  const source=clean(value,1000);
  if(!source) return source;
  const parts=source.split(/(https?:\/\/[^\s]+)/giu);
  const polished=parts.map((part,index)=>{
    if(index%2===1) return part;
    let text=part
      .replace(/[ \t]+([,.;:!?…])/gu,'$1')
      .replace(/([,;:!?])(?=[\p{L}\p{N}])/gu,'$1 ')
      .replace(/\.(?=[\p{L}])/gu,'. ')
      .replace(/[ \t]{2,}/gu,' ');
    return text;
  }).join('');
  const chars=[...polished];
  const index=chars.findIndex(char=>/\p{L}/u.test(char));
  if(index>=0) chars[index]=chars[index].toLocaleUpperCase('ru-RU');
  return chars.join('');
}

function parse(text){
  const raw=String(text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  if(!raw) return '';
  try{return polishText(JSON.parse(raw)?.text)}catch{return ''}
}

async function correctMessengerText(text,options={}){
  const source=clean(text,1000);
  if(!source) return source;
  const env=options.env||process.env;
  const apiKey=clean(options.apiKey||env.GROQ_API_KEY,500);
  if(!apiKey) return polishText(source);
  const fetchImpl=options.fetch||global.fetch;
  if(typeof fetchImpl!=='function') return polishText(source);

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
          'Первую буквенную букву сообщения делай заглавной.',
          'Убирай лишние пробелы перед знаками препинания и нормализуй пробел после них.',
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
    if(!response.ok) return polishText(source);
    const payload=await response.json().catch(()=>null);
    const corrected=parse(payload?.choices?.[0]?.message?.content);
    return corrected||polishText(source);
  }catch(_){
    return polishText(source);
  }finally{
    clearTimeout(timer);
  }
}

module.exports={MODEL,polishText,correctMessengerText};
