/**
 * Diagram toolbar drag, snap, and orientation (mobile + desktop).
 * Strangler Fig: extracted from app.js. Viewport mode injected via initDiagramToolbarDrag(options.getViewportMode).
 */

const DIAGRAM_TOOLBAR_STORAGE_KEY_X = 'quoteApp_diagramToolbarX';
const DIAGRAM_TOOLBAR_STORAGE_KEY_Y = 'quoteApp_diagramToolbarY';
const DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION = 'quoteApp_diagramToolbarOrientation';
const DIAGRAM_TOOLBAR_STORAGE_KEY_COLLAPSED = 'quoteApp_diagramToolbarCollapsed';
const DIAGRAM_TOOLBAR_EDGE_THRESHOLD = 0.2; // left 20% / right 80% of wrap width → vertical
const DIAGRAM_TOOLBAR_EDGE_THRESHOLD_TOP = 0.2;   // top 20% of wrap height → horizontal
const DIAGRAM_TOOLBAR_EDGE_THRESHOLD_BOTTOM = 0.8; // bottom 20% (Y >= 80%) → horizontal
const DIAGRAM_TOOLBAR_EDGE_SNAP_PAD = 12;
const DIAGRAM_TOOLBAR_COLLAPSE_TAP_SUPPRESS_MS = 260;
/* 54.56–54.60: Mobile always-thin edge-only – see docs/plans/2026-02-20-mobile-diagram-toolbar-always-thin-edge-only.md. Add mobile-only snap-to-edge; do not remove current desktop or orientation behaviour. */

/** 54.33: Cleanup from previous initDiagramToolbarDrag run (listeners + ResizeObserver). Run before re-init to avoid duplicates. */
let diagramToolbarDragCleanup = null;

function getDiagramToolbarWrap() {
  const toolbar = document.getElementById('diagramFloatingToolbar');
  return toolbar ? toolbar.closest('.blueprint-wrap') : null;
}

