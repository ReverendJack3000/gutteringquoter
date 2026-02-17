# Quote App - UI Refinements for Canva/Freeform-like Experience

## Executive Summary
Your app has solid fundamentals for element manipulation, but needs refinements in **visual feedback**, **interaction smoothness**, **handle design**, and **keyboard shortcuts** to match Canva/Freeform's polished UX.

---

## 1. VISUAL FEEDBACK & HOVER STATES

### Current Issues:
- ❌ No hover indication on elements before selection
- ❌ No cursor changes to indicate draggability
- ❌ Handles appear instantly without transition
- ❌ No visual depth/elevation for selected elements

### Canva/Freeform Pattern:
- ✅ Subtle hover outline on elements (before selection)
- ✅ Cursor changes to "move" on hover
- ✅ Smooth fade-in of selection box
- ✅ Selected element has slight elevation/shadow

### Code Implementation:

#### Add hover detection to canvas mousemove:
```javascript
canvas.addEventListener('mousemove', (e) => {
  if (!state.mode) {
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTestElement(canvasPos.x, canvasPos.y);
    
    // NEW: Track hover state
    if (hit) {
      canvas.style.cursor = 'move';
      state.hoveredId = hit.element.id;
    } else if (hitTestBlueprint(canvasPos.x, canvasPos.y)) {
      canvas.style.cursor = 'move';
      state.hoveredId = null;
    } else {
      canvas.style.cursor = 'grab';
      state.hoveredId = null;
    }
  }
  // ... existing drag code
});
```

#### Add hover outline in draw():
```javascript
// After drawing elements, before selection box
elements.forEach((el) => {
  if (el.id === state.hoveredId && el.id !== state.selectedId) {
    ctx.save();
    const hx = offsetX + el.x * scale;
    const hy = offsetY + el.y * scale;
    const hw = el.width * scale;
    const hh = el.height * scale;
    
    ctx.translate(hx + hw/2, hy + hh/2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-hw/2, -hh/2);
    
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, hw, hh);
    ctx.restore();
  }
});
```

#### CSS additions for smooth transitions:
```css
#canvas {
  transition: cursor 0.1s ease;
}

.color-palette-popover {
  animation: fadeInUp 0.2s ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## 2. HANDLE DESIGN & INTERACTION
### Current Issues:
- ❌ Corner handles are plain squares - not distinctive
- ❌ Rotate handle is a small circle - unclear purpose
- ❌ No edge handles (only corners) - harder for precise width/height adjustments
- ❌ Handle cursors don't change (nw-resize, ne-resize, etc.)
- ❌ No visual feedback during resize/rotate (dimensions, angle)

### Canva/Freeform Pattern:
- ✅ Corner handles are circles with white fill + blue border
- ✅ Rotate handle has a distinctive icon (↻) and connecting line
- ✅ Edge handles (top, right, bottom, left) for axis-locked resizing
- ✅ Dynamic cursor changes (nw-resize, n-resize, etc.)
- ✅ Live dimension/angle display during transformation

### Code Implementation:

#### Improve handle rendering:
```javascript
// In draw(), replace handle drawing with:
const hs = HANDLE_SIZE / 2;
const handles = [
  { id: 'nw', x: sx, y: sy, cursor: 'nw-resize' },
  { id: 'n', x: sx + sw/2, y: sy, cursor: 'n-resize' },  // NEW: edge handle
  { id: 'ne', x: sx + sw, y: sy, cursor: 'ne-resize' },
  { id: 'e', x: sx + sw, y: sy + sh/2, cursor: 'e-resize' }, // NEW: edge handle
  { id: 'se', x: sx + sw, y: sy + sh, cursor: 'se-resize' },
  { id: 's', x: sx + sw/2, y: sy + sh, cursor: 's-resize' }, // NEW: edge handle
  { id: 'sw', x: sx, y: sy + sh, cursor: 'sw-resize' },
  { id: 'w', x: sx, y: sy + sh/2, cursor: 'w-resize' }, // NEW: edge handle
];

// Draw handles as circles with better styling
ctx.fillStyle = '#fff';
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 2;
handles.forEach((h) => {
  ctx.beginPath();
  ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
});

// Draw rotate handle with connection line and icon
const rotY = sy - ROTATE_HANDLE_OFFSET;
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 1.5;
ctx.setLineDash([4, 3]);
ctx.beginPath();
ctx.moveTo(cx, sy);
ctx.lineTo(cx, rotY);
ctx.stroke();
ctx.setLineDash([]);

