'use strict';
// Only the three requested profile values; no diary or AI report is shared.
function partnerBodyMetrics(data={},now=Date.now()){
 const height=Number(data.profile?.height),weight=Number(data.weights?.at(-1)?.kg);
 const birth=String(data.profile?.birthDate||'');let age=null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(birth)&&Number.isFinite(Date.parse(birth+'T12:00:00Z'))&&new Date(birth+'T12:00:00Z').toISOString().slice(0,10)===birth){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const [y,m,d]=today.split('-').map(Number),[by,bm,bd]=birth.split('-').map(Number),years=y-by-(m<bm||m===bm&&d<bd?1:0);
  if(years>0&&years<125)age=years;
 }
 return {height:height>=100&&height<=230?height:null,weight:weight>=25&&weight<=400?weight:null,age};
}
module.exports={partnerBodyMetrics};
