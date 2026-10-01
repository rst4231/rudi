const dns=require('node:dns').promises;
const net=require('node:net');
const MODEL='openai/gpt-oss-20b';
function clean(v,max=2000){return String(v??'').replace(/\r\n?/g,'\n').trim().slice(0,max)}
function extractUrl(text){const m=clean(text,4000).match(/https?:\/\/[^\s<>"']+/iu);return m?m[0].replace(/[),.;!?]+$/u,''):''}
function privateIp(ip){
  if(!ip)return true;
  if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31)||p[0]>=224}
  const x=ip.toLowerCase();return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:');
}
async function safeUrl(raw){
  let u;try{u=new URL(raw)}catch{return null}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  if(['localhost','localhost.localdomain'].includes(u.hostname.toLowerCase()))return null;
  try{const rows=await dns.lookup(u.hostname,{all:true});if(!rows.length||rows.some(row=>privateIp(row.address)))return null}catch{return null}
  return u;
}
function attr(tag,name){const r=new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i').exec(tag);return clean(r?.[1]||r?.[2]||r?.[3],2000)}
function decode(s){return clean(s,3000).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')}
async function fetchPageMetadata(raw,o={}){
  const u=await safeUrl(raw);if(!u)return{url:'',title:'',description:'',imageUrl:''};
  const fetchImpl=o.fetchImpl||globalThis.fetch,ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),Math.max(3000,Number(o.timeoutMs)||6500));
  try{
    const response=await fetchImpl(u.toString(),{redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'Mozilla/5.0 RUDI/1.0','accept':'text/html,application/xhtml+xml'}});
    if(!response.ok)return{url:u.toString(),title:'',description:'',imageUrl:''};
    const type=String(response.headers.get('content-type')||'').toLowerCase();if(type&&!type.includes('html'))return{url:u.toString(),title:'',description:'',imageUrl:''};
    const html=(await response.text()).slice(0,300000),metas=html.match(/<meta\b[^>]*>/gi)||[];let title='',description='',image='';
    for(const tag of metas){const key=(attr(tag,'property')||attr(tag,'name')).toLowerCase(),content=attr(tag,'content');if(!content)continue;if(!title&&['og:title','twitter:title'].includes(key))title=content;if(!description&&['description','og:description','twitter:description'].includes(key))description=content;if(!image&&['og:image','twitter:image'].includes(key))image=content}
    if(!title){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);title=decode(m?.[1]||'')}
    let imageUrl='';if(image){try{const x=new URL(decode(image),response.url||u.toString());if(['http:','https:'].includes(x.protocol))imageUrl=x.toString()}catch{}}
    return{url:response.url||u.toString(),title:decode(title),description:decode(description),imageUrl};
  }catch{return{url:u.toString(),title:'',description:'',imageUrl:''}}finally{clearTimeout(timer)}
}
function parseJson(text){const raw=clean(text,6000).replace(/^\s*\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`\s*$/i,'');return JSON.parse(raw)}
function isYouTubeShortUrl(raw){
  try{
    const u=new URL(String(raw||''));
    const host=u.hostname.toLowerCase().replace(/^www\./,'');
    return host==='youtube.com'&&/^\/shorts\//i.test(u.pathname);
  }catch{return false}
}
function hasExplicitEventEvidence(text){
  const value=String(text||'');
  if(/\b(?:концерт|выставк\w*|спектакл\w*|фестивал\w*|экскурси\w*|лекци\w*|премьер\w*|афиш\w*|билет\w*|сеанс\w*|мероприят\w*)\b/iu.test(value))return true;
  return /\b(?:театр|музей|филармони)\w*\b/iu.test(value)
    && /(?:\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b|\b\d{1,2}\s+(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)\w*\b|\b(?:сегодня|завтра)\b)/iu.test(value);
}
function postProcessSmartSaveClassification(input,result){
  const next={...(result||{})};
  const url=String(input?.pageMeta?.url||extractUrl(input?.text||'')||'');
  const evidence=[input?.text,input?.pageMeta?.title,input?.pageMeta?.description,next.title,next.description].filter(Boolean).join('\n');
  if(/мероприят/iu.test(String(next.category||''))&&isYouTubeShortUrl(url)&&!hasExplicitEventEvidence(evidence)){
    next.category='Видео';
  }
  return next;
}
async function classifySmartSave(input={},o={}){
  const env=o.env||process.env,apiKey=clean(o.apiKey||env.GROQ_API_KEY,500);if(!apiKey)throw new Error('groq-api-key-missing');
  const fetchImpl=o.fetchImpl||globalThis.fetch,categories=(Array.isArray(input.categories)?input.categories:[]).map(x=>clean(x,48)).filter(Boolean).slice(0,40);
  const prompt=['Ты классифицируешь сохранения в приложении RUDI.','Верни короткое название, краткое описание и категорию.','Переиспользуй существующую категорию, если она подходит по смыслу. Новую создавай только когда ни одна существующая реально не подходит. Не создавай почти одинаковые категории вроде «Туры», «Путешествия», «Отдых», если уже есть подходящая.','YouTube Shorts сами по себе не являются культурными мероприятиями. Категорию мероприятия используй только если есть явное конкретное событие: концерт, выставка, спектакль, фестиваль, экскурсия, лекция, премьера, билеты, дата или афиша.','Категория: 1–3 слова, по-русски. Название до 90 символов. Описание 1–2 коротких предложения.','Существующие категории: '+(categories.join(', ')||'пока нет'),'Текст пользователя: '+clean(input.text,2400),input.pageMeta?.title?'Заголовок страницы: '+clean(input.pageMeta.title,220):'',input.pageMeta?.description?'Описание страницы: '+clean(input.pageMeta.description,700):''].filter(Boolean).join('\n');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:ctrl.signal,headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},body:JSON.stringify({model:MODEL,messages:[{role:'user',content:prompt}],reasoning_effort:'low',include_reasoning:false,temperature:.2,max_completion_tokens:450,stream:false,response_format:{type:'json_schema',json_schema:{name:'rudi_smart_save',strict:true,schema:{type:'object',properties:{category:{type:'string'},title:{type:'string'},description:{type:'string'}},required:['category','title','description'],additionalProperties:false}}}})});
    if(!response.ok)throw new Error('smart-save-ai-provider');
    const payload=await response.json(),parsed=parseJson(payload?.choices?.[0]?.message?.content||'');
    return postProcessSmartSaveClassification(input,{category:clean(parsed.category,48)||categories[0]||'Другое',title:clean(parsed.title,180),description:clean(parsed.description,700)});
  }finally{clearTimeout(timer)}
}
module.exports={MODEL,extractUrl,fetchPageMetadata,classifySmartSave,isYouTubeShortUrl,hasExplicitEventEvidence,postProcessSmartSaveClassification};