// Rotate handle as distinctive icon
ctx.save();
ctx.translate(cx, rotY);
ctx.beginPath();
ctx.arc(0, 0, 8, 0, Math.PI * 2);
ctx.fillStyle = '#fff';
ctx.fill();
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 2;
ctx.stroke();

// Draw rotation arrows inside circle
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(0, 0, 5, -Math.PI * 0.8, Math.PI * 0.8, false);
ctx.stroke();
// Add arrow tip
ctx.beginPath();
ctx.moveTo(3, 3.5);
ctx.lineTo(5, 4.5);
ctx.lineTo(3.5, 2);
ctx.stroke();
ctx.restore();
```

#### Add cursor feedback during handle hover:
```javascript
function hitTestHandle(clientX, clientY) {
  const selected = state.elements.find((e) => e.id === state.selectedId);
  if (!selected) return null;
  
  // ... existing code ...
  
  for (const h of handles) {
    const r = h.id === 'rotate' ? 10 : 8;
    if (Math.abs(x - h.x) <= r && Math.abs(y - h.y) <= r) {
      // NEW: Store cursor type
      return { element: selected, handle: h.id, cursor: h.cursor || 'grab' };
    }
  }
  return null;
}

// In canvas mousemove (before drag starts):
const handleHit = hitTestHandle(e.clientX, e.clientY);
if (handleHit) {
  canvas.style.cursor = handleHit.cursor;
  return;
}
```

#### Add live dimension display during resize:
```javascript
// In draw(), when mode === 'resize':
if (state.mode === 'resize' && selected) {
  const w = Math.round(selected.width);
  const h = Math.round(selected.height);
  const text = `${w} × ${h}`;
  
  ctx.save();
  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const metrics = ctx.measureText(text);
  const padX = 8;
  const padY = 6;
  const boxW = metrics.width + padX * 2;
  const boxH = 24;
  
  const boxX = cx - boxW / 2;
  const boxY = sy - ROTATE_HANDLE_OFFSET - boxH - 8;
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  
  // Text
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx, boxY + boxH/2);
  ctx.restore();
}
```

---

## 3. ROTATION IMPROVEMENTS

### Current Issues:
- ❌ Free-form rotation only - no snap angles
- ❌ No visual rotation angle indicator
- ❌ Difficult to achieve precise angles (0°, 45°, 90°)

### Canva/Freeform Pattern:
- ✅ Hold Shift for 15° snap increments
- ✅ Live angle display (e.g., "45°")
- ✅ Smooth rotation with visual arc/guide
- ✅ Double-click rotate handle to reset to 0°

### Code Implementation:

```javascript
// In canvas mousemove, mode === 'rotate':
else if (state.mode === 'rotate' && state.selectedId) {
  const el = state.elements.find((x) => x.id === state.selectedId);
  if (!el) return;
  
  const rect = getCanvasRect();
  const cx = state.offsetX + el.x * state.scale + (el.width * state.scale) / 2;
  const cy = state.offsetY + el.y * state.scale + (el.height * state.scale) / 2;
  const angle = Math.atan2(e.clientY - (rect.top + cy), e.clientX - (rect.left + cx));
  let degrees = (angle * 180) / Math.PI;
  
  // NEW: Snap to 15° increments when Shift is held
  if (e.shiftKey) {
    degrees = Math.round(degrees / 15) * 15;
  }
  
  el.rotation = degrees;
  state.currentRotationAngle = Math.round(degrees); // For display
}

