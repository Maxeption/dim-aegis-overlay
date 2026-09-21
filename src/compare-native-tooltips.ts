import { COMPARE_BUCKET_SELECTOR, COMPARE_HEADER_SELECTOR } from './compare-selectors';
import { getCompareItem } from './compare-item';

// This adapter runs in DIM's main world. Only already-loaded modules are used;
// no remote scripts, fixed module IDs, Redux dispatches, or inventory writes.
type HostValue = any;
type HostRequire = ((id: string) => HostValue) & { m: Record<string, Function> };
type Runtime = { react: HostValue; createRoot: Function; overrideSockets: Function };
const selector = '[data-aegis-compare-generated][data-aegis-compare-perk-hash]';

export function discoverTooltipRuntime(host: Record<string, HostValue>): Runtime | undefined {
  const chunks = host.rspackChunkdim || host.webpackChunkdim;
  if (!Array.isArray(chunks)) return;
  let require: HostRequire | undefined;
  chunks.push([[`aegis-tooltip-${Date.now()}-${Math.random()}`], {}, (value: HostRequire) => { require = value; }]);
  if (!require?.m) return;
  const modules = Object.entries(require.m);
  const load = (match: (source: string) => boolean) => {
    const candidate = modules.find(([, factory]) => match(Function.prototype.toString.call(factory)));
    return candidate && require!(candidate[0]);
  };
  // Stable public React exports, plus DIM's pure socket-preview helper. Do not
  // execute arbitrary module factories while looking for a matching export.
  const react = load(source => /react\.(?:transitional\.)?element/.test(source) && source.includes('createElement') && source.includes('useState'));
  const renderer = load(source => /\.createRoot\s*=/.test(source));
  const preview = load(source => source.includes('Tried to override to a socket'));
  const overrideSockets = preview && Object.values(preview).find(value => typeof value === 'function' && String(value).includes('Tried to override to a socket'));
  if (typeof react?.createElement !== 'function' || typeof renderer?.createRoot !== 'function' || typeof overrideSockets !== 'function') return;
  return { react, createRoot: renderer.createRoot, overrideSockets };
}

function nativeContext(anchor: HTMLElement) {
  const sample = anchor.parentElement?.querySelector('[role="button"] svg, [data-aegis-overview-perk-hash] svg')?.parentElement;
  if (!sample) return;
  const key = Object.keys(sample).find(key => key.startsWith('__reactFiber$'));
  let fiber = key && (sample as HostValue)[key];
  let control: HostValue, template: HostValue, socket: HostValue;
  for (let i = 0; fiber && i < 120; i++, fiber = fiber.return) {
    const props = fiber.memoizedProps || {};
    if (!control && props.triggerRef && typeof props.open === 'boolean' && props.tooltip) {
      control = fiber.type;
      template = typeof props.tooltip === 'function' ? props.tooltip() : props.tooltip;
    }
    socket ||= props.socketInfo;
    if (props.store?.getState && control && template?.props?.plug && socket) {
      return { control, template, socket, provider: fiber.type, providerProps: props };
    }
  }
  return undefined;
}

/** Calculate the unavailable plug's stats using a copy, leaving all selections intact. */
export function prepareMissingPlug(item: HostValue, socketIndex: number, definition: HostValue, state: HostValue, overrideSockets: Function) {
  const socket = item.sockets?.allSockets.find((s: HostValue) => s.socketIndex === socketIndex);
  if (!socket?.plugged) return;
  const plug = { plugDef: definition, enabled: true, enableFailReasons: '', plugObjectives: [], stats: null };
  const copy = { ...item, sockets: { ...item.sockets, allSockets: item.sockets.allSockets.map((s: HostValue) =>
    s === socket ? { ...s, plugOptions: [...s.plugOptions, plug] } : s) } };
  // A same-perk override makes DIM calculate all option stats without selecting
  // the missing perk, equipping anything, or changing the Compare preview.
  const calculated = overrideSockets({ defs: state.manifest.d2Manifest, customStats: state.dimApi.settings.customStats }, copy,
    { [socketIndex]: socket.plugged.plugDef.hash });
  const calculatedPlug = calculated.sockets.allSockets.find((s: HostValue) => s.socketIndex === socketIndex)
    ?.plugOptions.find((p: HostValue) => p.plugDef.hash === definition.hash);
  return calculatedPlug && { item: calculated, plug: calculatedPlug };
}

