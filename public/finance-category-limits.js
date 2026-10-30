(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RudiFinanceCategoryLimits=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const validMonth=value=>/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(String(value||''));
 function normalize(value){
  const result={};
  for(const [month,raw] of Object.entries(value&&typeof value==='object'?value:{})){
   const amount=Number(raw);
   if(validMonth(month)&&Number.isFinite(amount)&&amount>=0&&amount<=100000000)result[month]=Math.round(amount*100)/100;
  }
  return result;
 }
 function limitForMonth(category,month){
  const schedule=normalize(category?.monthlyLimits);
  const key=Object.keys(schedule).filter(key=>key<=month).sort().pop();
  return key?schedule[key]:Math.max(0,Number(category?.monthlyLimit||0));
 }
 return {normalize,limitForMonth};
});
