const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.105 mood analysis includes supplement intake context safely',()=>{
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  const ai=fs.readFileSync('api/mood-analysis-ai.cjs','utf8');
  const supplements=fs.readFileSync('api/supplements.js','utf8');

  assert.match(backend,/readSupplements/);
  assert.match(backend,/supplements:\{taken:takenSupplements\}/);
  assert.match(backend,/withSupplement\.length<3\|\|withoutSupplement\.length<3/);
  assert.match(backend,/не доказательство влияния БАДа/);
  assert.match(ai,/БАДы приняты:/);
  assert.match(ai,/не делайте выводов по единичным дням/);
  assert.match(ai,/только как корреляцию, а не причину/);
  assert.match(supplements,/clearMoodAnalysisCache/);
  assert.match(supplements,/if\(!result\.duplicate\)await clearMoodAnalysisCache\(actor\)/);
});