// In draw(), show angle during rotation:
if (state.mode === 'rotate' && selected) {
  const angleText = `${state.currentRotationAngle || 0}°`;
  
  ctx.save();
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const metrics = ctx.measureText(angleText);
  const boxW = metrics.width + 16;
  const boxH = 28;
  const boxX = cx - boxW / 2;
  const boxY = sy - ROTATE_HANDLE_OFFSET - boxH - 8;
  
  // Background
  ctx.fillStyle = 'rgba(0, 122, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  
  // Text
  ctx.fillStyle = '#fff';
  ctx.fillText(angleText, cx, boxY + boxH/2);
  ctx.restore();
  
  // Draw rotation arc
  ctx.strokeStyle = 'rgba(0, 122, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(sw, sh) / 2 + 20, 0, Math.PI * 2);
  ctx.stroke();
}
```

---

## 4. KEYBOARD SHORTCUTS & NAVIGATION
### Current Implementation:
- ✅ Escape to deselect (good!)
- ❌ No Delete key support
- ❌ No arrow keys for nudging
- ❌ No Cmd/Ctrl+D for duplicate
- ❌ No Cmd/Ctrl+Z for undo/redo
- ❌ No multi-select (Shift+click)
- ❌ No layer ordering (Cmd+]/[)

### Canva/Freeform Pattern:
- ✅ Delete/Backspace to remove element
- ✅ Arrow keys to nudge (1px), Shift+Arrow (10px)
- ✅ Cmd/Ctrl+D to duplicate
- ✅ Space+drag for pan (current behavior should keep working)
- ✅ Cmd/Ctrl+Z/Y for undo/redo
- ✅ Shift+click for multi-select
- ✅ Cmd/Ctrl+] / [ for bring forward/send back

### Code Implementation:

```javascript
// Add to state:
state.history = [];
state.historyIndex = -1;
state.selectedIds = []; // NEW: multi-select support

// History management functions:
function saveHistory() {
  // Remove any future history if we're not at the end
  state.history = state.history.slice(0, state.historyIndex + 1);
  
  // Deep clone current state
  const snapshot = {
    elements: state.elements.map(el => ({...el})),
    blueprintTransform: state.blueprintTransform ? {...state.blueprintTransform} : null,
  };
  
  state.history.push(snapshot);
  state.historyIndex++;
  
  // Limit history to 50 steps
  if (state.history.length > 50) {
    state.history.shift();
    state.historyIndex--;
  }
}

function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const snapshot = state.history[state.historyIndex];
    state.elements = snapshot.elements.map(el => ({...el}));
    state.blueprintTransform = snapshot.blueprintTransform ? {...snapshot.blueprintTransform} : null;
  }
}

function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const snapshot = state.history[state.historyIndex];
    state.elements = snapshot.elements.map(el => ({...el}));
    state.blueprintTransform = snapshot.blueprintTransform ? {...snapshot.blueprintTransform} : null;
  }
}

// Enhanced keyboard handler:
document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? e.metaKey : e.ctrlKey;
  
  // Delete
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
    e.preventDefault();
    state.elements = state.elements.filter(el => el.id !== state.selectedId);
    state.selectedId = null;
    saveHistory();
  }
  
  // Duplicate (Cmd/Ctrl+D)
  if (cmdKey && e.key === 'd' && state.selectedId) {
    e.preventDefault();
    const el = state.elements.find(x => x.id === state.selectedId);
    if (el) {
      const duplicate = {
        ...el,
        id: 'el-' + ++elementIdCounter,
        x: el.x + 20,
        y: el.y + 20,
        zIndex: state.elements.length,
      };
      state.elements.push(duplicate);
      state.selectedId = duplicate.id;
      saveHistory();
    }
  }
  
  // Undo (Cmd/Ctrl+Z)
  if (cmdKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  
  // Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)
  if (cmdKey && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    e.preventDefault();
    redo();
  }
  
  // Arrow key nudging
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedId) {
    e.preventDefault();
    const el = state.elements.find(x => x.id === state.selectedId);
    if (!el) return;
    
    const step = e.shiftKey ? 10 : 1;
    
    switch(e.key) {
      case 'ArrowUp': el.y -= step; break;
      case 'ArrowDown': el.y += step; break;
      case 'ArrowLeft': el.x -= step; break;
      case 'ArrowRight': el.x += step; break;
    }
    
    saveHistory();
  }
  
  // Bring forward (Cmd/Ctrl+])
  if (cmdKey && e.key === ']' && state.selectedId) {
    e.preventDefault();
    const idx = state.elements.findIndex(x => x.id === state.selectedId);
    if (idx < state.elements.length - 1) {
      [state.elements[idx], state.elements[idx + 1]] = [state.elements[idx + 1], state.elements[idx]];
      saveHistory();
    }
  }
  
  // Send backward (Cmd/Ctrl+[)
  if (cmdKey && e.key === '[' && state.selectedId) {
    e.preventDefault();
    const idx = state.elements.findIndex(x => x.id === state.selectedId);
    if (idx > 0) {
      [state.elements[idx], state.elements[idx - 1]] = [state.elements[idx - 1], state.elements[idx]];
      saveHistory();
    }
  }
  
  // Escape to deselect (existing)
  if (e.key === 'Escape') {
    state.selectedId = null;
    state.selectedBlueprint = false;
  }
});

