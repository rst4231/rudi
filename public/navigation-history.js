/* RUDI navigation: a single browser-history source of truth for app pages and overlays. */
(() => {
  'use strict';
  if (window.__rudiNavigationHistoryInstalled) return;
  window.__rudiNavigationHistoryInstalled = true;
  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);
  const normalize = state => state && typeof state === 'object' && !Array.isArray(state) ? {...state} : {};
  const stepOf = state => Number.isSafeInteger(state?.rudiNavStep) && state.rudiNavStep >= 0 ? state.rudiNavStep : null;
  if (stepOf(history.state) === null) {
    try { nativeReplace({...normalize(history.state), rudiNavStep: 0}, '', window.location.href); } catch (_) {}
  }
  let lastStep = stepOf(history.state) ?? 0;
  let backLocked = false;
  history.pushState = function(state, title, url) {
    const next = (stepOf(history.state) ?? lastStep) + 1;
    const result = nativePush({...normalize(state), rudiNavStep: next}, title, url);
    lastStep = next;
    delete document.documentElement.dataset.rudiHistoryDirection;
    document.body && delete document.body.dataset.rudiHistoryDirection;
    return result;
  };
  history.replaceState = function(state, title, url) {
    const current = stepOf(history.state) ?? lastStep;
    return nativeReplace({...normalize(state), rudiNavStep: current}, title, url);
  };
  window.addEventListener('popstate', event => {
    const next = stepOf(event.state);
    if (next !== null && next !== lastStep) {
      const direction = next < lastStep ? 'back' : 'forward';
      document.documentElement.dataset.rudiHistoryDirection = direction;
      if (document.body) document.body.dataset.rudiHistoryDirection = direction;
      lastStep = next;
    }
    backLocked = false;
  }, true);

  function fallbackHome() {
    const current = document.body?.dataset.appTab || 'home';
    if (current === 'home') return false;
    if (typeof window.RUDI_NAVIGATE_TO_TAB === 'function') {
      window.RUDI_NAVIGATE_TO_TAB('home', {scroll: true, replace: true});
      return true;
    }
    return false;
  }
  function goBack({overlayOnly = false} = {}) {
    if (backLocked) return true;
    if (overlayOnly && history.state?.rudiOverlay !== 'personal-ai') return false;
    if ((stepOf(history.state) ?? 0) > 0) {
      backLocked = true;
      history.back();
      setTimeout(() => { backLocked = false; }, 650);
      return true;
    }
    return overlayOnly ? false : fallbackHome();
  }
  window.RUDI_NAV_BACK = goBack;
  window.RUDI_NAV_PUSH_OVERLAY = name => {
    if (!name || history.state?.rudiOverlay === name) return false;
    history.pushState({...normalize(history.state), rudiOverlay: name}, '', window.location.href);
    return true;
  };
  window.RUDI_NAV_DISCARD_OVERLAY = name => {
    if (history.state?.rudiOverlay !== name) return false;
    history.replaceState({...normalize(history.state), rudiOverlay: ''}, '', window.location.href);
    return true;
  };

  // These are whole-page back controls, not nested dialogs or finance drill-downs.
  const PAGE_BACKS = [
    '#carPageBack', '#habitBackButton', '#supplementBackButton', '#financeBackButton',
    '#workCalendarBack', '#smartSavesBackButton', '#wishlistBackButton',
    '#settingsPageBack', '#datesBackButton', '#forDiBackButton', '#fastingBackButton'
  ].join(',');
  document.addEventListener('click', event => {
    const button = event.target?.closest?.(PAGE_BACKS);
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goBack();
  }, true);

  // A single edge swipe for normal pages. Don't steal calendar paging, games,
  // carousels, sliders, editor gestures, or the AI centre's nested swipe.
  let gesture = null;
  let indicator = null;
  const excluded = [
    '#personalAICenter', '.rudi-center', '.score-modal', '.photo-viewer-stage',
    '.calendar-week-grid', '[data-no-swipe-back]', '[data-no-pull-refresh]',
    'input', 'textarea', 'select', '[contenteditable="true"]',
    '[role="slider"]', 'canvas', '.rudi-games', '.rudi-game-board',
    '.home-order-drag', '.finance-wallet-list.is-editing',
    '.finance-category-list.is-editing', '.swiper', '.splide'
  ].join(',');
  function showIndicator(amount) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'rudi-swipe-back-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.textContent = '‹';
      document.body.appendChild(indicator);
    }
    indicator.style.opacity = String(Math.min(.92, Math.max(0, amount / 110)));
    indicator.style.transform = 'translate3d(' + Math.min(35, amount * .25).toFixed(1) + 'px,-50%,0)';
  }
  function resetSwipe() {
    gesture = null;
    if (indicator) {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translate3d(-15px,-50%,0)';
    }
  }
  document.addEventListener('touchstart', event => {
    resetSwipe();
    if (event.touches?.length !== 1 || document.body?.classList.contains('rudi-center-open')) return;
    if (document.body?.classList.contains('score-modal-open')) return;
    if (event.target?.closest?.(excluded)) return;
    const touch = event.touches[0];
    if (touch.clientX > 32 || touch.clientX < 0) return;
    gesture = {x: touch.clientX, y: touch.clientY, time: Date.now(), horizontal: false};
  }, {passive: true, capture: true});
  document.addEventListener('touchmove', event => {
    if (!gesture || event.touches?.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x, dy = Math.abs(touch.clientY - gesture.y);
    if (dy > 32 && dy > Math.max(dx, 1) * .58) { resetSwipe(); return; }
    if (dx > 25 && dy < dx * .5) {
      gesture.horizontal = true;
      showIndicator(dx);
      if (event.cancelable) event.preventDefault();
    }
  }, {passive: false, capture: true});
  document.addEventListener('touchend', event => {
    if (!gesture) return;
    const start = gesture;
    const touch = event.changedTouches?.[0];
    const dx = touch ? touch.clientX - start.x : 0;
    const dy = touch ? Math.abs(touch.clientY - start.y) : Infinity;
    resetSwipe();
    if (start.horizontal && dx >= 86 && dy < dx * .48 && Date.now() - start.time < 1000) {
      goBack();
    }
  }, {passive: true, capture: true});
  document.addEventListener('touchcancel', resetSwipe, {passive: true, capture: true});
})();
