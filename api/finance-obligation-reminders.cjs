const { readFinanceState, viewState } = require('./finance-store.cjs');
const { moscowDateKey } = require('./feed-store.cjs');

const ACTORS = ['Рустам','Диана'];

function rub(value){
  return new Intl.NumberFormat('ru-RU',{
    style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2,
  }).format(Number(value)||0);
}

function monthAndDay(now = new Date()){
  const date = moscowDateKey(now);
  const match = String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return {date:'',month:'',day:0,daysInMonth:31};
  const year=Number(match[1]),monthNumber=Number(match[2]),day=Number(match[3]);
  const daysInMonth=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  return {date,month:match[1]+'-'+match[2],day,daysInMonth};
}

function dueObligations(plan, now = new Date()){
  const {month,day,daysInMonth}=monthAndDay(now);
  const rows=Array.isArray(plan?.obligations)?plan.obligations:[];
  return rows
    .filter(row=>row?.active!==false)
    .map(row=>{
      const dueDay=Math.min(Math.max(1,Number(row?.day||1)),daysInMonth);
      const paid=Array.isArray(row?.paidMonths)&&row.paidMonths.includes(month);
      return {
        id:String(row?.id||''),
        title:String(row?.title||'Платёж'),
        amount:Number(row?.amount||0),
        dueDay,
        paid,
      };
    })
    .filter(row=>row.dueDay===day);
}

async function loadDueObligationsByActor(options = {}){
  const now=options.now instanceof Date?options.now:new Date(options.now||Date.now());
  const read=options.readFinanceStateImpl||readFinanceState;
  const state=await read(options).catch(()=>null);
  const result={};
  for(const actor of ACTORS){
    try{
      const view=state?viewState(state,actor):null;
      result[actor]=dueObligations(view?.plan||{},now);
    }catch(_){
      result[actor]=[];
    }
  }
  return result;
}

function morningObligationBlock(rows){
  const due=Array.isArray(rows)?rows:[];
  if(!due.length)return '';
  return '💳 <b>Обязательные платежи сегодня</b>\n'
    + due.map(row=>'• '+(row.paid?'✅ ':'○ ')+String(row.title||'Платёж')+' · '+rub(row.amount)).join('\n');
}

function eveningObligationPart(rows){
  const pending=(Array.isArray(rows)?rows:[]).filter(row=>!row.paid);
  if(!pending.length)return '';
  const visible=pending.slice(0,3).map(row=>String(row.title||'Платёж')+' '+rub(row.amount));
  const extra=pending.length>visible.length?' + ещё '+(pending.length-visible.length):'';
  return 'Платежи: '+visible.join(', ')+extra;
}

module.exports={
  ACTORS,
  rub,
  monthAndDay,
  dueObligations,
  loadDueObligationsByActor,
  morningObligationBlock,
  eveningObligationPart,
};
