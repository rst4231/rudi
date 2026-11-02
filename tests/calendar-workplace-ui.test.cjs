const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('private workplace buttons queue offline and sync after reconnect',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://rudi.test'}),w=dom.window,s=fs.readFileSync('public/app.js','utf8');let online=false;const calls=[];
 const ctx=vm.createContext({document:w.document,window:w,localStorage:w.localStorage,navigator:{get onLine(){return online}},Map,Promise,Date,Math,currentActor:'Рустам',calendarScope:'personal',telegramInitData:()=>'',fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>({ok:true,days:{}})}}});
 vm.runInContext(s.slice(s.indexOf('      const workplaceFlights='),s.indexOf('      function calendarWeekAgenda('))+'\nglobalThis.api={calendarWorkplaceControl,flushWorkplaces,readWorkplaces};',ctx);
 const row=ctx.api.calendarWorkplaceControl('2026-11-02');w.document.body.append(row);row.querySelector('[data-place="coworking"]').click();assert.equal(ctx.api.readWorkplaces()['2026-11-02'].place,'coworking');assert.equal(ctx.api.readWorkplaces()['2026-11-02'].pending,true);assert.equal(calls.length,0);
 assert.equal(ctx.api.calendarWorkplaceControl('2026-11-07'),null);assert.equal(ctx.api.calendarWorkplaceControl('2026-11-08'),null);assert.ok(ctx.api.calendarWorkplaceControl('2026-11-09'));
 online=true;await ctx.api.flushWorkplaces();assert.equal(calls[0].operation,'set');assert.equal(ctx.api.readWorkplaces()['2026-11-02'].pending,false);
 ctx.currentActor='Диана';assert.equal(ctx.api.calendarWorkplaceControl('2026-11-02'),null);dom.window.close();
});
