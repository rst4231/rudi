/* RUDI home arrangement: preserve original controls and profile energy logic. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let pending=false;
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