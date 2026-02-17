/**
 * Quote App – blueprint canvas, Marley panel, Canva-style elements (select, move, resize, rotate).
 */

const state = {
  canvas: null,
  ctx: null,
  blueprintImage: null,
  originalFile: null,
  blueprintTransform: null, // { x, y, w, h, rotation } when blueprint present; same coord system as elements
  selectedBlueprint: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  viewZoom: 1,   // user zoom multiplier (1 = fit); <1 zoom out, >1 zoom in
  viewPanX: 0,
  viewPanY: 0,
  baseScale: 1,  // last computed fit scale (for zoom toward cursor)
  baseOffsetX: 0,
  baseOffsetY: 0,
  elements: [],
  selectedId: null,
  selectedIds: [], // multi-select; selectedId === selectedIds[0]
  groups: [], // { id: string, elementIds: string[] }
  dragOffset: { x: 0, y: 0 },
  mode: null, // 'move' | 'resize' | 'rotate' | 'blueprint-move' | 'blueprint-resize' | 'blueprint-rotate' | 'pan'
  resizeHandle: null,
  products: [],
  profileFilter: '', // '' | 'storm_cloud' | 'classic' | 'other'
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
  debounceBboxTimerId: null, // timeout id for 100ms debounce
  // Ghost preview while dragging from panel over canvas (40% opacity, 150px max)
  dragPreviewImage: null,
  dragPreviewCanvasPos: null,
  // Resize: throttle updates with RAF for smooth movement (one update per frame)
  pendingResizeCanvasPos: null,
  pendingResizeAltKey: false, // Alt = allow warp; default lockAspectRatio = true
  resizeRAFId: null,
  colorPaletteOpen: false, // toggled by floating toolbar colour button; when true, show #colorPalettePopover below toolbar
  transparencyPopoverOpen: false, // toggled by #blueprintTransparencyBtn; only way to open transparency slider
  badgeLengthEditElementId: null, // when badge length popover is open, the element id being edited
};

/** Product IDs that are consumables (billing only); excluded from canvas/panel drag-drop. */
const CONSUMABLE_PRODUCT_IDS = ['SCR-SS', 'GL-MAR', 'MS-GRY'];

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
  'DP-65-3M': '65 MM downpipe',
  'DP-80-3M': '80 MM downpipe',
};
function getQuoteProductDisplayName(assetId, fallbackName) {
  if (QUOTE_PRODUCT_DISPLAY_OVERRIDES[assetId]) return QUOTE_PRODUCT_DISPLAY_OVERRIDES[assetId];
  return fallbackName != null ? fallbackName : (state.products.find((p) => p.id === assetId)?.name) || assetId;
}

/** Available gutter stock lengths (mm). Used for bin-packing to minimize waste. */
const GUTTER_STOCK_LENGTHS_MM = [5000, 3000, 1500];

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

/** True if element is a gutter (for separate numbering: gutters = numbers, downpipes = letters). */
function isGutterElement(assetId) {
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
 * Gutters (GUT-*-MAR-*M), downpipes (DP-*, DPJ-*), droppers (dropper, DRP-*).
 */
function isMeasurableElement(assetId) {
  if (!assetId || typeof assetId !== 'string') return false;
  const a = assetId.trim().toUpperCase();
  if (GUTTER_PATTERN.test(assetId)) return true;
  if (a.startsWith('DP-') || a.startsWith('DPJ-')) return true;
  if (a === 'DROPPER' || a.startsWith('DRP-')) return true;
  return false;
}

/**
 * Default rotation (degrees) when dropping a measurable linear asset, for isometric look.
 * Gutters = horizontal runs → 30°; Downpipes/Droppers = vertical drops → 90° (standing up).
 */
function getDefaultRotationForLinear(assetId) {
  if (!assetId || !isMeasurableElement(assetId)) return 0;
  if (GUTTER_PATTERN.test(assetId.trim())) return 30;
  const a = assetId.trim().toUpperCase();
  if (a.startsWith('DP-') || a.startsWith('DPJ-') || a === 'DROPPER' || a.startsWith('DRP-')) return 90;
  return 30;
}

const MIN_VIEW_ZOOM = 0.15;
const MAX_VIEW_ZOOM = 4;
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
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 320;

// Uniform element sizing: placed elements use 1/5 of reference size (works for portrait/landscape 9:16)
const REFERENCE_SIZE_PX = 400;
const ELEMENT_MAX_DIMENSION_PX = Math.round(REFERENCE_SIZE_PX / 5); // 80px
// Dropped elements: scale so largest dimension fits in this bounding box; stored dimensions use baseScale 1.0
const DROPPED_ELEMENT_MAX_DIMENSION_PX = 150;
const DROP_GHOST_OPACITY = 0.4;
const MIN_ELEMENT_DIMENSION_PX = 20;

// Canvas Porter: Auto-Scale normalization
const CANVAS_PORTER_MAX_UNIT = 150; // MaxUnit for normalization (same as DROPPED_ELEMENT_MAX_DIMENSION_PX)
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

/** Last successful quote response for edit mode: { materials, materials_subtotal, labour_hours, labour_rate, labour_subtotal, total } */
let lastQuoteData = null;

/** True when user has changed cost/markup in quote edit mode and not yet saved. */
let hasPricingChanges = false;

const MAX_UNDO_HISTORY = 50;
let undoHistory = [];
let blueprintUndoHistory = []; // Separate stack for blueprint moves/resize/rotate so Ctrl+Z doesn't undo background when tweaking parts

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE_MB = 20;

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
  const wrap = document.getElementById('cropCanvasWrap');
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
    modal.removeAttribute('hidden');
    drawCropPreview();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showMessage('Could not load image for cropping.');
  };
  img.src = url;
}

function hideCropModal() {
  const modal = document.getElementById('cropModal');
  if (modal) modal.setAttribute('hidden', '');
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
  const backdrop = document.getElementById('cropModalBackdrop');

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
  backdrop.addEventListener('click', hideCropModal);

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
  const modal = document.getElementById('quoteModal');
  if (modal) modal.setAttribute('hidden', '');
  setQuoteEditMode(false);
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
        if (markupInput) { row.cells[3].removeChild(markupInput); row.cells[3].textContent = markupVal; }
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
    const qty = qtyInput ? (parseFloat(qtyInput.value) || 0) : (parseFloat(qtyCell?.textContent) || 0);
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    row.cells[5].textContent = formatCurrency(lineTotal);
    materialsSubtotal += lineTotal;
  }

  const labourTotal = parseFloat(document.getElementById('labourTotalDisplay')?.textContent?.replace(/[^0-9.]/g, '')) || 0;
  const total = Math.round((materialsSubtotal + labourTotal) * 100) / 100;
  if (materialsTotalDisplay) materialsTotalDisplay.textContent = formatCurrency(materialsSubtotal);
  if (quoteTotalDisplay) quoteTotalDisplay.textContent = formatCurrency(total);
}

