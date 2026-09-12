document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    html, .options-panel { scrollbar-width: none; }
    html::-webkit-scrollbar, .options-panel::-webkit-scrollbar { display: none; }
    html#preview-page, html#preview-page body, html#preview-page body * { cursor: auto !important; }
    html#preview-page body :is(button, a, select, input[type="checkbox"], input[type="range"], input[readonly], .corner-target),
    html#preview-page body :is(button, a, .corner-target) * { cursor: pointer !important; }
    html#preview-page body :is(input:not([readonly]):not([type="checkbox"]):not([type="range"]), textarea) { cursor: text !important; }
    html#preview-page body .preview-scrollbar, html#preview-page body .preview-scrollbar * { cursor: ns-resize !important; }
    .preview-scrollbar { position: fixed; inset: 3px 1px 3px auto; width: 8px; z-index: 2147483647; touch-action: none; }
    .preview-scrollbar[hidden] { display: none; }
    .preview-scrollbar-thumb { position: absolute; top: 0; right: 1px; width: 3px; border-radius: 8px; background: #727282; opacity: .65; }
    .preview-scrollbar:hover .preview-scrollbar-thumb, .preview-scrollbar:focus-visible .preview-scrollbar-thumb { width: 6px; background: #b3a17d; opacity: 1; }
    .preview-scrollbar:focus-visible { outline: 1px solid #ffc04a; border-radius: 4px; }
  `;
  document.head.append(style);
  const names = {en:'Scroll preview',es:'Desplazar vista previa',ko:'미리보기 스크롤',ja:'プレビューをスクロール','zh-CHS':'滚动预览','zh-CHT':'捲動預覽'};
  const track = document.createElement('div');
  track.className = 'preview-scrollbar';
  track.tabIndex = 0;
  track.setAttribute('role', 'scrollbar');
  track.setAttribute('aria-orientation', 'vertical');
  track.setAttribute('aria-valuemin', '0');
  document.documentElement.id ||= 'preview-page';
  track.setAttribute('aria-controls', document.documentElement.id);
  const thumb = document.createElement('div');
  thumb.className = 'preview-scrollbar-thumb';
  track.append(thumb);
  document.body.append(track);
  let scroller = document.scrollingElement;
  let pending = false;
  let travel = 0;
  let limit = 0;
  let viewportHeight = innerHeight;
  let trackTop = 3;
  const observed = new WeakSet();
  const resizeObserver = new ResizeObserver(schedule);
  function observe(element) {
    if (!observed.has(element)) { observed.add(element); resizeObserver.observe(element); }
  }
  function update() {
    pending = false;
    scroller = document.querySelector('.options-panel:not([hidden]):not(.option-tab-exiting)') || document.scrollingElement;
    const isDocument = scroller === document.scrollingElement;
    viewportHeight = isDocument ? innerHeight : scroller.clientHeight;
    trackTop = isDocument ? 3 : scroller.getBoundingClientRect().top + 3;
    if (!isDocument) {
      observe(scroller);
      for (const child of scroller.children) observe(child);
    }
    track.setAttribute('aria-controls', scroller.id);
    const trackHeight = Math.max(0, viewportHeight - 6);
    track.style.top = trackTop + 'px';
    track.style.bottom = 'auto';
    track.style.height = trackHeight + 'px';
    limit = Math.max(0, scroller.scrollHeight - viewportHeight);
    track.hidden = limit <= 1;
    track.setAttribute('aria-label', names[store.aegisLanguage] || names.en);
    track.setAttribute('aria-valuemax', String(limit));
    track.setAttribute('aria-valuenow', String(Math.round(scroller.scrollTop)));
    const height = Math.min(trackHeight, Math.max(28, trackHeight * viewportHeight / scroller.scrollHeight));
    travel = Math.max(0, trackHeight - height);
    thumb.style.height = height + 'px';
    thumb.style.transform = `translateY(${limit ? scroller.scrollTop / limit * travel : 0}px)`;
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', schedule, {passive:true, capture:true});
  addEventListener('resize', schedule);
  observe(document.body);
  new MutationObserver(records => {
    if (records.some(record => record.target.matches('.options-panel, .options-tabs button'))) schedule();
  }).observe(document.body, {subtree:true, attributes:true, attributeFilter:['hidden','class','aria-selected']});
  let drag;
  track.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !travel) return;
    event.preventDefault();
    if (event.target !== thumb) {
      scroller.scrollTop = Math.max(0, Math.min(1, (event.clientY - trackTop - thumb.offsetHeight / 2) / travel)) * limit;
    }
    drag = {y:event.clientY, scroll:scroller.scrollTop};
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointermove', event => {
    if (drag && travel) scroller.scrollTop = drag.scroll + (event.clientY - drag.y) / travel * limit;
  });
  track.addEventListener('lostpointercapture', () => { drag = undefined; });
  track.addEventListener('pointerup', event => { track.releasePointerCapture(event.pointerId); });
  track.addEventListener('keydown', event => {
    const delta = {ArrowDown:40, ArrowUp:-40, PageDown:viewportHeight * .9, PageUp:-viewportHeight * .9}[event.key];
    if (delta !== undefined) scroller.scrollTop += delta;
    else if (event.key === 'Home') scroller.scrollTop = 0;
    else if (event.key === 'End') scroller.scrollTop = limit;
    else return;
    event.preventDefault();
  });
  update();
});
