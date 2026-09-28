const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.105 supplements prioritize untaken and mood analysis respects selected period',()=>{
  const supplements=fs.readFileSync('public/supplement-advanced.js','utf8');
  const mood=fs.readFileSync('public/mood-history.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');

  assert.match(supplements,/status==='active'\?Number\(takenToday\(a\.item\)\)-Number\(takenToday\(b\.item\)\):0/);
  assert.doesNotMatch(mood,/Разбор пригодился\?/);
  assert.doesNotMatch(mood,/moodAnalysisFeedback/);
  assert.match(mood,/return value>=90\?20:value>=30\?10:5/);
  assert.match(mood,/данных мало:/);
  assert.match(api,/function moodAnalysisMinimumDays\(windowDays\).*days>=90\?20:days>=30\?10:5/);
  assert.match(api,/selected\.length<minAnalysisDays/);
  assert.match(html,/mood-history\.js\?v=2\.105/);
  assert.match(html,/supplement-advanced\.js\?v=2\.105/);
  assert.match(html,/rudi-version" content="v2\.105"/);
});
