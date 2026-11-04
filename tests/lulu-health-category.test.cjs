'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('current health card belongs at the bottom of Health and retains its text, listener and focus after a care refresh',()=>{
 const dom=new JSDOM('<section class="lulu-profile-page"><div class="partner-profile-layout"><section class="lulu-profile-health"><h2>Здоровье</h2><textarea id="luluHealthText">Проблема</textarea></section><div class="lulu-care-root"></div></div></section>',{runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.eval(fs.readFileSync('public/lulu-care.js','utf8'));
 const root=w.document.querySelector('.lulu-care-root'),health=w.document.querySelector('.lulu-profile-health'),input=health.querySelector('textarea');let changes=0;input.oninput=()=>changes++;
 const dispose=w.RudiLuluCare.mount(root,{actor:'Рустам',request:()=>new Promise(()=>{})});
 try{
  assert.equal(health.parentNode,root);assert.equal(health.previousElementSibling.classList.contains('lulu-care-prevention'),true);assert.equal(health.nextElementSibling.textContent,'Уход');
  input.value='Новый текст';input.dataset.dirty='1';input.focus();input.setSelectionRange(2,5);
  w.dispatchEvent(new w.Event('focus'));
  assert.equal(w.document.querySelector('#luluHealthText'),input);assert.equal(input.value,'Новый текст');assert.equal(input.dataset.dirty,'1');assert.equal(w.document.activeElement,input);assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,5);
  input.dispatchEvent(new w.Event('input'));assert.equal(changes,1);assert.equal(root.querySelectorAll('.lulu-profile-health').length,1);
 }finally{dispose();w.close()}
});
