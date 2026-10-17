'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/rudi-games-extra.js','utf8');
const thinking=source.slice(source.indexOf('const PUZZLES='),source.indexOf('function openGame('));
function fixture(store=new Map(),person='Рустам',random=()=>0.37){
 const context=vm.createContext({Math:Object.assign(Object.create(Math),{random}),Map,Set,
  person,store,activeGame:'',think:null,html:'',safe:String,
  actor:()=>context.person,
  g:()=>({header(){},setMode(){},section(html){context.html=html}}),
  read(name,fallback){try{return JSON.parse(store.get(context.person+':'+name))??fallback}catch{return fallback}},
  write(name,data){store.set(context.person+':'+name,JSON.stringify(data))}});
 vm.runInContext(thinking+`;globalThis.api={startThinking,renderThinking,thinkAnswer,puzzles:PUZZLES,
  get state(){return think},next(){think.index++;think.answered=false;renderThinking()}};`,context);
 return {api:context.api,context,store};
}
const current=f=>f.api.puzzles[f.api.state.order[f.api.state.index]][0];
test('bank offers hundreds of unique questions across reasoning skills with valid choices',()=>{
 const {api}=fixture();
 assert.ok(api.puzzles.length>=350,`Only ${api.puzzles.length} questions`);
 assert.equal(new Set(api.puzzles.map(p=>p[0])).size,api.puzzles.length);
 assert.equal(new Set(api.puzzles.map(p=>p[4].id)).size,api.puzzles.length);
 assert.ok(new Set(api.puzzles.map(p=>p[4].family)).size>=16);
 for(const [q,options,correct,explanation] of api.puzzles){
  assert.ok(q.length>10);assert.equal(options.length,4);assert.equal(new Set(options).size,4,q);
  assert.ok(Number.isInteger(correct)&&correct>=0&&correct<4,q);assert.ok(explanation.length>15,q);
 }
});
test('restarting an unfinished training does not repeat a shown question',()=>{
 const f=fixture(),shown=[];
 for(let i=0;i<31;i++){f.api.startThinking();shown.push(current(f))}
 assert.equal(new Set(shown).size,shown.length);
});
test('reload preserves shown history and leaves unseen questions available',()=>{
 const store=new Map(),f=fixture(store);f.api.startThinking();const first=current(f);
 const reopened=fixture(store);reopened.api.startThinking();assert.notEqual(current(reopened),first);
 const progress=JSON.parse(store.get('Рустам:thinking-history'));
 assert.equal(progress.seen.length,2,'Only displayed questions enter history');
});
test('all questions are shown before a repeat, and cycle boundary avoids immediate repeats',()=>{
 const f=fixture(),shown=[];
 for(let i=0;i<f.api.puzzles.length;i++){f.api.startThinking();shown.push(current(f))}
 assert.equal(new Set(shown).size,f.api.puzzles.length);
 f.api.startThinking();assert.notEqual(current(f),shown.at(-1));
});
test('each actor has an independent question history',()=>{
 const store=new Map(),rustam=fixture(store),diana=fixture(store,'Диана');
 rustam.api.startThinking();diana.api.startThinking();assert.equal(current(rustam),current(diana));
 rustam.api.startThinking();assert.notEqual(current(rustam),current(diana));
 assert.equal(JSON.parse(store.get('Диана:thinking-history')).seen.length,1);
});
test('answer shuffle keeps grading, explanations and the ten-question result correct',()=>{
 const f=fixture(undefined,undefined,()=>0);f.api.startThinking();const positions=new Set();
 const first=f.api.puzzles[f.api.state.order[0]];
 const displayed=Array.from(f.context.html.matchAll(/data-think-answer="\d+"[^>]*>([^<]+)<\/button>/g),x=>x[1]);
 assert.notDeepEqual(displayed,Array.from(first[1]),'Options are shuffled when a question is displayed');
 let seed=123;
 f.context.Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32};
 for(let i=0;i<10;i++){
  const original=f.api.puzzles[f.api.state.order[i]];
  const options=Array.from(f.context.html.matchAll(/data-think-answer="(\d+)"[^>]*>([^<]+)<\/button>/g));
  const correct=options.find(o=>o[2]===original[1][original[2]]);
  assert.ok(correct,original[0]);positions.add(Number(correct[1]));
  f.api.thinkAnswer(Number(correct[1]));f.api.thinkAnswer(Number(correct[1]));
  assert.equal(f.api.state.score,i+1,'Double clicks do not count twice');
  assert.ok(f.context.html.includes(original[3]));f.api.next();
 }
 assert.equal(f.api.state.score,10);assert.ok(f.context.html.includes('10 / 10'));
 assert.ok(positions.size>1,'Answers do not always occupy the same slot');
 assert.equal(JSON.parse(f.store.get('Рустам:thinking-record')).plays,1);
});
test('damaged saved history recovers and a session stays unique when a cycle ends',()=>{
 const f=fixture(new Map([['Рустам:thinking-history',JSON.stringify({seen:'broken'})]]));
 f.api.startThinking();assert.ok(current(f));
 const ids=f.api.puzzles.map(p=>p[4].id);
 f.store.set('Рустам:thinking-history',JSON.stringify({seen:ids.slice(0,-2),last:ids.at(-3)}));
 const second=fixture(f.store);second.api.startThinking();const shown=[];
 for(let i=0;i<10;i++){shown.push(current(second));second.api.thinkAnswer(0);second.api.next()}
 assert.equal(new Set(shown).size,10);
});
test('generated answers agree with the quantities and rules in each question',()=>{
 const days=['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'];
 for(const [q,options,correct,,meta] of fixture().api.puzzles){
  if(meta.id.startsWith('authored-'))continue;
  const a=Array.from(q.matchAll(/\d+/g),m=>Number(m[0]));let expected;
  switch(meta.family){
   case 'sequence-linear':expected=a[3]+a[1]-a[0];break;
   case 'sequence-gaps':expected=a[3]+(a[3]-a[2])+(a[3]-2*a[2]+a[1]);break;
   case 'sequence-alternating':expected=a[4]+a[1]-a[0];break;
   case 'sequence-sum':expected=a[3]+a[4];break;
   case 'reverse-arithmetic':expected=(a[2]-a[1])/a[0];break;
   case 'equations':expected=(a[1]-a[0])/2;break;
   case 'proportions':expected=a[1]/a[0]*a[2];break;
   case 'percentages':expected=a[0]*(100-a[1])/100;break;
   case 'averages':expected=a[0]*3-a[1]-a[2];break;
   case 'sets':expected=a[0]+a[1]-a[2];break;
   case 'guarantees':expected=a[0]+1;break;
   case 'combinations':{
    const pairs=new Set();for(let x=0;x<a[0];x++)for(let y=x+1;y<a[0];y++)pairs.add(x+':'+y);
    expected=pairs.size;break;
   }
   case 'calendar':expected=days[(days.findIndex(d=>q.startsWith('Сегодня '+d+'.'))+a[0])%7];break;
   case 'time':{
    const minutes=a[0]*60+a[1]+a[2];expected=Math.floor(minutes/60)+':'+String(minutes%60).padStart(2,'0');break;
   }
   case 'perimeters':expected=a[0]+a[1]+a[0]+a[1];break;
   case 'areas':expected=a[0]*a[1];break;
   case 'counting-shapes':{
    expected=0;for(let size=1;size<=Math.min(a[0],a[1]);size++)expected+=(a[0]-size+1)*(a[1]-size+1);break;
   }
   case 'painted-cubes':{
    expected=0;
    for(let x=0;x<a[0];x++)for(let y=0;y<a[1];y++)for(let z=0;z<a[2];z++)
     if(x>0&&x<a[0]-1&&y>0&&y<a[1]-1&&z>0&&z<a[2]-1)expected++;
    break;
   }
   case 'motion':expected=a[0]*a[1];break;
   case 'digit-attention':expected=Array.from(String(a[0]),Number).reduce((x,y)=>x+y,0);break;
   default:assert.fail('Missing content check for '+meta.family);
  }
  assert.equal(options[correct],String(expected),meta.id+': '+q);
 }
});
test('a fresh session varies reasoning families and rerendering keeps history and choices stable',()=>{
 const f=fixture(),families=[];f.api.startThinking();
 for(let i=0;i<10;i++){
  families.push(f.api.puzzles[f.api.state.order[i]][4].family);
  const html=f.context.html,history=f.store.get('Рустам:thinking-history');
  f.api.renderThinking();assert.equal(f.context.html,html);assert.equal(f.store.get('Рустам:thinking-history'),history);
  f.api.thinkAnswer(0);f.api.next();
 }
 assert.equal(new Set(families).size,10);
});
