'use strict';
// Independent public cinema-release and well-known comedian listings.
// These do not invoke the Telegram publishing pipeline or its Thursday gate.
const DEFAULT_STANDUP_URL='https://spb.events/standup/';
const DEFAULT_CINEMA_URL='https://www.kinoafisha.info/releases/';
const MONTHS={января:1,февраля:2,марта:3,апреля:4,мая:5,июня:6,июля:7,августа:8,сентября:9,октября:10,ноября:11,декабря:12};
const decode=s=>String(s||'').replace(/&(?:amp|nbsp|quot|apos|lt|gt);|&#(\d+);|&#x([0-9a-f]+);/giu,(v,n,hex)=>n?String.fromCodePoint(Number(n)):hex?String.fromCodePoint(parseInt(hex,16)):({'&amp;':'&','&nbsp;':' ','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[v.toLowerCase()]||v));
const plain=s=>decode(String(s||'').replace(/<[^>]+>/gu,'')).trim();
const attr=(html,key)=>decode(html.match(new RegExp('\\b'+key+'=["\\x27]([^"\\x27]*)["\\x27]','iu'))?.[1]||'');
const absolute=(href,base)=>{try{const u=new URL(href,base);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
function standupFromHtml(html,c,from,to,makeEvent){
  const rows=[];
  for(const card of String(html||'').match(/<article\b[^>]*class=["'][^"']*\bevent-card\b[^"']*["'][\s\S]*?<\/article>/giu)||[]){
    const button=card.match(/<button\b[^>]*\bdata-event-title=["'][\s\S]*?>/iu)?.[0]||'';
    const name=attr(button,'data-event-title')||plain(card.match(/<div\b[^>]*class=["']event-title["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
    const date=attr(button,'data-event-date')||attr(card,'content');
    if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)||date<from||date>to)continue;
    const href=absolute(attr(button,'data-event-url')||card.match(/<a\b[^>]*href=["']([^"']+)/iu)?.[1],DEFAULT_STANDUP_URL);
    const venue=attr(button,'data-venue-name');
    const datetime=card.match(/<time\b[^>]*datetime=["'][^"']*T(\d{2}:\d{2})/iu)?.[1]||card.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/u)?.[0]||'';
    const item=makeEvent({title:name,venue,href,time:datetime},'standup',date,'СПБ.Events',c);
    if(item)rows.push(item);
  }
  return rows;
}
function cinemaFromHtml(html,c,from,to,makeEvent){
  const htmlText=String(html||''),headers=[...htmlText.matchAll(/<div\b[^>]*class=["'][^"']*\bmovieList_title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/giu)];
  const rows=[];
  for(let i=0;i<headers.length;i++){
    const label=plain(headers[i][1]).toLowerCase().replace(/ё/gu,'е');
    const match=label.match(/(\d{1,2})\s+([а-я]+)\s+(20\d{2})/u);
    if(!match||!MONTHS[match[2]])continue;
    const date=match[3]+'-'+String(MONTHS[match[2]]).padStart(2,'0')+'-'+match[1].padStart(2,'0');
    if(date<from||date>to)continue;
    const block=htmlText.slice(headers[i].index+headers[i][0].length,headers[i+1]?.index||htmlText.length);
    for(const film of block.matchAll(/<a\b[^>]*class=["'][^"']*\bmovieItem_title\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)){
      const title=plain(film[2]),href=absolute(decode(film[1]),DEFAULT_CINEMA_URL);
      const item=makeEvent({title,href},'cinema',date,'Киноафиша · прокат РФ',c);
      if(item)rows.push(item);
    }
  }
  return rows;
}
async function fetchListing(address,options={}){
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const r=await fetchImpl(address,{signal:AbortSignal.timeout(12000),cache:'no-store',headers:{'accept':'text/html','accept-language':'ru-RU,ru;q=0.9','user-agent':'Mozilla/5.0 (compatible; RUDI-Calendar/1.0)'}});
  if(!r?.ok)throw Error('calendar-source-http-'+String(r?.status||0));
  const page=await r.text();
  if(page.length<300||/^\s*<!doctype html>[\s\S]*<title>\s*Один момент/i.test(page))throw Error('calendar-source-blocked');
  return page;
}
async function loadStandup(c,from,to,makeEvent,options={}){
  const page=await fetchListing(c.standupListingUrl||DEFAULT_STANDUP_URL,options);
  return standupFromHtml(page,c,from,to,makeEvent);
}
async function loadCinema(c,from,to,makeEvent,options={}){
  const page=await fetchListing(c.cinemaReleasesUrl||DEFAULT_CINEMA_URL,options);
  return cinemaFromHtml(page,c,from,to,makeEvent);
}
module.exports={DEFAULT_STANDUP_URL,DEFAULT_CINEMA_URL,standupFromHtml,cinemaFromHtml,loadStandup,loadCinema};
