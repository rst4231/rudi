'use strict';
// RUDI profile schedules; illustrative rhythms, not measured physical energy.
function phase(actor,date=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const p=Object.fromEntries(parts.filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)])),m=p.hour*60+p.minute;
 if(actor==='Рустам'){if(m<390||m>=1380)return 'Сон';if(m<420)return 'Старт';if(m<480)return 'Разгон';if(m<690)return 'Пик';if(m<750)return 'Пауза';if(m<900)return 'Темп';if(m<960)return 'Спад';if(m<1080)return 'Движ';if(m<1200)return 'Выдох';if(m<1350)return 'Чилл';return 'Тише';}
 if(actor==='Диана'){if(m<480||m>=1320)return 'Сон';if(m<540)return 'Старт';if(m<660)return 'Разгон';if(m<810)return 'Движ';if(m<840)return 'Пауза';if(m<1020)return 'Пик';if(m<1080)return 'Темп';if(m<1110)return 'Спад';if(m<1200)return 'Выдох';if(m<1290)return 'Чилл';return 'Тише';}
 throw Error('rudi-access-denied');
}
module.exports={rhythmPhase:phase,energyScheduleContext:(actor,date)=>({phase:phase(actor,date),kind:'illustrative-daily-routine',notice:'Расчётный ритм по распорядку дня, не измерение энергии'})};
