'use strict';
// Cross-source observations are computed ONCE at scheduled report time, not on page opening.
// Paired dates, minimum evidence, incomplete-day controls and actor isolation prevent false claims.
const VALID_DATE=/^\d{4}-\d{2}-\d{2}$/;
const NEGATIVE=new Set(['sadness','boredom','fatigue','anger']);
const MOODS=new Set([...NEGATIVE,'joy','love','neutral']);
const dateKey=raw=>{
 const ms=Date.parse(String(raw||''));if(!Number.isFinite(ms))return '';
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
};
const fixedDay=v=>VALID_DATE.test(String(v||''))?String(v):'';
const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const rounded=v=>Math.round(v*10)/10;
const spanDays=rows=>{const ds=rows.map(x=>x.day).sort();return ds.length<2?0:Math.round((Date.parse(ds.at(-1))-Date.parse(ds[0]))/86400000)};
function sampleEvidence(groupA,groupB){
 return groupA.length>=6&&groupB.length>=6&&spanDays([...groupA,...groupB])>=21;
}
function moodByDay(rows,through){
 const result=new Map();
 for(const v of Array.isArray(rows)?rows:[]){
  const day=fixedDay(v.date);if(!day||day>through)continue;
  const samples=(Array.isArray(v.samples)?v.samples:[]).filter(x=>MOODS.has(x?.mood));
  const entries=samples.length?samples.map(x=>x.mood):MOODS.has(v.mood)?[v.mood]:[];
  if(entries.length)result.set(day,rounded(100*entries.filter(x=>NEGATIVE.has(x)).length/entries.length));
 }
 return result;
}
function spendingByDay(finances,actor,through){
 const categories=new Map((finances?.categories?.[actor]||[]).map(x=>[x.id,String(x.name||'').slice(0,50)]));
 const days=new Map();
 for(const row of Array.isArray(finances?.personalExpenses)?finances.personalExpenses:[]){
  if(row?.actor!==actor||row.manualAdjustment)continue;
  const day=dateKey(row.occurredAt||row.createdAt);if(!day||day>through)continue;
  const sum=Number(row.rubAmount??row.amount);if(!Number.isFinite(sum)||sum<=0)continue;
  const category=categories.get(row.categoryId)||'Без категории';
  const item=days.get(day)||{sum:0,categories:{}};
  item.sum+=sum;item.categories[category]=(item.categories[category]||0)+sum;
  days.set(day,item);
 }
 return days;
}
function habitStatus(habits,through){
 const all=Array.isArray(habits?.habits)?habits.habits:[];
 const dates=[...new Set([...Object.keys(habits?.completions||{}),...Object.keys(habits?.failures||{}),...Object.keys(habits?.finalizedDates||{})])];
 return all.map(habit=>{
  const first=String(habit.createdAt||'').slice(0,10),last=String(habit.archivedAt||'').slice(0,10),states=new Map();
  for(const day of dates){
   if(!fixedDay(day)||day>through||(fixedDay(first)&&day<first)||(fixedDay(last)&&day>last))continue;
   const done=(habits.completions?.[day]||[]).includes(habit.id);
   const failed=(habits.failures?.[day]||[]).includes(habit.id);
   if(done||failed||habits.finalizedDates?.[day])states.set(day,done);
  }
  return {name:String(habit.name||'Привычка').slice(0,70),states};
 }).filter(x=>x.states.size);
}
function workdaysByDate(calendar,through){
 if(!calendar?.configured||calendar.stale||!Array.isArray(calendar.days))return null;
 return new Map(calendar.days.filter(x=>fixedDay(x.date)&&x.date<=through).map(x=>[x.date,(x.events||[]).length]));
}
function pushDifference(findings,kind,title,yes,no,minDelta,formatter){
 if(!sampleEvidence(yes,no))return;
 const avgYes=mean(yes.map(x=>x.value)),avgNo=mean(no.map(x=>x.value));
 if(avgYes===null||avgNo===null||Math.abs(avgYes-avgNo)<minDelta)return;
 findings.push({kind,title,daysA:yes.length,daysB:no.length,spanDays:spanDays([...yes,...no]),averageA:rounded(avgYes),averageB:rounded(avgNo),
  text:formatter(rounded(avgYes),rounded(avgNo)),interpretation:'Совпадение по датам; причинная связь не установлена.'});
}
function analyzeConnections({actor,date,finances,habits,moodHistory,symptoms,workCalendar}={}){
 if(!['Рустам','Диана'].includes(actor)||!fixedDay(date))throw Error('invalid-cross-section-context');
 const moods=moodByDay(moodHistory,date),spending=spendingByDay(finances,actor,date),habitDays=habitStatus(habits,date);
 const calendar=actor==='Диана'?workdaysByDate(workCalendar,date):null;
 const findings=[];
 for(const habit of habitDays){
  const done=[],miss=[];
  for(const [day,success] of habit.states){
   if(!moods.has(day))continue;
   (success?done:miss).push({day,value:moods.get(day)});
  }
  pushDifference(findings,'habit-mood',habit.name,done,miss,18,(a,b)=>
    'При выполнении «'+habit.name+'» негативные отметки составляли '+a+'%, при подтверждённом невыполнении — '+b+'%.');
  const spent=[],unspent=[];
  for(const [day,success] of habit.states){
   const record=spending.get(day);if(!record)continue; // missing expenses != zero expenses
   (success?spent:unspent).push({day,value:record.sum});
  }
  const baseline=mean(unspent.map(x=>x.value));
  if(baseline)pushDifference(findings,'habit-expenses',habit.name,spent,unspent,Math.max(150,baseline*.3),(a,b)=>
    'Средние зарегистрированные расходы: '+Math.round(a)+' ₽ в дни выполнения «'+habit.name+'» и '+Math.round(b)+' ₽ в дни подтверждённого невыполнения.');
 }
 const names=new Set([...spending.values()].flatMap(x=>Object.keys(x.categories)));
 for(const name of [...names].slice(0,25)){
  const yes=[],no=[];
  for(const [day,record] of spending){
   if(!moods.has(day))continue;
   (record.categories[name]?yes:no).push({day,value:moods.get(day)});
  }
  pushDifference(findings,'expense-mood',name,yes,no,18,(a,b)=>
    'В дни с расходами категории «'+name+'» негативных отметок '+a+'%, в другие дни с записанными расходами — '+b+'%.');
 }
 if(calendar){
  const yes=[],no=[];
  for(const [day,events] of calendar){
   const record=spending.get(day);if(!record)continue;
   (events>0?yes:no).push({day,value:record.sum});
  }
  const baseline=mean(no.map(x=>x.value));
  if(baseline)pushDifference(findings,'calendar-expenses','Рабочие события календаря',yes,no,Math.max(150,baseline*.3),(a,b)=>
    'В дни с рабочими событиями календаря зарегистрировано в среднем '+Math.round(a)+' ₽ расходов, в дни без событий — '+Math.round(b)+' ₽.');
 }
 // A symptom entry is evidence only for its onset day, NOT proof of symptom-free other days.
 const symptomDays=new Set((Array.isArray(symptoms)?symptoms:[]).map(x=>dateKey(x.startedAt)).filter(x=>x&&x<=date));
 const overlap=[...symptomDays].filter(x=>moods.has(x));
 if(overlap.length>=6&&spanDays(overlap.map(day=>({day})))>=21){
  findings.push({kind:'symptom-mood',title:'Симптомы и эмоции',daysA:overlap.length,daysB:0,
   text:'На '+overlap.length+' датах записаны и симптомы, и настроение. Дней без симптомов определить нельзя.',
   interpretation:'Совпадение дат — не свидетельство о причине симптомов.'});
 }
 findings.sort((a,b)=>(b.daysA+b.daysB)-(a.daysA+a.daysB));
 const gaps=[];
 if(!moods.size)gaps.push('Не хватает датированных эмоций.');
 if(!spending.size)gaps.push('Не хватает датированных расходов.');
 if(!habitDays.length)gaps.push('Нет подтверждённых результатов привычек по датам.');
 if(!calendar)gaps.push(actor==='Рустам'?'Нет истории завершённых задач TickTick: связь нагрузки с расходами пока не вычисляется.':'Не хватает достоверной истории рабочего календаря.');
 return {method:'observed-paired-days-v1',actor,date,coverage:{moodDays:moods.size,expenseDays:spending.size,habitStatusDays:new Set(habitDays.flatMap(x=>[...x.states.keys()])).size,calendarDays:calendar?.size||0,symptomOnsetDays:symptomDays.size,historicalCompletedTaskDays:0},
  findings:findings.slice(0,5),gaps:gaps.slice(0,4),disclaimer:'Наблюдения — статистические совпадения в записанных данных, не доказательство причины. Неполные дни не считаются днями без расходов, эмоций или задач.'};
}
module.exports={analyzeConnections,moodByDay,spendingByDay,habitStatus,workdaysByDate,sampleEvidence};
