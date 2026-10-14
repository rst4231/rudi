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
 // Keep the runtime's source phase untouched. The caption follows its moving timeline dot.
 function updateEnergyPointCaption(energy){
   const phase=energy?.querySelector('.profile-energy-label .profile-energy-phase');
   const dot=energy?.querySelector('.profile-energy-plot .profile-energy-now');
   if(!phase||!dot)return;
   let label=dot.querySelector('.rudi-energy-point-caption');
   if(!label){
     label=document.createElement('span');
     label.className='rudi-energy-point-caption';
     label.setAttribute('aria-hidden','true');
     dot.appendChild(label);
   }
   const text=phase.textContent?.trim()||'';
   if(label.textContent!==text)label.textContent=text;
   if(label.hidden===!!text)label.hidden=!text;
 }
 const energyPointObservers=new WeakSet();
 function watchEnergyPointCaption(energy){
   if(!energy)return;
   updateEnergyPointCaption(energy);
   if(energyPointObservers.has(energy)||typeof MutationObserver!=='function')return;
   energyPointObservers.add(energy);
   new MutationObserver(()=>updateEnergyPointCaption(energy))
     .observe(energy,{childList:true,characterData:true,subtree:true});
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
     const plot=energy.querySelector('.profile-energy-plot');
     if(!avatar||!plot)return;
     // Never compound previous corrections on refresh or orientation change.
     profileHead.style.setProperty('transform','none','important');
     const a=avatar.getBoundingClientRect(),p=plot.getBoundingClientRect();
     if(!a.height||!p.height)return;
     const distance=(p.top+p.height/2)-(a.top+a.height/2);
     const adjustment=Math.max(-48,Math.min(48,distance));
     if(Math.abs(adjustment)>0.75)
       profileHead.style.setProperty('transform','translateY('+adjustment.toFixed(2)+'px)','important');
   });
 }
 function layoutLiveSelf(self,main,profileHead,energy){
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
   setImportant(energy,{'grid-column':'2','grid-row':'1','align-self':'center','height':'44px','margin':'0'});
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
 function arrange(){
   pending=false;
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
     watchEnergyPointCaption(energy);
   }
   // Both cards need the same name-side sticker geometry.
   placeMoodBadgesByName();
 }
 function schedule(){
   if(pending)return;pending=true;
   requestAnimationFrame(arrange);
 }
 window.addEventListener('resize',schedule,{passive:true});
 if(document.fonts?.ready)document.fonts.ready.then(schedule).catch(()=>{});
 window.addEventListener('rudi:profile-ready',schedule);
 document.addEventListener('rudi:home-tiles-ready',schedule);
 window.addEventListener('rudi:app-tab-change',event=>{if(event.detail?.tab==='home')schedule()});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
})();