/** Filter products by search term (name or item_number). */
function filterProductsForQuoteSearch(term) {
  const t = (term || '').trim().toLowerCase();
  if (!t) return state.products || [];
  const products = state.products || [];
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

/** Convert empty row to a normal quote line and append a new empty row. If product already exists, merge qty into that row and keep one empty row. */
function commitEmptyRow(tr, productId, qty) {
  const table = document.getElementById('quotePartsTable');
  const tableBody = document.getElementById('quoteTableBody');
  if (!tr || !tableBody) return;
  const product = state.products.find((p) => p.id === productId);
  const name = getQuoteProductDisplayName(productId, product?.name);
  const isManualLengthProduct = GUTTER_PATTERN.test(productId) || (productId && String(productId).toUpperCase().startsWith('DP-'));
  const qtyNum = isManualLengthProduct ? (parseFloat(qty) || 0) : Math.max(1, parseFloat(qty) || 1);

  const existingRow = tableBody.querySelector(`tr[data-asset-id="${CSS.escape(productId)}"]:not([data-empty-row="true"])`);
  if (existingRow && existingRow.cells[1]) {
    const isManualLength = GUTTER_PATTERN.test(productId) || (productId && String(productId).toUpperCase().startsWith('DP-'));
    if (isManualLength) {
      const lengthMm = existingRow.dataset.lengthMm != null && existingRow.dataset.lengthMm !== '' ? parseFloat(existingRow.dataset.lengthMm) : null;
      const existingCellText = (existingRow.cells[1].textContent || '').trim();
      const existingMetres = lengthMm != null ? lengthMm / 1000 : (existingCellText.endsWith('m') ? parseFloat(existingCellText) : parseFloat(existingCellText)) || 0;
      const addedMetres = parseFloat(qty) || 0;
      const newLengthMm = Math.round((existingMetres + addedMetres) * 1000);
      existingRow.dataset.lengthMm = String(newLengthMm);
      existingRow.cells[1].textContent = formatMetres(newLengthMm);
    } else {
      const currentQty = parseFloat(existingRow.cells[1].textContent) || 0;
      existingRow.cells[1].textContent = String(currentQty + qtyNum);
    }
    tr.remove();
    appendEmptyQuoteRow();
    const labourRateSelect = document.getElementById('labourRateSelect');
    const labourHoursInput = document.getElementById('labourHoursInput');
    const labourRateId = labourRateSelect?.value?.trim() || '';
    const labourHours = parseFloat(labourHoursInput?.value) || 0;
    if (labourRateId && labourHours >= 0) calculateAndDisplayQuote();
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
  if (isManualLengthProduct && qtyNum >= 0) {
    const lengthMm = Math.round(qtyNum * 1000);
    tr.dataset.lengthMm = String(lengthMm);
    qtyCell.textContent = formatMetres(lengthMm);
  } else {
    qtyCell.textContent = String(qtyNum);
  }

  tr.cells[2].textContent = '—';
  tr.cells[3].textContent = '—';
  tr.cells[4].textContent = '—';
  tr.cells[5].textContent = '—';
  tr.dataset.assetId = productId;
  delete tr.dataset.emptyRow;
  tr.classList.remove('quote-row-empty');

  if (table?.classList.contains('quote-parts-table--editing')) addEditInputsToRow(tr);

  appendEmptyQuoteRow();

  const labourRateSelect = document.getElementById('labourRateSelect');
  const labourHoursInput = document.getElementById('labourHoursInput');
  const labourRateId = labourRateSelect?.value?.trim() || '';
  const labourHours = parseFloat(labourHoursInput?.value) || 0;
  if (labourRateId && labourHours >= 0) calculateAndDisplayQuote();
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
      const first = list.querySelector('.quote-product-list-option');
      if (first) {
        e.preventDefault();
        commitEmptyRow(tr, first.dataset.productId, qtyInput?.value || 1);
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
  const backdrop = document.getElementById('quoteModalBackdrop');
  const btnClose = document.getElementById('quoteModalClose');
  const btnCloseFooter = document.getElementById('quoteCloseBtn');
  const btnGenerate = document.getElementById('generateQuoteBtn');
  const tableBody = document.getElementById('quoteTableBody');
  const labourHoursInput = document.getElementById('labourHoursInput');
  const labourRateSelect = document.getElementById('labourRateSelect');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');

  if (!modal || !btnGenerate) return;

  btnClose?.addEventListener('click', hideQuoteModal);
  btnCloseFooter?.addEventListener('click', hideQuoteModal);
  backdrop?.addEventListener('click', hideQuoteModal);

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
    if (labourHoursInput) labourHoursInput.value = '0';

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
      if (length_mm != null && length_mm > 0) tr.dataset.lengthMm = String(length_mm);
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
        qtyCell.textContent = String(qty);
      }
      if (tableBody) tableBody.appendChild(tr);
    });
    lastQuoteData = null;
    setQuoteEditMode(false);
    updateQuoteTotalWarning();

    // Show modal
    modal.removeAttribute('hidden');

    // Fetch labour rates and populate dropdown
    try {
      const res = await fetch('/api/labour-rates');
      const data = await res.json();
      const rates = data.labour_rates || [];
      if (labourRateSelect) {
        labourRateSelect.innerHTML = '<option value="">Select rate…</option>';
        rates.forEach((r) => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = `${r.rateName} — $${Number(r.hourlyRate).toFixed(2)}/hr`;
          labourRateSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Failed to load labour rates', err);
      if (labourRateSelect) labourRateSelect.innerHTML = '<option value="">Select rate…</option><option value="" disabled>Failed to load rates</option>';
    }

    appendEmptyQuoteRow();

    // Auto-select first labour rate and run calculation so unit price and totals display when modal opens
    // This also ensures inferred items (brackets, screws, clips) appear immediately, even for incomplete rows
    const firstRateOpt = labourRateSelect?.querySelector('option[value]:not([value=""])');
    if (firstRateOpt && labourRateSelect) {
      labourRateSelect.value = firstRateOpt.value;
      const elements = getElementsFromQuoteTable();
      if (elements.length > 0) {
        await calculateAndDisplayQuote();
      }
    }

    // Set focus to labour hours input
    if (labourHoursInput) labourHoursInput.focus();
  });

  // Calculate quote when labour hours or rate changes (only when both have values)
  function runCalculateQuote() {
    const labourHours = parseFloat(labourHoursInput?.value) || 0;
    const labourRateId = labourRateSelect?.value?.trim() || '';
    if (!labourRateId || labourHours < 0) return;
    calculateAndDisplayQuote();
  }
  labourHoursInput?.addEventListener('input', runCalculateQuote);
  labourRateSelect?.addEventListener('change', runCalculateQuote);

  const btnCopy = document.getElementById('quoteCopyBtn');
  btnCopy?.addEventListener('click', () => copyQuoteToClipboard());

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
  // Remove incomplete state and input so calculateAndDisplayQuote() can update qty cell with proper value
  tr.removeAttribute('data-incomplete-measurement');
  tr.classList.remove('quote-row-incomplete-measurement');
  const qtyCell = tr.cells[1];
  if (qtyCell && input.parentNode === qtyCell) {
    qtyCell.removeChild(input);
    // Set placeholder text until calculateAndDisplayQuote() updates it with the actual qty
    qtyCell.textContent = String(val) + ' m';
  }
  const labourRateSelect = document.getElementById('labourRateSelect');
  const labourHoursInput = document.getElementById('labourHoursInput');
  const labourRateId = labourRateSelect?.value?.trim() || '';
  const labourHours = parseFloat(labourHoursInput?.value) || 0;
  if (labourRateId && labourHours >= 0) calculateAndDisplayQuote();
  updateQuoteTotalWarning();
}

