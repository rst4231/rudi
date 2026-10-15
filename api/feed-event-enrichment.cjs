'use strict';
// Adds optional, cached artwork and already-discovered famous-comedian shows to
// the daily in-app feed. No new crawler or Telegram publication is involved.
const {createHash}=require('node:crypto');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {NAMESPACE:CALENDAR_NS,KEY:CALENDAR_KEY,isKnown}=require('./calendar-entertainment.cjs');
const {loadEventImage,safePublicHttpUrl}=require('./event-images.cjs');
const {moscowDateKey}=require('./feed-store.cjs');
const PHOTO_TTL=60*60*24*3;
const clean=x=>String(x||'').replace(/<[^>]*>/gu,'').replace(/&amp;/gu,'&').replace(/\s+/gu,' ').trim();
const fold=x=>clean(x).toLocaleLowerCase('ru-RU').replace(/ё/gu,'е').replace(/[^а-яa-z0-9]/giu,'');
const dateAhead=(key,days)=>{const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
function fromDigest(value,date){
  const rows=[];let current=null;
  const add=()=>{if(current?.title)rows.push(current);current=null};
  for(const line of String(value||'').replace(/\\n/gu,'\n').split(/\r?\n/u)){
    const text=clean(line),match=text.match(/^\d+\.\s*(.+)$/u);
    if(match){add();current={title:match[1],date,href:'',details:[]};continue}
    if(!current)continue;
    const link=String(line).match(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/iu);
    if(link){current.href=safePublicHttpUrl(link[1])||current.href;continue}
    if(text&& !/^(Подробнее|Официальная страница)\s*→?$/iu.test(text))current.details.push(text);
  }
  add();return rows;
}
function fromCalendar(row){
  return {title:clean(row.title),date:row.date,href:safePublicHttpUrl(row.href)||'',
    details:[row.date?'📅 '+row.date:'',row.time?'🕒 '+row.time:'',row.venue?'📍 '+row.venue:''].filter(Boolean),
    posterUrl:safePublicHttpUrl(row.posterUrl)||''};
}
function unique(rows,max=16){
 const found=new Set(),out=[];
 for(const row of rows){
  if(!row?.title)continue;
  const clock=String(row.details?.find(d=>/\b\d{1,2}:\d{2}\b/u.test(d))||'').match(/\b\d{1,2}:\d{2}\b/u)?.[0]||'';
  const key=[fold(row.title),row.date||'',clock].join('|');
  if(found.has(key))continue;found.add(key);out.push(row);
  if(out.length>=max)break;
 }
 return out;
}
async function enrichFeedEvents(feed,options={}){
 const sections=feed?.sections;
 if(!sections?.events)return feed;
 const now=options.now instanceof Date?options.now:new Date(options.now||Date.now());
 const date=moscowDateKey(now);
 const eventParts=sections.events.parts||[];
 const concerts=fromDigest(eventParts[0],date),standups=fromDigest(eventParts[1],date);
 try{
  const calendar=options.calendarCache||createStrictRuntimeCache({namespace:CALENDAR_NS});
  const snapshot=await calendar.get(CALENDAR_KEY);
  const until=dateAhead(date,14);
  const matches=(snapshot?.events||[]).filter(row=>row&&row.date>=date&&row.date<=until);
  for(const event of matches){
   if(event.kind==='standup'&&(event.source==='Stage StandUp Club'||isKnown(event.title))
     &&(event.source!=='Stage StandUp Club'||event.date===date))standups.push(fromCalendar(event));
   if(event.kind==='concert'&&event.date===date)concerts.push(fromCalendar(event));
  }
 }catch(error){console.warn('RUDI_FEED_EVENTS_CALENDAR_WARN',String(error?.message||error))}
 const concertItems=unique(concerts,12),standupItems=unique(standups,18);
 const rows=[...concertItems,...standupItems];
 const cache=options.eventPhotoCache||createStrictRuntimeCache({namespace:'rudi-feed-event-photos-v1'});
 const loader=options.loadEventImage||loadEventImage;
 let quota=6;
 // Only visit a small number of *original event pages*, cached for 72 hours.
 await Promise.all(rows.map(async row=>{
   const href=row.href;
   if(row.posterUrl||!href||!/^https:\/\//u.test(href))return;
   const key='event:'+createHash('sha256').update(href).digest('hex').slice(0,32);
   try{
     const cached=await cache.get(key);
     if(cached&&Object.hasOwn(cached,'posterUrl')){row.posterUrl=cached.posterUrl||'';return}
     if(quota--<=0)return;
     const posterUrl=safePublicHttpUrl(await loader(href,{fetchImpl:options.fetchImpl,timeoutMs:2700}))||'';
     row.posterUrl=posterUrl;
     await cache.set(key,{posterUrl},{ttl:PHOTO_TTL,tags:['rudi-feed-event-photos']});
   }catch(error){console.warn('RUDI_FEED_EVENT_PHOTO_WARN',String(error?.message||error))}
 }));
 return {...feed,sections:{...sections,events:{...sections.events,concertItems,standupItems}}};
}
module.exports={enrichFeedEvents,fromDigest,fromCalendar,unique};
