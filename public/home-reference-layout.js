/* RUDI home arrangement: preserve original controls and profile energy logic. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let pending=false,outlineObserver=null,outlineResizeObserver=null;
 // Draw rounded outlines in the real button dimensions (not a stretched 100x100 SVG).
 function roundedOutline(width,height){
   const inset=3.5,r=Math.max(1,Math.min(14,width/2-inset,height/2-inset));
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
   }
 }
 function schedule(){
   if(pending)return;pending=true;
   requestAnimationFrame(arrange);
 }
 window.addEventListener('rudi:profile-ready',schedule);
 document.addEventListener('rudi:home-tiles-ready',schedule);
 window.addEventListener('rudi:app-tab-change',event=>{if(event.detail?.tab==='home')schedule()});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
})();