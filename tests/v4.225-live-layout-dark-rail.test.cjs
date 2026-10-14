'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/home-reference-layout.css','utf8');
const js=fs.readFileSync('public/home-reference-layout.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
test('live profile layout is applied to actual mounted nodes, independently of collapsed state',()=>{
 assert.match(js,/function layoutLiveSelf\(self,main,profileHead,energy\)/);
 assert.match(js,/layoutLiveSelf\(self,main,profileHead,energy\)/);
 assert.match(js,/setImportant\(main,\{'display':'grid'/);
 assert.match(js,/'grid-template-rows':'72px'/);
 assert.match(js,/'grid-column':'2','grid-row':'1'/);
 assert.match(js,/function alignLiveProfileAxis\(profileHead,energy\)/);
 assert.match(js,/const distance=\(p\.top\+p\.height\/2\)-\(a\.top\+a\.height\/2\)/);
 assert.match(js,/ResizeObserver\(\(\)=>alignLiveProfileAxis\(profileHead,energy\)\)/);
});
test('light theme tracker panel remains fully dark including buttons and captions',()=>{
 assert.match(css,/html\[data-theme="light"\] body\[data-app-tab="home"\] \.rudi-home-shortcuts\{[\s\S]*?background:linear-gradient\(155deg,#1d2036 0%,#141728 100%\)!important/);
 assert.match(css,/\.rudi-home-shortcuts :is\(\.profile-tool-button,\.fasting-profile-button,\.meditation-profile-button,\.rudi-home-games\)\{[\s\S]*?background:#15192b!important/);
 assert.match(css,/\.rudi-home-shortcuts :is\(\.fasting-profile-elapsed,\.profile-tool-reminder-badge\)\{[\s\S]*?color:#e0e5fa!important/);
 assert.match(css,/html\[data-theme="light"\] body\[data-app-tab="home"\] \.rudi-home-shortcuts\{[\s\S]*?background:linear-gradient\(155deg,#1d2036/);
});
test('new assets are cache-busted and old icons/games preserved',()=>{
 assert.match(html,/home-reference-layout\.css\?v=4\.229/);
 assert.match(html,/home-reference-layout\.js\?v=4\.229/);
 assert.match(js,/window\.RudiGames\?\.open\?\.\(\)/);
 assert.match(js,/restoreTrackerOutlines\(rail\)/);
});
