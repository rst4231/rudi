/* RUDI v4.250: both owners' photo/name/status align to their card-row centre. */
/* RUDI home arrangement: preserve original controls and profile energy logic. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let pending=false,outlineObserver=null,outlineResizeObserver=null;
 // Draw rounded outlines in the real button dimensions (not a stretched 100x100 SVG).
 function roundedOutline(width,height){
   const inset=1.5,r=Math.max(1,Math.min(12.5,width/2-inset,height/2-inset));
   const w=width-inset,h=height-inset;
   return 'M '+width/2+' '+inset+
     ' H '+(w-r)+' A '+r+' '+r+' 0 0 1 '+w+' '+(inset+r)+
     ' V '+(h-r)+' A '+r+' '+r+' 0 0 1 '+(w-r)+' '+h+
     ' H '+(inset+r)+' A '+r+' '+r+' 0 0 1 '+inset+' '+(h-r)+
     ' V '+(inset+r)+' A '+r+' '+r+' 0 0 1 '+(inset+r)+' '+inset+
     ' H '+width/2;
 }
 function restoreTrackerOutlines(rail){
   for(const id of ['fastingProfileButton','supplementProfileButton']){
     const button=rail.querySelector('#'+id);
     const svg=button?.querySelector('svg.rudi-fasting-progress-outline,svg.rudi-supplement-progress-outline');
     if(!svg)continue;
     const rect=button.getBoundingClientRect();
     const width=Math.round(rect.width*10)/10,height=Math.round(rect.height*10)/10;
     if(!(width>12&&height>12))continue;
     const size=width+'x'+height;
     if(svg.dataset.rudiOutlineGeometry===size)continue;
     const paths=svg.querySelectorAll('path');
     for(const path of paths){
       if(!path.dataset.rudiOriginalLength){
         const previousLength=path.getTotalLength?.();
         if(previousLength>0)path.dataset.rudiOriginalLength=String(previousLength);
       }
       path.setAttribute('d',roundedOutline(width,height));
       if(path.dataset.rudiOriginalLength)path.setAttribute('pathLength',path.dataset.rudiOriginalLength);
     }
     svg.setAttribute('viewBox','0 0 '+width+' '+height);
     svg.setAttribute('preserveAspectRatio','none');
     svg.dataset.rudiOutlineGeometry=size;
   }
 }
 // Keep the live phase and marker unchanged. Put the caption in its own
 // reserved lane above the curve; its x coordinate follows the marker.
 function updateEnergyPointCaption(energy){
   const phase=energy?.querySelector('.profile-energy-label .profile-energy-phase');
   const dot=energy?.querySelector('.profile-energy-plot .profile-energy-now');
   if(!phase||!dot)return;
   let label=energy.querySelector(':scope > .rudi-energy-point-caption')||
     dot.querySelector('.rudi-energy-point-caption');
   if(!label){
     label=document.createElement('span');
     label.className='rudi-energy-point-caption';
     label.setAttribute('aria-hidden','true');
   }
   if(label.parentElement!==energy)energy.appendChild(label);
   const text=phase.textContent?.trim()||'';
   if(label.textContent!==text)label.textContent=text;
   if(label.hidden===!!text)label.hidden=!text;
   if(!text)return;
   const bounds=energy.getBoundingClientRect();
   const marker=dot.getBoundingClientRect();
   const caption=label.getBoundingClientRect();
   if(!bounds.width||!marker.width||!caption.width)return;
   // Clamp both edges within the strip without changing the real dot location.
   const half=Math.min(caption.width,bounds.width-6)/2;
   const min=half+3,max=Math.max(min,bounds.width-half-3);
   const x=Math.min(max,Math.max(min,marker.left+marker.width/2-bounds.left));
   const next=x.toFixed(1)+'px';
   if(label.style.left!==next)label.style.left=next;
 }
 const energyPointObservers=new WeakMap();
 function watchEnergyPointCaption(energy){
   if(!energy)return;
   let watcher=energyPointObservers.get(energy);
   if(!watcher&&typeof MutationObserver==='function'){
     const dotObserver=new MutationObserver(()=>updateEnergyPointCaption(energy));
     watcher={marker:null,dotObserver,sync:null};
     watcher.sync=()=>{
       const current=energy.querySelector('.profile-energy-plot .profile-energy-now');
       if(current!==watcher.marker){
         dotObserver.disconnect();
         watcher.marker=current;
         if(current)dotObserver.observe(current,{attributes:true,attributeFilter:['style']});
       }
       updateEnergyPointCaption(energy);
     };
     energyPointObservers.set(energy,watcher);
     new MutationObserver(watcher.sync)
       .observe(energy,{childList:true,characterData:true,subtree:true});
   }
   if(watcher)watcher.sync();
   else updateEnergyPointCaption(energy);
 }
 // The profile is assembled by the runtime after page load. Layout must be
 // enforced on those live DOM nodes, not only through the cascading stylesheets.
 let selfAxisObserver=null,selfAxisObserved=null,axisFrame=0;
 function setImportant(node,styles){
   if(!node)return;
   for(const [key,value] of Object.entries(styles)){
     if(node.style.getPropertyValue(key)!==value||node.style.getPropertyPriority(key)!=='important')
       node.style.setProperty(key,value,'important');
   }
 }
 function alignLiveProfileAxis(profileHead,energy){
   if(axisFrame)cancelAnimationFrame(axisFrame);
   axisFrame=requestAnimationFrame(()=>{
     axisFrame=0;
     if(!profileHead.isConnected||!energy.isConnected)return;
     const avatar=profileHead.querySelector('.score-avatar-wrap');
     const row=profileHead.closest('.rudi-home-self-line');
     if(!avatar||!row)return;
     // Never compound previous corrections on refresh or orientation change.
     profileHead.style.setProperty('transform','none','important');
     const a=avatar.getBoundingClientRect(),r=row.getBoundingClientRect();
     if(!a.height||!r.height)return;
     // The owner identity moves together; the phase-caption plot is not the centre.
     const distance=(r.top+r.height/2)-(a.top+a.height/2);
     const adjustment=Math.max(-24,Math.min(24,distance));
     if(Math.abs(adjustment)>0.75)
       profileHead.style.setProperty('transform','translateY('+adjustment.toFixed(2)+'px)','important');
   });
 }

 // Current-time biorhythm point uses the native collapse toggle, on both cards.
 function bindEnergyDotExpander(energy){
   const tile=energy?.closest('#homeRustamTile,#homeDianaTile');
   const dot=energy?.querySelector('.profile-energy-plot .profile-energy-now');
   if(!tile||!dot||dot.dataset.rudiDotExpandBound==='1')return;
   dot.dataset.rudiDotExpandBound='1';
   dot.removeAttribute('aria-hidden');
   dot.setAttribute('role','button');
   dot.setAttribute('tabindex','0');
   dot.setAttribute('aria-label','Раскрыть карточку '+(tile.id==='homeDianaTile'?'Дианы':'Рустама'));
   energy.setAttribute('role','group');
   const sync=()=>dot.setAttribute('aria-expanded',String(!tile.classList.contains('is-collapsed')));
   const expand=event=>{
     if(document.body.dataset.appTab&&document.body.dataset.appTab!=='home')return;
     event.preventDefault();
     event.stopPropagation();
     if(tile.classList.contains('is-collapsed'))tile.querySelector('.block-collapse-button')?.click();
     sync();
   };
   dot.addEventListener('click',expand);
   dot.addEventListener('keydown',event=>{
     if(event.key==='Enter'||event.key===' ')expand(event);
   });
   if(typeof MutationObserver==='function')new MutationObserver(sync)
     .observe(tile,{attributes:true,attributeFilter:['class']});
   sync();
 }
 function layoutLiveSelf(self,main,profileHead,energy){
   // Both account roles must share exactly one profile layout. The former
   // Diana-only two-row layout shifted her avatar into the energy timeline.
   return layoutLiveRustamV4229(self,main,profileHead,energy);
 }
 function layoutLiveRustamV4229(self,main,profileHead,energy){
   self.dataset.rudiSelfLayout='inline';
   setImportant(self,{'display':'flex','flex-direction':'column','justify-content':'center','align-items':'stretch','gap':'0',
     'min-height':'82px','padding-top':'6px','padding-bottom':'3px'});
   const narrow=window.innerWidth<=375;
   setImportant(main,{'display':'grid','grid-template-columns':narrow?'minmax(0,53%) minmax(0,1fr)':'minmax(0,50%) minmax(0,1fr)',
     'grid-template-rows':'72px','grid-auto-rows':'72px','align-items':'center',
     'align-content':'center','height':'72px','min-height':'72px','max-height':'72px','width':'100%','gap':'10px',
     'margin':'0','padding':'0'});
   setImportant(profileHead,{'grid-column':'1','grid-row':'1','display':'flex','align-items':'center',
     'justify-content':'flex-start','align-self':'center','height':'72px','min-height':'72px',
     'margin':'0','padding':'0'});
   setImportant(energy,{'grid-column':'2','grid-row':'1','align-self':'center','height':'54px','margin':'0'});
   const identity=profileHead.querySelector('.identity');
   setImportant(identity,{'display':'grid','align-items':'center','align-self':'center','margin':'0',
     'padding':'0','min-height':'44px'});
   const avatar=profileHead.querySelector('.score-avatar-wrap');
   setImportant(avatar,{'align-self':'center','margin':'0'});
   const person=identity?.querySelector('.person');
   setImportant(person,{'display':'flex','flex-direction':'column','justify-content':'center',
     'align-self':'center','margin':'0','padding':'0'});
   if(selfAxisObserved!==main&&typeof ResizeObserver==='function'){
     selfAxisObserver?.disconnect();
     selfAxisObserved=main;
     selfAxisObserver=new ResizeObserver(()=>alignLiveProfileAxis(profileHead,energy));
     selfAxisObserver.observe(main);
     if(identity)selfAxisObserver.observe(identity);
     selfAxisObserver.observe(energy);
   }
   alignLiveProfileAxis(profileHead,energy);
 }
 // Relocate the same native mood buttons, preserving their listeners and live state.
 function placeMoodBadgesByName(){
   for(const id of ['homeRustamTile','homeDianaTile']){
     const tile=$(id);
     const row=tile?.querySelector('.profile-person-head .profile-name-row');
     const badge=tile?.querySelector('#moodCurrentButton,#partnerMoodValue');
     if(row&&badge&&badge.parentElement!==row)row.appendChild(badge);
   }
 }
 // Override inline display:flex!important on relocated Home profile cards.
 // Save the original display and hidden state to restore on Home.
 function suppressLateHomeTiles(){
   const tab=document.body?.dataset?.appTab;
   const home=!tab||tab==='home';
   for(const tile of document.querySelectorAll('[data-app-tab-section="home"]')){
     const guarded=['homeRustamTile','homeDianaTile','rudiHomeShortcuts'].includes(tile.id);
     if(home){
       if(guarded&&tile.dataset?.rudiTabGuard==='1'){
         const d=tile.dataset;
         if(d.rudiPreviousDisplay)
           tile.style.setProperty('display',d.rudiPreviousDisplay,d.rudiPreviousPriority||'');
         else tile.style.removeProperty('display');
         tile.hidden=d.rudiLastHomeHidden==='1';
         delete d.rudiTabGuard;
         delete d.rudiPreviousDisplay;
         delete d.rudiPreviousPriority;
       }
       // Navigation can set hidden before the guard runs. Home-only shortcuts
       // and the current user's own profile must always reappear on Home.
       const currentProfile=guarded&&tile.id!=='rudiHomeShortcuts'&&
         tile.contains?.(document.getElementById('displayName'));
       if(tile.id==='rudiHomeShortcuts'||currentProfile){
         tile.hidden=false;
         if(tile.style?.getPropertyValue('display')==='none')tile.style.removeProperty('display');
       }
       if(guarded&&tile.dataset)tile.dataset.rudiLastHomeHidden=tile.hidden?'1':'0';
       continue;
     }
     if(guarded&&tile.dataset&&tile.style){
       const d=tile.dataset;
       if(d.rudiTabGuard!=='1'){
         if(d.rudiLastHomeHidden===undefined)
           d.rudiLastHomeHidden=tile.contains?.(document.getElementById('displayName'))?'0':tile.hidden?'1':'0';
         d.rudiTabGuard='1';
         d.rudiPreviousDisplay=tile.style.getPropertyValue('display');
         d.rudiPreviousPriority=tile.style.getPropertyPriority('display');
       }
       tile.style.setProperty('display','none','important');
     }
     if(!tile.hidden)tile.hidden=true;
   }
   return !home;
 }

 // Diana's work status is supplied by the existing schedule runtime.
 // Keep its real hours; remove only the duplicated "Работаю" prefix.
 function dianaStatusWithoutVerb(value){
   const text=String(value||'').trim();
   return /^Работаю(?:\s|[·•:]|$)/u.test(text)
     ?text.slice('Работаю'.length).replace(/^[\s·•:—–-]+/u,'').trim()
     :text;
 }
 function bindDianaShiftHours(){
   const node=$('homeDianaTile')?.querySelector('.profile-work-status');
   if(!node)return;
   const sync=()=>{
     const value=String(node.textContent||'').trim();
     const next=dianaStatusWithoutVerb(value);
     if(next===value)return;
     node.textContent=next;
     if(!next)node.hidden=true; // No shift hours were supplied; never invent them.
   };
   sync();
   if(node.dataset.rudiShiftTimeOnly==='1')return;
   node.dataset.rudiShiftTimeOnly='1';
   if(typeof MutationObserver==='function')
     new MutationObserver(sync).observe(node,{childList:true,characterData:true,subtree:true});
 }
 function arrange(){
   pending=false;
   if(suppressLateHomeTiles())return;
   const dashboard=$('homeDashboard'),self=$('homeRustamTile')?.contains($('displayName'))
     ?$('homeRustamTile'):$('homeDianaTile')?.contains($('displayName'))?$('homeDianaTile'):null;
   if(!dashboard||!self||!self.parentElement)return;
   const head=dashboard.querySelector('.home-dashboard-head');
   const moon=$('homeDashboardMoon'),sun=$('homeDashboardSun');
   if(head&&moon&&sun){
     let line=$('rudiHomeAstronomy');
     if(!line){line=document.createElement('div');line.id='rudiHomeAstronomy';line.className='rudi-home-astronomy';head.appendChild(line);}
     if(moon.parentElement!==line)line.append(moon);
     if(sun.parentElement!==line)line.append(sun);
   }
   let rail=$('rudiHomeShortcuts');
   if(!rail){
     rail=document.createElement('nav');rail.id='rudiHomeShortcuts';
     rail.className='rudi-home-shortcuts';
     rail.dataset.appTabSection='home';
     rail.setAttribute('aria-label','Быстрые действия');
     const inner=document.createElement('div');inner.className='rudi-home-shortcuts-inner';
     rail.append(inner);
     const games=document.createElement('button');games.id='rudiHomeGamesButton';
     games.className='rudi-home-games';games.type='button';
     games.setAttribute('aria-label','Игры и тренажёры');games.title='Игры';
     games.innerHTML='<span aria-hidden="true">🎮</span>';
     games.addEventListener('click',()=>window.RudiGames?.open?.());
     inner.append(games);
     window.RudiGameExtras?.renderBadges?.();
   }
   const buttons=self.querySelector('.mood-self-buttons')||$('fastingProfileButton')?.closest('.mood-self-buttons')
       ||rail.querySelector('.mood-self-buttons');
   const inner=rail.querySelector('.rudi-home-shortcuts-inner');
   if(buttons&&buttons.parentElement!==inner)inner.insertBefore(buttons,$('rudiHomeGamesButton'));
   restoreTrackerOutlines(rail);
   if(!outlineObserver&&typeof MutationObserver==='function'){
     outlineObserver=new MutationObserver(()=>restoreTrackerOutlines(rail));
     outlineObserver.observe(rail,{childList:true,subtree:true});
   }
   if(!outlineResizeObserver&&typeof ResizeObserver==='function'){
     outlineResizeObserver=new ResizeObserver(()=>restoreTrackerOutlines(rail));
     for(const id of ['fastingProfileButton','supplementProfileButton']){
       const button=rail.querySelector('#'+id);
       if(button)outlineResizeObserver.observe(button);
     }
   }
   // Existing meditation module inserts its conditional hint before the self tile.
   // Keep the rail directly before that hint or the tile, including customized home order.
   const hint=$('meditationMoodNudgeRustam')||$('meditationMoodNudgeDiana');
   const anchor=hint&&hint.parentElement===self.parentElement&&!hint.hidden?hint:self;
   if(rail.parentElement!==anchor.parentElement||rail.nextElementSibling!==anchor)
     anchor.parentElement.insertBefore(rail,anchor);
   // Ensure the shortcut rail is restored after any internal route switch.
   rail.hidden=false;
   if(rail.style.getPropertyValue('display')==='none')rail.style.removeProperty('display');
   rail.dataset.rudiLastHomeHidden='0';
   let main=self.querySelector('.rudi-home-self-line');
   const profileHead=self.querySelector('.profile-person-head');
   const energy=self.querySelector('.profile-energy-strip');
   if(profileHead&&energy){
     if(!main){
       main=document.createElement('div');
       main.className='rudi-home-self-line';
       self.insertBefore(main,self.firstChild);
     }
     if(profileHead.parentElement!==main||energy.parentElement!==main)
       main.append(profileHead,energy);
     layoutLiveSelf(self,main,profileHead,energy);
   }
   // Observe BOTH profiles in either account: Rustam is the partner on Diana's
   // phone and Diana is the partner on Rustam's phone.
   for(const id of ['homeRustamTile','homeDianaTile']){
     const strip=$(id)?.querySelector('.profile-energy-strip');
     if(!strip)continue;
     watchEnergyPointCaption(strip);
     bindEnergyDotExpander(strip);
   }
   // Both cards need the same name-side sticker geometry.
   placeMoodBadgesByName();
   bindDianaShiftHours();
 }
 function schedule(){
   if(pending)return;pending=true;
   requestAnimationFrame(arrange);
 }
 window.addEventListener('resize',schedule,{passive:true});
 if(document.fonts?.ready)document.fonts.ready.then(schedule).catch(()=>{});
 window.addEventListener('rudi:profile-ready',schedule);
 document.addEventListener('rudi:home-tiles-ready',schedule);
 window.addEventListener('rudi:app-tab-change',schedule);
 if(typeof MutationObserver==='function'){
   new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-app-tab']});
   const root=document.querySelector('.shell');
   if(root)new MutationObserver(changes=>{
     if(!document.body.dataset.appTab||document.body.dataset.appTab==='home')return;
     if(changes.some(change=>Array.from(change.addedNodes).some(node=>
       node.nodeType===1&&(node.matches?.('[data-app-tab-section="home"]')||
       node.querySelector?.('[data-app-tab-section="home"]')))))schedule();
   }).observe(root,{childList:true,subtree:true});
 }

 // The Home “Ближайшее” heading opens the existing Feed tab, not Schedule.
 // Capture before app.js's legacy direct click handler; no app bundle edits.
 document.addEventListener('click',event=>{
   const nearest=event.target?.closest?.('#homeNearestOpen');
   if(!nearest)return;
   const feed=document.querySelector('.app-tab-button[data-app-tab="feed"]');
   if(!feed)return;
   event.preventDefault();
   event.stopImmediatePropagation();
   feed.click();
 },true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
})();