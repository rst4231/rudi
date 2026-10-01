const test=require('node:test');
const assert=require('node:assert/strict');
const {postProcessSmartSaveClassification}=require('../api/smart-saves-ai.cjs');

test('ordinary YouTube Short cannot become cultural event',()=>{
  const result=postProcessSmartSaveClassification({
    text:'https://www.youtube.com/shorts/abc123',
    pageMeta:{url:'https://www.youtube.com/shorts/abc123',title:'Короткое видео',description:'Возможно, культурный контент.'}
  },{category:'Культурные мероприятия',title:'Короткое видео',description:'Возможно, культурный контент.'});
  assert.equal(result.category,'Видео');
});

test('Short about an explicit concert may remain an event',()=>{
  const result=postProcessSmartSaveClassification({
    text:'Концерт 10 октября, билеты https://www.youtube.com/shorts/abc123',
    pageMeta:{url:'https://www.youtube.com/shorts/abc123',title:'Концерт 10 октября',description:'Билеты уже в продаже'}
  },{category:'Культурные мероприятия',title:'Концерт',description:'10 октября'});
  assert.equal(result.category,'Культурные мероприятия');
});


test('Russian event words are recognized without ASCII word-boundary bugs',()=>{
  const {hasExplicitEventEvidence}=require('../api/smart-saves-ai.cjs');
  assert.equal(hasExplicitEventEvidence('Концерт 10 октября, билеты уже в продаже'),true);
  assert.equal(hasExplicitEventEvidence('Короткое видео. Возможно, культурный контент.'),false);
});
