'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

function harness(actor='Рустам',now=Date.parse('2026-10-14T14:00:00Z')){
 const app=fs.readFileSync('public/app.js','utf8');
 const begin=app.indexOf('      function renderFastingProfileOutline(active,partner=false){');
 const end=app.indexOf('      let partnerFastingGoalTimer=0;',begin);
 assert.ok(begin>0&&end>begin,'original fasting renderer remains available');
 const source=app.slice(begin,end);
 const byClass=new Map(),children=[];
 const classes=new Set();
 const style={props:{},setProperty(k,v){this.props[k]=v},removeProperty(k){delete this.props[k]}};
 const wrap={
  classList:{toggle(key,on){on?classes.add(key):classes.delete(key)}},
  style,
  querySelector(q){return byClass.get(q)||null},
  appendChild(child){
   children.push(child);
   if(child.className==='rudi-partner-fasting-hours')byClass.set('.rudi-partner-fasting-hours',child);
   if(child.classList?.contains('rudi-partner-fasting-outline'))byClass.set('.rudi-partner-fasting-outline',child);
   return child;
  }
 };
 const tile={querySelector(q){return q==='.profile-person-head .score-avatar-wrap'?wrap:null}};
 const own={dataset:{},hidden:false,style:{},setAttribute(){},querySelector(){return null}};
 const document={
  getElementById(id){
   if(id==='fastingProfileButton')return own;
   if(id===((actor==='Рустам')?'homeDianaTile':'homeRustamTile'))return tile;
   return null;
  },
  createElement(tag){return {tag,className:'',hidden:false,style:{},dataset:{},listeners:{},addEventListener(k,fn){this.listeners[k]=fn},setAttribute(k,v){this[k]=v}}},
  createElementNS(_ns,tag){
   const classes=new Set(),children=[];
   return {tag,hidden:false,style:{},
    classList:{add(k){classes.add(k)},contains(k){return classes.has(k)}},
    setAttribute(){},appendChild(x){children.push(x)},
    querySelector(q){return children.find(x=>x.classList.contains(q.slice(1)))||null}};
  }
 };
 const FixedDate=class extends Date{static now(){return now}};
 const render=Function('document','currentActor','Date','hidePartnerFastingGoal',
  source+';return renderFastingProfileOutline')(document,actor,FixedDate,()=>{});
 return {render,wrap,style,classes,children,byClass,own,actor};
}
test('same old purple progress and green completed halo for both partner directions',()=>{
 for(const actor of ['Рустам','Диана']){
  const x=harness(actor);
  x.render({startedAt:'2026-10-14T06:00:00Z',goalHours:16},true);
  assert.equal(x.classes.has('rudi-partner-fasting-active'),true);
  const label=x.byClass.get('.rudi-partner-fasting-hours');
  const svg=x.byClass.get('.rudi-partner-fasting-outline');
  assert.equal(label.textContent,'8 ч');
  assert.equal(label.tag,'button','hours keep prior goal popup');
  assert.equal(label.dataset.fastingGoalHours,'16');
  assert.equal(typeof label.listeners.click,'function');
  assert.equal(label.hidden,false);
  assert.equal(svg.hidden,false);
  assert.equal(x.style.props['--rudi-partner-fasting-color'],'#a59af9');
  const dash=svg.querySelector('.rudi-partner-fasting-value').style.strokeDasharray;
  const [draw,total]=dash.split(' ').map(Number);
  assert.ok(Math.abs(draw/total-.5)<.001,'8h / 16h fills exactly half the outline');
  x.render({startedAt:'2026-10-13T17:00:00Z',goalHours:16},true);
  assert.equal(label.textContent,'21 ч');
  assert.equal(x.style.props['--rudi-partner-fasting-color'],'#38dc8f');
  assert.equal(svg.querySelector('.rudi-partner-fasting-value').style.strokeDasharray.split(' ')[0],
   svg.querySelector('.rudi-partner-fasting-value').style.strokeDasharray.split(' ')[1],
   'achieved goal fills ring fully');
  assert.equal(x.children.length,2,'repeated minute refreshes reuse existing DOM elements');
  x.render(null,true);
  assert.equal(x.classes.has('rudi-partner-fasting-active'),false);
  assert.equal(label.hidden,true);
  assert.equal(svg.hidden,true);
  assert.equal(label.textContent,'');
  assert.equal(x.style.props['--rudi-partner-fasting-color'],undefined);
 }
});
test('old icon beside Telegram is removed, contacts and stars avatar navigation are preserved',()=>{
 const code=fs.readFileSync('public/app.js','utf8');
 const section=code.slice(code.indexOf('const makePersonTile=(actor,identity)=>'),code.indexOf('const energy=document.createElement',code.indexOf('const makePersonTile=(actor,identity)=>')));
 assert.doesNotMatch(section,/partnerFastingProfileButton|partnerFastingButton/);
 assert.match(section,/actions\.append\(makeProfileContactButton\('telegram',actor\),makeProfileContactButton\('phone',actor\)\)/);
 assert.match(section,/avatar\.addEventListener\('click',openPartnerStars\)/);
 assert.match(section,/avatarWrap\.append\(avatar\)/);
});
test('halo matches the original colors and uses only the existing 60-second ticker',()=>{
 const css=fs.readFileSync('public/home-reference-layout.css','utf8');
 const design=fs.readFileSync('public/rudi-design-system.css','utf8');
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(design,/#partnerFastingProfileButton \.rudi-fasting-progress-value\{\s*stroke:#a59af9/);
 assert.match(design,/stroke:#38dc8f!important/);
 assert.match(css,/\.rudi-partner-fasting-hours/);
 assert.match(css,/\.rudi-partner-fasting-outline/);
 assert.match(css,/\.rudi-partner-fasting-value/);
 assert.match(app,/fastingHomeTicker=setInterval\(\(\)=>renderFastingHomeStatus\(fastingOverviewState\),60\*1000\)/);
 assert.match(app,/renderFastingProfileOutline\(fastingOverviewState\[partnerActor\],true\)/);
});
test('v4.246 ships updated local avatar assets, not other app resources',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const sw=fs.readFileSync('public/sw.js','utf8');
 assert.match(html,/app\.js\?v=4\.246/);
 assert.match(html,/home-reference-layout\.css\?v=4\.246/);
 assert.match(sw,/app\.js\?v=4\.246/);
 assert.match(sw,/home-reference-layout\.css\?v=4\.246/);
 assert.match(sw,/CACHE_NAME='rudi-shell-v4\.246'/);
 assert.equal(fs.readFileSync('VERSION','utf8').trim(),'v4.246');
 assert.equal(JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current,'v4.246');
});
