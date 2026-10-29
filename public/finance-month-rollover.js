(function(root){
'use strict';
function monthKey(at=Date.now()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).formatToParts(new Date(at));
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return values.year+'-'+values.month;
}
function start({controls=[],now=()=>Date.now(),events=typeof window==='object'?window:null,doc=typeof document==='object'?document:null,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const seen=new Map(controls.map(control=>[control,monthKey(now())]));let timer=null,stopped=false;
 function schedule(){
  if(stopped)return;
  clearTimer(timer);const at=now(),[year,month]=monthKey(at).split('-').map(Number);
  // Modern Moscow calendar months begin at 21:00 UTC on the previous day.
  const boundary=Date.UTC(year,month,1)-3*3600000;
  timer=setTimer(check,Math.max(50,Math.min(86400000,boundary-at+50)));
 }
 function check(){
  if(stopped)return;
  const current=monthKey(now());
  for(const control of controls){
   const previous=seen.get(control);if(previous===current)continue;
   const value=String(control.get()||'');
   if(value===previous||!value){
    if(control.canChange&&!control.canChange())continue;
    control.set(current);
   }
   seen.set(control,current);
  }
  schedule();
 }
 for(const event of ['pageshow','rudi:app-tab-change'])events?.addEventListener?.(event,check);
 doc?.addEventListener?.('visibilitychange',check);schedule();
 return {check,stop(){stopped=true;clearTimer(timer);for(const event of ['pageshow','rudi:app-tab-change'])events?.removeEventListener?.(event,check);doc?.removeEventListener?.('visibilitychange',check)}};
}
const api={monthKey,start};if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiFinancePeriod=api;
})(typeof window==='object'?window:globalThis);
