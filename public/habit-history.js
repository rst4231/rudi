(function(root){
'use strict';
const shift=(date,offset)=>new Date(Date.parse(date+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
const dateLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'});
function days({habit,history=[],today,overrides={}}){
 const known=new Map(history.map(row=>[row.date,row.status]));
 const created=habit?.createdAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(habit.createdAt)):'';
 return Array.from({length:30},(_,i)=>{const date=shift(today,i-29),status=overrides[date]||known.get(date);return{date,status:['done','notdone','inactive'].includes(status)?status:created&&date<created?'inactive':'pending'}});
}
function render(options,doc=document){
 const rows=days(options),make=(tag,cls,text)=>{const node=doc.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node};
 const panel=make('section','habit-history');panel.id='habit-history-'+options.habit.id;panel.setAttribute('aria-label','История привычки '+options.habit.name+' за 30 дней');
 const head=make('div','habit-history-heading');head.append(make('strong','','Последние 30 дней'),make('span','',dateLabel(rows[0].date)+' — '+dateLabel(options.today)));panel.append(head);
 const grid=make('div','habit-history-grid');grid.setAttribute('role','list');
 for(const name of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']){const el=make('span','habit-history-weekday',name);el.setAttribute('aria-hidden','true');grid.append(el)}
 const offset=(new Date(rows[0].date+'T12:00:00Z').getUTCDay()+6)%7;
 for(let i=0;i<offset;i++){const blank=make('span','habit-history-blank');blank.setAttribute('aria-hidden','true');grid.append(blank)}
 const labels={done:'Выполнено',notdone:'Не выполнено',pending:'Нет отметки',inactive:'Привычка неактивна'};
 for(const row of rows){
  const cell=make('div','habit-history-day is-'+row.status+(row.date===options.today?' is-today':''));cell.dataset.date=row.date;cell.setAttribute('role','listitem');cell.setAttribute('aria-label',dateLabel(row.date)+': '+labels[row.status]);cell.title=dateLabel(row.date)+': '+labels[row.status];
  cell.append(make('b','',String(Number(row.date.slice(8)))),make('span','habit-history-mark',row.status==='done'?'✓':row.status==='notdone'?'×':'·'));grid.append(cell);
 }
 panel.append(grid);
 const legend=make('div','habit-history-legend');for(const status of ['done','notdone','pending'])legend.append(make('span','is-'+status,labels[status]));panel.append(legend);
 return panel;
}
const api={days,render};if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiHabitHistory=api;
})(typeof window==='object'?window:globalThis);
