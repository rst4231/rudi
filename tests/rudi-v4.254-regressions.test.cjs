'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createOkxReference,createResilientAuthorMarketRequest}=require('../api/crypto-author-reference.cjs');
const {marketUniverse,MARKET_LIMIT}=require('../api/crypto-algorithms.cjs');
const {generate}=require('../api/personal-center-ai.cjs');
test('scanner checks exactly at most 40 eligible symbols, no duplicates',()=>{
 const all=Array.from({length:80},(_,i)=>({symbol:'COIN'+i+'USDT',turnover24h:String((100-i)*10000000),price24hPcnt:String(i/100),lastPrice:'1'}));
 const rows=marketUniverse({result:{list:all}});
 assert.equal(MARKET_LIMIT,40);
 assert.equal(rows.length,40);
 assert.equal(new Set(rows.map(x=>x.symbol)).size,40);
});
test('Bybit HTTP403 switches to a labeled independent OKX reference, not orders',async()=>{
 let fallbackCalls=0;
 const request=createResilientAuthorMarketRequest({
   primary:async()=>{throw Error('bybit-http-403')},
   fallback:async(path)=>{fallbackCalls++;return {retCode:0,result:{list:[{lastPrice:'10',symbol:'BTCUSDT'}]}}},
 });
 const data=await request('/v5/market/tickers?category=linear&symbol=BTCUSDT');
 assert.equal(data.result.list[0].lastPrice,'10');
 assert.equal(request.lastSource,'okx-reference');
 assert.equal(fallbackCalls,1);
 await assert.rejects(createResilientAuthorMarketRequest({
   primary:async()=>{throw Error('bybit-http-401')},
   fallback:async()=>{throw Error('fallback-unexpected')}
 })('/v5/market/tickers?category=linear&symbol=BTCUSDT'),/bybit-http-401/);
});
test('OKX reference maps independent public hourly candles without inventing funding',async()=>{
 let calls=0;
 const fetchImpl=async url=>{
   calls++;
   if(url.includes('/ticker?'))return {ok:true,json:async()=>({code:'0',data:[{last:'123.5'}]})};
   return {ok:true,json:async()=>({code:'0',data:[[String(Date.parse('2026-10-15T06:00:00Z')),'120','125','119','123','10','20','30','1']]})};
 };
 const okx=createOkxReference({fetchImpl});
 const tick=await okx('/v5/market/tickers?category=linear&symbol=BTCUSDT');
 assert.equal(tick.result.list[0].lastPrice,'123.5');
 const bars=await okx('/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&start='+Date.parse('2026-10-15T00:00:00Z')+'&end='+Date.parse('2026-10-15T08:00:00Z')+'&limit=1000');
 assert.equal(bars.result.list.length,1);
 assert.equal(Number(bars.result.list[0][4]),123);
 await assert.rejects(okx('/v5/market/funding/history?category=linear&symbol=BTCUSDT'),/not-supported/);
 assert.equal(calls,2);
});
test('daily personal AI sends bounded evidence while retaining complete saved observations',async()=>{
 let body;
 const longMonths=Array.from({length:250},(_,i)=>({month:'2025-'+i,rub:i*100}));
 const source={data:{profile:{slot:'morning',body:{},wellbeing:{recentDays:[]},health:{}},
   finances:{expenseEntries:250,incomeEntries:0,expenseMonths:longMonths,incomeMonths:[],todayExpensesRub:700},
   habits:{items:Array.from({length:100},(_,i)=>({name:'Привычка '+i,status:'pending'}))},
   tasks:Array.from({length:120},(_,i)=>({title:'Задача '+i,startTime:'12:00'})),connections:{findings:[]}},missing:[]};
 const result=await generate('Рустам','2026-10-15','morning',{gatherImpl:async()=>source,env:{GROQ_API_KEY:'test'},
   fetchImpl:async(_url,opts)=>{
     body=JSON.parse(opts.body);
     return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({overview:'Один конкретный приоритет.',mainAction:'Выполнить запланированное дело.'})}}]})};
   }});
 assert.equal(result.model,'openai/gpt-oss-20b');
 assert.ok(body.messages[1].content.length<14000,body.messages[1].content.length);
 assert.equal(result.observations.finances.expenseMonths.length,250);
});
test('habit list is read-only and clients cannot hang forever',()=>{
 const server=fs.readFileSync('api/habits.js','utf8'),client=fs.readFileSync('public/profile-supplements.js','utf8');
 assert.match(server,/const shouldFinalize=operation!=='list'/);
 assert.doesNotMatch(server,/reconcileTodayHabitScores\(actor,state,\{now\}\);score=sync\.score;scoreDelta=sync\.deltaPoints;\s*state=await readHabits\(actor,\{now\}\)/);
 assert.match(client,/AbortSignal\.timeout\(9500\)/);
 assert.match(client,/lastHabitSnapshot\(\)/);
 assert.match(client,/homeToolsLoadedAt=0/);
});