/**
 * Show ⚠️ and red total when any quote row has missing manual measurement; hide when none.
 */
function updateQuoteTotalWarning() {
  const tableBody = document.getElementById('quoteTableBody');
  const warningSpan = document.getElementById('quoteTotalWarning');
  const totalLine = document.getElementById('quoteTotalFinalLine');
  if (!tableBody || !warningSpan || !totalLine) return;
  const hasIncomplete = tableBody.querySelector('tr.quote-row-incomplete-measurement') != null;
  warningSpan.hidden = !hasIncomplete;
  totalLine.classList.toggle('quote-total-final--incomplete', hasIncomplete);
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

  // Build profile lengths from section header rows (gutter system header has editable length)
  // Also track incomplete profiles (empty/invalid header inputs)
  const profileLengthMm = {};
  const incompleteProfilesForElements = new Set();
  for (const row of tableBody.rows) {
    const profile = row.dataset.sectionHeader;
    if (!profile) continue;
    const metresInput = row.cells[1]?.querySelector('.quote-header-metres-input');
    if (metresInput) {
      const metresVal = parseFloat(metresInput.value);
      if (Number.isFinite(metresVal) && metresVal > 0) {
        profileLengthMm[profile] = mToMm(metresVal);
      } else {
        // Header input is empty or invalid - mark profile as incomplete
        incompleteProfilesForElements.add(profile);
      }
    }
  }

  // Emit gutter elements from header length (bin-pack per profile)
  // Only emit if header has valid length (skip incomplete profiles)
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

  for (const row of tableBody.rows) {
    const assetId = row.dataset.assetId;
    if (!assetId) continue;
    if (row.dataset.inferred === 'true') continue; // backend infers these from gutters/clips; avoid double-counting
    const rowGutterMatch = GUTTER_PATTERN.exec(assetId.trim());
    // Skip child gutter rows when we have header length (we emitted from header above)
    // OR when profile is incomplete (don't send incomplete gutters to backend)
    if (rowGutterMatch) {
      const profile = rowGutterMatch[1].toUpperCase();
      if (profileLengthMm[profile] != null) {
        continue; // Header length exists, already bin-packed above
      }
      if (incompleteProfilesForElements.has(profile)) {
        continue; // Profile is incomplete, skip gutter rows (don't send default values)
      }
    }
    const qtyCell = row.cells[1];
    let qty = 0;
    let lengthMm = row.dataset.lengthMm != null && row.dataset.lengthMm !== '' ? parseFloat(row.dataset.lengthMm) : undefined;
    const metresInput = qtyCell?.querySelector('.quote-qty-metres-input');
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
      } else {
        qty = qtyCell ? parseFloat(qtyCell.textContent?.trim()) || 0 : 0;
      }
    }
    // Always send incomplete rows (qty=1, no length_mm) so backend returns inferred items
    // Skip only if both qty is 0 AND no length (truly empty row)
    if (qty <= 0 && !lengthMm && !metresInput) continue;

    // Gutter with length: expand into one element per length type (bin-packing) so backend returns one row per length.
    // Send length_mm on the first bin-packed element so bracket/screw count uses manual length, not bin-packed stock length.
    if (rowGutterMatch && lengthMm != null && lengthMm > 0) {
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

    if (qty <= 0) qty = 1;
    const item = { assetId, quantity: qty };
    if (lengthMm != null && Number.isFinite(lengthMm) && lengthMm > 0) item.length_mm = lengthMm;
    elements.push(item);
  }
  return elements;
}

function formatCurrency(amount) {
  return '$' + Number(amount).toFixed(2);
}

/**
 * Format current quote modal content as plain text and copy to clipboard.
 * Sections: MATERIALS (line items), Materials Subtotal, LABOUR (hours × rate), TOTAL.
 * Shows "Quote copied to clipboard" on success.
 */