// Save history after each transformation:
canvas.addEventListener('mouseup', () => {
  if (state.mode) {
    saveHistory();
  }
  state.mode = null;
  state.resizeHandle = null;
});
```

---

## 5. EDGE RESIZE (WIDTH/HEIGHT ONLY)

### Current Issues:
- ❌ Only corner handles - always resize both dimensions
- ❌ No way to adjust width without changing height (or vice versa)

### Canva/Freeform Pattern:
- ✅ Edge handles on all four sides
- ✅ Edge handles resize only one dimension
- ✅ Shift with edge handles maintains aspect ratio

### Code Implementation:

```javascript
// In canvas mousemove, mode === 'resize':
else if (state.mode === 'resize' && state.selectedId && state.resizeHandle) {
  const el = state.elements.find((x) => x.id === state.selectedId);
  if (!el) return;
  
  const cx = state.dragOffset.cx;
  const cy = state.dragOffset.cy;
  const ar = state.dragOffset.w / state.dragOffset.h;
  
  let w = el.width;
  let h = el.height;
  
  // Edge handles (NEW)
  if (state.resizeHandle === 'n' || state.resizeHandle === 's') {
    h = Math.max(20, Math.abs(canvasPos.y - cy) * 2);
    if (e.shiftKey) {
      // Maintain aspect ratio
      w = h * ar;
    }
  } else if (state.resizeHandle === 'e' || state.resizeHandle === 'w') {
    w = Math.max(20, Math.abs(canvasPos.x - cx) * 2);
    if (e.shiftKey) {
      // Maintain aspect ratio
      h = w / ar;
    }
  } else {
    // Corner handles (existing behavior)
    w = Math.max(20, Math.abs(canvasPos.x - cx) * 2);
    h = Math.max(20, Math.abs(canvasPos.y - cy) * 2);
    if (w / h > ar) h = w / ar;
    else w = h * ar;
  }
  
  el.width = w;
  el.height = h;
  el.x = cx - w / 2;
  el.y = cy - h / 2;
}
```

---

## 6. ALIGNMENT GUIDES & SNAPPING

### Current Issues:
- ❌ No alignment guides when moving elements
- ❌ No snap-to-grid or snap-to-elements
- ❌ Difficult to align elements precisely

### Canva/Freeform Pattern:
- ✅ Smart guides appear when edges/centers align
- ✅ Magnetic snapping to other elements (5px threshold)
- ✅ Snap to canvas center lines
- ✅ Visual line indicators (pink/magenta)

### Code Implementation:

```javascript
const SNAP_THRESHOLD = 5; // pixels in canvas coords

function findSnapPoints(movingEl) {
  const guides = {
    vertical: [],
    horizontal: []
  };
  
  // Canvas center lines
  const canvasCenterX = state.canvasWidth / (2 * state.scale);
  const canvasCenterY = state.canvasHeight / (2 * state.scale);
  guides.vertical.push({ pos: canvasCenterX, type: 'canvas-center' });
  guides.horizontal.push({ pos: canvasCenterY, type: 'canvas-center' });
  
  // Other elements' edges and centers
  state.elements.forEach(el => {
    if (el.id === movingEl.id) return;
    
    // Vertical guides (x positions)
    guides.vertical.push(
      { pos: el.x, type: 'element-left' },
      { pos: el.x + el.width/2, type: 'element-center' },
      { pos: el.x + el.width, type: 'element-right' }
    );
    
    // Horizontal guides (y positions)
    guides.horizontal.push(
      { pos: el.y, type: 'element-top' },
      { pos: el.y + el.height/2, type: 'element-center' },
      { pos: el.y + el.height, type: 'element-bottom' }
    );
  });
  
  return guides;
}

