(function(root,factory){
  const catalog=factory();
  if(typeof module==='object'&&module.exports)module.exports=catalog;
  else root.RudiMoodCatalog=catalog;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const groups=[
    {key:'anger',label:'Гнев',emoji:'😡',submoods:'Бешенство|Ярость|Ненависть|Истерия|Злость|Раздражение|Презрение|Негодование|Обида|Ревность|Уязвлённость|Досада|Зависть|Неприязнь|Возмущение|Отвращение'.split('|')},
    {key:'anxiety',label:'Страх',emoji:'😨',submoods:'Ужас|Отчаяние|Испуг|Оцепенение|Подозрение|Тревога|Ошарашенность|Беспокойство|Боязнь|Унижение|Замешательство|Растерянность|Вина, стыд|Сомнение|Застенчивость|Опасение|Смущение|Сломленность|Подвох|Надменность|Ошеломлённость'.split('|')},
    {key:'sadness',label:'Грусть',emoji:'😢',submoods:'Горечь|Тоска|Скорбь|Лень|Жалость|Отрешённость|Отчаяние|Беспомощность|Душевная боль|Безнадёжность|Отчуждённость|Разочарование|Потрясение|Сожаление|Скука|Безысходность|Печаль|Загнанность'.split('|')},
    {key:'joy',label:'Радость',emoji:'😄',submoods:'Счастье|Восторг|Ликование|Приподнятость|Оживление|Умиротворение|Увлечение|Интерес|Забота|Ожидание|Возбуждение|Предвкушение|Надежда|Любопытство|Освобождение|Принятие|Нетерпение|Вера|Изумление'.split('|')},
    {key:'love',label:'Любовь',emoji:'🥰',submoods:'Нежность|Теплота|Сочувствие|Блаженство|Доверие|Безопасность|Благодарность|Спокойствие|Симпатия|Идентичность|Гордость|Восхищение|Уважение|Самоценность|Влюблённость|Любовь к себе|Очарованность|Смирение|Искренность|Дружелюбие|Доброта|Взаимовыручка'.split('|')},
    {key:'neutral',label:'Нейтрально',emoji:'😐',submoods:[]}
  ];
  const meta=Object.fromEntries(groups.map(group=>[group.key,{label:group.label,emoji:group.emoji}]));
  meta.boredom={label:'Скука',emoji:'🥱'};meta.fatigue={label:'Усталость',emoji:'😩'};
  function normalizeSubmood(mood,value){
    const text=String(value||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
    return groups.find(group=>group.key===mood)?.submoods.find(item=>item.toLocaleLowerCase('ru-RU').replace(/ё/g,'е')===text)||'';
  }
  return {groups,meta,normalizeSubmood};
});