function copyQuoteToClipboard() {
  const tableBody = document.getElementById('quoteTableBody');
  const labourHoursInput = document.getElementById('labourHoursInput');
  const labourRateSelect = document.getElementById('labourRateSelect');
  const materialsTotalDisplay = document.getElementById('materialsTotalDisplay');
  const labourTotalDisplay = document.getElementById('labourTotalDisplay');
  const quoteTotalDisplay = document.getElementById('quoteTotalDisplay');

  const lines = [];
  lines.push('MATERIALS');
  if (tableBody && tableBody.rows.length) {
    for (const row of tableBody.rows) {
      if (!row.dataset.assetId) continue; // skip empty/new line rows
      const product = row.cells[0]?.textContent ?? '';
      const qtyCell = row.cells[1];
      const metresInput = qtyCell?.querySelector('.quote-qty-metres-input');
      const qtyLineInput = qtyCell?.querySelector('.quote-line-qty-input');
      let qty = '';
      if (metresInput) qty = metresInput.value.trim() || 'Metres?';
      else if (qtyLineInput) qty = qtyLineInput.value;
      else qty = qtyCell?.textContent ?? '';
      const unitPrice = row.cells[4]?.textContent ?? '—';
      const total = row.cells[5]?.textContent ?? '—';
      lines.push(`${product}\t${qty}\t${unitPrice}\t${total}`);
    }
  }
  lines.push('');
  lines.push('Materials Subtotal\t' + (materialsTotalDisplay?.textContent ?? '0.00'));
  lines.push('');
  lines.push('LABOUR');
  const hours = labourHoursInput?.value ?? '0';
  const rateLabel = labourRateSelect?.selectedOptions?.[0]?.text ?? '';
  lines.push(`${hours} hours × ${rateLabel}`);
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
  const labourHoursInput = document.getElementById('labourHoursInput');
  const labourRateSelect = document.getElementById('labourRateSelect');
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
  if (elements.length === 0) {
    showError('No items in quote. Add products from the canvas or use Add item.');
    return;
  }

  const labourHours = parseFloat(labourHoursInput?.value) || 0;
  const labourRateId = labourRateSelect?.value?.trim() || '';
  if (!labourRateId) {
    showError('Please select a labour rate.');
    return;
  }

  try {
    const res = await fetch('/api/calculate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements, labour_hours: labourHours, labour_rate_id: labourRateId }),
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
    if (!quote || !quote.materials) {
      showError('Invalid response from server.');
      return;
    }
    lastQuoteData = quote;

    // Always process all materials, but set inferred items (brackets, screws, clips) to empty qty when incomplete
    const materialsToProcess = quote.materials;

    // Collect all product IDs returned from backend to identify which incomplete rows should be removed
    const returnedProductIds = new Set(materialsToProcess.map(line => line.id));

    // --- System-based grouping: group gutter system items by profile ---
    const gutterGroups = {}; // profile -> { totalMetres, children: line[] }
    const ungrouped = [];
    const u = (id) => String(id || '').toUpperCase();
    const isGutterSystemItem = (id) => {
      const x = u(id);
      return GUTTER_PATTERN.test(id) || x.startsWith('BRK-') || x === 'SCR-SS';
    };

    materialsToProcess.forEach((line) => {
      if (!isGutterSystemItem(line.id)) {
        ungrouped.push(line);
        return;
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

    const emptyRow = tableBody?.querySelector('tr[data-empty-row="true"]');

    /** Render a single material row (child item) with qty input, indentation, etc. */
    function renderMaterialRow(line, insertBefore) {
      const row = document.createElement('tr');
      row.dataset.assetId = line.id;
      const isGutterOrDownpipe = GUTTER_PATTERN.test(line.id) || (line.id && u(line.id).startsWith('DP-'));
      const isGutter = GUTTER_PATTERN.test(line.id);
      // For gutter rows: if profile has header length override, ignore manualOverrides (bin-packing recalculated quantities)
      // Only use manualOverrides for gutters if header length hasn't changed (no header override exists)
      const gutterProfile = isGutter ? getProfileFromAssetId(line.id) : null;
      const hasHeaderLengthOverride = gutterProfile && profileLengthOverride[gutterProfile] != null;
      const shouldIgnoreGutterOverride = isGutter && hasHeaderLengthOverride;
      const hasManualOverride = !shouldIgnoreGutterOverride && manualOverrides[line.id] != null;
      if (!isGutterOrDownpipe && !hasManualOverride) row.dataset.inferred = 'true';
      const isInferredItem = u(line.id).startsWith('BRK-') || line.id === 'SCR-SS' || u(line.id).startsWith('SCL-') || u(line.id).startsWith('ACL-');
      const overrideQty = shouldIgnoreGutterOverride ? null : manualOverrides[line.id];
      const qtyDisplay = overrideQty != null ? String(overrideQty) : ((isInferredItem && hasIncompleteMeasurable) ? '' : String(line.qty));
      let nameClass = '';
      if (u(line.id).startsWith('SCR-')) nameClass = 'quote-product-indent-level-2';
      else if (u(line.id).startsWith('BRK-') || u(line.id).startsWith('SCL-') || u(line.id).startsWith('ACL-')) nameClass = 'quote-product-indent-level-1';
      const nameContent = escapeHtml(line.name || line.id);
      row.innerHTML = `<td><span class="${nameClass}">${nameContent}</span></td><td><input type="number" class="quote-line-qty-input" value="${escapeHtml(qtyDisplay)}" min="0" step="1" aria-label="Quantity"></td><td>—</td><td>—</td><td>—</td><td>—</td>`;
      if (insertBefore) tableBody.insertBefore(row, insertBefore);
      else tableBody.appendChild(row);
      row.dataset.costPrice = String(line.cost_price);
      row.dataset.markupPct = String(line.markup_percentage);
      row.cells[2].textContent = formatCurrency(line.cost_price);
      row.cells[3].textContent = String(line.markup_percentage);
      row.cells[4].textContent = formatCurrency(line.sell_price);
      row.cells[5].textContent = formatCurrency(line.line_total);
      const qtyInput = row.querySelector('.quote-line-qty-input');
      if (qtyInput) {
        qtyInput.addEventListener('change', () => {
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
    Array.from(tableBody?.rows || []).forEach((r) => {
      if (r.dataset.sectionHeader) {
        // Check section header for empty/invalid input
        const metresInput = r.querySelector('.quote-header-metres-input');
        if (metresInput) {
          const v = parseFloat(metresInput.value);
          if (!Number.isFinite(v) || v <= 0) {
            incompleteProfiles.add(r.dataset.sectionHeader);
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
        }
      }
    });

    // Preserve manual overrides (user edited inferred item) and header lengths before clearing
    const manualOverrides = {};
    const profileLengthOverride = {};
    Array.from(tableBody?.rows || []).forEach((r) => {
      if (r.dataset.sectionHeader) {
        const metresInput = r.querySelector('.quote-header-metres-input');
        if (metresInput) {
          const v = parseFloat(metresInput.value);
          if (Number.isFinite(v) && v > 0) profileLengthOverride[r.dataset.sectionHeader] = v;
        }
      }
      if (r.dataset.assetId && r.dataset.inferred !== 'true') {
        const qtyInput = r.querySelector('.quote-line-qty-input');
        if (qtyInput) {
          const v = parseFloat(qtyInput.value);
          if (Number.isFinite(v)) manualOverrides[r.dataset.assetId] = v;
        }
      }
    });

    // Clear table (preserve empty row), rebuild with system-based structure
    const rowsToRemove = Array.from(tableBody?.rows || []).filter((r) => !r.dataset.emptyRow);
    rowsToRemove.forEach((r) => r.remove());

    // Render gutter system groups: header + children
    const profileOrder = ['SC', 'CL'];
    profileOrder.forEach((profile) => {
      const group = gutterGroups[profile];
      if (!group || group.children.length === 0) return;
      const isIncomplete = incompleteProfiles.has(profile);
      const headerTotal = group.children.reduce((sum, c) => sum + (c.line_total || 0), 0);
      const profileName = PROFILE_DISPLAY_NAMES[profile] || profile;
      
      // If incomplete, force empty value; otherwise use override or group total
      let metresDisplay = '';
      let inputValue = '';
      if (isIncomplete) {
        metresDisplay = 'Metres?';
        inputValue = '';
      } else {
        const totalMetres = profileLengthOverride[profile] != null ? profileLengthOverride[profile] : group.totalMetres;
        metresDisplay = totalMetres % 1 === 0 ? totalMetres : totalMetres.toFixed(3).replace(/\.?0+$/, '');
        inputValue = String(metresDisplay);
      }
      
      const headerRow = document.createElement('tr');
      headerRow.className = 'quote-section-header';
      if (isIncomplete) {
        headerRow.classList.add('quote-row-incomplete-measurement');
      }
      headerRow.dataset.sectionHeader = profile;
      headerRow.innerHTML = `<td>Gutter System: ${escapeHtml(profileName)} (<span class="quote-header-metres-label">${escapeHtml(String(metresDisplay))}</span>${isIncomplete ? '' : ' m'})</td><td><input type="number" class="quote-header-metres-input" value="${escapeHtml(inputValue)}" min="0" step="0.001" placeholder="${isIncomplete ? 'Metres?' : ''}" aria-label="Length in metres"></td><td>—</td><td>—</td><td>—</td><td>${formatCurrency(headerTotal)}</td>`;
      if (emptyRow) tableBody.insertBefore(headerRow, emptyRow);
      else tableBody.appendChild(headerRow);
      const headerMetresInput = headerRow.querySelector('.quote-header-metres-input');
      if (headerMetresInput) {
        headerMetresInput.addEventListener('change', () => calculateAndDisplayQuote());
        headerMetresInput.addEventListener('blur', () => calculateAndDisplayQuote());
      }
      // When profile is incomplete, skip child gutter rows (they're default/placeholder values from backend)
      // Only render brackets/screws if they exist, but gutters should be empty until header length is entered
      group.children.forEach((line) => {
        const isGutter = GUTTER_PATTERN.test(line.id);
        // Skip gutter rows when profile is incomplete - they'll be bin-packed when header length is entered
        if (isGutter && isIncomplete) {
          return;
        }
        renderMaterialRow(line, emptyRow);
      });
    });

    // Render ungrouped items (downpipes, clips, etc.)
    ungrouped.forEach((line) => {
      renderMaterialRow(line, emptyRow);
    });

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
    if (labourTotalDisplay) labourTotalDisplay.textContent = formatCurrency(quote.labour_subtotal);
    if (quoteTotalDisplay) quoteTotalDisplay.textContent = formatCurrency(quote.total);
    updateQuoteTotalWarning();
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

function initFloatingToolbar() {
  const toolbar = document.getElementById('floatingToolbar');
  const lockBtn = document.getElementById('floatingToolbarLock');
  const duplicateBtn = document.getElementById('floatingToolbarDuplicate');
  const deleteBtn = document.getElementById('floatingToolbarDelete');
  const colorBtn = document.getElementById('floatingToolbarColor');
  const moreBtn = document.getElementById('floatingToolbarMore');
  const submenu = document.getElementById('floatingToolbarSubmenu');
  if (!toolbar) return;

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
          const dup = {
            ...el,
            id: 'el-' + ++elementIdCounter,
            x: el.x + 20,
            y: el.y + 20,
            zIndex: getNextElementZIndex(),
            image: el.image,
            originalImage: el.originalImage || el.image,
            tintedCanvas: null,
            tintedCanvasColor: null,
            locked: !!el.locked,
          };
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

  if (colorBtn) {
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.colorPaletteOpen = !state.colorPaletteOpen;
      draw();
    });
  }

  if (moreBtn && submenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      submenu.hidden = !submenu.hidden;
      moreBtn.setAttribute('aria-expanded', submenu.hidden ? 'false' : 'true');
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

  document.addEventListener('click', (e) => {
    if (submenu && !submenu.hidden && toolbar && !toolbar.contains(e.target)) {
      submenu.hidden = true;
      if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
      draw();
    }
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
    paletteEl.style.left = left + 'px';
    paletteEl.style.top = (toolbarRect.bottom + gap) + 'px';
  } else {
    const cx = rect.left + state.offsetX + (selected.x + selected.width / 2) * scale;
    const cy = rect.top + state.offsetY + (selected.y + selected.height / 2) * scale;
    const sh = selected.height * scale;
    let left = cx - paletteW / 2;
    left = Math.max(8, Math.min(window.innerWidth - paletteW - 8, left));
    paletteEl.style.left = left + 'px';
    paletteEl.style.top = (cy + sh / 2 + gap) + 'px';
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

/** Position and show/hide #blueprintTransparencyBtn outside blueprint top-left. Visible only when blueprint exists and technical drawing off. */
function updateTransparencyButtonPositionAndVisibility(rect, scale) {
  const btnEl = document.getElementById('blueprintTransparencyBtn');
  if (!btnEl) return;
  if (!state.blueprintImage || state.technicalDrawing || !state.blueprintTransform) {
    btnEl.setAttribute('hidden', '');
    return;
  }
  const bt = state.blueprintTransform;
  const buttonWidth = 32;
  const buttonHeight = 32;
  const gap = 4;
  const blueprintScreenX = rect.left + state.offsetX + bt.x * scale;
  const blueprintScreenY = rect.top + state.offsetY + bt.y * scale;
  let buttonLeft = blueprintScreenX - buttonWidth - gap;
  let buttonTop = blueprintScreenY - buttonHeight - gap;
  const toolbarEl = document.querySelector('.toolbar');
  if (toolbarEl) {
    const toolbarRect = toolbarEl.getBoundingClientRect();
    const minButtonTop = toolbarRect.bottom + 4;
    if (buttonTop < minButtonTop) {
      buttonTop = minButtonTop;
    }
  }
  btnEl.style.left = buttonLeft + 'px';
  btnEl.style.top = buttonTop + 'px';
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
    popoverEl.style.left = left + 'px';
    popoverEl.style.top = (btnRect.bottom + gap) + 'px';
  } else {
    const topLeftX = rect.left + state.offsetX + bt.x * scale;
    const topLeftY = rect.top + state.offsetY + bt.y * scale;
    let left = topLeftX - popoverW / 2 + 16;
    left = Math.max(8, Math.min(window.innerWidth - popoverW - 8, left));
    popoverEl.style.left = left + 'px';
    popoverEl.style.top = (topLeftY + 40 + gap) + 'px';
  }
  const pct = Math.round((bt.opacity ?? 1) * 100);
  const rangeEl = document.getElementById('transparencyRange');
  const numberEl = document.getElementById('transparencyNumber');
  if (rangeEl) rangeEl.value = pct;
  if (numberEl) numberEl.value = pct;
  popoverEl.removeAttribute('hidden');
}

function getElementsToMove() {
  const ids = new Set(state.selectedIds);
  state.groups.forEach((g) => {
    const hasSelected = g.elementIds.some((id) => state.selectedIds.includes(id));
    if (hasSelected) g.elementIds.forEach((id) => ids.add(id));
  });
  return Array.from(ids);
}

function setSelection(ids) {
  state.selectedIds = ids && ids.length ? ids : [];
  state.selectedId = state.selectedIds[0] || null;
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
  let url = src.startsWith('http') || src.startsWith('/') ? src : `/assets/marley/${src}.svg`;
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
function loadDiagramImage(url) {
  return loadImage(url).catch((err) => {
    if (typeof url === 'string' && /\.png$/i.test(url)) {
      const svgUrl = url.replace(/\.png$/i, '.svg');
      return loadImage(svgUrl);
    }
    throw err;
  });
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
 */
function createTintedCanvas(originalImage, color, width, height, elementId = null) {
  if (!color || !originalImage) return null;
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
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
    ctx.clearRect(0, 0, width, height);
    
    // Step 2: Fill entire canvas with the target color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    
    // Step 3: Use destination-in to mask the color with the image's alpha channel
    // 'destination-in' keeps the destination (our color fill) only where the source (image) is opaque
    // Result: color appears only on black lines (opaque pixels), transparent areas stay transparent
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(originalImage, 0, 0, width, height);
    
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

/** Standard length per unit (mm) for length-based quantity. Gutter from asset_id (e.g. 1.5M → 1500); downpipes/droppers default 3000. */
function getStandardLengthMm(assetId) {
  if (!assetId) return 3000;
  const m = GUTTER_PATTERN.exec(assetId.trim());
  if (m) return parseFloat(m[2]) * 1000 || 3000;
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
 * Elements for quote: gutters use bin-packing per run (each run optimized separately, then counts aggregated); other measurable use length→quantity; rest use count.
 * Per-run optimization ensures we don't treat "Run A 2.9m + Run B 2.9m" as one 5.8m span; each run gets its own stock (max single length 5m, cut from one end).
 * @returns {{ assetId: string, quantity: number, incomplete?: boolean }[]}
 */
function getElementsForQuote() {
  const result = []; // { assetId, quantity, incomplete?, length_mm? }[]
  const gutterCountsByProfileAndLength = {}; // profile -> { lengthMm -> qty }
  const gutterMeasuredMmByProfileAndLength = {}; // profile -> { lengthMm -> total measured mm } for bracket/screw
  const gutterIncompleteByProfileAndLength = {}; // profile -> { lengthMm -> true } when any run had no length entered
  const otherMeasurableByAssetId = {}; // assetId -> { length, count }
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

  // Other measurable (downpipes, droppers): same length-based logic as gutters — use measured length when present,
  // derive quantity from total length ÷ standard length per unit (downpipes/droppers use 3 m standard), send length_mm for backend (clips/screws).
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
      sequenceId: el.sequenceId != null ? el.sequenceId : undefined,
      measuredLength: el.measuredLength != null ? el.measuredLength : 0,
    })),
    blueprintTransform: state.blueprintTransform ? { ...state.blueprintTransform, locked: !!state.blueprintTransform.locked } : null,
    hasBlueprint: !!state.blueprintImage,
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
  } else if (snapshot.blueprintTransform) {
    state.blueprintTransform = { ...snapshot.blueprintTransform };
  }
  state.groups = (snapshot.groups || []).map((g) => ({ id: g.id, elementIds: g.elementIds.slice() }));
  setSelection([]);
  state.selectedBlueprint = false;
}

function pushUndoSnapshot() {
  undoHistory.push(cloneStateForUndo());
  if (undoHistory.length > MAX_UNDO_HISTORY) undoHistory.shift();
}

async function undo() {
  if (undoHistory.length === 0) return;
  state.mode = null;
  state.resizeHandle = null;
  state.snapshotAtActionStart = null;
  const snapshot = undoHistory.pop();
  await restoreStateFromSnapshot(snapshot);
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

  const w = state.canvasWidth;
  const h = state.canvasHeight;
  ctx.clearRect(0, 0, w, h);

  let scale = state.scale || 1;
  let offsetX = state.offsetX ?? 0;
  let offsetY = state.offsetY ?? 0;

  let baseScale = state.scale;
  let baseOffsetX = state.offsetX;
  let baseOffsetY = state.offsetY;
  let hasContent = false;

  const inDebounceWindow = state.bboxRecalcDeferredUntil != null && Date.now() < state.bboxRecalcDeferredUntil;
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
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
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
    state.scale = baseScale * state.viewZoom;
    scale = state.scale;
    state.offsetX = baseOffsetX + state.viewPanX;
    state.offsetY = baseOffsetY + state.viewPanY;
    if (!interactionActive) {
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
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
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
    state.scale = baseScale * state.viewZoom;
    scale = state.scale;
    state.offsetX = baseOffsetX + state.viewPanX;
    state.offsetY = baseOffsetY + state.viewPanY;
    if (!interactionActive) {
      clampViewToPadding(state, baseOffsetX, baseOffsetY, minX, minY, bboxW, bboxH, scale, w, h);
    }
    offsetX = state.offsetX;
    offsetY = state.offsetY;
  }

  if (!hasContent) {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
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
      const gx = offsetX + state.dragGhostX * scale + (ghost.width * scale) / 2;
      const gy = offsetY + state.dragGhostY * scale + (ghost.height * scale) / 2;
      ctx.translate(gx, gy);
      ctx.rotate((ghost.rotation * Math.PI) / 180);
      ctx.translate(-(ghost.width * scale) / 2, -(ghost.height * scale) / 2);
      const ghostRenderImage = getElementRenderImage(ghost);
      if (ghostRenderImage) {
        ctx.drawImage(ghostRenderImage, 0, 0, ghost.width * scale, ghost.height * scale);
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
    ctx.translate(-(el.width * scale) / 2, -(el.height * scale) / 2);
    const renderImage = getElementRenderImage(el);
    if (renderImage) {
      ctx.drawImage(renderImage, 0, 0, el.width * scale, el.height * scale);
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
    const { w: gw, h: gh } = elementSizeFromImage(state.dragPreviewImage, DROPPED_ELEMENT_MAX_DIMENSION_PX);
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
        toolbarEl.style.left = Math.max(8, Math.min(window.innerWidth - (toolbarEl.offsetWidth || 200) - 8, toolbarLeft)) + 'px';
        toolbarEl.style.top = Math.max(8, toolbarTop) + 'px';
        toolbarEl.removeAttribute('hidden');
        toolbarEl.classList.toggle('floating-toolbar-has-element', !!selected && selectedElements.length === 1);
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
      if (state.mode === 'pan' || state.mode === 'move') canvas.style.cursor = 'grabbing';
      else if (state.mode === 'rotate' && state.selectedId) {
        const rotEl = state.elements.find((x) => x.id === state.selectedId);
        canvas.style.cursor = rotEl ? getRotationCursor((rotEl.rotation || 0) + 90) : 'move';
      } else if (state.mode === 'resize') canvas.style.cursor = 'move';
    } else {
      canvas.style.willChange = 'auto';
    }
  }

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

function initCanvas() {
  resizeCanvas();
  const canvas = getCanvasElement();
  const placeholder = document.getElementById('canvasPlaceholder');
  if (!canvas) return;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelBboxRecalcDebounce();
    canvas.setPointerCapture(e.pointerId);
    const rect = getCanvasRect();
    if (!rect) return;
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
      state.snapshotAtActionStart = cloneStateForUndo();
      if (!state.selectedIds.includes(hit.element.id)) {
        setSelection([hit.element.id]);
      } else {
        setSelection([hit.element.id].concat(state.selectedIds.filter((id) => id !== hit.element.id)));
      }
      if (hit.element.sequenceId && state.selectedIds.length === 1) scrollToMeasurementCardAndFocus(hit.element.id);
      if (e.altKey) {
        const el = hit.element;
        pushUndoSnapshot();
        const dup = {
          ...el,
          id: 'el-' + ++elementIdCounter,
          x: el.x + 20,
          y: el.y + 20,
          zIndex: getNextElementZIndex(),
          image: el.image,
          originalImage: el.originalImage || el.image,
          tintedCanvas: null,
          tintedCanvasColor: null,
          locked: !!el.locked,
        };
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
      state.mode = 'move';
      const primary = state.elements.find((x) => x.id === state.selectedId);
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
    state.mode = 'marquee';
    state.marqueeStart = { x: canvasPos.x, y: canvasPos.y };
    state.marqueeCurrent = null;
  });

  canvas.addEventListener('pointermove', (e) => {
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
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
          canvas.style.cursor = (state.blueprintImage || state.elements.length) ? 'grab' : 'default';
        }
      }
    }
    if (state.mode === 'marquee') {
      state.marqueeCurrent = { x: canvasPos.x, y: canvasPos.y };
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
        state.dragRelativeOffsets.forEach((rel) => {
          const el = state.elements.find((x) => x.id === rel.id);
          if (el) {
            el.x = primary.x + rel.dx;
            el.y = primary.y + rel.dy;
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
    // Stable viewport: do not call scheduleBboxRecalcDebounce() for resize/move/rotate.
    // baseScale and baseOffset remain static; re-fit only on new blueprint or "Recenter View".
    state.mode = null;
    state.resizeHandle = null;
    updateCanvasTooltip(null);
  });

  canvas.addEventListener('pointerleave', (e) => {
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
    if (state.mode === 'pan') state.mode = null;
    else { state.mode = null; state.resizeHandle = null; }
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.target && e.target.releasePointerCapture && e.pointerId != null) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
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
      const newViewZoom = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, state.viewZoom * factor));
      const newScale = state.baseScale * newViewZoom;
      state.viewZoom = newViewZoom;
      state.viewPanX = sx - contentX * newScale - state.baseOffsetX;
      state.viewPanY = sy - contentY * newScale - state.baseOffsetY;
    } else {
      state.viewPanX += e.deltaX;
      state.viewPanY += e.deltaY;
    }
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    const inInput = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
    const inBadgeLengthInput = e.target && e.target.id === 'badgeLengthInput';
    const cmd = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (state.badgeLengthEditElementId) {
        state.badgeLengthEditElementId = null;
        const popover = document.getElementById('badgeLengthPopover');
        if (popover) popover.setAttribute('hidden', '');
        draw();
        return;
      }
      setSelection([]);
      state.selectedBlueprint = false;
      state.colorPaletteOpen = false;
    }
    if (!inInput && e.key === 'z' && cmd) {
      e.preventDefault();
      undo();
    }
    // Delete/Backspace: remove selected elements only; never remove or alter the blueprint.
    // Allow delete when focus is in badge length input so measurable elements (gutters, downpipes, droppers) can be deleted from the popover.
    if ((!inInput || inBadgeLengthInput) && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (state.selectedBlueprint && state.selectedIds.length === 0) return; // blueprint only: do nothing
      if (state.selectedIds.length === 0) return;
      e.preventDefault();
      if (state.badgeLengthEditElementId) {
        state.badgeLengthEditElementId = null;
        const popover = document.getElementById('badgeLengthPopover');
        const input = document.getElementById('badgeLengthInput');
        if (popover) popover.setAttribute('hidden', '');
        if (input) input.blur();
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
      const img = await loadDiagramImage(diagramUrl);
      // Import normalization: if width or height > 150px, scale so max dimension = 150
      const { w, h } = elementSizeFromImage(img, CANVAS_PORTER_MAX_UNIT);
      const el = {
          id: 'el-' + ++elementIdCounter,
          assetId: productId,
          x: canvasPos.x - w / 2,
          y: canvasPos.y - h / 2,
          width: w,
          height: h,
          rotation: getDefaultRotationForLinear(productId),
          zIndex: getNextElementZIndex(),
          image: img,
          originalImage: img,
          color: null,
          baseScale: 1,
          locked: false,
        };
      if (isMeasurableElement(productId)) {
        el.sequenceId = state.nextSequenceId++;
        el.measuredLength = 0;
      }
      state.elements.push(el);
      setSelection([el.id]);
      updatePlaceholderVisibility();
      renderMeasurementDeck();
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
    const popover = document.getElementById('badgeLengthPopover');
    const input = document.getElementById('badgeLengthInput');
    if (!popover || !input) return;
    const rect = getCanvasRect();
    if (!rect) return;
    const pos = getElementDrawPosition(el);
    const bcx = state.offsetX + (pos.x + el.width / 2) * state.scale;
    const bcy = state.offsetY + (pos.y + el.height / 2) * state.scale;
    const viewX = rect.left + bcx * (rect.width / state.canvasWidth);
    const viewY = rect.top + bcy * (rect.height / state.canvasHeight);
    popover.style.left = (viewX + 16) + 'px';
    popover.style.top = (viewY - 18) + 'px';
    popover.removeAttribute('hidden');
    const mVal = mmToM(el.measuredLength);
    input.value = mVal != null ? String(mVal) : '';
    state.badgeLengthEditElementId = el.id;
    input.focus();

    function closeAndSave() {
      const id = state.badgeLengthEditElementId;
      state.badgeLengthEditElementId = null;
      popover.setAttribute('hidden', '');
      if (id) {
        const elem = state.elements.find((x) => x.id === id);
        if (elem) {
          const val = parseFloat(input.value);
          elem.measuredLength = Number.isFinite(val) && val >= 0 ? mToMm(val) : 0;
          renderMeasurementDeck();
          draw();
        }
      }
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeydown);
    }
    function onBlur() { closeAndSave(); }
    function onKeydown(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); closeAndSave(); }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        state.badgeLengthEditElementId = null;
        popover.setAttribute('hidden', '');
        input.removeEventListener('blur', onBlur);
        input.removeEventListener('keydown', onKeydown);
        draw();
      }
    }
    input.addEventListener('blur', onBlur, { once: true });
    input.addEventListener('keydown', onKeydown);
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
  updatePlaceholderVisibility();
  const formData = new FormData();
  formData.append('file', file);
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
      state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true, opacity: 1 };
      state.viewZoom = 1;
      state.viewPanX = 0;
      state.viewPanY = 0;
      URL.revokeObjectURL(url);
      draw(); // Trigger full view re-fit to new blueprint
    };
    img.onerror = () => {
      updatePlaceholderVisibility();
      showMessage('Failed to display the processed image.');
    };
    img.src = url;
  } catch (err) {
    updatePlaceholderVisibility();
    showMessage('Upload failed: ' + (err.message || String(err)));
  }
}

function initUpload() {
  const fileInput = document.getElementById('fileInput');
  const uploadZone = document.getElementById('uploadZone');
  const placeholder = document.getElementById('canvasPlaceholder');
  const toggle = document.getElementById('technicalDrawingToggle');
  const blueprintWrap = document.getElementById('blueprintWrap');

  uploadZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
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
    showCropModal(file);
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
  blueprintWrap.addEventListener('drop', (e) => {
    blueprintWrap.classList.remove('drag-over');
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (file) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showMessage(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      } else {
        showCropModal(file);
      }
    } else {
      showMessage('Drop an image file (JPEG, PNG, GIF, or WebP).');
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
        state.blueprintTransform = { x: 0, y: 0, w: img.width, h: img.height, rotation: 0, zIndex: BLUEPRINT_Z_INDEX, locked: true, opacity: 1 };
        state.viewZoom = 1;
        state.viewPanX = 0;
        state.viewPanY = 0;
        URL.revokeObjectURL(url);
      };
      img.onerror = () => showMessage('Failed to display the updated blueprint.');
      img.src = url;
    } catch (err) {
      showMessage('Could not update blueprint: ' + (err.message || String(err)));
    }
  });
}

function initZoomControls() {
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
    state.viewZoom = Math.max(MIN_VIEW_ZOOM, state.viewZoom / ZOOM_BUTTON_FACTOR);
  });
  document.getElementById('zoomInBtn')?.addEventListener('click', () => {
    state.viewZoom = Math.min(MAX_VIEW_ZOOM, state.viewZoom * ZOOM_BUTTON_FACTOR);
  });
  document.getElementById('zoomFitBtn')?.addEventListener('click', () => {
    state.viewZoom = 1;
    state.viewPanX = 0;
    state.viewPanY = 0;
    draw();
  });
  // Recenter View: force full view re-fit (baseScale, baseOffset) to content
  document.getElementById('recenterViewBtn')?.addEventListener('click', () => {
    cancelBboxRecalcDebounce();
    state.bboxRecalcDeferredUntil = null;
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
          ex.translate(-(el.width * scale) / 2, -(el.height * scale) / 2);
          ex.drawImage(renderImage, 0, 0, el.width * scale, el.height * scale);
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

function initPanel() {
  const panel = document.getElementById('panel');
  const panelContent = document.getElementById('panelContent');
  const panelCollapsed = document.getElementById('panelCollapsed');
  const panelClose = document.getElementById('panelClose');
  if (!panel) return;

  panel.classList.add('expanded');
  panel.style.width = DEFAULT_PANEL_WIDTH + 'px';

  panelCollapsed.addEventListener('click', () => {
    panel.classList.remove('collapsed');
    panel.classList.add('expanded');
    panel.style.width = DEFAULT_PANEL_WIDTH + 'px';
  });

  panelClose.addEventListener('click', () => {
    panel.classList.remove('expanded');
    panel.classList.add('collapsed');
    panel.style.width = '48px';
  });
}

function initResizer() {
  const resizer = document.getElementById('resizer');
  const workspace = document.querySelector('.workspace');
  const panel = document.getElementById('panel');

  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizer.classList.add('dragging');
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    const delta = e.clientX - startX;
    let w = startWidth + delta;
    w = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, w));
    panel.style.width = w + 'px';
    if (w <= 80) {
      panel.classList.remove('expanded');
      panel.classList.add('collapsed');
      panel.style.width = '48px';
    } else {
      panel.classList.remove('collapsed');
      panel.classList.add('expanded');
    }
  }

  function onMouseUp() {
    resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}

function getPanelProducts() {
  // Filter: exclude consumables, show only 3M gutters and 3M downpipes (manual length selectors), include all other products
  let list = state.products.filter((p) => !CONSUMABLE_PRODUCT_IDS.includes(p.id));
  
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
  
  return list;
}

function renderProducts(products) {
  const grid = document.getElementById('productGrid');
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
    thumb.dataset.diagramUrl = p.diagramUrl;
    const img = document.createElement('img');
    img.src = p.thumbnailUrl.startsWith('http') || p.thumbnailUrl.startsWith('/') ? p.thumbnailUrl : `/assets/marley/${p.id}.svg`;
    img.alt = displayName;
    thumb.appendChild(img);
    thumb.appendChild(document.createElement('span')).textContent = displayName;
    
    // Canvas Porter: Center-Drop - click (not drag) to add at viewport center
    let wasDragged = false;
    thumb.addEventListener('dragstart', (e) => {
      wasDragged = true;
      e.dataTransfer.setData('application/product-id', p.id);
      const diagramUrl = p.diagramUrl.startsWith('http') || p.diagramUrl.startsWith('/') ? p.diagramUrl : `/assets/marley/${p.id}.svg`;
      e.dataTransfer.setData('application/diagram-url', diagramUrl);
      e.dataTransfer.effectAllowed = 'copy';
      state.dragPreviewCanvasPos = null;
      state.dragPreviewImage = null;
      loadDiagramImage(diagramUrl).then((img) => {
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
      const diagramUrl = p.diagramUrl.startsWith('http') || p.diagramUrl.startsWith('/') ? p.diagramUrl : `/assets/marley/${p.id}.svg`;
      try {
        pushUndoSnapshot();
        const img = await loadDiagramImage(diagramUrl);
        const { w, h } = elementSizeFromImage(img, CANVAS_PORTER_MAX_UNIT);
        
        // Canvas Porter: Center-Drop - place at viewport center
        const rect = getCanvasRect();
        if (!rect) return;
        const viewportCenterX = (rect.width / 2 - state.offsetX) / state.scale;
        const viewportCenterY = (rect.height / 2 - state.offsetY) / state.scale;
        
        const el = {
          id: 'el-' + ++elementIdCounter,
          assetId: p.id,
          x: viewportCenterX - w / 2,
          y: viewportCenterY - h / 2,
          width: w,
          height: h,
          rotation: getDefaultRotationForLinear(p.id),
          zIndex: getNextElementZIndex(),
          image: img,
          originalImage: img,
          color: null,
          baseScale: 1,
          locked: false,
        };
        if (isMeasurableElement(p.id)) {
          el.sequenceId = state.nextSequenceId++;
          el.measuredLength = 0;
        }
        state.elements.push(el);
        setSelection([el.id]);
        updatePlaceholderVisibility();
        renderMeasurementDeck();
        draw();
      } catch (err) {
        console.error('Failed to load diagram image', err);
      }
    });
    
    grid.appendChild(thumb);
  });
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

/**
 * Scroll Measurement Deck to the card for this element and focus its Length (mm) input.
 */
function scrollToMeasurementCardAndFocus(elementId) {
  const card = document.querySelector(`.measurement-deck-card[data-element-id="${CSS.escape(elementId)}"]`);
  if (!card) return;
  const input = card.querySelector('input');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  if (input) input.focus();
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

async function initProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    state.products = data.products || [];
    applyProductFilters();
  } catch (err) {
    console.error('Failed to load products', err);
    showMessage('Products could not be loaded. Using built-in list.');
    state.products = [
      { id: 'gutter', name: 'Gutter', diagramUrl: '/assets/marley/gutter.svg', thumbnailUrl: '/assets/marley/gutter.svg', profile: 'other' },
      { id: 'downpipe', name: 'Downpipe', diagramUrl: '/assets/marley/downpipe.svg', thumbnailUrl: '/assets/marley/downpipe.svg', profile: 'other' },
      { id: 'bracket', name: 'Bracket', diagramUrl: '/assets/marley/bracket.svg', thumbnailUrl: '/assets/marley/bracket.svg', profile: 'other' },
      { id: 'stopend', name: 'Stop End', diagramUrl: '/assets/marley/stopend.svg', thumbnailUrl: '/assets/marley/stopend.svg', profile: 'other' },
      { id: 'outlet', name: 'Outlet', diagramUrl: '/assets/marley/outlet.svg', thumbnailUrl: '/assets/marley/outlet.svg', profile: 'other' },
      { id: 'dropper', name: 'Dropper', diagramUrl: '/assets/marley/dropper.svg', thumbnailUrl: '/assets/marley/dropper.svg', profile: 'other' },
    ];
    applyProductFilters();
  }

  const profileFilter = document.getElementById('profileFilter');
  profileFilter?.addEventListener('change', (e) => {
    state.profileFilter = (e.target.value || '').trim();
    applyProductFilters();
  });

  const search = document.getElementById('productSearch');
  search?.addEventListener('input', () => applyProductFilters());
}

async function checkBackendAvailable() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function init() {
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
    initTransparencyPopover();
  } catch (e) {
    console.warn('initTransparencyPopover failed', e);
  }
  try {
    initFloatingToolbar();
  } catch (e) {
    console.warn('initFloatingToolbar failed', e);
  }
  initProducts();
  draw();

  checkBackendAvailable().then((ok) => {
    if (!ok) {
      showMessage(
        'App not running from the backend server. Start with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000 then open http://127.0.0.1:8000/',
        'error'
      );
    }
  });
}

init();

// E2E test hooks
if (typeof window !== 'undefined') {
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
