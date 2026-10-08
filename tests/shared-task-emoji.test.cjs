const test=require('node:test');
const assert=require('node:assert/strict');
const {withTaskEmoji}=require('../api/shared-task-emoji.cjs');
test('adds a suitable emoji only when a task has none',()=>{
 assert.equal(withTaskEmoji('Купить продукты'),'🛒 Купить продукты');
 assert.equal(withTaskEmoji('Погулять с Лулу'),'🐕 Погулять с Лулу');
 assert.equal(withTaskEmoji('Оплатить ЖКХ'),'💳 Оплатить ЖКХ');
 assert.equal(withTaskEmoji('Уборка квартиры'),'🧹 Уборка квартиры');
 assert.equal(withTaskEmoji('Вынести мусор'),'🗑️ Вынести мусор');
 assert.equal(withTaskEmoji('Разобраться с вопросом'),'📌 Разобраться с вопросом');
});
test('does not duplicate existing emoji anywhere in the title',()=>{
 assert.equal(withTaskEmoji('🍕 Заказать еду'),'🍕 Заказать еду');
 assert.equal(withTaskEmoji('Купить продукты 🛒'),'Купить продукты 🛒');
 assert.equal(withTaskEmoji('🇷🇺 Поездка'),'🇷🇺 Поездка');
 assert.equal(withTaskEmoji('  '),'');
});
test('TickTick API stores the annotated title before submission',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const route=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
 assert.match(route,/const title = withTaskEmoji\(String\(body.title \|\| ''\).trim\(\)\).slice\(0,500\)/);
});