function snapToGuides(el, guides) {
  const snapped = { x: el.x, y: el.y, guides: [] };
  
  // Check element's edges and center
  const points = {
    left: el.x,
    centerX: el.x + el.width/2,
    right: el.x + el.width,
    top: el.y,
    centerY: el.y + el.height/2,
    bottom: el.y + el.height
  };
  
  // Snap X
  for (const [key, value] of Object.entries(points)) {
    if (!['left', 'centerX', 'right'].includes(key)) continue;
    
    for (const guide of guides.vertical) {
      if (Math.abs(value - guide.pos) < SNAP_THRESHOLD) {
        const offset = guide.pos - value;
        snapped.x = el.x + offset;
        snapped.guides.push({ axis: 'vertical', pos: guide.pos });
        break;
      }
    }
  }
  
  // Snap Y (similar logic)
  for (const [key, value] of Object.entries(points)) {
    if (!['top', 'centerY', 'bottom'].includes(key)) continue;
    
    for (const guide of guides.horizontal) {
      if (Math.abs(value - guide.pos) < SNAP_THRESHOLD) {
        const offset = guide.pos - value;
        snapped.y = el.y + offset;
        snapped.guides.push({ axis: 'horizontal', pos: guide.pos });
        break;
      }
    }
  }
  
  return snapped;
}

// In canvas mousemove, mode === 'move':
else if (state.mode === 'move' && state.selectedId) {
  const el = state.elements.find((x) => x.id === state.selectedId);
  if (el) {
    el.x = canvasPos.x - state.dragOffset.x;
    el.y = canvasPos.y - state.dragOffset.y;
    
    // NEW: Apply snapping
    const guides = findSnapPoints(el);
    const snapped = snapToGuides(el, guides);
    el.x = snapped.x;
    el.y = snapped.y;
    state.activeGuides = snapped.guides; // Store for drawing
  }
}

// In draw(), render alignment guides:
if (state.mode === 'move' && state.activeGuides && state.activeGuides.length > 0) {
  ctx.save();
  ctx.strokeStyle = '#ff00ff'; // Magenta like Canva
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  
  state.activeGuides.forEach(guide => {
    if (guide.axis === 'vertical') {
      const x = offsetX + guide.pos * scale;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, state.canvasHeight);
      ctx.stroke();
    } else {
      const y = offsetY + guide.pos * scale;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.canvasWidth, y);
      ctx.stroke();
    }
  });
  
  ctx.restore();
}

// Clear guides when not moving:
canvas.addEventListener('mouseup', () => {
  // ... existing code ...
  state.activeGuides = [];
});
```

---

## 7. RIGHT-CLICK CONTEXT MENU

### Current Issues:
- ❌ No context menu - all actions require toolbar or keyboard

### Canva/Freeform Pattern:
- ✅ Right-click shows contextual menu
- ✅ Quick access to: Duplicate, Delete, Bring Forward, Send Back, Lock, etc.

### Code Implementation:

```javascript
// Add context menu HTML to index.html:
<div class="context-menu" id="contextMenu" hidden>
  <button type="button" data-action="duplicate">Duplicate</button>
  <button type="button" data-action="delete">Delete</button>
  <hr />
  <button type="button" data-action="bring-forward">Bring Forward</button>
  <button type="button" data-action="send-backward">Send Backward</button>
  <button type="button" data-action="bring-to-front">Bring to Front</button>
  <button type="button" data-action="send-to-back">Send to Back</button>
  <hr />
  <button type="button" data-action="lock">Lock Position</button>
</div>

// CSS:
.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 4px;
  min-width: 180px;
  z-index: 100;
}

.context-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  border-radius: 4px;
}

.context-menu button:hover {
  background: #f0f0f0;
}

.context-menu hr {
  margin: 4px 0;
  border: none;
  border-top: 1px solid #eee;
}

// JavaScript:
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  
  const canvasPos = clientToCanvas(e.clientX, e.clientY);
  const hit = hitTestElement(canvasPos.x, canvasPos.y);
  
  if (hit) {
    state.selectedId = hit.element.id;
    showContextMenu(e.clientX, e.clientY);
  }
});

function showContextMenu(x, y) {
  const menu = document.getElementById('contextMenu');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.removeAttribute('hidden');
}

function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  menu.setAttribute('hidden', '');
}

document.addEventListener('click', hideContextMenu);
canvas.addEventListener('mousedown', hideContextMenu);

