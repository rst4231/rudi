const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v3.90 mood analysis exposes real-data visuals end to end',()=>{
  const api=read('api/partner-message.js'),ui=read('public/mood-history.js'),css=read('public/mood-history-v2101.css');
  assert.match(api,/function moodAnalysisVisuals\(rows\)/);
  assert.match(api,/analysisVisuals=analysis\?\.text\?moodAnalysisVisuals/);
  assert.match(api,/const analysisVisuals=moodAnalysisVisuals\(enriched\)/);
  assert.match(ui,/function renderAnalysisVisuals/);
  assert.match(ui,/mood-analysis-mood-bar/);
  assert.match(ui,/mood-analysis-factor-bars/);
  assert.match(ui,/renderAnalysisReport\(result,analysis\.text,data\.analysisVisuals\)/);
  assert.match(css,/mood-analysis-kpis/);
  assert.match(css,/mood-analysis-factor-track/);
});

test('v3.90 report copy is concise and does not duplicate the charts',()=>{
  const ai=read('api/mood-analysis-ai.cjs');
  assert.match(ai,/Не повторяйте одну и ту же статистику/);
  assert.match(ai,/максимум 3 наиболее повторяющиеся корреляции/);
  assert.match(ai,/до 1400 знаков/);
});

test('v3.90 keeps recipe taste filters from v3.89 in the same release branch',()=>{
  const app=read('public/app.js'),html=read('public/index.html');
  assert.match(app,/RECIPE_TASTES_BY_MEAL/);
  assert.match(app,/taste:recipeChoiceValue\('data-recipe-taste'\)/);
  assert.match(html,/rudi-version" content="v3\.90"/);
  assert.equal(read('VERSION').trim(),'v3.90');
});
