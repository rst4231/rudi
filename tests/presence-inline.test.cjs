'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/presence.js','utf8');
class Element{
 constructor(tag='div',classes=''){
  this.tagName=tag;this.className=classes;this.children=[];this.dataset={};this.attributes={};this.events={};this.textContent='';
  this.classList={contains:v=>this.className.split(' ').includes(v),add:v=>{if(!this.classList.contains(v))this.className+=' '+v},
   remove:v=>{this.className=this.className.split(' ').filter(x=>x!==v).join(' ')},
   toggle:(v,on)=>{if(on)this.classList.add(v);else this.classList.remove(v)}};
 }
 appendChild(el){el.parentNode=this;this.children.push(el);return el}
 insertBefore(el,before){if(!before)return this.appendChild(el);el.parentNode=this;this.children.splice(this.children.indexOf(before),0,el);return el}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null}
 contains(el){return this===el||this.children.some(c=>c.contains(el))}
 matches(selector){return selector.startsWith('.')?this.classList.contains(selector.slice(1)):this.tagName===selector}
 closest(selector){for(let el=this;el;el=el.parentNode)if(el.matches(selector))return el;return null}
 querySelector(selector){
  if(selector.startsWith(':scope > '))return this.children.find(c=>c.matches(selector.slice(9)))||null;
  for(const el of this.children){if(el.matches(selector))return el;const found=el.querySelector(selector);if(found)return found}return null;
 }
 setAttribute(name,value){this.attributes[name]=String(value)}
 getAttribute(name){return this.attributes[name]??null}
 removeAttribute(name){delete this.attributes[name]}
 addEventListener(name,handler){this.events[name]=handler}
}
function fixture(){
 const body=new Element('body','auth-ok'),tiles={};
 for(const [id,actor] of [['homeRustamTile','Рустам'],['homeDianaTile','Диана']]){
  const tile=new Element('section','profile-person-card'),head=new Element('div','profile-person-head');
  head.appendChild(new Element('div','score-avatar-wrap'));tile.appendChild(head);
  tile.appendChild(new Element('div','rudi-collapse-body'));tile.dataset.actor=actor;body.appendChild(tile);tiles[id]=tile;
 }
 const events={},document={body,visibilityState:'visible',createElement:tag=>new Element(tag),
  getElementById:id=>tiles[id],addEventListener:(name,handler)=>{events[name]=handler},removeEventListener:name=>{delete events[name]}};
 const clock=Date.parse('2026-10-17T10:20:00Z');
 const context=vm.createContext({document,navigator:{onLine:true},Date:class extends Date{static now(){return clock}},Intl});
 vm.runInContext(source.slice(source.indexOf(' const ACTORS='),source.indexOf(' async function ping'))+`
  lastResponse=Date.now();lastSeen={'Рустам':'2026-10-17T10:16:00Z','Диана':'2026-10-17T10:16:00Z'};
  globalThis.api={open,dismiss,paint,formatDate,onKeyDown,setOnline(actor,value){status[actor]=value},
   clearSeen(actor){lastSeen[actor]=null},expire(){lastResponse=Date.now()-ACTIVE_WINDOW_MS-1}};`,context);
 context.api.paint();return {api:context.api,document,events,tiles};
}
test('each profile reveals one gender-correct Moscow date line inside its own card',()=>{
 const f=fixture();
 for(const [actor,id,prefix] of [['Рустам','homeRustamTile','Был'],['Диана','homeDianaTile','Была']]){
  f.api.open(actor);const line=f.tiles[id].querySelector('.rudi-presence-detail');
  assert.ok(line);assert.equal(line.textContent,prefix+' в сети 17.10 в 13:16');
  assert.equal(line.parentNode,f.tiles[id]);assert.equal(line.children.length,0);
  assert.equal(f.document.body.children.length,2,'No document-wide popup is appended');
  assert.equal(f.tiles[id].querySelector('.rudi-online-dot').getAttribute('aria-expanded'),'true');
 }
});
test('reclick, Escape and outside pointer dismiss without intercepting Tab',()=>{
 const f=fixture();f.api.open('Рустам');f.api.open('Рустам');
 assert.equal(f.tiles.homeRustamTile.querySelector('.rudi-presence-detail'),null);
 f.api.open('Диана');let prevented=false;
 f.api.onKeyDown({key:'Tab',preventDefault(){prevented=true}});assert.equal(prevented,false);
 f.api.onKeyDown({key:'Escape',preventDefault(){prevented=true}});assert.equal(prevented,true);
 assert.equal(f.tiles.homeDianaTile.querySelector('.rudi-presence-detail'),null);
 f.api.open('Рустам');f.events.pointerdown({target:f.document.body});
 assert.equal(f.tiles.homeRustamTile.querySelector('.rudi-presence-detail'),null);
 assert.equal(f.tiles.homeRustamTile.querySelector('.rudi-online-dot').getAttribute('aria-expanded'),'false');
});
test('unknown visits stay short and stale or offline data never gets an online label',()=>{
 const f=fixture();f.api.clearSeen('Диана');f.api.open('Диана');
 assert.equal(f.tiles.homeDianaTile.querySelector('.rudi-presence-detail').textContent,'Нет данных о посещении');
 f.api.setOnline('Диана',true);f.api.paint();
 assert.equal(f.tiles.homeDianaTile.querySelector('.rudi-presence-detail').textContent,'Сейчас в сети');
 f.api.expire();f.api.paint();
 assert.equal(f.tiles.homeDianaTile.querySelector('.rudi-online-dot').classList.contains('is-online'),false);
 assert.equal(f.tiles.homeDianaTile.querySelector('.rudi-presence-detail').textContent,'Нет данных о посещении');
});
test('inline disclosure has no focus trap, overlay style or new request path',()=>{
 const css=fs.readFileSync('public/presence.css','utf8');
 assert.doesNotMatch(source,/\.focus\(|aria-modal|rudi-presence-backdrop|event\.key==='Tab'/);
 assert.match(css,/rudi-presence-detail[\s\S]*?position:static/);
 assert.match(css,/has-presence-detail[\s\S]*?grid-row:3!important/);
 assert.match(source,/rudi:app-tab-change/);
 assert.equal((source.match(/fetch\(/g)||[]).length,1);
});