// Handle menu actions:
document.getElementById('contextMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || !state.selectedId) return;
  
  const el = state.elements.find(x => x.id === state.selectedId);
  if (!el) return;
  
  switch(btn.dataset.action) {
    case 'duplicate':
      // Trigger Cmd+D behavior
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'd', metaKey: true, ctrlKey: true
      }));
      break;
    case 'delete':
      state.elements = state.elements.filter(x => x.id !== state.selectedId);
      state.selectedId = null;
      saveHistory();
      break;
    case 'bring-forward':
      const idx = state.elements.indexOf(el);
      if (idx < state.elements.length - 1) {
        [state.elements[idx], state.elements[idx + 1]] = 
        [state.elements[idx + 1], state.elements[idx]];
        saveHistory();
      }
      break;
    // ... other actions
  }
  
  hideContextMenu();
});
```

---

## 8. SMOOTH ANIMATIONS & POLISH

### Current Issues:
- ❌ No easing on transformations
- ❌ Selection appears instantly
- ❌ Handles scale with zoom awkwardly
- ❌ Color palette position can be off-screen

### Canva/Freeform Pattern:
- ✅ Smooth fade-in for selection
- ✅ Handles maintain consistent visual size regardless of zoom
- ✅ Subtle drop shadow on selected elements
- ✅ Smooth color transitions

### Code Implementation:

#### Handle size independence from zoom:
```javascript
// In draw(), calculate handle size based on screen pixels, not canvas units:
const screenHandleSize = 8; // pixels on screen
const handleSize = screenHandleSize / state.scale; // canvas units

// Use handleSize instead of HANDLE_SIZE when drawing
```

#### Add selection animation:
```javascript
// Add to state:
state.selectionAnimation = 0; // 0 to 1

// In draw(), animate selection box opacity:
if (selected) {
  // Animate in
  if (state.selectionAnimation < 1) {
    state.selectionAnimation = Math.min(1, state.selectionAnimation + 0.1);
  }
  
  const opacity = state.selectionAnimation;
  
  // Draw with animated opacity
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#007aff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.setLineDash([]);
  ctx.restore();
  
  // Handles with fade-in
  ctx.globalAlpha = opacity;
  // ... draw handles ...
  ctx.globalAlpha = 1;
}

// Reset animation when selection changes:
canvas.addEventListener('mousedown', (e) => {
  const prevSelected = state.selectedId;
  // ... hit testing ...
  if (state.selectedId !== prevSelected) {
    state.selectionAnimation = 0;
  }
});
```

#### Add drop shadow to selected element:
```javascript
// In draw(), before drawing selected element:
if (el.id === state.selectedId) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 122, 255, 0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  // ... draw element ...
  ctx.restore();
}
```

#### Smart color palette positioning:
```javascript
// In draw(), update color palette position logic:
if (selected && !state.selectedBlueprint) {
  const rect = getCanvasRect();
  if (rect) {
    const cx = rect.left + state.offsetX + (selected.x + selected.width / 2) * scale;
    const cy = rect.top + state.offsetY + (selected.y + selected.height / 2) * scale;
    const sh = selected.height * scale;
    const gap = 12;
    const paletteW = 220;
    const paletteH = 44;
    
    // Try below first
    let top = cy + sh / 2 + gap;
    
    // If would go off-screen, show above
    if (top + paletteH > window.innerHeight - 16) {
      top = cy - sh / 2 - gap - paletteH;
    }
    
    // Center horizontally
    let left = cx - paletteW / 2;
    left = Math.max(8, Math.min(window.innerWidth - paletteW - 8, left));
    
    paletteEl.style.left = left + 'px';
    paletteEl.style.top = top + 'px';
    paletteEl.removeAttribute('hidden');
  }
}
```

---

## 9. TOUCH & MOBILE SUPPORT (OPTIONAL)

### Canva/Freeform Pattern:
- ✅ Pinch to zoom
- ✅ Two-finger rotate
- ✅ Touch-friendly handle sizes

### Code Implementation:

```javascript
let touchState = {
  touches: [],
  initialDistance: 0,
  initialAngle: 0,
  initialZoom: 1
};

