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
 after(el){const parent=this.parentNode;el.parentNode=parent;parent.children.splice(parent.children.indexOf(this)+1,0,el)}
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
  const person=new Element('div','person');person.appendChild(new Element('div','profile-name-row'));
  head.appendChild(new Element('div','score-avatar-wrap'));head.appendChild(person);tile.appendChild(head);
  tile.appendChild(new Element('div','rudi-collapse-body'));tile.dataset.actor=actor;body.appendChild(tile);tiles[id]=tile;
 }
 const events={},document={body,visibilityState:'visible',createElement:tag=>new Element(tag),
  getElementById:id=>tiles[id],addEventListener:(name,handler)=>{events[name]=handler},removeEventListener:name=>{delete events[name]}};
 let clock=Date.parse('2026-10-17T10:20:00Z');
 const context=vm.createContext({document,navigator:{onLine:true},Date:class extends Date{static now(){return clock}},Intl});
 vm.runInContext(source.slice(source.indexOf(' const ACTORS='),source.indexOf(' async function ping'))+`
  lastResponse=Date.now();lastSeen={'Рустам':'2026-10-17T10:16:00Z','Диана':'2026-10-17T10:16:00Z'};
  globalThis.api={paint,mountProfile,setOnline(actor,value){status[actor]=value},setSeen(actor,value){lastSeen[actor]=value},
   expire(){lastResponse=Date.now()-ACTIVE_WINDOW_MS-1}};`,context);
 context.api.paint();return {api:context.api,document,context,events,tiles,advance(ms){clock+=ms}};
}
function line(f,id='homeDianaTile'){return f.tiles[id].querySelector('.home-presence-status')}
test('both home cards show a persistent last visit without an avatar dot or calendar date',()=>{
 const f=fixture();
 assert.equal(line(f,'homeRustamTile')?.textContent,'Был в сети в 13:16');
 assert.equal(line(f)?.textContent,'Была в сети в 13:16');
 for(const tile of Object.values(f.tiles))assert.equal(tile.querySelector('.rudi-online-dot'),null);
});
test('online label expires and preserves last visit, including when the viewer goes offline',()=>{
 const f=fixture();f.api.setOnline('Диана',true);f.api.paint();
 assert.equal(line(f).textContent,'Онлайн');assert.ok(line(f).classList.contains('is-online'));
 f.api.expire();f.api.paint();assert.equal(line(f).textContent,'Была в сети в 13:16');
 f.api.setOnline('Рустам',true);f.document.body.dataset.offlineMode='1';f.api.paint();
 assert.equal(line(f,'homeRustamTile').classList.contains('is-online'),false);
});
test('older visits distinguish yesterday and earlier days without implying a visit today',()=>{
 const f=fixture();f.advance(86400000);f.api.paint();assert.equal(line(f).textContent,'Была в сети вчера в 13:16');
 f.advance(86400000);f.api.paint();assert.equal(line(f).textContent,'Была в сети 2 дн. назад');
 f.api.setSeen('Диана',null);f.api.paint();assert.equal(line(f).textContent,'Не в сети');
 f.api.setSeen('Диана','invalid');f.api.paint();assert.equal(line(f).textContent,'Не в сети');
 f.api.setSeen('Диана','2030-01-01T00:00:00Z');f.api.paint();assert.equal(line(f).textContent,'Не в сети');
});
test('repeated paints and replacement of home nodes do not duplicate status lines',()=>{
 const f=fixture();for(let i=0;i<5;i++)f.api.paint();
 const person=f.tiles.homeDianaTile.querySelector('.person');assert.equal(person.children.length,2);
 const old=line(f);old.remove();f.api.paint();assert.ok(line(f));assert.notEqual(line(f),old);
});
test('partner page uses the same heartbeat and unmounts without losing the home status',()=>{
 const f=fixture(),person=new Element('div','person');
 const unmount=f.api.mountProfile(person,'Диана'),status=person.querySelector('.partner-presence-status');
 assert.equal(status.textContent,'Была в сети в 13:16');assert.equal(status.getAttribute('role'),'status');
 f.api.setOnline('Диана',true);f.api.paint();assert.equal(status.textContent,'Онлайн');assert.equal(line(f).textContent,'Онлайн');
 unmount();f.api.paint();assert.equal(person.children.length,0);assert.ok(line(f));
});
test('late home data uses existing events and exactly one authenticated request path',()=>{
 assert.equal((source.match(/fetch\(/g)||[]).length,1);
 assert.match(source,/rudi:profile-ready/);assert.match(source,/rudi:home-tiles-ready/);
 assert.doesNotMatch(source,/createElement\('button'\)|aria-modal|rudi-presence-backdrop/);
});
