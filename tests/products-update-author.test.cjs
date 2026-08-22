const test=require('node:test');
const assert=require('node:assert/strict');
const author=require('../api/products-update-author.cjs');

test('replaces existing update line with updater name and Moscow time',()=>{
 const out=author.withLatestProductsUpdateAuthor('Список продуктов\nСыр\nОбновлено: 18:00','Диана',new Date('2026-08-22T16:05:00Z'));
 assert.match(out,/Обновлено: Диана · 19:05/u);
 assert.doesNotMatch(out,/18:00/u);
});

test('appends author when runtime omitted update line but product keyboard identifies list',()=>{
 const kb={inline_keyboard:[[{text:'Очистить',callback_data:'clear'}]]};
 const out=author.withLatestProductsUpdateAuthor('Сыр\nЯйца','Рустам',new Date('2026-08-22T16:05:00Z'),kb);
 assert.match(out,/Обновлено: Рустам · 19:05/u);
});

test('does not append author to unrelated Telegram message',()=>{
 assert.equal(author.withLatestProductsUpdateAuthor('Готово','Диана',new Date(),null),'Готово');
});

test('Telegram profile name is preserved before shared actor normalization',()=>{
 assert.equal(author.formatTelegramMutationUser({first_name:'Диана',last_name:'Иванова'}),'Диана Иванова');
});

test('generic author context can label Alice updates',async()=>{
 let init;
 await author.runWithProductsUpdateAuthorName('Алиса',async()=>{
   init=author.addProductsUpdateAuthorToTelegramRequest('https://api.telegram.org/bot1:abc/editMessageText',{body:JSON.stringify({text:'Список продуктов\nСыр'})});
 },{now:new Date('2026-08-22T16:05:00Z')});
 assert.match(JSON.parse(init.body).text,/Обновлено: Алиса · 19:05/u);
});