canvas.addEventListener('touchstart', (e) => {
  touchState.touches = Array.from(e.touches);
  
  if (e.touches.length === 2) {
    // Pinch zoom setup
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    touchState.initialDistance = Math.sqrt(dx*dx + dy*dy);
    touchState.initialZoom = state.viewZoom;
  }
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  
  if (e.touches.length === 2) {
    // Pinch zoom
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    const distance = Math.sqrt(dx*dx + dy*dy);
    const scale = distance / touchState.initialDistance;
    state.viewZoom = Math.max(MIN_VIEW_ZOOM, 
      Math.min(MAX_VIEW_ZOOM, touchState.initialZoom * scale));
  }
}, { passive: false });
```

---

## 10. MULTI-SELECT (ADVANCED)

### Canva/Freeform Pattern:
- ✅ Shift+click to add to selection
- ✅ Drag rectangle to select multiple
- ✅ Move/resize/rotate multiple elements as group
- ✅ Different visual style (all selected have blue box)

### Code Implementation:

```javascript
// Add to state:
state.selectedIds = []; // Array of selected IDs
state.selectionBox = null; // { x, y, w, h } during drag-select

// Shift+click to add to selection:
canvas.addEventListener('mousedown', (e) => {
  if (e.shiftKey && state.selectedIds.length > 0) {
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTestElement(canvasPos.x, canvasPos.y);
    
    if (hit) {
      if (state.selectedIds.includes(hit.element.id)) {
        // Remove from selection
        state.selectedIds = state.selectedIds.filter(id => id !== hit.element.id);
      } else {
        // Add to selection
        state.selectedIds.push(hit.element.id);
      }
      return;
    }
  }
  
  // ... existing single-select logic ...
});

