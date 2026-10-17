const {test}=require('node:test');
const assert=require('node:assert/strict');
const {expiresAfterTwoMonths,archiveCompletedTask,readCompletedTasks,forgetCompletedTask}=require('../api/completed-task-history.cjs');
function fixture(){const rows=new Map();return{rows,client:{async setIfAbsent(ns,key,value,opts){if(!rows.has(ns+key))rows.set(ns+key,{namespace:ns,key,value,opts});},async list(ns){return [...rows.values()].filter(r=>r.namespace===ns);},async remove(ns,key){rows.delete(ns+key);}}};}
test('two calendar months clamp the day and preserve time',()=>{
 assert.equal(expiresAfterTwoMonths('2026-12-31T20:00:00.000Z'),'2027-02-28T20:00:00.000Z');
 assert.equal(expiresAfterTwoMonths('2026-10-17T20:00:00.000Z'),'2026-12-17T20:00:00.000Z');
});
test('completion archive is private, idempotent and expires without touching active tasks',async()=>{
 const {client,rows}=fixture(),task={id:'a',projectId:'p',title:'Дело',startDate:'2026-10-17T09:00:00+0300'};
 await archiveCompletedTask('Рустам',task,{client,now:'2026-10-17T20:00:00Z'});
 await archiveCompletedTask('Рустам',task,{client,now:'2026-10-18T20:00:00Z'});
 assert.equal(rows.size,1);
 assert.equal((await readCompletedTasks('Диана',{client})).length,0);
 const found=await readCompletedTasks('Рустам',{client,now:'2026-12-17T19:59:59Z'});
 assert.equal(found.length,1);assert.equal(found[0].startTime,'09:00');
 assert.equal((await readCompletedTasks('Рустам',{client,now:'2026-12-17T20:00:00Z'})).length,0);
 assert.equal(rows.size,1);
 await forgetCompletedTask('Рустам',task,{client});assert.equal(rows.size,0);
});
test('recurring completions preserve separate dates and undo removes only its occurrence',async()=>{
 const {client,rows}=fixture(),task={id:'a',projectId:'p',title:'Дело',startDate:'2026-10-17T09:00:00+0300'};
 await archiveCompletedTask('Рустам',task,{client});
 await archiveCompletedTask('Рустам',{...task,startDate:'2026-10-18T09:00:00+0300'},{client});
 await forgetCompletedTask('Рустам',task,{client});assert.equal(rows.size,1);
});