function applyDiagramToolbarPosition(toolbar, x, y, orientation) {
  if (!toolbar) return;
  toolbar.style.left = x + 'px';
  toolbar.style.top = y + 'px';
  toolbar.style.transform = 'none';
  toolbar.setAttribute('data-orientation', orientation || 'horizontal');
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 54.64: Mobile-only top safe offset so diagram toolbar never tucks under the global header/notch. */
function getDiagramToolbarTopPad(wrapRect, basePad, getViewportMode) {
  if (getViewportMode() !== 'mobile') return basePad;
  const globalToolbarWrap = document.getElementById('globalToolbarWrap');
  if (!globalToolbarWrap || !wrapRect) return basePad;
  const headerBottom = globalToolbarWrap.getBoundingClientRect().bottom;
  const overlap = headerBottom - wrapRect.top;
  if (overlap <= 0) return basePad;
  return Math.max(basePad, Math.round(overlap + basePad));
}

function computeMobileToolbarEdgeSnap(toolbar, wrap, options = {}, getViewportMode) {
  if (!toolbar || !wrap || getViewportMode() !== 'mobile') return null;
  const wrapRect = wrap.getBoundingClientRect();
  const toolRect = toolbar.getBoundingClientRect();
  const pad = Number.isFinite(options.pad) ? options.pad : DIAGRAM_TOOLBAR_EDGE_SNAP_PAD;
  if (wrapRect.width < 20 || wrapRect.height < 20) {
    return { edge: 'top', orientation: 'horizontal', pad };
  }
  const left = toolRect.left - wrapRect.left;
  const top = toolRect.top - wrapRect.top;
  const topPad = getDiagramToolbarTopPad(wrapRect, pad, getViewportMode);
  const maxTop = wrapRect.height - toolRect.height - pad;
  const topAnchor = Math.min(topPad, maxTop);
  const distances = {
    top: Math.abs(top - topAnchor),
    bottom: Math.abs((wrapRect.height - pad) - (top + toolRect.height)),
    left: Math.abs(left - pad),
    right: Math.abs((wrapRect.width - pad) - (left + toolRect.width)),
  };
  let edge = null;
  const dragDelta = options.dragDelta;
  if (dragDelta && Number.isFinite(dragDelta.dx) && Number.isFinite(dragDelta.dy)) {
    const absX = Math.abs(dragDelta.dx);
    const absY = Math.abs(dragDelta.dy);
    const INTENT_MIN_DELTA = 18;
    const INTENT_DOMINANCE_RATIO = 1.25;
    if (absX >= INTENT_MIN_DELTA || absY >= INTENT_MIN_DELTA) {
      if (absX >= absY * INTENT_DOMINANCE_RATIO) {
        edge = dragDelta.dx >= 0 ? 'right' : 'left';
      } else if (absY >= absX * INTENT_DOMINANCE_RATIO) {
        edge = dragDelta.dy >= 0 ? 'bottom' : 'top';
      }
    }
  }
  if (!edge) {
    edge = 'top';
    let minDistance = distances.top;
    for (const key of ['bottom', 'left', 'right']) {
      if (distances[key] < minDistance) {
        minDistance = distances[key];
        edge = key;
      }
    }
  }
  const orientation = edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal';
  return { edge, orientation, pad };
}

function applyMobileToolbarEdgeSnap(toolbar, wrap, snap, getViewportMode) {
  if (!toolbar || !wrap || !snap || getViewportMode() !== 'mobile') return;
  const wrapRect = wrap.getBoundingClientRect();
  const pad = Number.isFinite(snap.pad) ? snap.pad : DIAGRAM_TOOLBAR_EDGE_SNAP_PAD;
  const topPad = getDiagramToolbarTopPad(wrapRect, pad, getViewportMode);
  const edge = snap.edge || 'top';
  const orientation = snap.orientation || (edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal');
  toolbar.setAttribute('data-orientation', orientation);
  const toolRect = toolbar.getBoundingClientRect();
  const tw = toolRect.width;
  const th = toolRect.height;
  const maxLeft = Math.max(pad, wrapRect.width - tw - pad);
  const maxTop = wrapRect.height - th - pad;
  const minTop = Math.min(topPad, maxTop);
  let left = parseFloat(toolbar.style.left) || 0;
  let top = parseFloat(toolbar.style.top) || 0;

  if (edge === 'top') {
    left = (wrapRect.width - tw) / 2;
    top = topPad;
  } else if (edge === 'bottom') {
    left = (wrapRect.width - tw) / 2;
    top = maxTop;
  } else if (edge === 'left') {
    left = pad;
    top = (wrapRect.height - th) / 2;
  } else {
    left = wrapRect.width - tw - pad;
    top = (wrapRect.height - th) / 2;
  }

  left = clampNumber(left, pad, maxLeft);
  top = clampNumber(top, minTop, maxTop);
  applyDiagramToolbarPosition(toolbar, left, top, orientation);
  localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_X, String(Math.round(left)));
  localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_Y, String(Math.round(top)));
  localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION, orientation);
}

function clampDiagramToolbarToWrap(toolbar, wrap, getViewportMode) {
  if (!toolbar || !wrap) return;
  const wrapRect = wrap.getBoundingClientRect();
  const toolRect = toolbar.getBoundingClientRect();
  const ww = wrapRect.width;
  const wh = wrapRect.height;
  const pad = 8;
  const topPad = getDiagramToolbarTopPad(wrapRect, pad, getViewportMode);
  /* When wrap has no size (e.g. mobile layout not yet ready), put toolbar at safe position so it doesn't stay off-screen. */
  if (ww < 20 || wh < 20) {
    toolbar.style.left = pad + 'px';
    toolbar.style.top = topPad + 'px';
    return;
  }
  const tw = toolRect.width;
  const th = toolRect.height;
  let left = parseFloat(toolbar.style.left) || 0;
  let top = parseFloat(toolbar.style.top) || 0;
  if (getViewportMode() === 'mobile') {
    const maxLeft = Math.max(pad, ww - tw - pad);
    const maxTop = wh - th - pad;
    const minTop = Math.min(topPad, maxTop);
    left = clampNumber(left, pad, maxLeft);
    top = clampNumber(top, minTop, maxTop);
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    return;
  }
  const isVertical = toolbar.getAttribute('data-orientation') === 'vertical';
  const maxTop = wh - (isVertical ? tw : th) - pad;
  const minTop = Math.min(topPad, maxTop);
  left = Math.max(pad, Math.min(ww - (isVertical ? th : tw) - pad, left));
  top = Math.max(minTop, Math.min(maxTop, top));
  toolbar.style.left = left + 'px';
  toolbar.style.top = top + 'px';
}

