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
// Mood comparison counts *recorded purchases*, not inferred no-spend days.
function moodPolarityByDay(rows,through){
 const groups=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
  const day=fixedDay(row?.date);if(!day||day>through)continue;
  const samples=(Array.isArray(row.samples)?row.samples:[]).map(x=>x?.mood).filter(x=>MOODS.has(x));
  const emotions=samples.length?samples:MOODS.has(row.mood)?[row.mood]:[];
  const positive=emotions.filter(x=>x==='joy'||x==='love').length;
  const negative=emotions.filter(x=>NEGATIVE.has(x)).length;
  if(!emotions.length)continue;
  if(positive/emotions.length>=.6)groups.set(day,'positive');
  else if(negative/emotions.length>=.6)groups.set(day,'negative');
 }
 return groups;
}
function median(values){
 if(!values.length)return null;
 const sorted=values.slice().sort((a,b)=>a-b),n=sorted.length,mid=Math.floor(n/2);
 return n%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function moodSpendingFindings(moodHistory,spending,through){
 const polarity=moodPolarityByDay(moodHistory,through);
 const group={positive:[],negative:[]};
 for(const [day,mood] of polarity)group[mood].push({day,record:spending.get(day)||null});
 const good=group.positive,bad=group.negative;
 const all=[...good,...bad],results=[];
 // At least eight observations of EACH mood across >=21 days.
 if(good.length<8||bad.length<8||spanDays(all)<21)return results;
 const goodSpend=good.filter(x=>x.record),badSpend=bad.filter(x=>x.record);
 // Relative share of days WITH an expense record, not spending frequency.
 // Require multiple observations for each mood so gaps do not masquerade as savings.
 if(goodSpend.length>=4&&badSpend.length>=4){
  const rateGood=Math.round(goodSpend.length/good.length*100);
  const rateBad=Math.round(badSpend.length/bad.length*100);
  if(Math.abs(rateGood-rateBad)>=25){
   results.push({kind:'mood-spending-coverage',title:'Настроение и частота записей расходов',
    daysA:good.length,daysB:bad.length,spanDays:spanDays(all),percentA:rateGood,percentB:rateBad,
    text:'В дни с преимущественно позитивным настроением расходы записаны в '+goodSpend.length+' из '+good.length+' дней ('+rateGood+'%), с негативным — в '+badSpend.length+' из '+bad.length+' ('+rateBad+'%). Отсутствие записи не доказывает отсутствие трат.',
    interpretation:'Сравнивается частота записей, а не фактическая частота покупок; причинная связь не установлена.'});
  }
 }
 // Amounts are compared ONLY among days with actual recorded expenses.
 if(sampleEvidence(goodSpend,badSpend)){
  const goodMedian=median(goodSpend.map(x=>x.record.sum));
  const badMedian=median(badSpend.map(x=>x.record.sum));
  if(Math.abs(goodMedian-badMedian)>=Math.max(150,Math.min(goodMedian,badMedian)*.25)){
   results.push({kind:'mood-spending-amount',title:'Настроение и размер расходов',
    daysA:goodSpend.length,daysB:badSpend.length,spanDays:spanDays([...goodSpend,...badSpend]),
    medianA:Math.round(goodMedian),medianB:Math.round(badMedian),
    text:'В дни с записанными расходами медианная сумма при позитивном настроении — '+Math.round(goodMedian)+' ₽ ('+goodSpend.length+' дней), при негативном — '+Math.round(badMedian)+' ₽ ('+badSpend.length+' дней).',
    interpretation:'Сравниваются только дни с подтверждёнными расходами; различие не доказывает влияние настроения.'});
  }
  // Look for one clearly distinct, recorded spending category.
  const categories=new Set([...goodSpend,...badSpend].flatMap(x=>Object.keys(x.record.categories||{})));
  let strongest=null;
  for(const name of categories){
   if(name==='Без категории')continue;
   const a=goodSpend.filter(x=>x.record.categories?.[name]).length;
   const b=badSpend.filter(x=>x.record.categories?.[name]).length;
   if(a+b<4)continue;
   const pa=Math.round(a/goodSpend.length*100),pb=Math.round(b/badSpend.length*100),delta=Math.abs(pa-pb);
   if(delta>=35&&(!strongest||delta>strongest.delta))strongest={name,a,b,pa,pb,delta};
  }
  if(strongest){
   const x=strongest;
   results.push({kind:'mood-spending-category',title:'Настроение и категории расходов',daysA:goodSpend.length,daysB:badSpend.length,spanDays:spanDays([...goodSpend,...badSpend]),
    text:'Категория «'+x.name+'» встречалась в '+x.a+' из '+goodSpend.length+' дней с позитивным настроением и записанными расходами ('+x.pa+'%) и в '+x.b+' из '+badSpend.length+' таких дней с негативным ('+x.pb+'%).',
    interpretation:'Сопоставление записанных категорий, а не доказательство влияния настроения.'});
  }
 }
 return results;
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
 const findings=moodSpendingFindings(moodHistory,spending,date);
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
 findings.sort((a,b)=>Number(b.kind.startsWith('mood-spending'))-Number(a.kind.startsWith('mood-spending'))||(b.daysA+b.daysB)-(a.daysA+a.daysB));
 const gaps=[];
 if(!moods.size)gaps.push('Не хватает датированных эмоций.');
 if(!spending.size)gaps.push('Не хватает датированных расходов.');
 if(!habitDays.length)gaps.push('Нет подтверждённых результатов привычек по датам.');
 if(!calendar)gaps.push(actor==='Рустам'?'Нет истории завершённых задач TickTick: связь нагрузки с расходами пока не вычисляется.':'Не хватает достоверной истории рабочего календаря.');
 return {method:'observed-paired-days-v1',actor,date,coverage:{moodDays:moods.size,expenseDays:spending.size,habitStatusDays:new Set(habitDays.flatMap(x=>[...x.states.keys()])).size,calendarDays:calendar?.size||0,symptomOnsetDays:symptomDays.size,historicalCompletedTaskDays:0},
  findings:findings.slice(0,5),gaps:gaps.slice(0,4),disclaimer:'Наблюдения — статистические совпадения в записанных данных, не доказательство причины. Неполные дни не считаются днями без расходов, эмоций или задач.'};
}
module.exports={analyzeConnections,moodByDay,moodPolarityByDay,moodSpendingFindings,spendingByDay,habitStatus,workdaysByDate,sampleEvidence};
