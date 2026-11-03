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
  globalThis.api={paint,mountProfile,setOnline(actor,value){status[actor]=value},
   clearSeen(actor){lastSeen[actor]=null},expire(){lastResponse=Date.now()-ACTIVE_WINDOW_MS-1}};`,context);
 context.api.paint();return {api:context.api,document,events,tiles};
}
test('avatar indicators remain visible, passive and update without opening visit details',()=>{
 for(const actor of ['Рустам','Диана']){
  const f=fixture();
  const tile=f.tiles[actor==='Рустам'?'homeRustamTile':'homeDianaTile'],dot=tile.querySelector('.rudi-online-dot');
  assert.equal(dot.tagName,'span');assert.equal(dot.getAttribute('role'),'img');assert.equal(dot.getAttribute('aria-expanded'),null);
  dot.events.click({preventDefault(){},stopPropagation(){}});assert.equal(tile.querySelector('.rudi-presence-detail'),null);
  f.api.setOnline(actor,true);f.api.paint();assert.equal(dot.classList.contains('is-online'),true);
  f.api.expire();f.api.paint();assert.equal(dot.classList.contains('is-online'),false);
 }
});
test('partner hero shows live status from the shared heartbeat and retains last visit on expiry',()=>{
 const f=fixture(),person=new Element('div','person');
 const unmount=f.api.mountProfile(person,'Диана');
 const line=person.querySelector('.partner-presence-status');
 assert.ok(line);assert.equal(line.textContent,'Была в сети в 13:16');
 assert.equal(line.getAttribute('role'),'status');
 f.api.setOnline('Диана',true);f.api.paint();
 assert.equal(line.textContent,'Онлайн');assert.ok(line.classList.contains('is-online'));
 f.api.expire();f.api.paint();
 assert.equal(line.textContent,'Была в сети в 13:16');
 assert.equal(line.classList.contains('is-online'),false);
 unmount();assert.equal(person.querySelector('.partner-presence-status'),null);
});
test('partner hero uses the correct actor and clears online status when the viewer loses connection',()=>{
 const f=fixture(),person=new Element('div','person');
 const unmount=f.api.mountProfile(person,'Рустам');
 const line=person.querySelector('.partner-presence-status');
 assert.equal(line.textContent,'Был в сети в 13:16');
 f.api.setOnline('Рустам',true);f.api.paint();assert.equal(line.textContent,'Онлайн');
 f.document.body.dataset.offlineMode='1';f.api.paint();
 assert.equal(line.classList.contains('is-online'),false);
 f.api.clearSeen('Рустам');f.api.paint();assert.equal(line.textContent,'Не в сети');
 unmount();f.api.paint();assert.equal(person.children.length,0);
});
