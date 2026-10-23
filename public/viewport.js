/* iOS installed apps can report a viewport shorter than their translucent window. */
(()=>{'use strict';
 const root=document.documentElement;
 function sync(){
  const view=window.visualViewport;
  const layout=Math.max(window.innerHeight||0,root.clientHeight||0);
  const typing=!!document.activeElement?.matches?.('input,textarea,[contenteditable="true"]');
  const keyboard=typing&&view&&layout-view.height>130;
  const installed=navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
  const iphone=/iPhone|iPod/.test(navigator.userAgent);
  // black-translucent is declared in index.html, so the installed window includes the status bar.
  const full=installed&&iphone?Math.max(layout,window.screen.height):layout;
  root.style.setProperty('--rudi-viewport-height',Math.round(keyboard?view.height:full)+'px');
 }
 sync();
 for(const event of ['resize','orientationchange','pageshow'])window.addEventListener(event,sync,{passive:true});
 for(const event of ['resize','scroll'])window.visualViewport?.addEventListener(event,sync,{passive:true});
 for(const event of ['focusin','focusout','visibilitychange'])document.addEventListener(event,()=>requestAnimationFrame(sync));
 window.RudiViewport={sync};
})();
