# Quick-Start Implementation Guide
## Priority 1 Improvements (Weekend Project - 12-16 hours)

This guide focuses on the **highest-impact, lowest-effort** improvements that will transform your app's feel.

---

## 1. HOVER STATES & CURSOR FEEDBACK (2-3 hours)

### Add to state (line ~30 in app.js):
```javascript
state.hoveredId = null;
```

### Update canvas mousemove handler (add before existing drag logic):
```javascript
canvas.addEventListener('mousemove', (e) => {
  const canvasPos = clientToCanvas(e.clientX, e.clientY);
  
  // When not dragging, update hover state
  if (!state.mode) {
    const hit = hitTestElement(canvasPos.x, canvasPos.y);
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
  
  // ... rest of existing mousemove code ...
});
```

### Add hover outline to draw() (after drawing elements, before selection box):
```javascript
// Draw hover outline
elements.forEach((el) => {
  if (el.id === state.hoveredId && el.id !== state.selectedId) {
    ctx.save();
    const hx = offsetX + el.x * scale;
    const hy = offsetY + el.y * scale;
    const hw = el.width * scale;
    const hh = el.height * scale;
    const hcx = hx + hw/2;
    const hcy = hy + hh/2;
    
    ctx.translate(hcx, hcy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-hw/2, -hh/2);
    
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, hw, hh);
    ctx.restore();
  }
});
```

---

## 2. IMPROVED HANDLE DESIGN (3-4 hours)

### Replace handle rendering in draw() (find the handles section):
```javascript
// Replace the square handle rendering with circles:
const hs = HANDLE_SIZE / 2;
const handles = [
  { id: 'nw', x: sx, y: sy },
  { id: 'ne', x: sx + sw, y: sy },
  { id: 'sw', x: sx, y: sy + sh },
  { id: 'se', x: sx + sw, y: sy + sh },
];

ctx.fillStyle = '#fff';
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 2;

// Draw corner handles as circles
handles.forEach((h) => {
  ctx.beginPath();
  ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
});

// Draw rotate handle with connection line
const rotY = sy - ROTATE_HANDLE_OFFSET;

// Connection line
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 1.5;
ctx.setLineDash([4, 3]);
ctx.beginPath();
ctx.moveTo(cx, sy);
ctx.lineTo(cx, rotY);
ctx.stroke();
ctx.setLineDash([]);

// Rotate handle as circle with rotation icon
ctx.save();
ctx.translate(cx, rotY);

// Outer circle
ctx.beginPath();
ctx.arc(0, 0, 8, 0, Math.PI * 2);
ctx.fillStyle = '#fff';
ctx.fill();
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 2;
ctx.stroke();

// Rotation arrow icon
ctx.strokeStyle = '#007aff';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(0, 0, 4.5, -Math.PI * 0.75, Math.PI * 0.75, false);
ctx.stroke();

// Arrow tip
ctx.beginPath();
ctx.moveTo(2.5, 3.5);
ctx.lineTo(4.5, 4.5);
ctx.lineTo(3, 2);
ctx.stroke();

ctx.restore();
```

---

## 3. EDGE HANDLES (4-5 hours)

### Step 1: Add edge handles to draw() (after corner handles):
```javascript
// Add edge handles
const edgeHandles = [
  { id: 'n', x: sx + sw/2, y: sy },
  { id: 'e', x: sx + sw, y: sy + sh/2 },
  { id: 's', x: sx + sw/2, y: sy + sh },
  { id: 'w', x: sx, y: sy + sh/2 },
];

edgeHandles.forEach((h) => {
  ctx.beginPath();
  ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
});
```

### Step 2: Update hitTestHandle() to include edge handles:
```javascript
function hitTestHandle(clientX, clientY) {
  const selected = state.elements.find((e) => e.id === state.selectedId);
  if (!selected) return null;
  
  const sx = state.offsetX + selected.x * state.scale;
  const sy = state.offsetY + selected.y * state.scale;
  const sw = selected.width * state.scale;
  const sh = selected.height * state.scale;
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;
  const rotY = sy - ROTATE_HANDLE_OFFSET;
  const hs = HANDLE_SIZE;

  const handles = [
    { id: 'nw', x: sx, y: sy, cursor: 'nw-resize' },
    { id: 'n', x: cx, y: sy, cursor: 'n-resize' },
    { id: 'ne', x: sx + sw, y: sy, cursor: 'ne-resize' },
    { id: 'e', x: sx + sw, y: cy, cursor: 'e-resize' },
    { id: 'se', x: sx + sw, y: sy + sh, cursor: 'se-resize' },
    { id: 's', x: cx, y: sy + sh, cursor: 's-resize' },
    { id: 'sw', x: sx, y: sy + sh, cursor: 'sw-resize' },
    { id: 'w', x: sx, y: cy, cursor: 'w-resize' },
    { id: 'rotate', x: cx, y: rotY, cursor: 'grab' },
  ];

  const rect = getCanvasRect();
  if (!rect) return null;
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  for (const h of handles) {
    const r = h.id === 'rotate' ? 10 : 8;
    if (Math.abs(x - h.x) <= r && Math.abs(y - h.y) <= r) {
      return { element: selected, handle: h.id, cursor: h.cursor };
    }
  }
  return null;
}
```

