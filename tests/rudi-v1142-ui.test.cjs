const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const css=fs.readFileSync('public/app.css','utf8');

test('bottom navigation is larger without growing the panel',()=>{
  assert.match(css,/RUDI v1\.14\.2 — larger bottom navigation/);
  assert.match(css,/\.app-tab-button\{[\s\S]*?font-size:11\.8px!important/);
  assert.match(css,/\.app-tab-icon\{[\s\S]*?width:46px!important;[\s\S]*?height:46px!important/);
  assert.match(css,/\.app-tab-icon svg\{[\s\S]*?width:35px!important;[\s\S]*?height:35px!important/);
});

test('bottom navigation has press and selection feedback with reduced motion support',()=>{
  assert.match(css,/\.app-tab-button:active:not\(:disabled\)\{[\s\S]*?scale\(\.92\)/);
  assert.match(css,/\.app-tab-button:active:not\(:disabled\) \.app-tab-icon\{[\s\S]*?scale\(\.86\)/);
  assert.match(css,/@keyframes appTabSelectPop/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.app-tab-button:active:not\(:disabled\)/);
});
