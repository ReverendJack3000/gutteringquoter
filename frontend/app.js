/**
 * Quote App – blueprint canvas, Marley panel, Canva-style elements (select, move, resize, rotate).
 */

import { initDiagramToolbarDrag } from './toolbar.js';

const state = {
  canvas: null,
  ctx: null,
  blueprintImage: null,
  originalFile: null,
  blueprintTransform: null, // { x, y, w, h, rotation } when blueprint present; same coord system as elements
  blueprintImageSourceUrl: null, // when blueprint was loaded from API (saved project), so we can re-persist it if canvas export fails (CORS)
  selectedBlueprint: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  viewZoom: 1,   // user zoom multiplier (1 = fit); <1 zoom out, >1 zoom in
  viewPanX: 0,
  viewPanY: 0,
  fitPanFeedbackX: 0, // mobile-only: subtle resistance feedback when trying to pan at fit (viewZoom = 1)
  fitPanFeedbackY: 0,
  baseScale: 1,  // last computed fit scale (for zoom toward cursor)
  baseOffsetX: 0,
  baseOffsetY: 0,
  elements: [],
  selectedId: null,
  selectedIds: [], // multi-select; selectedId === selectedIds[0]
  groups: [], // { id: string, elementIds: string[] }
  dragOffset: { x: 0, y: 0 },
  mode: null, // 'move' | 'move-primed' | 'resize' | 'rotate' | 'blueprint-move' | 'blueprint-resize' | 'blueprint-rotate' | 'pan' | 'pan-resist' | 'pinch' | 'element-transform'
  resizeHandle: null,
  products: [],
  profileFilter: '', // '' | 'storm_cloud' | 'classic' | 'other'
  sizeFilter: '', // '' | '65' | '80' – Marley panel 65 mm / 80 mm dropdown
  technicalDrawing: true,
  snapshotAtActionStart: null, // for undo: state before current interaction
  hoveredId: null, // element id under cursor when not dragging (for hover outline/cursor)
  dragGhostX: null, // original x when moving (for ghost at 20% opacity)
  dragGhostY: null,
  currentRotationAngle: 0, // for tooltip during rotate
  // Delta-based move: last canvas pos (for delta) and pending client pos (throttled 60fps)
  dragLastCanvasX: null,
  dragLastCanvasY: null,
  pendingMouseClientX: null,
  pendingMouseClientY: null,
  hoveredHandleId: null,
  activeGuides: [], // { axis: 'vertical'|'horizontal', pos: number } for drawing
  // Preview layer (zero-latency drag): commit on pointerup
  previewDragX: null,
  previewDragY: null,
  dragMoveIds: [], // ids being moved
  dragRelativeOffsets: [], // { id, dx, dy } relative to primary
  snapPopStartTime: null, // when non-null, play pop animation on these elements
  snapPopElementIds: [],
  marqueeStart: null, // { x, y } canvas coords when starting marquee drag
  marqueeCurrent: null, // { x, y } canvas coords during drag
  nextSequenceId: 1, // Digital Takeoff: assign sequenceId to measurable elements (gutters, downpipes, droppers)
  bboxRecalcDeferredUntil: null, // timestamp: skip full-doc bbox recalc until after this (debounce after drag)
  projectName: '', // editable project name in header; drives save modal default
  debounceBboxTimerId: null, // timeout id for 100ms debounce
  // Ghost preview while dragging from panel over canvas (40% opacity, 150px max)
  dragPreviewImage: null,
  dragPreviewCanvasPos: null,
  // Resize: throttle updates with RAF for smooth movement (one update per frame)
  pendingResizeCanvasPos: null,
  pendingResizeAltKey: false, // Alt = allow warp; default lockAspectRatio = true
  resizeRAFId: null,
  // 54.17: Pinch zoom – active pointers and pinch start state
  activePointers: {}, // pointerId -> { clientX, clientY }
  pinchStartDistance: 0,
  pinchStartCenter: null, // { x, y } client
  pinchStartContentX: 0,
  pinchStartContentY: 0,
  pinchStartViewZoom: 1,
  pinchStartViewPanX: 0,
  pinchStartViewPanY: 0,
  // 54.61: Mobile selected-element two-finger transform state
  elementTransformPointerIds: null, // [pointerIdA, pointerIdB]
  elementTransformStart: null, // { centerX, centerY, midX, midY, distance, angle, width, height, rotation }
  // 54.62: Mobile tap-first move gating (avoid accidental drags on tap)
  movePrimeStartClientX: 0,
  movePrimeStartClientY: 0,
  colorPaletteOpen: false, // toggled by floating toolbar colour button; when true, show #colorPalettePopover below toolbar
  transparencyPopoverOpen: false, // toggled by #blueprintTransparencyBtn; only way to open transparency slider
  badgeLengthEditElementId: null, // when badge length popover is open, the element id being edited
  floatingToolbarUserMoved: false, // 54.20: when true, draw() does not reposition the element toolbar
};

/** Auth: token, user, and Supabase client for saved diagrams and product uploads. */
const authState = { token: null, email: null, user: null, supabase: null };

/** View transition history for restoring focus when returning between app views (55.2). */
const viewTransitionHistory = [];

const ACCESSIBILITY_PREFS_STORAGE_KEY = 'quote_app_accessibility_prefs_v1';
const accessibilityPrefs = {
  motion: 'system', // 'system' | 'reduce' | 'full'
  largeControls: false,
  highContrast: false,
};

/** Custom products (Product Library): persisted in localStorage under 'custom_products'. */
let localProducts = [];

/** Product currently being edited in the modal; null when in Create mode. */
let currentEditingProduct = null;

/** Opens the product modal in Create or Edit mode. Set by initProductsView. */
let openProductModal = null;

/** Full list of products fetched for the Product Library; used for search/filter without re-fetching. */
let allLibraryProducts = [];

/** Snapshot of canvas + view + project name before loading a saved diagram; used for "Go back to previous". */
let preLoadSnapshot = null;

/** Active cleanup hook for the shared badge-length popover session (ruler + badge double-click). */
let badgeLengthPopoverSessionCleanup = null;

/** Product IDs that are consumables (billing only); excluded from canvas/panel drag-drop. */
const CONSUMABLE_PRODUCT_IDS = ['SCR-SS', 'GL-MAR', 'MS-GRY'];

/** Legacy placeholder product IDs – excluded from Marley panel (real products from Supabase only). */
const PLACEHOLDER_PRODUCT_IDS = ['gutter', 'downpipe', 'bracket', 'stopend', 'outlet', 'dropper'];

/** Labour product ID(s) – excluded from Marley panel and quote Add item; labour is only via dedicated labour row(s). */
const LABOUR_PRODUCT_IDS = ['REP-LAB'];

/** Max size for product diagram SVG upload (2MB). */
const PRODUCT_SVG_MAX_SIZE_BYTES = 2 * 1024 * 1024;

/** SVG dimension threshold above which we warn about performance (px). */
const PRODUCT_SVG_DIMENSION_WARN_PX = 5000;

/** System products fallback when user is logged out (empty; real products come from Supabase when signed in). */
const SYSTEM_PRODUCTS = [];

/** Gutter pattern: GUT-{SC|CL}-MAR-{1.5|3|5}M (matches backend). */
const GUTTER_PATTERN = /^GUT-(SC|CL)-MAR-(\d+(?:\.\d+)?)M$/i;

/** Profile display names for system-based quote headers. */
const PROFILE_DISPLAY_NAMES = { SC: 'Storm Cloud', CL: 'Classic' };

/** Extract profile code (SC|CL) from gutter/bracket asset ID; null for shared items (screws). */
function getProfileFromAssetId(assetId) {
  if (!assetId || typeof assetId !== 'string') return null;
  const m = GUTTER_PATTERN.exec(assetId.trim());
  if (m) return m[1].toUpperCase();
  const u = String(assetId).toUpperCase();
  if (u.startsWith('BRK-SC-') || u.startsWith('BRK-CL-')) return u.includes('SC') ? 'SC' : 'CL';
  return null;
}

/** Get gutter length in metres from asset ID (e.g. GUT-SC-MAR-5M → 5). */
function getGutterLengthMetres(assetId) {
  const m = GUTTER_PATTERN.exec(String(assetId || '').trim());
  return m ? parseFloat(m[2]) : 0;
}

/** Sort key for child items: 1=gutters (longest first), 2=brackets, 3=screws. */
function getChildSortOrder(assetId) {
  const u = String(assetId || '').toUpperCase();
  if (u.startsWith('SCR-')) return { group: 3, length: 0 };
  if (u.startsWith('BRK-')) return { group: 2, length: 0 };
  const m = GUTTER_PATTERN.exec(assetId.trim());
  if (m) return { group: 1, length: -parseFloat(m[2]) }; // negate for descending
  return { group: 4, length: 0 };
}

/** Quote modal display names for manual-length products (type only, no metre in name). */
const QUOTE_PRODUCT_DISPLAY_OVERRIDES = {
  'GUT-SC-MAR-3M': 'Gutter: Storm Cloud Marley',
  'GUT-CL-MAR-3M': 'Gutter: Classic Marley',
  'DP-65-1.5M': '65 MM downpipe 1.5m',
  'DP-65-3M': '65 MM downpipe 3m',
  'DP-80-1.5M': '80 MM downpipe 1.5m',
  'DP-80-3M': '80 MM downpipe 3m',
};
function getQuoteProductDisplayName(assetId, fallbackName) {
  if (QUOTE_PRODUCT_DISPLAY_OVERRIDES[assetId]) return QUOTE_PRODUCT_DISPLAY_OVERRIDES[assetId];
  return fallbackName != null ? fallbackName : (state.products.find((p) => p.id === assetId)?.name) || assetId;
}

/** Available gutter stock lengths (mm). Used for bin-packing to minimize waste. */
const GUTTER_STOCK_LENGTHS_MM = [5000, 3000, 1500];

/** Downpipe pattern: DP-65-* or DP-80-* (1.5m, 3m only; 6m archived). */
const DOWNPIPE_PATTERN = /^DP-(65|80)-(\d+(?:\.\d+)?)M$/i;

/** Downpipe stock lengths (mm). 1.5m and 3m only. */
const DOWNPIPE_STOCK_LENGTHS_MM = [3000, 1500];

/** Product ID for a downpipe of given size (65|80) and length (mm). e.g. 65, 3000 -> DP-65-3M */
function downpipeProductIdForLength(size, lengthMm) {
  const m = lengthMm / 1000;
  return `DP-${size}-${m}M`;
}

/** True if asset is a main downpipe (DP-65-*, DP-80-*), not a joiner (DPJ-*). */
function isDownpipeElement(assetId) {
  if (!assetId || typeof assetId !== 'string') return false;
  const a = assetId.trim().toUpperCase();
  return (a.startsWith('DP-65-') || a.startsWith('DP-80-')) && !a.startsWith('DPJ-');
}

/** Extract size (65|80) from downpipe asset ID, or null. */
function getDownpipeSizeFromAssetId(assetId) {
  const m = DOWNPIPE_PATTERN.exec(String(assetId || '').trim());
  return m ? m[1] : null;
}

/**
 * Extract 65 or 80 mm size from any product ID (downpipes, joiners, clips, elbows, outlets, etc.), or null if size-agnostic.
 * Used by the Marley panel 65/80 mm filter.
 */
function getProductSizeMm(productId) {
  if (!productId || typeof productId !== 'string') return null;
  const id = String(productId).trim();
  const dp = getDownpipeSizeFromAssetId(id);
  if (dp) return dp;
  const m = id.match(/-65$|-80$/i);
  return m ? (id.endsWith('65') ? '65' : '80') : null;
}

/** Get downpipe length in metres from asset ID (e.g. DP-65-3M -> 3). */
function getDownpipeLengthMetres(assetId) {
  const m = DOWNPIPE_PATTERN.exec(String(assetId || '').trim());
  return m ? parseFloat(m[2]) : 0;
}

/** Sort key for downpipe section children: 1 = downpipes (longest first), 2 = clips. */
function getDownpipeChildSortOrder(assetId) {
  const id = String(assetId || '').toUpperCase();
  if (id.startsWith('SCL-') || id.startsWith('ACL-')) return { group: 2, length: 0 };
  const m = DOWNPIPE_PATTERN.exec(String(assetId || '').trim());
  if (m) return { group: 1, length: -getDownpipeLengthMetres(assetId) }; // negate for descending
  return { group: 3, length: 0 };
}

/** Product ID for a gutter of given profile and length (mm). e.g. 3000, "SC" -> GUT-SC-MAR-3M */
function gutterProductIdForLength(profile, lengthMm) {
  const m = lengthMm / 1000;
  return `GUT-${profile}-MAR-${m}M`;
}
/** Convert mm to metres for display. */
function mmToM(mm) {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return null;
  return mm / 1000;
}

/** Format mm as "Xm" or "X.XXm" for display (max 3 decimals, trim trailing zeros). */
function formatMetres(mm) {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return '';
  const m = mm / 1000;
  const s = m % 1 === 0 ? String(m) : m.toFixed(3).replace(/\.?0+$/, '');
  return s + 'm';
}

/** Convert metres to mm for storage (backend expects mm). */
function mToMm(m) {
  if (m == null || !Number.isFinite(m) || m < 0) return 0;
  return Math.round(m * 1000);
}

/**
 * Label prefix for measurement deck: "Gutter" or "Downpipe" depending on element type.
 */
function getMeasurementLabelPrefix(assetId) {
  if (!assetId || typeof assetId !== 'string') return 'Run';
  const id = assetId.trim();
  if (GUTTER_PATTERN.test(id) || id.toLowerCase() === 'gutter') return 'Gutter';
  const a = id.toUpperCase();
  if (a.startsWith('DP-') || a.startsWith('DPJ-') || a === 'DROPPER' || a.startsWith('DRP-')) return 'Downpipe';
  return 'Run';
}

/** True if assetId is a gutter (for separate numbering: gutters = numbers, downpipes = letters). */
function isGutterByAssetId(assetId) {
  return getMeasurementLabelPrefix(assetId) === 'Gutter';
}

/** Convert 0-based index to letter(s): 0→A, 1→B, …, 26→AA, 27→AB. */
function indexToLetter(n) {
  if (n < 0 || !Number.isFinite(n)) return '';
  if (n < 26) return String.fromCharCode(65 + n);
  return indexToLetter(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26));
}

/**
 * Display label for a measurable element: gutter = number (1, 2, …), downpipe/dropper = letter (A, B, …).
 * measurableSorted: list of elements with sequenceId, sorted by sequenceId.
 */
function getMeasurementDisplayLabel(el, measurableSorted) {
  if (!el || el.sequenceId == null || !measurableSorted || !measurableSorted.length) return String(el?.sequenceId ?? '');
  const prefix = getMeasurementLabelPrefix(el.assetId);
  const isGutter = prefix === 'Gutter';
  const sameType = measurableSorted.filter((e) => (getMeasurementLabelPrefix(e.assetId) === 'Gutter') === isGutter);
  const idx = sameType.findIndex((e) => e.id === el.id);
  if (idx < 0) return String(el.sequenceId);
  if (isGutter) return String(idx + 1);
  return indexToLetter(idx);
}

/**
 * True if asset is measurable (gets sequence number and length in Measurement Deck).
 * Gutters (GUT-*-MAR-*M), main downpipes (DP-65-*, DP-80-* only), droppers (dropper, DRP-*).
 * Downpipe joiners (DPJ-65, DPJ-80) are not measurable – priced each, no length.
 */
function isMeasurableElement(assetId) {
  if (!assetId || typeof assetId !== 'string') return false;
  const a = assetId.trim().toUpperCase();
  if (GUTTER_PATTERN.test(assetId)) return true;
  if (isDownpipeElement(assetId)) return true; // DP-65-*, DP-80-* only; excludes DPJ-*
  if (a === 'DROPPER' || a.startsWith('DRP-')) return true;
  return false;
}

/**
 * Default rotation (degrees) when dropping a linear asset, for isometric look.
 * Gutters = horizontal runs → 30°; Downpipes/joiners/droppers = vertical → 90° (standing up).
 */
function getDefaultRotationForLinear(assetId) {
  if (!assetId) return 0;
  const a = assetId.trim().toUpperCase();
  if (GUTTER_PATTERN.test(assetId.trim())) return 30;
  if (a.startsWith('DP-') || a.startsWith('DPJ-') || a === 'DROPPER' || a.startsWith('DRP-')) return 90;
  return 30;
}

const MIN_VIEW_ZOOM = 0.15;
const MAX_VIEW_ZOOM = 4;
/** 54.37: On mobile, zoom-out is clamped to 1 (full page) so the view never goes smaller than fit. */
const MIN_VIEW_ZOOM_MOBILE = 1;
const MOBILE_FIT_PAN_LOCK_EPSILON = 0.001;
const MOBILE_FIT_PAN_RESISTANCE_FACTOR = 0.22;
const MOBILE_FIT_PAN_RESISTANCE_MAX_PX = 14;
const MOBILE_FIT_PAN_BOUNCE_DECAY = 0.78;
const MOBILE_FIT_PAN_BOUNCE_STOP_EPSILON = 0.05;
/** 54.62: Mobile one-finger move starts only after crossing this threshold (tap remains select-only). */
const MOBILE_MOVE_START_THRESHOLD_PX = 8;
const ZOOM_WHEEL_FACTOR = 0.92;
const ZOOM_BUTTON_FACTOR = 1.25;
const VIEW_PAD = 48; // max padding from content edge to viewport when panning (canvas not limitless)

const HANDLE_SIZE = 8;
const HANDLE_RADIUS = 5;
const HANDLE_PROXIMITY_PX = 10; // within this distance, handles scale up for easier clicking
const ROTATE_HANDLE_PROXIMITY_PX = 20; // larger hit area for rotate handle (easier to grab)
const HANDLE_HOVER_SCALE = 1.2;
const ROTATE_HANDLE_OFFSET = 40; // vertical stem (tail) above top-center so rotate handle is easy to select
const ROTATE_STEM_PX = 40; // stem from box top to rotate handle (same length)
const PILL_HALF_LENGTH = 6; // half-length of pill (n/s/e/w handles) in display px
const PILL_HALF_THICKNESS = 2; // half-thickness of pill for drawing (4px total = thin aesthetic)
const PILL_HIT_THICKNESS = 15; // hit-test pill as 15px thick for Fitts's Law (forgiving, magnetic feel)
const SELECTION_BOX_STROKE_SCREEN_PX = 1.5; // bounding box stroke stays this thick on screen regardless of zoom
const ROTATE_STEM_ALPHA = 0.5; // stem line at 50% opacity so it reads as a guide, not structural
const SNAP_THRESHOLD = 5; // 5px snapping threshold (edge/center align); thin #FF00FF guide lines
/** 54.18: Grid step for parts formatting so elements align and are less likely to overlap. */
const SNAP_GRID_SIZE = 20;
const SMART_GUIDE_COLOR = '#FF00FF';
const HANDLE_BORDER_COLOR = '#18A0FB';
const MEASUREMENT_BADGE_RADIUS = 12; // badge circle on canvas for gutter/downpipe run number
const MARQUEE_FILL = 'rgba(24, 160, 251, 0.1)';
const SNAP_POP_DURATION_MS = 180;
const BBOX_RECALC_DEBOUNCE_MS = 100;
const ROTATION_SNAP_DEG = 15;
const ROTATION_MAGNETIC_DEG = 8; // pull toward 0/90/180/270 when within this

/** Rotation constraints per asset type. Gutter: cannot rotate between forbiddenMin and forbiddenMax; snap to nearest boundary (hysteresis via mid). Hold Alt to override. */
const ROTATION_CONSTRAINTS = {
  gutter: {
    forbiddenMin: 60,
    forbiddenMax: 80,
  },
};

/** 54.18: Snap value to grid for parts formatting (no overlap / alignment). */
function snapToGrid(value) {
  return Math.round(value / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
}

/** 54.18: True if two elements' axis-aligned bounding boxes overlap (with small gap). */
function elementsOverlap(elA, elB, gapPx) {
  const gap = gapPx ?? 2;
  const a = rotatedRectBbox(elA.x, elA.y, elA.width, elA.height, elA.rotation || 0);
  const b = rotatedRectBbox(elB.x, elB.y, elB.width, elB.height, elB.rotation || 0);
  return !(a.x + a.width + gap < b.x || b.x + b.width + gap < a.x ||
    a.y + a.height + gap < b.y || b.y + b.height + gap < a.y);
}

function cancelBboxRecalcDebounce() {
  if (state.debounceBboxTimerId != null) {
    clearTimeout(state.debounceBboxTimerId);
    state.debounceBboxTimerId = null;
  }
  state.bboxRecalcDeferredUntil = null;
}

function scheduleBboxRecalcDebounce() {
  cancelBboxRecalcDebounce();
  state.bboxRecalcDeferredUntil = Date.now() + BBOX_RECALC_DEBOUNCE_MS;
  state.debounceBboxTimerId = setTimeout(() => {
    state.debounceBboxTimerId = null;
    state.bboxRecalcDeferredUntil = null;
    draw();
  }, BBOX_RECALC_DEBOUNCE_MS);
}

function isMobileFitZoomLevel(viewZoom) {
  const zoom = Number.isFinite(viewZoom) ? viewZoom : state.viewZoom;
  return layoutState.viewportMode === 'mobile' && zoom <= (MIN_VIEW_ZOOM_MOBILE + MOBILE_FIT_PAN_LOCK_EPSILON);
}

function clampFitPanFeedback(value) {
  return Math.max(-MOBILE_FIT_PAN_RESISTANCE_MAX_PX, Math.min(MOBILE_FIT_PAN_RESISTANCE_MAX_PX, value));
}

function applyFitPanResistance(dx, dy) {
  state.fitPanFeedbackX = clampFitPanFeedback(
    state.fitPanFeedbackX + (dx * MOBILE_FIT_PAN_RESISTANCE_FACTOR)
  );
  state.fitPanFeedbackY = clampFitPanFeedback(
    state.fitPanFeedbackY + (dy * MOBILE_FIT_PAN_RESISTANCE_FACTOR)
  );
}

function resetMobileFitPanState() {
  state.viewPanX = 0;
  state.viewPanY = 0;
  state.fitPanFeedbackX = 0;
  state.fitPanFeedbackY = 0;
}

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 320;
const MOBILE_LAYOUT_BREAKPOINT_PX = 980;
const VIEWPORT_MODE_QUERY_KEY = 'viewport';

// Uniform element sizing: placed elements use 1/5 of reference size (works for portrait/landscape 9:16)
const REFERENCE_SIZE_PX = 400;
const ELEMENT_MAX_DIMENSION_PX = Math.round(REFERENCE_SIZE_PX / 5); // 80px
// Dropped elements: scale so largest dimension fits in this bounding box; stored dimensions use baseScale 1.0
const DROPPED_ELEMENT_MAX_DIMENSION_PX = 150;
const DROP_GHOST_OPACITY = 0.4;
const MIN_ELEMENT_DIMENSION_PX = 20;

// Canvas Porter: Auto-Scale normalization
const CANVAS_PORTER_MAX_UNIT = 150; // MaxUnit for normalization (same as DROPPED_ELEMENT_MAX_DIMENSION_PX)
const MOBILE_ADD_SIZE_RATIO = 0.25;
const MOBILE_ADD_SCALE_EPSILON = 0.0001;
const CANVAS_PORTER_VISUAL_PADDING = 10; // Safe zone padding in pixels (canvas coordinates)
const BLUEPRINT_Z_INDEX = -1; // Blueprint is the back layer; elements use zIndex >= 0

function getNextElementZIndex() {
  const maxZ = state.elements.reduce((m, e) => Math.max(m, e.zIndex != null ? e.zIndex : 0), BLUEPRINT_Z_INDEX);
  return maxZ + 1;
}

let elementIdCounter = 0;
let groupIdCounter = 0;
let imagesCache = {};
let messageTimeoutId = null;
const layoutState = {
  forcedMode: null,
  viewportMode: 'desktop',
  panelExpanded: true,
  panelAutoCollapsedGlobalToolbar: false,
  resizeListenerBound: false,
  resizeDebounceId: null,
};

const mobileOrientationPolicyState = {
  target: 'none',
  lastAttemptTarget: null,
  lastAttemptReason: '',
  lastErrorName: '',
  supported: false,
};

function supportsScreenOrientationLock() {
  if (typeof window === 'undefined') return false;
  const orientation = window.screen && window.screen.orientation;
  return !!orientation && typeof orientation.lock === 'function';
}

function setMobileOrientationTargetDataAttr(target) {
  if (typeof document === 'undefined') return;
  const normalizedTarget = target === 'landscape' || target === 'portrait' ? target : 'none';
  if (document.body) document.body.dataset.mobileOrientationTarget = normalizedTarget;
  if (document.documentElement) document.documentElement.dataset.mobileOrientationTarget = normalizedTarget;
}

function getMobileOrientationTarget() {
  if (layoutState.viewportMode !== 'mobile') return 'none';
  const visibleViewId = getVisibleViewId();
  if (visibleViewId !== 'view-canvas') return 'portrait';
  if (modalA11yState.stack.length > 0) return 'portrait';
  return 'landscape';
}

async function applyMobileOrientationTarget(target, reason) {
  const normalizedTarget = target === 'landscape' || target === 'portrait' ? target : 'none';
  mobileOrientationPolicyState.target = normalizedTarget;
  mobileOrientationPolicyState.supported = supportsScreenOrientationLock();
  setMobileOrientationTargetDataAttr(normalizedTarget);
  if (!mobileOrientationPolicyState.supported) return;

  const orientation = window.screen && window.screen.orientation;
  if (!orientation) return;
  if (mobileOrientationPolicyState.lastAttemptTarget === normalizedTarget) return;

  mobileOrientationPolicyState.lastAttemptTarget = normalizedTarget;
  mobileOrientationPolicyState.lastAttemptReason = reason || '';
  mobileOrientationPolicyState.lastErrorName = '';

  try {
    if (normalizedTarget === 'none') {
      if (typeof orientation.unlock === 'function') orientation.unlock();
      return;
    }
    await orientation.lock(normalizedTarget);
  } catch (err) {
    mobileOrientationPolicyState.lastErrorName = err && err.name ? err.name : 'UnknownError';
  }
}

function syncMobileOrientationPolicy(reason) {
  const target = getMobileOrientationTarget();
  void applyMobileOrientationTarget(target, reason);
}

/** 54.80: Diagram toolbar API (collapseIfExpanded). Set by initDiagramToolbarDragWithApp. */
let diagramToolbarApi = null;

/** Last successful quote response for edit mode: { materials, materials_subtotal, labour_hours, labour_rate, labour_subtotal, total } */
let lastQuoteData = null;

/** Cached labour rates for labour row dropdowns (Section 50): [{ id, rateName, hourlyRate }] */
let cachedLabourRates = [];
let quoteRowIdCounter = 0;
const quoteLineEditorState = {
  rowUid: '',
  rowType: '',
  draftQty: 0,
  draftUnitPrice: 0,
  qtyStep: 1,
  title: '',
  isTaxApplicable: true,
};

/** True when user has changed cost/markup in quote edit mode and not yet saved. */
let hasPricingChanges = false;

const MAX_UNDO_HISTORY = 50;
let undoHistory = [];
let redoHistory = [];
let blueprintUndoHistory = []; // Separate stack for blueprint moves/resize/rotate so Ctrl+Z doesn't undo background when tweaking parts

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'];
const ACCEPTED_PDF_TYPE = 'application/pdf';
const MAX_FILE_SIZE_MB = 20;

/** PDF.js version – import and worker URLs must match (Phase 3, Task 30.5). */
const PDFJS_VERSION = '4.0.379';

/** Phase 3, Task 30.5: Convert PDF first page to PNG File for crop modal. Backend never sees PDF. */
async function convertPdfFirstPageToPng(file) {
  const pdfUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
  const pdfjsLib = await import(pdfUrl);
  const pdfjs = pdfjsLib.default || pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Failed to create PNG from PDF'));
        const baseName = (file.name || 'page1').replace(/\.[^.]+$/, '');
        resolve(new File([blob], baseName + '-page1.png', { type: 'image/png' }));
      },
      'image/png',
      1
    );
  });
}

// Crop modal state (image coords in source pixels)
const cropState = {
  file: null,
  image: null,
  crop: { x: 0, y: 0, w: 0, h: 0 },
  displayScale: 1,
  displayOffsetX: 0,
  displayOffsetY: 0,
  dragging: false,
  dragStart: { x: 0, y: 0, cropX: 0, cropY: 0 },
};

function showMessage(text, type = 'error') {
  const el = document.getElementById('toolbarMessage');
  if (!el) return;
  if (messageTimeoutId) clearTimeout(messageTimeoutId);
  el.textContent = text;
  el.className = 'toolbar-message ' + (type || 'error');
  el.removeAttribute('hidden');
  /* 54.14: Announce errors/messages to screen readers (visible + announced on mobile) */
  if (typeof announceCanvas === 'function') announceCanvas(text);
  messageTimeoutId = setTimeout(() => {
    el.setAttribute('hidden', '');
    messageTimeoutId = null;
  }, 8000);
}

function clearMessage() {
  const el = document.getElementById('toolbarMessage');
  if (el) el.setAttribute('hidden', '');
  if (messageTimeoutId) clearTimeout(messageTimeoutId);
  messageTimeoutId = null;
}

/**
 * Configure PWA behavior from backend config.
 * pwa.js may load after app.js; in that case store pending config for it.
 */
function configurePwaFromConfig(config) {
  if (!config || typeof config.pwaEnabled !== 'boolean') return;
  const payload = { enabled: config.pwaEnabled };
  if (typeof window.__quoteAppConfigurePwa === 'function') {
    window.__quoteAppConfigurePwa(payload);
  } else {
    window.__quoteAppPendingPwaConfig = payload;
  }
}

function updateToolbarBreadcrumbs(projectName) {
  const input = document.getElementById('toolbarProjectNameInput');
  if (!input) return;
  const name = projectName && projectName.trim() ? projectName.trim() : '';
  state.projectName = name;
  input.value = name;
  input.placeholder = 'Untitled';
}

function getAspectRatioValue(ratio) {
  if (ratio === 'free') return null;
  if (ratio === '1:1') return 1;
  if (ratio === '4:3') return 4 / 3;
  if (ratio === '16:9') return 16 / 9;
  return null;
}

function applyAspectRatioToCrop() {
  const sel = document.getElementById('cropAspectRatio');
  const ratio = getAspectRatioValue(sel ? sel.value : 'free');
  const img = cropState.image;
  const c = cropState.crop;
  if (!img || ratio == null) return;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  let w = c.w;
  let h = c.h;
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;
  w = Math.min(w, img.width);
  h = Math.min(h, img.height);
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  let x = cx - w / 2;
  let y = cy - h / 2;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > img.width) x = img.width - w;
  if (y + h > img.height) y = img.height - h;
  cropState.crop = { x, y, w, h };
}

function drawCropPreview() {
  const canvas = document.getElementById('cropCanvas');
  const wrap = document.getElementById('cropCanvasWrap');
  const img = cropState.image;
  if (!canvas || !wrap || !img) return;

  let maxW = wrap.clientWidth;
  let maxH = wrap.clientHeight;
  if (maxW <= 0 || maxH <= 0) {
    maxW = img.width;
    maxH = img.height;
  }
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const offsetX = (maxW - drawW) / 2;
  const offsetY = (maxH - drawH) / 2;

  cropState.displayScale = scale;
  cropState.displayOffsetX = offsetX;
  cropState.displayOffsetY = offsetY;

  canvas.width = maxW;
  canvas.height = maxH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, maxW, maxH);
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

  const c = cropState.crop;
  const sx = offsetX + c.x * scale;
  const sy = offsetY + c.y * scale;
  const sw = c.w * scale;
  const sh = c.h * scale;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, maxW, sy);
  ctx.fillRect(0, sy, sx, sh);
  ctx.fillRect(sx + sw, sy, maxW - (sx + sw), sh);
  ctx.fillRect(0, sy + sh, maxW, maxH - (sy + sh));

  ctx.strokeStyle = '#007aff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.setLineDash([]);
}

function getCroppedFile() {
  const img = cropState.image;
  const c = cropState.crop;
  if (!img || c.w <= 0 || c.h <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = c.w;
  canvas.height = c.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null);
        const name = cropState.file ? cropState.file.name : 'cropped.png';
        const file = new File([blob], name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
        resolve(file);
      },
      'image/png',
      1
    );
  });
}

function showCropModal(file) {
  const modal = document.getElementById('cropModal');
  if (!modal || !file) return;
  cropState.file = file;
  cropState.image = null;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    cropState.image = img;
    cropState.crop = { x: 0, y: 0, w: img.width, h: img.height };
    const sel = document.getElementById('cropAspectRatio');
    if (sel) sel.value = 'free';
    const uploadTrigger = document.getElementById('uploadZone') || document.getElementById('fileInput');
    openAccessibleModal('cropModal', { triggerEl: uploadTrigger });
    drawCropPreview();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showMessage('Could not load image for cropping.');
  };
  img.src = url;
}

function hideCropModal() {
  closeAccessibleModal('cropModal');
  cropState.file = null;
  cropState.image = null;
  cropState.dragging = false;
}

function initCropModal() {
  const modal = document.getElementById('cropModal');
  const canvas = document.getElementById('cropCanvas');
  const wrap = document.getElementById('cropCanvasWrap');
  const aspectSelect = document.getElementById('cropAspectRatio');
  const btnUseFull = document.getElementById('cropUseFull');
  const btnApply = document.getElementById('cropApply');
  const btnCancel = document.getElementById('cropCancel');

  if (!modal || !canvas) return;

  aspectSelect.addEventListener('change', () => {
    applyAspectRatioToCrop();
    drawCropPreview();
  });

  btnUseFull.addEventListener('click', () => {
    const file = cropState.file;
    hideCropModal();
    if (file) processFileAsBlueprint(file);
  });

  btnApply.addEventListener('click', async () => {
    const file = await getCroppedFile();
    hideCropModal();
    if (file) processFileAsBlueprint(file);
  });

  btnCancel.addEventListener('click', hideCropModal);

  canvas.addEventListener('mousedown', (e) => {
    if (!cropState.image) return;
    const c = cropState.crop;
    const scale = cropState.displayScale;
    const ox = cropState.displayOffsetX;
    const oy = cropState.displayOffsetY;
    const sx = ox + c.x * scale;
    const sy = oy + c.y * scale;
    const sw = c.w * scale;
    const sh = c.h * scale;
    const x = e.offsetX;
    const y = e.offsetY;
    if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) {
      cropState.dragging = true;
      cropState.dragStart = { x: e.clientX, y: e.clientY, cropX: c.x, cropY: c.y };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!cropState.dragging || !cropState.image) return;
    const dx = (e.clientX - cropState.dragStart.x) / cropState.displayScale;
    const dy = (e.clientY - cropState.dragStart.y) / cropState.displayScale;
    const img = cropState.image;
    let x = cropState.dragStart.cropX + dx;
    let y = cropState.dragStart.cropY + dy;
    x = Math.max(0, Math.min(img.width - cropState.crop.w, x));
    y = Math.max(0, Math.min(img.height - cropState.crop.h, y));
    cropState.crop.x = x;
    cropState.crop.y = y;
    drawCropPreview();
  });

  window.addEventListener('mouseup', () => {
    cropState.dragging = false;
  });
}

function hideQuoteModal() {
  closeAccessibleModal('labourEditorModal');
  closeAccessibleModal('quoteModal');
  setQuoteEditMode(false);
  syncQuoteModalViewportState();
}

function syncQuoteModalViewportState() {
  const modal = document.getElementById('quoteModal');
  if (!modal) return;
  const isMobileQuote = layoutState.viewportMode === 'mobile';
  modal.classList.toggle('quote-modal--mobile-fullscreen', isMobileQuote);
  if (isMobileQuote) modal.setAttribute('data-mobile-fullscreen', 'true');
  else modal.removeAttribute('data-mobile-fullscreen');
}

function updateSavePricingButtonState() {
  const saveBtn = document.getElementById('savePricingBtn');
  const table = document.getElementById('quotePartsTable');
  const inEditMode = table?.classList.contains('quote-parts-table--editing');
  if (!saveBtn) return;
  if (inEditMode) {
    saveBtn.removeAttribute('hidden');
    saveBtn.disabled = !hasPricingChanges;
  } else {
    saveBtn.setAttribute('hidden', '');
    saveBtn.disabled = true;
  }
}

/** Add cost/markup/unit inputs to a single quote table row (for edit mode or when adding a row in edit mode). */
function addEditInputsToRow(row) {
  if (!row || row.cells.length < 6) return;
  const costVal = row.dataset.costPrice ?? '';
  const markupVal = row.dataset.markupPct ?? '';
  const unitVal = row.cells[4]?.textContent?.replace(/[^0-9.]/g, '') ?? '';
  const costInput = document.createElement('input');
  costInput.type = 'number';
  costInput.className = 'quote-input quote-input-cost';
  costInput.min = '0';
  costInput.step = '0.01';
  costInput.value = costVal;
  costInput.setAttribute('aria-label', 'Cost price');
  const markupInput = document.createElement('input');
  markupInput.type = 'number';
  markupInput.className = 'quote-input quote-input-markup';
  markupInput.min = '0';
  markupInput.max = '1000';
  markupInput.step = '0.01';
  markupInput.value = markupVal;
  markupInput.setAttribute('aria-label', 'Markup percentage');
  const unitInput = document.createElement('input');
  unitInput.type = 'number';
  unitInput.className = 'quote-input quote-input-unit';
  unitInput.min = '0';
  unitInput.step = '0.01';
  unitInput.value = unitVal;
  unitInput.setAttribute('aria-label', 'Unit price');
  row.dataset.manualUnitPrice = 'false';
  const markChanged = () => { hasPricingChanges = true; updateSavePricingButtonState(); };
  costInput.addEventListener('input', () => { costInput.classList.add('quote-cell-edited'); markChanged(); recalcQuoteFromEditTable(row, 'cost'); });
  markupInput.addEventListener('input', () => { markupInput.classList.add('quote-cell-edited'); markChanged(); recalcQuoteFromEditTable(row, 'markup'); });
  unitInput.addEventListener('input', () => { unitInput.classList.add('quote-cell-edited'); row.dataset.manualUnitPrice = 'true'; markChanged(); recalcQuoteFromEditTable(row, 'unit'); });
  costInput.addEventListener('blur', () => validateQuoteCell(costInput, 'cost', row));
  markupInput.addEventListener('blur', () => validateQuoteCell(markupInput, 'markup', row));
  unitInput.addEventListener('blur', () => validateQuoteCell(unitInput, 'unit', row));
  row.cells[2].textContent = '';
  row.cells[2].appendChild(costInput);
  row.cells[3].textContent = '';
  row.cells[3].appendChild(markupInput);
  row.cells[4].textContent = '';
  row.cells[4].appendChild(unitInput);
}

function setQuoteEditMode(editing) {
  const table = document.getElementById('quotePartsTable');
  const btn = document.getElementById('editPricingBtn');
  const tableBody = document.getElementById('quoteTableBody');
  if (!table || !btn) return;

  if (editing) {
    hasPricingChanges = false;
    table.classList.add('quote-parts-table--editing');
    btn.textContent = 'Done Editing';
    if (tableBody) {
      for (const row of tableBody.rows) {
        if (row.dataset.emptyRow === 'true') continue;
        addEditInputsToRow(row);
      }
    }
    updateSavePricingButtonState();
    setTimeout(() => recalcQuoteFromEditTable(null, null), 0);
  } else {
    hasPricingChanges = false;
    table.classList.remove('quote-parts-table--editing');
    btn.textContent = 'Edit Pricing';
    if (tableBody) {
      for (const row of tableBody.rows) {
        if (row.cells.length < 6 || row.dataset.emptyRow === 'true') continue;
        const costInput = row.querySelector('.quote-input-cost');
        const markupInput = row.querySelector('.quote-input-markup');
        const unitInput = row.querySelector('.quote-input-unit');
        const costVal = costInput?.value ?? row.dataset.costPrice ?? '0';
        const markupVal = markupInput?.value ?? row.dataset.markupPct ?? '0';
        const unitVal = unitInput?.value ?? '';
        row.dataset.costPrice = costVal;
        row.dataset.markupPct = markupVal;
        if (costInput) { row.cells[2].removeChild(costInput); row.cells[2].textContent = formatCurrency(parseFloat(costVal) || 0); }
        if (markupInput) {
          row.cells[3].removeChild(markupInput);
          row.cells[3].textContent = '';
          const inlineMarkup = document.createElement('input');
          inlineMarkup.type = 'number';
          inlineMarkup.className = 'quote-input-markup-inline';
          inlineMarkup.min = '0';
          inlineMarkup.max = '1000';
          inlineMarkup.step = '0.01';
          inlineMarkup.value = markupVal;
          inlineMarkup.setAttribute('aria-label', 'Markup percentage');
          inlineMarkup.addEventListener('change', () => {
            const cost = parseFloat(row.dataset.costPrice) || 0;
            let markup = parseFloat(inlineMarkup.value);
            if (!Number.isFinite(markup) || markup < 0 || markup > 1000) markup = 0;
            inlineMarkup.value = String(markup);
            row.dataset.markupPct = String(markup);
            const qty = parseFloat(row.querySelector('.quote-line-qty-input')?.value) || 0;
            const unitPrice = Math.round(cost * (1 + markup / 100) * 100) / 100;
            const lineTotal = Math.round(unitPrice * qty * 100) / 100;
            row.cells[4].textContent = formatCurrency(unitPrice);
            const totalVal = row.cells[5].querySelector('.quote-cell-total-value');
            if (totalVal) totalVal.textContent = formatCurrency(lineTotal);
            else row.cells[5].textContent = formatCurrency(lineTotal);
            recalcQuoteTotalsFromTableBody();
          });
          row.cells[3].appendChild(inlineMarkup);
          const pctSuffix = document.createElement('span');
          pctSuffix.className = 'quote-markup-percent-suffix';
          pctSuffix.setAttribute('aria-hidden', 'true');
          pctSuffix.textContent = '%';
          row.cells[3].appendChild(pctSuffix);
        }
        if (unitInput) { row.cells[4].removeChild(unitInput); row.cells[4].textContent = formatCurrency(parseFloat(unitVal) || 0); }
      }
    }
    updateSavePricingButtonState();
  }
}

function validateQuoteCell(input, type, row) {
  if (!input) return;
  const costInput = row?.querySelector('.quote-input-cost');
  const cost = parseFloat(costInput?.value) || 0;
  const markupInput = row?.querySelector('.quote-input-markup');
  const markup = parseFloat(markupInput?.value) ?? 0;
  const unitInput = row?.querySelector('.quote-input-unit');
  const unit = parseFloat(unitInput?.value) || 0;
  let valid = true;
  if (type === 'cost') valid = cost >= 0;
  else if (type === 'markup') valid = markup >= 0 && markup <= 1000;
  else if (type === 'unit') valid = unit >= cost;
  input.classList.toggle('quote-cell-invalid', !valid);
  input.classList.toggle('quote-cell-edited', true);
}

function recalcQuoteFromEditTable(changedRow, changedField) {
  const table = document.getElementById('quotePartsTable');
  const tableBody = document.getElementById('quoteTableBody');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');
  if (!table?.classList.contains('quote-parts-table--editing') || !tableBody) return;

  let materialsSubtotal = 0;
  for (const row of tableBody.rows) {
    const costInput = row.querySelector('.quote-input-cost');
    const markupInput = row.querySelector('.quote-input-markup');
    const unitInput = row.querySelector('.quote-input-unit');
    if (!costInput || !markupInput || !unitInput || !row.cells[5]) continue;

    let cost = parseFloat(costInput.value) || 0;
    let markup = parseFloat(markupInput.value) ?? 0;
    if (cost < 0) cost = 0;
    if (markup < 0 || markup > 1000) markup = Math.max(0, Math.min(1000, markup));

    const manualUnit = row.dataset.manualUnitPrice === 'true';
    let unitPrice;
    if (changedRow === row && changedField === 'unit') {
      row.dataset.manualUnitPrice = 'true';
      unitPrice = parseFloat(unitInput.value) || 0;
    } else if (!manualUnit && (changedField === 'cost' || changedField === 'markup')) {
      unitPrice = Math.round(cost * (1 + markup / 100) * 100) / 100;
      unitInput.value = unitPrice.toFixed(2);
    } else {
      unitPrice = parseFloat(unitInput.value) || 0;
    }
    if (unitPrice < cost) {
      unitPrice = cost;
      unitInput.value = cost.toFixed(2);
    }
    const qtyCell = row.cells[1];
    const qtyInput = qtyCell?.querySelector('.quote-line-qty-input');
    let qty = 0;
    if (qtyInput) {
      qty = parseFloat(qtyInput.value) || 0;
      setQuoteRowStoredQty(row, qty);
    } else {
      const storedQty = getQuoteRowStoredQty(row);
      if (storedQty != null) {
        qty = storedQty;
      } else {
        qty = parseFloat(getQuoteCellTextWithoutSummaries(row)) || 0;
        setQuoteRowStoredQty(row, qty);
      }
    }
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    const totalVal = row.cells[5].querySelector('.quote-cell-total-value');
    if (totalVal) totalVal.textContent = formatCurrency(lineTotal);
    else row.cells[5].textContent = formatCurrency(lineTotal);
    materialsSubtotal += lineTotal;
  }

  const labourTotal = parseFloat(document.getElementById('labourTotalDisplay')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
  const total = Math.round((materialsSubtotal + labourTotal) * 100) / 100;
  if (materialsTotalDisplay) materialsTotalDisplay.textContent = formatCurrency(materialsSubtotal);
  if (quoteTotalDisplay) quoteTotalDisplay.textContent = formatCurrency(total);
}

/**
 * Recompute materials subtotal, labour subtotal, and quote total from current table body (Section 50).
 * Materials = sum of material rows only (excludes labour rows, section headers, empty row).
 * Labour = sum of labour row totals. Total = materials + labour.
 */
function recalcQuoteTotalsFromTableBody() {
  const tableBody = document.getElementById('quoteTableBody');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');
  if (!tableBody || !materialsTotalDisplay || !quoteTotalDisplay) return;
  let materialsSubtotal = 0;
  let labourSubtotal = 0;
  for (const row of tableBody.rows) {
    if (row.dataset.sectionHeader || row.dataset.emptyRow === 'true') continue;
    if (!row.cells[5]) continue;
    const totalEl = row.cells[5].querySelector('.quote-cell-total-value');
    const raw = totalEl ? totalEl.textContent : row.cells[5].textContent;
    const val = parseFloat(String(raw).replace(/[^0-9.-]/g, '')) || 0;
    if (row.dataset.labourRow === 'true') {
      labourSubtotal += val;
    } else {
      materialsSubtotal += val;
    }
  }
  materialsSubtotal = Math.round(materialsSubtotal * 100) / 100;
  labourSubtotal = Math.round(labourSubtotal * 100) / 100;
  const total = Math.round((materialsSubtotal + labourSubtotal) * 100) / 100;
  materialsTotalDisplay.textContent = formatCurrency(materialsSubtotal);
  if (labourTotalDisplay) labourTotalDisplay.textContent = formatCurrency(labourSubtotal);
  quoteTotalDisplay.textContent = formatCurrency(total);
  updateQuoteTotalWarning();
  syncMobileQuoteLineSummaries();
}

/**
 * Remove any section header (Gutter Length or Downpipe) that has no child data rows left.
 * Only counts rows with matching data-section-for so ungrouped/standalone rows don't block removal.
 */
function removeEmptySectionHeaders() {
  const tableBody = document.getElementById('quoteTableBody');
  if (!tableBody) return;
  const rows = Array.from(tableBody.rows);
  const headersToRemove = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sectionId = row.dataset.sectionHeader;
    if (!sectionId) continue;
    let childCount = 0;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.dataset.sectionHeader || next.dataset.emptyRow === 'true' || next.dataset.labourRow === 'true') break;
      if (next.dataset.assetId && next.dataset.sectionFor === sectionId) childCount += 1;
    }
    if (childCount === 0) headersToRemove.push(row);
  }
  headersToRemove.forEach((r) => r.remove());
}

/** Filter products by search term (name or item_number). Excludes labour so it cannot be added as a material line. */
function filterProductsForQuoteSearch(term) {
  const t = (term || '').trim().toLowerCase();
  const products = (state.products || []).filter((p) => {
    if (LABOUR_PRODUCT_IDS.includes(p.id) || (p.category || '').toLowerCase() === 'labour') return false;
    return true;
  });
  if (!t) return products;
  return products.filter((p) => {
    const name = (p.name || '').toLowerCase();
    const itemNum = (p.item_number || '').toLowerCase();
    return name.includes(t) || itemNum.includes(t);
  });
}

/** Create and append the empty invoice row (product combobox + qty). Call after building quote table. */
function appendEmptyQuoteRow() {
  const tableBody = document.getElementById('quoteTableBody');
  if (!tableBody) return;
  const tr = document.createElement('tr');
  tr.dataset.emptyRow = 'true';
  tr.className = 'quote-row-empty';

  const productCell = document.createElement('td');
  const combobox = document.createElement('div');
  combobox.className = 'quote-product-combobox';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'quote-product-combobox-input';
  input.placeholder = 'Type or select product…';
  input.setAttribute('aria-label', 'Product search');
  input.autocomplete = 'off';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'quote-product-dropdown-trigger';
  trigger.setAttribute('aria-label', 'Open product list');
  trigger.innerHTML = '▼';
  const list = document.createElement('div');
  list.className = 'quote-product-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  combobox.appendChild(input);
  combobox.appendChild(trigger);
  combobox.appendChild(list);
  productCell.appendChild(combobox);

  const qtyCell = document.createElement('td');
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '1';
  qtyInput.step = '1';
  qtyInput.value = '1';
  qtyInput.className = 'quote-empty-qty-input';
  qtyInput.setAttribute('aria-label', 'Quantity');
  qtyCell.appendChild(qtyInput);

  tr.appendChild(productCell);
  tr.appendChild(qtyCell);
  tr.appendChild(document.createElement('td'));
  tr.appendChild(document.createElement('td'));
  tr.appendChild(document.createElement('td'));
  tr.appendChild(document.createElement('td'));
  tr.cells[2].textContent = '—';
  tr.cells[3].textContent = '—';
  tr.cells[4].textContent = '—';
  tr.cells[5].textContent = '—';

  tableBody.appendChild(tr);
  initEmptyQuoteRow(tr);
}

/** Return the empty "Type or select product…" row, or null (Section 50). */
function getEmptyRow() {
  return document.getElementById('quoteTableBody')?.querySelector('tr[data-empty-row="true"]') || null;
}

/** Return labour rows in DOM order (Section 50). */
function getLabourRowsOrdered() {
  const tbody = document.getElementById('quoteTableBody');
  if (!tbody) return [];
  return Array.from(tbody.rows).filter((r) => r.dataset.labourRow === 'true');
}

function isMobileQuoteViewport() {
  return layoutState.viewportMode === 'mobile';
}

function formatLabourHoursDisplay(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '0 hrs';
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} hrs`;
}

function formatQuoteQtyDisplay(value) {
  if (!Number.isFinite(value) || value < 0) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
}

function parseCurrencyNumber(raw) {
  return parseFloat(String(raw ?? '').replace(/[^0-9.-]/g, '')) || 0;
}

function getQuoteRowStoredQty(row) {
  if (!row) return null;
  const stored = parseFloat(row.dataset.quoteQtyValue);
  return Number.isFinite(stored) ? stored : null;
}

function setQuoteRowStoredQty(row, qty) {
  if (!row) return;
  if (!Number.isFinite(qty) || qty < 0) {
    delete row.dataset.quoteQtyValue;
    return;
  }
  row.dataset.quoteQtyValue = formatQuoteQtyDisplay(qty);
}

function getQuoteCellTextWithoutSummaries(row) {
  const qtyCell = row?.cells?.[1];
  if (!qtyCell) return '';
  const clone = qtyCell.cloneNode(true);
  clone.querySelectorAll('.quote-mobile-line-qty-summary, .quote-labour-mobile-qty-summary, .quote-labour-mobile-rate-summary, .quote-mobile-qty-stepper').forEach((el) => el.remove());
  return (clone.textContent || '').trim();
}

function isEditableQuoteLineRow(row) {
  if (!row || row.dataset.sectionHeader || row.dataset.emptyRow === 'true') return false;
  return row.dataset.labourRow === 'true' || !!row.dataset.assetId;
}

function ensureQuoteRowUid(row) {
  if (!row) return '';
  if (!row.dataset.quoteRowUid) {
    quoteRowIdCounter += 1;
    row.dataset.quoteRowUid = 'quote-row-' + quoteRowIdCounter;
  }
  return row.dataset.quoteRowUid;
}

function findQuoteRowByUid(uid) {
  if (!uid) return null;
  const tableBody = document.getElementById('quoteTableBody');
  if (!tableBody) return null;
  return tableBody.querySelector(`tr[data-quote-row-uid="${CSS.escape(uid)}"]`);
}

function getQuoteLineProductName(row) {
  if (!row) return 'Item';
  if (row.dataset.labourRow === 'true') return 'Labour';
  const productCell = row.cells[0];
  if (!productCell) return 'Item';
  const clone = productCell.cloneNode(true);
  clone.querySelectorAll(
    '.quote-mobile-line-summary, .quote-labour-mobile-summary, .quote-labour-mobile-qty-summary, .quote-labour-mobile-rate-summary, .quote-mobile-line-qty-summary, .quote-labour-dup-btn'
  ).forEach((el) => el.remove());
  const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const product = state.products.find((p) => p.id === row.dataset.assetId);
  return product?.name || row.dataset.assetId || 'Item';
}

function getQuoteLineQuantityMeta(row) {
  if (!row) return { value: 0, step: 1 };
  // 54.93.6: metres rows (gutter/downpipe length) – step 0.1 is sufficient for product spec
  const metresInput = row.querySelector('.quote-qty-metres-input');
  if (metresInput) {
    const value = parseFloat(metresInput.value) || 0;
    return { value, step: 0.1 };
  }
  if (row.dataset.manualLength === 'true' && row.dataset.lengthMm != null && row.dataset.lengthMm !== '') {
    const value = mmToM(parseFloat(row.dataset.lengthMm));
    return { value: Number.isFinite(value) ? value : 0, step: 0.1 };
  }
  if (row.dataset.labourRow === 'true') {
    const hoursInput = row.querySelector('.quote-labour-hours-input');
    return { value: parseFloat(hoursInput?.value) || 0, step: 0.5 };
  }
  const qtyInput = row.querySelector('.quote-line-qty-input');
  if (qtyInput) {
    const step = parseFloat(qtyInput.step);
    const value = parseFloat(qtyInput.value) || 0;
    setQuoteRowStoredQty(row, value);
    return { value, step: Number.isFinite(step) && step > 0 ? step : 1 };
  }
  const storedValue = getQuoteRowStoredQty(row);
  if (storedValue != null) return { value: storedValue, step: 1 };
  const qtyCellText = getQuoteCellTextWithoutSummaries(row);
  const value = parseFloat(qtyCellText) || 0;
  setQuoteRowStoredQty(row, value);
  return { value, step: 1 };
}

function getQuoteLineUnitPrice(row) {
  if (!row) return 0;
  if (row.dataset.labourRow === 'true') {
    return parseFloat(row.querySelector('.quote-labour-unit-price-input')?.value) || 0;
  }
  const editableUnitInput = row.querySelector('.quote-input-unit');
  if (editableUnitInput) return parseFloat(editableUnitInput.value) || 0;
  return parseCurrencyNumber(row.cells[4]?.textContent);
}

function getQuoteLineCost(row) {
  if (!row) return 0;
  if (row.dataset.labourRow === 'true') return getQuoteLineUnitPrice(row);
  return parseFloat(row.dataset.costPrice) || 0;
}

function getQuoteLineMarkup(row) {
  if (!row || row.dataset.labourRow === 'true') return null;
  const markupInput = row.querySelector('.quote-input-markup-inline, .quote-input-markup');
  if (markupInput) {
    const v = parseFloat(markupInput.value);
    return Number.isFinite(v) ? v : null;
  }
  const ds = parseFloat(row.dataset.markupPct);
  return Number.isFinite(ds) ? ds : null;
}

function getQuoteLineTotal(row) {
  if (!row) return 0;
  const totalEl = row.cells[5]?.querySelector('.quote-cell-total-value');
  return parseCurrencyNumber(totalEl ? totalEl.textContent : row.cells[5]?.textContent);
}

function syncMobileQuoteLineSummaries() {
  const isMobile = isMobileQuoteViewport();
  const tableBody = document.getElementById('quoteTableBody');
  if (!tableBody) return;
  let totalLabourHours = 0;
  if (isMobile) {
    getLabourRowsOrdered().forEach((r) => {
      totalLabourHours += parseFloat(r.querySelector('.quote-labour-hours-input')?.value) || 0;
    });
  }
  // 54.93.2 / 54.93.3 / 54.93.6 / 54.93.7: desktop cleanup – remove cell-0 remove/plus and restore qty cell (remove stepper) by row type
  if (!isMobile) {
    Array.from(tableBody.rows).forEach((row) => {
      const productCell = row.cells[0];
      if (productCell) {
        productCell.querySelector('.quote-row-remove-x')?.remove();
        productCell.querySelector('.quote-row-add-plus')?.remove();
      }
      const qtyCell = row.cells[1];
      if (qtyCell?.querySelector('.quote-mobile-qty-stepper')) {
        // 54.93.8.2: desktop cleanup – restore section header metres input (remove stepper, restore wrap with input + suffix)
        if (row.dataset.sectionHeader) {
          const stepper = qtyCell.querySelector('.quote-mobile-qty-stepper');
          const hiddenInput = qtyCell.querySelector('.quote-header-metres-input');
          const currentVal = hiddenInput ? (parseFloat(hiddenInput.value) || 0) : 0;
          const displayVal = currentVal % 1 === 0 ? String(currentVal) : currentVal.toFixed(3).replace(/\.?0+$/, '');
          stepper?.remove();
          const wrap = qtyCell.querySelector('.quote-header-metres-wrap');
          if (wrap) {
            wrap.innerHTML = `<input type="number" class="quote-header-metres-input" value="${escapeHtml(displayVal)}" min="0" step="0.5" placeholder="Metres?" aria-label="Length in metres"><span class="quote-header-metres-suffix"> m</span>`;
            const headerMetresInput = wrap.querySelector('.quote-header-metres-input');
            if (headerMetresInput) {
              headerMetresInput.addEventListener('change', () => calculateAndDisplayQuote());
              headerMetresInput.addEventListener('blur', () => calculateAndDisplayQuote());
            }
          }
        } else if (row.dataset.labourRow === 'true') {
          const stepper = qtyCell.querySelector('.quote-mobile-qty-stepper');
          const hoursInput = qtyCell.querySelector('.quote-labour-hours-input');
          stepper?.remove();
          if (hoursInput) hoursInput.classList.remove('quote-labour-hours-input--hidden-mobile');
        } else if (row.dataset.manualLength === 'true' && row.dataset.lengthMm != null && row.dataset.lengthMm !== '') {
          const metresVal = mmToM(parseFloat(row.dataset.lengthMm));
          const m = Number.isFinite(metresVal) ? metresVal : 0;
          qtyCell.innerHTML = '';
          qtyCell.textContent = (Number(m) === m && m % 1 !== 0 ? m.toFixed(1) : String(m)) + ' m';
        } else {
          const stored = getQuoteRowStoredQty(row);
          const val = stored != null ? stored : 0;
          qtyCell.innerHTML = '';
          const input = document.createElement('input');
          input.type = 'number';
          input.className = 'quote-line-qty-input';
          input.value = formatQuoteQtyDisplay(val);
          input.min = '0';
          input.step = '1';
          input.setAttribute('aria-label', 'Quantity');
          qtyCell.appendChild(input);
          setQuoteRowStoredQty(row, parseFloat(String(val)) || 0);
        }
      }
    });
  }
  // 54.93.8: mobile – section header rows (Gutter/Downpipe length): replace metres input with stepper, keep input in DOM (hidden)
  if (isMobile) {
    const step = 0.5;
    Array.from(tableBody.rows).forEach((row) => {
      if (!row.dataset.sectionHeader) return;
      const qtyCell = row.cells[1];
      if (!qtyCell) return;
      const wrap = qtyCell.querySelector('.quote-header-metres-wrap');
      const input = wrap?.querySelector('.quote-header-metres-input');
      if (!input) return;
      const existingStepper = qtyCell.querySelector('.quote-mobile-qty-stepper');
      if (existingStepper) {
        const valueSpan = existingStepper.querySelector('.quote-mobile-qty-stepper-value');
        if (valueSpan) {
          const v = parseFloat(input.value) || 0;
          const s = Number(v) === v && v % 1 !== 0 ? v.toFixed(1) : String(v);
          valueSpan.textContent = s + ' m';
        }
        return;
      }
      const stepperWrap = document.createElement('div');
      stepperWrap.className = 'quote-mobile-qty-stepper';
      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'quote-mobile-qty-stepper-btn quote-mobile-qty-stepper-btn--minus';
      minusBtn.setAttribute('aria-label', 'Decrease length');
      minusBtn.textContent = '−';
      const valueSpan = document.createElement('span');
      valueSpan.className = 'quote-mobile-qty-stepper-value';
      valueSpan.setAttribute('aria-live', 'polite');
      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'quote-mobile-qty-stepper-btn quote-mobile-qty-stepper-btn--plus';
      plusBtn.setAttribute('aria-label', 'Increase length');
      plusBtn.textContent = '+';
      stepperWrap.appendChild(minusBtn);
      stepperWrap.appendChild(valueSpan);
      stepperWrap.appendChild(plusBtn);
      const updateValueSpan = () => {
        const v = parseFloat(input.value) || 0;
        const s = Number(v) === v && v % 1 !== 0 ? v.toFixed(1) : String(v);
        valueSpan.textContent = s + ' m';
      };
      const applyStep = (delta) => {
        const current = parseFloat(input.value) || 0;
        const next = Math.max(0, current + delta);
        input.value = String(next);
        updateValueSpan();
        calculateAndDisplayQuote().then(() => syncMobileQuoteLineSummaries());
      };
      minusBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); applyStep(-step); });
      plusBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); applyStep(step); });
      wrap.innerHTML = '';
      wrap.appendChild(stepperWrap);
      input.classList.add('quote-header-metres-input--hidden-mobile');
      wrap.appendChild(input);
      updateValueSpan();
    });
  }
  const rows = Array.from(tableBody.rows).filter((row) => isEditableQuoteLineRow(row));
  rows.forEach((row) => {
    ensureQuoteRowUid(row);
    row.classList.add('quote-mobile-editable-line');
    const productCell = row.cells[0];
    const qtyCell = row.cells[1];
    if (!productCell || !qtyCell) return;
    // 54.93.2: on mobile, prepend red minus (remove) to product cell so it’s visible (Total column hidden)
    if (isMobile) {
      let removeInCell0 = productCell.querySelector('.quote-row-remove-x');
      if (!removeInCell0) {
        removeInCell0 = document.createElement('span');
        removeInCell0.className = 'quote-row-remove-x';
        removeInCell0.setAttribute('role', 'button');
        removeInCell0.setAttribute('tabindex', '0');
        removeInCell0.setAttribute('aria-label', 'Remove line');
        removeInCell0.textContent = '−';
        productCell.insertBefore(removeInCell0, productCell.firstChild);
      }
    }
    const title = getQuoteLineProductName(row);
    const qtyMeta = getQuoteLineQuantityMeta(row);
    const unitPrice = getQuoteLineUnitPrice(row);
    const qtyLabel = row.dataset.labourRow === 'true'
      ? formatLabourHoursDisplay(qtyMeta.value)
      : formatQuoteQtyDisplay(qtyMeta.value);
    const unitLabel = formatCurrency(unitPrice);

    let lineSummary = productCell.querySelector('.quote-mobile-line-summary');
    if (!lineSummary) {
      lineSummary = document.createElement('span');
      lineSummary.className = 'quote-mobile-line-summary';
      productCell.appendChild(lineSummary);
    }
    lineSummary.textContent = `${qtyLabel} x ${unitLabel}${row.dataset.labourRow === 'true' ? '/hr' : ''} · Tap to edit`;

    // 54.93.3: on mobile, material rows (non-labour, non-metres) get qty stepper; only add qty summary for labour/metres so we don’t leave a stray summary in the cell
    const isLabourRow = row.dataset.labourRow === 'true';
    const isMetresRow = !!(
      row.querySelector('.quote-qty-metres-input') ||
      (row.dataset.manualLength === 'true' && row.dataset.lengthMm != null && row.dataset.lengthMm !== '')
    );
    const useStepper = isMobile && (isLabourRow || isMetresRow || !isLabourRow);
    if (!useStepper) {
      let qtySummary = qtyCell.querySelector('.quote-mobile-line-qty-summary');
      if (!qtySummary) {
        qtySummary = document.createElement('span');
        qtySummary.className = 'quote-mobile-line-qty-summary';
        qtyCell.appendChild(qtySummary);
      }
      qtySummary.textContent = qtyLabel;
    }

    if (useStepper) {
      qtyCell.querySelector('.quote-mobile-line-qty-summary')?.remove();
      let stepperWrap = qtyCell.querySelector('.quote-mobile-qty-stepper');
      if (!stepperWrap) {
        stepperWrap = document.createElement('div');
        stepperWrap.className = 'quote-mobile-qty-stepper';
        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'quote-mobile-qty-stepper-btn quote-mobile-qty-stepper-btn--minus';
        minusBtn.setAttribute('aria-label', isLabourRow ? 'Decrease hours' : 'Decrease quantity');
        minusBtn.textContent = '−';
        const valueSpan = document.createElement('span');
        valueSpan.className = 'quote-mobile-qty-stepper-value';
        valueSpan.setAttribute('aria-live', 'polite');
        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'quote-mobile-qty-stepper-btn quote-mobile-qty-stepper-btn--plus';
        plusBtn.setAttribute('aria-label', isLabourRow ? 'Increase hours' : 'Increase quantity');
        plusBtn.textContent = '+';
        stepperWrap.appendChild(minusBtn);
        stepperWrap.appendChild(valueSpan);
        stepperWrap.appendChild(plusBtn);
        const step = qtyMeta.step;
        let updateStepperValue;
        let applyStep;
        if (isLabourRow) {
          const hoursInput = row.querySelector('.quote-labour-hours-input');
          if (hoursInput) {
            qtyCell.innerHTML = '';
            qtyCell.appendChild(stepperWrap);
            hoursInput.classList.add('quote-labour-hours-input--hidden-mobile');
            qtyCell.appendChild(hoursInput);
          } else {
            qtyCell.innerHTML = '';
            qtyCell.appendChild(stepperWrap);
          }
          updateStepperValue = () => {
            const h = parseFloat(hoursInput?.value) || 0;
            valueSpan.textContent = formatLabourHoursDisplay(h);
          };
          applyStep = (delta) => {
            const current = parseFloat(hoursInput?.value) || 0;
            const next = Math.max(0, current + delta);
            if (hoursInput) hoursInput.value = String(next);
            updateLabourRowTotal(row);
            updateStepperValue();
            calculateAndDisplayQuote().then(() => syncMobileQuoteLineSummaries());
          };
        } else if (isMetresRow) {
          qtyCell.querySelector('.quote-qty-metres-input')?.remove();
          qtyCell.innerHTML = '';
          qtyCell.appendChild(stepperWrap);
          updateStepperValue = () => {
            const meta = getQuoteLineQuantityMeta(row);
            const m = meta.value;
            const s = Number(m) === m && m % 1 !== 0 ? m.toFixed(1) : String(m);
            valueSpan.textContent = s + ' m';
          };
          applyStep = (delta) => {
            const current = getQuoteLineQuantityMeta(row).value;
            const nextMetres = Math.max(0, (typeof current === 'number' ? current : parseFloat(current) || 0) + delta);
            row.dataset.lengthMm = String(mToMm(nextMetres));
            row.dataset.manualLength = 'true';
            row.removeAttribute('data-incomplete-measurement');
            row.classList.remove('quote-row-incomplete-measurement');
            const metresInput = qtyCell.querySelector('.quote-qty-metres-input');
            if (metresInput) metresInput.remove();
            updateStepperValue();
            calculateAndDisplayQuote().then(() => syncMobileQuoteLineSummaries());
          };
        } else {
          qtyCell.innerHTML = '';
          qtyCell.appendChild(stepperWrap);
          updateStepperValue = () => {
            const v = getQuoteRowStoredQty(row);
            valueSpan.textContent = v != null ? formatQuoteQtyDisplay(v) : '0';
          };
          applyStep = (delta) => {
            const current = parseFloat(getQuoteRowStoredQty(row)) || 0;
            const next = Math.max(0, current + delta);
            setQuoteRowStoredQty(row, next);
            updateStepperValue();
            calculateAndDisplayQuote().then(() => syncMobileQuoteLineSummaries());
          };
        }
        minusBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); applyStep(-step); });
        plusBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); applyStep(step); });
      }
      const valueSpan = stepperWrap.querySelector('.quote-mobile-qty-stepper-value');
      if (valueSpan) {
        if (isLabourRow) valueSpan.textContent = formatLabourHoursDisplay(qtyMeta.value);
        else if (isMetresRow) {
          const m = qtyMeta.value;
          const s = Number(m) === m && m % 1 !== 0 ? m.toFixed(1) : String(m);
          valueSpan.textContent = s + ' m';
        } else valueSpan.textContent = formatQuoteQtyDisplay(getQuoteRowStoredQty(row) ?? 0);
      }
    }

    if (row.dataset.labourRow === 'true' && isMobile) {
      let warnIcon = qtyCell.querySelector('.quote-labour-zero-warning-icon');
      if (totalLabourHours <= 0) {
        if (!warnIcon) {
          warnIcon = document.createElement('span');
          warnIcon.className = 'quote-labour-zero-warning-icon';
          warnIcon.setAttribute('aria-hidden', 'true');
          warnIcon.textContent = '\u26A0\uFE0F';
          qtyCell.appendChild(warnIcon);
        }
        warnIcon.hidden = false;
      } else if (warnIcon) {
        warnIcon.hidden = true;
      }
    } else {
      const warnIcon = qtyCell.querySelector('.quote-labour-zero-warning-icon');
      if (warnIcon) warnIcon.hidden = true;
    }

    if (isMobile) {
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `${title}. ${qtyLabel} at ${unitLabel}${row.dataset.labourRow === 'true' ? ' per hour' : ''}. Tap to edit.`);
    } else {
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-label');
    }
  });

  // 54.93.2: empty row (Add Item/Service) – green plus in cell 0 on mobile
  if (isMobile) {
    const emptyRow = getEmptyRow();
    if (emptyRow && emptyRow.cells[0]) {
      let addPlus = emptyRow.cells[0].querySelector('.quote-row-add-plus');
      if (!addPlus) {
        addPlus = document.createElement('span');
        addPlus.className = 'quote-row-add-plus';
        addPlus.setAttribute('aria-hidden', 'true');
        addPlus.textContent = '+';
        emptyRow.cells[0].insertBefore(addPlus, emptyRow.cells[0].firstChild);
      }
    }
  }

  if (!isMobile) {
    const editorModal = document.getElementById('labourEditorModal');
    if (editorModal && !editorModal.hasAttribute('hidden')) {
      closeAccessibleModal('labourEditorModal');
    }
  }
}

function closeLabourEditorModal() {
  closeAccessibleModal('labourEditorModal');
}

function renderLabourEditorRows() {
  const list = document.getElementById('labourEditorList');
  const addBtn = document.getElementById('labourEditorAddRowBtn');
  if (!list) return;
  list.innerHTML = '';

  const row = findQuoteRowByUid(quoteLineEditorState.rowUid);
  if (!row || !isEditableQuoteLineRow(row)) {
    quoteLineEditorState.rowUid = '';
    quoteLineEditorState.rowType = '';
    if (addBtn) addBtn.hidden = true;
    return;
  }

  const isLabour = row.dataset.labourRow === 'true';
  const qtyStep = Number.isFinite(quoteLineEditorState.qtyStep) && quoteLineEditorState.qtyStep > 0
    ? quoteLineEditorState.qtyStep
    : (isLabour ? 0.5 : 1);

  if (addBtn) addBtn.hidden = !isLabour;

  const card = document.createElement('div');
  card.className = 'labour-editor-row';
  card.dataset.rowId = quoteLineEditorState.rowUid;

  const header = document.createElement('div');
  header.className = 'labour-editor-row-header';
  const title = document.createElement('h4');
  title.className = 'labour-editor-row-title';
  title.textContent = quoteLineEditorState.title || getQuoteLineProductName(row);
  header.appendChild(title);

  const fields = document.createElement('div');
  fields.className = 'labour-editor-fields';

  const quantityRow = document.createElement('div');
  quantityRow.className = 'labour-editor-group-row';
  const quantityLabel = document.createElement('span');
  quantityLabel.className = 'labour-editor-field-label';
  quantityLabel.textContent = 'Quantity';
  const stepper = document.createElement('div');
  stepper.className = 'labour-editor-stepper';
  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.className = 'labour-editor-stepper-btn labour-editor-stepper-btn--minus';
  minusBtn.textContent = '−';
  minusBtn.setAttribute('aria-label', 'Decrease quantity');
  const qtyEditor = document.createElement('input');
  qtyEditor.type = 'number';
  qtyEditor.min = '0';
  qtyEditor.step = String(qtyStep);
  qtyEditor.value = formatQuoteQtyDisplay(quoteLineEditorState.draftQty);
  qtyEditor.className = 'labour-editor-field-input';
  qtyEditor.dataset.field = 'qty';
  qtyEditor.setAttribute('aria-label', 'Quantity');
  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.className = 'labour-editor-stepper-btn labour-editor-stepper-btn--plus';
  plusBtn.textContent = '+';
  plusBtn.setAttribute('aria-label', 'Increase quantity');
  stepper.appendChild(minusBtn);
  stepper.appendChild(qtyEditor);
  stepper.appendChild(plusBtn);
  quantityRow.appendChild(quantityLabel);
  quantityRow.appendChild(stepper);

  const purchaseRow = document.createElement('div');
  purchaseRow.className = 'labour-editor-group-row';
  const purchaseLabel = document.createElement('span');
  purchaseLabel.className = 'labour-editor-field-label';
  purchaseLabel.textContent = 'Purchase Cost';
  const purchaseValue = document.createElement('span');
  purchaseValue.className = 'labour-editor-field-value';
  purchaseValue.textContent = formatCurrency(getQuoteLineCost(row));
  purchaseRow.appendChild(purchaseLabel);
  purchaseRow.appendChild(purchaseValue);

  const markupRow = document.createElement('div');
  markupRow.className = 'labour-editor-group-row';
  const markupLabel = document.createElement('span');
  markupLabel.className = 'labour-editor-field-label';
  markupLabel.textContent = 'Markup';
  const markupValue = document.createElement('span');
  markupValue.className = 'labour-editor-field-value labour-editor-field-value--muted';
  const markup = getQuoteLineMarkup(row);
  markupValue.textContent = Number.isFinite(markup) ? `${formatQuoteQtyDisplay(markup)}%` : '—';
  markupRow.appendChild(markupLabel);
  markupRow.appendChild(markupValue);

  const unitPriceRow = document.createElement(isLabour ? 'label' : 'div');
  unitPriceRow.className = 'labour-editor-group-row labour-editor-field';
  const rateLabel = document.createElement('span');
  rateLabel.className = 'labour-editor-field-label';
  rateLabel.textContent = 'Unit Price';
  unitPriceRow.appendChild(rateLabel);
  let rateEditor = null;
  if (isLabour) {
    rateEditor = document.createElement('input');
    rateEditor.type = 'number';
    rateEditor.min = '0';
    rateEditor.step = '0.01';
    rateEditor.value = formatQuoteQtyDisplay(quoteLineEditorState.draftUnitPrice);
    rateEditor.className = 'labour-editor-field-input';
    rateEditor.dataset.field = 'rate';
    rateEditor.setAttribute('aria-label', 'Unit price');
    unitPriceRow.appendChild(rateEditor);
  } else {
    const unitValue = document.createElement('span');
    unitValue.className = 'labour-editor-field-value';
    unitValue.textContent = formatCurrency(quoteLineEditorState.draftUnitPrice);
    unitPriceRow.appendChild(unitValue);
  }

  const note = document.createElement('p');
  note.className = 'labour-editor-note';
  note.textContent = 'Unit Price Excludes GST';

  const taxRow = document.createElement('div');
  taxRow.className = 'labour-editor-group-row';
  const taxLabel = document.createElement('span');
  taxLabel.className = 'labour-editor-field-label';
  taxLabel.textContent = '15% GST on Income';
  const taxToggle = document.createElement('label');
  taxToggle.className = 'labour-editor-tax-toggle';
  const taxToggleInput = document.createElement('input');
  taxToggleInput.type = 'checkbox';
  taxToggleInput.className = 'labour-editor-tax-toggle-input';
  taxToggleInput.checked = quoteLineEditorState.isTaxApplicable !== false;
  taxToggleInput.setAttribute('aria-label', 'Toggle GST');
  const taxToggleSlider = document.createElement('span');
  taxToggleSlider.className = 'labour-editor-tax-toggle-slider';
  taxToggle.appendChild(taxToggleInput);
  taxToggle.appendChild(taxToggleSlider);
  taxRow.appendChild(taxLabel);
  taxRow.appendChild(taxToggle);

  const totalRow = document.createElement('div');
  totalRow.className = 'labour-editor-group-row';
  const totalLabel = document.createElement('span');
  totalLabel.className = 'labour-editor-field-label';
  totalLabel.textContent = 'Total Price';
  const lineTotal = document.createElement('span');
  lineTotal.className = 'labour-editor-line-total';
  totalRow.appendChild(totalLabel);
  totalRow.appendChild(lineTotal);

  const rowActions = document.createElement('div');
  rowActions.className = 'labour-editor-row-actions';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'labour-editor-remove-btn';
  removeBtn.textContent = 'Remove Line';
  removeBtn.disabled = isLabour && getLabourRowsOrdered().length <= 1;
  rowActions.appendChild(removeBtn);

  const taxGroup = document.createElement('div');
  taxGroup.className = 'labour-editor-fields labour-editor-fields--single';
  taxGroup.appendChild(taxRow);

  const totalGroup = document.createElement('div');
  totalGroup.className = 'labour-editor-fields labour-editor-fields--single';
  totalGroup.appendChild(totalRow);

  fields.appendChild(quantityRow);
  fields.appendChild(purchaseRow);
  fields.appendChild(markupRow);
  fields.appendChild(unitPriceRow);
  card.appendChild(header);
  card.appendChild(fields);
  card.appendChild(note);
  card.appendChild(taxGroup);
  card.appendChild(totalGroup);
  card.appendChild(rowActions);
  list.appendChild(card);

  const rerenderTotals = () => {
    const qty = Number.isFinite(quoteLineEditorState.draftQty) ? quoteLineEditorState.draftQty : 0;
    const unitPrice = Number.isFinite(quoteLineEditorState.draftUnitPrice) ? quoteLineEditorState.draftUnitPrice : 0;
    const exGSTTotal = Math.round(qty * unitPrice * 100) / 100;
    const displayTotal = quoteLineEditorState.isTaxApplicable
      ? Math.round(exGSTTotal * 1.15 * 100) / 100
      : exGSTTotal;
    lineTotal.textContent = formatCurrency(displayTotal);
  };

  const setQtyDraft = (nextValue) => {
    let next = parseFloat(nextValue);
    if (!Number.isFinite(next) || next < 0) next = 0;
    if (qtyStep >= 1) next = Math.round(next);
    else next = Math.round(next * 1000) / 1000;
    quoteLineEditorState.draftQty = next;
    qtyEditor.value = formatQuoteQtyDisplay(next);
    if (isLabour) {
      const targetRow = findQuoteRowByUid(quoteLineEditorState.rowUid);
      const hoursInput = targetRow?.querySelector('.quote-labour-hours-input');
      if (hoursInput) hoursInput.value = formatQuoteQtyDisplay(next);
      if (targetRow) {
        updateLabourRowTotal(targetRow);
        updateQuoteTotalWarning();
      }
    }
    rerenderTotals();
  };

  qtyEditor.addEventListener('input', () => setQtyDraft(qtyEditor.value));
  qtyEditor.addEventListener('change', () => setQtyDraft(qtyEditor.value));
  minusBtn.addEventListener('click', () => setQtyDraft(quoteLineEditorState.draftQty - qtyStep));
  plusBtn.addEventListener('click', () => setQtyDraft(quoteLineEditorState.draftQty + qtyStep));

  if (rateEditor) {
    const setRateDraft = (nextValue) => {
      let next = parseFloat(nextValue);
      if (!Number.isFinite(next) || next < 0) next = 0;
      next = Math.round(next * 100) / 100;
      quoteLineEditorState.draftUnitPrice = next;
      rateEditor.value = formatQuoteQtyDisplay(next);
      purchaseValue.textContent = formatCurrency(next);
      const targetRow = findQuoteRowByUid(quoteLineEditorState.rowUid);
      const unitPriceInput = targetRow?.querySelector('.quote-labour-unit-price-input');
      if (unitPriceInput) unitPriceInput.value = formatQuoteQtyDisplay(next);
      if (targetRow) {
        updateLabourRowTotal(targetRow);
        updateQuoteTotalWarning();
      }
      rerenderTotals();
    };
    rateEditor.addEventListener('input', () => setRateDraft(rateEditor.value));
    rateEditor.addEventListener('change', () => setRateDraft(rateEditor.value));
  }

  taxToggleInput.addEventListener('change', () => {
    quoteLineEditorState.isTaxApplicable = !!taxToggleInput.checked;
    rerenderTotals();
  });

  removeBtn.addEventListener('click', () => {
    const targetRow = findQuoteRowByUid(quoteLineEditorState.rowUid);
    if (!targetRow || !isEditableQuoteLineRow(targetRow)) return;
    if (targetRow.dataset.labourRow === 'true' && getLabourRowsOrdered().length <= 1) return;
    targetRow.remove();
    ensureLabourRowsExist();
    removeEmptySectionHeaders();
    recalcQuoteTotalsFromTableBody();
    syncMobileQuoteLineSummaries();
    closeLabourEditorModal();
  });

  rerenderTotals();
}

function applyQuoteLineEditorChanges() {
  const row = findQuoteRowByUid(quoteLineEditorState.rowUid);
  if (!row || !isEditableQuoteLineRow(row)) {
    closeLabourEditorModal();
    return;
  }
  if (row.dataset.labourRow === 'true') {
    const hoursInput = row.querySelector('.quote-labour-hours-input');
    const unitPriceInput = row.querySelector('.quote-labour-unit-price-input');
    if (hoursInput) hoursInput.value = formatQuoteQtyDisplay(quoteLineEditorState.draftQty);
    if (unitPriceInput) unitPriceInput.value = formatQuoteQtyDisplay(quoteLineEditorState.draftUnitPrice);
    updateLabourRowTotal(row);
    updateQuoteTotalWarning();
  } else {
    const qtyInput = row.querySelector('.quote-line-qty-input');
    const nextQty = formatQuoteQtyDisplay(quoteLineEditorState.draftQty);
    setQuoteRowStoredQty(row, parseFloat(nextQty) || 0);
    if (qtyInput) {
      qtyInput.value = nextQty;
      qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (row.cells[1]) {
      row.cells[1].textContent = nextQty;
      recalcQuoteTotalsFromTableBody();
    }
  }
  syncMobileQuoteLineSummaries();
  closeLabourEditorModal();
}

function openLabourEditorModal(row, triggerEl) {
  if (!isMobileQuoteViewport() || !isEditableQuoteLineRow(row)) return;
  const modal = document.getElementById('labourEditorModal');
  if (!modal) return;
  const qtyMeta = getQuoteLineQuantityMeta(row);
  quoteLineEditorState.rowUid = ensureQuoteRowUid(row);
  quoteLineEditorState.rowType = row.dataset.labourRow === 'true' ? 'labour' : 'material';
  quoteLineEditorState.draftQty = qtyMeta.value;
  quoteLineEditorState.draftUnitPrice = getQuoteLineUnitPrice(row);
  quoteLineEditorState.qtyStep = qtyMeta.step;
  quoteLineEditorState.title = getQuoteLineProductName(row);
  quoteLineEditorState.isTaxApplicable = true;
  renderLabourEditorRows();
  const firstInput = modal.querySelector('.labour-editor-field-input[data-field="qty"]');
  openAccessibleModal('labourEditorModal', {
    triggerEl: triggerEl || row || document.getElementById('quoteModalBackBtn'),
    initialFocusEl: firstInput || document.getElementById('labourEditorDoneBtn'),
  });
}

function syncMobileLabourRowSummary() {
  syncMobileQuoteLineSummaries();
}

function getDefaultLabourUnitPrice() {
  const rate = cachedLabourRates.find((r) => r.id === 'REP-LAB') || cachedLabourRates[0];
  return rate ? Number(rate.hourlyRate) : 100;
}

/** Update a single labour row's total cell and dataset from hours and unit price (Section 50, labour as product). */
function updateLabourRowTotal(row) {
  const hoursInput = row.querySelector('.quote-labour-hours-input');
  const unitPriceInput = row.querySelector('.quote-labour-unit-price-input');
  const hours = parseFloat(hoursInput?.value) || 0;
  const unitPrice = parseFloat(unitPriceInput?.value) || 0;
  row.dataset.hourlyRate = String(unitPrice);
  const total = Math.round(hours * unitPrice * 100) / 100;
  const totalCell = row.cells[5];
  if (totalCell) {
    const valEl = totalCell.querySelector('.quote-cell-total-value');
    if (valEl) valEl.textContent = formatCurrency(total);
    else totalCell.textContent = formatCurrency(total);
  }
  recalcQuoteTotalsFromTableBody();
}

/** Create one labour row and insert before insertBefore (Section 50, labour as product). Options: { defaultHours, defaultUnitPrice }. Returns the new row. */
function createLabourRow(insertBefore, options = {}) {
  const tableBody = document.getElementById('quoteTableBody');
  if (!tableBody || !insertBefore) return null;
  const defaultHours = options.defaultHours != null ? options.defaultHours : 0;
  const defaultUnitPrice = options.defaultUnitPrice != null ? options.defaultUnitPrice : getDefaultLabourUnitPrice();

  const tr = document.createElement('tr');
  tr.dataset.labourRow = 'true';
  tr.className = 'quote-row-labour';
  const productCell = document.createElement('td');
  productCell.className = 'quote-cell-labour-product';
  const label = document.createElement('strong');
  label.className = 'quote-labour-label';
  label.textContent = 'Labour';
  productCell.appendChild(label);
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'quote-labour-dup-btn';
  dupBtn.innerHTML = '+👷';
  dupBtn.setAttribute('aria-label', 'Duplicate labour row');
  dupBtn.title = 'Duplicate labour row';
  productCell.appendChild(dupBtn);
  tr.appendChild(productCell);

  const qtyCell = document.createElement('td');
  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.className = 'quote-labour-hours-input';
  hoursInput.min = '0';
  hoursInput.step = '0.5';
  hoursInput.value = String(defaultHours);
  hoursInput.setAttribute('aria-label', 'Labour hours');
  qtyCell.appendChild(hoursInput);
  tr.appendChild(qtyCell);

  tr.appendChild(document.createElement('td'));
  tr.appendChild(document.createElement('td'));
  const unitPriceCell = document.createElement('td');
  const unitPriceWrap = document.createElement('span');
  unitPriceWrap.className = 'quote-labour-unit-price-wrap';
  const unitPricePrefix = document.createElement('span');
  unitPricePrefix.className = 'quote-labour-unit-price-prefix';
  unitPricePrefix.textContent = '$';
  const unitPriceInput = document.createElement('input');
  unitPriceInput.type = 'number';
  unitPriceInput.className = 'quote-labour-unit-price-input';
  unitPriceInput.min = '0';
  unitPriceInput.step = '0.01';
  unitPriceInput.value = String(defaultUnitPrice);
  unitPriceInput.setAttribute('aria-label', 'Unit price per hour');
  unitPriceWrap.appendChild(unitPricePrefix);
  unitPriceWrap.appendChild(unitPriceInput);
  unitPriceCell.appendChild(unitPriceWrap);
  tr.appendChild(unitPriceCell);

  const totalCell = document.createElement('td');
  totalCell.className = 'quote-cell-total';
  const totalVal = document.createElement('span');
  totalVal.className = 'quote-cell-total-value';
  totalVal.textContent = formatCurrency(0);
  totalCell.appendChild(totalVal);
  const removeX = document.createElement('span');
  removeX.className = 'quote-row-remove-x';
  removeX.setAttribute('role', 'button');
  removeX.setAttribute('tabindex', '0');
  removeX.setAttribute('aria-label', 'Remove line');
  removeX.textContent = '×';
  totalCell.appendChild(removeX);
  tr.appendChild(totalCell);

  tr.cells[2].textContent = '—';
  tr.cells[3].textContent = '—';
  tr.dataset.hourlyRate = String(defaultUnitPrice);

  tableBody.insertBefore(tr, insertBefore);

  hoursInput.addEventListener('input', () => updateLabourRowTotal(tr));
  hoursInput.addEventListener('change', () => updateLabourRowTotal(tr));
  unitPriceInput.addEventListener('input', () => updateLabourRowTotal(tr));
  unitPriceInput.addEventListener('change', () => updateLabourRowTotal(tr));

  dupBtn.addEventListener('click', () => {
    const insertBeforeRow = getEmptyRow();
    if (!insertBeforeRow) return;
    const hrs = parseFloat(hoursInput.value) || 0;
    const up = parseFloat(unitPriceInput.value) || getDefaultLabourUnitPrice();
    createLabourRow(insertBeforeRow, { defaultHours: hrs, defaultUnitPrice: up });
  });
  tr.addEventListener('mouseenter', () => tr.classList.add('quote-row-hovered'));
  tr.addEventListener('mouseleave', () => tr.classList.remove('quote-row-hovered'));

  updateLabourRowTotal(tr);
  return tr;
}

/** Ensure at least one labour row exists above the empty row (Section 50). */
function ensureLabourRowsExist() {
  const emptyRow = getEmptyRow();
  if (!emptyRow) return;
  if (getLabourRowsOrdered().length === 0) {
    createLabourRow(emptyRow, { defaultHours: 0, defaultUnitPrice: getDefaultLabourUnitPrice() });
  }
}

function openQuoteProductList(combobox, filterTerm) {
  const list = combobox.querySelector('.quote-product-list');
  const input = combobox.querySelector('.quote-product-combobox-input');
  if (!list || !input) return;
  const products = filterProductsForQuoteSearch(filterTerm !== undefined ? filterTerm : input.value);
  list.innerHTML = '';
  list.hidden = products.length === 0;
  if (products.length === 0) {
    combobox.classList.remove('quote-product-combobox--open');
    return;
  }
  products.forEach((p) => {
    const option = document.createElement('div');
    option.className = 'quote-product-list-option';
    option.setAttribute('role', 'option');
    option.setAttribute('tabindex', '-1');
    option.textContent = p.name;
    option.dataset.productId = p.id;
    option.dataset.productName = p.name || '';
    list.appendChild(option);
  });
  combobox.classList.add('quote-product-combobox--open');
}

function closeQuoteProductList(combobox) {
  if (!combobox) return;
  combobox.classList.remove('quote-product-combobox--open');
  const list = combobox.querySelector('.quote-product-list');
  if (list) list.hidden = true;
}

/** Prefer exact typed match on Enter before falling back to the first filtered option. */
function getPreferredQuoteProductOption(combobox, inputValue) {
  const list = combobox?.querySelector('.quote-product-list');
  if (!list) return null;
  const options = Array.from(list.querySelectorAll('.quote-product-list-option'));
  if (options.length === 0) return null;
  const term = String(inputValue || '').trim().toLowerCase();
  if (!term) return options[0];
  const exactMatch = options.find((opt) => {
    const name = String(opt.dataset.productName || '').trim().toLowerCase();
    const id = String(opt.dataset.productId || '').trim().toLowerCase();
    return name === term || id === term;
  });
  if (exactMatch) return exactMatch;
  const prefixMatch = options.find((opt) => String(opt.dataset.productName || '').toLowerCase().startsWith(term));
  return prefixMatch || options[0];
}

/** Convert empty row to a normal quote line and append a new empty row. If product already exists, merge qty into that row and keep one empty row. */
function commitEmptyRow(tr, productId, qty) {
  const table = document.getElementById('quotePartsTable');
  const tableBody = document.getElementById('quoteTableBody');
  if (!tr || !tableBody) return;
  const product = state.products.find((p) => p.id === productId);
  const name = getQuoteProductDisplayName(productId, product?.name);
  const qtyNum = Math.max(1, parseFloat(qty) || 1);

  const existingRow = tableBody.querySelector(`tr[data-asset-id="${CSS.escape(productId)}"]:not([data-empty-row="true"]):not([data-manual-length="true"])`);
  if (existingRow && existingRow.cells[1]) {
    delete existingRow.dataset.lengthMm;
    const currentQty = getQuoteLineQuantityMeta(existingRow).value || 0;
    const nextQty = currentQty + qtyNum;
    setQuoteRowStoredQty(existingRow, nextQty);
    existingRow.cells[1].textContent = formatQuoteQtyDisplay(nextQty);
    tr.remove();
    appendEmptyQuoteRow();
    ensureLabourRowsExist();
    calculateAndDisplayQuote();
    return;
  }

  const productCell = tr.cells[0];
  const combobox = productCell.querySelector('.quote-product-combobox');
  if (combobox) {
    productCell.removeChild(combobox);
    closeQuoteProductList(combobox);
  }
  productCell.textContent = name;

  const qtyCell = tr.cells[1];
  const qtyInput = qtyCell.querySelector('.quote-empty-qty-input');
  if (qtyInput) qtyCell.removeChild(qtyInput);
  delete tr.dataset.lengthMm;
  delete tr.dataset.manualLength;
  setQuoteRowStoredQty(tr, qtyNum);
  qtyCell.textContent = formatQuoteQtyDisplay(qtyNum);

  tr.cells[2].textContent = '—';
  tr.cells[3].textContent = '—';
  tr.cells[4].textContent = '—';
  tr.cells[5].textContent = '—';
  tr.dataset.assetId = productId;
  delete tr.dataset.emptyRow;
  tr.classList.remove('quote-row-empty');

  if (table?.classList.contains('quote-parts-table--editing')) addEditInputsToRow(tr);

  appendEmptyQuoteRow();
  ensureLabourRowsExist();
  calculateAndDisplayQuote();
}

function initEmptyQuoteRow(tr) {
  const combobox = tr.querySelector('.quote-product-combobox');
  const input = combobox?.querySelector('.quote-product-combobox-input');
  const trigger = combobox?.querySelector('.quote-product-dropdown-trigger');
  const list = combobox?.querySelector('.quote-product-list');
  const qtyInput = tr.querySelector('.quote-empty-qty-input');
  if (!combobox || !input || !trigger || !list) return;

  const showList = (filter) => {
    openQuoteProductList(combobox, filter);
  };

  input.addEventListener('input', () => showList(input.value));
  input.addEventListener('focus', () => showList(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeQuoteProductList(combobox);
      input.blur();
      return;
    }
    if (e.key === 'ArrowDown' && !combobox.classList.contains('quote-product-combobox--open')) {
      showList(input.value);
      e.preventDefault();
      const first = list.querySelector('.quote-product-list-option');
      if (first) first.focus();
      return;
    }
    if (e.key === 'Enter') {
      const preferred = getPreferredQuoteProductOption(combobox, input.value);
      if (preferred) {
        e.preventDefault();
        commitEmptyRow(tr, preferred.dataset.productId, qtyInput?.value || 1);
      }
    }
  });

  trigger.addEventListener('click', () => {
    if (combobox.classList.contains('quote-product-combobox--open')) closeQuoteProductList(combobox);
    else showList(input.value);
  });

  list.addEventListener('click', (e) => {
    const option = e.target.closest('.quote-product-list-option');
    if (!option) return;
    const productId = option.dataset.productId;
    const qty = qtyInput ? (parseFloat(qtyInput.value) || 1) : 1;
    commitEmptyRow(tr, productId, qty);
  });

  list.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeQuoteProductList(combobox);
      input.focus();
    }
    if (e.key === 'Enter' && e.target.classList.contains('quote-product-list-option')) {
      commitEmptyRow(tr, e.target.dataset.productId, qtyInput?.value || 1);
    }
  });

}

function initQuoteModal() {
  const modal = document.getElementById('quoteModal');
  const btnBack = document.getElementById('quoteModalBackBtn');
  const btnClose = document.getElementById('quoteModalClose');
  const btnCloseFooter = document.getElementById('quoteCloseBtn');
  const btnGenerate = document.getElementById('generateQuoteBtn');
  const tableBody = document.getElementById('quoteTableBody');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');

  if (!modal || !btnGenerate) return;

  btnBack?.addEventListener('click', hideQuoteModal);
  btnClose?.addEventListener('click', hideQuoteModal);
  btnCloseFooter?.addEventListener('click', hideQuoteModal);

  // Row remove X (Section 40.4): remove line from quote and recalc totals. 54.93.2: on mobile, red minus in cell 0 also removes (no early return).
  tableBody?.addEventListener('click', (ev) => {
    const control = ev.target.closest('.quote-row-remove-x');
    if (!control) return;
    ev.preventDefault();
    const row = control.closest('tr');
    if (!row || row.dataset.sectionHeader || row.dataset.emptyRow === 'true') return;
    row.remove();
    ensureLabourRowsExist();
    removeEmptySectionHeaders();
    recalcQuoteTotalsFromTableBody();
  });
  tableBody?.addEventListener('keydown', (ev) => {
    const control = ev.target.closest('.quote-row-remove-x');
    if (!control || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    const row = control.closest('tr');
    if (!row || row.dataset.sectionHeader || row.dataset.emptyRow === 'true') return;
    row.remove();
    ensureLabourRowsExist();
    removeEmptySectionHeaders();
    recalcQuoteTotalsFromTableBody();
  });

  tableBody?.addEventListener('click', (ev) => {
    if (!isMobileQuoteViewport()) return;
    if (ev.target.closest('.quote-row-remove-x, .quote-header-metres-input, .quote-input-markup-inline, .quote-input-markup, .quote-input-unit, .quote-input-cost, .quote-mobile-qty-stepper')) return;
    const row = ev.target.closest('tr');
    if (!isEditableQuoteLineRow(row)) return;
    openLabourEditorModal(row, row);
  });
  tableBody?.addEventListener('keydown', (ev) => {
    if (!isMobileQuoteViewport()) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (ev.target.closest('.quote-mobile-qty-stepper')) return;
    const row = ev.target.closest('tr');
    if (!isEditableQuoteLineRow(row)) return;
    ev.preventDefault();
    openLabourEditorModal(row, row);
  });

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('.quote-product-combobox')) return;
    document.querySelectorAll('.quote-product-combobox--open').forEach((cb) => cb.classList.remove('quote-product-combobox--open'));
    document.querySelectorAll('.quote-product-list').forEach((list) => { list.hidden = true; });
  });

  btnGenerate.addEventListener('click', async () => {
    const elementsForQuote = getElementsForQuote();

    // Clear previous quote data
    if (tableBody) tableBody.innerHTML = '';
    if (materialsTotalDisplay) materialsTotalDisplay.textContent = '0.00';
    if (labourTotalDisplay) labourTotalDisplay.textContent = '0.00';
    if (quoteTotalDisplay) quoteTotalDisplay.textContent = '0.00';

    // Build parts table: one row per length type (e.g. Gutter 3m, Gutter 1.5m). Incomplete = type-only name + "Metres?"; complete = product name + qty only.
    elementsForQuote.forEach(({ assetId, quantity: qty, incomplete, length_mm }) => {
      const product = state.products.find((p) => p.id === assetId);
      const name = incomplete ? getQuoteProductDisplayName(assetId, product?.name) : (product?.name ?? assetId);
      const tr = document.createElement('tr');
      tr.dataset.assetId = assetId;
      if (incomplete) {
        tr.dataset.incompleteMeasurement = 'true';
        tr.classList.add('quote-row-incomplete-measurement');
      }
      if (length_mm != null && length_mm > 0) {
        tr.dataset.lengthMm = String(length_mm);
        tr.dataset.manualLength = 'true';
      }
      tr.innerHTML = `<td>${escapeHtml(name)}</td><td></td><td>—</td><td>—</td><td>—</td><td>—</td>`;
      const qtyCell = tr.cells[1];
      if (incomplete) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0;
        input.step = 0.001;
        input.placeholder = 'Metres?';
        input.className = 'quote-qty-metres-input';
        input.setAttribute('aria-label', 'Enter length in metres');
        qtyCell.appendChild(input);
        input.addEventListener('change', () => commitMetresInput(tr, input));
        input.addEventListener('blur', () => commitMetresInput(tr, input));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitMetresInput(tr, input); input.blur(); } });
      } else {
        setQuoteRowStoredQty(tr, parseFloat(String(qty)) || 0);
        qtyCell.textContent = String(qty);
      }
      if (tableBody) tableBody.appendChild(tr);
    });
    lastQuoteData = null;
    setQuoteEditMode(false);
    updateQuoteTotalWarning();
    syncQuoteModalViewportState();

    // Show modal
    openAccessibleModal('quoteModal', { triggerEl: btnGenerate });

    // Reset ServiceM8 feedback so it stays hidden until "Add to Job" sequence completes
    const servicem8FeedbackEl = document.getElementById('servicem8Feedback');
    if (servicem8FeedbackEl) {
      servicem8FeedbackEl.classList.add('quote-servicem8-feedback--hidden');
      servicem8FeedbackEl.classList.remove('quote-servicem8-feedback--visible');
    }

    // Ensure ServiceM8 status is checked when modal opens
    if (authState.token) {
      checkServiceM8Status();
    }

    // Fetch labour rates for labour row dropdowns (Section 50)
    try {
      const res = await fetch('/api/labour-rates');
      const data = await res.json();
      const rates = data.labour_rates || [];
      cachedLabourRates = rates || [];
    } catch (err) {
      console.error('Failed to load labour rates', err);
      cachedLabourRates = [];
    }

    appendEmptyQuoteRow();
    ensureLabourRowsExist();

    const elements = getElementsFromQuoteTable();
    if (elements.length > 0) {
      await calculateAndDisplayQuote();
    } else {
      syncMobileLabourRowSummary();
    }

    const firstLabourRow = getLabourRowsOrdered()[0];
    const firstHoursInput = firstLabourRow?.querySelector('.quote-labour-hours-input');
    if (layoutState.viewportMode !== 'mobile' && firstHoursInput) firstHoursInput.focus();
  });

  const labourEditorBackdrop = document.getElementById('labourEditorBackdrop');
  const labourEditorCloseBtn = document.getElementById('labourEditorCloseBtn');
  const labourEditorDoneBtn = document.getElementById('labourEditorDoneBtn');
  const labourEditorAddRowBtn = document.getElementById('labourEditorAddRowBtn');
  labourEditorBackdrop?.addEventListener('click', closeLabourEditorModal);
  labourEditorCloseBtn?.addEventListener('click', closeLabourEditorModal);
  labourEditorDoneBtn?.addEventListener('click', applyQuoteLineEditorChanges);
  labourEditorAddRowBtn?.addEventListener('click', () => {
    if (quoteLineEditorState.rowType !== 'labour') return;
    const emptyRow = getEmptyRow();
    if (!emptyRow) return;
    const newRow = createLabourRow(emptyRow, { defaultHours: 0, defaultUnitPrice: getDefaultLabourUnitPrice() });
    if (!newRow) return;
    recalcQuoteTotalsFromTableBody();
    updateQuoteTotalWarning();
    quoteLineEditorState.rowUid = ensureQuoteRowUid(newRow);
    quoteLineEditorState.rowType = 'labour';
    quoteLineEditorState.draftQty = parseFloat(newRow.querySelector('.quote-labour-hours-input')?.value) || 0;
    quoteLineEditorState.draftUnitPrice = parseFloat(newRow.querySelector('.quote-labour-unit-price-input')?.value) || getDefaultLabourUnitPrice();
    quoteLineEditorState.qtyStep = 0.5;
    quoteLineEditorState.title = getQuoteLineProductName(newRow);
    renderLabourEditorRows();
    const latestQtyInput = document.querySelector('#labourEditorList .labour-editor-row:last-child .labour-editor-field-input[data-field="qty"]');
    latestQtyInput?.focus();
  });

  // ServiceM8 job number (Task 22.28): 1–5 digits only; placeholder "e.g. 4999" is strictly placeholder, never used as value
  const servicem8JobIdInput = document.getElementById('servicem8JobIdInput');
  const servicem8AddToJobBtn = document.getElementById('servicem8AddToJobBtn');
  if (servicem8JobIdInput) {
    servicem8JobIdInput.addEventListener('input', () => {
      const raw = servicem8JobIdInput.value.replace(/\D/g, '');
      const limited = raw.slice(0, 5);
      if (limited !== servicem8JobIdInput.value) servicem8JobIdInput.value = limited;
      updateServicem8InputState();
    });
  }
  if (servicem8AddToJobBtn) {
    servicem8AddToJobBtn.addEventListener('click', () => {
      const jobId = (servicem8JobIdInput?.value || '').trim();
      if (!jobId || jobId.length < 1 || jobId.length > 5) {
        showMessage('Enter a job number (1–5 digits) to add materials to an existing job.', 'info');
        return;
      }
      const labourRows = getLabourRowsOrdered();
      let labourHours = 0;
      labourRows.forEach((row) => {
        labourHours += parseFloat(row.querySelector('.quote-labour-hours-input')?.value) || 0;
      });
      if (labourHours <= 0) {
        const labourWarnEl = document.getElementById('quoteLabourWarning');
        if (labourWarnEl) {
          labourWarnEl.textContent = 'Add labour hours to the quote before adding to a job.';
          labourWarnEl.hidden = false;
        }
        return;
      }
      if (servicem8AddToJobBtn.classList.contains('quote-servicem8-btn--loading')) return;
      runAddToJobLookupAndConfirm(servicem8AddToJobBtn, jobId);
    });
  }
  initJobConfirmationOverlay();

  const btnCopy = document.getElementById('quoteCopyBtn');
  btnCopy?.addEventListener('click', () => copyQuoteToClipboard());

  const btnPrint = document.getElementById('quotePrintBtn');
  btnPrint?.addEventListener('click', () => printQuote());

  const editPricingBtn = document.getElementById('editPricingBtn');
  editPricingBtn?.addEventListener('click', () => {
    const table = document.getElementById('quotePartsTable');
    const isEditing = table?.classList.contains('quote-parts-table--editing');
    setQuoteEditMode(!isEditing);
  });

  const savePricingBtn = document.getElementById('savePricingBtn');
  savePricingBtn?.addEventListener('click', async () => {
    const tableBody = document.getElementById('quoteTableBody');
    const table = document.getElementById('quotePartsTable');
    if (!table?.classList.contains('quote-parts-table--editing') || !tableBody) return;
    const updates = [];
    for (const row of tableBody.rows) {
      const productId = row.dataset.assetId;
      const costInput = row.querySelector('.quote-input-cost');
      const markupInput = row.querySelector('.quote-input-markup');
      if (!productId || !costInput || !markupInput) continue;
      const cost_price = parseFloat(costInput.value);
      const markup_percentage = parseFloat(markupInput.value);
      if (Number.isNaN(cost_price) || Number.isNaN(markup_percentage)) continue;
      updates.push({ id: productId, cost_price, markup_percentage });
    }
    if (updates.length === 0) return;

    const confirmMessage =
      'Are you sure? This will change the price permanently in ServiceM8 and the app.\n\nOnly continue if you\'ve confirmed — otherwise Jack will be grumpy 😠';
    const confirmed = await showAppConfirm(confirmMessage, {
      title: 'Save pricing changes',
      confirmText: 'Save pricing',
      destructive: true,
      triggerEl: savePricingBtn,
    });
    if (!confirmed) return;

    savePricingBtn.disabled = true;
    try {
      const res = await fetch('/api/products/update-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.detail === 'string' ? data.detail : data.detail?.msg || 'Failed to save pricing';
        showMessage(msg, 'error');
        savePricingBtn.disabled = false;
        updateSavePricingButtonState();
        return;
      }
      hasPricingChanges = false;
      updateSavePricingButtonState();
      showMessage('Pricing updated successfully.', 'success');
    } catch (err) {
      console.error('Save pricing failed', err);
      showMessage(err.message || 'Failed to save pricing.', 'error');
      savePricingBtn.disabled = false;
      updateSavePricingButtonState();
    }
  });
}

/**
 * When user enters metres in an incomplete row's "Metres?" input: save length_mm, clear incomplete state, recalc quote.
 */
function commitMetresInput(tr, input) {
  const val = parseFloat(input.value);
  if (!Number.isFinite(val) || val <= 0) return;
  tr.dataset.lengthMm = String(mToMm(val));
  tr.dataset.manualLength = 'true';
  // Remove incomplete state and input so calculateAndDisplayQuote() can update qty cell with proper value
  tr.removeAttribute('data-incomplete-measurement');
  tr.classList.remove('quote-row-incomplete-measurement');
  const qtyCell = tr.cells[1];
  if (qtyCell && input.parentNode === qtyCell) {
    qtyCell.removeChild(input);
    // Set placeholder text until calculateAndDisplayQuote() updates it with the actual qty
    qtyCell.textContent = String(val) + ' m';
  }
  calculateAndDisplayQuote();
  updateQuoteTotalWarning();
}

/**
 * Show ⚠️ and red total when any quote row has missing manual measurement; hide when none.
 * Also updates ServiceM8 job number section: disabled/shaded when there are outstanding manual entries (Task 22.28).
 */
function updateQuoteTotalWarning() {
  const tableBody = document.getElementById('quoteTableBody');
  const warningSpan = document.getElementById('quoteTotalWarning');
  const totalLine = document.getElementById('quoteTotalFinalLine');
  if (!tableBody || !warningSpan || !totalLine) return;
  const hasIncomplete = tableBody.querySelector('tr.quote-row-incomplete-measurement') != null;
  warningSpan.hidden = !hasIncomplete;
  totalLine.classList.toggle('quote-total-final--incomplete', hasIncomplete);
  updateServiceM8SectionState(hasIncomplete);
}

/**
 * Enable or disable the ServiceM8 job number field and button based on manual entries (Task 22.28).
 * When there are outstanding manual entries (incomplete measurement rows), the section is shaded and pointer-events: none.
 */
function updateServiceM8SectionState(hasIncomplete) {
  const section = document.getElementById('quoteServicem8Section');
  const input = document.getElementById('servicem8JobIdInput');
  const btn = document.getElementById('servicem8AddToJobBtn');
  const reasonEl = document.getElementById('quoteServicem8DisabledReason');
  const labourWarnEl = document.getElementById('quoteLabourWarning');
  if (!section || !input || !btn) return;
  // Hide labour warning when user has labour hours (Task 52.7)
  let labourHours = 0;
  getLabourRowsOrdered().forEach((row) => {
    labourHours += parseFloat(row.querySelector('.quote-labour-hours-input')?.value) || 0;
  });
  if (labourWarnEl) labourWarnEl.hidden = labourHours > 0;
  // Disable if manual entries incomplete OR ServiceM8 not connected
  const shouldDisable = hasIncomplete || !window.servicem8Connected;
  if (shouldDisable) {
    section.classList.add('quote-servicem8-section--disabled');
    input.disabled = true;
    btn.disabled = true;
    if (reasonEl) {
      reasonEl.textContent = !window.servicem8Connected
        ? 'Not signed in to ServiceM8'
        : 'Complete manual entries (Metres?) first';
      reasonEl.hidden = false;
    }
  } else {
    section.classList.remove('quote-servicem8-section--disabled');
    input.disabled = false;
    btn.disabled = false;
    if (reasonEl) reasonEl.hidden = true;
    updateServicem8InputState();
  }
}

/**
 * Update input/button state classes from actual input.value only (placeholder is never used as value).
 * Valid = 1–5 digits; adds --has-value on input and --valid on button for Apple-style styling.
 */
function updateServicem8InputState() {
  const input = document.getElementById('servicem8JobIdInput');
  const btn = document.getElementById('servicem8AddToJobBtn');
  if (!input || !btn) return;
  const raw = (input.value || '').trim();
  const valid = /^\d{1,5}$/.test(raw);
  input.classList.toggle('quote-servicem8-job-input--has-value', valid);
  btn.classList.toggle('quote-servicem8-btn--valid', valid);
}

/**
 * Add to Job: lookup job by generated_job_id, then show confirmation modal with job details.
 * Confirmation shows job_address, total_invoice_amount, and before→after amounts.
 * "Add to current Job" and "Make new job" buttons close the modal (no action yet).
 */
async function runAddToJobLookupAndConfirm(btn, jobId) {
  if (!btn || !authState.token) return;
  btn.disabled = true;
  btn.classList.add('quote-servicem8-btn--loading');

  const feedback = document.getElementById('servicem8Feedback');
  const resetButton = () => {
    btn.classList.remove('quote-servicem8-btn--loading', 'quote-servicem8-btn--done');
    btn.disabled = false;
  };

  try {
    const resp = await fetch(
      '/api/servicem8/jobs?generated_job_id=' + encodeURIComponent(jobId),
      { headers: { 'Authorization': 'Bearer ' + authState.token } }
    );
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const msg = resp.status === 404
        ? 'Job not found. Check the job number and try again.'
        : (typeof data.detail === 'string' ? data.detail : 'Job lookup failed.');
      if (feedback) {
        feedback.textContent = msg;
        feedback.classList.remove('quote-servicem8-feedback--success', 'quote-servicem8-feedback--hidden');
        feedback.classList.add('quote-servicem8-feedback--error', 'quote-servicem8-feedback--visible');
      }
      resetButton();
      return;
    }
    const job = await resp.json();

    // Get quote total from display (strip $ and parse)
    const quoteTotalEl = document.getElementById('quoteTotalDisplay');
    const quoteTotalRaw = (quoteTotalEl?.textContent || '0').replace(/[^0-9.-]/g, '');
    const quoteTotal = parseFloat(quoteTotalRaw) || 0;

    // ServiceM8 total_invoice_amount is inc GST; quote total from display is exc GST
    const currentRaw = job.total_invoice_amount;
    const currentInc = currentRaw === null || currentRaw === undefined || currentRaw === ''
      ? 0
      : parseFloat(String(currentRaw)) || 0;
    const currentExc = Math.round((currentInc / 1.15) * 100) / 100;
    const newExc = Math.round((currentExc + quoteTotal) * 100) / 100;
    const newInc = Math.round(newExc * 1.15 * 100) / 100;

    // JobConfirmationOverlay: store amounts and populate (default = exc GST)
    const overlay = document.getElementById('jobConfirmOverlay');
    const jobIdEl = document.getElementById('jobConfirmJobId');
    const addressEl = document.getElementById('jobConfirmAddress');
    const currentEl = document.getElementById('jobConfirmCurrent');
    const quoteEl = document.getElementById('jobConfirmQuote');
    const newEl = document.getElementById('jobConfirmNew');
    const addIdEl = document.getElementById('jobConfirmAddId');
    const genId = job.generated_job_id || jobId;
    // quoteInc = quoteExc * 1.15 for inc GST display when toggle is "inc"
    const quoteInc = Math.round(quoteTotal * 1.15 * 100) / 100;
    if (overlay) {
      overlay.dataset.currentExc = String(currentExc);
      overlay.dataset.currentInc = String(currentInc);
      overlay.dataset.quoteExc = String(quoteTotal);
      overlay.dataset.quoteInc = String(quoteInc);
      overlay.dataset.newExc = String(newExc);
      overlay.dataset.newInc = String(newInc);
    }
    if (jobIdEl) jobIdEl.textContent = 'Job #' + genId;
    if (addressEl) addressEl.textContent = job.job_address || '—';
    // Default: exc GST view (amount + smaller GST label)
    if (currentEl) currentEl.innerHTML = escapeHtml(formatCurrency(currentExc)) + ' <span class="job-confirm-financial-gst">exc GST</span>';
    if (quoteEl) quoteEl.innerHTML = '+ ' + escapeHtml(formatCurrency(quoteTotal)) + ' <span class="job-confirm-financial-gst">exc GST</span>';
    if (newEl) newEl.innerHTML = escapeHtml(formatCurrency(newExc)) + ' <span class="job-confirm-financial-gst">exc GST</span>';
    if (addIdEl) addIdEl.textContent = genId;
    // Reset toggle to exc and track color
    const gstToggleWrap = document.getElementById('jobConfirmGstToggleWrap');
    const gstExcBtn = document.getElementById('jobConfirmGstExc');
    const gstIncBtn = document.getElementById('jobConfirmGstInc');
    if (gstToggleWrap) {
      gstToggleWrap.classList.remove('job-confirm-gst-toggle-wrap--inc');
      gstToggleWrap.classList.add('job-confirm-gst-toggle-wrap--exc');
    }
    if (gstExcBtn) { gstExcBtn.classList.add('is-selected'); gstExcBtn.setAttribute('aria-pressed', 'true'); }
    if (gstIncBtn) { gstIncBtn.classList.remove('is-selected'); gstIncBtn.setAttribute('aria-pressed', 'false'); }

    resetButton();
    if (overlay) {
      overlay.dataset.jobUuid = job.uuid || '';
      const addBtnOverlay = document.getElementById('jobConfirmAddBtn');
      const createNewOverlay = document.getElementById('jobConfirmCreateNew');
      if (addBtnOverlay) {
        addBtnOverlay.disabled = false;
        addBtnOverlay.classList.remove('job-confirm-add-btn--loading', 'job-confirm-add-btn--done');
      }
      if (createNewOverlay) createNewOverlay.classList.remove('job-confirm-create-new--loading', 'job-confirm-create-new--done');
      openAccessibleModal('jobConfirmOverlay', { triggerEl: btn, initialFocusEl: addBtnOverlay || createNewOverlay });
    }
  } catch (err) {
    console.error('Add to Job lookup failed', err);
    if (feedback) {
      feedback.textContent = 'Network error. Try again.';
      feedback.classList.remove('quote-servicem8-feedback--success', 'quote-servicem8-feedback--hidden');
      feedback.classList.add('quote-servicem8-feedback--error', 'quote-servicem8-feedback--visible');
    }
    resetButton();
  }
}

/**
 * Build payload for Add to Job API from quote data (Section 50: labour from labour rows, people_count).
 * Returns { job_uuid, elements, quote_total, labour_hours, material_cost, user_name, profile, people_count } or null.
 */
function getAddToJobPayload(jobUuid) {
  if (!jobUuid) return null;
  const quoteTotalEl = document.getElementById('quoteTotalDisplay');
  const quoteTotalRaw = (quoteTotalEl?.textContent || '0').replace(/[^0-9.-]/g, '');
  const quoteTotal = parseFloat(quoteTotalRaw) || 0;

  const labourRows = getLabourRowsOrdered();
  let labourHours = 0;
  labourRows.forEach((row) => {
    const input = row.querySelector('.quote-labour-hours-input');
    labourHours += parseFloat(input?.value) || 0;
  });
  labourHours = Math.round(labourHours * 100) / 100;
  const peopleCount = labourRows.length || 1;

  let elements = [];
  let materialCost = 0;
  let profile = 'spouting';

  if (lastQuoteData?.materials?.length) {
    elements = lastQuoteData.materials.map((m) => ({ name: m.name || m.id, qty: m.qty || 0 }));
    materialCost = lastQuoteData.materials.reduce((sum, m) => sum + (m.cost_price || 0) * (m.qty || 0), 0);
    const hasStormCloud = lastQuoteData.materials.some((m) => /^(GUT-SC-|BRK-SC-)/i.test(m.id || ''));
    const hasClassic = lastQuoteData.materials.some((m) => /^(GUT-CL-|BRK-CL-)/i.test(m.id || ''));
    if (hasStormCloud) profile = 'stormcloud';
    else if (hasClassic) profile = 'classic';
  } else {
    const tableBody = document.getElementById('quoteTableBody');
    if (!tableBody) return null;
    let hasSC = false;
    let hasCL = false;
    for (const row of tableBody.rows) {
      if (row.dataset.sectionHeader || row.dataset.emptyRow === 'true' || row.dataset.labourRow === 'true') continue;
      const assetId = row.dataset.assetId;
      if (!assetId) continue;
      const product = state.products?.find((p) => p.id === assetId);
      const name = getQuoteProductDisplayName(assetId, product?.name);
      const qtyCell = row.cells[1];
      const qtyInput = qtyCell?.querySelector('.quote-line-qty-input');
      let qty = 0;
      if (qtyInput) {
        qty = parseFloat(qtyInput.value) || 0;
        setQuoteRowStoredQty(row, qty);
      } else {
        const storedQty = getQuoteRowStoredQty(row);
        if (storedQty != null) {
          qty = storedQty;
        } else {
          qty = parseFloat(getQuoteCellTextWithoutSummaries(row)) || 0;
          setQuoteRowStoredQty(row, qty);
        }
      }
      if (qty <= 0) continue;
      elements.push({ name, qty });
      const cost = parseFloat(row.dataset.costPrice) || 0;
      materialCost += cost * qty;
      if (/^(GUT-SC-|BRK-SC-)/i.test(assetId)) hasSC = true;
      if (/^(GUT-CL-|BRK-CL-)/i.test(assetId)) hasCL = true;
    }
    if (hasSC) profile = 'stormcloud';
    else if (hasCL) profile = 'classic';
  }

  if (elements.length === 0) return null;
  materialCost = Math.round(materialCost * 100) / 100;
  const userName = authState.user?.user_metadata?.full_name || authState.user?.email || authState.email || 'Quote App User';

  return {
    job_uuid: jobUuid,
    elements,
    quote_total: quoteTotal,
    labour_hours: labourHours,
    material_cost: materialCost,
    user_name: userName,
    profile,
    people_count: peopleCount,
  };
}

/**
 * JobConfirmationOverlay: onConfirm calls add-to-job API, onCreateNew, onClose.
 */
function initJobConfirmationOverlay() {
  const overlay = document.getElementById('jobConfirmOverlay');
  const closeBtn = document.getElementById('jobConfirmClose');
  const addBtn = document.getElementById('jobConfirmAddBtn');
  const createNewBtn = document.getElementById('jobConfirmCreateNew');
  const feedback = document.getElementById('servicem8Feedback');

  const hideOverlay = () => {
    closeAccessibleModal('jobConfirmOverlay');
  };

  const showFeedback = (msg, isError) => {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.classList.remove('quote-servicem8-feedback--success', 'quote-servicem8-feedback--error', 'quote-servicem8-feedback--hidden');
    feedback.classList.add(isError ? 'quote-servicem8-feedback--error' : 'quote-servicem8-feedback--success', 'quote-servicem8-feedback--visible');
  };

  const handleConfirm = async () => {
    const jobUuid = overlay?.dataset?.jobUuid;
    const payload = getAddToJobPayload(jobUuid);
    if (!payload) {
      showFeedback('No quote data to add.', true);
      return;
    }
    addBtn.disabled = true;
    addBtn.classList.add('job-confirm-add-btn--loading');
    try {
      const resp = await fetch('/api/servicem8/add-to-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (authState.token || ''),
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data.detail === 'string' ? data.detail : data.detail?.msg || 'Failed to add to job.';
        showFeedback(msg, true);
        addBtn.classList.remove('job-confirm-add-btn--loading');
        addBtn.disabled = false;
        return;
      }
      const jobUuidForAttachment = payload.job_uuid;
      const dataUrl = getExportCanvasDataURL();
      let feedbackMsg = 'Added to job successfully.';
      if (dataUrl && jobUuidForAttachment) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        try {
          const attachResp = await fetch('/api/servicem8/upload-job-attachment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (authState.token || ''),
            },
            body: JSON.stringify({ job_uuid: jobUuidForAttachment, image_base64: base64 }),
          });
          feedbackMsg = attachResp.ok ? 'Added to job successfully. Blueprint attached.' : 'Added to job successfully. Blueprint could not be attached.';
        } catch (_) {
          feedbackMsg = 'Added to job successfully. Blueprint could not be attached.';
        }
      }
      addBtn.classList.remove('job-confirm-add-btn--loading');
      addBtn.classList.add('job-confirm-add-btn--done');
      const jobNumberForSave = document.getElementById('jobConfirmAddId')?.textContent?.trim() || '';
      setTimeout(() => {
        hideOverlay();
        showFeedback(feedbackMsg, false);
        addBtn.classList.remove('job-confirm-add-btn--done');
        addBtn.disabled = false;
        if (jobNumberForSave) autoSaveDiagramWithJobNumber(jobNumberForSave);
      }, 800);
    } catch (err) {
      console.error('Add to Job failed', err);
      showFeedback('Network error. Try again.', true);
      addBtn.classList.remove('job-confirm-add-btn--loading');
      addBtn.disabled = false;
    }
  };

  const handleCreateNew = async () => {
    const originalJobUuid = overlay?.dataset?.jobUuid;
    if (!originalJobUuid) {
      showFeedback('No job selected.', true);
      return;
    }
    const payload = getAddToJobPayload(originalJobUuid);
    if (!payload) {
      showFeedback('No quote data to add.', true);
      return;
    }
    let imageBase64 = null;
    const dataUrl = getExportCanvasDataURL();
    if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
      imageBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    }
    const body = {
      original_job_uuid: originalJobUuid,
      elements: payload.elements,
      quote_total: payload.quote_total,
      labour_hours: payload.labour_hours,
      material_cost: payload.material_cost,
      user_name: payload.user_name,
      profile: payload.profile,
      people_count: payload.people_count,
      image_base64: imageBase64,
    };
    if (createNewBtn) {
      createNewBtn.disabled = true;
      createNewBtn.classList.add('job-confirm-create-new--loading');
    }
    try {
      const resp = await fetch('/api/servicem8/create-new-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (authState.token || ''),
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data.detail === 'string' ? data.detail : data.detail?.msg || 'Failed to create new job.';
        showFeedback(msg, true);
        if (createNewBtn) {
          createNewBtn.classList.remove('job-confirm-create-new--loading');
          createNewBtn.disabled = false;
        }
        return;
      }
      if (createNewBtn) {
        createNewBtn.classList.remove('job-confirm-create-new--loading');
        createNewBtn.classList.add('job-confirm-create-new--done');
      }
      const newJobNumber = data.generated_job_id || data.new_job_uuid || '';
      setTimeout(() => {
        hideOverlay();
        showFeedback('New job created. Note and blueprint added to both jobs.', false);
        if (createNewBtn) {
          createNewBtn.classList.remove('job-confirm-create-new--done');
          createNewBtn.disabled = false;
        }
        if (newJobNumber) autoSaveDiagramWithJobNumber(newJobNumber);
      }, 800);
    } catch (err) {
      console.error('Create New Job failed', err);
      showFeedback('Network error. Try again.', true);
      if (createNewBtn) {
        createNewBtn.classList.remove('job-confirm-create-new--loading');
        createNewBtn.disabled = false;
      }
    }
  };

  const gstToggleWrap = document.getElementById('jobConfirmGstToggleWrap');
  const updateGstDisplay = (showExc) => {
    if (!overlay) return;
    const currentEl = document.getElementById('jobConfirmCurrent');
    const quoteEl = document.getElementById('jobConfirmQuote');
    const newEl = document.getElementById('jobConfirmNew');
    const currentExc = parseFloat(overlay.dataset.currentExc) || 0;
    const currentInc = parseFloat(overlay.dataset.currentInc) || 0;
    const quoteExc = parseFloat(overlay.dataset.quoteExc) || 0;
    const quoteInc = parseFloat(overlay.dataset.quoteInc) || 0;
    const newExc = parseFloat(overlay.dataset.newExc) || 0;
    const newInc = parseFloat(overlay.dataset.newInc) || 0;
    if (gstToggleWrap) {
      gstToggleWrap.classList.toggle('job-confirm-gst-toggle-wrap--exc', showExc);
      gstToggleWrap.classList.toggle('job-confirm-gst-toggle-wrap--inc', !showExc);
    }
    const gstLabel = showExc ? 'exc GST' : 'inc GST';
    if (showExc) {
      if (currentEl) currentEl.innerHTML = escapeHtml(formatCurrency(currentExc)) + ' <span class="job-confirm-financial-gst">' + gstLabel + '</span>';
      if (quoteEl) quoteEl.innerHTML = '+ ' + escapeHtml(formatCurrency(quoteExc)) + ' <span class="job-confirm-financial-gst">' + gstLabel + '</span>';
      if (newEl) newEl.innerHTML = escapeHtml(formatCurrency(newExc)) + ' <span class="job-confirm-financial-gst">' + gstLabel + '</span>';
    } else {
      if (currentEl) currentEl.innerHTML = escapeHtml(formatCurrency(currentInc)) + ' <span class="job-confirm-financial-gst">' + gstLabel + '</span>';
      if (quoteEl) quoteEl.innerHTML = '+ ' + escapeHtml(formatCurrency(quoteInc)) + ' <span class="job-confirm-financial-gst">' + gstLabel + '</span>';
      if (newEl) newEl.innerHTML = escapeHtml(formatCurrency(newInc)) + ' <span class="job-confirm-financial-gst">' + gstLabel + '</span>';
    }
  };

  const gstExcBtn = document.getElementById('jobConfirmGstExc');
  const gstIncBtn = document.getElementById('jobConfirmGstInc');
  gstExcBtn?.addEventListener('click', () => {
    gstExcBtn.classList.add('is-selected');
    gstExcBtn.setAttribute('aria-pressed', 'true');
    gstIncBtn?.classList.remove('is-selected');
    gstIncBtn?.setAttribute('aria-pressed', 'false');
    updateGstDisplay(true);
  });
  gstIncBtn?.addEventListener('click', () => {
    gstIncBtn.classList.add('is-selected');
    gstIncBtn.setAttribute('aria-pressed', 'true');
    gstExcBtn?.classList.remove('is-selected');
    gstExcBtn?.setAttribute('aria-pressed', 'false');
    updateGstDisplay(false);
  });

  closeBtn?.addEventListener('click', hideOverlay);
  addBtn?.addEventListener('click', handleConfirm);
  createNewBtn?.addEventListener('click', handleCreateNew);
}

/**
 * Build elements array from current quote table rows (canvas + manually added).
 * Used for calculate-quote API so manual line items are included.
 * For gutter systems: reads length from section header input (quote-header-metres-input).
 */
function getElementsFromQuoteTable() {
  const tableBody = document.getElementById('quoteTableBody');
  if (!tableBody) return [];
  const elements = [];

  // Build profile lengths from section header rows (gutter + downpipe headers have editable length)
  const profileLengthMm = {};
  const downpipeLengthMm = {};
  const incompleteProfilesForElements = new Set();
  const incompleteDownpipeSizesForElements = new Set();
  for (const row of tableBody.rows) {
    const sectionHeader = row.dataset.sectionHeader;
    if (!sectionHeader) continue;
    const metresInput = row.cells[1]?.querySelector('.quote-header-metres-input');
    if (metresInput) {
      const metresVal = parseFloat(metresInput.value);
      if (sectionHeader.startsWith('downpipe-')) {
        const size = sectionHeader.replace(/^downpipe-/, '');
        if (Number.isFinite(metresVal) && metresVal > 0) {
          downpipeLengthMm[size] = mToMm(metresVal);
        } else {
          incompleteDownpipeSizesForElements.add(size);
        }
      } else {
        if (Number.isFinite(metresVal) && metresVal > 0) {
          profileLengthMm[sectionHeader] = mToMm(metresVal);
        } else {
          incompleteProfilesForElements.add(sectionHeader);
        }
      }
    }
  }

  // Emit gutter elements from header length (bin-pack per profile)
  Object.keys(profileLengthMm).forEach((profile) => {
    const lengthMm = profileLengthMm[profile];
    const opt = getOptimalGutterCombination(lengthMm);
    if (opt && opt.counts && Object.keys(opt.counts).length > 0) {
      let first = true;
      Object.entries(opt.counts).forEach(([lengthMmStr, n]) => {
        if (n <= 0) return;
        const item = { assetId: gutterProductIdForLength(profile, Number(lengthMmStr)), quantity: n };
        if (first) {
          item.length_mm = lengthMm;
          first = false;
        }
        elements.push(item);
      });
    }
  });

  // Emit downpipe elements from section header length (bin-pack per size)
  Object.keys(downpipeLengthMm).forEach((size) => {
    const lengthMm = downpipeLengthMm[size];
    const opt = getOptimalDownpipeCombination(lengthMm);
    if (opt && opt.counts && Object.keys(opt.counts).length > 0) {
      let first = true;
      Object.entries(opt.counts).forEach(([lengthMmStr, n]) => {
        if (n <= 0) return;
        const item = { assetId: downpipeProductIdForLength(size, Number(lengthMmStr)), quantity: n };
        if (first) {
          item.length_mm = lengthMm;
          first = false;
        }
        elements.push(item);
      });
    }
  });

  for (const row of tableBody.rows) {
    const assetId = row.dataset.assetId;
    if (!assetId) continue;
    if (row.dataset.labourRow === 'true') continue; // Section 50: labour rows are not material elements
    if (row.dataset.inferred === 'true') continue; // backend infers these from gutters/clips; avoid double-counting
    const rowGutterMatch = GUTTER_PATTERN.exec(assetId.trim());
    // Skip child gutter rows when we have header length (we emitted from header above)
    if (rowGutterMatch) {
      const profile = rowGutterMatch[1].toUpperCase();
      if (profileLengthMm[profile] != null) continue;
      if (incompleteProfilesForElements.has(profile)) continue;
    }
    // Skip child downpipe rows when we have section header length for that size (bin-packed above)
    if (isDownpipeElement(assetId)) {
      const dpSize = getDownpipeSizeFromAssetId(assetId);
      if (dpSize && downpipeLengthMm[dpSize] != null) continue;
      if (dpSize && incompleteDownpipeSizesForElements.has(dpSize)) continue;
    }
    const qtyCell = row.cells[1];
    let qty = 0;
    let lengthMm = row.dataset.lengthMm != null && row.dataset.lengthMm !== '' ? parseFloat(row.dataset.lengthMm) : undefined;
    const metresInput = qtyCell?.querySelector('.quote-qty-metres-input');
    const isManualLengthRow = row.dataset.manualLength === 'true' || metresInput != null;
    if (!isManualLengthRow) lengthMm = undefined;
    if (metresInput) {
      // Row has "Metres?" input: send with qty=1 so backend returns inferred items (we'll set their qty to empty if incomplete)
      const metresVal = parseFloat(metresInput.value);
      if (!Number.isFinite(metresVal) || metresVal <= 0) {
        // Send incomplete row with qty=1 so backend returns inferred items (we'll display them with empty qty)
        // Backend will use product standard length to calculate inferred items
        qty = 1;
        lengthMm = undefined; // No length yet - backend will use product standard length
      } else {
        lengthMm = mToMm(metresVal);
        qty = 1;
      }
    } else {
      const qtyInput = qtyCell?.querySelector('.quote-line-qty-input');
      if (qtyInput) {
        qty = parseFloat(qtyInput.value) || 0;
        setQuoteRowStoredQty(row, qty);
      } else {
        const storedQty = getQuoteRowStoredQty(row);
        if (storedQty != null) {
          qty = storedQty;
        } else {
          qty = parseFloat(getQuoteCellTextWithoutSummaries(row)) || 0;
          setQuoteRowStoredQty(row, qty);
        }
      }
    }
    // Always send incomplete rows (qty=1, no length_mm) so backend returns inferred items
    // Skip only if both qty is 0 AND no length (truly empty row)
    if (qty <= 0 && !lengthMm && !metresInput) continue;

    // Gutter with length: expand into one element per length type (bin-packing) so backend returns one row per length.
    // Send length_mm on the first bin-packed element so bracket/screw count uses manual length, not bin-packed stock length.
    if (rowGutterMatch && isManualLengthRow && lengthMm != null && lengthMm > 0) {
      const profile = rowGutterMatch[1].toUpperCase();
      const opt = getOptimalGutterCombination(lengthMm);
      if (opt && opt.counts && Object.keys(opt.counts).length > 0) {
        let first = true;
        Object.entries(opt.counts).forEach(([lengthMmStr, n]) => {
          if (n <= 0) return;
          const item = { assetId: gutterProductIdForLength(profile, Number(lengthMmStr)), quantity: n };
          if (first) {
            item.length_mm = lengthMm;
            first = false;
          }
          elements.push(item);
        });
        continue;
      }
    }

    // Downpipe with length: bin-pack into 1.5m and 3m stock lengths.
    if (isDownpipeElement(assetId) && isManualLengthRow && lengthMm != null && lengthMm > 0) {
      const size = getDownpipeSizeFromAssetId(assetId);
      if (size) {
        const opt = getOptimalDownpipeCombination(lengthMm);
        if (opt && opt.counts && Object.keys(opt.counts).length > 0) {
          let first = true;
          Object.entries(opt.counts).forEach(([lengthMmStr, n]) => {
            if (n <= 0) return;
            const item = { assetId: downpipeProductIdForLength(size, Number(lengthMmStr)), quantity: n };
            if (first) {
              item.length_mm = lengthMm;
              first = false;
            }
            elements.push(item);
          });
          continue;
        }
      }
    }

    if (qty <= 0) qty = 1;
    const item = { assetId, quantity: qty };
    if (isManualLengthRow && lengthMm != null && Number.isFinite(lengthMm) && lengthMm > 0) item.length_mm = lengthMm;
    elements.push(item);
  }
  return elements;
}

function formatCurrency(amount) {
  return '$' + Number(amount).toFixed(2);
}

/**
 * Open a print window with the current quote modal content formatted as HTML.
 * Opens a new window, writes the quote table and totals, then triggers the browser print dialog.
 */
function printQuote() {
  const tableBody = document.getElementById('quoteTableBody');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');

  const escapeHtml = (s) => {
    if (s == null || s === '') return '';
    const t = String(s);
    return t
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  let rowsHtml = '';
  if (tableBody && tableBody.rows.length) {
    for (const row of tableBody.rows) {
      if (row.dataset.sectionHeader) {
        const label = row.cells[0]?.textContent ?? '';
        const total = row.cells[5]?.textContent ?? '';
        rowsHtml += `<tr><td colspan="5"><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(total)}</td></tr>`;
        continue;
      }
      if (row.dataset.emptyRow === 'true') continue;
      const productCell = row.cells[0];
      const rawProduct = getQuoteLineProductName(row);
      const product = row.dataset.labourRow === 'true' ? 'Labour' : (rawProduct || (productCell?.textContent ?? ''));
      const qtyCell = row.cells[1];
      const metresInput = qtyCell?.querySelector('.quote-qty-metres-input');
      const qtyLineInput = qtyCell?.querySelector('.quote-line-qty-input');
      const hoursInput = qtyCell?.querySelector('.quote-labour-hours-input');
      let qty = '';
      if (hoursInput) qty = hoursInput.value ?? '';
      else if (metresInput) qty = metresInput.value.trim() || 'Metres?';
      else if (qtyLineInput) qty = qtyLineInput.value;
      else qty = qtyCell?.textContent ?? '';
      const labourUnitPriceInput = row.cells[4]?.querySelector('.quote-labour-unit-price-input');
      const unitPrice = labourUnitPriceInput ? (Number(labourUnitPriceInput.value) ? '$' + Number(labourUnitPriceInput.value).toFixed(2) : '—') : (row.cells[4]?.textContent ?? '—');
      const totalCell = row.cells[5];
      const totalVal = totalCell?.querySelector('.quote-cell-total-value');
      const total = (totalVal ? totalVal.textContent : totalCell?.textContent) ?? '—';
      rowsHtml += `<tr><td>${escapeHtml(product)}</td><td>${escapeHtml(qty)}</td><td></td><td></td><td>${escapeHtml(unitPrice)}</td><td>${escapeHtml(total)}</td></tr>`;
    }
  }
  const labourRows = getLabourRowsOrdered();
  let totalHours = 0;
  let rateLabel = '';
  labourRows.forEach((row) => {
    const input = row.querySelector('.quote-labour-hours-input');
    totalHours += parseFloat(input?.value) || 0;
    const unitPriceInput = row.querySelector('.quote-labour-unit-price-input');
    if (unitPriceInput && rateLabel === '') {
      const up = parseFloat(unitPriceInput.value);
      rateLabel = Number.isFinite(up) ? `$${up.toFixed(2)}/hr` : '';
    }
  });
  const hours = String(totalHours);
  const materialsSub = materialsTotalDisplay?.textContent ?? '0.00';
  const labourSub = labourTotalDisplay?.textContent ?? '0.00';
  const total = quoteTotalDisplay?.textContent ?? '0.00';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quote</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; font-size: 12px; }
    h1 { font-size: 18px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; }
    .totals { margin-top: 12px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .final { font-weight: bold; font-size: 14px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; }
  </style>
</head>
<body>
  <h1>Quote</h1>
  <table>
    <thead>
      <tr><th>Product</th><th>Qty</th><th></th><th></th><th>Unit Price</th><th>Total</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div>Materials subtotal: ${escapeHtml(materialsSub)}</div>
    <div>Labour (${escapeHtml(hours)} hrs × ${escapeHtml(rateLabel)}): ${escapeHtml(labourSub)}</div>
    <div class="final">Total: ${escapeHtml(total)}</div>
  </div>
</body>
</html>`;

  const printWin = window.open('', '_blank');
  if (!printWin) {
    showMessage('Popup blocked. Allow popups to print the quote.');
    return;
  }
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
    printWin.onafterprint = () => printWin.close();
  }, 100);
}

/**
 * Format current quote modal content as plain text and copy to clipboard.
 * Sections: MATERIALS (line items), Materials Subtotal, LABOUR (hours × rate), TOTAL.
 * Shows "Quote copied to clipboard" on success.
 */
function copyQuoteToClipboard() {
  const tableBody = document.getElementById('quoteTableBody');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');

  const lines = [];
  lines.push('MATERIALS');
  if (tableBody && tableBody.rows.length) {
    for (const row of tableBody.rows) {
      if (row.dataset.sectionHeader || row.dataset.emptyRow === 'true' || row.dataset.labourRow === 'true') continue;
      if (!row.dataset.assetId) continue;
      const product = getQuoteLineProductName(row);
      const qtyCell = row.cells[1];
      const metresInput = qtyCell?.querySelector('.quote-qty-metres-input');
      const qtyLineInput = qtyCell?.querySelector('.quote-line-qty-input');
      let qty = '';
      if (metresInput) qty = metresInput.value.trim() || 'Metres?';
      else if (qtyLineInput) qty = qtyLineInput.value;
      else qty = qtyCell?.textContent ?? '';
      const unitPrice = row.cells[4]?.textContent ?? '—';
      const totalCell = row.cells[5];
      const totalVal = totalCell?.querySelector('.quote-cell-total-value');
      const total = (totalVal ? totalVal.textContent : totalCell?.textContent) ?? '—';
      lines.push(`${product}\t${qty}\t${unitPrice}\t${total}`);
    }
  }
  lines.push('');
  lines.push('Materials Subtotal\t' + (materialsTotalDisplay?.textContent ?? '0.00'));
  lines.push('');
  lines.push('LABOUR');
  const labourRows = getLabourRowsOrdered();
  let totalHours = 0;
  labourRows.forEach((row) => {
    const input = row.querySelector('.quote-labour-hours-input');
    totalHours += parseFloat(input?.value) || 0;
  });
  const firstUnitPriceInput = labourRows[0]?.querySelector('.quote-labour-unit-price-input');
  const up = firstUnitPriceInput ? parseFloat(firstUnitPriceInput.value) : NaN;
  const rateLabel = Number.isFinite(up) ? ' × $' + up.toFixed(2) + '/hr' : '';
  lines.push(`${totalHours} hours${rateLabel}`);
  lines.push('Labour Subtotal\t' + (labourTotalDisplay?.textContent ?? '0.00'));
  lines.push('');
  lines.push('TOTAL\t' + (quoteTotalDisplay?.textContent ?? '0.00'));

  const text = lines.join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showMessage('Quote copied to clipboard.', 'success');
    }).catch((err) => {
      console.error('Clipboard write failed', err);
      showMessage('Could not copy to clipboard.');
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showMessage('Quote copied to clipboard.', 'success');
    } catch (e) {
      showMessage('Could not copy to clipboard.');
    }
    document.body.removeChild(ta);
  }
}

async function calculateAndDisplayQuote() {
  const tableBody = document.getElementById('quoteTableBody');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');
  const quoteError = document.getElementById('quoteError');

  const hideError = () => {
    if (quoteError) {
      quoteError.setAttribute('hidden', '');
      quoteError.textContent = '';
    }
  };

  const showError = (msg) => {
    if (quoteError) {
      quoteError.textContent = msg;
      quoteError.removeAttribute('hidden');
    }
  };

  hideError();

  // Check for incomplete rows BEFORE making API call so we know whether to show inferred items with empty qty
  // Incomplete = has "Metres?" input OR has incompleteMeasurement attribute
  const hasIncompleteGutter = tableBody?.querySelector('tr[data-asset-id^="GUT-"]') != null &&
    Array.from(tableBody.querySelectorAll('tr[data-asset-id^="GUT-"]')).some((row) =>
      row.dataset.incompleteMeasurement === 'true' || row.querySelector('.quote-qty-metres-input') != null
    );
  const hasIncompleteDownpipe = tableBody?.querySelector('tr[data-asset-id^="DP-"]') != null &&
    Array.from(tableBody.querySelectorAll('tr[data-asset-id^="DP-"]')).some((row) =>
      row.dataset.incompleteMeasurement === 'true' || row.querySelector('.quote-qty-metres-input') != null
    );
  const hasIncompleteMeasurable = hasIncompleteGutter || hasIncompleteDownpipe;

  const elements = getElementsFromQuoteTable();
  const labourRows = getLabourRowsOrdered();
  const labour_elements = labourRows.map((row) => {
    const hoursInput = row.querySelector('.quote-labour-hours-input');
    const hours = parseFloat(hoursInput?.value) || 0;
    return { assetId: 'REP-LAB', quantity: hours };
  }).filter((e) => e.quantity > 0);
  const hasMaterials = elements.length > 0;
  const hasLabour = labour_elements.length > 0;
  if (!hasMaterials && !hasLabour) {
    showError('No items in quote. Add products from the canvas, use Add item, or add labour hours.');
    return;
  }

  try {
    const res = await fetch('/api/calculate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements, labour_elements }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      let msgText = 'Failed to calculate quote.';
      if (data.detail !== undefined) {
        if (typeof data.detail === 'string') msgText = data.detail;
        else if (Array.isArray(data.detail)) msgText = data.detail.map((d) => d.msg || d.loc?.join('.') || '').filter(Boolean).join('; ') || msgText;
        else if (data.detail && (data.detail.msg || data.detail.message)) msgText = data.detail.msg || data.detail.message;
      } else if (res.statusText) msgText = res.statusText;
      showError(msgText);
      return;
    }

    const quote = data.quote;
    if (!quote) {
      showError('Invalid response from server.');
      return;
    }
    lastQuoteData = quote;

    // Process materials (may be empty when quote is labour-only)
    const materialsToProcess = quote.materials || [];

    // Collect all product IDs returned from backend to identify which incomplete rows should be removed
    const returnedProductIds = new Set(materialsToProcess.map(line => line.id));

    // --- Scenario detection from materials (for downpipe-only vs mixed vs gutter-only) ---
    const u = (id) => String(id || '').toUpperCase();
    let hasGutterOrBracket = false;
    let hasDownpipeOrClip = false;
    let hasScrews = false;
    materialsToProcess.forEach((line) => {
      const id = u(line.id);
      if (GUTTER_PATTERN.test(line.id) || id.startsWith('BRK-')) hasGutterOrBracket = true;
      if (id.startsWith('DP-') || id.startsWith('SCL-') || id.startsWith('ACL-')) hasDownpipeOrClip = true;
      if (id === 'SCR-SS') hasScrews = true;
    });
    const isDownpipeOnly = hasDownpipeOrClip && !hasGutterOrBracket;
    const isMixed = hasGutterOrBracket && (hasDownpipeOrClip || hasScrews);

    // --- System-based grouping: group gutter system items by profile ---
    const gutterGroups = {}; // profile -> { totalMetres, children: line[] }
    const downpipeGroups = {}; // size '65'|'80' -> { totalMetres, children: line[] } (DP-*, SCL-*, ACL-*)
    const ungrouped = [];
    const standaloneScrews = []; // SCR-SS for downpipe-only (under Downpipe header) or mixed (row "Screws (brackets & clips)")
    const isGutterSystemItem = (id) => {
      const x = u(id);
      return GUTTER_PATTERN.test(id) || x.startsWith('BRK-') || x === 'SCR-SS';
    };
    const getDownpipeSizeFromLine = (id) => {
      if (!id) return null;
      const x = u(id);
      if (x.startsWith('DP-')) return getDownpipeSizeFromAssetId(id);
      const clipMatch = /^(?:SCL|ACL)-(\d+)/i.exec(String(id).trim());
      return clipMatch ? clipMatch[1] : null;
    };

    materialsToProcess.forEach((line) => {
      if (!isGutterSystemItem(line.id)) {
        const dpSize = getDownpipeSizeFromLine(line.id);
        if (dpSize && (u(line.id).startsWith('DP-') || u(line.id).startsWith('SCL-') || u(line.id).startsWith('ACL-'))) {
          if (!downpipeGroups[dpSize]) downpipeGroups[dpSize] = { totalMetres: 0, children: [] };
          if (DOWNPIPE_PATTERN.test(line.id)) {
            downpipeGroups[dpSize].totalMetres += getDownpipeLengthMetres(line.id) * line.qty;
          }
          downpipeGroups[dpSize].children.push(line);
          return;
        }
        ungrouped.push(line);
        return;
      }
      if (u(line.id) === 'SCR-SS') {
        // Screws: gutter-only → under gutter header; downpipe-only or mixed → standalone (Downpipe header or "(brackets & clips)")
        if (isMixed || !hasGutterOrBracket) {
          standaloneScrews.push(line);
          return;
        }
        // Gutter-only: add to first profile (existing behaviour)
      }
      let profile = getProfileFromAssetId(line.id);
      if (!profile) {
        if (u(line.id) === 'SCR-SS') {
          profile = Object.keys(gutterGroups)[0] || 'SC';
        } else {
          ungrouped.push(line);
          return;
        }
      }
      if (!gutterGroups[profile]) gutterGroups[profile] = { totalMetres: 0, children: [] };
      if (GUTTER_PATTERN.test(line.id)) {
        gutterGroups[profile].totalMetres += getGutterLengthMetres(line.id) * line.qty;
      }
      gutterGroups[profile].children.push(line);
    });

    // Sort children: gutters longest first, brackets, screws
    Object.keys(gutterGroups).forEach((profile) => {
      gutterGroups[profile].children.sort((a, b) => {
        const sa = getChildSortOrder(a.id);
        const sb = getChildSortOrder(b.id);
        if (sa.group !== sb.group) return sa.group - sb.group;
        return sa.length - sb.length;
      });
    });

    // Sort downpipe section children: downpipes longest first, then clips
    Object.keys(downpipeGroups).forEach((size) => {
      downpipeGroups[size].children.sort((a, b) => {
        const sa = getDownpipeChildSortOrder(a.id);
        const sb = getDownpipeChildSortOrder(b.id);
        if (sa.group !== sb.group) return sa.group - sb.group;
        return sa.length - sb.length;
      });
    });

    const emptyRow = tableBody?.querySelector('tr[data-empty-row="true"]');

    /** Render a single material row (child item) with qty input, indentation, etc. options.productLabel overrides product name in first column. options.sectionFor marks which section header this row belongs to (for empty-header removal). */
    function renderMaterialRow(line, insertBefore, options = {}) {
      const row = document.createElement('tr');
      row.dataset.assetId = line.id;
      if (options.sectionFor != null) row.dataset.sectionFor = String(options.sectionFor);
      const isGutterOrDownpipe = GUTTER_PATTERN.test(line.id) || (line.id && u(line.id).startsWith('DP-'));
      const isGutter = GUTTER_PATTERN.test(line.id);
      const isDownpipe = DOWNPIPE_PATTERN.test(line.id);
      // For gutter rows: if profile has header length override, ignore manualOverrides (bin-packing recalculated quantities)
      const gutterProfile = isGutter ? getProfileFromAssetId(line.id) : null;
      const hasHeaderLengthOverride = gutterProfile && profileLengthOverride[gutterProfile] != null;
      const shouldIgnoreGutterOverride = isGutter && hasHeaderLengthOverride;
      // For downpipe rows: if section has header length override, use backend qty (bin-packed)
      const dpSize = isDownpipe ? getDownpipeSizeFromAssetId(line.id) : null;
      const hasDownpipeHeaderOverride = dpSize && downpipeLengthOverride[dpSize] != null;
      const shouldIgnoreDownpipeOverride = isDownpipe && hasDownpipeHeaderOverride;
      const hasManualOverride = !shouldIgnoreGutterOverride && !shouldIgnoreDownpipeOverride && manualOverrides[line.id] != null;
      if (!isGutterOrDownpipe && !hasManualOverride) row.dataset.inferred = 'true';
      const isInferredItem = u(line.id).startsWith('BRK-') || line.id === 'SCR-SS' || u(line.id).startsWith('SCL-') || u(line.id).startsWith('ACL-');
      const overrideQty = (shouldIgnoreGutterOverride || shouldIgnoreDownpipeOverride) ? null : manualOverrides[line.id];
      const qtyDisplay = overrideQty != null ? String(overrideQty) : ((isInferredItem && hasIncompleteMeasurable) ? '' : String(line.qty));
      let nameClass = '';
      if (u(line.id).startsWith('SCR-')) nameClass = 'quote-product-indent-level-2';
      else if (u(line.id).startsWith('BRK-') || u(line.id).startsWith('SCL-') || u(line.id).startsWith('ACL-')) nameClass = 'quote-product-indent-level-1';
      const nameContent = options.productLabel != null ? escapeHtml(String(options.productLabel)) : escapeHtml(line.name || line.id);
      row.innerHTML = `<td><span class="${nameClass}">${nameContent}</span></td><td><input type="number" class="quote-line-qty-input" value="${escapeHtml(qtyDisplay)}" min="0" step="1" aria-label="Quantity"></td><td>—</td><td>—</td><td>—</td><td class="quote-cell-total">—</td>`;
      if (insertBefore) tableBody.insertBefore(row, insertBefore);
      else tableBody.appendChild(row);
      setQuoteRowStoredQty(row, parseFloat(qtyDisplay));
      row.dataset.costPrice = String(line.cost_price);
      row.dataset.markupPct = String(line.markup_percentage);
      row.cells[2].textContent = formatCurrency(line.cost_price);
      // Markup column: inline editable input (Section 40.2)
      const markupInput = document.createElement('input');
      markupInput.type = 'number';
      markupInput.className = 'quote-input-markup-inline';
      markupInput.min = '0';
      markupInput.max = '1000';
      markupInput.step = '0.01';
      markupInput.value = String(line.markup_percentage);
      markupInput.setAttribute('aria-label', 'Markup percentage');
      markupInput.addEventListener('change', () => {
        const cost = parseFloat(row.dataset.costPrice) || 0;
        let markup = parseFloat(markupInput.value);
        if (!Number.isFinite(markup) || markup < 0 || markup > 1000) markup = 0;
        markupInput.value = String(markup);
        row.dataset.markupPct = String(markup);
        const qty = parseFloat(row.querySelector('.quote-line-qty-input')?.value) || 0;
        const unitPrice = Math.round(cost * (1 + markup / 100) * 100) / 100;
        const lineTotal = Math.round(unitPrice * qty * 100) / 100;
        row.cells[4].textContent = formatCurrency(unitPrice);
        const totalVal = row.cells[5].querySelector('.quote-cell-total-value');
        if (totalVal) totalVal.textContent = formatCurrency(lineTotal);
        else row.cells[5].textContent = formatCurrency(lineTotal);
        recalcQuoteTotalsFromTableBody();
      });
      row.cells[3].textContent = '';
      row.cells[3].appendChild(markupInput);
      const markupPctSuffix = document.createElement('span');
      markupPctSuffix.className = 'quote-markup-percent-suffix';
      markupPctSuffix.setAttribute('aria-hidden', 'true');
      markupPctSuffix.textContent = '%';
      row.cells[3].appendChild(markupPctSuffix);
      row.cells[4].textContent = formatCurrency(line.sell_price);
      // Total cell: value + remove X on hover (Section 40.3); JS hover class for reliable show/hide
      row.cells[5].className = 'quote-cell-total';
      row.cells[5].innerHTML = `<span class="quote-cell-total-value">${formatCurrency(line.line_total)}</span><span class="quote-row-remove-x" role="button" tabindex="0" aria-label="Remove line">×</span>`;
      row.addEventListener('mouseenter', () => row.classList.add('quote-row-hovered'));
      row.addEventListener('mouseleave', () => row.classList.remove('quote-row-hovered'));
      const qtyInput = row.querySelector('.quote-line-qty-input');
      if (qtyInput) {
        qtyInput.addEventListener('change', () => {
          setQuoteRowStoredQty(row, parseFloat(qtyInput.value) || 0);
          if (row.dataset.inferred === 'true') {
            delete row.dataset.inferred;
            row.removeAttribute('data-inferred');
          }
          calculateAndDisplayQuote();
        });
      }
      return row;
    }

    // Track incomplete profiles before clearing: profiles with empty/invalid header inputs or incomplete measurement rows
    const incompleteProfiles = new Set();
    const incompleteDownpipeSizes = new Set();
    Array.from(tableBody?.rows || []).forEach((r) => {
      if (r.dataset.sectionHeader) {
        // Check section header for empty/invalid input
        const metresInput = r.querySelector('.quote-header-metres-input');
        if (metresInput) {
          const v = parseFloat(metresInput.value);
          const sh = r.dataset.sectionHeader;
          if (sh && sh.startsWith('downpipe-')) {
            const size = sh.replace(/^downpipe-/, '');
            if (!Number.isFinite(v) || v <= 0) incompleteDownpipeSizes.add(size);
          } else if (!Number.isFinite(v) || v <= 0) {
            incompleteProfiles.add(sh);
          }
        }
      }
      // Check for incomplete measurement rows (gutters/downpipes with missing length)
      if (r.dataset.incompleteMeasurement === 'true' || r.querySelector('.quote-qty-metres-input') != null) {
        const assetId = r.dataset.assetId;
        if (assetId) {
          const profile = getProfileFromAssetId(assetId);
          if (profile) {
            incompleteProfiles.add(profile);
          }
          const dpSize = getDownpipeSizeFromAssetId(assetId) || (/(?:SCL|ACL)-(\d+)/i.exec(assetId)?.[1]);
          if (dpSize) incompleteDownpipeSizes.add(dpSize);
        }
      }
    });

    // Preserve manual overrides (user edited inferred item) and header lengths before clearing
    // Also preserve which section headers existed so we still show them when only one is filled (better UX: one entry triggers that section's populate)
    const manualOverrides = {};
    const profileLengthOverride = {};
    const downpipeLengthOverride = {};
    const preservedGutterProfiles = new Set();
    const preservedDownpipeSizes = new Set();
    Array.from(tableBody?.rows || []).forEach((r) => {
      if (r.dataset.sectionHeader) {
        const sh = r.dataset.sectionHeader;
        if (sh && sh.startsWith('downpipe-')) {
          preservedDownpipeSizes.add(sh.replace(/^downpipe-/, ''));
        } else if (sh && (sh === 'SC' || sh === 'CL')) {
          preservedGutterProfiles.add(sh);
        }
        const metresInput = r.querySelector('.quote-header-metres-input');
        if (metresInput) {
          const v = parseFloat(metresInput.value);
          if (sh && sh.startsWith('downpipe-')) {
            const size = sh.replace(/^downpipe-/, '');
            if (Number.isFinite(v) && v > 0) downpipeLengthOverride[size] = v;
          } else if (Number.isFinite(v) && v > 0) {
            profileLengthOverride[sh] = v;
          }
        }
      }
      if (r.dataset.assetId) {
        const qtyInput = r.querySelector('.quote-line-qty-input');
        if (qtyInput) {
          const v = parseFloat(qtyInput.value);
          if (Number.isFinite(v)) manualOverrides[r.dataset.assetId] = v;
        } else {
          // Mobile stepper rows have no qty input; preserve stored qty so rebuild doesn't snap back (including inferred rows e.g. Bracket, Screws)
          const storedQty = getQuoteRowStoredQty(r);
          if (storedQty != null && Number.isFinite(storedQty)) manualOverrides[r.dataset.assetId] = storedQty;
        }
      }
    });

    // Clear table (preserve empty row and labour rows – Section 50), rebuild with system-based structure
    const emptyRowRef = tableBody?.querySelector('tr[data-empty-row="true"]');
    const labourRows = getLabourRowsOrdered();
    const rowsToRemove = Array.from(tableBody?.rows || []).filter((r) => !r.dataset.emptyRow && !r.dataset.labourRow);
    rowsToRemove.forEach((r) => r.remove());
    const materialInsertBefore = labourRows.length ? labourRows[0] : emptyRowRef;

    // Render gutter length groups: header + children. Show header for every profile that has a group OR was preserved (so one filled header can auto-populate without requiring the other)
    const profileOrder = ['SC', 'CL'];
    const groupHasGutterOrBracket = (group) => group && group.children.some((c) => GUTTER_PATTERN.test(c.id) || u(c.id).startsWith('BRK-'));
    profileOrder.forEach((profile) => {
      const group = gutterGroups[profile];
      const hasGroup = group && group.children.length > 0;
      const showHeader = hasGroup && groupHasGutterOrBracket(group) || preservedGutterProfiles.has(profile);
      if (!showHeader) return;
      const effectiveGroup = group || { totalMetres: 0, children: [] };
      if (hasGroup && !groupHasGutterOrBracket(group)) return; // Do not show header when only screws in group (and we have materials)
      const isIncomplete = incompleteProfiles.has(profile);
      const headerTotal = effectiveGroup.children.reduce((sum, c) => sum + (c.line_total || 0), 0);
      const profileName = PROFILE_DISPLAY_NAMES[profile] || profile;
      
      // If incomplete, force empty value; otherwise use override or group total
      let metresDisplay = '';
      let inputValue = '';
      if (isIncomplete) {
        metresDisplay = 'Metres?';
        inputValue = '';
      } else {
        const totalMetres = profileLengthOverride[profile] != null ? profileLengthOverride[profile] : effectiveGroup.totalMetres;
        metresDisplay = totalMetres % 1 === 0 ? totalMetres : totalMetres.toFixed(3).replace(/\.?0+$/, '');
        inputValue = String(metresDisplay);
      }
      
      const headerRow = document.createElement('tr');
      headerRow.className = 'quote-section-header';
      if (isIncomplete) {
        headerRow.classList.add('quote-row-incomplete-measurement');
      }
      if (inputValue !== '' && !isIncomplete) {
        headerRow.classList.add('quote-section-header--has-metres');
      }
      headerRow.dataset.sectionHeader = profile;
      headerRow.innerHTML = `<td>Gutter Length: ${escapeHtml(profileName)} (<span class="quote-header-metres-label">${escapeHtml(String(metresDisplay))}</span>${isIncomplete ? '' : ' m'})</td><td><span class="quote-header-metres-wrap"><input type="number" class="quote-header-metres-input" value="${escapeHtml(inputValue)}" min="0" step="0.5" placeholder="${isIncomplete ? 'Metres?' : ''}" aria-label="Length in metres"><span class="quote-header-metres-suffix"> m</span></span></td><td></td><td></td><td></td><td></td>`;
      if (materialInsertBefore) tableBody.insertBefore(headerRow, materialInsertBefore);
      else tableBody.appendChild(headerRow);
      const headerMetresInput = headerRow.querySelector('.quote-header-metres-input');
      if (headerMetresInput) {
        headerMetresInput.addEventListener('change', () => calculateAndDisplayQuote());
        headerMetresInput.addEventListener('blur', () => calculateAndDisplayQuote());
      }
      // When profile is incomplete, skip child gutter rows (they're default/placeholder values from backend)
      // Only render brackets/screws if they exist, but gutters should be empty until header length is entered
      effectiveGroup.children.forEach((line) => {
        const isGutter = GUTTER_PATTERN.test(line.id);
        // Skip gutter rows when profile is incomplete - they'll be bin-packed when header length is entered
        if (isGutter && isIncomplete) {
          return;
        }
        renderMaterialRow(line, materialInsertBefore, { sectionFor: profile });
      });
    });

    // Mixed repair: screws as standalone row with product column "Screws (brackets & clips)"
    if (isMixed && standaloneScrews.length > 0) {
      standaloneScrews.forEach((line) => {
        renderMaterialRow(line, materialInsertBefore, { productLabel: 'Screws (brackets & clips)' });
      });
    }

    // Downpipe section: per-size header with metres input. Show header for every size that has a group OR was preserved (one filled header auto-populates that section)
    const downpipeSizeOrder = ['65', '80'];
    downpipeSizeOrder.forEach((size) => {
      const group = downpipeGroups[size];
      const hasGroup = group && group.children.length > 0;
      const showHeader = hasGroup || preservedDownpipeSizes.has(size);
      if (!showHeader) return;
      const effectiveGroup = group || { totalMetres: 0, children: [] };
      const isIncomplete = incompleteDownpipeSizes.has(size);
      const headerTotal = effectiveGroup.children.reduce((sum, c) => sum + (c.line_total || 0), 0);
      const sizeLabel = size + 'mm';
      let metresDisplay = '';
      let inputValue = '';
      if (isIncomplete) {
        metresDisplay = 'Metres?';
        inputValue = '';
      } else {
        const totalMetres = downpipeLengthOverride[size] != null ? downpipeLengthOverride[size] : effectiveGroup.totalMetres;
        metresDisplay = totalMetres % 1 === 0 ? totalMetres : totalMetres.toFixed(3).replace(/\.?0+$/, '');
        inputValue = String(metresDisplay);
      }
      const sectionHeaderId = 'downpipe-' + size;
      const headerRow = document.createElement('tr');
      headerRow.className = 'quote-section-header';
      if (isIncomplete) {
        headerRow.classList.add('quote-row-incomplete-measurement');
      }
      if (inputValue !== '' && !isIncomplete) {
        headerRow.classList.add('quote-section-header--has-metres');
      }
      headerRow.dataset.sectionHeader = sectionHeaderId;
      headerRow.innerHTML = `<td>Downpipe ${escapeHtml(sizeLabel)} Length (<span class="quote-header-metres-label">${escapeHtml(String(metresDisplay))}</span>${isIncomplete ? '' : ' m'})</td><td><span class="quote-header-metres-wrap"><input type="number" class="quote-header-metres-input" value="${escapeHtml(inputValue)}" min="0" step="0.5" placeholder="${isIncomplete ? 'Metres?' : ''}" aria-label="Length in metres"><span class="quote-header-metres-suffix"> m</span></span></td><td></td><td></td><td></td><td></td>`;
      if (materialInsertBefore) tableBody.insertBefore(headerRow, materialInsertBefore);
      else tableBody.appendChild(headerRow);
      const headerMetresInput = headerRow.querySelector('.quote-header-metres-input');
      if (headerMetresInput) {
        headerMetresInput.addEventListener('change', () => calculateAndDisplayQuote());
        headerMetresInput.addEventListener('blur', () => calculateAndDisplayQuote());
      }
      // Children: downpipes first (skip when incomplete, like gutter), then clips; screws rendered after all sizes when downpipe-only
      effectiveGroup.children.forEach((line) => {
        const isDownpipe = DOWNPIPE_PATTERN.test(line.id);
        if (isDownpipe && isIncomplete) return;
        renderMaterialRow(line, materialInsertBefore, { sectionFor: sectionHeaderId });
      });
    });
    // Downpipe-only: screws nested under Downpipe section (after downpipes and clips); no sectionFor so they don't block header removal
    if (isDownpipeOnly && standaloneScrews.length > 0) {
      standaloneScrews.forEach((line) => {
        renderMaterialRow(line, materialInsertBefore);
      });
    }

    // Render ungrouped items (droppers, etc.)
    ungrouped.forEach((line) => {
      renderMaterialRow(line, materialInsertBefore);
    });

    ensureLabourRowsExist();

    // Remove incomplete placeholder rows that were replaced by actual product rows
    // This happens when bin-packing splits one incomplete gutter into multiple actual gutter products
    if (tableBody) {
      const incompleteRows = Array.from(tableBody.querySelectorAll('tr[data-incomplete-measurement="true"]'));
      incompleteRows.forEach((incompleteRow) => {
        const incompleteAssetId = incompleteRow.dataset.assetId;
        // If this incomplete row's product ID is not in the returned products, it was replaced by bin-packing
        // Also check if it's a gutter/downpipe that should have been expanded
        const isGutterOrDownpipe = incompleteAssetId && (
          GUTTER_PATTERN.test(incompleteAssetId) || 
          String(incompleteAssetId).toUpperCase().startsWith('DP-')
        );
        if (isGutterOrDownpipe && !returnedProductIds.has(incompleteAssetId)) {
          // This incomplete row was replaced by bin-packed products - remove it
          incompleteRow.remove();
        }
      });
    }

    if (materialsTotalDisplay) materialsTotalDisplay.textContent = formatCurrency(quote.materials_subtotal);
    recalcQuoteTotalsFromTableBody();
  } catch (err) {
    console.error('Quote calculation failed', err);
    showError(err.message || 'Failed to calculate quote. Please try again.');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initColorPalette() {
  const palette = document.getElementById('colorPalettePopover');
  if (!palette) return;
  palette.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    const el = state.elements.find((x) => x.id === state.selectedId);
    if (!el) return;
    
    // Diagnostic logging: capture state before color change
    const DEBUG_COLOR_CHANGES = window.__quoteAppDebugColorChanges || false;
    if (DEBUG_COLOR_CHANGES) {
      const beforeState = {
        blueprintTransform: state.blueprintTransform ? { ...state.blueprintTransform } : null,
        hasBlueprintImage: !!state.blueprintImage,
        layerOrder: window.__quoteAppGetLayerOrder ? window.__quoteAppGetLayerOrder() : null,
        elementColorInfo: window.__quoteAppGetElementColorInfo ? window.__quoteAppGetElementColorInfo(el.id) : null,
        imageInstances: window.__quoteAppDumpImageInstances ? window.__quoteAppDumpImageInstances(el.id) : null,
      };
      console.log('[initColorPalette] BEFORE color change', beforeState);
    }
    
    const color = btn.dataset.color || null;
    const oldColor = el.color;
    
    // Safeguard: ensure blueprintTransform is not mutated during color change
    const blueprintTransformBefore = state.blueprintTransform ? { ...state.blueprintTransform } : null;
    const blueprintImageBefore = state.blueprintImage;
    
    el.color = color || null;
    // Invalidate tintedCanvas cache so it regenerates with new color
    el.tintedCanvas = null;
    el.tintedCanvasColor = null;
    el.tintedCanvasWidth = null;
    el.tintedCanvasHeight = null;
    el._tintedCanvasFailureKey = undefined; // allow retry for new color/size
    
    // Diagnostic logging: capture state after color change
    if (DEBUG_COLOR_CHANGES) {
      const afterState = {
        blueprintTransform: state.blueprintTransform ? { ...state.blueprintTransform } : null,
        hasBlueprintImage: !!state.blueprintImage,
        layerOrder: window.__quoteAppGetLayerOrder ? window.__quoteAppGetLayerOrder() : null,
        elementColorInfo: window.__quoteAppGetElementColorInfo ? window.__quoteAppGetElementColorInfo(el.id) : null,
        oldColor,
        newColor: color,
      };
      console.log('[initColorPalette] AFTER color change', afterState);
      
      // Check if blueprint disappeared
      if (beforeState.hasBlueprintImage && !afterState.hasBlueprintImage) {
        console.error('[initColorPalette] CRITICAL: Blueprint image disappeared after color change!', { beforeState, afterState });
      }
      if (beforeState.blueprintTransform && !afterState.blueprintTransform) {
        console.error('[initColorPalette] CRITICAL: Blueprint transform disappeared after color change!', { beforeState, afterState });
      }
    }
    
    // Verify blueprintTransform was not mutated
    if (blueprintTransformBefore && state.blueprintTransform) {
      const keys = ['x', 'y', 'w', 'h', 'rotation', 'zIndex'];
      const mutated = keys.some(k => blueprintTransformBefore[k] !== state.blueprintTransform[k]);
      if (mutated) {
        console.error('[initColorPalette] CRITICAL: Blueprint transform was mutated during color change!', {
          before: blueprintTransformBefore,
          after: { ...state.blueprintTransform },
        });
        // Restore blueprintTransform
        state.blueprintTransform = blueprintTransformBefore;
      }
    }
    
    // Verify blueprintImage was not changed
    if (blueprintImageBefore !== state.blueprintImage) {
      console.error('[initColorPalette] CRITICAL: Blueprint image was changed during color change!', {
        before: blueprintImageBefore,
        after: state.blueprintImage,
      });
      state.blueprintImage = blueprintImageBefore;
    }
    
    draw();
  });
}

/** Header colour wheel: re-colour all diagram elements. Separate popover and handler from #colorPalettePopover (per-element). */
function initHeaderColorPalette() {
  const btn = document.getElementById('headerColorDiagramBtn');
  const popover = document.getElementById('headerColorPalettePopover');
  if (!btn || !popover) return;

  function closeHeaderColorPopover() {
    popover.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
  }

  function positionHeaderColorPopover() {
    const rect = btn.getBoundingClientRect();
    const paletteW = 220;
    const gap = 8;
    let left = rect.left + rect.width / 2 - paletteW / 2;
    left = Math.max(8, Math.min(window.innerWidth - paletteW - 8, left));
    const top = rect.bottom + gap;
    const nudge = nudgePopoverAwayFromDiagramToolbar(left, top, paletteW, popover.offsetHeight || 200);
    popover.style.left = nudge.left + 'px';
    popover.style.top = nudge.top + 'px';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !popover.hasAttribute('hidden');
    if (isOpen) {
      closeHeaderColorPopover();
      return;
    }
    if (state.elements.length === 0) {
      showMessage('Add elements to the diagram first, then use this to colour them all.');
      return;
    }
    positionHeaderColorPopover();
    popover.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
  });

  popover.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    const color = swatch.dataset.color || null;
    const colorValue = color ? color : null;

    pushUndoSnapshot();
    state.elements.forEach((el) => {
      el.color = colorValue;
      el.tintedCanvas = null;
      el.tintedCanvasColor = null;
      el.tintedCanvasWidth = null;
      el.tintedCanvasHeight = null;
      el._tintedCanvasFailureKey = undefined;
    });
    draw();
    closeHeaderColorPopover();
  });

  document.addEventListener('click', (e) => {
    if (popover.hasAttribute('hidden')) return;
    if (btn.contains(e.target) || popover.contains(e.target)) return;
    closeHeaderColorPopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (popover.hasAttribute('hidden')) return;
    closeHeaderColorPopover();
  });
}

function initFloatingToolbar() {
  const toolbar = document.getElementById('floatingToolbar');
  const lockBtn = document.getElementById('floatingToolbarLock');
  const duplicateBtn = document.getElementById('floatingToolbarDuplicate');
  const deleteBtn = document.getElementById('floatingToolbarDelete');
  const measureBtn = document.getElementById('floatingToolbarMeasure');
  const colorBtn = document.getElementById('floatingToolbarColor');
  const moreBtn = document.getElementById('floatingToolbarMore');
  const submenu = document.getElementById('floatingToolbarSubmenu');
  const dragHandle = document.getElementById('floatingToolbarDragHandle');
  if (!toolbar) return;

  if (dragHandle) {
    let dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0, dragPointerId = null;
    dragHandle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragPointerId = e.pointerId;
      state.floatingToolbarUserMoved = true;
      const rect = toolbar.getBoundingClientRect();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartLeft = rect.left;
      dragStartTop = rect.top;
      toolbar.setPointerCapture(e.pointerId);
    });
    toolbar.addEventListener('pointermove', (e) => {
      if (dragPointerId == null || e.pointerId !== dragPointerId) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      let left = dragStartLeft + dx;
      let top = dragStartTop + dy;
      const maxLeft = window.innerWidth - (toolbar.offsetWidth || 200) - 8;
      const maxTop = window.innerHeight - (toolbar.offsetHeight || 44) - 8;
      const minTop = Math.min(getFloatingToolbarMinTopPx(), maxTop);
      left = Math.max(8, Math.min(maxLeft, left));
      top = Math.max(minTop, Math.min(maxTop, top));
      toolbar.style.left = left + 'px';
      toolbar.style.top = top + 'px';
    });
    toolbar.addEventListener('pointerup', (e) => {
      if (e.pointerId !== dragPointerId) return;
      dragPointerId = null;
      state.floatingToolbarUserMoved = true;
      if (toolbar.releasePointerCapture) {
        try { toolbar.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    });
    toolbar.addEventListener('pointercancel', (e) => {
      if (e.pointerId === dragPointerId) {
        dragPointerId = null;
        if (toolbar.releasePointerCapture) {
          try { toolbar.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      }
    });
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedBlueprint && state.blueprintTransform) {
        state.blueprintTransform.locked = !state.blueprintTransform.locked;
      } else if (state.selectedId) {
        const el = state.elements.find((e) => e.id === state.selectedId);
        if (el) el.locked = !el.locked;
      }
      draw();
    });
  }

  if (duplicateBtn) {
    duplicateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedIds.length === 0) return;
      pushUndoSnapshot();
      const newIds = [];
      state.selectedIds.forEach((id) => {
        const el = state.elements.find((x) => x.id === id);
        if (el) {
          let dx = snapToGrid(el.x + SNAP_GRID_SIZE) - el.x;
          let dy = snapToGrid(el.y + SNAP_GRID_SIZE) - el.y;
          if (dx === 0 && dy === 0) { dx = SNAP_GRID_SIZE; dy = 0; }
          const dup = {
            ...el,
            id: 'el-' + ++elementIdCounter,
            x: el.x + dx,
            y: el.y + dy,
            zIndex: getNextElementZIndex(),
            image: el.image,
            originalImage: el.originalImage || el.image,
            tintedCanvas: null,
            tintedCanvasColor: null,
            locked: !!el.locked,
          };
          const othersDup = state.elements;
          const nudgeDirsDup = [[SNAP_GRID_SIZE, 0], [0, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, 0], [0, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, SNAP_GRID_SIZE]];
          for (let n = 0; n < 20; n++) {
            if (!othersDup.some((o) => elementsOverlap(dup, o))) break;
            const [nx, ny] = nudgeDirsDup[n % nudgeDirsDup.length];
            dup.x += nx;
            dup.y += ny;
          }
          state.elements.push(dup);
          newIds.push(dup.id);
        }
      });
      setSelection(newIds);
      draw();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedIds.length === 0 && !state.selectedBlueprint) return;
      pushUndoSnapshot();
      if (state.selectedBlueprint) {
        state.selectedBlueprint = false;
        draw();
        return;
      }
      // Remove all selected elements (Task 28.3); same logic as Delete/Backspace key.
      const toRemove = new Set(state.selectedIds);
      state.elements = state.elements.filter((el) => !toRemove.has(el.id));
      state.groups = state.groups.map((g) => ({
        id: g.id,
        elementIds: g.elementIds.filter((id) => !toRemove.has(id)),
      })).filter((g) => g.elementIds.length > 1);
      setSelection([]);
      updatePlaceholderVisibility();
      renderMeasurementDeck();
      draw();
    });
  }

  if (measureBtn) {
    measureBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (layoutState.viewportMode !== 'mobile') return;
      if (state.selectedBlueprint || state.selectedIds.length !== 1) return;
      const el = state.elements.find((item) => item.id === state.selectedIds[0]);
      if (!el || !(el.sequenceId > 0)) return;
      openBadgeLengthPopoverForElement(el.id, { source: 'ruler' });
    });
  }

  const btnFlipMenu = document.getElementById('btnFlipMenu');
  const flipDropdown = document.getElementById('flipDropdown');
  function clearFlipDropdownPosition() {
    if (!flipDropdown) return;
    flipDropdown.style.position = '';
    flipDropdown.style.left = '';
    flipDropdown.style.top = '';
    flipDropdown.style.transform = '';
  }
  function positionFlipDropdownAwayFromDiagramToolbar() {
    if (layoutState.viewportMode !== 'mobile' || !flipDropdown || flipDropdown.hidden) return;
    const tr = getDiagramToolbarExpandRect();
    if (!tr) return;
    const r = flipDropdown.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const nudge = nudgePopoverAwayFromDiagramToolbar(r.left, r.top, w, h);
    if (nudge.left === r.left && nudge.top === r.top) return;
    flipDropdown.style.position = 'fixed';
    flipDropdown.style.left = nudge.left + 'px';
    flipDropdown.style.top = nudge.top + 'px';
    flipDropdown.style.transform = 'none';
  }
  if (btnFlipMenu && flipDropdown) {
    btnFlipMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      state.colorPaletteOpen = false;
      const wasOpen = !flipDropdown.hidden;
      flipDropdown.hidden = wasOpen;
      if (flipDropdown.hidden) {
        clearFlipDropdownPosition();
      } else {
        clearFlipDropdownPosition(); /* 54.80: re-open uses CSS position before nudge; avoids stale fixed position */
        if (layoutState.viewportMode === 'mobile') requestAnimationFrame(() => { positionFlipDropdownAwayFromDiagramToolbar(); });
      }
      btnFlipMenu.setAttribute('aria-expanded', flipDropdown.hidden ? 'false' : 'true');
      draw();
    });
    flipDropdown.querySelectorAll('.flip-dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.selectedIds.length === 0) return;
        const action = item.dataset.action;
        if (action === 'flip-horizontal') {
          pushUndoSnapshot();
          state.selectedIds.forEach((id) => {
            const el = state.elements.find((x) => x.id === id);
            if (el) el.flipX = !el.flipX;
          });
        } else if (action === 'flip-vertical') {
          pushUndoSnapshot();
          state.selectedIds.forEach((id) => {
            const el = state.elements.find((x) => x.id === id);
            if (el) el.flipY = !el.flipY;
          });
        }
        draw();
      });
    });
  }

  if (colorBtn) {
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (flipDropdown) {
        flipDropdown.hidden = true;
        clearFlipDropdownPosition();
        if (btnFlipMenu) btnFlipMenu.setAttribute('aria-expanded', 'false');
      }
      state.colorPaletteOpen = !state.colorPaletteOpen;
      draw();
    });
  }

  if (moreBtn && submenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      submenu.hidden = !submenu.hidden;
      moreBtn.setAttribute('aria-expanded', submenu.hidden ? 'false' : 'true');
      if (!submenu.hidden) collapseDiagramToolbarIfExpanded();
      draw();
    });
    submenu.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'bring-to-front' && state.selectedIds.length > 0) {
          pushUndoSnapshot();
          getElementsToMove().forEach((id) => bringToFront(id));
        } else if (action === 'send-to-back' && state.selectedIds.length > 0) {
          pushUndoSnapshot();
          getElementsToMove().forEach((id) => sendToBack(id));
        }
        submenu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        draw();
      });
    });
  }

  const userProfileWrap = document.getElementById('userProfileWrap');
  const profileDropdown = document.getElementById('profileDropdown');
  document.addEventListener('click', (e) => {
    let shouldDraw = false;
    if (submenu && !submenu.hidden && toolbar && !toolbar.contains(e.target)) {
      submenu.hidden = true;
      if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
      shouldDraw = true;
    }
    if (flipDropdown && !flipDropdown.hidden && toolbar && !toolbar.contains(e.target)) {
      flipDropdown.hidden = true;
      clearFlipDropdownPosition();
      if (btnFlipMenu) btnFlipMenu.setAttribute('aria-expanded', 'false');
      shouldDraw = true;
    }
    const palette = document.getElementById('colorPalettePopover');
    const clickedPalette = !!(palette && palette.contains(e.target));
    const clickedColorBtn = !!(colorBtn && colorBtn.contains(e.target));
    if (state.colorPaletteOpen && !clickedPalette && !clickedColorBtn) {
      state.colorPaletteOpen = false;
      shouldDraw = true;
    }
    const transparencyPopover = document.getElementById('transparencyPopover');
    const transparencyBtn = document.getElementById('blueprintTransparencyBtn');
    const clickedTransparencyPopover = !!(transparencyPopover && transparencyPopover.contains(e.target));
    const clickedTransparencyBtn = !!(transparencyBtn && transparencyBtn.contains(e.target));
    if (state.transparencyPopoverOpen && !clickedTransparencyPopover && !clickedTransparencyBtn) {
      state.transparencyPopoverOpen = false;
      if (transparencyBtn) transparencyBtn.setAttribute('aria-expanded', 'false');
      shouldDraw = true;
    }
    if (profileDropdown && !profileDropdown.hidden && userProfileWrap && !userProfileWrap.contains(e.target)) {
      profileDropdown.hidden = true;
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar) userAvatar.setAttribute('aria-expanded', 'false');
      shouldDraw = true;
    }
    if (shouldDraw) draw();
  });
}

function getCanvasElement() {
  return document.getElementById('canvas');
}

function getCanvasRect() {
  const canvas = getCanvasElement();
  if (!canvas) return null;
  return canvas.getBoundingClientRect();
}

function getFloatingToolbarMinTopPx() {
  if (layoutState.viewportMode !== 'mobile') return 8;
  const wrap = document.getElementById('globalToolbarWrap');
  if (!wrap) return 8;
  return Math.max(8, wrap.getBoundingClientRect().bottom + 8);
}

/** 54.80.4: Mobile-only – diagram toolbar rect when expanded (for positioning popovers away from it). */
function getDiagramToolbarExpandRect() {
  if (layoutState.viewportMode !== 'mobile') return null;
  const toolbar = document.getElementById('diagramFloatingToolbar');
  if (!toolbar || toolbar.classList.contains('diagram-floating-toolbar--collapsed')) return null;
  return toolbar.getBoundingClientRect();
}

/** 54.80.4: Mobile-only – nudge (left, top) so a popover of size (w, h) does not overlap the expanded diagram toolbar. */
function nudgePopoverAwayFromDiagramToolbar(desiredLeft, desiredTop, w, h) {
  const tr = getDiagramToolbarExpandRect();
  if (!tr) return { left: desiredLeft, top: desiredTop };
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minPad = 8;
  function overlaps(l, t) {
    const r = l + w;
    const b = t + h;
    return !(r <= tr.left - pad || l >= tr.right + pad || b <= tr.top - pad || t >= tr.bottom + pad);
  }
  if (!overlaps(desiredLeft, desiredTop)) return { left: desiredLeft, top: desiredTop };
  const candidates = [
    { left: tr.left - w - pad, top: desiredTop },
    { left: tr.right + pad, top: desiredTop },
    { left: desiredLeft, top: tr.top - h - pad },
    { left: desiredLeft, top: tr.bottom + pad },
  ].filter((c) => c.left >= minPad && c.left + w <= vw - minPad && c.top >= minPad && c.top + h <= vh - minPad && !overlaps(c.left, c.top));
  if (candidates.length === 0) return { left: desiredLeft, top: desiredTop };
  let best = candidates[0];
  let bestDist = (best.left - desiredLeft) ** 2 + (best.top - desiredTop) ** 2;
  for (let i = 1; i < candidates.length; i++) {
    const d = (candidates[i].left - desiredLeft) ** 2 + (candidates[i].top - desiredTop) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = candidates[i];
    }
  }
  return best;
}

/** Only show #colorPalettePopover when Color Wheel was clicked; position relative to floating toolbar. */
function updateColorPalettePositionAndVisibility(toolbarEl, selected, scale) {
  const paletteEl = document.getElementById('colorPalettePopover');
  if (!paletteEl) return;
  if (!state.colorPaletteOpen || !selected || state.selectedBlueprint) {
    paletteEl.setAttribute('hidden', '');
    return;
  }
  const rect = getCanvasRect();
  if (!rect) return;
  const paletteW = 220;
  const gap = 8;
  if (toolbarEl && !toolbarEl.hasAttribute('hidden')) {
    const toolbarRect = toolbarEl.getBoundingClientRect();
    let left = toolbarRect.left + toolbarRect.width / 2 - paletteW / 2;
    left = Math.max(8, Math.min(window.innerWidth - paletteW - 8, left));
    const top = toolbarRect.bottom + gap;
    const nudge = nudgePopoverAwayFromDiagramToolbar(left, top, paletteW, paletteEl.offsetHeight || 200);
    paletteEl.style.left = nudge.left + 'px';
    paletteEl.style.top = nudge.top + 'px';
  } else {
    const cx = rect.left + state.offsetX + (selected.x + selected.width / 2) * scale;
    const cy = rect.top + state.offsetY + (selected.y + selected.height / 2) * scale;
    const sh = selected.height * scale;
    let left = cx - paletteW / 2;
    left = Math.max(8, Math.min(window.innerWidth - paletteW - 8, left));
    const top = cy + sh / 2 + gap;
    const nudge = nudgePopoverAwayFromDiagramToolbar(left, top, paletteW, paletteEl.offsetHeight || 200);
    paletteEl.style.left = nudge.left + 'px';
    paletteEl.style.top = nudge.top + 'px';
  }
  paletteEl.removeAttribute('hidden');
  paletteEl.querySelectorAll('.color-swatch').forEach((btn) => {
    const c = (btn.dataset.color || '').toUpperCase();
    const active = (selected.color || '').toUpperCase() === c || (!selected.color && !c);
    btn.classList.toggle('color-swatch-active', !!active);
  });
}

/** Init transparency slider, number input, and transparency toggle button. */
function initTransparencyPopover() {
  const btnEl = document.getElementById('blueprintTransparencyBtn');
  if (btnEl) {
    btnEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    btnEl.addEventListener('mousedown', (e) => e.stopPropagation());
    btnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      state.transparencyPopoverOpen = !state.transparencyPopoverOpen;
      btnEl.setAttribute('aria-expanded', String(state.transparencyPopoverOpen));
      draw();
    });
  }
  const rangeEl = document.getElementById('transparencyRange');
  const numberEl = document.getElementById('transparencyNumber');
  if (!rangeEl || !numberEl) return;
  rangeEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (state.blueprintTransform) pushUndoSnapshot();
  });
  rangeEl.addEventListener('mousedown', (e) => e.stopPropagation());
  rangeEl.addEventListener('input', () => {
    if (!state.blueprintTransform) return;
    const pct = Math.max(0, Math.min(100, Number(rangeEl.value)));
    state.blueprintTransform.opacity = pct / 100;
    numberEl.value = Math.round(pct);
    draw();
  });
  rangeEl.addEventListener('change', () => {
    /* Undo snapshot pushed on mousedown (before any changes) */
  });
  numberEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  numberEl.addEventListener('mousedown', (e) => e.stopPropagation());
  numberEl.addEventListener('change', () => {
    if (!state.blueprintTransform) return;
    pushUndoSnapshot();
    const pct = Math.max(0, Math.min(100, Number(numberEl.value) || 100));
    state.blueprintTransform.opacity = pct / 100;
    rangeEl.value = Math.round(pct);
    numberEl.value = Math.round(pct);
    draw();
  });
}

/** Show/hide #blueprintTransparencyBtn (lives in #diagramFloatingToolbar). Visible only when blueprint exists and technical drawing off. */
function updateTransparencyButtonPositionAndVisibility(rect, scale) {
  const btnEl = document.getElementById('blueprintTransparencyBtn');
  if (!btnEl) return;
  if (!state.blueprintImage || state.technicalDrawing || !state.blueprintTransform) {
    btnEl.setAttribute('hidden', '');
    return;
  }
  btnEl.removeAttribute('hidden');
}

/** Show #transparencyPopover only when state.transparencyPopoverOpen; position near transparency button. */
function updateTransparencyPopover(rect, scale) {
  const popoverEl = document.getElementById('transparencyPopover');
  if (!popoverEl) return;
  if (!state.transparencyPopoverOpen || state.technicalDrawing || !state.blueprintTransform) {
    popoverEl.setAttribute('hidden', '');
    return;
  }
  const btnEl = document.getElementById('blueprintTransparencyBtn');
  const bt = state.blueprintTransform;
  const popoverW = 180;
  const gap = 10;
  if (btnEl && !btnEl.hasAttribute('hidden')) {
    const btnRect = btnEl.getBoundingClientRect();
    let left = btnRect.left + btnRect.width / 2 - popoverW / 2;
    left = Math.max(8, Math.min(window.innerWidth - popoverW - 8, left));
    const top = btnRect.bottom + gap;
    const nudge = nudgePopoverAwayFromDiagramToolbar(left, top, popoverW, popoverEl.offsetHeight || 120);
    popoverEl.style.left = nudge.left + 'px';
    popoverEl.style.top = nudge.top + 'px';
  } else {
    const topLeftX = rect.left + state.offsetX + bt.x * scale;
    const topLeftY = rect.top + state.offsetY + bt.y * scale;
    let left = topLeftX - popoverW / 2 + 16;
    left = Math.max(8, Math.min(window.innerWidth - popoverW - 8, left));
    const top = topLeftY + 40 + gap;
    const nudge = nudgePopoverAwayFromDiagramToolbar(left, top, popoverW, popoverEl.offsetHeight || 120);
    popoverEl.style.left = nudge.left + 'px';
    popoverEl.style.top = nudge.top + 'px';
  }
  const pct = Math.round((bt.opacity ?? 1) * 100);
  const rangeEl = document.getElementById('transparencyRange');
  const numberEl = document.getElementById('transparencyNumber');
  if (rangeEl) rangeEl.value = pct;
  if (numberEl) numberEl.value = pct;
  popoverEl.removeAttribute('hidden');
}

const accessibilityInspectorState = {
  open: false,
};

function getInspectorSelectedElement() {
  if (state.selectedBlueprint) return null;
  if (!state.selectedIds || state.selectedIds.length !== 1) return null;
  return state.elements.find((el) => el.id === state.selectedIds[0]) || null;
}

function setInspectorOpen(open, options = {}) {
  accessibilityInspectorState.open = !!open;
  const panel = document.getElementById('accessibilityInspector');
  const openBtn = document.getElementById('openInspectorBtn');
  if (panel) panel.hidden = !accessibilityInspectorState.open;
  if (openBtn) openBtn.setAttribute('aria-expanded', accessibilityInspectorState.open ? 'true' : 'false');
  if (options.announce !== false && typeof announceCanvas === 'function') {
    announceCanvas(accessibilityInspectorState.open ? 'Inspector opened.' : 'Inspector closed.');
  }
}

function updateAccessibilityInspector(options = {}) {
  const panel = document.getElementById('accessibilityInspector');
  const form = document.getElementById('inspectorForm');
  const hint = document.getElementById('inspectorSelectionHint');
  const openBtn = document.getElementById('openInspectorBtn');
  const locked = document.getElementById('inspectorLocked');
  const posX = document.getElementById('inspectorPosX');
  const posY = document.getElementById('inspectorPosY');
  const width = document.getElementById('inspectorWidth');
  const height = document.getElementById('inspectorHeight');
  const rotation = document.getElementById('inspectorRotation');
  if (!panel || !form || !hint || !openBtn) return;

  panel.hidden = !accessibilityInspectorState.open;
  openBtn.setAttribute('aria-expanded', accessibilityInspectorState.open ? 'true' : 'false');
  if (!accessibilityInspectorState.open) return;

  const selected = getInspectorSelectedElement();
  if (!selected) {
    form.hidden = true;
    hint.hidden = false;
    if (state.selectedBlueprint) hint.textContent = 'Inspector currently supports Marley elements only.';
    else if ((state.selectedIds || []).length > 1) hint.textContent = 'Select one element to edit transform values.';
    else hint.textContent = 'Select one element to edit position, size, rotation, lock, and layer order.';
    return;
  }

  form.hidden = false;
  hint.hidden = true;

  const maybeSetValue = (input, value) => {
    if (!(input instanceof HTMLInputElement)) return;
    if (options.skipActiveField && document.activeElement === input) return;
    input.value = String(Math.round((value || 0) * 100) / 100);
  };

  maybeSetValue(posX, selected.x);
  maybeSetValue(posY, selected.y);
  maybeSetValue(width, selected.width);
  maybeSetValue(height, selected.height);
  maybeSetValue(rotation, normalizeAngleDeg(selected.rotation || 0));
  if (locked) locked.checked = !!selected.locked;
}

function initAccessibilityInspector() {
  const panel = document.getElementById('accessibilityInspector');
  const openBtn = document.getElementById('openInspectorBtn');
  const closeBtn = document.getElementById('inspectorCloseBtn');
  const posX = document.getElementById('inspectorPosX');
  const posY = document.getElementById('inspectorPosY');
  const width = document.getElementById('inspectorWidth');
  const height = document.getElementById('inspectorHeight');
  const rotation = document.getElementById('inspectorRotation');
  const locked = document.getElementById('inspectorLocked');
  const bringFrontBtn = document.getElementById('inspectorBringFrontBtn');
  const sendBackBtn = document.getElementById('inspectorSendBackBtn');
  if (!panel || !openBtn) return;

  panel.hidden = true;
  openBtn.setAttribute('aria-expanded', 'false');

  openBtn.addEventListener('click', () => {
    const nextOpen = !accessibilityInspectorState.open;
    setInspectorOpen(nextOpen, { announce: true });
    updateAccessibilityInspector();
    if (nextOpen) {
      const firstInput = getInspectorSelectedElement()
        ? (document.getElementById('inspectorPosX') || document.getElementById('inspectorWidth'))
        : closeBtn;
      focusElementNoScroll(firstInput);
    }
  });

  closeBtn?.addEventListener('click', () => {
    setInspectorOpen(false, { announce: true });
    updateAccessibilityInspector();
    focusElementNoScroll(openBtn);
  });

  function applyNumberChange(input, applyFn) {
    if (!(input instanceof HTMLInputElement)) return;
    const selected = getInspectorSelectedElement();
    if (!selected) return;
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) {
      updateAccessibilityInspector();
      return;
    }
    const changed = applyFn(selected, raw);
    if (!changed) {
      updateAccessibilityInspector({ skipActiveField: true });
      return;
    }
    draw();
    updateAccessibilityInspector({ skipActiveField: true });
  }

  function bindNumberInput(input, applyFn) {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener('change', () => applyNumberChange(input, applyFn));
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      applyNumberChange(input, applyFn);
    });
  }

  bindNumberInput(posX, (selected, raw) => {
    const next = Math.round(raw * 100) / 100;
    if (Math.abs((selected.x || 0) - next) < 0.001) return false;
    pushUndoSnapshot();
    selected.x = next;
    return true;
  });
  bindNumberInput(posY, (selected, raw) => {
    const next = Math.round(raw * 100) / 100;
    if (Math.abs((selected.y || 0) - next) < 0.001) return false;
    pushUndoSnapshot();
    selected.y = next;
    return true;
  });
  bindNumberInput(width, (selected, raw) => {
    const next = Math.max(4, Math.round(raw * 100) / 100);
    if (Math.abs((selected.width || 0) - next) < 0.001) return false;
    pushUndoSnapshot();
    selected.width = next;
    return true;
  });
  bindNumberInput(height, (selected, raw) => {
    const next = Math.max(4, Math.round(raw * 100) / 100);
    if (Math.abs((selected.height || 0) - next) < 0.001) return false;
    pushUndoSnapshot();
    selected.height = next;
    return true;
  });
  bindNumberInput(rotation, (selected, raw) => {
    const next = constrainGutterRotation(normalizeAngleDeg(raw), selected).degrees;
    if (Math.abs((selected.rotation || 0) - next) < 0.001) return false;
    pushUndoSnapshot();
    selected.rotation = next;
    return true;
  });

  locked?.addEventListener('change', () => {
    const selected = getInspectorSelectedElement();
    if (!selected) return;
    const next = !!locked.checked;
    if (!!selected.locked === next) return;
    pushUndoSnapshot();
    selected.locked = next;
    draw();
    updateAccessibilityInspector();
  });

  bringFrontBtn?.addEventListener('click', () => {
    const selected = getInspectorSelectedElement();
    if (!selected) return;
    pushUndoSnapshot();
    bringToFront(selected.id);
    updateAccessibilityInspector();
  });

  sendBackBtn?.addEventListener('click', () => {
    const selected = getInspectorSelectedElement();
    if (!selected) return;
    pushUndoSnapshot();
    sendToBack(selected.id);
    updateAccessibilityInspector();
  });
}

function getElementsToMove() {
  const ids = new Set(state.selectedIds);
  state.groups.forEach((g) => {
    const hasSelected = g.elementIds.some((id) => state.selectedIds.includes(id));
    if (hasSelected) g.elementIds.forEach((id) => ids.add(id));
  });
  return Array.from(ids);
}

/** 54.61: Return the currently selected, unlocked element eligible for mobile two-finger transform. */
function getSelectedElementForMobileTransform() {
  if (layoutState.viewportMode !== 'mobile') return null;
  if (state.selectedBlueprint) return null;
  if (!state.selectedId || !state.selectedIds || state.selectedIds.length !== 1) return null;
  const el = state.elements.find((x) => x.id === state.selectedId);
  if (!el || el.locked) return null;
  return el;
}

/** Clear transient mobile pointer gesture state (move-prime + two-finger element transform). */
function clearMobilePointerGestureState() {
  state.elementTransformPointerIds = null;
  state.elementTransformStart = null;
  state.movePrimeStartClientX = 0;
  state.movePrimeStartClientY = 0;
}

/**
 * 54.61: Begin two-finger selected-element transform on mobile.
 * Returns true when transform mode starts successfully.
 */
function beginMobileElementTransformFromActivePointers() {
  const selected = getSelectedElementForMobileTransform();
  if (!selected) return false;
  const ptrIds = Object.keys(state.activePointers);
  if (ptrIds.length !== 2) return false;
  const idA = ptrIds[0];
  const idB = ptrIds[1];
  const p1 = state.activePointers[idA];
  const p2 = state.activePointers[idB];
  if (!p1 || !p2) return false;
  const midClientX = (p1.clientX + p2.clientX) / 2;
  const midClientY = (p1.clientY + p2.clientY) / 2;
  const midCanvas = clientToCanvas(midClientX, midClientY);
  const distance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
  if (!midCanvas || distance <= 5) return false;

  if (!state.snapshotAtActionStart) {
    state.snapshotAtActionStart = cloneStateForUndo();
  }

  // Cancel pending one-finger drag preview so two-finger transform starts from committed values.
  state.previewDragX = null;
  state.previewDragY = null;
  state.dragMoveIds = [];
  state.dragRelativeOffsets = [];
  state.dragGhostX = null;
  state.dragGhostY = null;
  state.marqueeStart = null;
  state.marqueeCurrent = null;

  state.mode = 'element-transform';
  state.elementTransformPointerIds = [idA, idB];
  state.elementTransformStart = {
    centerX: selected.x + selected.width / 2,
    centerY: selected.y + selected.height / 2,
    midX: midCanvas.x,
    midY: midCanvas.y,
    distance,
    angle: Math.atan2(p2.clientY - p1.clientY, p2.clientX - p1.clientX),
    width: selected.width,
    height: selected.height,
    rotation: selected.rotation || 0,
  };
  return true;
}

/** 54.61: Apply two-finger transform (translate + uniform resize + rotate) to selected element on mobile. */
function applyMobileElementTransformFromActivePointers() {
  if (state.mode !== 'element-transform') return false;
  const ids = state.elementTransformPointerIds;
  const start = state.elementTransformStart;
  if (!ids || ids.length !== 2 || !start) return false;
  const p1 = state.activePointers[ids[0]];
  const p2 = state.activePointers[ids[1]];
  const selected = getSelectedElementForMobileTransform();
  if (!p1 || !p2 || !selected) return false;

  const currentDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
  if (!(currentDistance > 0) || !(start.distance > 0)) return false;

  const midClientX = (p1.clientX + p2.clientX) / 2;
  const midClientY = (p1.clientY + p2.clientY) / 2;
  const midCanvas = clientToCanvas(midClientX, midClientY);
  if (!midCanvas) return false;

  const currentAngle = Math.atan2(p2.clientY - p1.clientY, p2.clientX - p1.clientX);
  const scaleFactor = currentDistance / start.distance;
  const nextW = Math.max(MIN_ELEMENT_DIMENSION_PX, start.width * scaleFactor);
  const nextH = Math.max(MIN_ELEMENT_DIMENSION_PX, start.height * scaleFactor);
  const deltaRotationDeg = ((currentAngle - start.angle) * 180) / Math.PI;
  let nextRotation = normalizeAngleDeg(start.rotation + deltaRotationDeg);
  nextRotation = constrainGutterRotation(nextRotation, selected).degrees;

  const nextCenterX = start.centerX + (midCanvas.x - start.midX);
  const nextCenterY = start.centerY + (midCanvas.y - start.midY);

  selected.width = nextW;
  selected.height = nextH;
  selected.x = nextCenterX - nextW / 2;
  selected.y = nextCenterY - nextH / 2;
  selected.rotation = nextRotation;

  if (selected.tintedCanvas && (selected.tintedCanvasWidth !== nextW || selected.tintedCanvasHeight !== nextH)) {
    selected.tintedCanvas = null;
    selected.tintedCanvasColor = null;
    selected.tintedCanvasWidth = null;
    selected.tintedCanvasHeight = null;
    selected._tintedCanvasFailureKey = undefined;
  }
  return true;
}

function setSelection(ids) {
  const next = ids && ids.length ? ids : [];
  const prev = state.selectedIds;
  const changed =
    prev.length !== next.length || next.some((id, i) => id !== prev[i]);
  state.selectedIds = next;
  state.selectedId = state.selectedIds[0] || null;
  if (changed) {
    state.floatingToolbarUserMoved = false; // 54.20: reposition toolbar for new selection
  }
  if (changed && typeof announceCanvas === 'function') {
    if (next.length === 0) announceCanvas('Selection cleared.');
    else if (next.length === 1) announceCanvas('Element selected. Open Inspector for precise controls without dragging.');
    else announceCanvas(`${next.length} elements selected.`);
  }
  updateAccessibilityInspector({ skipActiveField: true });
}

function getElementsInMarquee(start, current, windowMode) {
  const minX = Math.min(start.x, current.x);
  const maxX = Math.max(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxY = Math.max(start.y, current.y);
  const ids = [];
  state.elements.forEach((el) => {
    const b = rotatedRectBbox(el.x, el.y, el.width, el.height, el.rotation || 0);
    const elMinX = b.x;
    const elMaxX = b.x + b.width;
    const elMinY = b.y;
    const elMaxY = b.y + b.height;
    if (windowMode) {
      if (elMinX >= minX && elMaxX <= maxX && elMinY >= minY && elMaxY <= maxY) ids.push(el.id);
    } else {
      if (!(elMaxX < minX || elMinX > maxX || elMaxY < minY || elMinY > maxY)) ids.push(el.id);
    }
  });
  return ids;
}

function getElementDrawPosition(el) {
  if (state.mode !== 'move' || state.previewDragX == null || !state.dragMoveIds.includes(el.id)) {
    return { x: el.x, y: el.y };
  }
  if (el.id === state.selectedId) {
    return { x: state.previewDragX, y: state.previewDragY };
  }
  const rel = state.dragRelativeOffsets.find((r) => r.id === el.id);
  if (!rel) return { x: el.x, y: el.y };
  return {
    x: state.previewDragX + rel.dx,
    y: state.previewDragY + rel.dy,
  };
}

function getSnapPopScale() {
  if (state.snapPopStartTime == null) return null;
  const elapsed = Date.now() - state.snapPopStartTime;
  if (elapsed >= SNAP_POP_DURATION_MS) {
    state.snapPopStartTime = null;
    state.snapPopElementIds = [];
    return null;
  }
  const t = elapsed / SNAP_POP_DURATION_MS;
  return 1 + 0.05 * Math.sin(t * Math.PI);
}

function updatePlaceholderVisibility() {
  const placeholder = document.getElementById('canvasPlaceholder');
  if (!placeholder) return;
  const hasContent = !!(state.blueprintImage || state.elements.length);
  if (hasContent) placeholder.classList.add('hidden');
  else placeholder.classList.remove('hidden');
}

const TOOLTIP_OFFSET = 16;

function updateCanvasTooltip(content, clientX, clientY) {
  const tip = document.getElementById('canvasTooltip');
  if (!tip) return;
  if (content == null) {
    tip.setAttribute('hidden', '');
    return;
  }
  tip.textContent = content;
  tip.style.left = (clientX + TOOLTIP_OFFSET) + 'px';
  tip.style.top = (clientY + TOOLTIP_OFFSET) + 'px';
  tip.removeAttribute('hidden');
}

/**
 * Convert viewport (client) coordinates to canvas display coordinates (same space as
 * state.offsetX/offsetY and handle positions). Uses rect + logical size so pointer
 * aligns with drawn content in all browsers (Chrome/DPR alignment).
 */
function clientToCanvasDisplay(clientX, clientY) {
  const rect = getCanvasRect();
  if (!rect || !rect.width || !rect.height) return null;
  const dpr = window.devicePixelRatio || 1;
  const logicalW = state.canvasWidth / dpr;
  const logicalH = state.canvasHeight / dpr;
  return {
    x: (clientX - rect.left) * (logicalW / rect.width),
    y: (clientY - rect.top) * (logicalH / rect.height),
  };
}

function clientToCanvas(clientX, clientY) {
  const display = clientToCanvasDisplay(clientX, clientY);
  if (!display) return { x: 0, y: 0 };
  return {
    x: (display.x - state.offsetX) / state.scale,
    y: (display.y - state.offsetY) / state.scale,
  };
}

/** Cache-buster for diagram assets so updated/cropped SVGs are fetched (bump when assets change). */
const DIAGRAM_ASSET_VERSION = '2';

function loadImage(src) {
  let url = src.startsWith('http') || src.startsWith('/') || src.startsWith('blob:') ? src : `/assets/marley/${src}.svg`;
  if (url.startsWith('/assets/marley/') && !url.includes('?')) {
    url += '?v=' + DIAGRAM_ASSET_VERSION;
  }
  if (imagesCache[url]) return Promise.resolve(imagesCache[url]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imagesCache[url] = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Load diagram image for drop/preview. Backend may return .png URLs for normalized assets;
 * if the PNG is missing (normalize script not run), fall back to .svg so drag-drop still works.
 */
function resolveDiagramAssetUrl(url) {
  if (typeof url !== 'string') return url;
  // Mobile/production safety: local Marley assets are authored as SVGs in this repo.
  // Prefer SVG directly to avoid noisy PNG 404 probes in browser console.
  if (/^\/assets\/marley\/.*\.png(\?.*)?$/i.test(url)) {
    return url.replace(/\.png(?=($|\?))/i, '.svg');
  }
  return url;
}

function loadDiagramImage(url) {
  const resolvedUrl = resolveDiagramAssetUrl(url);
  return loadImage(resolvedUrl).catch((err) => {
    if (typeof resolvedUrl === 'string' && /\.png($|\?)/i.test(resolvedUrl)) {
      const svgUrl = resolvedUrl.replace(/\.png(?=($|\?))/i, '.svg');
      return loadImage(svgUrl);
    }
    throw err;
  });
}

/**
 * Load diagram image from URL. For remote URLs (http/https), if loadDiagramImage fails (e.g. CORS),
 * fetch SVG as text and create an object URL so canvas can draw without taint.
 */
async function loadDiagramImageForDrop(url) {
  try {
    return await loadDiagramImage(url);
  } catch (err) {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch diagram: ${res.status}`);
      const svgText = await res.text();
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await loadImage(objectUrl);
        return img;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    throw err;
  }
}

/**
 * Create a tinted canvas from the original B&W diagram image and a color.
 * Treats the diagram as an alpha mask: color is "projected" through the black lines (opaque pixels),
 * while white/transparent areas remain empty (transparent).
 * 
 * Process:
 * 1. Fill entire canvas with the target color
 * 2. Use 'destination-in' composite: keep color only where the original image has opaque pixels
 * 3. This ensures black lines get the color, transparent/white areas stay transparent
 * 
 * Returns a canvas element that can be drawn directly, or null if color is null (use originalImage instead).
 * Uses a higher resolution (TINT_RESOLUTION_SCALE) so tinted SVG/elements stay sharp when scaled on the main canvas (Task 19.12).
 */
const TINT_RESOLUTION_SCALE = 4;
function createTintedCanvas(originalImage, color, width, height, elementId = null) {
  if (!color || !originalImage) return null;
  const tw = Math.max(1, Math.round(width * TINT_RESOLUTION_SCALE));
  const th = Math.max(1, Math.round(height * TINT_RESOLUTION_SCALE));
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      console.error('[createTintedCanvas] Failed to get 2d context', { elementId, width, height });
      return null;
    }
    
    // Assert: ensure we're using an offscreen canvas, not the main canvas context
    if (state.ctx && ctx === state.ctx) {
      console.error('[createTintedCanvas] CRITICAL: Using main canvas context instead of offscreen canvas!', { elementId });
      return null;
    }
    
    // Check for opaque assets: sample corner pixels to detect if asset has transparent background
    // This helps identify assets that will produce solid color fills instead of tinted lines
    try {
      const checkCanvas = document.createElement('canvas');
      checkCanvas.width = originalImage.naturalWidth || originalImage.width || width;
      checkCanvas.height = originalImage.naturalHeight || originalImage.height || height;
      const checkCtx = checkCanvas.getContext('2d');
      if (checkCtx) {
        checkCtx.drawImage(originalImage, 0, 0);
        const imgData = checkCtx.getImageData(0, 0, checkCanvas.width, checkCanvas.height);
        const data = imgData.data;
        const w = checkCanvas.width;
        const h = checkCanvas.height;
        
        // Sample corner pixels
        const corners = [
          { x: 0, y: 0 }, // top-left
          { x: w - 1, y: 0 }, // top-right
          { x: 0, y: h - 1 }, // bottom-left
          { x: w - 1, y: h - 1 }, // bottom-right
        ];
        
        const allOpaque = corners.every(({ x, y }) => {
          const idx = (y * w + x) * 4;
          return data[idx + 3] === 255; // alpha channel
        });
        
        if (allOpaque) {
          console.warn('[createTintedCanvas] Asset appears fully opaque - tinting may cover entire area instead of just lines', {
            elementId,
            width: checkCanvas.width,
            height: checkCanvas.height,
          });
        }
      }
    } catch (checkError) {
      // Ignore transparency check errors - proceed with tinting
    }
    
    // Step 1: Clear to fully transparent (ensures clean alpha channel)
    ctx.clearRect(0, 0, tw, th);
    
    // Step 2: Fill entire canvas with the target color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, tw, th);
    
    // Step 3: Use destination-in to mask the color with the image's alpha channel (draw at higher res for sharpness)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(originalImage, 0, 0, tw, th);
    
    // Step 4: Reset composite operation for next draw
    ctx.globalCompositeOperation = 'source-over';
    
    return canvas;
  } catch (error) {
    console.error('[createTintedCanvas] Error creating tinted canvas', {
      elementId,
      color,
      width,
      height,
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
}

/**
 * Get the image to render for an element: tintedCanvas if color exists, otherwise originalImage.
 * Also ensures originalImage is set (migrates old elements that only have .image).
 */
function getElementRenderImage(el) {
  if (!el.originalImage && el.image) {
    el.originalImage = el.image;
  }
  if (!el.originalImage) return null;
  if (el.color) {
    const cacheKey = `${el.color}-${el.width}-${el.height}`;
    const needRegenerate = !el.tintedCanvas || el.tintedCanvasColor !== el.color || el.tintedCanvasWidth !== el.width || el.tintedCanvasHeight !== el.height;
    // Avoid retrying createTintedCanvas every frame when it has already failed for this color/size
    const alreadyFailedForThisKey = el._tintedCanvasFailureKey === cacheKey;
    
    if (needRegenerate && !alreadyFailedForThisKey) {
      el.tintedCanvas = createTintedCanvas(el.originalImage, el.color, el.width, el.height, el.id);
      if (!el.tintedCanvas) {
        el._tintedCanvasFailureKey = cacheKey;
        console.warn('[getElementRenderImage] Tinted canvas creation failed, falling back to originalImage', { elementId: el.id, color: el.color });
        return el.originalImage;
      }
      el._tintedCanvasFailureKey = undefined; // clear failure key on success
      el.tintedCanvasColor = el.color;
      el.tintedCanvasWidth = el.width;
      el.tintedCanvasHeight = el.height;
    } else if (alreadyFailedForThisKey) {
      return el.originalImage;
    }
    return el.tintedCanvas;
  }
  return el.originalImage;
}

/**
 * Compute element width/height so the longer side equals ELEMENT_MAX_DIMENSION_PX (1/5 of reference).
 * Preserves aspect ratio; works for portrait, landscape, and square (e.g. 9:16).
 */
/**
 * Canvas Porter: Auto-Scale normalization
 * Calculate element size from image with normalization: Scale = min(MaxUnit / width, MaxUnit / height)
 * Preserves aspect ratio; works for portrait, landscape, and square (e.g. 9:16).
 */
function elementSizeFromImage(img, maxDim = CANVAS_PORTER_MAX_UNIT, minDim = MIN_ELEMENT_DIMENSION_PX) {
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;
  
  // Canvas Porter normalization: Scale = min(MaxUnit / width, MaxUnit / height)
  const scale = Math.min(maxDim / nw, maxDim / nh);
  let w = nw * scale;
  let h = nh * scale;
  
  // Ensure minimum dimensions
  if (w < minDim && w > 0) {
    w = minDim;
    h = (nh / nw) * minDim;
  }
  if (h < minDim && h > 0) {
    h = minDim;
    w = (nw / nh) * minDim;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

/**
 * Mobile add sizing:
 * - With blueprint: max dimension = 25% of blueprint long side (world space).
 * - Without blueprint: max dimension = 25% of canvas long side fallback.
 *   Keep this independent of transient view scale so repeated adds stay consistent.
 * Desktop remains fixed at Canvas Porter max unit.
 */
function getAddMaxDimensionWorld() {
  if (layoutState.viewportMode !== 'mobile') return CANVAS_PORTER_MAX_UNIT;

  const bt = state.blueprintTransform;
  if (bt && Number.isFinite(bt.w) && Number.isFinite(bt.h)) {
    const blueprintLongSide = Math.max(Math.abs(bt.w), Math.abs(bt.h));
    if (blueprintLongSide > MOBILE_ADD_SCALE_EPSILON) {
      return Math.max(MIN_ELEMENT_DIMENSION_PX, blueprintLongSide * MOBILE_ADD_SIZE_RATIO);
    }
  }

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const logicalW = state.canvasWidth > 0 ? state.canvasWidth / dpr : 0;
  const logicalH = state.canvasHeight > 0 ? state.canvasHeight / dpr : 0;
  const canvasWorldLongSide = Math.max(logicalW, logicalH);
  if (canvasWorldLongSide > MOBILE_ADD_SCALE_EPSILON) {
    return Math.max(MIN_ELEMENT_DIMENSION_PX, canvasWorldLongSide * MOBILE_ADD_SIZE_RATIO);
  }

  return CANVAS_PORTER_MAX_UNIT;
}

function getDiagramUrl(assetId) {
  const p = state.products.find((pr) => pr.id === assetId);
  const url = p?.diagramUrl;
  if (!url) return `/assets/marley/${assetId}.svg`;
  return url.startsWith('http') || url.startsWith('/') ? url : `/assets/marley/${assetId}.svg`;
}

/**
 * Count canvas elements by product (assetId). Excludes anything without assetId (e.g. blueprint is not in state.elements).
 * @returns {Record<string, number>} e.g. { gutter: 2, bracket: 5, downpipe: 1 }
 */
function countCanvasElements() {
  const counts = {};
  state.elements.forEach((el) => {
    if (el.assetId == null || el.assetId === '') return;
    counts[el.assetId] = (counts[el.assetId] || 0) + 1;
  });
  return counts;
}

/** Standard length per unit (mm) for length-based quantity. Gutter and downpipe from asset_id; droppers default 3000. */
function getStandardLengthMm(assetId) {
  if (!assetId) return 3000;
  const gm = GUTTER_PATTERN.exec(assetId.trim());
  if (gm) return parseFloat(gm[2]) * 1000 || 3000;
  const dm = DOWNPIPE_PATTERN.exec(assetId.trim());
  if (dm) return parseFloat(dm[2]) * 1000 || 3000;
  return 3000;
}

/**
 * Minimum number of pieces (and combination) from stock lengths that sum exactly to total.
 * lengths should be descending (e.g. [5000, 3000, 1500]). Returns { count, counts: { length: qty } } or null.
 */
function minPiecesAndCombination(total, lengths) {
  if (total <= 0) return { count: 0, counts: Object.fromEntries(lengths.map((L) => [L, 0])) };
  const dp = new Array(total + 1).fill(Number.POSITIVE_INFINITY);
  const choice = new Array(total + 1).fill(null);
  dp[0] = 0;
  for (let t = 1; t <= total; t++) {
    for (const L of lengths) {
      if (t >= L && dp[t - L] + 1 < dp[t]) {
        dp[t] = dp[t - L] + 1;
        choice[t] = L;
      }
    }
  }
  if (dp[total] === Number.POSITIVE_INFINITY) return null;
  const counts = Object.fromEntries(lengths.map((L) => [L, 0]));
  let t = total;
  while (t > 0 && choice[t]) {
    counts[choice[t]] += 1;
    t -= choice[t];
  }
  return { count: dp[total], counts };
}

/**
 * Bin-packing for gutter: find combination of stock lengths (1500, 3000, 5000 mm) that:
 * - sums to >= requiredMm (always round up),
 * - minimizes waste (total - requiredMm),
 * - then minimizes number of pieces (fewer joints).
 * @returns {{ waste: number, counts: Record<number, number> } | null}
 */
function getOptimalGutterCombination(requiredMm) {
  if (requiredMm <= 0) return { waste: 0, counts: { 5000: 0, 3000: 0, 1500: 0 } };
  const lengths = GUTTER_STOCK_LENGTHS_MM;
  const maxStock = Math.max(...lengths);
  let best = null;
  for (let total = requiredMm; total <= requiredMm + maxStock; total++) {
    const r = minPiecesAndCombination(total, lengths);
    if (!r) continue;
    const waste = total - requiredMm;
    if (!best || waste < best.waste || (waste === best.waste && r.count < best.count)) {
      best = { waste, count: r.count, counts: r.counts };
    }
  }
  return best ? { waste: best.waste, counts: best.counts } : null;
}

/**
 * Bin-packing for downpipe: find combination of stock lengths (1500, 3000 mm) that:
 * - sums to >= requiredMm (always round up),
 * - minimizes waste (total - requiredMm),
 * - then minimizes number of pieces.
 * @returns {{ waste: number, counts: Record<number, number> } | null}
 */
function getOptimalDownpipeCombination(requiredMm) {
  if (requiredMm <= 0) return { waste: 0, counts: { 3000: 0, 1500: 0 } };
  const lengths = DOWNPIPE_STOCK_LENGTHS_MM;
  const maxStock = Math.max(...lengths);
  let best = null;
  for (let total = requiredMm; total <= requiredMm + maxStock; total++) {
    const r = minPiecesAndCombination(total, lengths);
    if (!r) continue;
    const waste = total - requiredMm;
    if (!best || waste < best.waste || (waste === best.waste && r.count < best.count)) {
      best = { waste, count: r.count, counts: r.counts };
    }
  }
  return best ? { waste: best.waste, counts: best.counts } : null;
}

/**
 * Elements for quote: gutters use bin-packing per run (each run optimized separately, then counts aggregated); other measurable use length→quantity; rest use count.
 * Per-run optimization ensures we don't treat "Run A 2.9m + Run B 2.9m" as one 5.8m span; each run gets its own stock (max single length 5m, cut from one end).
 * @returns {{ assetId: string, quantity: number, incomplete?: boolean }[]}
 */
function getElementsForQuote() {
  const result = []; // { assetId, quantity, incomplete?, length_mm? }[]
  const gutterCountsByProfileAndLength = {}; // profile -> { lengthMm -> qty }
  const gutterMeasuredMmByProfileAndLength = {}; // profile -> { lengthMm -> total measured mm } for bracket/screw
  const gutterIncompleteByProfileAndLength = {}; // profile -> { lengthMm -> true } when any run had no length entered
  const downpipeCountsBySizeAndLength = {}; // size -> { lengthMm -> qty }
  const downpipeMeasuredMmBySizeAndLength = {}; // size -> { lengthMm -> total measured mm } for clips
  const downpipeIncompleteBySizeAndLength = {}; // size -> { lengthMm -> true }
  const otherMeasurableByAssetId = {}; // assetId -> { length, count } (droppers, etc.)
  const nonMeasurableByAssetId = {};  // assetId -> count

  state.elements.forEach((el) => {
    if (el.assetId == null || el.assetId === '') return;
    const measurable = isMeasurableElement(el.assetId);
    const hasLength = measurable && el.measuredLength != null && el.measuredLength > 0;
    const gutterMatch = GUTTER_PATTERN.exec(el.assetId.trim());

    if (gutterMatch) {
      const profile = gutterMatch[1].toUpperCase();
      const requiredMm = hasLength ? el.measuredLength : getStandardLengthMm(el.assetId);
      const opt = getOptimalGutterCombination(requiredMm);
      if (opt) {
        if (!gutterCountsByProfileAndLength[profile]) gutterCountsByProfileAndLength[profile] = {};
        if (!gutterMeasuredMmByProfileAndLength[profile]) gutterMeasuredMmByProfileAndLength[profile] = {};
        if (!gutterIncompleteByProfileAndLength[profile]) gutterIncompleteByProfileAndLength[profile] = {};
        Object.entries(opt.counts).forEach(([lengthMm, qty]) => {
          if (qty <= 0) return;
          const L = Number(lengthMm);
          gutterCountsByProfileAndLength[profile][L] = (gutterCountsByProfileAndLength[profile][L] || 0) + qty;
          gutterMeasuredMmByProfileAndLength[profile][L] = (gutterMeasuredMmByProfileAndLength[profile][L] || 0) + requiredMm;
          if (!hasLength) gutterIncompleteByProfileAndLength[profile][L] = true;
        });
      }
      return;
    }
    if (isDownpipeElement(el.assetId)) {
      const size = getDownpipeSizeFromAssetId(el.assetId);
      if (!size) return;
      const requiredMm = hasLength ? el.measuredLength : getStandardLengthMm(el.assetId);
      const opt = getOptimalDownpipeCombination(requiredMm);
      if (opt) {
        if (!downpipeCountsBySizeAndLength[size]) downpipeCountsBySizeAndLength[size] = {};
        if (!downpipeMeasuredMmBySizeAndLength[size]) downpipeMeasuredMmBySizeAndLength[size] = {};
        if (!downpipeIncompleteBySizeAndLength[size]) downpipeIncompleteBySizeAndLength[size] = {};
        Object.entries(opt.counts).forEach(([lengthMm, qty]) => {
          if (qty <= 0) return;
          const L = Number(lengthMm);
          downpipeCountsBySizeAndLength[size][L] = (downpipeCountsBySizeAndLength[size][L] || 0) + qty;
          downpipeMeasuredMmBySizeAndLength[size][L] = (downpipeMeasuredMmBySizeAndLength[size][L] || 0) + requiredMm;
          if (!hasLength) downpipeIncompleteBySizeAndLength[size][L] = true;
        });
      }
      return;
    }
    if (measurable && hasLength) {
      otherMeasurableByAssetId[el.assetId] = otherMeasurableByAssetId[el.assetId] || { length: 0, count: 0 };
      otherMeasurableByAssetId[el.assetId].length += el.measuredLength;
    } else if (measurable) {
      otherMeasurableByAssetId[el.assetId] = otherMeasurableByAssetId[el.assetId] || { length: 0, count: 0 };
      otherMeasurableByAssetId[el.assetId].count += 1;
    } else {
      nonMeasurableByAssetId[el.assetId] = (nonMeasurableByAssetId[el.assetId] || 0) + 1;
    }
  });

  // Gutter: emit aggregated counts; send length_mm (total measured) so bracket/screw use manual lengths
  Object.entries(gutterCountsByProfileAndLength).forEach(([profile, byLength]) => {
    const incompleteByLength = gutterIncompleteByProfileAndLength[profile] || {};
    const measuredByLength = gutterMeasuredMmByProfileAndLength[profile] || {};
    Object.entries(byLength).forEach(([lengthMm, qty]) => {
      if (qty <= 0) return;
      const totalMeasuredMm = measuredByLength[lengthMm];
      result.push({
        assetId: gutterProductIdForLength(profile, Number(lengthMm)),
        quantity: qty,
        incomplete: !!incompleteByLength[lengthMm],
        length_mm: totalMeasuredMm != null && totalMeasuredMm > 0 ? totalMeasuredMm : undefined,
      });
    });
  });

  // Downpipe: emit bin-packed counts; send length_mm on first element per size for clip calc
  Object.entries(downpipeCountsBySizeAndLength).forEach(([size, byLength]) => {
    const incompleteByLength = downpipeIncompleteBySizeAndLength[size] || {};
    const measuredByLength = downpipeMeasuredMmBySizeAndLength[size] || {};
    const sortedLengths = Object.keys(byLength).map(Number).sort((a, b) => b - a);
    let first = true;
    sortedLengths.forEach((lengthMm) => {
      const qty = byLength[lengthMm];
      if (qty <= 0) return;
      const totalMeasuredMm = measuredByLength[lengthMm];
      const item = {
        assetId: downpipeProductIdForLength(size, lengthMm),
        quantity: qty,
        incomplete: !!incompleteByLength[lengthMm],
        length_mm: first && totalMeasuredMm != null && totalMeasuredMm > 0 ? totalMeasuredMm : undefined,
      };
      if (first) first = false;
      result.push(item);
    });
  });

  // Other measurable (droppers, DPJ-* etc): length-based or count; send length_mm for backend (clips/screws).
  Object.entries(otherMeasurableByAssetId).forEach(([assetId, v]) => {
    const standardMm = getStandardLengthMm(assetId);
    const qty = v.length > 0
      ? Math.ceil(v.length / standardMm)
      : v.count;
    if (qty > 0) {
      result.push({
        assetId,
        quantity: qty,
        incomplete: v.length === 0,
        length_mm: v.length > 0 ? v.length : undefined,
      });
    }
  });

  // Non-measurable: count (no length required)
  Object.entries(nonMeasurableByAssetId).forEach(([assetId, count]) => {
    if (count > 0) result.push({ assetId, quantity: count });
  });

  return result;
}

function cloneStateForUndo() {
  return {
    elements: state.elements.map((el) => ({
      id: el.id,
      assetId: el.assetId,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation || 0,
      zIndex: el.zIndex,
      color: el.color || null,
      baseScale: el.baseScale ?? 1,
      locked: !!el.locked,
      flipX: !!el.flipX,
      flipY: !!el.flipY,
      sequenceId: el.sequenceId != null ? el.sequenceId : undefined,
      measuredLength: el.measuredLength != null ? el.measuredLength : 0,
    })),
    blueprintTransform: state.blueprintTransform ? { ...state.blueprintTransform, locked: !!state.blueprintTransform.locked } : null,
    hasBlueprint: !!state.blueprintImage,
    blueprintImageRef: state.blueprintImage || null, // reference so undo can restore previous blueprint (Task 14.3)
    groups: state.groups.map((g) => ({ id: g.id, elementIds: g.elementIds.slice() })),
  };
}

async function restoreStateFromSnapshot(snapshot) {
  state.elements = await Promise.all(
    snapshot.elements.map(async (el) => {
      const img = await loadDiagramImage(getDiagramUrl(el.assetId));
      return {
        ...el,
        image: img,
        originalImage: img,
        tintedCanvas: null,
        tintedCanvasColor: null,
      };
    })
  );
  if (!snapshot.hasBlueprint) {
    state.blueprintImage = null;
    state.blueprintTransform = null;
    state.blueprintImageSourceUrl = null;
  } else {
    if (snapshot.blueprintImageRef) state.blueprintImage = snapshot.blueprintImageRef;
    if (snapshot.blueprintTransform) state.blueprintTransform = { ...snapshot.blueprintTransform };
    state.blueprintImageSourceUrl = null; // local snapshot has no URL
  }
  state.groups = (snapshot.groups || []).map((g) => ({ id: g.id, elementIds: g.elementIds.slice() }));
  setSelection([]);
  state.selectedBlueprint = false;
}

function pushUndoSnapshot() {
  undoHistory.push(cloneStateForUndo());
  if (undoHistory.length > MAX_UNDO_HISTORY) undoHistory.shift();
  redoHistory.length = 0;
  updateUndoRedoButtons?.();
}

async function undo() {
  if (undoHistory.length === 0) return;
  state.mode = null;
  state.resizeHandle = null;
  state.snapshotAtActionStart = null;
  redoHistory.push(cloneStateForUndo());
  if (redoHistory.length > MAX_UNDO_HISTORY) redoHistory.shift();
  const snapshot = undoHistory.pop();
  await restoreStateFromSnapshot(snapshot);
  updatePlaceholderVisibility();
  renderMeasurementDeck();
  draw();
  updateUndoRedoButtons?.();
}

async function redo() {
  if (redoHistory.length === 0) return;
  state.mode = null;
  state.resizeHandle = null;
  state.snapshotAtActionStart = null;
  const snapshot = redoHistory.pop();
  await restoreStateFromSnapshot(snapshot);
  updatePlaceholderVisibility();
  renderMeasurementDeck();
  draw();
  updateUndoRedoButtons?.();
}

/** Capture full state (canvas, view, project name) before loading a saved diagram. */
function capturePreLoadSnapshot() {
  const base = cloneStateForUndo();
  return {
    ...base,
    baseScale: state.baseScale,
    baseOffsetX: state.baseOffsetX,
    baseOffsetY: state.baseOffsetY,
    viewZoom: state.viewZoom,
    viewPanX: state.viewPanX,
    viewPanY: state.viewPanY,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    projectName: state.projectName,
    nextSequenceId: state.nextSequenceId,
  };
}

/** Restore state from pre-load snapshot (go back to previous). */
async function restoreFromPreLoadSnapshot(snapshot) {
  if (!snapshot) return;
  state.mode = null;
  state.resizeHandle = null;
  state.snapshotAtActionStart = null;
  await restoreStateFromSnapshot(snapshot);
  state.baseScale = snapshot.baseScale;
  state.baseOffsetX = snapshot.baseOffsetX;
  state.baseOffsetY = snapshot.baseOffsetY;
  state.viewZoom = snapshot.viewZoom;
  state.viewPanX = snapshot.viewPanX;
  state.viewPanY = snapshot.viewPanY;
  state.offsetX = snapshot.offsetX;
  state.offsetY = snapshot.offsetY;
  state.projectName = snapshot.projectName ?? '';
  state.nextSequenceId = snapshot.nextSequenceId ?? 1;
  updateToolbarBreadcrumbs(snapshot.projectName ?? '');
  updatePlaceholderVisibility();
  renderMeasurementDeck();
  draw();
}

function rotatedRectBbox(x, y, w, h, rotationDeg) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const corners = [
    [x - cx, y - cy],
    [x + w - cx, y - cy],
    [x + w - cx, y + h - cy],
    [x - cx, y + h - cy],
  ].map(([px, py]) => [cx + px * cos - py * sin, cy + px * sin + py * cos]);
  let minX = corners[0][0];
  let maxX = corners[0][0];
  let minY = corners[0][1];
  let maxY = corners[0][1];
  corners.forEach(([px, py]) => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clampViewToPadding(state, baseOffsetX, baseOffsetY, minX, minY, bboxW, bboxH, scale, viewW, viewH) {
  const pad = VIEW_PAD;
  const minOX = -pad - minX * scale;
  const maxOX = viewW + pad - (minX + bboxW) * scale;
  const minOY = -pad - minY * scale;
  const maxOY = viewH + pad - (minY + bboxH) * scale;
  state.offsetX = Math.max(minOX, Math.min(maxOX, state.offsetX));
  state.offsetY = Math.max(minOY, Math.min(maxOY, state.offsetY));
  state.viewPanX = state.offsetX - baseOffsetX;
  state.viewPanY = state.offsetY - baseOffsetY;
}

function pointInRotatedRect(px, py, x, y, w, h, rotationDeg) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return rx >= -w / 2 && rx <= w / 2 && ry >= -h / 2 && ry <= h / 2;
}

function getSnapGuides(movingEl) {
  const vertical = [];
  const horizontal = [];
  state.elements.forEach((el) => {
    if (el.id === movingEl.id) return;
    vertical.push(el.x, el.x + el.width / 2, el.x + el.width);
    horizontal.push(el.y, el.y + el.height / 2, el.y + el.height);
  });
  // Elements snap only to other elements, not to blueprint edges
  return { vertical, horizontal };
}

function getActiveGuidesForPosition(x, y, w, h) {
  const vertical = [];
  const horizontal = [];
  state.elements.forEach((el) => {
    if (state.dragMoveIds.length && state.dragMoveIds.includes(el.id)) return;
    vertical.push(el.x, el.x + el.width / 2, el.x + el.width);
    horizontal.push(el.y, el.y + el.height / 2, el.y + el.height);
  });
  // Elements snap only to other elements, not to blueprint edges
  const active = [];
  const left = x;
  const centerX = x + w / 2;
  const right = x + w;
  const top = y;
  const centerY = y + h / 2;
  const bottom = y + h;
  for (const pos of vertical) {
    if (Math.abs(left - pos) <= SNAP_THRESHOLD || Math.abs(centerX - pos) <= SNAP_THRESHOLD || Math.abs(right - pos) <= SNAP_THRESHOLD) {
      active.push({ axis: 'vertical', pos });
      break;
    }
  }
  for (const pos of horizontal) {
    if (Math.abs(top - pos) <= SNAP_THRESHOLD || Math.abs(centerY - pos) <= SNAP_THRESHOLD || Math.abs(bottom - pos) <= SNAP_THRESHOLD) {
      active.push({ axis: 'horizontal', pos });
      break;
    }
  }
  return active;
}

function applySnapAndReturnGuides(el) {
  const guides = getSnapGuides(el);
  const active = [];
  const left = el.x;
  const centerX = el.x + el.width / 2;
  const right = el.x + el.width;
  const top = el.y;
  const centerY = el.y + el.height / 2;
  const bottom = el.y + el.height;

  for (const pos of guides.vertical) {
    if (Math.abs(left - pos) <= SNAP_THRESHOLD) {
      el.x = pos;
      active.push({ axis: 'vertical', pos });
      break;
    }
    if (Math.abs(centerX - pos) <= SNAP_THRESHOLD) {
      el.x = pos - el.width / 2;
      active.push({ axis: 'vertical', pos });
      break;
    }
    if (Math.abs(right - pos) <= SNAP_THRESHOLD) {
      el.x = pos - el.width;
      active.push({ axis: 'vertical', pos });
      break;
    }
  }
  for (const pos of guides.horizontal) {
    if (Math.abs(top - pos) <= SNAP_THRESHOLD) {
      el.y = pos;
      active.push({ axis: 'horizontal', pos });
      break;
    }
    if (Math.abs(centerY - pos) <= SNAP_THRESHOLD) {
      el.y = pos - el.height / 2;
      active.push({ axis: 'horizontal', pos });
      break;
    }
    if (Math.abs(bottom - pos) <= SNAP_THRESHOLD) {
      el.y = pos - el.height;
      active.push({ axis: 'horizontal', pos });
      break;
    }
  }
  return active;
}

function applyRotationSnap(degrees, shiftKey) {
  if (shiftKey) return Math.round(degrees / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG;
  const cardinals = [0, 90, 180, 270];
  let d = ((degrees % 360) + 360) % 360;
  for (const c of cardinals) {
    let diff = Math.abs(d - c);
    if (diff > 180) diff = 360 - diff;
    if (diff <= ROTATION_MAGNETIC_DEG) return c;
  }
  return degrees;
}

/** True if the element is a gutter (pattern GUT-*-MAR-*M or fallback id "gutter"). */
function isGutterElement(element) {
  if (!element || !element.assetId) return false;
  const id = String(element.assetId).trim();
  return GUTTER_PATTERN.test(id) || id.toLowerCase() === 'gutter';
}

/** Normalize angle to [-180, 180] so we can compare with the forbidden band. */
function normalizeAngleDeg(deg) {
  if (deg == null || !Number.isFinite(deg)) return 0;
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * For gutter elements, clamp rotation so it never lies in the forbidden band (config: 60°–80°).
 * Hysteresis: snap to nearest boundary using the element's current rotation so it doesn't jitter at the midpoint.
 * Uses normalized angles so the constraint works whether rotation is stored in [-180,180] or [0,360].
 * @returns {{ degrees: number, constrained: boolean }} Result and whether the angle was clamped this call.
 */
function constrainGutterRotation(degrees, element) {
  const cfg = ROTATION_CONSTRAINTS.gutter;
  if (!cfg || !isGutterElement(element)) return { degrees, constrained: false };
  const min = cfg.forbiddenMin;
  const max = cfg.forbiddenMax;
  const degNorm = normalizeAngleDeg(degrees);
  const inBand = degNorm > min && degNorm < max;
  if (!inBand) return { degrees, constrained: false };
  const prevNorm = normalizeAngleDeg(element.rotation != null ? element.rotation : 0);
  const mid = (min + max) / 2;
  const snapped = prevNorm < mid ? min : max;
  return { degrees: snapped, constrained: true };
}

const MIN_RESIZE_DIM = 20;

/**
 * Convert canvas-space point to element local space (inverse rotation around element center).
 * x_local = (x - cx)*cos(θ) + (y - cy)*sin(θ), y_local = -(x - cx)*sin(θ) + (y - cy)*cos(θ)
 */
function canvasToLocal(canvasX, canvasY, cx, cy, rotationDeg) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = canvasX - cx;
  const dy = canvasY - cy;
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

function applyResizeWith(canvasPos, altKey) {
  const el = state.elements.find((x) => x.id === state.selectedId);
  if (!el || !state.resizeHandle || !canvasPos) return;

  const handle = state.resizeHandle;
  const rotationDeg = el.rotation || 0;
  const cos = Math.cos((rotationDeg * Math.PI) / 180);
  const sin = Math.sin((rotationDeg * Math.PI) / 180);

  const prevW = el.width;
  const prevH = el.height;
  const cx = el.x + prevW / 2;
  const cy = el.y + prevH / 2;

  // 1. Convert mouse position to element's local space (same convention as canvasToLocal/pointInRotatedRect)
  const local = canvasToLocal(canvasPos.x, canvasPos.y, cx, cy, rotationDeg);
  const localMouseX = local.x;
  const localMouseY = local.y;

  // 2. Calculate New Dimensions based on distance from Opposite Edge
  let newW = prevW;
  let newH = prevH;

  // Horizontal Resize
  if (handle.includes('e')) {
    // East: Dist from Left Edge (-W/2) to Mouse
    newW = localMouseX - (-prevW / 2);
  } else if (handle.includes('w')) {
    // West: Dist from Right Edge (+W/2) to Mouse (Result is positive width)
    newW = (prevW / 2) - localMouseX;
  }

  // Vertical Resize
  if (handle.includes('s')) {
    // South: Dist from Top Edge (-H/2) to Mouse
    newH = localMouseY - (-prevH / 2);
  } else if (handle.includes('n')) {
    // North: Dist from Bottom Edge (+H/2) to Mouse
    newH = (prevH / 2) - localMouseY;
  }

  const isLinear = isMeasurableElement(el.assetId);

  // 3. Apply Constraints (Min Size & Aspect Ratio)
  if (newW < MIN_RESIZE_DIM) newW = MIN_RESIZE_DIM;
  if (newH < MIN_RESIZE_DIM) newH = MIN_RESIZE_DIM;

  if (isLinear) {
    // Linear items (gutters, downpipes): unlock aspect. E/W = length only; N/S = thickness only; corners = free.
    if (handle === 'e' || handle === 'w') newH = prevH;
    else if (handle === 'n' || handle === 's') newW = prevW;
    // Corner (ne, nw, se, sw): newW and newH already from mouse; no aspect lock.
  } else {
    // Non-linear: lock aspect unless Alt (warp).
    if (!altKey) {
      const ratio = prevW / prevH;
      if (handle.length === 2) { // Corner drag
        const wBasedH = newW / ratio;
        if (wBasedH > newH) newH = wBasedH;
        else newW = newH * ratio;
      } else { // Side drag
        if (handle === 'e' || handle === 'w') newH = newW / ratio;
        if (handle === 'n' || handle === 's') newW = newH * ratio;
      }
    }
  }

  // Re-verify Min Dimensions
  if (isLinear) {
    if (newW < MIN_RESIZE_DIM) newW = MIN_RESIZE_DIM;
    if (newH < MIN_RESIZE_DIM) newH = MIN_RESIZE_DIM;
  } else {
    if (newW < MIN_RESIZE_DIM) { newW = MIN_RESIZE_DIM; newH = newW / (prevW / prevH); }
    if (newH < MIN_RESIZE_DIM) { newH = MIN_RESIZE_DIM; newW = newH * (prevW / prevH); }
  }

  // 4. Calculate Center Shift (Forward Rotation)
  // Determine shift in local space
  const deltaW = newW - prevW;
  const deltaH = newH - prevH;

  let shiftX = 0;
  let shiftY = 0;

  // If growing East, center moves Right (+). If West, center moves Left (-).
  if (handle.includes('e')) shiftX = deltaW / 2;
  else if (handle.includes('w')) shiftX = -deltaW / 2;

  if (handle.includes('s')) shiftY = deltaH / 2;
  else if (handle.includes('n')) shiftY = -deltaH / 2;

  // Rotate shift vector back to World Space (Forward Rotation)
  // x' = x*cos - y*sin, y' = x*sin + y*cos
  const shiftWorldX = shiftX * cos - shiftY * sin;
  const shiftWorldY = shiftX * sin + shiftY * cos;

  // 5. Update Element
  el.x = cx + shiftWorldX - newW / 2;
  el.y = cy + shiftWorldY - newH / 2;
  el.width = newW;
  el.height = newH;

  // Invalidate tinted canvas
  if (el.tintedCanvas && (el.tintedCanvasWidth !== newW || el.tintedCanvasHeight !== newH)) {
    el.tintedCanvas = null;
    el.tintedCanvasColor = null;
  }
}

function draw() {
  const { canvas, ctx, blueprintImage, elements } = state;
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = state.canvasWidth / dpr;
  const h = state.canvasHeight / dpr;
  ctx.clearRect(0, 0, w, h);

  let scale = state.scale || 1;
  let offsetX = state.offsetX ?? 0;
  let offsetY = state.offsetY ?? 0;

  let baseScale = state.scale;
  let baseOffsetX = state.offsetX;
  let baseOffsetY = state.offsetY;
  let hasContent = false;

  const inDebounceWindow = state.bboxRecalcDeferredUntil != null && Date.now() < state.bboxRecalcDeferredUntil;
  const fitFeedbackActive = isMobileFitZoomLevel()
    && (Math.abs(state.fitPanFeedbackX) > MOBILE_FIT_PAN_BOUNCE_STOP_EPSILON
      || Math.abs(state.fitPanFeedbackY) > MOBILE_FIT_PAN_BOUNCE_STOP_EPSILON);
  const interactionActive = !!state.mode || inDebounceWindow;
  if (blueprintImage && state.blueprintTransform) {
    const bt = state.blueprintTransform;
    const img = blueprintImage;
    let bbox = rotatedRectBbox(bt.x, bt.y, bt.w, bt.h, bt.rotation || 0);
    let minX = bbox.x;
    let maxX = bbox.x + bbox.width;
    let minY = bbox.y;
    let maxY = bbox.y + bbox.height;
    elements.forEach((el) => {
      const eb = rotatedRectBbox(el.x, el.y, el.width, el.height, el.rotation || 0);
      if (eb.x < minX) minX = eb.x;
      if (eb.x + eb.width > maxX) maxX = eb.x + eb.width;
      if (eb.y < minY) minY = eb.y;
      if (eb.y + eb.height > maxY) maxY = eb.y + eb.height;
    });
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const pad = 20;
    hasContent = true;
    if (!interactionActive) {
      baseScale = Math.min((w - pad * 2) / bboxW, (h - pad * 2) / bboxH);
      baseOffsetX = (w - bboxW * baseScale) / 2 - minX * baseScale;
      baseOffsetY = (h - bboxH * baseScale) / 2 - minY * baseScale;
      state.baseScale = baseScale;
      state.baseOffsetX = baseOffsetX;
      state.baseOffsetY = baseOffsetY;
    } else {
      baseScale = state.baseScale;
      baseOffsetX = state.baseOffsetX;
      baseOffsetY = state.baseOffsetY;
    }
    if (isMobileFitZoomLevel()) {
      state.viewZoom = 1;
      state.viewPanX = 0;
      state.viewPanY = 0;
    }
    state.scale = baseScale * state.viewZoom;
    scale = state.scale;
    state.offsetX = baseOffsetX + state.viewPanX + (isMobileFitZoomLevel() ? state.fitPanFeedbackX : 0);
    state.offsetY = baseOffsetY + state.viewPanY + (isMobileFitZoomLevel() ? state.fitPanFeedbackY : 0);
    if (!interactionActive && !fitFeedbackActive) {
      clampViewToPadding(state, baseOffsetX, baseOffsetY, minX, minY, bboxW, bboxH, scale, w, h);
    }
    offsetX = state.offsetX;
    offsetY = state.offsetY;
  } else if (elements.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    elements.forEach((el) => {
      const eb = rotatedRectBbox(el.x, el.y, el.width, el.height, el.rotation || 0);
      if (eb.x < minX) minX = eb.x;
      if (eb.x + eb.width > maxX) maxX = eb.x + eb.width;
      if (eb.y < minY) minY = eb.y;
      if (eb.y + eb.height > maxY) maxY = eb.y + eb.height;
    });
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const pad = 20;
    hasContent = true;
    if (!interactionActive) {
      baseScale = Math.min((w - pad * 2) / bboxW, (h - pad * 2) / bboxH);
      baseOffsetX = (w - bboxW * baseScale) / 2 - minX * baseScale;
      baseOffsetY = (h - bboxH * baseScale) / 2 - minY * baseScale;
      state.baseScale = baseScale;
      state.baseOffsetX = baseOffsetX;
      state.baseOffsetY = baseOffsetY;
    } else {
      baseScale = state.baseScale;
      baseOffsetX = state.baseOffsetX;
      baseOffsetY = state.baseOffsetY;
    }
    if (isMobileFitZoomLevel()) {
      state.viewZoom = 1;
      state.viewPanX = 0;
      state.viewPanY = 0;
    }
    state.scale = baseScale * state.viewZoom;
    scale = state.scale;
    state.offsetX = baseOffsetX + state.viewPanX + (isMobileFitZoomLevel() ? state.fitPanFeedbackX : 0);
    state.offsetY = baseOffsetY + state.viewPanY + (isMobileFitZoomLevel() ? state.fitPanFeedbackY : 0);
    if (!interactionActive && !fitFeedbackActive) {
      clampViewToPadding(state, baseOffsetX, baseOffsetY, minX, minY, bboxW, bboxH, scale, w, h);
    }
    offsetX = state.offsetX;
    offsetY = state.offsetY;
  }

  if (!hasContent) {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    state.fitPanFeedbackX = 0;
    state.fitPanFeedbackY = 0;
    scale = 1;
    offsetX = 0;
    offsetY = 0;
  }

  if (state.mode === 'move' && state.previewDragX != null && state.selectedId) {
    const primary = state.elements.find((x) => x.id === state.selectedId);
    if (primary) state.activeGuides = getActiveGuidesForPosition(state.previewDragX, state.previewDragY, primary.width, primary.height);
  } else if (state.mode !== 'move') {
    state.activeGuides = [];
  }

  const ghost = state.mode === 'move' && state.selectedIds.length === 1 && state.dragGhostX != null && state.dragGhostY != null
    ? state.elements.find((e) => e.id === state.selectedId)
    : null;

  const snapPopScale = getSnapPopScale();

  // Visual layering: draw in zIndex order (ascending) so Marley parts render on top of blueprint unless moved behind
  const layers = [];
  if (blueprintImage && state.blueprintTransform) {
    const bt = state.blueprintTransform;
    layers.push({ zIndex: bt.zIndex != null ? bt.zIndex : BLUEPRINT_Z_INDEX, type: 'blueprint', bt, img: blueprintImage });
  }
  elements.forEach((el) => {
    layers.push({ zIndex: el.zIndex != null ? el.zIndex : 0, type: 'element', element: el });
  });
  
  // Diagnostic logging: track blueprint layer presence before sort
  const DEBUG_LAYER_SORT = window.__quoteAppDebugLayerSort || false;
  if (DEBUG_LAYER_SORT) {
    const blueprintBeforeSort = layers.find(l => l.type === 'blueprint');
    console.log('[draw] Layers before sort', {
      totalLayers: layers.length,
      hasBlueprint: !!blueprintBeforeSort,
      blueprintZIndex: blueprintBeforeSort?.zIndex,
      elementCount: layers.filter(l => l.type === 'element').length,
    });
  }
  
  layers.sort((a, b) => a.zIndex - b.zIndex);
  
  // Diagnostic logging: verify blueprint layer still present after sort
  if (DEBUG_LAYER_SORT) {
    const blueprintAfterSort = layers.find(l => l.type === 'blueprint');
    if (!blueprintAfterSort && blueprintImage && state.blueprintTransform) {
      console.error('[draw] CRITICAL: Blueprint layer disappeared from layers array after sort!', {
        hadBlueprintBefore: !!blueprintBeforeSort,
        blueprintImage: !!blueprintImage,
        blueprintTransform: !!state.blueprintTransform,
        layersAfterSort: layers.map(l => ({ type: l.type, zIndex: l.zIndex })),
      });
    }
  }

  layers.forEach((layer) => {
    if (layer.type === 'blueprint') {
      const { bt, img } = layer;
      const cx = offsetX + bt.x * scale + (bt.w * scale) / 2;
      const cy = offsetY + bt.y * scale + (bt.h * scale) / 2;
      ctx.save();
      // Blueprint opacity + dim when an element is selected (Element Mode cue)
      ctx.globalAlpha = (bt.opacity ?? 1) * (state.selectedId ? 0.7 : 1);
      ctx.translate(cx, cy);
      ctx.rotate(((bt.rotation || 0) * Math.PI) / 180);
      ctx.translate(-(bt.w * scale) / 2, -(bt.h * scale) / 2);
      ctx.drawImage(img, 0, 0, bt.w * scale, bt.h * scale);
      ctx.restore();
      return;
    }
    const el = layer.element;
    // Dim Marley elements when blueprint is selected (Background Edit Mode cue)
    const dimForBlueprintMode = state.selectedBlueprint;
    if (ghost && el.id === ghost.id) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      const gcx = offsetX + state.dragGhostX * scale + (ghost.width * scale) / 2;
      const gcy = offsetY + state.dragGhostY * scale + (ghost.height * scale) / 2;
      ctx.translate(gcx, gcy);
      ctx.rotate((ghost.rotation * Math.PI) / 180);
      ctx.scale(ghost.flipX ? -1 : 1, ghost.flipY ? -1 : 1);
      const ghostRenderImage = getElementRenderImage(ghost);
      if (ghostRenderImage) {
        const gw = ghost.width * scale;
        const gh = ghost.height * scale;
        const ghostTinted = ghost.color && ghost.tintedCanvas && ghostRenderImage === ghost.tintedCanvas;
        let prevQE, prevQQ;
        if (ghostTinted) {
          prevQE = ctx.imageSmoothingEnabled;
          prevQQ = ctx.imageSmoothingQuality;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }
        ctx.drawImage(ghostRenderImage, -gw / 2, -gh / 2, gw, gh);
        if (ghostTinted) {
          ctx.imageSmoothingEnabled = prevQE;
          ctx.imageSmoothingQuality = prevQQ;
        }
      }
      ctx.restore();
    }
    const pos = getElementDrawPosition(el);
    const cx = offsetX + pos.x * scale + (el.width * scale) / 2;
    const cy = offsetY + pos.y * scale + (el.height * scale) / 2;
    const pop = snapPopScale != null && state.snapPopElementIds.includes(el.id) ? snapPopScale : 1;
    ctx.save();
    if (dimForBlueprintMode) ctx.globalAlpha = 0.5;
    ctx.translate(cx, cy);
    if (pop !== 1) ctx.scale(pop, pop);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
    const renderImage = getElementRenderImage(el);
    if (renderImage) {
      const dw = el.width * scale;
      const dh = el.height * scale;
      const isTinted = el.color && el.tintedCanvas && renderImage === el.tintedCanvas;
      let prevSmoothingEnabled, prevSmoothingQuality;
      if (isTinted) {
        prevSmoothingEnabled = ctx.imageSmoothingEnabled;
        prevSmoothingQuality = ctx.imageSmoothingQuality;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      ctx.drawImage(renderImage, -dw / 2, -dh / 2, dw, dh);
      if (isTinted) {
        ctx.imageSmoothingEnabled = prevSmoothingEnabled;
        ctx.imageSmoothingQuality = prevSmoothingQuality;
      }
    }
    ctx.restore();
  });

  // Measurement badges (Digital Takeoff): above elements, below hover/selection; upright
  const BADGE_RADIUS = MEASUREMENT_BADGE_RADIUS;
  const BADGE_EMPTY_BG = '#c62828';   // red when no value
  const BADGE_FILLED_BG = '#2e7d32';  // green when value entered
  const BADGE_NUMBER_COLOR = '#fff';  // white number inside circle
  const BADGE_MEASURE_FILLED = '#2e7d32'; // green for measurement text when filled
  const BADGE_MEASURE_OFFSET = 4;     // gap between circle and measurement text
  const measurableForBadges = state.elements
    .filter((el) => el.sequenceId != null && el.sequenceId > 0)
    .sort((a, b) => (a.sequenceId || 0) - (b.sequenceId || 0));
  state.elements.forEach((el) => {
    if (el.sequenceId == null) return;
    const hasLength = el.measuredLength != null && el.measuredLength > 0;
    const displayLabel = getMeasurementDisplayLabel(el, measurableForBadges);
    const pos = getElementDrawPosition(el);
    const badgeCx = offsetX + pos.x * scale + (el.width * scale) / 2;
    const badgeCy = offsetY + pos.y * scale + (el.height * scale) / 2;
    ctx.save();
    ctx.translate(badgeCx, badgeCy);
    ctx.beginPath();
    ctx.arc(0, 0, BADGE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = hasLength ? BADGE_FILLED_BG : BADGE_EMPTY_BG;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = BADGE_NUMBER_COLOR;
    ctx.fillText(displayLabel, 0, 0);
    if (hasLength) {
      const measureText = formatMetres(el.measuredLength);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = BADGE_MEASURE_FILLED;
      ctx.textBaseline = 'top';
      ctx.fillText(measureText, 0, BADGE_RADIUS + BADGE_MEASURE_OFFSET);
    }
    ctx.restore();
  });

  elements.forEach((el) => {
    if (el.id !== state.hoveredId || el.id === state.selectedId) return;
    ctx.save();
    const hx = offsetX + el.x * scale;
    const hy = offsetY + el.y * scale;
    const hw = el.width * scale;
    const hh = el.height * scale;
    const hcx = hx + hw / 2;
    const hcy = hy + hh / 2;
    ctx.translate(hcx, hcy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-hw / 2, -hh / 2);
    ctx.strokeStyle = 'rgba(24, 160, 251, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, hw, hh);
    ctx.restore();
  });

  const selectedElements = state.selectedIds.map((id) => elements.find((e) => e.id === id)).filter(Boolean);
  if (selectedElements.length > 1) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selectedElements.forEach((el) => {
      const pos = getElementDrawPosition(el);
      const b = rotatedRectBbox(pos.x, pos.y, el.width, el.height, el.rotation || 0);
      if (b.x < minX) minX = b.x;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y < minY) minY = b.y;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    });
    const sx = offsetX + minX * scale;
    const sy = offsetY + minY * scale;
    const sw = (maxX - minX) * scale;
    const sh = (maxY - minY) * scale;
    ctx.save();
    ctx.strokeStyle = HANDLE_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);
    ctx.restore();
  }
  const selected = selectedElements.length === 1 ? selectedElements[0] : elements.find((e) => e.id === state.selectedId);
  if (selected && selectedElements.length === 1) {
    const pos = getElementDrawPosition(selected);
    const sx = offsetX + pos.x * scale;
    const sy = offsetY + pos.y * scale;
    const sw = selected.width * scale;
    const sh = selected.height * scale;
    
    // Handle padding: 10px Safe Zone so handles don't obscure part edges
    const padding = CANVAS_PORTER_VISUAL_PADDING * scale;
    const paddedSx = sx - padding;
    const paddedSy = sy - padding;
    const paddedSw = sw + padding * 2;
    const paddedSh = sh + padding * 2;
    const paddedCx = paddedSx + paddedSw / 2;
    const paddedCy = paddedSy + paddedSh / 2;

    ctx.save();
    ctx.translate(paddedCx, paddedCy);
    ctx.rotate((selected.rotation * Math.PI) / 180);
    ctx.translate(-paddedCx, -paddedCy);

    // Dynamic stroke: keep bounding box at constant 1.5px on screen regardless of zoom
    const rect = getCanvasRect();
    const dpr = window.devicePixelRatio || 1;
    const logicalW = state.canvasWidth / dpr;
    const logicalH = state.canvasHeight / dpr;
    const strokeScale = rect && rect.width && rect.height ? Math.min(logicalW / rect.width, logicalH / rect.height) : 1;
    const strokeLineWidth = SELECTION_BOX_STROKE_SCREEN_PX * strokeScale;

    ctx.strokeStyle = HANDLE_BORDER_COLOR;
    ctx.lineWidth = strokeLineWidth;
    if (selected.locked) {
      // Locked: solid selection border only, no handles
      ctx.setLineDash([]);
      ctx.strokeRect(paddedSx, paddedSy, paddedSw, paddedSh);
      ctx.restore();
    } else {
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(paddedSx, paddedSy, paddedSw, paddedSh);
      ctx.setLineDash([]);

    // Corner handles (squares): circles. Side handles (n/s/e/w): thin pills for "Canva" look.
    const handles = [
      { id: 'nw', x: paddedSx, y: paddedSy, pill: null },
      { id: 'n', x: paddedSx + paddedSw / 2, y: paddedSy, pill: 'horizontal' },
      { id: 'ne', x: paddedSx + paddedSw, y: paddedSy, pill: null },
      { id: 'e', x: paddedSx + paddedSw, y: paddedSy + paddedSh / 2, pill: 'vertical' },
      { id: 'se', x: paddedSx + paddedSw, y: paddedSy + paddedSh, pill: null },
      { id: 's', x: paddedSx + paddedSw / 2, y: paddedSy + paddedSh, pill: 'horizontal' },
      { id: 'sw', x: paddedSx, y: paddedSy + paddedSh, pill: null },
      { id: 'w', x: paddedSx, y: paddedSy + paddedSh / 2, pill: 'vertical' },
    ];
    const handleStrokeWidth = Math.max(0.5, strokeLineWidth);
    handles.forEach((h) => {
      const isHovered = state.hoveredHandleId === h.id;
      ctx.save();
      if (h.pill === 'horizontal') {
        const w = (PILL_HALF_LENGTH * 2) * (isHovered ? HANDLE_HOVER_SCALE : 1);
        const ht = PILL_HALF_THICKNESS * 2;
        const x = h.x - w / 2;
        const y = h.y - ht / 2;
        drawPillRect(ctx, x, y, w, ht);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.strokeStyle = HANDLE_BORDER_COLOR;
        ctx.lineWidth = handleStrokeWidth;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (h.pill === 'vertical') {
        const ht = (PILL_HALF_LENGTH * 2) * (isHovered ? HANDLE_HOVER_SCALE : 1);
        const w = PILL_HALF_THICKNESS * 2;
        const x = h.x - w / 2;
        const y = h.y - ht / 2;
        drawPillRect(ctx, x, y, w, ht);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.strokeStyle = HANDLE_BORDER_COLOR;
        ctx.lineWidth = handleStrokeWidth;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        const r = HANDLE_RADIUS * (isHovered ? HANDLE_HOVER_SCALE : 1);
        ctx.beginPath();
        ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.strokeStyle = HANDLE_BORDER_COLOR;
        ctx.lineWidth = handleStrokeWidth;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    });

    // Rotation "tail": 20px stem above top-center (lighter alpha = guide, not structural), then handle
    const rotY = paddedSy - ROTATE_STEM_PX;
    ctx.strokeStyle = `rgba(24, 160, 251, ${ROTATE_STEM_ALPHA})`;
    ctx.lineWidth = handleStrokeWidth;
    ctx.beginPath();
    ctx.moveTo(paddedCx, paddedSy);
    ctx.lineTo(paddedCx, rotY);
    ctx.stroke();
    const rotR = state.hoveredHandleId === 'rotate' ? 6 * HANDLE_HOVER_SCALE : 6;
    ctx.beginPath();
    ctx.arc(paddedCx, rotY, rotR, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = HANDLE_BORDER_COLOR;
    ctx.lineWidth = Math.min(1, handleStrokeWidth); // subtle 1px border so handle "pops" off blueprint
    ctx.stroke();
    }
    ctx.restore();
  }

  if (state.marqueeStart && state.marqueeCurrent) {
    const mMinX = Math.min(state.marqueeStart.x, state.marqueeCurrent.x);
    const mMaxX = Math.max(state.marqueeStart.x, state.marqueeCurrent.x);
    const mMinY = Math.min(state.marqueeStart.y, state.marqueeCurrent.y);
    const mMaxY = Math.max(state.marqueeStart.y, state.marqueeCurrent.y);
    const sx = offsetX + mMinX * scale;
    const sy = offsetY + mMinY * scale;
    const sw = (mMaxX - mMinX) * scale;
    const sh = (mMaxY - mMinY) * scale;
    ctx.save();
    ctx.fillStyle = MARQUEE_FILL;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = HANDLE_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.restore();
  }

  if (state.activeGuides && state.activeGuides.length > 0) {
    ctx.save();
    ctx.strokeStyle = SMART_GUIDE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    state.activeGuides.forEach((g) => {
      ctx.beginPath();
      if (g.axis === 'vertical') {
        const x = offsetX + g.pos * scale;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      } else {
        const y = offsetY + g.pos * scale;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  if (state.dragPreviewImage && state.dragPreviewCanvasPos) {
    const { w: gw, h: gh } = elementSizeFromImage(state.dragPreviewImage, getAddMaxDimensionWorld());
    const gx = offsetX + (state.dragPreviewCanvasPos.x - gw / 2) * scale;
    const gy = offsetY + (state.dragPreviewCanvasPos.y - gh / 2) * scale;
    const gsw = gw * scale;
    const gsh = gh * scale;
    ctx.save();
    ctx.globalAlpha = DROP_GHOST_OPACITY;
    ctx.drawImage(state.dragPreviewImage, gx, gy, gsw, gsh);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  if (state.selectedBlueprint && state.blueprintTransform) {
    const bt = state.blueprintTransform;
    const sx = offsetX + bt.x * scale;
    const sy = offsetY + bt.y * scale;
    const sw = bt.w * scale;
    const sh = bt.h * scale;
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((bt.rotation || 0) * Math.PI) / 180);
    ctx.translate(-sw / 2, -sh / 2);
    ctx.strokeStyle = HANDLE_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(0, 0, sw, sh);
    ctx.setLineDash([]);
    if (!bt.locked) {
      const hs = HANDLE_SIZE / 2;
      [[0, 0], [sw, 0], [0, sh], [sw, sh]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = HANDLE_BORDER_COLOR;
        ctx.fillRect(hx - hs, hy - hs, HANDLE_SIZE, HANDLE_SIZE);
        ctx.strokeRect(hx - hs, hy - hs, HANDLE_SIZE, HANDLE_SIZE);
      });
      ctx.beginPath();
      ctx.arc(sw / 2, -ROTATE_HANDLE_OFFSET, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Floating toolbar: position above selection (single element or blueprint), centered
  const rect = getCanvasRect();
  const toolbarEl = document.getElementById('floatingToolbar');
  const hasSingleSelection = (state.selectedId && selectedElements.length === 1) || state.selectedBlueprint;
  if (toolbarEl) {
    if (hasSingleSelection && rect) {
      const wasHidden = toolbarEl.hasAttribute('hidden');
      let centerScreenX, topScreenY;
        if (state.selectedBlueprint && state.blueprintTransform) {
          const bt = state.blueprintTransform;
          centerScreenX = rect.left + state.offsetX + (bt.x + bt.w / 2) * scale;
          topScreenY = rect.top + state.offsetY + bt.y * scale;
        } else if (selected && selectedElements.length === 1) {
          const pos = getElementDrawPosition(selected);
          centerScreenX = rect.left + state.offsetX + (pos.x + selected.width / 2) * scale;
          topScreenY = rect.top + state.offsetY + pos.y * scale;
        } else {
          centerScreenX = rect.left + rect.width / 2;
          topScreenY = rect.top + rect.height / 2;
        }
        const toolbarHeight = 44;
        const gapAbove = 12;
        const toolbarLeft = centerScreenX - (toolbarEl.offsetWidth || 200) / 2;
        const toolbarTop = topScreenY - toolbarHeight - gapAbove;
        const toolbarMinTop = getFloatingToolbarMinTopPx();
        if (!state.floatingToolbarUserMoved) {
          toolbarEl.style.left = Math.max(8, Math.min(window.innerWidth - (toolbarEl.offsetWidth || 200) - 8, toolbarLeft)) + 'px';
          toolbarEl.style.top = Math.max(toolbarMinTop, toolbarTop) + 'px';
        }
        toolbarEl.removeAttribute('hidden');
        if (wasHidden) collapseDiagramToolbarIfExpanded();
        toolbarEl.classList.toggle('floating-toolbar-has-element', !!selected && selectedElements.length === 1);
        const measureBtn = document.getElementById('floatingToolbarMeasure');
        if (measureBtn) {
          const showMeasureBtn = layoutState.viewportMode === 'mobile'
            && !!selected
            && selectedElements.length === 1
            && !state.selectedBlueprint
            && selected.sequenceId != null
            && selected.sequenceId > 0;
          measureBtn.style.display = showMeasureBtn ? 'flex' : 'none';
          measureBtn.setAttribute('aria-hidden', showMeasureBtn ? 'false' : 'true');
        }
        // Update lock icon state (single icon, toggle class)
        const lockBtn = document.getElementById('floatingToolbarLock');
        if (lockBtn) {
          const isLocked = state.selectedBlueprint
            ? !!(state.blueprintTransform && state.blueprintTransform.locked)
            : !!(selected && selected.locked);
          lockBtn.classList.toggle('locked', isLocked);
          lockBtn.setAttribute('aria-label', isLocked ? 'Unlock' : 'Lock');
        }
    } else {
      toolbarEl.setAttribute('hidden', '');
      /* 54.80: When element toolbar is hidden (deselection), close flip dropdown and clear its position so it does not reappear at a stale fixed position on reselect. */
      const flipDropdownEl = document.getElementById('flipDropdown');
      if (flipDropdownEl) {
        flipDropdownEl.hidden = true;
        flipDropdownEl.style.position = '';
        flipDropdownEl.style.left = '';
        flipDropdownEl.style.top = '';
        flipDropdownEl.style.transform = '';
      }
      const btnFlipMenuEl = document.getElementById('btnFlipMenu');
      if (btnFlipMenuEl) btnFlipMenuEl.setAttribute('aria-expanded', 'false');
    }
  }

  // Color palette: only when Color Wheel was clicked; position relative to floating toolbar (decoupled from auto-show on selection)
  updateColorPalettePositionAndVisibility(toolbarEl, selected, scale);
  if (rect) {
    updateTransparencyButtonPositionAndVisibility(rect, scale);
    updateTransparencyPopover(rect, scale);
  }

  if (canvas) {
    if (state.mode) {
      canvas.style.willChange = 'transform';
      if (state.mode === 'pan' || state.mode === 'pan-resist' || state.mode === 'move') canvas.style.cursor = 'grabbing';
      else if (state.mode === 'rotate' && state.selectedId) {
        const rotEl = state.elements.find((x) => x.id === state.selectedId);
        canvas.style.cursor = rotEl ? getRotationCursor((rotEl.rotation || 0) + 90) : 'move';
      } else if (state.mode === 'resize') canvas.style.cursor = 'move';
    } else {
      canvas.style.willChange = 'auto';
    }
  }

  // Mobile fit-level feedback: subtle bounce-back when users try to pan at fit (viewZoom=1).
  if (isMobileFitZoomLevel()) {
    if (state.mode !== 'pan-resist') {
      state.fitPanFeedbackX *= MOBILE_FIT_PAN_BOUNCE_DECAY;
      state.fitPanFeedbackY *= MOBILE_FIT_PAN_BOUNCE_DECAY;
      if (Math.abs(state.fitPanFeedbackX) < MOBILE_FIT_PAN_BOUNCE_STOP_EPSILON) state.fitPanFeedbackX = 0;
      if (Math.abs(state.fitPanFeedbackY) < MOBILE_FIT_PAN_BOUNCE_STOP_EPSILON) state.fitPanFeedbackY = 0;
    }
  } else if (state.fitPanFeedbackX || state.fitPanFeedbackY) {
    state.fitPanFeedbackX = 0;
    state.fitPanFeedbackY = 0;
  }

  updateAccessibilityInspector({ skipActiveField: true });
  requestAnimationFrame(draw);
}

/**
 * Get all drawable items at canvas coordinates (x, y), sorted for selection order:
 * 1. By zIndex descending (top-most first).
 * 2. By area ascending (prefer smaller over larger when overlapping, e.g. Marley part over blueprint).
 * Returns { stack: Array<{ type, element?, zIndex, area }>, top: first item or null }.
 */
function getSelectionAt(canvasX, canvasY) {
  const candidates = [];
  const bt = state.blueprintTransform;
  // If blueprint is locked, exclude it from candidates entirely so clicks fall through to empty space (Marquee)
  if (bt && !bt.locked && pointInRotatedRect(canvasX, canvasY, bt.x, bt.y, bt.w, bt.h, bt.rotation || 0)) {
    const area = (bt.w || 0) * (bt.h || 0);
    candidates.push({ type: 'blueprint', zIndex: bt.zIndex != null ? bt.zIndex : BLUEPRINT_Z_INDEX, area });
  }
  state.elements.forEach((el) => {
    if (!pointInRotatedRect(canvasX, canvasY, el.x, el.y, el.width, el.height, el.rotation || 0)) return;
    const z = el.zIndex != null ? el.zIndex : 0;
    candidates.push({ type: 'element', element: el, zIndex: z, area: el.width * el.height });
  });
  candidates.sort((a, b) => {
    if (b.zIndex !== a.zIndex) return b.zIndex - a.zIndex; // descending: higher zIndex first
    return a.area - b.area; // ascending: smaller first (prefer small over large)
  });
  const top = candidates[0] || null;
  return { stack: candidates, top };
}

function hitTestElement(canvasX, canvasY) {
  const { top } = getSelectionAt(canvasX, canvasY);
  if (top && top.type === 'element') return { element: top.element, handle: null };
  return null;
}

/**
 * Inverse rotate: transform display coords to element-local (handle) space.
 * Center (cx, cy), rotation in degrees.
 */
function displayToHandleLocal(px, py, cx, cy, rotationDeg) {
  const dx = px - cx;
  const dy = py - cy;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

/**
 * Resize cursor for a handle, accounting for element rotation.
 * North=0°, East=90°, etc.; maps to n-resize, ne-resize, e-resize, etc.
 */
function getCursorForHandle(handleId, rotation) {
  if (handleId === 'rotate') return 'grab';
  const baseAngles = {
    n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315,
  };
  const cursors = ['n-resize', 'ne-resize', 'e-resize', 'se-resize', 's-resize', 'sw-resize', 'w-resize', 'nw-resize'];
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  let angle = ((baseAngles[handleId] ?? 0) + (rotation || 0)) % 360;
  if (angle < 0) angle += 360;
  let best = 0;
  let bestDelta = Math.abs(angle - angles[0]);
  for (let i = 1; i < angles.length; i++) {
    const d = Math.min(Math.abs(angle - angles[i]), 360 - Math.abs(angle - angles[i]));
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  return cursors[best];
}

function hitTestHandle(clientX, clientY) {
  const selected = state.elements.find((e) => e.id === state.selectedId);
  if (!selected) return null;
  if (selected.locked) return null;
  const pos = getElementDrawPosition(selected);
  const sx = state.offsetX + pos.x * state.scale;
  const sy = state.offsetY + pos.y * state.scale;
  const sw = selected.width * state.scale;
  const sh = selected.height * state.scale;

  const rotation = selected.rotation || 0;
  const padding = CANVAS_PORTER_VISUAL_PADDING * state.scale;
  const paddedSx = sx - padding;
  const paddedSy = sy - padding;
  const paddedSw = sw + padding * 2;
  const paddedSh = sh + padding * 2;
  const paddedCx = paddedSx + paddedSw / 2;
  const paddedCy = paddedSy + paddedSh / 2;
  const rotY = paddedSy - ROTATE_HANDLE_OFFSET;

  const handles = [
    { id: 'nw', x: paddedSx, y: paddedSy, pill: null },
    { id: 'n', x: paddedSx + paddedSw / 2, y: paddedSy, pill: 'horizontal' },
    { id: 'ne', x: paddedSx + paddedSw, y: paddedSy, pill: null },
    { id: 'e', x: paddedSx + paddedSw, y: paddedSy + paddedSh / 2, pill: 'vertical' },
    { id: 'se', x: paddedSx + paddedSw, y: paddedSy + paddedSh, pill: null },
    { id: 's', x: paddedSx + paddedSw / 2, y: paddedSy + paddedSh, pill: 'horizontal' },
    { id: 'sw', x: paddedSx, y: paddedSy + paddedSh, pill: null },
    { id: 'w', x: paddedSx, y: paddedSy + paddedSh / 2, pill: 'vertical' },
    { id: 'rotate', x: paddedCx, y: rotY, pill: null },
  ];

  const display = clientToCanvasDisplay(clientX, clientY);
  if (!display) return null;
  const px = display.x;
  const py = display.y;

  const proximityRadius = HANDLE_PROXIMITY_PX;
  const stemHitRadius = 16; // forgiving hit along entire tail so rotate handle is easy to grab

  const local = displayToHandleLocal(px, py, paddedCx, paddedCy, rotation);
  const lx = local.x + paddedCx;
  const ly = local.y + paddedCy;

  // Check resize handles first so North pill gets resize priority over overlapping rotate tail
  for (const h of handles) {
    if (h.id === 'rotate') continue;
    if (h.pill === 'horizontal') {
      const w = PILL_HALF_LENGTH * 2;
      const hitH = PILL_HIT_THICKNESS;
      const left = h.x - w / 2;
      const top = h.y - hitH / 2;
      const r = Math.min(w, hitH) / 2;
      if (pointInRoundedRect(lx, ly, left, top, w, hitH, r)) {
        return { element: selected, handle: h.id, cursor: getCursorForHandle(h.id, rotation) };
      }
      continue;
    }
    if (h.pill === 'vertical') {
      const ht = PILL_HALF_LENGTH * 2;
      const hitW = PILL_HIT_THICKNESS;
      const left = h.x - hitW / 2;
      const top = h.y - ht / 2;
      const r = Math.min(hitW, ht) / 2;
      if (pointInRoundedRect(lx, ly, left, top, hitW, ht, r)) {
        return { element: selected, handle: h.id, cursor: getCursorForHandle(h.id, rotation) };
      }
      continue;
    }
    if (Math.hypot(lx - h.x, ly - h.y) <= proximityRadius) {
      return { element: selected, handle: h.id, cursor: getCursorForHandle(h.id, rotation) };
    }
  }

  // Rotate handle and stem last: if no resize handle hit, then check rotate
  const rotateHandle = handles.find((h) => h.id === 'rotate');
  if (rotateHandle) {
    if (Math.hypot(lx - rotateHandle.x, ly - rotateHandle.y) <= ROTATE_HANDLE_PROXIMITY_PX) {
      return { element: selected, handle: 'rotate', cursor: 'grab' };
    }
    const distToStem = pointToSegmentDistance(lx, ly, paddedCx, paddedSy, paddedCx, rotY);
    if (distToStem <= stemHitRadius) {
      return { element: selected, handle: 'rotate', cursor: 'grab' };
    }
  }
  return null;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Dynamic rotation cursor: double-sided curved arrow that follows angle (task 18.8).
 * Fluid Canva feel; angle typically element.rotation + 90. Hotspot at center 16 16.
 */
function getRotationCursor(angle) {
  const a = angle != null ? angle : 90;
  const path = 'M16 4c3.3 0 6 2.7 6 6 0 1-.2 2-.7 2.8l1.5 1.5A7.9 7.9 0 0 0 24 12c0-4.4-3.6-8-8-8V1l-4 4 4 4V4zM4.7 11.2l-1.5-1.5A7.9 7.9 0 0 0 2 12c0 4.4 3.6 8 8 8v3l4-4-4-4v3c-3.3 0-6-2.7-6-6 0-1 .2-2 .7-2.8z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g transform="rotate(${a} 12 12) translate(0 0)"><path d="${path}" fill="black" stroke="none"/></g></svg>`;
  return `url("data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}") 16 16, auto`;
}

function pointInRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const r2 = Math.min(r, w / 2, h / 2);
  if (r2 <= 0) return true;
  const corners = [
    [x + r2, y + r2],
    [x + w - r2, y + r2],
    [x + w - r2, y + h - r2],
    [x + r2, y + h - r2],
  ];
  if (px < x + r2 && py < y + r2) return Math.hypot(px - corners[0][0], py - corners[0][1]) <= r2;
  if (px > x + w - r2 && py < y + r2) return Math.hypot(px - corners[1][0], py - corners[1][1]) <= r2;
  if (px > x + w - r2 && py > y + h - r2) return Math.hypot(px - corners[2][0], py - corners[2][1]) <= r2;
  if (px < x + r2 && py > y + h - r2) return Math.hypot(px - corners[3][0], py - corners[3][1]) <= r2;
  return true;
}

function drawPillRect(ctx, x, y, w, h) {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.arc(x + w - r, y + r, r, Math.PI * 1.5, 0);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI * 0.5);
  ctx.arc(x + r, y + h - r, r, Math.PI * 0.5, Math.PI);
  ctx.closePath();
}

function hitTestBlueprint(canvasX, canvasY) {
  const bt = state.blueprintTransform;
  if (!bt) return false;
  return pointInRotatedRect(canvasX, canvasY, bt.x, bt.y, bt.w, bt.h, bt.rotation || 0);
}

/** Layer management: set element zIndex to max(current range) + 1 so it draws on top. */
function bringToFront(elementId) {
  const el = state.elements.find((e) => e.id === elementId);
  if (!el) return;
  const maxZ = state.elements.reduce((m, e) => Math.max(m, e.zIndex != null ? e.zIndex : 0), BLUEPRINT_Z_INDEX);
  el.zIndex = maxZ + 1;
  draw();
}

/** Layer management: set element zIndex to min(current range) - 1 (can go behind blueprint). */
function sendToBack(elementId) {
  const el = state.elements.find((e) => e.id === elementId);
  if (!el) return;
  const minZ = state.elements.reduce(
    (m, e) => Math.min(m, e.zIndex != null ? e.zIndex : 0),
    state.blueprintTransform ? (state.blueprintTransform.zIndex != null ? state.blueprintTransform.zIndex : BLUEPRINT_Z_INDEX) : 0
  );
  el.zIndex = minZ - 1;
  draw();
}

function hitTestBlueprintHandle(clientX, clientY) {
  if (!state.selectedBlueprint || !state.blueprintTransform) return null;
  const bt = state.blueprintTransform;
  const sx = state.offsetX + bt.x * state.scale;
  const sy = state.offsetY + bt.y * state.scale;
  const sw = bt.w * state.scale;
  const sh = bt.h * state.scale;
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;
  const rad = ((bt.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (lx, ly) => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
  const corners = [
    { id: 'nw', ...rot(-sw / 2, -sh / 2) },
    { id: 'ne', ...rot(sw / 2, -sh / 2) },
    { id: 'sw', ...rot(-sw / 2, sh / 2) },
    { id: 'se', ...rot(sw / 2, sh / 2) },
  ];
  const rotateHandle = rot(sw / 2, -ROTATE_HANDLE_OFFSET);
  const display = clientToCanvasDisplay(clientX, clientY);
  if (!display) return null;
  const px = display.x;
  const py = display.y;
  const hs = HANDLE_SIZE;
  for (const h of corners) {
    if (Math.abs(px - h.x) <= hs && Math.abs(py - h.y) <= hs) return { handle: h.id };
  }
  if (Math.abs(px - rotateHandle.x) <= 8 && Math.abs(py - rotateHandle.y) <= 8) return { handle: 'rotate' };
  return null;
}

function resizeCanvas() {
  const canvas = getCanvasElement();
  const wrap = document.getElementById('blueprintWrap');
  if (!canvas || !wrap) return;
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  state.canvasWidth = w * dpr;
  state.canvasHeight = h * dpr;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    state.canvas = canvas;
    state.ctx = ctx;
  }
}

/** Diagram toolbar init: inject viewport mode from app so toolbar.js stays independent. */
function initDiagramToolbarDragWithApp() {
  diagramToolbarApi = initDiagramToolbarDrag({ getViewportMode: () => layoutState.viewportMode });
}

/** 54.80: Mobile-only – collapse diagram toolbar when element toolbar/dropdowns open. No-op on desktop. */
function collapseDiagramToolbarIfExpanded() {
  if (layoutState.viewportMode !== 'mobile') return;
  diagramToolbarApi?.collapseIfExpanded?.();
}

function initCanvas() {
  resizeCanvas();
  const canvas = getCanvasElement();
  const placeholder = document.getElementById('canvasPlaceholder');
  const diagramToolbar = document.getElementById('diagramFloatingToolbar');
  if (!canvas) return;

  // Prevent diagram toolbar clicks from reaching the canvas (so zoom/recenter/upload work reliably)
  if (diagramToolbar) {
    diagramToolbar.addEventListener('pointerdown', (e) => e.stopPropagation());
    diagramToolbar.addEventListener('click', (e) => e.stopPropagation());
  }
  
  initDiagramToolbarDragWithApp();

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // 54.89.2 Mobile: blur focused control when tapping canvas so residual blue ring doesn't persist
    if (layoutState.viewportMode === 'mobile' && modalA11yState.stack.length === 0) {
      const tapTarget = e.target;
      if (!tapTarget.closest('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
        const el = document.activeElement;
        if (el && el !== document.body) {
          const tag = el.tagName;
          if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') el.blur();
        }
      }
    }
    e.preventDefault();
    cancelBboxRecalcDebounce();
    canvas.setPointerCapture(e.pointerId);
    const rect = getCanvasRect();
    if (!rect) return;
    // 54.17 / 54.61: Track active pointers for pinch zoom or selected-element two-finger transform.
    state.activePointers[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
    const ptrIds = Object.keys(state.activePointers);
    if (ptrIds.length === 2 && (state.blueprintImage || state.elements.length)) {
      // 54.61: On mobile, selected single element gets Freeform-style two-finger transform.
      if (beginMobileElementTransformFromActivePointers()) {
        return;
      }
      const p1 = state.activePointers[ptrIds[0]];
      const p2 = state.activePointers[ptrIds[1]];
      const cx = (p1.clientX + p2.clientX) / 2;
      const cy = (p1.clientY + p2.clientY) / 2;
      const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      const display = clientToCanvasDisplay(cx, cy);
      if (display && dist > 5) {
        clearMobilePointerGestureState();
        state.mode = 'pinch';
        state.pinchStartDistance = dist;
        state.pinchStartCenter = { x: cx, y: cy };
        state.pinchStartContentX = (display.x - state.offsetX) / state.scale;
        state.pinchStartContentY = (display.y - state.offsetY) / state.scale;
        state.pinchStartViewZoom = state.viewZoom;
        state.pinchStartViewPanX = state.viewPanX;
        state.pinchStartViewPanY = state.viewPanY;
        state.marqueeStart = null;
        state.marqueeCurrent = null;
        return;
      }
    }
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    const bpHandle = hitTestBlueprintHandle(e.clientX, e.clientY);
    if (bpHandle) {
      state.hoveredId = null;
      if (state.blueprintTransform && state.blueprintTransform.locked) {
        state.selectedBlueprint = true;
        setSelection([]);
        return;
      }
      state.snapshotAtActionStart = cloneStateForUndo();
      state.selectedBlueprint = true;
      setSelection([]);
      if (bpHandle.handle === 'rotate') {
        state.mode = 'blueprint-rotate';
        const bt = state.blueprintTransform;
        const cx = state.offsetX + bt.x * state.scale + (bt.w * state.scale) / 2;
        const cy = state.offsetY + bt.y * state.scale + (bt.h * state.scale) / 2;
        state.dragOffset.angle = Math.atan2(e.clientY - (rect.top + cy), e.clientX - (rect.left + cx));
        return;
      }
      state.mode = 'blueprint-resize';
      state.resizeHandle = bpHandle.handle;
      const bt = state.blueprintTransform;
      state.dragOffset.w = bt.w;
      state.dragOffset.h = bt.h;
      state.dragOffset.cx = bt.x + bt.w / 2;
      state.dragOffset.cy = bt.y + bt.h / 2;
      return;
    }
    const handleHit = hitTestHandle(e.clientX, e.clientY);
    if (handleHit) {
      state.hoveredId = null;
      state.hoveredHandleId = null;
      state.snapshotAtActionStart = cloneStateForUndo();
      state.selectedBlueprint = false;
      if (handleHit.handle === 'rotate') {
        state.mode = 'rotate';
        setSelection([handleHit.element.id]);
        state.dragOffset.angle = Math.atan2(
          e.clientY - (rect.top + state.offsetY + handleHit.element.y * state.scale + (handleHit.element.height * state.scale) / 2),
          e.clientX - (rect.left + state.offsetX + handleHit.element.x * state.scale + (handleHit.element.width * state.scale) / 2)
        );
        return;
      }
      state.mode = 'resize';
      state.resizeHandle = handleHit.handle;
      setSelection([handleHit.element.id]);
      state.dragOffset.w = handleHit.element.width;
      state.dragOffset.h = handleHit.element.height;
      state.dragOffset.cx = handleHit.element.x + handleHit.element.width / 2;
      state.dragOffset.cy = handleHit.element.y + handleHit.element.height / 2;
      state.dragOffset.rotation = handleHit.element.rotation != null ? handleHit.element.rotation : 0;
      return;
    }
    const sel = getSelectionAt(canvasPos.x, canvasPos.y);
    // Drill-through: only cycle to next in stack when Alt/Option held; otherwise keep selection for immediate drag
    let target = sel.top;
    if (target && sel.stack.length > 1 && e.altKey) {
      const alreadySelected = target.type === 'element' && state.selectedIds.length === 1 && state.selectedIds[0] === target.element.id;
      const alreadyBlueprint = target.type === 'blueprint' && state.selectedBlueprint;
      if (alreadySelected || alreadyBlueprint) {
        target = sel.stack[1];
      }
    }
    if (target?.type === 'element') {
      const hit = { element: target.element };
      state.hoveredId = null;
      state.selectedBlueprint = false;
      if (hit.element.locked) {
        state.snapshotAtActionStart = cloneStateForUndo();
        if (!state.selectedIds.includes(hit.element.id)) setSelection([hit.element.id]);
        else setSelection([hit.element.id].concat(state.selectedIds.filter((id) => id !== hit.element.id)));
        return;
      }
      if (e.shiftKey) {
        const idx = state.selectedIds.indexOf(hit.element.id);
        if (idx >= 0) {
          const next = state.selectedIds.slice();
          next.splice(idx, 1);
          setSelection(next);
        } else {
          setSelection(state.selectedIds.concat(hit.element.id));
        }
        return;
      }
      const wasAlreadySelected = state.selectedIds.includes(hit.element.id);
      const isMobileTapMovePath = layoutState.viewportMode === 'mobile' && !e.altKey;
      const shouldSelectOnlyOnMobile = isMobileTapMovePath && !wasAlreadySelected;
      const shouldPrimeMobileMove = isMobileTapMovePath && wasAlreadySelected;
      if (!shouldPrimeMobileMove && !shouldSelectOnlyOnMobile) {
        state.snapshotAtActionStart = cloneStateForUndo();
      }
      if (!wasAlreadySelected) {
        setSelection([hit.element.id]);
      } else {
        setSelection([hit.element.id].concat(state.selectedIds.filter((id) => id !== hit.element.id)));
      }
      if (layoutState.viewportMode !== 'mobile' && hit.element.sequenceId && state.selectedIds.length === 1) {
        scrollToMeasurementCardAndFocus(hit.element.id);
      }
      if (shouldSelectOnlyOnMobile) {
        // 54.62: First tap on an unselected element only selects. One-finger move requires explicit prior selection.
        state.mode = null;
        state.dragGhostX = null;
        state.dragGhostY = null;
        state.previewDragX = null;
        state.previewDragY = null;
        state.dragMoveIds = [];
        state.dragRelativeOffsets = [];
        clearMobilePointerGestureState();
        return;
      }
      if (e.altKey) {
        const el = hit.element;
        pushUndoSnapshot();
        // 54.18: Alt+drag duplicate uses grid snap and nudge to avoid overlap
        let dx = snapToGrid(el.x + SNAP_GRID_SIZE) - el.x;
        let dy = snapToGrid(el.y + SNAP_GRID_SIZE) - el.y;
        if (dx === 0 && dy === 0) { dx = SNAP_GRID_SIZE; dy = 0; }
        const dup = {
          ...el,
          id: 'el-' + ++elementIdCounter,
          x: el.x + dx,
          y: el.y + dy,
          zIndex: getNextElementZIndex(),
          image: el.image,
          originalImage: el.originalImage || el.image,
          tintedCanvas: null,
          tintedCanvasColor: null,
          locked: !!el.locked,
        };
        const othersAltDup = state.elements;
        const nudgeDirsAltDup = [[SNAP_GRID_SIZE, 0], [0, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, 0], [0, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, SNAP_GRID_SIZE]];
        for (let n = 0; n < 20; n++) {
          if (!othersAltDup.some((o) => elementsOverlap(dup, o))) break;
          const [nx, ny] = nudgeDirsAltDup[n % nudgeDirsAltDup.length];
          dup.x += nx;
          dup.y += ny;
        }
        if (isMeasurableElement(dup.assetId)) {
          dup.sequenceId = state.nextSequenceId++;
          dup.measuredLength = 0;
        }
        state.elements.push(dup);
        setSelection([dup.id]);
        renderMeasurementDeck();
        state.dragGhostX = dup.x;
        state.dragGhostY = dup.y;
      } else if (state.selectedIds.length === 1) {
        state.dragGhostX = hit.element.x;
        state.dragGhostY = hit.element.y;
      } else {
        state.dragGhostX = null;
        state.dragGhostY = null;
      }

      const primary = state.elements.find((x) => x.id === state.selectedId);
      if (shouldPrimeMobileMove) {
        // 54.62: Mobile tap-first move gating. One finger selects first; drag starts only after threshold in pointermove.
        state.mode = 'move-primed';
        state.movePrimeStartClientX = e.clientX;
        state.movePrimeStartClientY = e.clientY;
        state.previewDragX = null;
        state.previewDragY = null;
        state.dragMoveIds = [];
        state.dragRelativeOffsets = [];
        return;
      }

      state.mode = 'move';
      if (primary) {
        state.dragOffset.x = canvasPos.x - primary.x;
        state.dragOffset.y = canvasPos.y - primary.y;
        state.dragMoveIds = getElementsToMove();
        state.dragRelativeOffsets = state.dragMoveIds
          .filter((id) => id !== state.selectedId)
          .map((id) => {
            const o = state.elements.find((x) => x.id === id);
            return o ? { id, dx: o.x - primary.x, dy: o.y - primary.y } : null;
          })
          .filter(Boolean);
        state.previewDragX = primary.x;
        state.previewDragY = primary.y;
      }
      return;
    }
    if (target?.type === 'blueprint') {
      state.hoveredId = null;
      // Body click on unlocked blueprint: only SELECT, never enter blueprint-move
      // Handle-only movement: resize/rotate via hitTestBlueprintHandle; background never moves from body drag
      state.selectedBlueprint = true;
      setSelection([]);
      return;
    }
    setSelection([]);
    state.selectedBlueprint = false;
    state.hoveredId = null;
    // 54.16: On mobile, drag on empty canvas pans the view instead of starting marquee selection.
    if (layoutState.viewportMode === 'mobile') {
      state.mode = isMobileFitZoomLevel() ? 'pan-resist' : 'pan';
      state.dragOffset.x = e.clientX;
      state.dragOffset.y = e.clientY;
      return;
    }
    state.mode = 'marquee';
    state.marqueeStart = { x: canvasPos.x, y: canvasPos.y };
    state.marqueeCurrent = null;
  });

  canvas.addEventListener('pointermove', (e) => {
    state.activePointers[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    if (state.mode === 'element-transform') {
      const ptrIds = state.elementTransformPointerIds;
      if (ptrIds && ptrIds.length === 2 && state.activePointers[ptrIds[0]] && state.activePointers[ptrIds[1]]) {
        e.preventDefault();
        if (applyMobileElementTransformFromActivePointers()) {
          draw();
        }
      }
      return;
    }
    // 54.17: Pinch zoom – update view from two-finger distance and center
    if (state.mode === 'pinch') {
      const ptrIds = Object.keys(state.activePointers);
      if (ptrIds.length === 2 && state.pinchStartDistance > 0) {
        e.preventDefault();
        const p1 = state.activePointers[ptrIds[0]];
        const p2 = state.activePointers[ptrIds[1]];
        const curDist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
        const cx = (p1.clientX + p2.clientX) / 2;
        const cy = (p1.clientY + p2.clientY) / 2;
        const scaleFactor = curDist / state.pinchStartDistance;
        const minZoom = layoutState.viewportMode === 'mobile' ? MIN_VIEW_ZOOM_MOBILE : MIN_VIEW_ZOOM;
        const newViewZoom = Math.max(minZoom, Math.min(MAX_VIEW_ZOOM, state.pinchStartViewZoom * scaleFactor));
        const newScale = state.baseScale * newViewZoom;
        const display = clientToCanvasDisplay(cx, cy);
        if (display) {
          if (layoutState.viewportMode === 'mobile' && newViewZoom <= (MIN_VIEW_ZOOM_MOBILE + MOBILE_FIT_PAN_LOCK_EPSILON)) {
            state.viewZoom = MIN_VIEW_ZOOM_MOBILE;
            state.viewPanX = 0;
            state.viewPanY = 0;
            const centerDx = cx - (state.pinchStartCenter?.x ?? cx);
            const centerDy = cy - (state.pinchStartCenter?.y ?? cy);
            state.fitPanFeedbackX = clampFitPanFeedback(centerDx * MOBILE_FIT_PAN_RESISTANCE_FACTOR);
            state.fitPanFeedbackY = clampFitPanFeedback(centerDy * MOBILE_FIT_PAN_RESISTANCE_FACTOR);
          } else {
            state.viewZoom = newViewZoom;
            state.viewPanX = display.x - state.pinchStartContentX * newScale - state.baseOffsetX;
            state.viewPanY = display.y - state.pinchStartContentY * newScale - state.baseOffsetY;
            state.fitPanFeedbackX = 0;
            state.fitPanFeedbackY = 0;
          }
        }
        draw();
      }
      return;
    }
    if (!state.mode) {
      const handleHit = state.selectedIds.length === 1 ? hitTestHandle(e.clientX, e.clientY) : null;
      if (handleHit && handleHit.cursor) {
        state.hoveredId = null;
        state.hoveredHandleId = handleHit.handle;
        if (handleHit.handle === 'rotate' && handleHit.element) {
          canvas.style.cursor = getRotationCursor((handleHit.element.rotation || 0) + 90);
        } else {
          canvas.style.cursor = handleHit.cursor;
        }
      } else {
        state.hoveredHandleId = null;
        const sel = getSelectionAt(canvasPos.x, canvasPos.y);
        if (sel.top?.type === 'element') {
          state.hoveredId = sel.top.element.id;
          canvas.style.cursor = sel.top.element.locked ? 'default' : 'grab';
        } else if (sel.top?.type === 'blueprint') {
          state.hoveredId = null;
          const bt = state.blueprintTransform;
          canvas.style.cursor = (bt && bt.locked) ? 'default' : 'grab';
        } else {
          state.hoveredId = null;
          // 54.16: On mobile, show 'grab' cursor for pan hint when hovering empty canvas
          if (layoutState.viewportMode === 'mobile' && (state.blueprintImage || state.elements.length)) {
            canvas.style.cursor = 'grab';
          } else {
            canvas.style.cursor = (state.blueprintImage || state.elements.length) ? 'grab' : 'default';
          }
        }
      }
    }
    if (state.mode === 'marquee') {
      state.marqueeCurrent = { x: canvasPos.x, y: canvasPos.y };
      return;
    }
    if (state.mode === 'move-primed') {
      const dx = e.clientX - state.movePrimeStartClientX;
      const dy = e.clientY - state.movePrimeStartClientY;
      if (dx * dx + dy * dy < MOBILE_MOVE_START_THRESHOLD_PX * MOBILE_MOVE_START_THRESHOLD_PX) {
        return;
      }
      const primary = state.elements.find((x) => x.id === state.selectedId);
      if (!primary || primary.locked) {
        state.mode = null;
        clearMobilePointerGestureState();
        return;
      }
      if (!state.snapshotAtActionStart) {
        state.snapshotAtActionStart = cloneStateForUndo();
      }
      state.mode = 'move';
      state.dragOffset.x = canvasPos.x - primary.x;
      state.dragOffset.y = canvasPos.y - primary.y;
      state.dragMoveIds = getElementsToMove();
      state.dragRelativeOffsets = state.dragMoveIds
        .filter((id) => id !== state.selectedId)
        .map((id) => {
          const o = state.elements.find((x) => x.id === id);
          return o ? { id, dx: o.x - primary.x, dy: o.y - primary.y } : null;
        })
        .filter(Boolean);
      state.previewDragX = primary.x;
      state.previewDragY = primary.y;
    }
    if (state.mode === 'pan-resist') {
      const dx = e.clientX - state.dragOffset.x;
      const dy = e.clientY - state.dragOffset.y;
      state.dragOffset.x = e.clientX;
      state.dragOffset.y = e.clientY;
      applyFitPanResistance(dx, dy);
      canvas.style.cursor = 'grabbing';
      draw();
      return;
    }
    if (state.mode === 'pan') {
      if (layoutState.viewportMode === 'mobile' && isMobileFitZoomLevel()) {
        state.mode = 'pan-resist';
        return;
      }
      state.viewPanX += e.clientX - state.dragOffset.x;
      state.viewPanY += e.clientY - state.dragOffset.y;
      state.dragOffset.x = e.clientX;
      state.dragOffset.y = e.clientY;
      canvas.style.cursor = 'grabbing';
      draw();
      return;
    }
    if (state.mode === 'blueprint-move' && state.blueprintTransform) {
      const bt = state.blueprintTransform;
      bt.x = canvasPos.x - state.dragOffset.x;
      bt.y = canvasPos.y - state.dragOffset.y;
    } else if (state.mode === 'blueprint-resize' && state.blueprintTransform && state.resizeHandle) {
      const bt = state.blueprintTransform;
      const cx = state.dragOffset.cx;
      const cy = state.dragOffset.cy;
      let w = Math.max(40, Math.abs(canvasPos.x - cx) * 2);
      let h = Math.max(40, Math.abs(canvasPos.y - cy) * 2);
      const ar = state.dragOffset.w / state.dragOffset.h;
      if (w / h > ar) h = w / ar;
      else w = h * ar;
      bt.w = w;
      bt.h = h;
      bt.x = cx - w / 2;
      bt.y = cy - h / 2;
    } else if (state.mode === 'blueprint-rotate' && state.blueprintTransform) {
      const bt = state.blueprintTransform;
      const rect = getCanvasRect();
      const cx = state.offsetX + bt.x * state.scale + (bt.w * state.scale) / 2;
      const cy = state.offsetY + bt.y * state.scale + (bt.h * state.scale) / 2;
      let degrees = (Math.atan2(e.clientY - (rect.top + cy), e.clientX - (rect.left + cx)) * 180) / Math.PI;
      bt.rotation = applyRotationSnap(degrees, e.shiftKey);
    } else if (state.mode === 'move' && state.previewDragX != null) {
      state.previewDragX = canvasPos.x - state.dragOffset.x;
      state.previewDragY = canvasPos.y - state.dragOffset.y;
      updateCanvasTooltip(Math.round(state.previewDragX) + ', ' + Math.round(state.previewDragY), e.clientX, e.clientY);
    } else if (state.mode === 'resize' && state.selectedId && state.resizeHandle) {
      state.pendingResizeCanvasPos = { x: canvasPos.x, y: canvasPos.y };
      state.pendingResizeAltKey = e.altKey;
      if (state.resizeRAFId == null) {
        state.resizeRAFId = requestAnimationFrame(() => {
          state.resizeRAFId = null;
          if (state.pendingResizeCanvasPos) {
            applyResizeWith(state.pendingResizeCanvasPos, state.pendingResizeAltKey);
            draw();
          }
        });
      }
    } else if (state.mode === 'rotate' && state.selectedId) {
      const el = state.elements.find((x) => x.id === state.selectedId);
      if (!el) return;
      const rect = getCanvasRect();
      const cx = state.offsetX + el.x * state.scale + (el.width * state.scale) / 2;
      const cy = state.offsetY + el.y * state.scale + (el.height * state.scale) / 2;
      let degrees = (Math.atan2(e.clientY - (rect.top + cy), e.clientX - (rect.left + cx)) * 180) / Math.PI;
      degrees = applyRotationSnap(degrees, e.shiftKey);
      let wasConstrained = false;
      if (!e.altKey) {
        const result = constrainGutterRotation(degrees, el);
        degrees = result.degrees;
        wasConstrained = result.constrained;
      }
      el.rotation = degrees;
      state.currentRotationAngle = Math.round(degrees);
      if (state.canvas) {
        state.canvas.style.cursor = wasConstrained ? 'not-allowed' : getRotationCursor(degrees + 90);
      }
      updateCanvasTooltip(wasConstrained ? 'Max angle' : state.currentRotationAngle + '°', e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.target && e.target.releasePointerCapture && e.pointerId != null) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    delete state.activePointers[e.pointerId];
    const endingElementTransform = state.mode === 'element-transform' && Object.keys(state.activePointers).length < 2;
    if (state.mode === 'pinch' && Object.keys(state.activePointers).length < 2) {
      // 54.17: Clean up pinch state when exiting pinch mode
      state.mode = null;
      state.pinchStartDistance = 0;
      state.pinchStartCenter = null;
      clearMobilePointerGestureState();
    }
    if (endingElementTransform) {
      // Keep state.mode until undo snapshot decision below, then clear in common cleanup.
      state.elementTransformPointerIds = null;
      state.elementTransformStart = null;
    }
    if (state.mode === 'move-primed') {
      // 54.62: Tap-only selection should not commit a drag interaction.
      state.dragMoveIds = [];
      state.dragRelativeOffsets = [];
      state.previewDragX = null;
      state.previewDragY = null;
    }
    if (state.mode === 'resize' && state.selectedId && state.resizeHandle) {
      if (state.resizeRAFId != null) {
        cancelAnimationFrame(state.resizeRAFId);
        state.resizeRAFId = null;
      }
      const canvasPos = clientToCanvas(e.clientX, e.clientY);
      applyResizeWith(canvasPos, e.altKey);
      state.pendingResizeCanvasPos = null;
      draw();
    }
    if (state.mode === 'marquee' && state.marqueeStart && state.marqueeCurrent) {
      const windowMode = state.marqueeStart.x <= state.marqueeCurrent.x;
      const ids = getElementsInMarquee(state.marqueeStart, state.marqueeCurrent, windowMode);
      setSelection(ids);
    }
    state.marqueeStart = null;
    state.marqueeCurrent = null;
    if (state.mode === 'move' && state.previewDragX != null && state.dragMoveIds.length > 0) {
      const primary = state.elements.find((x) => x.id === state.selectedId);
      if (primary) {
        primary.x = state.previewDragX;
        primary.y = state.previewDragY;
        state.activeGuides = applySnapAndReturnGuides(primary);
        // 54.18: Snap to grid so parts stay aligned and readable
        primary.x = snapToGrid(primary.x);
        primary.y = snapToGrid(primary.y);
        state.dragRelativeOffsets.forEach((rel) => {
          const el = state.elements.find((x) => x.id === rel.id);
          if (el) {
            // Snap relative offsets to grid as well for multi-select alignment
            el.x = snapToGrid(primary.x + rel.dx);
            el.y = snapToGrid(primary.y + rel.dy);
          }
        });
        if (state.activeGuides.length > 0) {
          state.snapPopStartTime = Date.now();
          state.snapPopElementIds = state.dragMoveIds.slice();
        }
      }
    }
    const wasInteraction = state.mode && state.mode !== 'pan' && state.snapshotAtActionStart;
    if (wasInteraction) {
      const isBlueprintMode = state.mode === 'blueprint-move' || state.mode === 'blueprint-resize' || state.mode === 'blueprint-rotate';
      if (isBlueprintMode) {
        blueprintUndoHistory.push(state.snapshotAtActionStart);
        if (blueprintUndoHistory.length > MAX_UNDO_HISTORY) blueprintUndoHistory.shift();
      } else {
        undoHistory.push(state.snapshotAtActionStart);
        if (undoHistory.length > MAX_UNDO_HISTORY) undoHistory.shift();
      }
    }
    state.snapshotAtActionStart = null;
    state.dragGhostX = null;
    state.dragGhostY = null;
    state.previewDragX = null;
    state.previewDragY = null;
    state.dragMoveIds = [];
    state.dragRelativeOffsets = [];
    if (state.resizeRAFId != null) {
      cancelAnimationFrame(state.resizeRAFId);
      state.resizeRAFId = null;
    }
    state.pendingResizeCanvasPos = null;
    state.marqueeStart = null;
    state.marqueeCurrent = null;
    state.activeGuides = [];
    state.hoveredHandleId = null;
    clearMobilePointerGestureState();
    // Stable viewport: do not call scheduleBboxRecalcDebounce() for resize/move/rotate.
    // baseScale and baseOffset remain static; re-fit only on new blueprint or "Recenter View".
    state.mode = null;
    state.resizeHandle = null;
    updateCanvasTooltip(null);
  });

  canvas.addEventListener('pointerleave', (e) => {
    delete state.activePointers[e.pointerId];
    if (state.mode === 'pinch' && Object.keys(state.activePointers).length < 2) {
      // 54.17: Clean up pinch state when exiting pinch mode
      state.mode = null;
      state.pinchStartDistance = 0;
      state.pinchStartCenter = null;
      clearMobilePointerGestureState();
    }
    state.hoveredId = null;
    state.hoveredHandleId = null;
    state.dragGhostX = null;
    state.dragGhostY = null;
    state.previewDragX = null;
    state.previewDragY = null;
    state.dragMoveIds = [];
    state.dragRelativeOffsets = [];
    updateCanvasTooltip(null);
    state.marqueeStart = null;
    state.marqueeCurrent = null;
    if (state.resizeRAFId != null) {
      cancelAnimationFrame(state.resizeRAFId);
      state.resizeRAFId = null;
    }
    state.pendingResizeCanvasPos = null;
    clearMobilePointerGestureState();
    if (state.mode === 'pan') state.mode = null;
    else { state.mode = null; state.resizeHandle = null; }
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.target && e.target.releasePointerCapture && e.pointerId != null) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    delete state.activePointers[e.pointerId];
    if (state.mode === 'pinch' && Object.keys(state.activePointers).length < 2) {
      // 54.17: Clean up pinch state when exiting pinch mode
      state.mode = null;
      state.pinchStartDistance = 0;
      state.pinchStartCenter = null;
      clearMobilePointerGestureState();
    }
    cancelBboxRecalcDebounce();
    if (state.resizeRAFId != null) {
      cancelAnimationFrame(state.resizeRAFId);
      state.resizeRAFId = null;
    }
    state.pendingResizeCanvasPos = null;
    state.pendingResizeAltKey = false;
    state.mode = null;
    state.resizeHandle = null;
    state.marqueeStart = null;
    state.marqueeCurrent = null;
    state.previewDragX = null;
    state.previewDragY = null;
    state.dragMoveIds = [];
    state.dragRelativeOffsets = [];
    clearMobilePointerGestureState();
  });

  canvas.addEventListener('wheel', (e) => {
    if (!state.blueprintImage && state.elements.length === 0) return;
    e.preventDefault();
    const display = clientToCanvasDisplay(e.clientX, e.clientY);
    if (e.ctrlKey || e.metaKey) {
      if (!display) return;
      const sx = display.x;
      const sy = display.y;
      const contentX = (sx - state.offsetX) / state.scale;
      const contentY = (sy - state.offsetY) / state.scale;
      const factor = e.deltaY > 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      const minZoom = layoutState.viewportMode === 'mobile' ? MIN_VIEW_ZOOM_MOBILE : MIN_VIEW_ZOOM;
      const newViewZoom = Math.max(minZoom, Math.min(MAX_VIEW_ZOOM, state.viewZoom * factor));
      const newScale = state.baseScale * newViewZoom;
      if (layoutState.viewportMode === 'mobile' && newViewZoom <= (MIN_VIEW_ZOOM_MOBILE + MOBILE_FIT_PAN_LOCK_EPSILON)) {
        resetMobileFitPanState();
        state.viewZoom = MIN_VIEW_ZOOM_MOBILE;
      } else {
        state.viewZoom = newViewZoom;
        state.viewPanX = sx - contentX * newScale - state.baseOffsetX;
        state.viewPanY = sy - contentY * newScale - state.baseOffsetY;
      }
    } else {
      if (layoutState.viewportMode === 'mobile' && isMobileFitZoomLevel()) {
        applyFitPanResistance(e.deltaX, e.deltaY);
      } else {
        state.viewPanX += e.deltaX;
        state.viewPanY += e.deltaY;
      }
    }
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    const inInput = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
    const inBadgeLengthInput = e.target && e.target.id === 'badgeLengthInput';
    const cmd = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (state.badgeLengthEditElementId) {
        closeBadgeLengthPopover({ commit: false });
        return;
      }
      setSelection([]);
      state.selectedBlueprint = false;
      state.colorPaletteOpen = false;
    }
    if (!inInput && e.key === 'z' && cmd) {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    // Delete/Backspace: remove all selected elements from the canvas (Task 28.3). Never remove or alter the blueprint.
    // Works for single selection, marquee multi-select, and any element type (gutter, downpipe, bracket, etc.).
    // Allow delete when focus is in badge length input so measurable elements can be deleted from the popover.
    if ((!inInput || inBadgeLengthInput) && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (state.selectedBlueprint && state.selectedIds.length === 0) return; // blueprint only: do nothing
      if (state.selectedIds.length === 0) return;
      e.preventDefault();
      if (state.badgeLengthEditElementId) {
        closeBadgeLengthPopover({ commit: false });
      }
      pushUndoSnapshot();
      const toRemove = new Set(state.selectedIds);
      state.elements = state.elements.filter((el) => !toRemove.has(el.id));
      state.groups = state.groups.map((g) => ({
        id: g.id,
        elementIds: g.elementIds.filter((id) => !toRemove.has(id)),
      })).filter((g) => g.elementIds.length > 1);
      setSelection([]);
      updatePlaceholderVisibility();
      renderMeasurementDeck();
      draw();
    }
    if (!inInput && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedIds.length > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const toMove = getElementsToMove();
      toMove.forEach((id) => {
        const el = state.elements.find((x) => x.id === id);
        if (el) {
          if (e.key === 'ArrowUp') el.y -= step;
          else if (e.key === 'ArrowDown') el.y += step;
          else if (e.key === 'ArrowLeft') el.x -= step;
          else if (e.key === 'ArrowRight') el.x += step;
        }
      });
    }
    if (!inInput && e.key === 'd' && cmd && state.selectedIds.length > 0) {
      e.preventDefault();
      pushUndoSnapshot();
      const newIds = [];
      state.selectedIds.forEach((id) => {
        const el = state.elements.find((x) => x.id === id);
        if (el) {
          const dup = {
            ...el,
            id: 'el-' + ++elementIdCounter,
            x: el.x + 20,
            y: el.y + 20,
            zIndex: getNextElementZIndex(),
            image: el.image,
            locked: !!el.locked,
          };
          state.elements.push(dup);
          newIds.push(dup.id);
        }
      });
      setSelection(newIds);
    }
    if (!inInput && e.key === ']' && cmd && state.selectedIds.length > 0) {
      e.preventDefault();
      pushUndoSnapshot();
      const toFront = new Set(getElementsToMove());
      const rest = state.elements.filter((el) => !toFront.has(el.id));
      const moved = state.elements.filter((el) => toFront.has(el.id));
      state.elements = rest.concat(moved);
    }
    if (!inInput && e.key === 'g' && cmd && state.selectedIds.length >= 2) {
      e.preventDefault();
      pushUndoSnapshot();
      state.groups.push({
        id: 'grp-' + ++groupIdCounter,
        elementIds: state.selectedIds.slice(),
      });
    }
  });

  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (e.dataTransfer.types.includes('application/product-id')) {
      const rect = getCanvasRect();
      if (rect) {
        state.dragPreviewCanvasPos = clientToCanvas(e.clientX, e.clientY);
        draw();
      }
    }
  });

  canvas.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !state.canvas.contains(e.relatedTarget)) {
      state.dragPreviewCanvasPos = null;
      draw();
    }
  });

  canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    state.dragPreviewImage = null;
    state.dragPreviewCanvasPos = null;
    const productId = e.dataTransfer.getData('application/product-id');
    const diagramUrl = e.dataTransfer.getData('application/diagram-url');
    if (!productId || !diagramUrl) return;
    const rect = getCanvasRect();
    if (!rect) return;
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    try {
      pushUndoSnapshot();
      const img = await loadDiagramImageForDrop(diagramUrl);
      const { w, h } = elementSizeFromImage(img, getAddMaxDimensionWorld());
      // 54.18: Snap drop to grid, then nudge if overlapping existing parts
      let cx = snapToGrid(canvasPos.x);
      let cy = snapToGrid(canvasPos.y);
      const el = {
          id: 'el-' + ++elementIdCounter,
          assetId: productId,
          x: cx - w / 2,
          y: cy - h / 2,
          width: w,
          height: h,
          rotation: getDefaultRotationForLinear(productId),
          zIndex: getNextElementZIndex(),
          image: img,
          originalImage: img,
          color: null,
          baseScale: 1,
          locked: false,
          flipX: false,
          flipY: false,
        };
      const others = state.elements;
      const nudgeDirs = [[SNAP_GRID_SIZE, 0], [0, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, 0], [0, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, SNAP_GRID_SIZE]];
      for (let n = 0; n < 20; n++) {
        const overlap = others.some((o) => elementsOverlap(el, o));
        if (!overlap) break;
        const [dx, dy] = nudgeDirs[n % nudgeDirs.length];
        cx += dx;
        cy += dy;
        el.x = cx - w / 2;
        el.y = cy - h / 2;
      }
      if (isMeasurableElement(productId)) {
        el.sequenceId = state.nextSequenceId++;
        el.measuredLength = 0;
      }
      state.elements.push(el);
      setSelection([el.id]);
      if (typeof announceCanvas === 'function') announceCanvas('Product added to canvas.');
      updatePlaceholderVisibility();
      renderMeasurementDeck();
      if (layoutState.viewportMode === 'mobile') setPanelExpanded(false);
    } catch (err) {
      console.error('Failed to load diagram image', err);
    }
    draw();
  });

  canvas.addEventListener('dblclick', (e) => {
    const el = hitTestBadge(e.clientX, e.clientY);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    openBadgeLengthPopoverForElement(el.id, { source: 'badge-double-click' });
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
  });
}

async function processFileAsBlueprint(file) {
  const placeholder = document.getElementById('canvasPlaceholder');
  const toggle = document.getElementById('technicalDrawingToggle');
  if (!file) return;
  clearMessage();
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    showMessage('Please choose an image file (JPEG, PNG, GIF, or WebP).');
    return;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    showMessage(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
    return;
  }
  state.originalFile = file;
  state.technicalDrawing = toggle.checked;
  pushUndoSnapshot(); // so Cmd+Z can revert this upload (Task 14.3)
  updatePlaceholderVisibility();
  const formData = new FormData();
  formData.append('file', file);
  if (typeof setLoadingState === 'function') setLoadingState(true, 'Loading. Uploading blueprint.');
  try {
    const res = await fetch(
      `/api/process-blueprint?technical_drawing=${state.technicalDrawing}`,
      { method: 'POST', body: formData }
    );
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body.detail || res.statusText;
      } catch (_) {
        detail = await res.text() || res.statusText;
      }
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      state.blueprintImage = img;
      state.blueprintImageSourceUrl = null; // new upload, not from saved project
      state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true, opacity: 1 };
      state.viewZoom = 1;
      resetMobileFitPanState();
      URL.revokeObjectURL(url);
      updatePlaceholderVisibility();
      draw(); // Trigger full view re-fit to new blueprint
      if (typeof announceCanvas === 'function') announceCanvas('Blueprint uploaded.');
      if (typeof setLoadingState === 'function') setLoadingState(false);
    };
    img.onerror = () => {
      updatePlaceholderVisibility();
      showMessage('Failed to display the processed image.');
      if (typeof setLoadingState === 'function') setLoadingState(false);
    };
    img.src = url;
  } catch (err) {
    updatePlaceholderVisibility();
    showMessage('Upload failed: ' + (err.message || String(err)));
    if (typeof setLoadingState === 'function') setLoadingState(false);
  }
}

function initUpload() {
  const fileInput = document.getElementById('fileInput');
  const uploadZone = document.getElementById('uploadZone');
  const cameraUploadBtn = document.getElementById('cameraUploadBtn');
  const placeholder = document.getElementById('canvasPlaceholder');
  const toggle = document.getElementById('technicalDrawingToggle');
  const blueprintWrap = document.getElementById('blueprintWrap');

  // Camera icon in header: trigger file upload dialog
  if (cameraUploadBtn && fileInput) {
    cameraUploadBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // 54.84.1: Placeholder camera icon triggers same upload flow (desktop and mobile)
  const placeholderCamera = placeholder && placeholder.querySelector('.placeholder-icon');
  if (placeholderCamera && fileInput) {
    placeholderCamera.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.click();
    });
  }

  // Do not add a click handler to uploadZone: the label's for="fileInput" already activates the file input.
  // A redundant uploadZone.addEventListener('click', () => fileInput.click()) would open the file dialog twice.

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    clearMessage();
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
    const isPdf = file.type === ACCEPTED_PDF_TYPE;
    if (!isImage && !isPdf) {
      showMessage('Please choose an image file (JPEG, PNG, GIF, WebP, HEIC) or PDF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showMessage(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    if (isPdf) {
      try {
        if (typeof setLoadingState === 'function') setLoadingState(true, 'Loading. Converting PDF.');
        showMessage('Converting PDF…', 'info');
        const pngFile = await convertPdfFirstPageToPng(file);
        clearMessage();
        if (typeof setLoadingState === 'function') setLoadingState(false);
        showCropModal(pngFile);
      } catch (err) {
        const msg = err?.message || String(err);
        const userMsg = /password|encrypted|require.*pass/i.test(msg)
          ? 'This PDF is password-protected. Please remove the password and try again.'
          : /invalid|corrupt|malformed/i.test(msg)
            ? 'The PDF appears to be corrupt or invalid.'
            : 'Could not convert PDF: ' + msg;
        showMessage(userMsg);
        if (typeof setLoadingState === 'function') setLoadingState(false);
      }
    } else {
      showCropModal(file);
    }
  });

  // Drag-and-drop files onto the blueprint area
  blueprintWrap.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      blueprintWrap.classList.add('drag-over');
    }
  });
  blueprintWrap.addEventListener('dragleave', (e) => {
    if (!blueprintWrap.contains(e.relatedTarget)) {
      blueprintWrap.classList.remove('drag-over');
    }
  });
  blueprintWrap.addEventListener('drop', async (e) => {
    blueprintWrap.classList.remove('drag-over');
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(
      (f) => ACCEPTED_IMAGE_TYPES.includes(f.type) || f.type === ACCEPTED_PDF_TYPE
    );
    if (!file) {
      showMessage('Drop an image file (JPEG, PNG, GIF, WebP, HEIC) or PDF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showMessage(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    if (file.type === ACCEPTED_PDF_TYPE) {
      try {
        if (typeof setLoadingState === 'function') setLoadingState(true, 'Loading. Converting PDF.');
        showMessage('Converting PDF…', 'info');
        const pngFile = await convertPdfFirstPageToPng(file);
        clearMessage();
        if (typeof setLoadingState === 'function') setLoadingState(false);
        showCropModal(pngFile);
      } catch (err) {
        const msg = err?.message || String(err);
        const userMsg = /password|encrypted|require.*pass/i.test(msg)
          ? 'This PDF is password-protected. Please remove the password and try again.'
          : /invalid|corrupt|malformed/i.test(msg)
            ? 'The PDF appears to be corrupt or invalid.'
            : 'Could not convert PDF: ' + msg;
        showMessage(userMsg);
        if (typeof setLoadingState === 'function') setLoadingState(false);
      }
    } else {
      showCropModal(file);
    }
  });

  // Clipboard paste: Cmd+V/Ctrl+V for desktop screenshots (Phase 1, Task 30.3)
  document.addEventListener('paste', (e) => {
    if (!e.clipboardData?.items) return;
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          clearMessage();
          if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            showMessage(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
          } else {
            showCropModal(file);
          }
          break;
        }
      }
    }
  });

  toggle.addEventListener('change', async () => {
    state.technicalDrawing = toggle.checked;
    state.transparencyPopoverOpen = false;
    if (!state.originalFile) return;
    pushUndoSnapshot(); // so Cmd+Z can revert technical-drawing toggle (Task 14.3)
    clearMessage();
    const formData = new FormData();
    formData.append('file', state.originalFile);
    try {
      const res = await fetch(
        `/api/process-blueprint?technical_drawing=${state.technicalDrawing}`,
        { method: 'POST', body: formData }
      );
      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.json();
          detail = body.detail || res.statusText;
        } catch (_) {
          detail = await res.text() || res.statusText;
        }
        showMessage('Could not update blueprint: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        state.blueprintImage = img;
        state.blueprintImageSourceUrl = null; // updated from server, not from saved project URL
        state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true, opacity: 1 };
        state.viewZoom = 1;
        resetMobileFitPanState();
        URL.revokeObjectURL(url);
        updatePlaceholderVisibility();
      };
      img.onerror = () => showMessage('Failed to display the updated blueprint.');
      img.src = url;
    } catch (err) {
      showMessage('Could not update blueprint: ' + (err.message || String(err)));
    }
  });
}

function initZoomControls() {
  function stopAndPrevent(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomFitBtn = document.getElementById('zoomFitBtn');

  zoomOutBtn?.addEventListener('click', (e) => {
    stopAndPrevent(e);
    const minZoom = layoutState.viewportMode === 'mobile' ? MIN_VIEW_ZOOM_MOBILE : MIN_VIEW_ZOOM;
    const nextZoom = Math.max(minZoom, state.viewZoom / ZOOM_BUTTON_FACTOR);
    state.viewZoom = nextZoom;
    if (layoutState.viewportMode === 'mobile' && isMobileFitZoomLevel(nextZoom)) {
      resetMobileFitPanState();
      state.viewZoom = MIN_VIEW_ZOOM_MOBILE;
    }
    draw();
  });
  zoomInBtn?.addEventListener('click', (e) => {
    stopAndPrevent(e);
    state.viewZoom = Math.min(MAX_VIEW_ZOOM, state.viewZoom * ZOOM_BUTTON_FACTOR);
    if (state.viewZoom > MIN_VIEW_ZOOM_MOBILE) {
      state.fitPanFeedbackX = 0;
      state.fitPanFeedbackY = 0;
    }
    draw();
  });
  zoomFitBtn?.addEventListener('click', (e) => {
    stopAndPrevent(e);
    state.viewZoom = 1;
    resetMobileFitPanState();
    draw();
  });
}

function initExport() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const { canvas, ctx, blueprintImage, elements, scale, offsetX, offsetY } = state;
    if (!canvas || !ctx) return;
    if (!blueprintImage && elements.length === 0) {
      showMessage('Upload a property photo or add products to the blueprint before exporting.');
      return;
    }
    clearMessage();
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ex = exportCanvas.getContext('2d');
    const exportLayers = [];
    if (blueprintImage && state.blueprintTransform) {
      const bt = state.blueprintTransform;
      exportLayers.push({ zIndex: bt.zIndex != null ? bt.zIndex : BLUEPRINT_Z_INDEX, type: 'blueprint', bt, img: blueprintImage });
    } else if (blueprintImage) {
      const scaleFit = Math.min(w / blueprintImage.width, h / blueprintImage.height);
      const ox = (w - blueprintImage.width * scaleFit) / 2;
      const oy = (h - blueprintImage.height * scaleFit) / 2;
      exportLayers.push({ zIndex: BLUEPRINT_Z_INDEX, type: 'blueprint-fit', img: blueprintImage, ox, oy, scaleFit });
    }
    elements.forEach((el) => {
      exportLayers.push({ zIndex: el.zIndex != null ? el.zIndex : 0, type: 'element', element: el });
    });
    exportLayers.sort((a, b) => a.zIndex - b.zIndex);
    exportLayers.forEach((layer) => {
      if (layer.type === 'blueprint') {
        const { bt, img } = layer;
        const cx = offsetX + bt.x * scale + (bt.w * scale) / 2;
        const cy = offsetY + bt.y * scale + (bt.h * scale) / 2;
        ex.save();
        ex.globalAlpha = bt.opacity ?? 1;
        ex.translate(cx, cy);
        ex.rotate(((bt.rotation || 0) * Math.PI) / 180);
        ex.translate(-(bt.w * scale) / 2, -(bt.h * scale) / 2);
        ex.drawImage(img, 0, 0, bt.w * scale, bt.h * scale);
        ex.restore();
      } else if (layer.type === 'blueprint-fit') {
        const { img, ox, oy, scaleFit } = layer;
        ex.drawImage(img, ox, oy, img.width * scaleFit, img.height * scaleFit);
      } else if (layer.type === 'element') {
        const el = layer.element;
        const renderImage = getElementRenderImage(el);
        if (renderImage) {
          ex.save();
          const cx = offsetX + el.x * scale + (el.width * scale) / 2;
          const cy = offsetY + el.y * scale + (el.height * scale) / 2;
          ex.translate(cx, cy);
          ex.rotate((el.rotation * Math.PI) / 180);
          ex.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
          const ew = el.width * scale;
          const eh = el.height * scale;
          const exportTinted = el.color && el.tintedCanvas && renderImage === el.tintedCanvas;
          let prevExQe, prevExQq;
          if (exportTinted) {
            prevExQe = ex.imageSmoothingEnabled;
            prevExQq = ex.imageSmoothingQuality;
            ex.imageSmoothingEnabled = true;
            ex.imageSmoothingQuality = 'high';
          }
          ex.drawImage(renderImage, -ew / 2, -eh / 2, ew, eh);
          if (exportTinted) {
            ex.imageSmoothingEnabled = prevExQe;
            ex.imageSmoothingQuality = prevExQq;
          }
          ex.restore();
        }
      }
    });
    const link = document.createElement('a');
    link.download = 'blueprint.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  });
}

/**
 * Render current blueprint + elements to a PNG and return as data URL, or null if nothing to export.
 * Used for ServiceM8 job attachment upload (same output as Export PNG).
 * @returns {string|null} data URL (data:image/png;base64,...) or null
 */
function getExportCanvasDataURL() {
  const { canvas, ctx, blueprintImage, elements, scale, offsetX, offsetY } = state;
  if (!canvas || !ctx) return null;
  if (!blueprintImage && elements.length === 0) return null;
  const w = state.canvasWidth;
  const h = state.canvasHeight;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = w;
  exportCanvas.height = h;
  const ex = exportCanvas.getContext('2d');
  if (!ex) return null;
  const exportLayers = [];
  if (blueprintImage && state.blueprintTransform) {
    const bt = state.blueprintTransform;
    exportLayers.push({ zIndex: bt.zIndex != null ? bt.zIndex : BLUEPRINT_Z_INDEX, type: 'blueprint', bt, img: blueprintImage });
  } else if (blueprintImage) {
    const scaleFit = Math.min(w / blueprintImage.width, h / blueprintImage.height);
    const ox = (w - blueprintImage.width * scaleFit) / 2;
    const oy = (h - blueprintImage.height * scaleFit) / 2;
    exportLayers.push({ zIndex: BLUEPRINT_Z_INDEX, type: 'blueprint-fit', img: blueprintImage, ox, oy, scaleFit });
  }
  elements.forEach((el) => {
    exportLayers.push({ zIndex: el.zIndex != null ? el.zIndex : 0, type: 'element', element: el });
  });
  exportLayers.sort((a, b) => a.zIndex - b.zIndex);
  exportLayers.forEach((layer) => {
    if (layer.type === 'blueprint') {
      const { bt, img } = layer;
      const cx = offsetX + bt.x * scale + (bt.w * scale) / 2;
      const cy = offsetY + bt.y * scale + (bt.h * scale) / 2;
      ex.save();
      ex.globalAlpha = bt.opacity ?? 1;
      ex.translate(cx, cy);
      ex.rotate(((bt.rotation || 0) * Math.PI) / 180);
      ex.translate(-(bt.w * scale) / 2, -(bt.h * scale) / 2);
      ex.drawImage(img, 0, 0, bt.w * scale, bt.h * scale);
      ex.restore();
    } else if (layer.type === 'blueprint-fit') {
      const { img, ox, oy, scaleFit } = layer;
      ex.drawImage(img, ox, oy, img.width * scaleFit, img.height * scaleFit);
    } else if (layer.type === 'element') {
      const el = layer.element;
      const renderImage = getElementRenderImage(el);
      if (renderImage) {
        ex.save();
        const cx = offsetX + el.x * scale + (el.width * scale) / 2;
        const cy = offsetY + el.y * scale + (el.height * scale) / 2;
        ex.translate(cx, cy);
        ex.rotate((el.rotation * Math.PI) / 180);
        ex.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
        const ew = el.width * scale;
        const eh = el.height * scale;
        const exportTinted = el.color && el.tintedCanvas && renderImage === el.tintedCanvas;
        let prevExQe, prevExQq;
        if (exportTinted) {
          prevExQe = ex.imageSmoothingEnabled;
          prevExQq = ex.imageSmoothingQuality;
          ex.imageSmoothingEnabled = true;
          ex.imageSmoothingQuality = 'high';
        }
        ex.drawImage(renderImage, -ew / 2, -eh / 2, ew, eh);
        if (exportTinted) {
          ex.imageSmoothingEnabled = prevExQe;
          ex.imageSmoothingQuality = prevExQq;
        }
        ex.restore();
      }
    }
  });
  return exportCanvas.toDataURL('image/png');
}

/** Serializable diagram payload for API (no blueprintImageRef). */
function getDiagramDataForSave() {
  const data = {
    elements: state.elements.map((el) => ({
      id: el.id,
      assetId: el.assetId,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation || 0,
      zIndex: el.zIndex,
      color: el.color || null,
      baseScale: el.baseScale ?? 1,
      locked: !!el.locked,
      flipX: !!el.flipX,
      flipY: !!el.flipY,
      sequenceId: el.sequenceId != null ? el.sequenceId : undefined,
      measuredLength: el.measuredLength != null ? el.measuredLength : 0,
    })),
    blueprintTransform: state.blueprintTransform ? { ...state.blueprintTransform, locked: !!state.blueprintTransform.locked } : null,
    hasBlueprint: !!state.blueprintImage,
    groups: state.groups.map((g) => ({ id: g.id, elementIds: g.elementIds.slice() })),
  };
  let blueprintImageBase64 = null;
  let thumbnailBase64 = null;
  if (state.blueprintImage && state.blueprintTransform) {
    const bt = state.blueprintTransform;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bt.w));
    c.height = Math.max(1, Math.round(bt.h));
    const ctx = c.getContext('2d');
    if (ctx) {
      try {
        ctx.globalAlpha = bt.opacity ?? 1;
        ctx.drawImage(state.blueprintImage, 0, 0, c.width, c.height);
        blueprintImageBase64 = c.toDataURL('image/png');
      } catch (e) {
        // Tainted canvas (e.g. cross-origin blueprint from Storage without CORS) — leave base64 null; caller may send blueprintImageSourceUrl
        if (typeof console !== 'undefined' && console.warn) console.warn('Blueprint canvas export skipped (tainted or error):', e);
      }
    }
  }
  const hasContent = state.blueprintImage || state.elements.length > 0;
  if (hasContent && state.canvas && state.ctx) {
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const tw = 200;
    const th = 150;
    const scale = Math.min(tw / w, th / h);
    const tc = document.createElement('canvas');
    tc.width = tw;
    tc.height = th;
    const tx = tc.getContext('2d');
    if (tx) {
      try {
        tx.fillStyle = '#f5f5f5';
        tx.fillRect(0, 0, tw, th);
        tx.scale(scale, scale);
        const { blueprintImage, elements } = state;
        const layers = [];
        if (blueprintImage && state.blueprintTransform) {
          const bt = state.blueprintTransform;
          layers.push({ zIndex: bt.zIndex != null ? bt.zIndex : BLUEPRINT_Z_INDEX, type: 'blueprint', bt, img: blueprintImage });
        }
        elements.forEach((el) => layers.push({ zIndex: el.zIndex != null ? el.zIndex : 0, type: 'element', element: el }));
        layers.sort((a, b) => a.zIndex - b.zIndex);
        layers.forEach((layer) => {
          if (layer.type === 'blueprint') {
            const { bt, img } = layer;
            tx.save();
            tx.globalAlpha = bt.opacity ?? 1;
            tx.translate(bt.x + bt.w / 2, bt.y + bt.h / 2);
            tx.rotate(((bt.rotation || 0) * Math.PI) / 180);
            tx.translate(-bt.w / 2, -bt.h / 2);
            tx.drawImage(img, 0, 0, bt.w, bt.h);
            tx.restore();
          } else if (layer.type === 'element') {
            const el = layer.element;
            const renderImage = getElementRenderImage(el);
            if (renderImage) {
              tx.save();
              tx.translate(el.x + el.width / 2, el.y + el.height / 2);
              tx.rotate((el.rotation * Math.PI) / 180);
              tx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
              tx.drawImage(renderImage, -el.width / 2, -el.height / 2, el.width, el.height);
              tx.restore();
            }
          }
        });
        thumbnailBase64 = tc.toDataURL('image/png');
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Thumbnail export skipped (tainted or error):', e);
      }
    }
  }
  return { data, blueprintImageBase64, thumbnailBase64 };
}

/**
 * Auto-save current diagram with a ServiceM8 Job # stamp (after Add to Job or Create New Job).
 * Creates a new saved project with name "ProjectName (Job #123)" and servicem8JobId set.
 */
function autoSaveDiagramWithJobNumber(jobNumber) {
  if (!jobNumber || !authState.token) return;
  const projectNameInput = document.getElementById('toolbarProjectNameInput');
  const projectName = (projectNameInput?.value || '').trim() || 'Untitled';
  const name = projectName + ' (Job #' + jobNumber + ')';
  const { data, blueprintImageBase64, thumbnailBase64 } = getDiagramDataForSave();
  const body = {
    name,
    data,
    blueprintImageBase64: blueprintImageBase64 || undefined,
    blueprintImageUrl: (!blueprintImageBase64 && state.blueprintImageSourceUrl) ? state.blueprintImageSourceUrl : undefined,
    thumbnailBase64: thumbnailBase64 || undefined,
    servicem8JobId: String(jobNumber),
  };
  fetch('/api/diagrams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
    .then((res) => {
      if (res.ok) {
        if (typeof window.__quoteAppRefreshDiagramsList === 'function') window.__quoteAppRefreshDiagramsList();
        showMessage('Project saved with Job #' + jobNumber + '.', 'success');
      }
    })
    .catch(() => {});
}

/** Restore canvas from API snapshot (no blueprintImageRef; optional blueprint_image_url). */
async function restoreStateFromApiSnapshot(apiSnapshot) {
  const d = apiSnapshot.data || {};
  state.elements = await Promise.all(
    (d.elements || []).map(async (el) => {
      const img = await loadDiagramImage(getDiagramUrl(el.assetId));
      return {
        ...el,
        image: img,
        originalImage: img,
        tintedCanvas: null,
        tintedCanvasColor: null,
      };
    })
  );
  state.groups = (d.groups || []).map((g) => ({ id: g.id, elementIds: g.elementIds.slice() }));
  let maxSeq = 0;
  state.elements.forEach((el) => {
    if (el.sequenceId != null && el.sequenceId > maxSeq) maxSeq = el.sequenceId;
  });
  state.nextSequenceId = maxSeq + 1;
  if (!d.hasBlueprint) {
    state.blueprintImage = null;
    state.blueprintTransform = null;
    state.blueprintImageSourceUrl = null;
  } else {
    state.blueprintTransform = d.blueprintTransform ? { ...d.blueprintTransform } : null;
    if (apiSnapshot.blueprintImageUrl) {
      try {
        const img = await loadImage(apiSnapshot.blueprintImageUrl);
        state.blueprintImage = img;
        state.blueprintImageSourceUrl = apiSnapshot.blueprintImageUrl; // so we can re-persist if canvas export fails (CORS)
        if (!state.blueprintTransform && img) {
          state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true, opacity: 1 };
        }
      } catch (err) {
        console.warn('Failed to load blueprint image from URL', err);
        state.blueprintImage = null;
        state.blueprintImageSourceUrl = null;
        showMessage('Blueprint image could not be loaded.', 'info');
      }
    } else {
      state.blueprintImage = null;
      state.blueprintImageSourceUrl = null;
      if (d.hasBlueprint) showMessage('Blueprint image was not saved with this project.', 'info');
    }
  }
  setSelection([]);
  state.selectedBlueprint = false;
  undoHistory.length = 0;
  redoHistory.length = 0;
  updatePlaceholderVisibility();
  renderMeasurementDeck();
  draw();
}

function initAuth() {
  const authForm = document.getElementById('authForm');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authPasskeyBtn = document.getElementById('authPasskeyBtn');
  const authPasskeyHint = document.getElementById('authPasskeyHint');
  const authSignUpBtn = document.getElementById('authSignUpBtn');
  const authError = document.getElementById('authError');
  const authUserSection = document.getElementById('authUserSection');
  const authUserEmail = document.getElementById('authUserEmail');
  const authSignOutBtn = document.getElementById('authSignOutBtn');
  const userProfileWrap = document.getElementById('userProfileWrap');
  const userAvatar = document.getElementById('userAvatar');
  const profileDropdown = document.getElementById('profileDropdown');
  const menuItemProducts = document.getElementById('menuItemProducts');
  const menuItemSignOut = document.getElementById('menuItemSignOut');
  const productsProfileWrap = document.getElementById('productsProfileWrap');
  const productsUserAvatar = document.getElementById('productsUserAvatar');
  let passkeyAvailable = false;
  if (!authForm) return Promise.resolve();

  function setPasswordAutocompleteMode(mode) {
    if (authEmail) {
      authEmail.setAttribute('autocomplete', 'username webauthn');
      authEmail.setAttribute('inputmode', 'email');
      authEmail.setAttribute('autocapitalize', 'none');
      authEmail.setAttribute('spellcheck', 'false');
    }
    if (!authPassword) return;
    authPassword.setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
    authPassword.setAttribute('autocapitalize', 'none');
    authPassword.setAttribute('spellcheck', 'false');
  }

  function getPasskeySignInFn() {
    const api = authState.supabase?.auth;
    if (!api) return null;
    if (typeof api.signInWithWebAuthn === 'function') return api.signInWithWebAuthn.bind(api);
    if (typeof api.signInWithPasskey === 'function') return api.signInWithPasskey.bind(api);
    return null;
  }

  async function detectPasskeySupport() {
    if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return false;
    const signInFn = getPasskeySignInFn();
    if (!signInFn) return false;
    try {
      if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) return false;
      }
    } catch (_) {
      return false;
    }
    return true;
  }

  async function refreshPasskeyUi() {
    if (!authPasskeyBtn) return;
    passkeyAvailable = await detectPasskeySupport();
    authPasskeyBtn.hidden = !passkeyAvailable;
    authPasskeyBtn.disabled = !passkeyAvailable;
    if (authPasskeyHint) authPasskeyHint.hidden = !passkeyAvailable;
  }

  function setAuthUI() {
    if (authState.token) {
      if (userProfileWrap) userProfileWrap.hidden = false;
      if (productsProfileWrap) productsProfileWrap.hidden = false;
      if (profileDropdown) profileDropdown.hidden = true;
      updateUserProfile();
      if (authUserSection) authUserSection.hidden = false;
      if (authForm) authForm.hidden = true;
      if (authUserEmail) authUserEmail.textContent = authState.email || 'Signed in';
    } else {
      if (userProfileWrap) userProfileWrap.hidden = true;
      if (productsProfileWrap) productsProfileWrap.hidden = true;
      if (authUserSection) authUserSection.hidden = true;
      if (authForm) authForm.hidden = false;
    }
    if (!authState.token) {
      setPasswordAutocompleteMode('signin');
      refreshPasskeyUi().catch(() => {});
    }
  }

  function bindButtonLikeKeyActivation(el) {
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      el.click();
    });
  }

  bindButtonLikeKeyActivation(userAvatar);
  bindButtonLikeKeyActivation(productsUserAvatar);

  if (userAvatar && profileDropdown) {
    userAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = !profileDropdown.hidden;
      profileDropdown.hidden = wasOpen;
      userAvatar.setAttribute('aria-expanded', profileDropdown.hidden ? 'false' : 'true');
      if (!profileDropdown.hidden) collapseDiagramToolbarIfExpanded();
    });
  }
  if (menuItemProducts) {
    menuItemProducts.addEventListener('click', () => {
      if (profileDropdown) profileDropdown.hidden = true;
      if (userAvatar) userAvatar.setAttribute('aria-expanded', 'false');
      switchView('view-products', { triggerEl: userAvatar || menuItemProducts });
    });
  }
  if (menuItemSignOut) {
    menuItemSignOut.addEventListener('click', () => {
      authState.token = null;
      authState.email = null;
      authState.user = null;
      if (authState.supabase) authState.supabase.auth.signOut();
      setAuthUI();
      if (profileDropdown) profileDropdown.hidden = true;
      if (userAvatar) userAvatar.setAttribute('aria-expanded', 'false');
      switchView('view-login');
      loadPanelProducts();
    });
  }
  if (productsUserAvatar) {
    productsUserAvatar.addEventListener('click', () => {
      authState.token = null;
      authState.email = null;
      authState.user = null;
      if (authState.supabase) authState.supabase.auth.signOut();
      setAuthUI();
      switchView('view-login');
      loadPanelProducts();
    });
  }

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setPasswordAutocompleteMode('signin');
    if (!authState.supabase || !authEmail?.value || !authPassword?.value) return;
    if (authError) { authError.hidden = true; authError.textContent = ''; }
    authSubmitBtn.disabled = true;
    try {
      const { data, error } = await authState.supabase.auth.signInWithPassword({ email: authEmail.value.trim(), password: authPassword.value });
      if (error) throw error;
      authState.token = data.session?.access_token ?? null;
      authState.email = data.user?.email ?? null;
      authState.user = data.user ?? null;
      setAuthUI();
      switchView('view-canvas');
      await checkServiceM8Status();
      if (window.servicem8Connected === false) {
        await startServiceM8Connect();
      }
    } catch (err) {
      if (authError) { authError.hidden = false; authError.textContent = err.message || 'Sign in failed'; }
    }
    authSubmitBtn.disabled = false;
  });

  authPasskeyBtn?.addEventListener('click', async () => {
    if (!authState.supabase) return;
    if (authError) { authError.hidden = true; authError.textContent = ''; }
    authPasskeyBtn.disabled = true;
    try {
      const signInFn = getPasskeySignInFn();
      if (!signInFn) {
        throw new Error('Passkeys are not enabled for this project yet.');
      }
      const email = (authEmail?.value || '').trim();
      let result = null;
      if (email) {
        try {
          result = await signInFn({ email });
        } catch (_) {
          result = await signInFn();
        }
      } else {
        result = await signInFn();
      }
      if (result?.error) throw result.error;

      let session = result?.data?.session || null;
      let user = result?.data?.user || session?.user || null;
      if (!session) {
        const current = await authState.supabase.auth.getSession();
        session = current?.data?.session || null;
        if (!user) user = session?.user || null;
      }
      if (!session) {
        throw new Error('Passkey sign-in did not complete. Check Supabase passkey settings and try again.');
      }

      authState.token = session.access_token ?? null;
      authState.email = user?.email ?? null;
      authState.user = user ?? null;
      setAuthUI();
      switchView('view-canvas');
      await checkServiceM8Status();
      if (window.servicem8Connected === false) {
        await startServiceM8Connect();
      }
    } catch (err) {
      if (authError) { authError.hidden = false; authError.textContent = err.message || 'Passkey sign in failed'; }
    } finally {
      authPasskeyBtn.disabled = !passkeyAvailable;
    }
  });

  authSignUpBtn?.addEventListener('click', async () => {
    setPasswordAutocompleteMode('signup');
    if (!authState.supabase || !authEmail?.value || !authPassword?.value) return;
    if (authError) { authError.hidden = true; authError.textContent = ''; }
    authSignUpBtn.disabled = true;
    try {
      const { data, error } = await authState.supabase.auth.signUp({ email: authEmail.value.trim(), password: authPassword.value });
      if (error) throw error;
      authState.token = data.session?.access_token ?? null;
      authState.email = data.user?.email ?? null;
      authState.user = data.user ?? null;
      setAuthUI();
      switchView('view-canvas');
      checkServiceM8Status();
      showMessage('Account created. You can sign in and save diagrams.', 'success');
    } catch (err) {
      if (authError) { authError.hidden = false; authError.textContent = err.message || 'Sign up failed'; }
    }
    authSignUpBtn.disabled = false;
  });

  authSignOutBtn?.addEventListener('click', () => {
    authState.token = null;
    authState.email = null;
    authState.user = null;
    if (authState.supabase) authState.supabase.auth.signOut();
    setAuthUI();
    switchView('view-login');
    loadPanelProducts();
  });

  const authForgotPasswordBtn = document.getElementById('authForgotPasswordBtn');
  const authSetPasswordForm = document.getElementById('authSetPasswordForm');
  const authSetPasswordError = document.getElementById('authSetPasswordError');
  const authNewPassword = document.getElementById('authNewPassword');
  const authNewPasswordConfirm = document.getElementById('authNewPasswordConfirm');
  const authSetPasswordCancelBtn = document.getElementById('authSetPasswordCancelBtn');

  authForgotPasswordBtn?.addEventListener('click', async () => {
    const email = authEmail?.value?.trim();
    if (!email) {
      if (authError) { authError.hidden = false; authError.textContent = 'Enter your email above, then click Forgot password.'; }
      return;
    }
    if (!authState.supabase) return;
    if (authError) { authError.hidden = true; authError.textContent = ''; }
    authForgotPasswordBtn.disabled = true;
    try {
      const redirectTo = `${window.location.origin}/`;
      const { error } = await authState.supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      if (authError) { authError.hidden = false; authError.textContent = ''; authError.style.color = ''; authError.textContent = 'Check your email for a link to set your password.'; authError.style.color = '#166534'; }
    } catch (err) {
      if (authError) { authError.hidden = false; authError.textContent = err.message || 'Could not send reset email.'; }
    }
    authForgotPasswordBtn.disabled = false;
  });

  authSetPasswordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = authNewPassword?.value ?? '';
    const confirmPass = authNewPasswordConfirm?.value ?? '';
    if (newPass.length < 6) {
      if (authSetPasswordError) { authSetPasswordError.hidden = false; authSetPasswordError.textContent = 'Password must be at least 6 characters.'; }
      return;
    }
    if (newPass !== confirmPass) {
      if (authSetPasswordError) { authSetPasswordError.hidden = false; authSetPasswordError.textContent = 'Passwords do not match.'; }
      return;
    }
    if (!authState.supabase) return;
    if (authSetPasswordError) authSetPasswordError.hidden = true;
    const btn = document.getElementById('authSetPasswordBtn');
    if (btn) btn.disabled = true;
    try {
      const { error } = await authState.supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      if (authForm) authForm.hidden = false;
      authSetPasswordForm.hidden = true;
      authNewPassword.value = '';
      authNewPasswordConfirm.value = '';
      setAuthUI();
      switchView('view-canvas');
    } catch (err) {
      if (authSetPasswordError) { authSetPasswordError.hidden = false; authSetPasswordError.textContent = err.message || 'Could not set password.'; }
    }
    if (btn) btn.disabled = false;
  });

  authSetPasswordCancelBtn?.addEventListener('click', () => {
    authSetPasswordForm.hidden = true;
    if (authForm) authForm.hidden = false;
    if (authSetPasswordError) authSetPasswordError.hidden = true;
    authNewPassword.value = '';
    authNewPasswordConfirm.value = '';
  });

  setAuthUI();
  setPasswordAutocompleteMode('signin');
  refreshPasskeyUi().catch(() => {});
  return fetch('/api/config')
    .then((r) => r.json())
    .then((config) => {
      const resolvedConfig = config || {};
      configurePwaFromConfig(resolvedConfig);
      if (resolvedConfig.supabaseUrl && resolvedConfig.anonKey && typeof window.supabase !== 'undefined') {
        authState.supabase = window.supabase.createClient(resolvedConfig.supabaseUrl, resolvedConfig.anonKey);
        refreshPasskeyUi().catch(() => {});
        authState.supabase.auth.onAuthStateChange((event, session) => {
          authState.token = session?.access_token ?? null;
          authState.email = session?.user?.email ?? null;
          authState.user = session?.user ?? null;
          setAuthUI();
          loadPanelProducts();
          checkServiceM8Status();
          if (event === 'PASSWORD_RECOVERY') {
            const authFormEl = document.getElementById('authForm');
            const setPasswordForm = document.getElementById('authSetPasswordForm');
            const authUserSection = document.getElementById('authUserSection');
            if (authFormEl) authFormEl.hidden = true;
            if (authUserSection) authUserSection.hidden = true;
            if (setPasswordForm) { setPasswordForm.hidden = false; document.getElementById('authNewPassword')?.focus(); }
          }
        });
        return authState.supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
          authState.token = session.access_token;
          authState.email = session.user?.email ?? null;
          authState.user = session.user ?? null;
          setAuthUI();
          checkServiceM8Status();
        }
        });
      }
    })
    .then(() => {})
    .catch(() => {});
}

/**
 * Check if user has connected ServiceM8 account.
 * Updates UI to show "Connect" or "Disconnect" accordingly.
 */
/**
 * Show toolbar ServiceM8 warning only when explicitly not connected (Task 52.9).
 * When status is unknown (undefined) or connected, keep the symbol hidden.
 */
function updateServicem8ToolbarWarning() {
  const el = document.getElementById('servicem8ExportWarning');
  const wrap = el?.closest('.toolbar-servicem8-warning-wrap');
  if (!el) return;
  const visible = window.servicem8Connected === false;
  el.hidden = !visible;
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (wrap) wrap.classList.toggle('toolbar-servicem8-warning-wrap--active', visible);
}

/**
 * Hover popover for ServiceM8 warning: red warning message + "Connect ServiceM8" link.
 * Link opens profile and triggers Connect ServiceM8, or switches to login if not signed in.
 * Uses the wrap as hover target so there is always a hit area when the warning is active.
 */
function initServicem8WarningPopover() {
  const trigger = document.getElementById('servicem8ExportWarning');
  const wrap = trigger?.closest('.toolbar-servicem8-warning-wrap');
  const popover = document.getElementById('servicem8WarningPopover');
  const link = document.getElementById('servicem8WarningPopoverLink');
  if (!trigger || !wrap || !popover || !link) return;

  let hideTimeout = null;

  function positionAndShow() {
    if (window.servicem8Connected !== false) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    if (popover.parentNode !== document.body) document.body.appendChild(popover);
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + 6}px`;
    popover.hidden = false;
    link.textContent = authState.token ? 'Connect ServiceM8' : 'Sign in';
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  function scheduleHide() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      popover.hidden = true;
      hideTimeout = null;
    }, 200);
  }

  function cancelHide() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  wrap.addEventListener('mouseenter', positionAndShow);
  wrap.addEventListener('mouseleave', scheduleHide);
  popover.addEventListener('mouseenter', cancelHide);
  popover.addEventListener('mouseleave', () => {
    popover.hidden = true;
  });

  link.addEventListener('click', (e) => {
    e.preventDefault();
    popover.hidden = true;
    if (authState.token) {
      const profileDropdown = document.getElementById('profileDropdown');
      const userAvatar = document.getElementById('userAvatar');
      const menuItem = document.getElementById('menuItemServiceM8');
      if (profileDropdown && userAvatar) {
        collapseDiagramToolbarIfExpanded();
        profileDropdown.hidden = false;
        userAvatar.setAttribute('aria-expanded', 'true');
      }
      if (menuItem) menuItem.click();
    } else {
      switchView('view-login');
      showMessage('Sign in first to connect ServiceM8', 'error');
    }
  });
}

async function checkServiceM8Status() {
  if (!authState.token) {
    const menuItem = document.getElementById('menuItemServiceM8');
    if (menuItem) menuItem.style.display = 'none';
    window.servicem8Connected = false;
    updateServicem8ToolbarWarning();
    return;
  }

  try {
    const resp = await fetch('/api/servicem8/oauth/status', {
      headers: {
        'Authorization': `Bearer ${authState.token}`,
      },
    });
    const data = await resp.json();
    const menuText = document.getElementById('servicem8MenuText');
    const menuItem = document.getElementById('menuItemServiceM8');
    if (menuText) {
      menuText.textContent = data.connected ? 'Disconnect ServiceM8' : 'Connect ServiceM8';
    }
    if (menuItem) {
      menuItem.style.display = 'block';
    }
    window.servicem8Connected = data.connected || false;
    updateServicem8ToolbarWarning();
    // Update quote modal ServiceM8 section state if modal is open
    const modal = document.getElementById('quoteModal');
    if (modal && !modal.hasAttribute('hidden')) {
      const hasIncomplete = /* check existing logic */ false; // Will be updated when quote modal opens
      updateServiceM8SectionState(hasIncomplete);
    }
  } catch (e) {
    console.error('Failed to check ServiceM8 status:', e);
    window.servicem8Connected = false;
    updateServicem8ToolbarWarning();
  }
}

/**
 * Start ServiceM8 OAuth connect flow (fetch authorize URL and redirect).
 * Returns true if redirect was initiated, false otherwise.
 */
async function startServiceM8Connect() {
  if (!authState.token) return false;
  try {
    const resp = await fetch('/api/servicem8/oauth/authorize', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authState.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to start ServiceM8 connection');
    }
    const data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
      return true;
    }
    throw new Error('No URL returned');
  } catch (e) {
    console.error('Connect ServiceM8 failed:', e);
    showMessage(e.message || 'Could not connect to ServiceM8. Please try again.', 'error');
    return false;
  }
}

/**
 * Initialize ServiceM8 menu item click handler.
 */
function initServiceM8Menu() {
  const menuItem = document.getElementById('menuItemServiceM8');
  if (!menuItem) return;

  menuItem.addEventListener('click', async () => {
    if (!authState.token) {
      showMessage('Please sign in first', 'error');
      return;
    }

    if (window.servicem8Connected) {
      // Disconnect
      const confirmed = await showAppConfirm('Disconnect ServiceM8 account?', {
        title: 'Disconnect ServiceM8',
        confirmText: 'Disconnect',
        destructive: true,
        triggerEl: menuItem,
      });
      if (!confirmed) return;
      try {
        const resp = await fetch('/api/servicem8/oauth/disconnect', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authState.token}`,
          },
        });
        if (resp.ok) {
          window.servicem8Connected = false;
          const menuText = document.getElementById('servicem8MenuText');
          if (menuText) menuText.textContent = 'Connect ServiceM8';
          showToolbarMessage('ServiceM8 disconnected', 'success');
          // Update quote modal if open
          const modal = document.getElementById('quoteModal');
          if (modal && !modal.hasAttribute('hidden')) {
            const hasIncomplete = false; // Will be recalculated
            updateServiceM8SectionState(hasIncomplete);
          }
        } else {
          showToolbarMessage('Failed to disconnect ServiceM8', 'error');
        }
      } catch (e) {
        console.error('Disconnect failed:', e);
        showToolbarMessage('Failed to disconnect ServiceM8', 'error');
      }
    } else {
      await startServiceM8Connect();
    }
  });
}

/**
 * Check for OAuth callback result in URL params.
 * Called on page load to handle ServiceM8 redirect.
 * Must be called AFTER auth is restored (authState.token is set).
 */
function checkOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const servicem8Result = urlParams.get('servicem8');
  if (servicem8Result === 'connected') {
    showToolbarMessage('ServiceM8 connected successfully!', 'success');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    // Refresh status (only if auth is ready)
    if (authState.token) {
      checkServiceM8Status();
    }
    // If auth not ready yet, checkServiceM8Status() will be called by initAuth() after session restore
  } else if (servicem8Result === 'error') {
    showToolbarMessage('ServiceM8 connection failed. Please try again.', 'error');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

/**
 * Upload an SVG file to the product-diagrams bucket. Requires the user to be logged in.
 * @param {File} file - The SVG file to upload
 * @returns {Promise<string>} The public URL of the uploaded file
 */
async function uploadProductSVG(file) {
  if (!authState.user) {
    throw new Error('You must be logged in to upload products');
  }
  const supabase = authState.supabase;
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  const path = `${authState.user.id}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from('product-diagrams').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('product-diagrams').getPublicUrl(path);
  return data.publicUrl;
}

function initProductsView() {
  const btnBackToCanvas = document.getElementById('btnBackToCanvas');
  if (btnBackToCanvas) {
    btnBackToCanvas.addEventListener('click', () => switchView('view-canvas'));
  }

  const productLibrarySearch = document.getElementById('productLibrarySearch');
  const productFilterProfile = document.getElementById('productFilterProfile');
  if (productLibrarySearch) {
    productLibrarySearch.addEventListener('input', () => filterLibraryGrid());
  }
  if (productFilterProfile) {
    productFilterProfile.addEventListener('change', () => filterLibraryGrid());
  }

  // Legacy: localStorage no longer used; Supabase is source of truth
  // try {
  //   const stored = localStorage.getItem('custom_products');
  //   localProducts = stored ? JSON.parse(stored) : [];
  // } catch (_) {
  //   localProducts = [];
  // }

  const productModal = document.getElementById('productModal');
  const productCardNew = document.getElementById('productCardNew');
  const dropZone = document.getElementById('dropZone');
  const dropZoneContent = dropZone?.querySelector('.drop-zone-content');
  const filePreview = document.getElementById('filePreview');
  const previewSvgContainer = document.getElementById('previewSvgContainer');
  const productModalFileInput = document.getElementById('productModalFileInput');
  const btnRemoveFile = document.getElementById('btnRemoveFile');
  const productForm = document.getElementById('productForm');
  const inputProductId = document.getElementById('inputProductId');
  const inputProductName = document.getElementById('inputProductName');
  const inputProductCategory = document.getElementById('inputProductCategory');
  const inputItemNumber = document.getElementById('inputItemNumber');
  const inputCostPrice = document.getElementById('inputCostPrice');
  const inputMarkupPercentage = document.getElementById('inputMarkupPercentage');
  const inputPriceExcGst = document.getElementById('inputPriceExcGst');
  const inputUnit = document.getElementById('inputUnit');
  const inputProfile = document.getElementById('inputProfile');
  const inputThumbnailUrl = document.getElementById('inputThumbnailUrl');
  const inputDiagramUrl = document.getElementById('inputDiagramUrl');
  const inputServicem8Uuid = document.getElementById('inputServicem8Uuid');
  const btnCancelProduct = document.getElementById('btnCancelProduct');
  const btnSaveProduct = document.getElementById('btnSaveProduct');
  const btnArchiveProduct = document.getElementById('btnArchiveProduct');
  const isMobileSvgUploadDisabled =
    typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && (window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches);

  function notifyMobileSvgUploadDisabled() {
    showMessage('SVG product upload is desktop-only in this MVP.', 'info');
  }

  if (isMobileSvgUploadDisabled && productCardNew) {
    productCardNew.hidden = true;
  }

  let pendingSvgContent = null;
  let pendingSvgFile = null;

  function slugFromName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function resetProductForm() {
    currentEditingProduct = null;
    pendingSvgContent = null;
    pendingSvgFile = null;
    if (productModalSignInPrompt) productModalSignInPrompt.hidden = true;
    if (productForm) { productForm.style.pointerEvents = ''; productForm.style.opacity = ''; }
    if (previewSvgContainer) previewSvgContainer.innerHTML = '';
    if (filePreview) filePreview.hidden = true;
    if (dropZoneContent) dropZoneContent.hidden = false;
    if (inputProductId) inputProductId.value = '';
    if (inputProductName) inputProductName.value = '';
    if (inputProductCategory) inputProductCategory.value = '';
    if (inputItemNumber) inputItemNumber.value = '';
    if (inputCostPrice) inputCostPrice.value = '';
    if (inputMarkupPercentage) inputMarkupPercentage.value = '30';
    if (inputPriceExcGst) inputPriceExcGst.value = '';
    if (inputUnit) inputUnit.value = 'each';
    if (inputProfile) inputProfile.value = '';
    if (inputThumbnailUrl) inputThumbnailUrl.value = '';
    if (inputDiagramUrl) inputDiagramUrl.value = '';
    if (inputServicem8Uuid) inputServicem8Uuid.value = '';
    if (btnSaveProduct) btnSaveProduct.disabled = true;
    if (productModalFileInput) productModalFileInput.value = '';
    if (btnArchiveProduct) {
      btnArchiveProduct.hidden = true;
      btnArchiveProduct.removeAttribute('data-action');
      btnArchiveProduct.classList.remove('btn-archive--destructive');
    }
  }

  function validateProductSvgFile(file) {
    if (!file) return { valid: false, message: 'No file selected.' };
    const isSvgType = file.type === 'image/svg+xml';
    const isSvgExt = (file.name || '').toLowerCase().endsWith('.svg');
    if (!isSvgType && !isSvgExt) {
      return { valid: false, message: 'Only SVG files are allowed.' };
    }
    if (file.size > PRODUCT_SVG_MAX_SIZE_BYTES) {
      return { valid: false, message: 'File is too large. Please upload an SVG under 2MB.' };
    }
    return { valid: true };
  }

  function clearProductFileInput() {
    pendingSvgContent = null;
    pendingSvgFile = null;
    if (previewSvgContainer) previewSvgContainer.innerHTML = '';
    if (filePreview) filePreview.hidden = true;
    if (dropZoneContent) dropZoneContent.hidden = false;
    if (productModalFileInput) productModalFileInput.value = '';
    if (!currentEditingProduct && btnSaveProduct) btnSaveProduct.disabled = true;
  }

  function getSvgDimensions(svgContent) {
    if (!svgContent || typeof svgContent !== 'string') return null;
    const wMatch = svgContent.match(/\bwidth\s*=\s*["']?([0-9.]+)/i);
    const hMatch = svgContent.match(/\bheight\s*=\s*["']?([0-9.]+)/i);
    let w = wMatch ? parseFloat(wMatch[1]) : null;
    let h = hMatch ? parseFloat(hMatch[1]) : null;
    if ((w == null || h == null) && svgContent.includes('viewBox')) {
      const vbMatch = svgContent.match(/viewBox\s*=\s*["']?\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)/i);
      if (vbMatch) {
        const vw = parseFloat(vbMatch[3]);
        const vh = parseFloat(vbMatch[4]);
        if (w == null) w = vw;
        if (h == null) h = vh;
      }
    }
    if (w != null && h != null && !Number.isNaN(w) && !Number.isNaN(h)) return { width: w, height: h };
    return null;
  }

  function setProductFile(svgContent, file) {
    if (!svgContent || !svgContent.trim().startsWith('<')) {
      if (btnSaveProduct) btnSaveProduct.disabled = true;
      return;
    }
    pendingSvgContent = svgContent;
    pendingSvgFile = file || null;
    if (previewSvgContainer) previewSvgContainer.innerHTML = svgContent;
    if (filePreview) filePreview.hidden = false;
    if (dropZoneContent) dropZoneContent.hidden = true;
    if (btnSaveProduct) btnSaveProduct.disabled = false;
  }

  function showDiagramPreviewFromUrl(url) {
    if (!previewSvgContainer) return;
    previewSvgContainer.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.maxHeight = '120px';
    img.style.objectFit = 'contain';
    previewSvgContainer.appendChild(img);
    if (filePreview) filePreview.hidden = false;
    if (dropZoneContent) dropZoneContent.hidden = true;
    if (btnSaveProduct) btnSaveProduct.disabled = false;
  }

  const productModalTitle = document.getElementById('productModalTitle');

  const productModalSignInPrompt = document.getElementById('productModalSignInPrompt');
  const btnSignInFromProductModal = document.getElementById('btnSignInFromProductModal');

  openProductModal = (product = null) => {
    if (!product) {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      resetProductForm();
      if (productModalTitle) productModalTitle.textContent = 'Add New Product';
      if (btnSaveProduct) {
        btnSaveProduct.textContent = 'Create Product';
        btnSaveProduct.disabled = true;
      }
      if (btnArchiveProduct) btnArchiveProduct.hidden = true;
      if (!authState.token) {
        if (productModalSignInPrompt) productModalSignInPrompt.hidden = false;
        if (productForm) productForm.style.pointerEvents = 'none';
        if (productForm) productForm.style.opacity = '0.5';
      } else {
        if (productModalSignInPrompt) productModalSignInPrompt.hidden = true;
        if (productForm) productForm.style.pointerEvents = '';
        if (productForm) productForm.style.opacity = '';
      }
      collapseDiagramToolbarIfExpanded();
      openAccessibleModal('productModal', { triggerEl: document.getElementById('productCardNew') || document.activeElement });
      return;
    }
    if (productModalSignInPrompt) productModalSignInPrompt.hidden = true;
    if (productForm) { productForm.style.pointerEvents = ''; productForm.style.opacity = ''; }
    currentEditingProduct = product;
    pendingSvgContent = null;
    pendingSvgFile = null;
    if (previewSvgContainer) previewSvgContainer.innerHTML = '';
    if (productModalFileInput) productModalFileInput.value = '';
    if (productModalTitle) productModalTitle.textContent = 'Edit Product';
    if (btnSaveProduct) {
      btnSaveProduct.textContent = 'Save Changes';
      btnSaveProduct.disabled = false;
    }
    if (inputProductId) inputProductId.value = product.id || '';
    if (inputProductName) inputProductName.value = product.name || '';
    if (inputProductCategory) inputProductCategory.value = product.category || '';
    if (inputItemNumber) inputItemNumber.value = product.item_number || '';
    if (inputCostPrice) inputCostPrice.value = product.cost_price != null ? String(product.cost_price) : '';
    if (inputMarkupPercentage) inputMarkupPercentage.value = product.markup_percentage != null ? String(product.markup_percentage) : '30';
    if (inputPriceExcGst) inputPriceExcGst.value = product.price_exc_gst != null ? String(product.price_exc_gst) : '';
    if (inputUnit) inputUnit.value = product.unit || 'each';
    if (inputProfile) inputProfile.value = product.profile || '';
    if (inputThumbnailUrl) inputThumbnailUrl.value = product.thumbnail_url || product.thumbnailUrl || '';
    if (inputDiagramUrl) inputDiagramUrl.value = product.diagram_url || product.diagramUrl || '';
    if (inputServicem8Uuid) inputServicem8Uuid.value = product.servicem8_material_uuid || '';
    const diagramUrl = product.diagram_url || product.diagramUrl || '';
    if (diagramUrl) showDiagramPreviewFromUrl(diagramUrl);
    if (btnArchiveProduct) {
      btnArchiveProduct.hidden = false;
      const isArchived = product.active === false;
      btnArchiveProduct.textContent = isArchived ? 'Unarchive' : 'Archive';
      btnArchiveProduct.setAttribute('data-action', isArchived ? 'unarchive' : 'archive');
      btnArchiveProduct.classList.toggle('btn-archive--destructive', !isArchived);
    }
    collapseDiagramToolbarIfExpanded();
    openAccessibleModal('productModal', { triggerEl: document.activeElement });
  };

  if (btnArchiveProduct) {
    btnArchiveProduct.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!currentEditingProduct || !authState.supabase) return;
      const action = btnArchiveProduct.getAttribute('data-action');
      const newActive = action === 'unarchive';
      const msg = newActive
        ? 'Unarchive this product? It will appear in the Canvas sidebar again.'
        : 'Archive this product? It will no longer appear in the Canvas sidebar.';
      const confirmed = await showAppConfirm(msg, {
        title: newActive ? 'Unarchive product' : 'Archive product',
        confirmText: newActive ? 'Unarchive' : 'Archive',
        destructive: !newActive,
        triggerEl: btnArchiveProduct,
      });
      if (!confirmed) return;
      btnArchiveProduct.disabled = true;
      try {
        const { error } = await authState.supabase
          .from('products')
          .update({ active: newActive })
          .eq('id', currentEditingProduct.id);
        if (error) throw error;
        closeAccessibleModal('productModal');
        resetProductForm();
        await renderProductLibrary();
        await loadPanelProducts();
      } catch (err) {
        await showAppAlert(err.message || 'Failed to archive product', {
          title: 'Archive failed',
          triggerEl: btnArchiveProduct,
        });
      } finally {
        btnArchiveProduct.disabled = false;
      }
    });
  }

  if (productCardNew && productModal) {
    productCardNew.addEventListener('click', () => {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      if (!authState.token) {
        switchView('view-login');
        showMessage('Sign in to add products.');
        return;
      }
      openProductModal(null);
    });
  }

  if (btnCancelProduct && productModal) {
    btnCancelProduct.addEventListener('click', () => {
      closeAccessibleModal('productModal');
      resetProductForm();
    });
  }

  if (dropZone) {
    dropZone.addEventListener('click', (e) => {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      if (e.target === productModalFileInput || e.target.closest('.file-preview')) return;
      productModalFileInput?.click();
    });
    dropZone.addEventListener('dragover', (e) => {
      if (isMobileSvgUploadDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      if (isMobileSvgUploadDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const validation = validateProductSvgFile(file);
      if (!validation.valid) {
        showAppAlert(validation.message, { title: 'Invalid SVG file', triggerEl: dropZone });
        clearProductFileInput();
        return;
      }
      pendingSvgFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        const svgContent = reader.result;
        const dims = getSvgDimensions(svgContent);
        if (dims && (dims.width > PRODUCT_SVG_DIMENSION_WARN_PX || dims.height > PRODUCT_SVG_DIMENSION_WARN_PX)) {
          showAppAlert('This SVG has very large dimensions and may affect performance. We recommend resizing it.', {
            title: 'Large SVG warning',
            triggerEl: dropZone,
          });
        }
        setProductFile(svgContent, file);
      };
      reader.readAsText(file);
    });
  }

  if (productModalFileInput) {
    productModalFileInput.addEventListener('change', () => {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        clearProductFileInput();
        return;
      }
      const file = productModalFileInput.files?.[0];
      if (!file) return;
      const validation = validateProductSvgFile(file);
      if (!validation.valid) {
        showAppAlert(validation.message, { title: 'Invalid SVG file', triggerEl: productModalFileInput });
        clearProductFileInput();
        return;
      }
      pendingSvgFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        const svgContent = reader.result;
        const dims = getSvgDimensions(svgContent);
        if (dims && (dims.width > PRODUCT_SVG_DIMENSION_WARN_PX || dims.height > PRODUCT_SVG_DIMENSION_WARN_PX)) {
          showAppAlert('This SVG has very large dimensions and may affect performance. We recommend resizing it.', {
            title: 'Large SVG warning',
            triggerEl: productModalFileInput,
          });
        }
        setProductFile(svgContent, file);
      };
      reader.readAsText(file);
    });
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.preventDefault();
      pendingSvgContent = null;
      pendingSvgFile = null;
      if (previewSvgContainer) previewSvgContainer.innerHTML = '';
      if (filePreview) filePreview.hidden = true;
      if (dropZoneContent) dropZoneContent.hidden = false;
      if (productModalFileInput) productModalFileInput.value = '';
      if (!currentEditingProduct && btnSaveProduct) btnSaveProduct.disabled = true;
    });
  }

  if (btnSignInFromProductModal) {
    btnSignInFromProductModal.addEventListener('click', () => {
      closeAccessibleModal('productModal');
      switchView('view-login');
    });
  }

  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isMobileSvgUploadDisabled && pendingSvgFile) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      if (!authState.token) {
        showMessage('Sign in to add products.');
        switchView('view-login');
        closeAccessibleModal('productModal');
        return;
      }
      const name = (inputProductName?.value || '').trim();
      const category = (inputProductCategory?.value || '').trim();
      const hasDiagram = pendingSvgContent || (currentEditingProduct && (currentEditingProduct.diagram_url || currentEditingProduct.diagramUrl));
      if (!name || !category) return;
      if (!hasDiagram) {
        await showAppAlert('Please add a diagram (drop an SVG file or ensure the product has a diagram URL).', {
          title: 'Diagram required',
          triggerEl: btnSaveProduct,
        });
        return;
      }
      if (!pendingSvgFile && !currentEditingProduct) {
        await showAppAlert('Please select an SVG file to upload', {
          title: 'SVG required',
          triggerEl: productModalFileInput,
        });
        return;
      }
      if (!authState.supabase) {
        await showAppAlert('Supabase is not configured', {
          title: 'Configuration required',
          triggerEl: btnSaveProduct,
        });
        return;
      }
      if (btnSaveProduct) btnSaveProduct.disabled = true;
      try {
        let diagramUrl;
        if (pendingSvgFile) {
          diagramUrl = await uploadProductSVG(pendingSvgFile);
        } else if (currentEditingProduct) {
          diagramUrl = currentEditingProduct.diagram_url || currentEditingProduct.diagramUrl || '';
        } else {
          throw new Error('No diagram available');
        }
        const rawId = (inputProductId?.value || '').trim();
        const id = rawId || (slugFromName(name) || 'product') + '-' + Date.now();
        const costVal = (inputCostPrice?.value || '').trim();
        const markupVal = (inputMarkupPercentage?.value || '').trim();
        const priceExcVal = (inputPriceExcGst?.value || '').trim();
        const productData = {
          name,
          category,
          item_number: (inputItemNumber?.value || '').trim() || null,
          cost_price: costVal === '' ? null : (parseFloat(costVal) || null),
          markup_percentage: markupVal === '' ? null : (parseFloat(markupVal) ?? 30),
          price_exc_gst: priceExcVal === '' ? null : (parseFloat(priceExcVal) || null),
          unit: (inputUnit?.value || 'each').trim(),
          profile: (inputProfile?.value || '').trim() || null,
          active: currentEditingProduct ? (currentEditingProduct.active !== false) : true,
          thumbnail_url: (inputThumbnailUrl?.value || '').trim() || diagramUrl,
          diagram_url: diagramUrl,
          servicem8_material_uuid: (inputServicem8Uuid?.value || '').trim() || null,
        };
        if (currentEditingProduct) {
          const { error } = await authState.supabase
            .from('products')
            .update(productData)
            .eq('id', currentEditingProduct.id);
          if (error) throw error;
        } else {
          productData.id = id;
          const { error } = await authState.supabase.from('products').insert([productData]);
          if (error) throw error;
        }
        closeAccessibleModal('productModal');
        resetProductForm();
        await renderProductLibrary();
        await loadPanelProducts();
      } catch (err) {
        await showAppAlert(err.message || 'Failed to save product', {
          title: 'Save product failed',
          triggerEl: btnSaveProduct,
        });
      } finally {
        if (btnSaveProduct) btnSaveProduct.disabled = false;
      }
    });
  }

  renderProductLibrary();
}

function renderLibraryGrid(list) {
  const grid = document.getElementById('productsPageGrid');
  const newCard = document.getElementById('productCardNew');
  if (!grid) return;
  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }
  if (newCard) grid.appendChild(newCard);

  (list || []).forEach((p) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    if (p.active === false) card.classList.add('product-card-archived');
    card.setAttribute('data-product-id', String(p.id));
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Edit product: ${p.name || 'Unnamed'}`);
    const previewWrap = document.createElement('div');
    previewWrap.className = 'product-card-preview';
    if (p.diagram_url) {
      const img = document.createElement('img');
      img.src = p.diagram_url;
      img.alt = p.name || '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxHeight = '120px';
      img.style.objectFit = 'contain';
      previewWrap.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'product-card-name';
    nameEl.textContent = p.name || 'Unnamed';
    card.appendChild(previewWrap);
    card.appendChild(nameEl);
    if (p.active === false) {
      const badge = document.createElement('span');
      badge.className = 'product-card-archived-badge';
      badge.textContent = 'Archived';
      card.appendChild(badge);
    }
    card.addEventListener('click', () => {
      if (openProductModal) openProductModal(p);
    });
    grid.appendChild(card);
  });
}

function filterLibraryGrid() {
  if (!allLibraryProducts || !Array.isArray(allLibraryProducts)) return;
  const searchEl = document.getElementById('productLibrarySearch');
  const profileEl = document.getElementById('productFilterProfile');
  const searchTerm = (searchEl?.value || '').trim().toLowerCase();
  const profileVal = (profileEl?.value || '').trim();
  const filtered = allLibraryProducts.filter((p) => {
    const nameMatch = !searchTerm || (p.name || '').toLowerCase().includes(searchTerm);
    const profileMatch = !profileVal || (p.profile || '') === profileVal;
    return nameMatch && profileMatch;
  });
  renderLibraryGrid(filtered);
}

async function renderProductLibrary() {
  const supabase = authState.supabase;
  if (!supabase) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Failed to fetch products:', error);
    return;
  }

  const list = products || [];
  list.sort((a, b) => {
    const aActive = a.active !== false;
    const bActive = b.active !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return 0;
  });
  allLibraryProducts = list;
  filterLibraryGrid();
}

function initDiagrams() {
  const saveDiagramBtn = document.getElementById('saveDiagramBtn');
  const diagramsDropdownBtn = document.getElementById('diagramsDropdownBtn');
  const diagramsDropdown = document.getElementById('diagramsDropdown');
  const diagramsDropdownList = document.getElementById('diagramsDropdownList');
  const diagramsDropdownEmpty = document.getElementById('diagramsDropdownEmpty');
  const saveDiagramModal = document.getElementById('saveDiagramModal');
  const saveDiagramName = document.getElementById('saveDiagramName');
  const saveDiagramConfirmBtn = document.getElementById('saveDiagramConfirmBtn');
  const saveDiagramCancelBtn = document.getElementById('saveDiagramCancelBtn');
  const saveDiagramError = document.getElementById('saveDiagramError');
  const projectNameInput = document.getElementById('toolbarProjectNameInput');
  const breadcrumbsNav = document.getElementById('toolbarBreadcrumbsNav');
  const projectHistoryDropdown = document.getElementById('projectHistoryDropdown');
  const projectHistoryDropdownList = document.getElementById('projectHistoryDropdownList');
  const projectHistoryDropdownEmpty = document.getElementById('projectHistoryDropdownEmpty');
  if (!saveDiagramBtn || !diagramsDropdownBtn) return;

  // Project name input: sync state on blur/change; Enter to commit; placeholder when empty
  if (projectNameInput) {
    const commitProjectName = () => {
      const val = (projectNameInput.value || '').trim();
      state.projectName = val;
      projectNameInput.value = val;
      projectNameInput.placeholder = 'Untitled';
    };
    projectNameInput.addEventListener('change', commitProjectName);
    projectNameInput.addEventListener('blur', commitProjectName);
    projectNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        projectNameInput.blur();
      }
    });
    // Clicking anywhere outside should blur (finish typing)
    document.addEventListener('mousedown', (e) => {
      if (document.activeElement !== projectNameInput) return;
      const t = e.target;
      if (projectNameInput.contains(t)) return;
      if (projectHistoryDropdown?.contains(t)) return;
      projectNameInput.blur();
    });
    // Initial sync
    updateToolbarBreadcrumbs(state.projectName);
  }

  const goBackBtn = document.getElementById('breadcrumbGoBackBtn');
  function updateGoBackButtonVisibility() {
    if (goBackBtn) goBackBtn.hidden = !preLoadSnapshot;
  }

  if (goBackBtn) {
    goBackBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!preLoadSnapshot) return;
      const snap = preLoadSnapshot;
      preLoadSnapshot = null;
      updateGoBackButtonVisibility();
      closeDropdown();
      closeProjectHistoryDropdown();
      try {
        await restoreFromPreLoadSnapshot(snap);
        showMessage('Restored previous state.', 'success');
      } catch (err) {
        showMessage('Could not restore previous state.', 'error');
        preLoadSnapshot = snap;
        updateGoBackButtonVisibility();
      }
    });
  }

  function authHeaders() {
    return authState.token ? { Authorization: `Bearer ${authState.token}` } : {};
  }

  function closeDropdown() {
    if (diagramsDropdown) diagramsDropdown.hidden = true;
    if (diagramsDropdownBtn) diagramsDropdownBtn.setAttribute('aria-expanded', 'false');
  }
  const projectHistoryDropdownBackdrop = document.getElementById('projectHistoryDropdownBackdrop');
  
  function closeProjectHistoryDropdown() {
    if (projectHistoryDropdown) projectHistoryDropdown.hidden = true;
    if (projectHistoryDropdownBackdrop) projectHistoryDropdownBackdrop.hidden = true;
  }
  function openProjectHistoryDropdown() {
    closeDropdown();
    refreshDiagramsList();
    collapseDiagramToolbarIfExpanded();
    if (projectHistoryDropdown) projectHistoryDropdown.hidden = false;
    if (projectHistoryDropdownBackdrop) projectHistoryDropdownBackdrop.hidden = false;
  }
  
  if (projectHistoryDropdownBackdrop) {
    projectHistoryDropdownBackdrop.addEventListener('click', () => {
      closeProjectHistoryDropdown();
    });
  }

  saveDiagramBtn.addEventListener('click', () => {
    if (!authState.token) {
      showMessage('Sign in to save diagrams.', 'error');
      switchView('view-login');
      return;
    }
    if (!state.blueprintImage && state.elements.length === 0) {
      showMessage('Add a photo or products to the canvas before saving.');
      return;
    }
    const base = (state.projectName || projectNameInput?.value || '').trim();
    saveDiagramName.value = base || 'Project';
    if (saveDiagramError) { saveDiagramError.hidden = true; saveDiagramError.textContent = ''; }
    collapseDiagramToolbarIfExpanded();
    openAccessibleModal('saveDiagramModal', { triggerEl: saveDiagramBtn, initialFocusEl: saveDiagramName });
  });

  saveDiagramConfirmBtn?.addEventListener('click', async () => {
    const name = (saveDiagramName.value || '').trim();
    if (!name) {
      if (saveDiagramError) { saveDiagramError.hidden = false; saveDiagramError.textContent = 'Enter a name.'; }
      return;
    }
    saveDiagramConfirmBtn.disabled = true;
    if (saveDiagramError) { saveDiagramError.hidden = true; saveDiagramError.textContent = ''; }
    try {
      const { data, blueprintImageBase64, thumbnailBase64 } = getDiagramDataForSave();
      const body = {
        name,
        data,
        blueprintImageBase64: blueprintImageBase64 || undefined,
        blueprintImageUrl: (!blueprintImageBase64 && state.blueprintImageSourceUrl) ? state.blueprintImageSourceUrl : undefined,
        thumbnailBase64: thumbnailBase64 || undefined,
      };
      const res = await fetch('/api/diagrams', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || 'Save failed');
      }
      closeAccessibleModal('saveDiagramModal');
      updateToolbarBreadcrumbs(name);
      showMessage('Diagram saved.', 'success');
      refreshDiagramsList();
    } catch (err) {
      if (saveDiagramError) { saveDiagramError.hidden = false; saveDiagramError.textContent = err.message || 'Save failed'; }
    }
    saveDiagramConfirmBtn.disabled = false;
  });

  saveDiagramCancelBtn?.addEventListener('click', () => { closeAccessibleModal('saveDiagramModal'); });

  diagramsDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!authState.token) {
      showMessage('Sign in to open saved diagrams.', 'error');
      return;
    }
    if (layoutState.viewportMode === 'mobile') {
      const sheet = document.getElementById('diagramsBottomSheet');
      const open = sheet && !sheet.hidden;
      if (open) {
        closeAccessibleModal('diagramsBottomSheet');
        return;
      }
      closeDropdown();
      closeProjectHistoryDropdown();
      refreshDiagramsList().then(() => {
        collapseDiagramToolbarIfExpanded();
        openAccessibleModal('diagramsBottomSheet', { triggerEl: diagramsDropdownBtn });
      });
      return;
    }
    const open = diagramsDropdown && !diagramsDropdown.hidden;
    if (open) {
      closeDropdown();
      return;
    }
    closeProjectHistoryDropdown();
    refreshDiagramsList();
    collapseDiagramToolbarIfExpanded();
    if (diagramsDropdown) diagramsDropdown.hidden = false;
    if (diagramsDropdownBtn) diagramsDropdownBtn.setAttribute('aria-expanded', 'true');
  });

  document.addEventListener('click', (e) => {
    const sheet = document.getElementById('diagramsBottomSheet');
    if (sheet && !sheet.hidden && sheet.contains(e.target)) return;
    if (diagramsDropdown && !diagramsDropdown.hidden && !diagramsDropdown.contains(e.target) && !diagramsDropdownBtn.contains(e.target)) closeDropdown();
    if (projectHistoryDropdown && !projectHistoryDropdown.hidden && !projectHistoryDropdown.contains(e.target) && !breadcrumbsNav?.contains(e.target) && !projectHistoryDropdownBackdrop?.contains(e.target)) closeProjectHistoryDropdown();
  });

  // Breadcrumb click: on mobile opens bottom sheet (54.21–54.25), on desktop opens project history dropdown (46.3–46.4)
  if (breadcrumbsNav) {
    breadcrumbsNav.addEventListener('click', (e) => {
      if (e.target === projectNameInput || e.target === goBackBtn) return;
      e.preventDefault();
      if (!authState.token) {
        showMessage('Sign in to open saved diagrams.', 'error');
        return;
      }
      if (layoutState.viewportMode === 'mobile') {
        const sheet = document.getElementById('diagramsBottomSheet');
        const open = sheet && !sheet.hidden;
        if (open) {
          closeAccessibleModal('diagramsBottomSheet');
          return;
        }
        closeDropdown();
        closeProjectHistoryDropdown();
        refreshDiagramsList().then(() => {
          collapseDiagramToolbarIfExpanded();
          openAccessibleModal('diagramsBottomSheet', { triggerEl: breadcrumbsNav });
        });
        return;
      }
      const open = projectHistoryDropdown && !projectHistoryDropdown.hidden;
      if (open) {
        closeProjectHistoryDropdown();
        return;
      }
      openProjectHistoryDropdown();
    });
  }

  const diagramItemFallbackThumb = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><rect fill="%23eee" width="64" height="48"/><text x="32" y="26" text-anchor="middle" fill="%23999" font-size="12">No preview</text></svg>';

  function createDiagramItem(item) {
    const wrap = document.createElement('div');
    wrap.className = 'diagram-item-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diagram-item';
    btn.setAttribute('role', 'menuitem');
    const thumb = document.createElement('img');
    thumb.className = 'diagram-item-thumb';
    thumb.alt = '';
    thumb.src = item.thumbnailUrl || item.blueprintImageUrl || diagramItemFallbackThumb;
    thumb.onerror = function () { this.src = diagramItemFallbackThumb; };
    const info = document.createElement('div');
    info.className = 'diagram-item-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'diagram-item-name';
    nameEl.textContent = item.name || 'Untitled';
    const dateEl = document.createElement('div');
    dateEl.className = 'diagram-item-date';
    dateEl.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
    info.appendChild(nameEl);
    info.appendChild(dateEl);
    btn.appendChild(thumb);
    btn.appendChild(info);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'diagram-item-delete';
    const itemName = item.name || 'Untitled';
    deleteBtn.setAttribute('aria-label', `Delete ${itemName}`);
    deleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    deleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      /* Destructive action: confirmation required (in-app dialog) before delete – avoids accidental taps on mobile. */
      const confirmed = await showAppConfirm('Permanently delete this saved project? This cannot be undone.', {
        title: 'Delete saved project',
        confirmText: 'Delete',
        destructive: true,
        triggerEl: deleteBtn,
      });
      if (!confirmed) return;
      try {
        const r = await fetch('/api/diagrams/' + item.id, { method: 'DELETE', headers: authHeaders() });
        if (!r.ok) throw new Error('Delete failed');
        refreshDiagramsList();
        showMessage('Project deleted.', 'success');
      } catch (err) {
        showMessage('Could not delete project.', 'error');
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(deleteBtn);

    btn.addEventListener('click', async () => {
      closeDropdown();
      closeProjectHistoryDropdown();
      if (wrap.closest('#diagramsBottomSheet')) closeAccessibleModal('diagramsBottomSheet');
      try {
        preLoadSnapshot = capturePreLoadSnapshot();
        updateGoBackButtonVisibility();
        const r = await fetch('/api/diagrams/' + item.id, { headers: authHeaders() });
        if (!r.ok) throw new Error('Failed to load');
        const diagram = await r.json();
        await restoreStateFromApiSnapshot(diagram);
        updateToolbarBreadcrumbs(diagram.name || null);
        showMessage('Diagram loaded.', 'success');
      } catch (err) {
        preLoadSnapshot = null;
        updateGoBackButtonVisibility();
        showMessage('Could not load diagram.', 'error');
      }
    });
    return wrap;
  }

  async function refreshDiagramsList() {
    const listTargets = [
      { list: diagramsDropdownList, empty: diagramsDropdownEmpty },
      { list: projectHistoryDropdownList, empty: projectHistoryDropdownEmpty },
    ].filter((t) => t.list && t.empty);
    const diagramsBottomSheetListEl = document.getElementById('diagramsBottomSheetList');
    const diagramsBottomSheetEmptyEl = document.getElementById('diagramsBottomSheetEmpty');
    if (diagramsBottomSheetListEl && diagramsBottomSheetEmptyEl) {
      listTargets.push({ list: diagramsBottomSheetListEl, empty: diagramsBottomSheetEmptyEl });
    }
    if (listTargets.length === 0) return;
    try {
      const res = await fetch('/api/diagrams', { headers: authHeaders() });
      if (!res.ok) {
        listTargets.forEach(({ list, empty }) => { list.innerHTML = ''; empty.hidden = false; });
        return;
      }
      const json = await res.json();
      const diagramList = json.diagrams || [];
      listTargets.forEach(({ list, empty }) => {
        empty.hidden = diagramList.length > 0;
        list.innerHTML = '';
        diagramList.forEach((item) => {
          const el = createDiagramItem(item);
          if (list.id === 'diagramsBottomSheetList') el.setAttribute('role', 'listitem');
          list.appendChild(el);
        });
      });
    } catch (_) {
      listTargets.forEach(({ list, empty }) => { list.innerHTML = ''; empty.hidden = false; });
    }
  }
  if (typeof window !== 'undefined') window.__quoteAppRefreshDiagramsList = refreshDiagramsList;
}

const GLOBAL_TOOLBAR_STORAGE_KEY_COLLAPSED = 'quoteApp_globalToolbarCollapsed';

/** 54.33: Undo/Redo aria-hidden MutationObserver; disconnect on re-init or future teardown. */
let globalToolbarUndoRedoAriaObserver = null;
let globalToolbarController = null;

function applyGlobalToolbarPadding() {
  const wrap = document.getElementById('globalToolbarWrap');
  const viewCanvas = document.getElementById('view-canvas');
  if (!wrap || !viewCanvas) return;
  const h = wrap.offsetHeight;
  viewCanvas.style.setProperty('--global-toolbar-height', h + 'px');
}

function initGlobalToolbar() {
  const wrap = document.getElementById('globalToolbarWrap');
  const toolbar = document.getElementById('globalToolbar');
  const collapseBtn = document.getElementById('toolbarCollapseBtn');
  if (!wrap || !toolbar || !collapseBtn) {
    globalToolbarController = null;
    return;
  }

  let collapsed = localStorage.getItem(GLOBAL_TOOLBAR_STORAGE_KEY_COLLAPSED) === 'true';

  function setCollapsed(next, options = {}) {
    collapsed = !!next;
    if (options.persist !== false) {
      localStorage.setItem(GLOBAL_TOOLBAR_STORAGE_KEY_COLLAPSED, String(collapsed));
    }
    applyState();
  }

  function applyState() {
    toolbar.classList.toggle('toolbar--collapsed', collapsed);
    wrap.classList.remove('global-toolbar-wrap--bottom');
    const viewCanvas = document.getElementById('view-canvas');
    if (viewCanvas) {
      viewCanvas.classList.remove('view-canvas--toolbar-bottom');
      viewCanvas.classList.add('view-canvas--toolbar-top');
    }
    collapseBtn.setAttribute('aria-expanded', !collapsed);
    collapseBtn.setAttribute('aria-label', collapsed ? 'Expand toolbar' : 'Collapse toolbar');
    collapseBtn.title = collapsed ? 'Expand toolbar' : 'Collapse toolbar';
    const span = collapseBtn.querySelector('span');
    if (span) span.textContent = collapsed ? '+' : '−';
    requestAnimationFrame(applyGlobalToolbarPadding);
  }

  globalToolbarController = {
    isCollapsed: () => collapsed,
    setCollapsed,
  };
  applyState();

  /* Track pointer on collapse button so we can expand on pointerup when click is delayed/suppressed (e.g. mobile). */
  const GLOBAL_TOOLBAR_EXPAND_MOVE_PX_SQ = 100; // ~10px
  let collapsePointerId = null;
  let collapsePointerStartX = 0;
  let collapsePointerStartY = 0;
  let expandedViaPointer = false;

  collapseBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    collapsePointerId = e.pointerId;
    collapsePointerStartX = e.clientX;
    collapsePointerStartY = e.clientY;
    expandedViaPointer = false;
  }, { passive: true });

  collapseBtn.addEventListener('pointerup', (e) => {
    if (collapsePointerId == null || e.pointerId !== collapsePointerId) return;
    collapsePointerId = null;
    if (!collapsed) return;
    const dx = e.clientX - collapsePointerStartX;
    const dy = e.clientY - collapsePointerStartY;
    if (dx * dx + dy * dy <= GLOBAL_TOOLBAR_EXPAND_MOVE_PX_SQ) {
      expandedViaPointer = true;
      setCollapsed(false);
    }
  }, { passive: true });

  collapseBtn.addEventListener('click', (e) => {
    if (expandedViaPointer) {
      expandedViaPointer = false;
      return; // already expanded from pointerup; avoid double-toggle
    }
    setCollapsed(!collapsed);
  });

  const mobileUndoBtn = document.getElementById('mobileUndoBtn');
  const mobileRedoBtn = document.getElementById('mobileRedoBtn');
  const mobileUndoRedoWrap = document.querySelector('.mobile-undo-redo-wrap');
  if (mobileUndoRedoWrap) {
    if (globalToolbarUndoRedoAriaObserver) {
      globalToolbarUndoRedoAriaObserver.disconnect();
      globalToolbarUndoRedoAriaObserver = null;
    }
    const isMobile = () => document.body?.getAttribute('data-viewport-mode') === 'mobile';
    const setAriaHidden = () => {
      mobileUndoRedoWrap.setAttribute('aria-hidden', isMobile() ? 'false' : 'true');
    };
    setAriaHidden();
    const observer = new MutationObserver(setAriaHidden);
    globalToolbarUndoRedoAriaObserver = observer;
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['data-viewport-mode'] });
  }
  function updateUndoRedoButtons() {
    if (mobileUndoBtn) mobileUndoBtn.disabled = undoHistory.length === 0;
    if (mobileRedoBtn) mobileRedoBtn.disabled = redoHistory.length === 0;
  }
  window.updateUndoRedoButtons = updateUndoRedoButtons;
  if (mobileUndoBtn) mobileUndoBtn.addEventListener('click', () => { undo(); });
  if (mobileRedoBtn) mobileRedoBtn.addEventListener('click', () => { redo(); });
  updateUndoRedoButtons();
}

function initPanel() {
  const panel = document.getElementById('panel');
  const panelCollapsed = document.getElementById('panelCollapsed');
  const panelClose = document.getElementById('panelClose');
  if (!panel || !panelCollapsed || !panelClose) return;

  panelCollapsed.addEventListener('click', () => {
    setPanelExpanded(true);
  });

  panelClose.addEventListener('click', () => {
    setPanelExpanded(false);
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (layoutState.viewportMode !== 'mobile' || !layoutState.panelExpanded) return;
      if (!(e.target instanceof Element)) return;
      const panelEl = document.getElementById('panel');
      if (!panelEl) return;
      if (panelEl.contains(e.target)) return;
      setPanelExpanded(false);
    },
    true
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layoutState.viewportMode === 'mobile' && layoutState.panelExpanded) {
      setPanelExpanded(false);
      return;
    }
    /* 54.13: Focus trap when products panel is open on mobile */
    if (e.key !== 'Tab' || layoutState.viewportMode !== 'mobile' || !layoutState.panelExpanded) return;
    const panelEl = document.getElementById('panel');
    if (!panelEl || !panelEl.contains(document.activeElement)) return;
    const focusable = Array.from(
      panelEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent != null && !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;
    const i = focusable.indexOf(document.activeElement);
    if (e.shiftKey) {
      if (i <= 0) {
        e.preventDefault();
        focusable[focusable.length - 1].focus();
      }
    } else {
      if (i === -1 || i >= focusable.length - 1) {
        e.preventDefault();
        focusable[0].focus();
      }
    }
  });

  layoutState.forcedMode = getForcedViewportModeFromUrl();
  applyViewportMode(detectViewportMode(), { announce: false });

  if (!layoutState.resizeListenerBound && typeof window !== 'undefined') {
    window.addEventListener('resize', handleViewportResize, { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (layoutState.forcedMode) return;
        const nextMode = detectViewportMode();
        if (nextMode !== layoutState.viewportMode) {
          applyViewportMode(nextMode, { announce: true });
        } else {
          /* Re-apply attribute in case DOM was reset or for consistency. */
          if (document.body) document.body.setAttribute('data-viewport-mode', nextMode);
          if (document.documentElement) document.documentElement.setAttribute('data-viewport-mode', nextMode);
        }
        syncMobileOrientationPolicy('orientationchange');
      }, 100);
    }, { passive: true });
    layoutState.resizeListenerBound = true;
  }
}

function getForcedViewportModeFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const mode = new URLSearchParams(window.location.search).get(VIEWPORT_MODE_QUERY_KEY);
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'mobile' || normalized === 'desktop') return normalized;
  } catch (_) {}
  return null;
}

function detectViewportMode() {
  if (layoutState.forcedMode) return layoutState.forcedMode;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  const isNarrowViewport = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_BREAKPOINT_PX}px)`).matches;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return isNarrowViewport || isCoarsePointer ? 'mobile' : 'desktop';
}

/** 54.7: Announce to screen reader (live region). Use for canvas state changes. */
function announceCanvas(message) {
  const announcer = document.getElementById('appAnnouncer');
  if (!announcer) return;
  announcer.textContent = '';
  window.setTimeout(() => {
    announcer.textContent = message;
  }, 30);
}

/** 54.15: Set loading state for screen readers (aria-busy + optional announcement). */
function setLoadingState(busy, announcement) {
  const app = document.querySelector('.app');
  if (app) app.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (typeof announcement === 'string' && typeof announceCanvas === 'function') announceCanvas(announcement);
}

function announceViewportMode(mode) {
  const announcer = document.getElementById('appAnnouncer');
  if (!announcer) return;
  const message = mode === 'mobile' ? 'Mobile layout active.' : 'Desktop layout active.';
  announcer.textContent = '';
  window.setTimeout(() => {
    announcer.textContent = message;
  }, 30);
}

function updatePanelToggleAccessibility(isExpanded) {
  const panelCollapsed = document.getElementById('panelCollapsed');
  const panelClose = document.getElementById('panelClose');
  if (panelCollapsed) {
    panelCollapsed.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    panelCollapsed.setAttribute(
      'aria-label',
      isExpanded ? 'Products panel is open' : 'Open Marley products panel'
    );
  }
  if (panelClose) {
    panelClose.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  }
}

function setPanelExpanded(expanded, options = {}) {
  const panel = document.getElementById('panel');
  const resizer = document.getElementById('resizer');
  const panelClose = document.getElementById('panelClose');
  const panelCollapsed = document.getElementById('panelCollapsed');
  if (!panel) return;

  const isExpanded = !!expanded;
  const isMobileMode = layoutState.viewportMode === 'mobile';
  layoutState.panelExpanded = isExpanded;

  panel.classList.toggle('expanded', isExpanded);
  panel.classList.toggle('collapsed', !isExpanded);

  if (isMobileMode) {
    panel.style.width = '';
    /* 54.91: Scroll lock when products panel open (mobile) – prevents white space under scroll bar */
    if (document.body) {
      if (isExpanded) document.body.classList.add('products-panel-open');
      else document.body.classList.remove('products-panel-open');
    }
    if (isExpanded) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
    }
  } else {
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    if (isExpanded) {
      if (typeof options.width === 'number' && Number.isFinite(options.width)) {
        panel.style.width = `${options.width}px`;
      } else {
        panel.style.width = DEFAULT_PANEL_WIDTH + 'px';
      }
    } else {
      panel.style.width = '48px';
    }
  }

  if (resizer) {
    resizer.hidden = isMobileMode || !isExpanded;
  }

  updatePanelToggleAccessibility(isExpanded);

  if (isExpanded) collapseDiagramToolbarIfExpanded();

  let closedTransientPopovers = false;
  if (isMobileMode && isExpanded) {
    if (state.colorPaletteOpen) {
      state.colorPaletteOpen = false;
      closedTransientPopovers = true;
    }
    if (state.transparencyPopoverOpen) {
      state.transparencyPopoverOpen = false;
      const transparencyBtn = document.getElementById('blueprintTransparencyBtn');
      if (transparencyBtn) transparencyBtn.setAttribute('aria-expanded', 'false');
      closedTransientPopovers = true;
    }
  }

  if (isMobileMode) {
    if (globalToolbarController) {
      if (isExpanded) {
        if (!layoutState.panelAutoCollapsedGlobalToolbar && !globalToolbarController.isCollapsed()) {
          globalToolbarController.setCollapsed(true, { persist: false });
          layoutState.panelAutoCollapsedGlobalToolbar = true;
        }
      } else {
        if (layoutState.panelAutoCollapsedGlobalToolbar && globalToolbarController.isCollapsed()) {
          globalToolbarController.setCollapsed(false, { persist: false });
        }
        layoutState.panelAutoCollapsedGlobalToolbar = false;
      }
    } else if (!isExpanded) {
      layoutState.panelAutoCollapsedGlobalToolbar = false;
    }
  } else {
    layoutState.panelAutoCollapsedGlobalToolbar = false;
  }

  if (isMobileMode) {
    const announcer = document.getElementById('appAnnouncer');
    if (announcer) announcer.textContent = isExpanded ? 'Products panel opened.' : 'Products panel closed.';
    requestAnimationFrame(() => {
      if (isExpanded) {
        // 54.89: Focus panel container so close button doesn't show blue ring on open
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        panel.focus();
      } else if (panelCollapsed) {
        panelCollapsed.focus();
      }
    });
  }

  if (options.resizeCanvas !== false) {
    resizeCanvas();
    draw();
  } else if (closedTransientPopovers) {
    draw();
  }
}

function updatePlaceholderStepsForViewport(mode) {
  const steps = document.querySelector('.canvas-placeholder .placeholder-steps');
  if (!steps) return;
  steps.textContent =
    mode === 'mobile'
      ? 'Tap Products below to place parts, then move, resize, and rotate the selected part.'
      : 'Open the panel (→) and drag products here — move, resize, and rotate like a Canva board';
}

/** 54.63: Mobile copy should be tap-first; keep desktop drag language unchanged. */
function updatePanelTipForViewport(mode) {
  const tip = document.getElementById('panelTip');
  if (!tip) return;
  tip.textContent =
    mode === 'mobile'
      ? 'Tap parts to add'
      : 'Drag items onto the blueprint to add them.';
}

/** Mobile-only: profile filter dropdown first option label "All" → "All Profiles". Desktop unchanged. */
function updateProfileFilterLabelForViewport(mode) {
  const select = document.getElementById('profileFilter');
  if (!select) return;
  const firstOption = select.querySelector('option[value=""]');
  if (!firstOption) return;
  firstOption.textContent = mode === 'mobile' ? 'All Profiles' : 'All';
}

/** Mobile-only: size filter dropdown first option label "mm" → "All mm". Desktop unchanged. */
function updateSizeFilterLabelForViewport(mode) {
  const select = document.getElementById('sizeFilter');
  if (!select) return;
  const firstOption = select.querySelector('option[value=""]');
  if (!firstOption) return;
  firstOption.textContent = mode === 'mobile' ? 'All mm' : 'mm';
}

function applyViewportMode(mode, options = {}) {
  const normalizedMode = mode === 'mobile' ? 'mobile' : 'desktop';
  const previousMode = layoutState.viewportMode;
  const modeChanged = previousMode !== normalizedMode;

  layoutState.viewportMode = normalizedMode;

  if (typeof document !== 'undefined') {
    if (document.body) {
      document.body.setAttribute('data-viewport-mode', normalizedMode);
      /* 54.91: Remove products-panel-open when switching to desktop so scroll lock is not left on */
      if (normalizedMode !== 'mobile') document.body.classList.remove('products-panel-open');
    }
    if (document.documentElement) document.documentElement.setAttribute('data-viewport-mode', normalizedMode);
    updatePlaceholderStepsForViewport(normalizedMode);
    updatePanelTipForViewport(normalizedMode);
    updateProfileFilterLabelForViewport(normalizedMode);
    updateSizeFilterLabelForViewport(normalizedMode);
    /* 54.67: Mobile header theme-color blue (#54B3D9); desktop stays green (#71C43C) */
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const themeColorValue = normalizedMode === 'mobile' ? '#54B3D9' : '#71C43C';
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', themeColorValue);
    } else if (document.head) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = themeColorValue;
      document.head.appendChild(meta);
    }
  }

  if (modeChanged) {
    const shouldExpandPanelByDefault = normalizedMode === 'desktop';
    setPanelExpanded(shouldExpandPanelByDefault, { resizeCanvas: options.resizeCanvas !== false });
    syncQuoteModalViewportState();
    syncMobileLabourRowSummary();
    if (options.announce !== false) announceViewportMode(normalizedMode);
    // Re-initialize diagram toolbar drag when switching to mobile
    if (normalizedMode === 'mobile') {
      requestAnimationFrame(() => initDiagramToolbarDragWithApp());
    }
    syncMobileOrientationPolicy(`applyViewportMode:changed:${normalizedMode}`);
    return;
  }

  setPanelExpanded(layoutState.panelExpanded, { resizeCanvas: options.resizeCanvas !== false });
  syncQuoteModalViewportState();
  syncMobileLabourRowSummary();
  syncMobileOrientationPolicy(`applyViewportMode:stable:${normalizedMode}`);
}

function handleViewportResize() {
  if (layoutState.forcedMode) return;
  if (layoutState.resizeDebounceId != null) {
    window.clearTimeout(layoutState.resizeDebounceId);
  }
  layoutState.resizeDebounceId = window.setTimeout(() => {
    layoutState.resizeDebounceId = null;
    const nextMode = detectViewportMode();
    if (nextMode !== layoutState.viewportMode) {
      applyViewportMode(nextMode, { announce: true });
    }
  }, 120);
}

function initResizer() {
  const resizer = document.getElementById('resizer');
  const panel = document.getElementById('panel');
  if (!resizer || !panel) return;

  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    if (layoutState.viewportMode === 'mobile') return;
    e.preventDefault();
    resizer.classList.add('dragging');
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (layoutState.viewportMode === 'mobile') return;
    const delta = e.clientX - startX;
    let w = startWidth + delta;
    w = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, w));
    if (w <= 80) {
      setPanelExpanded(false, { resizeCanvas: false });
    } else {
      panel.classList.remove('collapsed');
      panel.classList.add('expanded');
      panel.style.width = w + 'px';
      layoutState.panelExpanded = true;
      updatePanelToggleAccessibility(true);
      if (resizer) resizer.hidden = false;
    }
    resizeCanvas();
    draw();
  }

  function onMouseUp() {
    resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}

/**
 * Normalize product from Supabase (snake_case) to panel format (camelCase).
 */
function normalizeProduct(p) {
  return {
    id: p.id,
    name: p.name || '',
    category: p.category || '',
    thumbnailUrl: p.thumbnail_url || p.thumbnailUrl || '',
    diagramUrl: p.diagram_url || p.diagramUrl || '',
    profile: p.profile || 'other',
  };
}

/**
 * Load products for the sidebar panel. When logged in: fetch from Supabase (active only) and use those.
 * When logged out: fetch from GET /api/products so the panel still shows products (e.g. E2E, anonymous use).
 */
async function loadPanelProducts() {
  if (authState.token && authState.supabase) {
    try {
      const { data: dbProducts, error } = await authState.supabase
        .from('products')
        .select('*')
        .eq('active', true);
      if (error) throw error;
      state.products = (dbProducts || []).map(normalizeProduct);
    } catch (err) {
      console.warn('Failed to fetch products from Supabase, using API fallback', err);
      await fetchPanelProductsFromApi();
    }
  } else {
    await fetchPanelProductsFromApi();
  }
  applyProductFilters();
}

/** Fetch products from backend GET /api/products (used when logged out or Supabase fails). */
async function fetchPanelProductsFromApi() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const list = (data.products || data) || [];
    state.products = list.map(normalizeProduct);
  } catch (err) {
    console.warn('Failed to fetch products from API, using empty list', err);
    state.products = [...SYSTEM_PRODUCTS];
  }
}

function getPanelProducts() {
  // Filter: exclude consumables, labour, and legacy placeholders; show only 3M gutters and 3M downpipes (manual length selectors), include all other products
  let list = state.products.filter((p) => {
    if (CONSUMABLE_PRODUCT_IDS.includes(p.id)) return false;
    if (PLACEHOLDER_PRODUCT_IDS.includes(p.id)) return false;
    if (LABOUR_PRODUCT_IDS.includes(p.id) || (p.category || '').toLowerCase() === 'labour') return false;
    return true;
  });
  
  // For gutters: only show 3M versions (GUT-SC-MAR-3M, GUT-CL-MAR-3M); hide 1.5M and 5M
  list = list.filter((p) => {
    const m = GUTTER_PATTERN.exec(p.id);
    if (!m) return true; // not a gutter, include it
    return p.id === 'GUT-SC-MAR-3M' || p.id === 'GUT-CL-MAR-3M';
  });
  
  // For downpipes: only show 3M versions (DP-65-3M, DP-80-3M); hide 1.5M and 6M
  list = list.filter((p) => {
    const id = (p.id || '').toUpperCase();
    if (!id.startsWith('DP-')) return true; // not a downpipe, include it
    return p.id === 'DP-65-3M' || p.id === 'DP-80-3M';
  });

  // Profile filter: when set, show only products matching the selected profile (matches backend: storm_cloud, classic, other)
  const profileVal = (state.profileFilter || '').trim();
  if (profileVal) {
    list = list.filter((p) => (p.profile || 'other') === profileVal);
  }

  // 65 / 80 mm filter: when set, show only products for that size or size-agnostic (gutters, brackets, etc.)
  const sizeVal = (state.sizeFilter || '').trim();
  if (sizeVal === '65' || sizeVal === '80') {
    list = list.filter((p) => {
      const productSize = getProductSizeMm(p.id);
      return productSize === null || productSize === sizeVal;
    });
  }

  return list;
}

/** Blob URLs created for panel thumbnails (filled SVG); revoked when panel re-renders. */
let panelThumbBlobUrls = new Set();

/**
 * Fetch an SVG and return a blob URL of the same SVG with injected fill so line-art reads as solid in the panel.
 * Used only for mobile product thumbnails when the source is SVG. Revoke the returned URL when no longer needed (e.g. on next render).
 * @param {string} url - Same-origin or CORS-allowed SVG URL
 * @returns {Promise<string|null>} Blob URL or null on failure
 */
async function createFilledSvgThumbUrl(url) {
  if (typeof url !== 'string' || !/\.svg($|\?)/i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const fillStyle = '<style>path, ellipse, circle, rect, polygon, polyline { fill: #5a5a5a !important; stroke: #333 !important; }</style>';
    const insertAt = text.indexOf('<svg');
    if (insertAt === -1) return null;
    const afterSvgTag = text.indexOf('>', insertAt) + 1;
    const injected = text.slice(0, afterSvgTag) + fillStyle + text.slice(afterSvgTag);
    const blob = new Blob([injected], { type: 'image/svg+xml' });
    const blobUrl = URL.createObjectURL(blob);
    panelThumbBlobUrls.add(blobUrl);
    return blobUrl;
  } catch {
    return null;
  }
}

function renderProducts(products) {
  const grid = document.getElementById('productGrid');
  for (const u of panelThumbBlobUrls) {
    try { URL.revokeObjectURL(u); } catch (_) {}
  }
  panelThumbBlobUrls.clear();
  grid.innerHTML = '';
  // Display name overrides for manual-length products (remove meter from gutters, use MM for downpipes)
  const displayNameOverrides = {
    'GUT-SC-MAR-3M': 'Gutter: Storm Cloud Marley',
    'GUT-CL-MAR-3M': 'Gutter: Classic Marley',
    'DP-65-3M': '65 MM downpipe',
    'DP-80-3M': '80 MM downpipe',
  };
  products.forEach((p) => {
    const thumb = document.createElement('div');
    thumb.className = 'product-thumb';
    thumb.draggable = true;
    const displayName = displayNameOverrides[p.id] || p.name;
    thumb.setAttribute('aria-label', `Product ${displayName}, drag onto canvas or click to add at center`);
    thumb.dataset.productId = p.id;
    const rawDiagramUrl = p.diagramUrl || p.diagram_url || '';
    const diagramUrl = rawDiagramUrl.startsWith('http') || rawDiagramUrl.startsWith('/') ? rawDiagramUrl : `/assets/marley/${p.id}.svg`;
    const rawThumbUrl = p.thumbnailUrl || p.thumbnail_url || rawDiagramUrl;
    const thumbImgSrc = rawThumbUrl && (rawThumbUrl.startsWith('http') || rawThumbUrl.startsWith('/')) ? rawThumbUrl : `/assets/marley/${p.id}.svg`;
    thumb.dataset.diagramUrl = diagramUrl;
    const img = document.createElement('img');
    img.alt = displayName;
    img.src = thumbImgSrc;
    thumb.appendChild(img);
    thumb.appendChild(document.createElement('span')).textContent = displayName;
    // Mobile-only: Improve panel thumbnail appearance - when source is SVG (diagram used as thumb), show a filled version so line-art reads as solid
    if (layoutState.viewportMode === 'mobile' && /\.svg($|\?)/i.test(thumbImgSrc)) {
      createFilledSvgThumbUrl(thumbImgSrc).then((blobUrl) => {
        if (blobUrl && img.parentNode) img.src = blobUrl;
      });
    }
    
    // Canvas Porter: Center-Drop - click (not drag) to add at viewport center
    let wasDragged = false;
    thumb.addEventListener('dragstart', (e) => {
      if (layoutState.viewportMode === 'mobile') {
        e.preventDefault();
        state.dragPreviewImage = null;
        state.dragPreviewCanvasPos = null;
        return;
      }
      wasDragged = true;
      e.dataTransfer.setData('application/product-id', p.id);
      e.dataTransfer.setData('application/diagram-url', diagramUrl);
      e.dataTransfer.effectAllowed = 'copy';
      state.dragPreviewCanvasPos = null;
      state.dragPreviewImage = null;
      loadDiagramImageForDrop(diagramUrl).then((img) => {
        state.dragPreviewImage = img;
        draw();
      }).catch(() => {});
      thumb.addEventListener('dragend', () => {
        wasDragged = false;
        state.dragPreviewImage = null;
        state.dragPreviewCanvasPos = null;
        draw();
      }, { once: true });
    });
    
    thumb.addEventListener('click', async (e) => {
      // Only handle click if it wasn't a drag operation
      if (wasDragged) {
        wasDragged = false;
        return;
      }
      e.preventDefault();
      try {
        pushUndoSnapshot();
        const img = await loadDiagramImageForDrop(diagramUrl);
        const { w, h } = elementSizeFromImage(img, getAddMaxDimensionWorld());
        
        // Canvas Porter: Center-Drop - place at viewport center (54.18: snap to grid, nudge if overlap)
        const rect = getCanvasRect();
        if (!rect) return;
        let vcx = (rect.width / 2 - state.offsetX) / state.scale;
        let vcy = (rect.height / 2 - state.offsetY) / state.scale;
        vcx = snapToGrid(vcx);
        vcy = snapToGrid(vcy);
        const el = {
          id: 'el-' + ++elementIdCounter,
          assetId: p.id,
          x: vcx - w / 2,
          y: vcy - h / 2,
          width: w,
          height: h,
          rotation: getDefaultRotationForLinear(p.id),
          zIndex: getNextElementZIndex(),
          image: img,
          originalImage: img,
          color: null,
          baseScale: 1,
          locked: false,
          flipX: false,
          flipY: false,
        };
        const othersCenterDrop = state.elements;
        const nudgeDirsCenter = [[SNAP_GRID_SIZE, 0], [0, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, 0], [0, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [SNAP_GRID_SIZE, -SNAP_GRID_SIZE], [-SNAP_GRID_SIZE, SNAP_GRID_SIZE]];
        for (let n = 0; n < 20; n++) {
          if (!othersCenterDrop.some((o) => elementsOverlap(el, o))) break;
          const [dx, dy] = nudgeDirsCenter[n % nudgeDirsCenter.length];
          vcx += dx;
          vcy += dy;
          el.x = vcx - w / 2;
          el.y = vcy - h / 2;
        }
        if (isMeasurableElement(p.id)) {
          el.sequenceId = state.nextSequenceId++;
          el.measuredLength = 0;
        }
        state.elements.push(el);
        setSelection([el.id]);
        if (typeof announceCanvas === 'function') announceCanvas('Product added to canvas.');
        updatePlaceholderVisibility();
        renderMeasurementDeck();
        draw();
        if (layoutState.viewportMode === 'mobile') setPanelExpanded(false);
      } catch (err) {
        console.error('Failed to load diagram image', err);
      }
    });

    grid.appendChild(thumb);
  });

  // Mobile: update collapsed Products pill facepile (first 3 product thumbnails)
  const facepile = document.getElementById('panelCollapsedFacepile');
  if (facepile) {
    facepile.innerHTML = '';
    const first3 = products.slice(0, 3);
    first3.forEach((p) => {
      const rawThumbUrl = p.thumbnailUrl || p.thumbnail_url || p.diagramUrl || p.diagram_url || '';
      const thumbImgSrc = rawThumbUrl && (rawThumbUrl.startsWith('http') || rawThumbUrl.startsWith('/')) ? rawThumbUrl : `/assets/marley/${p.id}.svg`;
      const img = document.createElement('img');
      img.className = 'facepile-thumb';
      img.alt = '';
      img.src = thumbImgSrc;
      facepile.appendChild(img);
    });
  }
}

/**
 * Hit-test: return the element whose measurement badge contains the given client point, or null.
 * Badge is drawn at element center in canvas buffer space with MEASUREMENT_BADGE_RADIUS.
 */
function hitTestBadge(clientX, clientY) {
  const rect = getCanvasRect();
  if (!rect || !rect.width || !rect.height) return null;
  const bufX = (clientX - rect.left) * (state.canvasWidth / rect.width);
  const bufY = (clientY - rect.top) * (state.canvasHeight / rect.height);
  const radius = MEASUREMENT_BADGE_RADIUS;
  const withSequence = state.elements.filter((el) => el.sequenceId != null);
  for (let i = withSequence.length - 1; i >= 0; i--) {
    const el = withSequence[i];
    const pos = getElementDrawPosition(el);
    const bcx = state.offsetX + (pos.x + el.width / 2) * state.scale;
    const bcy = state.offsetY + (pos.y + el.height / 2) * state.scale;
    if (Math.hypot(bufX - bcx, bufY - bcy) <= radius) return el;
  }
  return null;
}

function clearBadgeLengthPopoverSessionCleanup() {
  if (typeof badgeLengthPopoverSessionCleanup !== 'function') return;
  const cleanup = badgeLengthPopoverSessionCleanup;
  badgeLengthPopoverSessionCleanup = null;
  try {
    cleanup();
  } catch (_) {
    // Ignore cleanup errors; listeners are best-effort for session teardown.
  }
}

function closeBadgeLengthPopover(options = {}) {
  const { commit = true, fromBlur = false } = options;
  const popover = document.getElementById('badgeLengthPopover');
  const input = document.getElementById('badgeLengthInput');
  const targetId = state.badgeLengthEditElementId;

  clearBadgeLengthPopoverSessionCleanup();
  state.badgeLengthEditElementId = null;
  if (popover) popover.setAttribute('hidden', '');

  let updated = false;
  if (commit && targetId) {
    const el = state.elements.find((item) => item.id === targetId);
    if (el && el.sequenceId > 0) {
      const val = parseFloat(input?.value ?? '');
      el.measuredLength = Number.isFinite(val) && val >= 0 ? mToMm(val) : 0;
      updated = true;
    }
  }

  if (input && !fromBlur && document.activeElement === input) {
    try {
      input.blur();
    } catch (_) {}
  }

  if (updated) renderMeasurementDeck();
  draw();
  return true;
}

function getBadgeLengthPopoverSize(popover) {
  if (!popover) return { width: 96, height: 42 };
  const wasHidden = popover.hasAttribute('hidden');
  const previousVisibility = popover.style.visibility;
  if (wasHidden) {
    popover.style.visibility = 'hidden';
    popover.removeAttribute('hidden');
  }
  const rect = popover.getBoundingClientRect();
  const width = Math.max(96, rect.width || 0);
  const height = Math.max(42, rect.height || 0);
  if (wasHidden) popover.setAttribute('hidden', '');
  popover.style.visibility = previousVisibility;
  return { width, height };
}

function positionBadgeLengthPopoverForElement(el, popover) {
  const rect = getCanvasRect();
  if (!rect || !popover) return false;
  const pos = getElementDrawPosition(el);
  const badgeX = state.offsetX + (pos.x + el.width / 2) * state.scale;
  const badgeY = state.offsetY + (pos.y + el.height / 2) * state.scale;
  const viewX = rect.left + badgeX * (rect.width / state.canvasWidth);
  const viewY = rect.top + badgeY * (rect.height / state.canvasHeight);

  const size = getBadgeLengthPopoverSize(popover);
  const pad = 8;
  const maxLeft = Math.max(pad, window.innerWidth - size.width - pad);
  const maxTop = Math.max(pad, window.innerHeight - size.height - pad);
  const minTop = Math.min(getFloatingToolbarMinTopPx(), maxTop);
  let left = Math.max(pad, Math.min(maxLeft, viewX + 16));
  let top = Math.max(minTop, Math.min(maxTop, viewY - 18));

  const nudged = nudgePopoverAwayFromDiagramToolbar(left, top, size.width, size.height);
  left = Math.max(pad, Math.min(maxLeft, nudged.left));
  top = Math.max(minTop, Math.min(maxTop, nudged.top));

  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  return true;
}

function openBadgeLengthPopoverForElement(elementId, options = {}) {
  const popover = document.getElementById('badgeLengthPopover');
  const input = document.getElementById('badgeLengthInput');
  if (!popover || !input || !elementId) return false;

  const el = state.elements.find((item) => item.id === elementId);
  if (!el || !(el.sequenceId > 0)) return false;

  if (state.badgeLengthEditElementId) {
    closeBadgeLengthPopover({ commit: true });
  } else {
    clearBadgeLengthPopoverSessionCleanup();
  }

  if (!positionBadgeLengthPopoverForElement(el, popover)) return false;
  const mVal = mmToM(el.measuredLength);
  input.value = mVal != null ? String(mVal) : '';
  state.badgeLengthEditElementId = el.id;
  popover.removeAttribute('hidden');

  const onBlur = () => {
    closeBadgeLengthPopover({ commit: true, fromBlur: true });
  };
  const onKeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      closeBadgeLengthPopover({ commit: true });
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeBadgeLengthPopover({ commit: false });
    }
  };
  const onOutside = (ev) => {
    if (popover.contains(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    closeBadgeLengthPopover({ commit: true });
  };

  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKeydown);
  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('pointerdown', onOutside, true);
  badgeLengthPopoverSessionCleanup = () => {
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKeydown);
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('pointerdown', onOutside, true);
  };

  const focusInput = () => {
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
  };
  focusInput();
  if (options.allowRafFocusFallback !== false && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (document.activeElement !== input && state.badgeLengthEditElementId === el.id) {
        focusInput();
      }
    });
  }

  return true;
}

/**
 * Scroll Measurement Deck to the card for this element and focus its Length (mm) input.
 */
function scrollToMeasurementCardAndFocus(elementId) {
  const card = document.querySelector(`.measurement-deck-card[data-element-id="${CSS.escape(elementId)}"]`);
  if (!card) return false;
  const input = card.querySelector('input');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  if (!input) return true;
  const focusInput = () => {
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(focusInput));
  } else {
    setTimeout(focusInput, 0);
  }
  return true;
}

/**
 * Digital Takeoff: render Measurement Deck cards (one per measurable element, sorted by sequenceId).
 * Cards show Gutter #N or Downpipe #N, Length (m) input; hover highlights element on canvas.
 * Red when empty, green when value entered.
 */
function renderMeasurementDeck() {
  const container = document.getElementById('measurementDeckScroll');
  if (!container) return;
  const measurable = state.elements
    .filter((el) => el.sequenceId != null && el.sequenceId > 0)
    .sort((a, b) => (a.sequenceId || 0) - (b.sequenceId || 0));
  container.innerHTML = '';
  measurable.forEach((el) => {
    const hasLength = el.measuredLength != null && el.measuredLength > 0;
    const prefix = getMeasurementLabelPrefix(el.assetId);
    const card = document.createElement('div');
    card.className = 'measurement-deck-card';
    if (hasLength) card.classList.add('has-length');
    else card.classList.add('no-length');
    card.dataset.elementId = el.id;
    card.setAttribute('role', 'group');
    const displayLabel = getMeasurementDisplayLabel(el, measurable);
    const mVal = mmToM(el.measuredLength);
    card.setAttribute('aria-label', `${prefix} #${displayLabel}, length ${mVal != null ? mVal + ' m' : '0 m'}`);
    const dot = document.createElement('span');
    dot.className = 'measurement-deck-card-dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'measurement-deck-card-label';
    label.textContent = `${prefix} #${displayLabel}`;
    const wrap = document.createElement('span');
    wrap.className = 'measurement-deck-card-input-wrap';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.step = 0.001;
    const displayM = mmToM(el.measuredLength);
    input.value = displayM != null ? String(displayM) : '';
    input.setAttribute('aria-label', `Length metres for ${prefix.toLowerCase()} #${displayLabel}`);
    input.placeholder = 'm';
    const suffix = document.createElement('span');
    suffix.className = 'measurement-deck-card-unit';
    suffix.textContent = ' m'; // unit suffix (metres)
    suffix.setAttribute('aria-hidden', 'true');
    wrap.appendChild(input);
    wrap.appendChild(suffix);
    card.appendChild(dot);
    card.appendChild(label);
    card.appendChild(wrap);
    container.appendChild(card);

    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      const mm = Number.isFinite(val) && val >= 0 ? mToMm(val) : 0;
      el.measuredLength = mm;
      card.classList.toggle('has-length', mm > 0);
      card.classList.toggle('no-length', mm <= 0);
      draw();
    });
    card.addEventListener('mouseenter', () => {
      state.hoveredId = el.id;
      draw();
    });
    card.addEventListener('mouseleave', () => {
      state.hoveredId = null;
      draw();
    });
  });
}

function applyProductFilters() {
  const panelProducts = getPanelProducts();
  const q = (document.getElementById('productSearch')?.value || '').trim().toLowerCase();
  const filtered = q
    ? panelProducts.filter((p) => p.name.toLowerCase().includes(q) || (p.id && p.id.toLowerCase().includes(q)))
    : panelProducts;
  renderProducts(filtered);
}

function initProducts() {
  const profileFilter = document.getElementById('profileFilter');
  profileFilter?.addEventListener('change', (e) => {
    state.profileFilter = (e.target.value || '').trim();
    applyProductFilters();
  });

  const sizeFilter = document.getElementById('sizeFilter');
  sizeFilter?.addEventListener('change', (e) => {
    state.sizeFilter = (e.target.value || '').trim();
    sizeFilter.classList.toggle('size-filter-default', !state.sizeFilter);
    applyProductFilters();
  });

  const search = document.getElementById('productSearch');
  /* 54.85.7: refine-as-you-type (mobile and desktop); results update as user types */
  search?.addEventListener('input', () => applyProductFilters());

  loadPanelProducts();
}

async function checkBackendAvailable() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, reason: 'offline' };
  }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    return { ok: true, reason: 'ok' };
  } catch (_) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, reason: 'offline' };
    }
    return { ok: false, reason: 'unreachable' };
  }
}

/**
 * Update the profile avatar(s) with the current user's initial (from email).
 * Updates both canvas (#userAvatar) and products view (#productsUserAvatar).
 * Call after login or when session is restored.
 */
function updateUserProfile() {
  const email = authState.email || '';
  const initial = email.trim().length ? email.trim().charAt(0).toUpperCase() : '?';
  const canvasAvatar = document.getElementById('userAvatar');
  if (canvasAvatar) canvasAvatar.textContent = initial;
  const productsAvatar = document.getElementById('productsUserAvatar');
  if (productsAvatar) productsAvatar.textContent = initial;
}

const modalA11yState = {
  registry: new Map(),
  stack: [],
  initialized: false,
  keydownBound: false,
};

const appAlertDialogState = {
  pendingResolve: null,
  mode: 'alert',
  destructive: false,
  dismissResult: false,
};

function getFocusableElements(root) {
  if (!(root instanceof HTMLElement)) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll(selector)).filter((el) => isUsableFocusTarget(el));
}

function clearManagedInertElements() {
  document.querySelectorAll('[data-modal-inert-managed="true"]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.inert = false;
    el.removeAttribute('data-modal-inert-managed');
    if (el.getAttribute('data-modal-aria-hidden-managed') === 'true') {
      el.removeAttribute('aria-hidden');
      el.removeAttribute('data-modal-aria-hidden-managed');
    }
  });
}

function markElementInert(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
  if (el.getAttribute('data-modal-inert-managed') === 'true') return;
  el.inert = true;
  el.setAttribute('data-modal-inert-managed', 'true');
  if (!el.hasAttribute('aria-hidden')) {
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-modal-aria-hidden-managed', 'true');
  }
}

function applyModalInertState() {
  clearManagedInertElements();
  const topEntry = modalA11yState.stack[modalA11yState.stack.length - 1];
  if (!topEntry) return;
  const cfg = modalA11yState.registry.get(topEntry.id);
  const modal = cfg?.element;
  if (!(modal instanceof HTMLElement) || modal.hasAttribute('hidden')) return;

  let current = modal;
  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;
    Array.from(parent.children).forEach((sibling) => {
      if (sibling === current) return;
      markElementInert(sibling);
    });
    current = parent;
  }
}

function resolveModalInitialFocus(cfg, options = {}) {
  if (options.initialFocusEl instanceof HTMLElement) return options.initialFocusEl;
  if (typeof cfg.initialFocus === 'function') {
    const candidate = cfg.initialFocus();
    if (candidate instanceof HTMLElement) return candidate;
  }
  if (cfg.initialFocus instanceof HTMLElement) return cfg.initialFocus;
  const focusable = getFocusableElements(cfg.element);
  if (focusable.length > 0) {
    // 54.89: On mobile, focus modal container so first button doesn't show blue ring on open
    if (layoutState.viewportMode === 'mobile' && cfg.element instanceof HTMLElement) {
      if (!cfg.element.hasAttribute('tabindex')) cfg.element.setAttribute('tabindex', '-1');
      return cfg.element;
    }
    return focusable[0];
  }
  if (cfg.element instanceof HTMLElement) {
    if (!cfg.element.hasAttribute('tabindex')) cfg.element.setAttribute('tabindex', '-1');
    return cfg.element;
  }
  return null;
}

function registerAccessibleModal(config) {
  const id = config?.id;
  const element = config?.element;
  if (!id || !(element instanceof HTMLElement)) return;
  modalA11yState.registry.set(id, {
    id,
    element,
    backdrop: config.backdrop instanceof HTMLElement ? config.backdrop : null,
    closeOnEscape: config.closeOnEscape !== false,
    closeOnBackdrop: config.closeOnBackdrop !== false,
    initialFocus: config.initialFocus || null,
    onOpen: typeof config.onOpen === 'function' ? config.onOpen : null,
    onClose: typeof config.onClose === 'function' ? config.onClose : null,
  });
}

function openAccessibleModal(id, options = {}) {
  const cfg = modalA11yState.registry.get(id);
  if (!cfg || !(cfg.element instanceof HTMLElement)) return false;

  const triggerEl = options.triggerEl instanceof HTMLElement
    ? options.triggerEl
    : (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const existingIndex = modalA11yState.stack.findIndex((entry) => entry.id === id);
  if (existingIndex !== -1) modalA11yState.stack.splice(existingIndex, 1);
  modalA11yState.stack.push({ id, trigger: triggerEl });

  cfg.element.removeAttribute('hidden');
  if (typeof cfg.onOpen === 'function') cfg.onOpen(options);
  applyModalInertState();
  syncMobileOrientationPolicy(`openAccessibleModal:${id}`);

  requestAnimationFrame(() => {
    const target = resolveModalInitialFocus(cfg, options);
    focusElementNoScroll(target);
  });
  return true;
}

function closeAccessibleModal(id, options = {}) {
  const cfg = modalA11yState.registry.get(id);
  if (!cfg || !(cfg.element instanceof HTMLElement)) return false;

  const stackIndex = modalA11yState.stack.findIndex((entry) => entry.id === id);
  const entry = stackIndex === -1 ? null : modalA11yState.stack.splice(stackIndex, 1)[0];
  cfg.element.setAttribute('hidden', '');
  if (typeof cfg.onClose === 'function') cfg.onClose(options);

  applyModalInertState();
  syncMobileOrientationPolicy(`closeAccessibleModal:${id}`);

  if (options.restoreFocus !== false) {
    const restoreTarget = options.restoreFocusEl instanceof HTMLElement
      ? options.restoreFocusEl
      : entry?.trigger;
    requestAnimationFrame(() => {
      if (focusElementNoScroll(restoreTarget)) return;
      focusElementNoScroll(getPrimaryViewFocusTarget(getVisibleViewId()));
    });
  }
  return true;
}

function initAlertDialogControls() {
  const confirmBtn = document.getElementById('appAlertDialogConfirmBtn');
  const cancelBtn = document.getElementById('appAlertDialogCancelBtn');
  if (!confirmBtn || !cancelBtn) return;
  if (confirmBtn.getAttribute('data-alert-bound') === 'true') return;

  confirmBtn.setAttribute('data-alert-bound', 'true');
  cancelBtn.setAttribute('data-alert-bound', 'true');
  confirmBtn.addEventListener('click', () => {
    appAlertDialogState.dismissResult = true;
    closeAccessibleModal('appAlertDialogModal');
  });
  cancelBtn.addEventListener('click', () => {
    appAlertDialogState.dismissResult = false;
    closeAccessibleModal('appAlertDialogModal');
  });
}

function showAppDialog(options = {}) {
  const modal = document.getElementById('appAlertDialogModal');
  const titleEl = document.getElementById('appAlertDialogTitle');
  const messageEl = document.getElementById('appAlertDialogMessage');
  const confirmBtn = document.getElementById('appAlertDialogConfirmBtn');
  const cancelBtn = document.getElementById('appAlertDialogCancelBtn');
  if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(options.mode === 'alert');
  }

  const mode = options.mode === 'confirm' ? 'confirm' : 'alert';
  appAlertDialogState.mode = mode;
  appAlertDialogState.destructive = !!options.destructive;
  appAlertDialogState.dismissResult = mode === 'alert';

  titleEl.textContent = options.title || (mode === 'confirm' ? 'Confirm action' : 'Notice');
  messageEl.textContent = options.message || '';
  confirmBtn.textContent = options.confirmText || (mode === 'confirm' ? 'Confirm' : 'OK');
  cancelBtn.textContent = options.cancelText || 'Cancel';
  cancelBtn.hidden = mode !== 'confirm';
  confirmBtn.classList.toggle('btn-destructive', appAlertDialogState.destructive);

  if (typeof appAlertDialogState.pendingResolve === 'function') {
    appAlertDialogState.pendingResolve(false);
  }

  return new Promise((resolve) => {
    appAlertDialogState.pendingResolve = resolve;
    const initialFocus = mode === 'confirm' && appAlertDialogState.destructive ? cancelBtn : confirmBtn;
    openAccessibleModal('appAlertDialogModal', { triggerEl: options.triggerEl, initialFocusEl: initialFocus });
  });
}

function showAppAlert(message, options = {}) {
  return showAppDialog({
    ...options,
    mode: 'alert',
    message,
    confirmText: options.confirmText || 'OK',
  }).then(() => {});
}

function showAppConfirm(message, options = {}) {
  return showAppDialog({
    ...options,
    mode: 'confirm',
    message,
    confirmText: options.confirmText || 'Confirm',
    cancelText: options.cancelText || 'Cancel',
  });
}

function normalizeAccessibilityMotionPreference(value) {
  if (value === 'reduce' || value === 'full' || value === 'system') return value;
  return 'system';
}

function applyAccessibilityPreferences() {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;
  body.classList.toggle('a11y-large-controls', !!accessibilityPrefs.largeControls);
  body.classList.toggle('a11y-high-contrast', !!accessibilityPrefs.highContrast);
  body.classList.toggle('a11y-reduce-motion', accessibilityPrefs.motion === 'reduce');
  body.classList.toggle('a11y-force-motion', accessibilityPrefs.motion === 'full');
}

function saveAccessibilityPreferences() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCESSIBILITY_PREFS_STORAGE_KEY, JSON.stringify(accessibilityPrefs));
  } catch (_) {}
}

function loadAccessibilityPreferences() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_PREFS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    accessibilityPrefs.motion = normalizeAccessibilityMotionPreference(parsed?.motion);
    accessibilityPrefs.largeControls = !!parsed?.largeControls;
    accessibilityPrefs.highContrast = !!parsed?.highContrast;
  } catch (_) {}
}

function syncAccessibilitySettingsForm() {
  const motionSelect = document.getElementById('accessibilityMotionPreference');
  const largeControls = document.getElementById('accessibilityLargeControls');
  const highContrast = document.getElementById('accessibilityHighContrast');
  if (motionSelect) motionSelect.value = normalizeAccessibilityMotionPreference(accessibilityPrefs.motion);
  if (largeControls) largeControls.checked = !!accessibilityPrefs.largeControls;
  if (highContrast) highContrast.checked = !!accessibilityPrefs.highContrast;
}

function openAccessibilitySettingsModal(triggerEl) {
  syncAccessibilitySettingsForm();
  const firstField = document.getElementById('accessibilityMotionPreference');
  openAccessibleModal('accessibilitySettingsModal', { triggerEl, initialFocusEl: firstField });
}

function initAccessibilitySettings() {
  loadAccessibilityPreferences();
  applyAccessibilityPreferences();

  const motionSelect = document.getElementById('accessibilityMotionPreference');
  const largeControls = document.getElementById('accessibilityLargeControls');
  const highContrast = document.getElementById('accessibilityHighContrast');
  const doneBtn = document.getElementById('accessibilitySettingsDoneBtn');
  const toolbarBtn = document.getElementById('openAccessibilitySettingsBtn');
  const productsBtn = document.getElementById('productsAccessibilityBtn');
  const menuItem = document.getElementById('menuItemAccessibility');
  const profileDropdown = document.getElementById('profileDropdown');
  const userAvatar = document.getElementById('userAvatar');

  [toolbarBtn, productsBtn, menuItem].filter(Boolean).forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn === menuItem) {
        if (profileDropdown) profileDropdown.hidden = true;
        if (userAvatar) userAvatar.setAttribute('aria-expanded', 'false');
      }
      openAccessibilitySettingsModal(btn);
    });
  });

  motionSelect?.addEventListener('change', () => {
    accessibilityPrefs.motion = normalizeAccessibilityMotionPreference(motionSelect.value);
    saveAccessibilityPreferences();
    applyAccessibilityPreferences();
  });

  largeControls?.addEventListener('change', () => {
    accessibilityPrefs.largeControls = !!largeControls.checked;
    saveAccessibilityPreferences();
    applyAccessibilityPreferences();
  });

  highContrast?.addEventListener('change', () => {
    accessibilityPrefs.highContrast = !!highContrast.checked;
    saveAccessibilityPreferences();
    applyAccessibilityPreferences();
  });

  doneBtn?.addEventListener('click', () => {
    closeAccessibleModal('accessibilitySettingsModal');
  });
}

function initModalAccessibilityFramework() {
  if (modalA11yState.initialized) return;
  modalA11yState.initialized = true;

  registerAccessibleModal({
    id: 'quoteModal',
    element: document.getElementById('quoteModal'),
    backdrop: document.getElementById('quoteModalBackdrop'),
    initialFocus: () => {
      const backBtn = document.getElementById('quoteModalBackBtn');
      if (layoutState.viewportMode === 'mobile' && backBtn) return backBtn;
      return document.getElementById('quoteModalClose') || document.getElementById('quoteCloseBtn') || backBtn;
    },
  });
  registerAccessibleModal({
    id: 'labourEditorModal',
    element: document.getElementById('labourEditorModal'),
    backdrop: document.getElementById('labourEditorBackdrop'),
    initialFocus: () => document.querySelector('#labourEditorList .labour-editor-field-input') || document.getElementById('labourEditorDoneBtn') || document.getElementById('labourEditorCloseBtn'),
  });
  registerAccessibleModal({
    id: 'productModal',
    element: document.getElementById('productModal'),
    initialFocus: () => {
      const signInPrompt = document.getElementById('productModalSignInPrompt');
      if (signInPrompt && !signInPrompt.hidden) return document.getElementById('btnSignInFromProductModal');
      return document.getElementById('inputProductName') || document.getElementById('productModalFileInput');
    },
  });
  registerAccessibleModal({
    id: 'cropModal',
    element: document.getElementById('cropModal'),
    backdrop: document.getElementById('cropModalBackdrop'),
    initialFocus: () => document.getElementById('cropApply') || document.getElementById('cropAspectRatio'),
  });
  registerAccessibleModal({
    id: 'saveDiagramModal',
    element: document.getElementById('saveDiagramModal'),
    backdrop: document.getElementById('saveDiagramModalBackdrop'),
    initialFocus: () => document.getElementById('saveDiagramName') || document.getElementById('saveDiagramConfirmBtn'),
  });
  registerAccessibleModal({
    id: 'accessibilitySettingsModal',
    element: document.getElementById('accessibilitySettingsModal'),
    backdrop: document.getElementById('accessibilitySettingsBackdrop'),
    initialFocus: () => document.getElementById('accessibilityMotionPreference') || document.getElementById('accessibilitySettingsDoneBtn'),
  });
  registerAccessibleModal({
    id: 'jobConfirmOverlay',
    element: document.getElementById('jobConfirmOverlay'),
    backdrop: document.getElementById('jobConfirmBackdrop'),
    initialFocus: () => document.getElementById('jobConfirmAddBtn') || document.getElementById('jobConfirmClose'),
  });
  registerAccessibleModal({
    id: 'authModal',
    element: document.getElementById('authModal'),
    backdrop: document.getElementById('authModalBackdrop'),
  });
  registerAccessibleModal({
    id: 'appAlertDialogModal',
    element: document.getElementById('appAlertDialogModal'),
    backdrop: document.getElementById('appAlertDialogBackdrop'),
    initialFocus: () => {
      const confirmBtn = document.getElementById('appAlertDialogConfirmBtn');
      const cancelBtn = document.getElementById('appAlertDialogCancelBtn');
      return appAlertDialogState.mode === 'confirm' && appAlertDialogState.destructive
        ? (cancelBtn || confirmBtn)
        : (confirmBtn || cancelBtn);
    },
    onClose: () => {
      if (typeof appAlertDialogState.pendingResolve === 'function') {
        const resolve = appAlertDialogState.pendingResolve;
        appAlertDialogState.pendingResolve = null;
        resolve(!!appAlertDialogState.dismissResult);
      }
      appAlertDialogState.mode = 'alert';
      appAlertDialogState.destructive = false;
      appAlertDialogState.dismissResult = false;
    },
  });
  (function registerDiagramsBottomSheetModal() {
    const SHEET_ID = 'diagramsBottomSheet';
    const SWIPE_CLOSE_THRESHOLD_PX = 50;
    let touchStartY = 0;
    let touchInHeader = false;
    let backdropPointerDownHandler = null;

    function handleSheetTouchStart(e) {
      const sheet = document.getElementById('diagramsBottomSheet');
      if (!sheet || sheet.hidden) return;
      const header = sheet.querySelector('.diagrams-bottom-sheet-drag-handle, .diagrams-bottom-sheet-title');
      touchInHeader = !!(header && (e.target === header || header.contains(e.target)));
      touchStartY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    }

    function handleSheetTouchEnd(e) {
      const sheet = document.getElementById('diagramsBottomSheet');
      if (!sheet || sheet.hidden || !touchInHeader) return;
      const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      if (endY - touchStartY >= SWIPE_CLOSE_THRESHOLD_PX) {
        closeAccessibleModal(SHEET_ID);
      }
    }

    registerAccessibleModal({
      id: SHEET_ID,
      element: document.getElementById('diagramsBottomSheet'),
      backdrop: document.getElementById('diagramsBottomSheetBackdrop'),
      closeOnBackdrop: true,
      closeOnEscape: true,
      initialFocus: () => {
        const sheet = document.getElementById('diagramsBottomSheet');
        if (!sheet) return null;
        const focusable = getFocusableElements(sheet);
        return focusable[0] || sheet;
      },
      onOpen: () => {
        const backdrop = document.getElementById('diagramsBottomSheetBackdrop');
        if (backdrop) {
          backdrop.removeAttribute('hidden');
          backdropPointerDownHandler = () => {
            closeAccessibleModal(SHEET_ID);
          };
          backdrop.addEventListener('pointerdown', backdropPointerDownHandler);
        }
        document.getElementById('toolbarBreadcrumbsNav')?.setAttribute('aria-expanded', 'true');
        document.getElementById('diagramsDropdownBtn')?.setAttribute('aria-expanded', 'true');
        document.body.classList.add('diagrams-bottom-sheet-open');
        const sheet = document.getElementById('diagramsBottomSheet');
        if (sheet) {
          sheet.addEventListener('touchstart', handleSheetTouchStart, { passive: true });
          sheet.addEventListener('touchend', handleSheetTouchEnd, { passive: true });
        }
      },
      onClose: () => {
        const backdrop = document.getElementById('diagramsBottomSheetBackdrop');
        if (backdrop && backdropPointerDownHandler) {
          backdrop.removeEventListener('pointerdown', backdropPointerDownHandler);
          backdropPointerDownHandler = null;
        }
        if (backdrop) backdrop.setAttribute('hidden', '');
        document.getElementById('toolbarBreadcrumbsNav')?.setAttribute('aria-expanded', 'false');
        document.getElementById('diagramsDropdownBtn')?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('diagrams-bottom-sheet-open');
        const sheet = document.getElementById('diagramsBottomSheet');
        if (sheet) {
          sheet.removeEventListener('touchstart', handleSheetTouchStart);
          sheet.removeEventListener('touchend', handleSheetTouchEnd);
        }
      },
    });
  })();
  initAlertDialogControls();

  if (modalA11yState.keydownBound) return;
  modalA11yState.keydownBound = true;
  document.addEventListener('keydown', (e) => {
    const topEntry = modalA11yState.stack[modalA11yState.stack.length - 1];
    if (!topEntry) return;
    const cfg = modalA11yState.registry.get(topEntry.id);
    const modal = cfg?.element;
    if (!cfg || !(modal instanceof HTMLElement) || modal.hasAttribute('hidden')) return;

    if (e.key === 'Escape') {
      if (cfg.closeOnEscape) {
        e.preventDefault();
        closeAccessibleModal(topEntry.id);
      }
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements(modal);
    if (focusable.length === 0) {
      e.preventDefault();
      focusElementNoScroll(modal);
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        focusElementNoScroll(last);
      }
      return;
    }
    if (active === last || !modal.contains(active)) {
      e.preventDefault();
      focusElementNoScroll(first);
    }
  }, true);

  modalA11yState.registry.forEach((cfg, id) => {
    if (cfg.backdrop instanceof HTMLElement) {
      cfg.backdrop.addEventListener('click', () => {
        if (cfg.closeOnBackdrop) closeAccessibleModal(id);
      });
      return;
    }
    cfg.element.addEventListener('click', (e) => {
      if (!cfg.closeOnBackdrop) return;
      if (e.target === cfg.element) closeAccessibleModal(id);
    });
  });
}

function getVisibleViewId() {
  const visible = document.querySelector('.app-view:not(.hidden)');
  return visible ? visible.id : null;
}

function isUsableFocusTarget(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.isConnected) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hidden) return false;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (el.getClientRects().length === 0 && el !== document.body) return false;
  return true;
}

function focusElementNoScroll(el) {
  if (!isUsableFocusTarget(el)) return false;
  try {
    el.focus({ preventScroll: true });
  } catch (_) {
    el.focus();
  }
  return true;
}

function rememberViewTransition(fromViewId, toViewId, triggerEl) {
  if (!fromViewId || !toViewId || fromViewId === toViewId || !(triggerEl instanceof HTMLElement)) return;
  for (let i = viewTransitionHistory.length - 1; i >= 0; i -= 1) {
    const entry = viewTransitionHistory[i];
    if (entry.from === fromViewId && entry.to === toViewId) {
      viewTransitionHistory.splice(i, 1);
      break;
    }
  }
  viewTransitionHistory.push({ from: fromViewId, to: toViewId, trigger: triggerEl });
  while (viewTransitionHistory.length > 24) viewTransitionHistory.shift();
}

function getReturnFocusTarget(fromViewId, toViewId) {
  for (let i = viewTransitionHistory.length - 1; i >= 0; i -= 1) {
    const entry = viewTransitionHistory[i];
    if (entry.from === toViewId && entry.to === fromViewId) {
      viewTransitionHistory.splice(i, 1);
      return entry.trigger;
    }
  }
  return null;
}

function getPrimaryViewFocusTarget(viewId) {
  if (viewId === 'view-login') {
    const setPasswordForm = document.getElementById('authSetPasswordForm');
    if (setPasswordForm && !setPasswordForm.hidden) {
      return document.getElementById('authNewPassword') || document.getElementById('authSetPasswordBtn');
    }
    const authForm = document.getElementById('authForm');
    if (authForm && !authForm.hidden) {
      return document.getElementById('authEmail') || document.getElementById('authSubmitBtn');
    }
    return document.getElementById('authSignOutBtn') || document.getElementById('authEmail');
  }
  if (viewId === 'view-products') {
    return document.getElementById('productLibrarySearch')
      || document.getElementById('productCardNew')
      || document.getElementById('btnBackToCanvas');
  }
  if (viewId === 'view-canvas') {
    return document.getElementById('generateQuoteBtn')
      || document.getElementById('saveDiagramBtn')
      || document.getElementById('canvas');
  }
  return null;
}

/**
 * Switch the visible app view. Hides all .app-view, shows the one with id viewId.
 * If viewId === 'view-canvas', calls resizeCanvas() after making it visible (so canvas is never measured while hidden), then draw().
 * If viewId === 'view-products', calls renderProductLibrary() to ensure data is fresh.
 */
function switchView(viewId, options = {}) {
  const fromViewId = getVisibleViewId();
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const explicitTrigger = options.triggerEl instanceof HTMLElement ? options.triggerEl : null;
  const explicitReturnFocus = options.returnFocusEl instanceof HTMLElement ? options.returnFocusEl : null;
  const triggerForHistory = explicitReturnFocus || explicitTrigger || activeElement;
  if (fromViewId && fromViewId !== viewId && triggerForHistory) {
    rememberViewTransition(fromViewId, viewId, triggerForHistory);
  }

  if (fromViewId === 'view-canvas' && viewId !== 'view-canvas') {
    if (typeof diagramToolbarDragCleanup === 'function') {
      diagramToolbarDragCleanup();
    }
    diagramToolbarDragCleanup = null;
  }

  document.querySelectorAll('.app-view').forEach((el) => {
    el.classList.add('hidden');
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove('hidden');
    if (viewId === 'view-canvas') {
      resizeCanvas();
      draw();
      initDiagramToolbarDragWithApp();
    } else if (viewId === 'view-products') {
      renderProductLibrary();
    }
    if (options.focus !== false) {
      const returnTarget = fromViewId && fromViewId !== viewId
        ? getReturnFocusTarget(fromViewId, viewId)
        : null;
      const fallbackTarget = getPrimaryViewFocusTarget(viewId);
      requestAnimationFrame(() => {
        if (focusElementNoScroll(returnTarget)) return;
        focusElementNoScroll(fallbackTarget);
      });
    }
    syncMobileOrientationPolicy(`switchView:${viewId}`);
  }
}

function init() {
  /* Apply viewport mode immediately so body[data-viewport-mode="mobile"] CSS applies on first paint (fixes mobile device layout). */
  layoutState.forcedMode = getForcedViewportModeFromUrl();
  applyViewportMode(detectViewportMode(), { announce: false });

  try {
    initCanvas();
  } catch (e) {
    console.warn('initCanvas failed', e);
  }
  try {
    initUpload();
  } catch (e) {
    console.warn('initUpload failed', e);
  }
  try {
    initZoomControls();
  } catch (e) {
    console.warn('initZoomControls failed', e);
  }
  try {
    initExport();
  } catch (e) {
    console.warn('initExport failed', e);
  }
  try {
    initGlobalToolbar();
  } catch (e) {
    console.warn('initGlobalToolbar failed', e);
  }
  try {
    initModalAccessibilityFramework();
  } catch (e) {
    console.warn('initModalAccessibilityFramework failed', e);
  }
  try {
    initAccessibilitySettings();
  } catch (e) {
    console.warn('initAccessibilitySettings failed', e);
  }
  initPanel();
  initResizer();
  try {
    initCropModal();
  } catch (e) {
    console.warn('initCropModal failed', e);
  }
  try {
    initQuoteModal();
  } catch (e) {
    console.warn('initQuoteModal failed', e);
  }
  try {
    initColorPalette();
  } catch (e) {
    console.warn('initColorPalette failed', e);
  }
  try {
    initHeaderColorPalette();
  } catch (e) {
    console.warn('initHeaderColorPalette failed', e);
  }
  try {
    initTransparencyPopover();
  } catch (e) {
    console.warn('initTransparencyPopover failed', e);
  }
  try {
    initFloatingToolbar();
  } catch (e) {
    console.warn('initFloatingToolbar failed', e);
  }
  try {
    initAccessibilityInspector();
  } catch (e) {
    console.warn('initAccessibilityInspector failed', e);
  }
  try {
    initServiceM8Menu();
  } catch (e) {
    console.warn('initServiceM8Menu failed', e);
  }
  try {
    initServicem8WarningPopover();
  } catch (e) {
    console.warn('initServicem8WarningPopover failed', e);
  }
  try {
    initDiagrams();
  } catch (e) {
    console.warn('initDiagrams failed', e);
  }
  initProducts();
  initProductsView();

  const authPromise = initAuth();
  const authReady = authPromise && typeof authPromise.then === 'function' ? authPromise : Promise.resolve();
  authReady.then(() => {
    if (authState.token) {
      switchView('view-canvas');
      updateServicem8ToolbarWarning();
    } else {
      switchView('view-login');
    }
    loadPanelProducts();
    // Check OAuth callback AFTER auth is restored (so checkServiceM8Status has token)
    checkOAuthCallback();
  });

  checkBackendAvailable().then((status) => {
    if (!status.ok) {
      if (status.reason === 'offline') {
        showMessage('You are offline. Some features will be unavailable until your connection returns.', 'info');
        return;
      }
      showMessage(
        'App not running from the backend server. Start with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000 then open http://127.0.0.1:8000/',
        'error'
      );
    }
  });

  syncMobileOrientationPolicy('init');
}

init();

// E2E test hooks
if (typeof window !== 'undefined') {
  window.__quoteAppSwitchView = function (viewId) { switchView(viewId); };
  window.__quoteAppElementCount = function () { return state.elements.length; };
  window.__quoteAppGetSelection = function () { return state.selectedIds ? state.selectedIds.slice() : []; };
  window.__quoteAppGetViewport = function () {
    return {
      baseScale: state.baseScale,
      baseOffsetX: state.baseOffsetX,
      baseOffsetY: state.baseOffsetY,
      viewZoom: state.viewZoom,
      viewPanX: state.viewPanX,
      viewPanY: state.viewPanY,
      scale: state.scale,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      fitPanFeedbackX: state.fitPanFeedbackX,
      fitPanFeedbackY: state.fitPanFeedbackY,
    };
  };
  window.__quoteAppGetViewportMode = function () {
    return layoutState.viewportMode;
  };
  window.__quoteAppGetOrientationPolicyState = function () {
    return {
      target: mobileOrientationPolicyState.target,
      lastAttemptTarget: mobileOrientationPolicyState.lastAttemptTarget,
      lastAttemptReason: mobileOrientationPolicyState.lastAttemptReason,
      lastErrorName: mobileOrientationPolicyState.lastErrorName,
      supported: mobileOrientationPolicyState.supported,
    };
  };
  window.__quoteAppSetElementRotation = function (id, degrees) {
    const el = state.elements.find((e) => e.id === id);
    if (el) {
      const result = constrainGutterRotation(degrees, el);
      el.rotation = result.degrees;
      if (typeof draw === 'function') draw();
    }
  };
  window.__quoteAppGetElements = function () {
    return state.elements.map((el) => ({ id: el.id, assetId: el.assetId || null, x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation || 0, color: el.color || null }));
  };
  // E2E helper: deterministic selection in touch/headless environments where click hit-testing can be flaky.
  window.__quoteAppSelectElementById = function (id) {
    const el = state.elements.find((e) => e.id === id);
    if (!el) return false;
    if (typeof setSelection === 'function') setSelection([id]);
    else {
      state.selectedIds = [id];
      state.selectedId = id;
    }
    state.selectedBlueprint = false;
    if (typeof draw === 'function') draw();
    return true;
  };
  // E2E fallback for environments where pointer drag is flaky (e.g. headless/mobile emulation).
  window.__quoteAppMoveElementBy = function (id, dx, dy) {
    const el = state.elements.find((e) => e.id === id);
    if (!el || el.locked) return false;
    const ndx = Number(dx);
    const ndy = Number(dy);
    if (!Number.isFinite(ndx) || !Number.isFinite(ndy)) return false;
    el.x += ndx;
    el.y += ndy;
    if (typeof setSelection === 'function') setSelection([id]);
    if (typeof draw === 'function') draw();
    return true;
  };
  // Returns element center in client/screen coordinates for E2E (canvas getBoundingClientRect + view transform).
  window.__quoteAppGetElementScreenCenter = function (id) {
    const el = state.elements.find((e) => e.id === id);
    if (!el) return null;
    const canvas = document.getElementById('canvas');
    const rect = getCanvasRect();
    if (!canvas || !rect) return null;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = state.canvasWidth / dpr;
    const logicalH = state.canvasHeight / dpr;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const displayX = state.offsetX + cx * state.scale;
    const displayY = state.offsetY + cy * state.scale;
    const screenX = rect.left + displayX * (rect.width / logicalW);
    const screenY = rect.top + displayY * (rect.height / logicalH);
    return { x: screenX, y: screenY };
  };
  window.__quoteAppHasBlueprint = function () { return !!(state.blueprintImage && state.blueprintTransform); };
  window.__quoteAppGetBlueprintOpacity = function () { return state.blueprintTransform?.opacity ?? 1; };
  window.__quoteAppGetBlueprintScreenRect = function () {
    if (!state.blueprintImage || !state.blueprintTransform) return null;
    const rect = getCanvasRect();
    if (!rect || !rect.width || !rect.height) return null;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = state.canvasWidth / dpr;
    const logicalH = state.canvasHeight / dpr;
    if (!logicalW || !logicalH) return null;
    const bt = state.blueprintTransform;
    const bbox = rotatedRectBbox(bt.x, bt.y, bt.w, bt.h, bt.rotation || 0);
    const displayLeft = state.offsetX + bbox.x * state.scale;
    const displayTop = state.offsetY + bbox.y * state.scale;
    const displayRight = state.offsetX + (bbox.x + bbox.width) * state.scale;
    const displayBottom = state.offsetY + (bbox.y + bbox.height) * state.scale;
    const toClientX = (displayX) => rect.left + displayX * (rect.width / logicalW);
    const toClientY = (displayY) => rect.top + displayY * (rect.height / logicalH);
    const left = toClientX(displayLeft);
    const top = toClientY(displayTop);
    const right = toClientX(displayRight);
    const bottom = toClientY(displayBottom);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      canvas: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      insets: {
        left: left - rect.left,
        right: rect.right - right,
        top: top - rect.top,
        bottom: rect.bottom - bottom,
      },
    };
  };
  window.__quoteAppSelectBlueprint = function () {
    if (!state.blueprintTransform) return false;
    state.selectedBlueprint = true;
    state.selectedIds = [];
    state.selectedId = null;
    return true;
  };
  // Color tinting test hooks: verify originalImage preservation and tintedCanvas creation
  window.__quoteAppGetElementColorInfo = function (id) {
    const el = state.elements.find((e) => e.id === id);
    if (!el) return null;
    
    const originalImageSrc = el.originalImage?.src || el.originalImage?.currentSrc || null;
    const originalImageWidth = el.originalImage?.naturalWidth || el.originalImage?.width || null;
    const originalImageHeight = el.originalImage?.naturalHeight || el.originalImage?.height || null;
    
    // Check if tintedCanvas dimensions match expected size
    const tintedCanvasValid = el.tintedCanvas && 
      el.tintedCanvasWidth === el.width && 
      el.tintedCanvasHeight === el.height &&
      el.tintedCanvasColor === el.color;
    
    // Detect missing tint when color is set
    const tintedCanvasNullWhenColored = !!el.color && !el.tintedCanvas;
    
    return {
      id: el.id,
      hasOriginalImage: !!el.originalImage,
      hasTintedCanvas: !!el.tintedCanvas,
      color: el.color || null,
      tintedCanvasColor: el.tintedCanvasColor || null,
      tintedCanvasWidth: el.tintedCanvasWidth || null,
      tintedCanvasHeight: el.tintedCanvasHeight || null,
      originalImageSrc,
      originalImageWidth,
      originalImageHeight,
      elementWidth: el.width,
      elementHeight: el.height,
      tintedCanvasValid,
      tintedCanvasNullWhenColored,
    };
  };
  
  // Dump blueprint and element image instances to detect sharing
  window.__quoteAppDumpImageInstances = function (elementId) {
    const el = state.elements.find((e) => e.id === elementId);
    if (!el) {
      console.warn('[__quoteAppDumpImageInstances] Element not found', { elementId });
      return null;
    }
    
    const blueprint = {
      src: state.blueprintImage?.src || state.blueprintImage?.currentSrc || null,
      instance: state.blueprintImage,
      isSameAsElement: state.blueprintImage === el.originalImage,
    };
    
    const element = {
      src: el.originalImage?.src || el.originalImage?.currentSrc || null,
      instance: el.originalImage,
      isSameAsBlueprint: el.originalImage === state.blueprintImage,
    };
    
    const result = { blueprint, element };
    console.log('[__quoteAppDumpImageInstances]', result);
    
    if (blueprint.isSameAsElement || element.isSameAsBlueprint) {
      console.error('[__quoteAppDumpImageInstances] WARNING: Blueprint and element share the same Image instance!', result);
    }
    
    return result;
  };
  
  // Check asset transparency by sampling corner pixels
  window.__quoteAppCheckAssetTransparency = function (image) {
    if (!image) {
      console.warn('[__quoteAppCheckAssetTransparency] No image provided');
      return null;
    }
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width || 100;
      canvas.height = image.naturalHeight || image.height || 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      ctx.drawImage(image, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      // Sample corner pixels: top-left, top-right, bottom-left, bottom-right
      const w = canvas.width;
      const h = canvas.height;
      const samples = [
        { pos: 'top-left', x: 0, y: 0 },
        { pos: 'top-right', x: w - 1, y: 0 },
        { pos: 'bottom-left', x: 0, y: h - 1 },
        { pos: 'bottom-right', x: w - 1, y: h - 1 },
      ];
      
      const results = samples.map(({ pos, x, y }) => {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        return { pos, x, y, r, g, b, alpha: a, isTransparent: a < 255 };
      });
      
      const allOpaque = results.every(r => !r.isTransparent);
      const allTransparent = results.every(r => r.isTransparent);
      
      const report = {
        imageSrc: image.src || image.currentSrc || 'unknown',
        width: canvas.width,
        height: canvas.height,
        samples: results,
        allCornersOpaque: allOpaque,
        allCornersTransparent: allTransparent,
        hasTransparency: !allOpaque,
        warning: allOpaque ? 'Asset appears fully opaque - tinting may cover entire area' : null,
      };
      
      console.log('[__quoteAppCheckAssetTransparency]', report);
      if (allOpaque) {
        console.warn('[__quoteAppCheckAssetTransparency] WARNING: Asset has no transparent corners', report);
      }
      
      return report;
    } catch (error) {
      console.error('[__quoteAppCheckAssetTransparency] Error checking transparency', { error: error.message });
      return null;
    }
  };
  
  // Get current layer order for debugging
  window.__quoteAppGetLayerOrder = function () {
    const layers = [];
    if (state.blueprintImage && state.blueprintTransform) {
      const bt = state.blueprintTransform;
      layers.push({
        type: 'blueprint',
        zIndex: bt.zIndex != null ? bt.zIndex : BLUEPRINT_Z_INDEX,
        hasImage: !!state.blueprintImage,
        transform: { ...bt },
      });
    }
    state.elements.forEach((el) => {
      layers.push({
        type: 'element',
        id: el.id,
        zIndex: el.zIndex != null ? el.zIndex : 0,
        hasOriginalImage: !!el.originalImage,
        hasTintedCanvas: !!el.tintedCanvas,
        color: el.color || null,
      });
    });
    layers.sort((a, b) => a.zIndex - b.zIndex);
    return layers;
  };
  // Returns selection box and handle positions in canvas display coordinates (rotated by element.rotation for correct E2E).
  window.__quoteAppGetSelectionBoxInCanvasCoords = function () {
    const selected = state.elements.find((e) => e.id === state.selectedId);
    if (!selected || state.selectedIds.length !== 1) return null;
    const pos = getElementDrawPosition(selected);
    const sx = state.offsetX + pos.x * state.scale;
    const sy = state.offsetY + pos.y * state.scale;
    const sw = selected.width * state.scale;
    const sh = selected.height * state.scale;
    const padding = CANVAS_PORTER_VISUAL_PADDING * state.scale;
    const paddedSx = sx - padding;
    const paddedSy = sy - padding;
    const paddedSw = sw + padding * 2;
    const paddedSh = sh + padding * 2;
    const paddedCx = paddedSx + paddedSw / 2;
    const paddedCy = paddedSy + paddedSh / 2;
    const rotY = paddedSy - ROTATE_HANDLE_OFFSET;
    const rotation = selected.rotation || 0;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotateHandlePos = (hx, hy) => {
      const dx = hx - paddedCx;
      const dy = hy - paddedCy;
      return { x: paddedCx + dx * cos - dy * sin, y: paddedCy + dx * sin + dy * cos };
    };
    const unrotated = {
      nw: { x: paddedSx, y: paddedSy },
      n: { x: paddedSx + paddedSw / 2, y: paddedSy },
      ne: { x: paddedSx + paddedSw, y: paddedSy },
      e: { x: paddedSx + paddedSw, y: paddedSy + paddedSh / 2 },
      se: { x: paddedSx + paddedSw, y: paddedSy + paddedSh },
      s: { x: paddedSx + paddedSw / 2, y: paddedSy + paddedSh },
      sw: { x: paddedSx, y: paddedSy + paddedSh },
      w: { x: paddedSx, y: paddedSy + paddedSh / 2 },
      rotate: { x: paddedCx, y: rotY },
    };
    const handles = {};
    for (const [k, v] of Object.entries(unrotated)) {
      handles[k] = rotateHandlePos(v.x, v.y);
    }
    return {
      box: { left: paddedSx, top: paddedSy, width: paddedSw, height: paddedSh },
      handles,
    };
  };

  // Returns selection box and handle positions in client/screen coordinates (for E2E: use directly with page.mouse).
  // Fixes rotation/resize E2E failures caused by using display coords as if they were screen coords.
  window.__quoteAppGetSelectionBoxInScreenCoords = function () {
    const box = window.__quoteAppGetSelectionBoxInCanvasCoords();
    if (!box) return null;
    const rect = getCanvasRect();
    if (!rect || !rect.width || !rect.height) return null;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = state.canvasWidth / dpr;
    const logicalH = state.canvasHeight / dpr;
    const displayToClientX = (dx) => rect.left + dx * (rect.width / logicalW);
    const displayToClientY = (dy) => rect.top + dy * (rect.height / logicalH);
    return {
      box: {
        left: displayToClientX(box.box.left),
        top: displayToClientY(box.box.top),
        width: box.box.width * (rect.width / logicalW),
        height: box.box.height * (rect.height / logicalH),
      },
      handles: Object.fromEntries(
        Object.entries(box.handles).map(([k, v]) => [
          k,
          { x: displayToClientX(v.x), y: displayToClientY(v.y) },
        ])
      ),
    };
  };
  
  // Global scope (type="module"): index.html has no inline handlers (onclick= etc.), so no UI
  // functions need to be on window. If you add any onclick="someFn()" in HTML later, add:
  // window.someFn = someFn;
  // Debug mode helpers: enable diagnostic logging
  window.__quoteAppEnableDebugMode = function (enable = true) {
    window.__quoteAppDebugColorChanges = enable;
    window.__quoteAppDebugLayerSort = enable;
    console.log('[__quoteAppEnableDebugMode] Debug mode', enable ? 'ENABLED' : 'DISABLED');
    console.log('  - Color change logging:', enable);
    console.log('  - Layer sort logging:', enable);
    console.log('  - Use __quoteAppGetElementColorInfo(id) to check element color state');
    console.log('  - Use __quoteAppDumpImageInstances(id) to check image instance sharing');
    console.log('  - Use __quoteAppCheckAssetTransparency(image) to check asset transparency');
    console.log('  - Use __quoteAppGetLayerOrder() to check layer ordering');
  };
  
  // Enable debug mode by default in development (can be disabled via console)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Debug mode disabled by default - enable manually if needed
    // window.__quoteAppEnableDebugMode(true);
  }
}