### Step 3: Update resize logic in mousemove:
```javascript
else if (state.mode === 'resize' && state.selectedId && state.resizeHandle) {
  const el = state.elements.find((x) => x.id === state.selectedId);
  if (!el) return;
  
  const cx = state.dragOffset.cx;
  const cy = state.dragOffset.cy;
  const ar = state.dragOffset.w / state.dragOffset.h;
  
  let w = el.width;
  let h = el.height;
  
  // Edge handles - resize one dimension only
  if (state.resizeHandle === 'n' || state.resizeHandle === 's') {
    h = Math.max(MIN_ELEMENT_DIMENSION_PX, Math.abs(canvasPos.y - cy) * 2);
    if (e.shiftKey) w = h * ar; // Maintain aspect ratio with Shift
  } else if (state.resizeHandle === 'e' || state.resizeHandle === 'w') {
    w = Math.max(MIN_ELEMENT_DIMENSION_PX, Math.abs(canvasPos.x - cx) * 2);
    if (e.shiftKey) h = w / ar; // Maintain aspect ratio with Shift
  } else {
    // Corner handles - always maintain aspect ratio
    w = Math.max(MIN_ELEMENT_DIMENSION_PX, Math.abs(canvasPos.x - cx) * 2);
    h = Math.max(MIN_ELEMENT_DIMENSION_PX, Math.abs(canvasPos.y - cy) * 2);
    if (w / h > ar) h = w / ar;
    else w = h * ar;
  }
  
  el.width = w;
  el.height = h;
  el.x = cx - w / 2;
  el.y = cy - h / 2;
}
```

### Step 4: Add cursor feedback in mousemove (when not dragging):
```javascript
// Add this at the beginning of canvas mousemove, when !state.mode:
if (!state.mode) {
  const handleHit = hitTestHandle(e.clientX, e.clientY);
  if (handleHit) {
    canvas.style.cursor = handleHit.cursor;
    return;
  }
  
  // ... rest of hover logic ...
}
```

---

## 4. KEYBOARD SHORTCUTS (3-4 hours)

### Replace the existing keydown handler with this enhanced version:
```javascript
document.addEventListener('keydown', (e) => {
  // Delete element
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
    if (document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      state.elements = state.elements.filter(el => el.id !== state.selectedId);
      state.selectedId = null;
    }
  }
  
  // Duplicate (Cmd/Ctrl+D)
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? e.metaKey : e.ctrlKey;
  
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
        image: el.image, // Reuse the same image reference
        color: el.color,
      };
      state.elements.push(duplicate);
      state.selectedId = duplicate.id;
    }
  }
  
  // Arrow key nudging
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedId) {
    if (document.activeElement.tagName !== 'INPUT') {
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
    }
  }
  
  // Bring forward (Cmd/Ctrl+])
  if (cmdKey && e.key === ']' && state.selectedId) {
    e.preventDefault();
    const idx = state.elements.findIndex(x => x.id === state.selectedId);
    if (idx < state.elements.length - 1) {
      const temp = state.elements[idx];
      state.elements[idx] = state.elements[idx + 1];
      state.elements[idx + 1] = temp;
    }
  }
  
  // Send backward (Cmd/Ctrl+[)
  if (cmdKey && e.key === '[' && state.selectedId) {
    e.preventDefault();
    const idx = state.elements.findIndex(x => x.id === state.selectedId);
    if (idx > 0) {
      const temp = state.elements[idx];
      state.elements[idx] = state.elements[idx - 1];
      state.elements[idx - 1] = temp;
    }
  }
  
  // Deselect (Escape) - already implemented!
  if (e.key === 'Escape') {
    state.selectedId = null;
    state.selectedBlueprint = false;
  }
});
```

---

## BONUS: Rotation Snap (15 minutes)

### Add to the rotate mousemove handler:
```javascript
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
}
```

---

## TESTING YOUR IMPROVEMENTS

After implementing, test each feature:

### Hover States:
- [ ] Move mouse over elements → see blue outline
- [ ] Cursor changes to "move" over elements
- [ ] Outline disappears when selected

### Handles:
- [ ] Corner handles are white circles with blue border
- [ ] Edge handles appear on all 4 sides
- [ ] Rotate handle has arrow icon
- [ ] Cursor changes appropriately over each handle

### Edge Resize:
- [ ] Drag N/S handles → height changes, width stays same
- [ ] Drag E/W handles → width changes, height stays same
- [ ] Shift + edge drag → maintains aspect ratio
- [ ] Corner drag → always maintains aspect ratio

### Keyboard:
- [ ] Delete key removes element
- [ ] Arrow keys move element 1px
- [ ] Shift+Arrow moves 10px
- [ ] Cmd/Ctrl+D duplicates element (offset 20px)
- [ ] Cmd/Ctrl+] brings element forward
- [ ] Cmd/Ctrl+[ sends element backward
- [ ] Escape deselects

### Rotation:
- [ ] Shift while rotating snaps to 15° increments
- [ ] Can achieve exact 0°, 45°, 90°, etc.

---

## COMMON GOTCHAS

1. **Check for `document.activeElement`** in keyboard handlers
   - Prevents shortcuts from firing when typing in search box
   
2. **Use `e.preventDefault()`** on keyboard events
   - Stops browser from scrolling page with arrow keys

3. **Maintain `elementIdCounter`** uniqueness
   - When duplicating, increment counter properly

4. **Handle undefined elements gracefully**
   - Always check `if (!el) return;` after `find()`

5. **Test at different zoom levels**
   - Handles should stay visually consistent

---

## ESTIMATED TIME BREAKDOWN

- Hover states: 2-3 hours
- Handle design: 3-4 hours
- Edge handles: 4-5 hours
- Keyboard shortcuts: 3-4 hours
- **Total: 12-16 hours**

This is a perfect **weekend project** that will massively improve your app's UX!

---

## WHAT'S NEXT?

After completing these priority items, consider:
1. Alignment guides & snapping (Section 6 of main doc)
2. Live dimension/angle display during transforms
3. Smooth animations & polish
4. Undo/redo functionality

See `UI_REFINEMENTS_ANALYSIS.md` for complete details on all improvements.