export function initCompareNativeTooltips() {
  let runtime: Runtime | undefined;
  let active: HTMLElement | null = null;
  let root: HostValue;
  let mount: HTMLElement | null = null;
  let timer = 0;
  let describedBy: string | null = null;
  let hash = '';
  let sequence = 0;
  let resize: ResizeObserver | undefined;
  let positionFrame = 0;
  const removed = new MutationObserver(() => {
    if (active && (!active.isConnected || active.dataset.aegisComparePerkHash !== hash)) hide();
  });

  function hide() {
    clearTimeout(timer); timer = 0;
    resize?.disconnect(); resize = undefined;
    cancelAnimationFrame(positionFrame); positionFrame = 0;
    removed.disconnect();
    const previous = active; active = null;
    root?.unmount(); root = undefined;
    mount?.remove(); mount = null;
    if (previous) {
      previous.removeAttribute('data-aegis-compare-tooltip-open');
      if (describedBy === null) previous.removeAttribute('aria-describedby'); else previous.setAttribute('aria-describedby', describedBy);
    }
  }

  function show(anchor: HTMLElement) {
    hide();
    if (!anchor.isConnected || !anchor.closest('[data-aegis-compare-slot]') || anchor.closest('[data-aegis-covered-by-armory]')) return;
    try {
      runtime ||= discoverTooltipRuntime(window as unknown as Record<string, HostValue>);
      const context = runtime && nativeContext(anchor);
      if (!runtime || !context) return; // Retain the accessible name if DIM cannot render a rich tooltip.
      const state = context.providerProps.store.getState();
      const definition = state.manifest.d2Manifest?.InventoryItem.get(Number(anchor.dataset.aegisComparePerkHash));
      if (!definition?.plug) return;
      let item = context.template.props.item;
      const bucket = anchor.closest(COMPARE_BUCKET_SELECTOR);
      const tile = bucket && [...bucket.querySelectorAll<HTMLElement>(COMPARE_HEADER_SELECTOR)]
        .flatMap(header => [...header.querySelectorAll<HTMLElement>('.item[data-aegis-instance-id]')])
        .find(tile => tile.dataset.aegisInstanceId === item.id);
      if (tile) item = getCompareItem(tile, item);
      const preview = prepareMissingPlug(item, context.socket.socketIndex, definition, state, runtime.overrideSockets);
      if (!preview) return;
      active = anchor; hash = anchor.dataset.aegisComparePerkHash!;
      describedBy = anchor.getAttribute('aria-describedby');
      anchor.setAttribute('data-aegis-compare-tooltip-open', ''); anchor.removeAttribute('title');
      mount = document.createElement('span'); mount.className = 'aegis-compare-tooltip-mount'; anchor.append(mount);
      const { react } = runtime;
      const tooltipId = `aegis-compare-native-tooltip-${++sequence}`;
      const tooltip = react.createElement('div', {
        'data-aegis-compare-tooltip-content': '',
        ref: (content: HTMLElement | null) => {
          // PressTip owns this portal; mark its outer tooltip for accessibility
          // and diagnostics without changing any of its styling or content.
          const outer = content?.parentElement?.parentElement;
          if (outer && active === anchor) {
            outer.id = tooltipId; outer.setAttribute('role', 'tooltip');
            outer.setAttribute('data-aegis-compare-native-tooltip', '');
            anchor.setAttribute('aria-describedby', [describedBy, tooltipId].filter(Boolean).join(' '));
            // Native customization adds the header after the first render.
            // Re-run DIM's positioning when the finished tooltip changes size.
            if (!resize) {
              resize = new ResizeObserver(() => {
                cancelAnimationFrame(positionFrame);
                positionFrame = requestAnimationFrame(renderTooltip);
              });
              resize.observe(outer);
            }
          }
        },
      }, react.cloneElement(context.template, { ...preview, wishlistRoll: undefined, craftingData: undefined }));
      root = runtime.createRoot(mount, { onUncaughtError: () => { queueMicrotask(hide); } });
      function renderTooltip() {
        positionFrame = 0;
        if (active !== anchor || !root) return;
        root.render(react.createElement(context!.provider, {
          ...context!.providerProps,
          children: react.createElement(context!.control, {
            tooltip, open: true, triggerRef: { current: null }, style: { width: '100%', height: '100%' },
          }),
        }));
      }
      renderTooltip();
      removed.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-aegis-compare-perk-hash'] });
    } catch {
      hide(); // An incompatible DIM release must not break its own perk grid.
    }
  }

  function enter(event: Event) {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
    if (!anchor || anchor === active) return;
    hide();
    timer = window.setTimeout(() => show(anchor), event.type === 'focusin' ? 0 : event.type === 'pointerdown' ? 300 : 100);
  }
  function leave(event: Event) {
    const anchor = event.target instanceof Element ? event.target.closest(selector) : null;
    const related = (event as PointerEvent | FocusEvent).relatedTarget;
    if (anchor && !(related instanceof Node && anchor.contains(related))) hide();
  }
  document.addEventListener('pointerover', enter);
  document.addEventListener('pointerdown', enter);
  document.addEventListener('focusin', enter);
  document.addEventListener('pointerout', leave);
  document.addEventListener('pointerup', leave);
  document.addEventListener('pointercancel', leave);
  document.addEventListener('focusout', leave);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('aegis-compare-tooltips-hide', hide);
  document.addEventListener('aegis-popup-layer-changed', () => {
    if (active?.closest('[data-aegis-covered-by-armory]')) hide();
  });
}
