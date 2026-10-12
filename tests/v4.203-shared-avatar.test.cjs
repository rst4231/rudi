'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

function avatarHarness(){
  const begin=app.indexOf('      const sharedAgendaActorPhotos={rustam:');
  const end=app.indexOf('      function setWishlistProfile(',begin);
  assert.ok(begin>0&&end>begin,'profile photo helpers remain inside app code');
  const actors={rustam:[],diana:[]};
  const document={
    querySelectorAll(selector){
      const actor=selector.includes('data-person="rustam"')?'rustam':selector.includes('data-person="diana"')?'diana':null;
      return actor?actors[actor]:[];
    }
  };
  const helpers=Function('document',app.slice(begin,end)+'return {setSharedAgendaAvatarPhoto,updateSharedAgendaAvatarPhoto};')(document);
  function holder(person){
    const classes=new Set();
    const img={
      srcValue:'',complete:false,naturalWidth:0,onload:null,onerror:null,
      getAttribute(name){return name==='src'?this.srcValue||null:null;},
      removeAttribute(name){if(name==='src')this.srcValue='';},
      set src(value){this.srcValue=value;this.complete=false;this.naturalWidth=0;},
      get src(){return this.srcValue;}
    };
    const element={
      dataset:{person},classList:{add(name){classes.add(name)},remove(name){classes.delete(name)},contains(name){return classes.has(name)}},
      querySelector(selector){return selector==='.shared-agenda-avatar-photo'?img:null;},
      img
    };
    actors[person].push(element);
    return element;
  }
  return {...helpers,holder};
}

test('newly rendered task gets saved profile image without extra fetch',()=>{
  const dom=avatarHarness();
  const originalFetchReferences=(app.match(/managedJsonRequest\(/g)||[]).length;
  dom.setSharedAgendaAvatarPhoto('Рустам',{photoDataUrl:'data:image/png;base64,QUJD'});
  const h=dom.holder('rustam');
  dom.updateSharedAgendaAvatarPhoto(h);
  assert.equal(h.img.src,'data:image/png;base64,QUJD');
  assert.equal(h.classList.contains('has-photo'),false,'initials remain while loading');
  h.img.complete=true;h.img.naturalWidth=80;
  h.img.onload();
  assert.equal(h.classList.contains('has-photo'),true,'photograph is shown after load');
  assert.ok(originalFetchReferences>0);
});

test('live profile changes refresh existing tasks and preserve another person',()=>{
  const dom=avatarHarness();
  const rustam=dom.holder('rustam'),diana=dom.holder('diana');
  dom.setSharedAgendaAvatarPhoto('Рустам',{photoDataUrl:'data:image/png;base64,AAAA'});
  dom.setSharedAgendaAvatarPhoto('Диана',{photoDataUrl:'data:image/png;base64,BBBB'});
  assert.match(rustam.img.src,/AAAA$/);
  assert.match(diana.img.src,/BBBB$/);
  rustam.img.complete=true;rustam.img.naturalWidth=32;rustam.img.onload();
  diana.img.complete=true;diana.img.naturalWidth=32;diana.img.onload();
  assert.ok(rustam.classList.contains('has-photo'));
  assert.ok(diana.classList.contains('has-photo'));
  dom.setSharedAgendaAvatarPhoto('Рустам',{photoDataUrl:'data:image/png;base64,CCCC'});
  assert.match(rustam.img.src,/CCCC$/);
  assert.equal(rustam.classList.contains('has-photo'),false,'old photo hidden while replacing');
  assert.equal(diana.classList.contains('has-photo'),true,'Diana stays intact');
  dom.setSharedAgendaAvatarPhoto('Рустам',null);
  assert.equal(rustam.img.getAttribute('src'),null);
  assert.equal(rustam.classList.contains('has-photo'),false,'fallback initials visible with no photo');
});

test('broken photo keeps initials and photos are sourced from existing profiles',()=>{
  const dom=avatarHarness();
  const diana=dom.holder('diana');
  dom.setSharedAgendaAvatarPhoto('Диана',{photoDataUrl:'data:image/png;base64,broken'});
  diana.img.onerror();
  assert.equal(diana.classList.contains('has-photo'),false);
  assert.match(app,/setWishlistProfile\('Рустам',rustamProfile\)/);
  assert.match(app,/setWishlistProfile\('Диана',dianaProfile\)/);
  assert.match(app,/setSharedAgendaAvatarPhoto\(actor,profile\)/);
  assert.match(app,/photo\.className='shared-agenda-avatar-photo'/);
  assert.match(css,/\.shared-agenda-avatar\.has-photo \.shared-agenda-avatar-photo/);
  assert.match(css,/object-fit:cover/);
});
