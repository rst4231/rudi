// Lightweight, delegated gestures and iOS resume stabilization. No extra network calls.
(function(){
 'use strict';
 let previousTab='',previousAt=0,resumeTimer=0;
 const DOUBLE_TAP_MS=400;
 function scrollTabToTop(tab){
   const section=document.querySelector('[data-app-tab-section="'+tab+'"]:not([hidden])');
   const behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
   const candidates=[document.scrollingElement,document.querySelector('.shell'),section];
   if(section){
     candidates.push(...section.querySelectorAll('*'));
   }
   let scrolled=false;
   for(const node of candidates){
     if(!node||!node.isConnected||node.scrollTop<=2)continue;
     if(node!==document.scrollingElement){
       const style=window.getComputedStyle(node);
       if(!/auto|scroll|overlay/.test(style.overflowY))continue;
       if(node.scrollHeight<=node.clientHeight+2)continue;
     }
     node.scrollTo({top:0,behavior});scrolled=true;
   }
   if(!scrolled)window.scrollTo({top:0,behavior});
 }
 document.addEventListener('click',event=>{
   const tabButton=event.target.closest?.('#appTabBar .app-tab-button[data-app-tab]');
   if(!tabButton||event.detail===0)return;
   const tab=tabButton.dataset.appTab||'';
   const now=Date.now();
   const doubleTap=tab===previousTab&&(now-previousAt)<=DOUBLE_TAP_MS;
   previousTab=tab;previousAt=now;
   if(!doubleTap||document.body.dataset.appTab!==tab)return;
   event.preventDefault();event.stopImmediatePropagation();
   scrollTabToTop(tab);
 },true);
 function stabilize(){
   document.documentElement.dataset.rudiResuming='1';
   clearTimeout(resumeTimer);
   resumeTimer=setTimeout(()=>{delete document.documentElement.dataset.rudiResuming},480);
 }
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='visible')stabilize();
   else{previousTab='';previousAt=0}
 });
 window.addEventListener('pageshow',event=>{
   if(event.persisted)stabilize();
 });
})();
