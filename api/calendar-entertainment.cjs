'use strict';
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {readFeedSnapshot,moscowDateKey}=require('./feed-store.cjs');
const {loadEventsConfig}=require('./events-config.cjs');
const KEY='rolling-quarter', NAMESPACE='rudi-calendar-entertainment-v1';
const CONFIG_URL='https://raw.githubusercontent.com/rst4231/rudi/main/config/calendar-entertainment.json';
const DEFAULTS={enabled:true,monthsAhead:3,yandexStandupUrl:'https://afisha.yandex.ru/saint-petersburg/selections/standup',knownStandups:['Андрей Бебуришвили','Алексей Щербаков','Гурам Амарян','Иван Абрамов','Нурлан Сабуров','Ольга Малащенко','Варвара Щербакова','Дмитрий Романов','Виктор Комаров','Валентин Сидоров','Слава Комиссаренко','Денис Дорохов','Comedy Club','Женский форум','Женский стендап','StandUp на ТНТ']};
const clean=(x,n=240)=>String(x||'').replace(/\s+/gu,' ').trim().slice(0,n);
const fold=x=>clean(x).toLocaleLowerCase('ru-RU').replace(/ё/gu,'е').replace(/[^a-zа-я0-9]+/giu,' ').trim();
const url=x=>{try{const u=new URL(String(x||''));return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/u.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
function endDate(day,months=3){const [y,m,d]=day.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1+months,1));dt.setUTCDate(Math.min(d,new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate()));return dt.toISOString().slice(0,10)}
const cacheOf=(o={})=>o.cache||createStrictRuntimeCache({namespace:NAMESPACE,...(o.cacheOptions||{})});
const isKnown=(name,c=DEFAULTS)=>Boolean(fold(name)&&(c.knownStandups||DEFAULTS.knownStandups).some(k=>fold(name).includes(fold(k))));
function event(raw,kind,date,source,c=DEFAULTS){
  const title=clean(raw?.title||raw?.name,160),venue=clean(raw?.venue||raw?.place||raw?.location,140);
  const time=clean(raw?.time||raw?.startTime,16),href=url(raw?.href||raw?.url||raw?.site_url||raw?.sourceUrl);
  if(!title||!validDate(date)||!['concert','standup','cinema'].includes(kind))return null;
  if(kind==='standup'&&!isKnown(title,c))return null;
  if(kind==='concert'&&(/^(кавер|джем|открытый микрофон|трибьют)/iu.test(title)||/\b(бар|pub|паб)\b/iu.test(venue)))return null;
  const clock=time.match(/\b(\d{1,2}:\d{2})\b/u);
  return {kind,date,title,time:clock?clock[1].padStart(5,'0'):'',venue,href,source:clean(source,80)};
}
function unique(items){const map=new Map();for(const item of items||[]){if(!item)continue;const key=[item.kind,item.date,fold(item.title),item.time].join('|');const prev=map.get(key);map.set(key,prev?{...prev,venue:prev.venue||item.venue,href:prev.href||item.href,source:prev.source||item.source}:item)}return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind)||a.time.localeCompare(b.time)||a.title.localeCompare(b.title,'ru'))}
const stripHtml=s=>String(s||'').replace(/<[^>]+>/gu,'').replace(/&amp;/gu,'&').replace(/&nbsp;/gu,' ').replace(/&quot;/gu,'"').trim();
function parsePart(part,kind,date,c){const lines=String(part||'').replace(/\\n/gu,'\n').split(/\r?\n/gu);const out=[];let current=null;
  const push=()=>{if(current)out.push(event(current,kind,date,kind==='concert'?'Яндекс Афиша':'Stage StandUp Club',c));current=null};
  for(const raw of lines){const text=stripHtml(raw),m=text.match(/^\d+\.\s*(.+)$/u);
    if(m){push();current={title:m[1]};continue}if(!current)continue;
    const link=raw.match(/href=["'](https?:\/\/[^"']+)/iu);if(link)current.href=link[1].replace(/&amp;/gu,'&');
    const t=text.match(/\b(\d{1,2}:\d{2})\b/u);if(t)current.time=t[1];
    if(/^📍/u.test(text))current.venue=text.replace(/^📍\s*/u,'');
  }push();return out.filter(Boolean);
}
function fromPreview(p,date,c=DEFAULTS){const row=p?.results?.events||{},parts=p?.sections?.events?.parts||[];
  return unique([...(row.concerts||[]).map(v=>event(v,'concert',date,'Яндекс Афиша',c)),
    ...(row.stage||[]).map(v=>event(v,'standup',date,'Stage StandUp Club',c)),
    ...parsePart(parts[0]||row.preview?.concerts,'concert',date,c),
    ...parsePart(parts[1]||row.preview?.stage,'standup',date,c)].filter(Boolean));
}
async function loadConfig(o={}){if(o.config)return {...DEFAULTS,...o.config};
  try{const r=await(o.fetchImpl||fetch)(CONFIG_URL,{signal:AbortSignal.timeout(4500),cache:'no-store'});if(r.ok)return {...DEFAULTS,...await r.json()}}
  catch(e){console.warn('RUDI_CALENDAR_CONFIG_WARN',String(e?.message||e))}return DEFAULTS;
}
function yandexStandupFromHtml(html,c,from,to){
  const found=[];const re=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;
  for(const match of String(html||'').matchAll(re)){let root;try{root=JSON.parse(match[1])}catch{continue}
    let queue=[root],walked=0;while(queue.length&&walked++<1200){const o=queue.pop();if(Array.isArray(o)){queue.push(...o);continue}if(!o||typeof o!=='object')continue;
      if(/Event/iu.test(String(o['@type']||''))){const start=String(o.startDate||o.startTime||''),date=start.slice(0,10);
        if(date>=from&&date<=to)found.push(event({title:o.name,time:start.slice(11,16),
          venue:typeof o.location==='string'?o.location:o.location?.name,
          href:o.url||o.offers?.url},'standup',date,'Яндекс Афиша',c));}
      for(const [k,v]of Object.entries(o))if(k!=='description'&&k!=='image'&&v&&typeof v==='object')queue.push(v);
    }
  }return unique(found.filter(Boolean));
}
async function yandexStandup(c,from,to,o={}){const r=await(o.fetchImpl||fetch)(c.yandexStandupUrl,{signal:AbortSignal.timeout(9000),headers:{'user-agent':'Mozilla/5.0 (RUDI Calendar)'}});if(!r.ok)throw Error('yandex-standup-http-'+r.status);return yandexStandupFromHtml(await r.text(),c,from,to)}
async function fetchPreview(day,o={}){if(o.previewImpl)return o.previewImpl(day);
  const env=o.env||process.env,h=String(env.VERCEL_PROJECT_PRODUCTION_URL||env.RUDI_APP_URL||'spb-daily-guide-bot.vercel.app');
  const base=/^https?:\/\//iu.test(h)?h:'https://'+h;
  const r=await(o.fetchImpl||fetch)(base.replace(/\/+$/u,'')+'/api/preview?date='+encodeURIComponent(day),{signal:AbortSignal.timeout(10000),cache:'no-store',headers:{accept:'application/json'}});
  if(!r.ok)throw Error('preview-http-'+r.status);const body=await r.json();if(body?.date!==day)throw Error('preview-date-mismatch');return body;
}
async function refresh(o={}){const now=o.now instanceof Date?o.now:new Date(o.now||Date.now()),today=moscowDateKey(now),c=await loadConfig(o);
  if(c.enabled===false)return {skipped:'disabled'};const until=endDate(today,Math.max(1,Math.min(3,Number(c.monthsAhead)||3))),store=cacheOf(o),prev=await store.get(KEY).catch(()=>null);
  if(prev?.refreshedDate===today&&!o.force)return {skipped:'already-refreshed',count:prev.events?.length||0};
  const prior=new Map();for(const item of prev?.events||[])if(item.date>=today&&item.date<=until){if(!prior.has(item.date))prior.set(item.date,[]);prior.get(item.date).push(item)}
  const dates=[];for(let d=today;d<=until;d=addDays(d,1))dates.push(d);let cursor=0,success=0,failed=0;
  async function worker(){while(cursor<dates.length){const day=dates[cursor++];
    try{const p=await fetchPreview(day,o);prior.set(day,fromPreview(p,day,c));success++}
    catch(e){failed++;if(failed<=3)console.warn('RUDI_CALENDAR_PREVIEW_WARN',day,String(e?.message||e))}
  }}
  await Promise.all(Array.from({length:Math.min(6,dates.length)},()=>worker()));
  let extra=[];try{extra=await yandexStandup(c,today,until,o)}catch(e){console.warn('RUDI_CALENDAR_YANDEX_STANDUP_WARN',String(e?.message||e))}
  let movies=[];try{const [feed,cfg]=await Promise.all([readFeedSnapshot(o),loadEventsConfig(o)]);
    for(const row of feed?.sections?.cinema?.items||[]){const day=clean(row.releaseDate,10);if(day>=today&&day<=until)
      movies.push(event({title:row.title,href:row.sourceUrls?.[0]?.url||row.kinopoiskUrl,venue:(row.sources||[]).join(', ')},'cinema',day,'Кинополис / Мираж Синема'))}
    for(const [day,rows] of Object.entries(cfg.cinemaPremieres?.manualByDate||{}))if(day>=today&&day<=until)
      for(const row of rows)movies.push(event({title:row.title,href:row.sourceUrl},'cinema',day,row.source||'Кинотеатр'));
  }catch(e){console.warn('RUDI_CALENDAR_CINEMA_WARN',String(e?.message||e))}
  if(!success&&!extra.length&&!movies.filter(Boolean).length)return {skipped:'sources-unavailable',failed,keptPrevious:Boolean(prev)};
  const keep=[...prior.values()].flat().filter(v=>v.kind!=='cinema');const oldMovies=(prev?.events||[]).filter(v=>v.kind==='cinema'&&v.date>=today&&v.date<=until);
  const events=unique([...keep,...extra,...oldMovies,...movies].filter(Boolean));
  await store.set(KEY,{refreshedDate:today,refreshedAt:now.toISOString(),until,events},{ttl:60*60*24*150,tags:['rudi-calendar-entertainment']});
  return {date:today,until,count:events.length,successDays:success,failedDays:failed,yandexStandupItems:extra.length,movies:movies.filter(Boolean).length};
}
async function month(monthKey,o={}){const today=moscowDateKey(o.now||new Date()),until=endDate(today,3);
  const selected=/^20\d{2}-(0[1-9]|1[0-2])$/u.test(String(monthKey||''))?monthKey:today.slice(0,7);
  const snapshot=await cacheOf(o).get(KEY).catch(()=>null);const days=new Map();
  for(const e of snapshot?.events||[])if(e.date>=today&&e.date<=until&&e.date.slice(0,7)===selected){
    if(!days.has(e.date))days.set(e.date,[]);days.get(e.date).push(e)}
  return {ok:true,month:selected,updatedAt:snapshot?.refreshedAt||null,until,days:[...days.entries()].map(([date,items])=>({date,items:unique(items)}))};
}
module.exports={DEFAULTS,KEY,NAMESPACE,endDate,fromPreview,unique,event,isKnown,
  yandexStandupFromHtml,fetchPreview,refresh,month};