export function initDiagramToolbarDrag(options = {}) {
  const getViewportMode = options.getViewportMode || (() => 'desktop');

  const toolbar = document.getElementById('diagramFloatingToolbar');
  const dragHandle = document.getElementById('diagramToolbarDragHandle');
  const wrap = getDiagramToolbarWrap();
  if (!toolbar || !dragHandle || !wrap) return;

  if (typeof diagramToolbarDragCleanup === 'function') {
    diagramToolbarDragCleanup();
    diagramToolbarDragCleanup = null;
  }

  const wrapRect = wrap.getBoundingClientRect();
  const toolRect = toolbar.getBoundingClientRect();
  let orient = localStorage.getItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION) || (getViewportMode() === 'mobile' ? 'vertical' : 'horizontal');
  let x = Number(localStorage.getItem(DIAGRAM_TOOLBAR_STORAGE_KEY_X));
  let y = Number(localStorage.getItem(DIAGRAM_TOOLBAR_STORAGE_KEY_Y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (getViewportMode() === 'mobile') {
      x = 12;
      y = getDiagramToolbarTopPad(wrapRect, 12, getViewportMode);
    } else {
      x = (wrapRect.width - toolRect.width) / 2;
      y = 12;
    }
  }
  applyDiagramToolbarPosition(toolbar, x, y, orient);
  if (getViewportMode() === 'mobile') {
    clampDiagramToolbarToWrap(toolbar, wrap, getViewportMode);
    applyMobileToolbarEdgeSnap(toolbar, wrap, computeMobileToolbarEdgeSnap(toolbar, wrap, {}, getViewportMode), getViewportMode);
  }
  dragHandle.setAttribute('aria-label', 'Drag to move toolbar');
  dragHandle.title = 'Drag to move toolbar';
  dragHandle.style.display = 'block';

  const collapseBtn = document.getElementById('diagramToolbarCollapseBtn');
  /* Default to expanded (fully visible); on mobile always start expanded so app opens with toolbar visible. */
  let collapsed = localStorage.getItem(DIAGRAM_TOOLBAR_STORAGE_KEY_COLLAPSED) === 'true';
  if (getViewportMode() === 'mobile') collapsed = false;
  if (collapseBtn) {
    toolbar.classList.toggle('diagram-floating-toolbar--collapsed', collapsed);
    collapseBtn.setAttribute('aria-expanded', !collapsed);
    collapseBtn.setAttribute('aria-label', collapsed ? 'Expand toolbar' : 'Collapse toolbar');
    collapseBtn.title = collapsed ? 'Expand toolbar' : 'Collapse toolbar';
  }

  let dragStartX = 0;
  let dragStartY = 0;
  let toolbarStartLeft = 0;
  let toolbarStartTop = 0;
  let dragPointerId = null;
  let didDragThisSession = false;
  let lastDragEndAt = 0;
  let suppressNextExpandTap = false;

  /* Zone logic (54.41, 54.48): same for desktop and mobile – top/bottom 20% → horizontal; left/right 20% → vertical; else horizontal. */
  function updateOrientationFromPosition(opts = {}) {
    if (getViewportMode() === 'mobile') {
      applyMobileToolbarEdgeSnap(toolbar, wrap, computeMobileToolbarEdgeSnap(toolbar, wrap, opts, getViewportMode), getViewportMode);
      return;
    }
    const wr = wrap.getBoundingClientRect();
    const tr = toolbar.getBoundingClientRect();
    const centerX = tr.left - wr.left + tr.width / 2;
    const centerY = tr.top - wr.top + tr.height / 2;
    const pad = 12;
    const topPad = getDiagramToolbarTopPad(wr, pad, getViewportMode);
    /* Top 20% and bottom 20% of wrap height → horizontal; left/right 20% (middle strip) → vertical. */
    const topZone = wr.height * DIAGRAM_TOOLBAR_EDGE_THRESHOLD_TOP;           /* Y <= this = top 20% */
    const bottomZone = wr.height * DIAGRAM_TOOLBAR_EDGE_THRESHOLD_BOTTOM;   /* Y >= this = bottom 20% */
    const leftZone = wr.width * DIAGRAM_TOOLBAR_EDGE_THRESHOLD;             /* X <= this = left 20% */
    const rightZone = wr.width * (1 - DIAGRAM_TOOLBAR_EDGE_THRESHOLD);      /* X >= this = right 20% */

    if (centerY <= topZone) {
      toolbar.setAttribute('data-orientation', 'horizontal');
      const maxTop = wr.height - toolbar.getBoundingClientRect().height - pad;
      const topSnap = Math.max(pad, Math.min(topPad, maxTop));
      toolbar.style.top = topSnap + 'px';
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_Y, String(Math.round(topSnap)));
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION, 'horizontal');
    } else if (centerY >= bottomZone) {
      toolbar.setAttribute('data-orientation', 'horizontal');
      const th = toolbar.getBoundingClientRect().height;
      const newTop = wr.height - th - pad;
      toolbar.style.top = newTop + 'px';
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_Y, String(Math.round(newTop)));
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION, 'horizontal');
    } else if (centerX <= leftZone) {
      toolbar.setAttribute('data-orientation', 'vertical');
      toolbar.style.left = pad + 'px';
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_X, String(pad));
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION, 'vertical');
    } else if (centerX >= rightZone) {
      toolbar.setAttribute('data-orientation', 'vertical');
      const tw = toolbar.getBoundingClientRect().width;
      const newLeft = wr.width - tw - pad;
      toolbar.style.left = newLeft + 'px';
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_X, String(Math.round(newLeft)));
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION, 'vertical');
    } else {
      toolbar.setAttribute('data-orientation', 'horizontal');
      localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_ORIENTATION, 'horizontal');
    }
  }

  function shouldSuppressExpandAfterDrag(now = Date.now()) {
    if (!toolbar.classList.contains('diagram-floating-toolbar--collapsed')) return false;
    if (!suppressNextExpandTap) return false;
    return now - lastDragEndAt <= DIAGRAM_TOOLBAR_COLLAPSE_TAP_SUPPRESS_MS;
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    /* When collapsed, tap on + must fire click to expand; only preventDefault if we're not on the expand button. */
    const isTapOnExpandBtn = collapseBtn && (e.target === collapseBtn || collapseBtn.contains(e.target)) && toolbar.classList.contains('diagram-floating-toolbar--collapsed');
    if (!isTapOnExpandBtn) {
      e.preventDefault();
    }
    e.stopPropagation();
    dragPointerId = e.pointerId;
    didDragThisSession = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    toolbarStartLeft = parseFloat(toolbar.style.left) || 0;
    toolbarStartTop = parseFloat(toolbar.style.top) || 0;
    toolbar.style.transition = 'none';
    dragHandle.style.cursor = 'grabbing';
    if (collapseBtn && toolbar.classList.contains('diagram-floating-toolbar--collapsed')) collapseBtn.style.cursor = 'grabbing';
    try {
      toolbar.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  /* Movement threshold (px²): above this counts as drag so tap-to-expand still fires. 5px was too low (mobile wobble). */
  const DRAG_THRESHOLD_PX_SQ = 100; // ~10px
  function onPointerMove(e) {
    if (dragPointerId == null || e.pointerId !== dragPointerId) return;
    e.preventDefault();
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX_SQ) didDragThisSession = true;
    const wrapRect = wrap.getBoundingClientRect();
    const toolRect = toolbar.getBoundingClientRect();
    const isVertical = toolbar.getAttribute('data-orientation') === 'vertical';
    const useRealDimensions = getViewportMode() === 'mobile';
    const tw = useRealDimensions ? toolRect.width : (isVertical ? toolRect.height : toolRect.width);
    const th = useRealDimensions ? toolRect.height : (isVertical ? toolRect.width : toolRect.height);
    const topPad = getDiagramToolbarTopPad(wrapRect, 8, getViewportMode);
    const maxTop = wrapRect.height - th - 8;
    const minTop = Math.min(topPad, maxTop);
    let newLeft = toolbarStartLeft + dx;
    let newTop = toolbarStartTop + dy;
    newLeft = Math.max(8, Math.min(wrapRect.width - tw - 8, newLeft));
    newTop = Math.max(minTop, Math.min(maxTop, newTop));
    toolbar.style.left = newLeft + 'px';
    toolbar.style.top = newTop + 'px';
  }

  function onPointerUp(e) {
    if (e.pointerId !== dragPointerId) return;
    dragPointerId = null;
    try {
      toolbar.releasePointerCapture(e.pointerId);
      dragHandle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    toolbar.style.transition = '';
    dragHandle.style.cursor = '';
    if (collapseBtn) collapseBtn.style.cursor = '';
    clampDiagramToolbarToWrap(toolbar, wrap, getViewportMode);
    const dragDelta = { dx: e.clientX - dragStartX, dy: e.clientY - dragStartY };
    updateOrientationFromPosition({ dragDelta });
    lastDragEndAt = Date.now();
    suppressNextExpandTap = !!didDragThisSession;
    const finalLeft = parseFloat(toolbar.style.left) || 0;
    const finalTop = parseFloat(toolbar.style.top) || 0;
    localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_X, String(Math.round(finalLeft)));
    localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_Y, String(Math.round(finalTop)));
  }

  function onPointerCancel(e) {
    if (e.pointerId === dragPointerId) {
      dragPointerId = null;
      try {
        toolbar.releasePointerCapture(e.pointerId);
        dragHandle.releasePointerCapture(e.pointerId);
      } catch (_) {}
      toolbar.style.transition = '';
      dragHandle.style.cursor = '';
      applyDiagramToolbarPosition(toolbar, parseFloat(toolbar.style.left) || 0, parseFloat(toolbar.style.top) || 0, toolbar.getAttribute('data-orientation') || 'horizontal');
    }
  }

  function onCollapseClick() {
    /* Suppress only the synthetic click that immediately follows a real drag gesture. */
    if (shouldSuppressExpandAfterDrag()) {
      suppressNextExpandTap = false;
      return;
    }
    suppressNextExpandTap = false;
    const collapsed = toolbar.classList.toggle('diagram-floating-toolbar--collapsed');
    localStorage.setItem(DIAGRAM_TOOLBAR_STORAGE_KEY_COLLAPSED, String(collapsed));
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', !collapsed);
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand toolbar' : 'Collapse toolbar');
      collapseBtn.title = collapsed ? 'Expand toolbar' : 'Collapse toolbar';
    }
    /* Keep collapsed pill on-screen (no jumping off or requiring scroll). On mobile, use two frames so collapsed 44×44 layout is applied before clamp. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        clampDiagramToolbarToWrap(toolbar, wrap, getViewportMode);
        if (getViewportMode() === 'mobile') {
          applyMobileToolbarEdgeSnap(toolbar, wrap, computeMobileToolbarEdgeSnap(toolbar, wrap, {}, getViewportMode), getViewportMode);
        }
      });
    });
  }

  const toolbarPointerDownHandler = (e) => {
    if (e.target === dragHandle || dragHandle.contains(e.target)) {
      onPointerDown(e);
      return;
    }
    /* When collapsed, the + button is the only draggable area (drag handle is hidden). */
    const isCollapsed = toolbar.classList.contains('diagram-floating-toolbar--collapsed');
    if (collapseBtn && (e.target === collapseBtn || collapseBtn.contains(e.target))) {
      if (isCollapsed) onPointerDown(e);
      return;
    }
    /* 54.77: Do not start toolbar drag when touch starts inside tools-wrap so horizontal scroll works. */
    if ((e.target instanceof Element) && e.target.closest('.diagram-toolbar-tools-wrap')) return;
    if ((e.target instanceof Element) && (e.target.closest('button, label, input') || e.target.closest('.toolbar-pill-btn'))) return;
    onPointerDown(e);
  };

  dragHandle.addEventListener('pointerdown', onPointerDown, { capture: true });
  toolbar.addEventListener('pointerdown', toolbarPointerDownHandler, { capture: true });
  if (collapseBtn) collapseBtn.addEventListener('click', onCollapseClick);
  document.addEventListener('pointermove', onPointerMove, { capture: true });
  document.addEventListener('pointerup', onPointerUp, { capture: true });
  document.addEventListener('pointercancel', onPointerCancel, { capture: true });

  const ro = new ResizeObserver(() => {
    if (dragPointerId != null) return;
    clampDiagramToolbarToWrap(toolbar, getDiagramToolbarWrap(), getViewportMode);
    updateOrientationFromPosition();
  });
  ro.observe(wrap);

  diagramToolbarDragCleanup = () => {
    document.removeEventListener('pointermove', onPointerMove, { capture: true });
    document.removeEventListener('pointerup', onPointerUp, { capture: true });
    document.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    ro.disconnect();
    dragHandle.removeEventListener('pointerdown', onPointerDown, { capture: true });
    toolbar.removeEventListener('pointerdown', toolbarPointerDownHandler, { capture: true });
    if (collapseBtn) collapseBtn.removeEventListener('click', onCollapseClick);
  };
}