// Drag to select multiple:
canvas.addEventListener('mousedown', (e) => {
  // If clicking empty space without shift, start drag-select
  if (!hit && !hitTestBlueprint(canvasPos.x, canvasPos.y)) {
    state.mode = 'drag-select';
    state.selectionBox = { 
      startX: canvasPos.x, 
      startY: canvasPos.y,
      x: canvasPos.x,
      y: canvasPos.y,
      w: 0,
      h: 0
    };
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (state.mode === 'drag-select') {
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    const box = state.selectionBox;
    box.x = Math.min(box.startX, canvasPos.x);
    box.y = Math.min(box.startY, canvasPos.y);
    box.w = Math.abs(canvasPos.x - box.startX);
    box.h = Math.abs(canvasPos.y - box.startY);
  }
});

canvas.addEventListener('mouseup', () => {
  if (state.mode === 'drag-select' && state.selectionBox) {
    // Find all elements intersecting the box
    const box = state.selectionBox;
    state.selectedIds = state.elements
      .filter(el => {
        return el.x < box.x + box.w &&
               el.x + el.width > box.x &&
               el.y < box.y + box.h &&
               el.y + el.height > box.y;
      })
      .map(el => el.id);
    
    state.selectionBox = null;
    state.mode = null;
  }
});

// In draw(), render selection box:
if (state.mode === 'drag-select' && state.selectionBox) {
  const box = state.selectionBox;
  const sx = offsetX + box.x * scale;
  const sy = offsetY + box.y * scale;
  const sw = box.w * scale;
  const sh = box.h * scale;
  
  ctx.save();
  ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = '#007aff';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.restore();
}

// Render all selected elements with boxes:
state.selectedIds.forEach(id => {
  const el = state.elements.find(e => e.id === id);
  if (!el) return;
  
  // Draw selection box for each selected element
  // ... similar to single-select box ...
});
```

---

## IMPLEMENTATION PRIORITY ROADMAP

### Phase 1: Critical UX Improvements (Week 1)
**Impact: High | Effort: Low-Medium**

1. **Hover states** (Section 1)
   - Visual feedback before selection
   - Cursor changes
   - ~2-3 hours

2. **Better handle design** (Section 2)
   - Circles instead of squares
   - Distinctive rotate handle with icon
   - ~3-4 hours

3. **Edge handles** (Section 5)
   - Add N, E, S, W resize handles
   - Width/height-only resizing
   - ~4-5 hours

4. **Keyboard shortcuts** (Section 4)
   - Delete, arrow keys, Cmd+D
   - Essential for power users
   - ~3-4 hours

**Total: ~12-16 hours**

---

### Phase 2: Polish & Feedback (Week 2)
**Impact: Medium-High | Effort: Medium**

5. **Rotation improvements** (Section 3)
   - Shift-snap to 15° increments
   - Live angle display
   - ~3-4 hours

6. **Dimension display** (Section 2)
   - Show W × H during resize
   - Show angle during rotate
   - ~2-3 hours

7. **Alignment guides** (Section 6)
   - Smart snapping
   - Visual guide lines
   - ~6-8 hours

8. **Animations & polish** (Section 8)
   - Smooth selection fade-in
   - Drop shadows
   - ~4-5 hours

**Total: ~15-20 hours**

---

### Phase 3: Advanced Features (Week 3+)
**Impact: Medium | Effort: High**

9. **Undo/Redo** (Section 4)
   - History management
   - ~6-8 hours

10. **Context menu** (Section 7)
    - Right-click actions
    - ~4-5 hours

11. **Multi-select** (Section 10)
    - Shift+click
    - Drag-to-select
    - ~8-10 hours

12. **Touch support** (Section 9)
    - Mobile gestures
    - ~8-10 hours

**Total: ~26-33 hours**

---

## QUICK WINS (Can implement in < 1 hour each)

1. **Escape key to deselect** ✅ (Already implemented!)

2. **Delete key support**
   ```javascript
   if (e.key === 'Delete' && state.selectedId) {
     state.elements = state.elements.filter(el => el.id !== state.selectedId);
     state.selectedId = null;
   }
   ```

3. **Hover cursor feedback**
   ```javascript
   // In canvas mousemove when not dragging:
   if (hitTestElement(canvasPos.x, canvasPos.y)) {
     canvas.style.cursor = 'move';
   }
   ```

4. **Better rotate handle visuals**
   - Just change from `arc()` to drawing rotation arrows
   - ~30 min

5. **Smart color palette positioning**
   - Add boundary checks
   - ~15 min

---

## TESTING CHECKLIST

After implementing improvements, test:

- [ ] Hover over element shows outline
- [ ] Cursor changes appropriately (move, resize cursors)
- [ ] Corner handles resize maintaining aspect ratio
- [ ] Edge handles resize one dimension only
- [ ] Shift+edge handle maintains aspect ratio
- [ ] Rotation snaps to 15° with Shift held
- [ ] Live dimension display during resize
- [ ] Live angle display during rotation
- [ ] Delete/Backspace removes selected element
- [ ] Arrow keys nudge element 1px
- [ ] Shift+Arrow keys nudge 10px
- [ ] Cmd/Ctrl+D duplicates element
- [ ] Cmd/Ctrl+Z/Y for undo/redo
- [ ] Alignment guides appear when dragging
- [ ] Elements snap to guides within 5px
- [ ] Right-click shows context menu
- [ ] Context menu actions work correctly
- [ ] Selection animates in smoothly
- [ ] Color palette stays on screen
- [ ] Handles maintain visual size at all zoom levels

---

## ADDITIONAL CANVA-LIKE FEATURES TO CONSIDER

### Not Covered Above:
- **Layers panel** - List view of all elements with visibility toggles
- **Grouping** - Select multiple and group them (Cmd+G)
- **Lock elements** - Prevent accidental movement
- **Grid/Rulers** - Visual measurement aids
- **Guides** - Manual draggable alignment guides
- **Background color** - Canvas background options
- **Text elements** - Rich text boxes (major feature)
- **Effects** - Drop shadows, borders, opacity for elements
- **Templates** - Predefined layouts
- **Export options** - PDF, SVG, multiple formats

---

## FILES TO MODIFY

1. **app.js** - Core interaction logic
   - Add hover detection
   - Implement edge handles
   - Add keyboard shortcuts
   - Implement snapping logic
   - Add undo/redo

2. **styles.css** - Visual styling
   - Handle styles
   - Context menu styles
   - Animation keyframes
   - Hover states

3. **index.html** - (Minimal changes)
   - Add context menu HTML
   - Maybe add keyboard shortcut hints

---

## CONCLUSION

Your Quote App has a solid foundation! The main areas needing attention are:

**Critical (Do First):**
- Better visual feedback (hovers, cursors)
- Edge handles for easier resizing
- Basic keyboard shortcuts (Delete, arrows, Cmd+D)

**Important (Do Second):**
- Rotation improvements (shift-snap, angle display)
- Alignment guides & snapping
- Smooth animations

**Nice-to-Have (Do Later):**
- Undo/redo
- Multi-select
- Context menus
- Touch support

**Estimated Total Implementation Time:**
- Phase 1 (Critical): 12-16 hours
- Phase 2 (Polish): 15-20 hours  
- Phase 3 (Advanced): 26-33 hours
- **Total: ~53-69 hours** for complete Canva-like experience

Focus on Phase 1 first for maximum impact with minimal effort!