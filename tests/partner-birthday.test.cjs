const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/partner-profile.js'),'utf8');
const start=source.indexOf(' function birthdayInfo('),end=source.indexOf(' function addBirthday(',start);
const ctx={Intl,Date};vm.createContext(ctx);if(start>=0)vm.runInContext(source.slice(start,end),ctx);
test('partner birthdays select the next calendar occurrence in Moscow',()=>{
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-10-23T12:00:00Z')).days,250);
 assert.equal(ctx.birthdayInfo('Рустам',new Date('2026-10-23T12:00:00Z')).days,131);
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-06-29T20:59:59Z')).days,1);
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-06-29T21:00:00Z')).days,0);
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-07-01T12:00:00Z')).days,364);
 assert.equal(ctx.birthdayInfo('Рустам',new Date('2028-03-02T12:00:00Z')).days,1);
 assert.equal(ctx.birthdayInfo('Рустам',new Date('2028-03-03T12:00:00Z')).days,0);
 assert.equal(ctx.birthdayInfo('Рустам',new Date('2028-03-04T12:00:00Z')).days,364);
});
test('countdown uses correct Russian day forms and date labels',()=>{
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-06-29T12:00:00Z')).unit,'день');
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-06-28T12:00:00Z')).unit,'дня');
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-06-19T12:00:00Z')).unit,'дней');
 assert.equal(ctx.birthdayInfo('Диана',new Date('2026-06-09T12:00:00Z')).unit,'день');
 assert.equal(ctx.birthdayInfo('Диана').date,'30 июня');assert.equal(ctx.birthdayInfo('Рустам').date,'3 марта');
});
