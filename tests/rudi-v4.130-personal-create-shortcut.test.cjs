'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/calendar.css','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');
const web='https://ticktick.com/webapp/#p/inbox/tasks';
const native='ticktick://v1/show?smartlist=today';

function harness({iphone=false,connected=true,actor='Рустам',scope='personal',tg=null}={}){
  const navigation=[];
  const timers=[];
  const listeners={};
  const elements={calendarCreateTask:{hidden:true},calendarPersonalCreateTask:{hidden:true}};
  const document={
    hidden:false,
    body:{dataset:{},appendChild(anchor){navigation.push(['append',anchor.href])}},
    createElement(){return {
      click(){navigation.push(['click',this.href,this.target,this.rel])},
      remove(){navigation.push(['remove'])}
    }},
    getElementById(id){return elements[id]||null},
    addEventListener(name,callback){listeners[name]=callback},
    removeEventListener(name){delete listeners[name]},
  };
  const window={
    location:{assign(url){navigation.push(['location',url])}},
    addEventListener(name,callback){listeners[name]=callback},
    removeEventListener(name){delete listeners[name]},
  };
  const ctx={
    currentActor:actor,calendarScope:scope,calendarPersonalTickTickConnected:connected,
    document,window,navigator:{userAgent:iphone?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1)':'Mozilla/5.0 (Macintosh)'},
    tg,setTimeout(fn,delay){timers.push({fn,delay});return timers.length},clearTimeout(){},
  };
  const first=app.indexOf('function calendarOpenPersonalTickTickComposer(){');
  const last=app.indexOf('function calendarOpenSearchResult(task){',first);
  assert.ok(first>=0&&last>first);
  vm.runInNewContext(app.slice(first,last)+';this.openComposer=calendarOpenPersonalTickTickComposer;',ctx);
  return {ctx,navigation,timers,elements,document,listeners};
}

test('personal + button is next to Today, blue and exactly equal height',()=>{
  const today=html.indexOf('id="calendarToday"');
  const shared=html.indexOf('id="calendarCreateTask"');
  const personal=html.indexOf('id="calendarPersonalCreateTask"');
  assert.ok(today>0&&shared>today&&personal>shared&&personal-shared<400);
  assert.ok(css.includes('background:#4578e6!important;color:#fff!important'));
  assert.ok(css.includes('#calendarPersonalCreateTask[hidden]'));
  assert.ok(css.includes('body[data-calendar-scope="personal"][data-personal-ticktick-connected="true"]'));
  assert.ok(css.includes('height:38px!important;max-height:38px!important'));
  assert.ok(app.includes("document.getElementById('calendarPersonalCreateTask')?.addEventListener('click',calendarOpenPersonalTickTickComposer)"));
});

test('personal + is controlled by confirmed personal OAuth connectivity and owner',()=>{
  assert.ok(api.includes("personalConnected:selectedScope==='rustam'&&actor==='Рустам'&&Boolean(rustamToken?.accessToken)"));
  assert.ok(app.includes("calendarPersonalTickTickConnected=currentActor==='Рустам'&&data.personalConnected===true"));
  assert.ok(app.includes("const isPersonalReady=calendarScope==='personal'&&currentActor==='Рустам'&&calendarPersonalTickTickConnected"));
  for(const opt of [{connected:false},{actor:'Диана'},{scope:'shared'}]){
    const {ctx,navigation}=harness(opt);
    assert.equal(ctx.openComposer(),false);
    assert.equal(navigation.length,0);
  }
});

test('desktop opens TickTick web inbox to add a task',()=>{
  const {ctx,navigation}=harness();
  assert.equal(ctx.openComposer(),true);
  assert.deepEqual(navigation,[['append',web],['click',web,'_blank','noopener noreferrer'],['remove']]);
});

test('Telegram desktop delegates HTTPS to system/browser',()=>{
  const calls=[];
  const {ctx,navigation}=harness({tg:{initData:'telegram',openLink(url){calls.push(url)}}});
  assert.equal(ctx.openComposer(),true);
  assert.deepEqual(calls,[web]);
  assert.deepEqual(navigation,[]);
});

test('iPhone prefers installed native TickTick and falls back to web',()=>{
  const {ctx,navigation,timers,document,listeners}=harness({iphone:true});
  assert.equal(ctx.openComposer(),true);
  assert.deepEqual(navigation,[['location',native]]);
  assert.equal(timers.length,1);
  assert.equal(timers[0].delay,1300);
  timers[0].fn();
  assert.deepEqual(navigation,[['location',native],['location',web]]);
  const installed=harness({iphone:true});
  assert.equal(installed.ctx.openComposer(),true);
  installed.document.hidden=true;
  installed.listeners.visibilitychange();
  installed.timers[0].fn();
  assert.deepEqual(installed.navigation,[['location',native]]);
});
