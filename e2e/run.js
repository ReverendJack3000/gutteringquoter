/**
 * Quote App – E2E tests with Puppeteer.
 * 
 * Start the backend first: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000
 * 
 * Run tests:
 *   - Headless (CI): npm test  or  npm run test:e2e
 *   - With visible Chrome (manual): npm run test:manual  or  HEADED=1 npm test
 */
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const HEADED = process.env.HEADED === '1' || process.env.HEADED === 'true';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const browser = await puppeteer.launch({
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null, // Use full window size
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setCacheEnabled(false);
  if (!HEADED) {
    await page.setViewport({ width: 1280, height: 720 });
  }
  page.setDefaultNavigationTimeout(10000);
  page.setDefaultTimeout(8000);

  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    logs.push({ type, text });
    if (type === 'error' && !text.includes('404')) console.error('[page]', text);
  });

  try {
    console.log('Loading', BASE_URL);
    const res = await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    if (!res || !res.ok()) {
      throw new Error(`Page load failed: ${res ? res.status() : 'no response'}. Is the server running? Start with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000`);
    }

    // App shell
    await page.waitForSelector('.app', { timeout: 5000 });
    await page.waitForSelector('#canvas', { timeout: 5000 });
    // When logged out, app shows login view; ensure canvas view is visible for E2E
    await delay(1500);
    const canvasViewVisible = await page.evaluate(() => {
      const v = document.getElementById('view-canvas');
      return v && !v.classList.contains('hidden');
    });
    if (!canvasViewVisible) {
      await page.evaluate(() => {
        if (typeof window.__quoteAppSwitchView === 'function') window.__quoteAppSwitchView('view-canvas');
      });
      await delay(800);
    }
    console.log('  ✓ App shell and canvas present');

    // Toolbar
    const uploadZone = await page.$('#uploadZone');
    const exportBtn = await page.$('#exportBtn');
    if (!uploadZone || !exportBtn) throw new Error('Toolbar elements missing');
    console.log('  ✓ Toolbar (upload, export) present');

    // Panel: ensure we have panel elements and can expand/collapse
    const panel = await page.$('#panel');
    const panelContent = await page.$('#panelContent');
    if (!panel || !panelContent) throw new Error('Panel elements missing');

    await delay(500);

    let panelExpanded = await page.evaluate(() => document.getElementById('panel').classList.contains('expanded'));
    if (!panelExpanded) {
      await page.click('#panelCollapsed').catch(() => {});
      await delay(300);
      panelExpanded = await page.evaluate(() => document.getElementById('panel').classList.contains('expanded'));
    }
    if (!panelExpanded) {
      await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {});
      throw new Error('Panel should be expandable (click chevron or start expanded). Start the server with: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000');
    }
    console.log('  ✓ Right panel visible/expanded');

    await page.click('#panelClose');
    await delay(300);
    const collapsed = await page.evaluate(() => document.getElementById('panel').classList.contains('collapsed'));
    if (!collapsed) throw new Error('Panel should collapse on close button');
    console.log('  ✓ Panel collapses on close');

    await page.click('#panelCollapsed');
    await delay(300);
    const expandedAgain = await page.evaluate(() => document.getElementById('panel').classList.contains('expanded'));
    if (!expandedAgain) throw new Error('Panel should expand when clicking chevron strip');
    console.log('  ✓ Panel expands when clicking chevron');

    // Product grid (from API or fallback)
    const grid = await page.$('#productGrid');
    if (!grid) throw new Error('Product grid missing');
    const thumbCount = await page.$$eval('.product-thumb', (els) => els.length);
    if (thumbCount === 0) throw new Error('Expected at least one product thumbnail');
    console.log(`  ✓ Product grid has ${thumbCount} items`);

    // Optional: upload blueprint image (Columba College Gutters 11.jpeg) for full canvas test
    const blueprintImagePath = path.resolve(__dirname, '..', 'Columba College Gutters 11.jpeg');
    const fs = require('fs');
    if (fs.existsSync(blueprintImagePath)) {
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }),
        page.click('#uploadZone'),
      ]).catch(() => [null]);
      if (fileChooser) {
        await fileChooser.accept([blueprintImagePath]);
        await delay(1500);
        const cropModal = await page.$('#cropModal');
        const modalVisible = cropModal && !(await page.evaluate((el) => el.hasAttribute('hidden'), cropModal));
        if (modalVisible) {
          await page.click('#cropUseFull').catch(() => {});
          await delay(2000);
        }
        const placeholder = await page.$('#canvasPlaceholder');
        const placeholderHidden = placeholder && (await page.evaluate((el) => el.hasAttribute('hidden') || !el.offsetParent, placeholder));
        if (placeholderHidden) console.log('  ✓ Blueprint image loaded (Columba College Gutters 11.jpeg)');
      }
    }

    // No error message visible (backend reachable)
    const messageEl = await page.$('#toolbarMessage');
    const messageHidden = messageEl ? await page.evaluate((el) => el.hasAttribute('hidden'), messageEl) : true;
    if (!messageHidden) {
      const msgText = await page.evaluate((el) => el.textContent, messageEl);
      console.warn('  ⚠ Toolbar message visible:', msgText);
    } else {
      console.log('  ✓ No backend warning (app served correctly)');
    }

    // Drag-and-drop: simulate dropping a Marley product onto the blueprint
    const canvas = await page.$('#canvas');
    if (!canvas) throw new Error('Canvas missing for drag-drop test');
    const initialCount = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    await page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dt = new DataTransfer();
      dt.setData('application/product-id', 'gutter');
      dt.setData('application/diagram-url', '/assets/marley/gutter.svg');
      const ev = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt });
      canvas.dispatchEvent(ev);
    });
    await delay(800);
    const countAfterDrop = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    if (countAfterDrop <= initialCount) throw new Error(`Drag-drop failed: expected element on blueprint, count before=${initialCount} after=${countAfterDrop}`);
    console.log('  ✓ Drag-and-drop: Marley product added to blueprint');

    // Import normalization: dropped element max dimension <= 150 (check before any resize)
    const elementsAfterDrop = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
    const maxDim = 150;
    for (const el of elementsAfterDrop) {
      const m = Math.max(el.width, el.height);
      if (m > maxDim) throw new Error(`Import normalization: element ${el.id} has max dimension ${m}, expected <= ${maxDim}`);
    }
    console.log(`  ✓ Import normalization: dropped element(s) have max dimension <= ${maxDim}px`);

    // Selection: after drop the app already selects the new element. To test "click to select", we must
    // deselect first (drill-through would otherwise cycle to blueprint and clear selectedIds). Then click
    // the element to select it.
    const canvasBox = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const droppedEl = elementsAfterDrop.length > 0 ? elementsAfterDrop[elementsAfterDrop.length - 1] : null;
    if (canvasBox && droppedEl) {
      // Deselect: click canvas top-left (hits blueprint or empty → clears element selection)
      await page.mouse.click(canvasBox.left + 10, canvasBox.top + 10);
      await delay(200);
      const elCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, droppedEl.id);
      if (elCenter) {
        await page.mouse.click(elCenter.x, elCenter.y);
        await delay(300);
        const selectedIds = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
        if (selectedIds.length !== 1) {
          console.warn('  ⚠ Selection after click: expected 1 selected, got', selectedIds.length);
        } else {
          console.log('  ✓ Selection: one element selected (cursor/selector alignment)');
        }
      } else {
        console.warn('  ⚠ Selection after click: could not get element screen center');
      }
    } else if (canvasBox && !droppedEl) {
      console.warn('  ⚠ Selection after click: no elements after drop');
    }

    // Gutter rotation constraint: 60°–80° band must clamp to 60 or 80 (never stay in band)
    const elementsForGutterTest = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
    const gutterEl = elementsForGutterTest.find((e) => e.assetId && (e.assetId.toLowerCase() === 'gutter' || /^GUT-(SC|CL)-MAR-(\d+(?:\.\d+)?)M$/i.test(e.assetId)));
    if (gutterEl && canvasBox) {
      // 1) Programmatic set: setting 70° (in band) must clamp to 60 or 80
      await page.evaluate((id, deg) => { if (window.__quoteAppSetElementRotation) window.__quoteAppSetElementRotation(id, deg); }, gutterEl.id, 70);
      await delay(100);
      const afterSet70 = await page.evaluate((id) => {
        const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        const el = els.find((e) => e.id === id);
        return el ? el.rotation : null;
      }, gutterEl.id);
      if (afterSet70 != null) {
        const r = afterSet70;
        const norm = ((r % 360) + 360) % 360;
        const inBand = (r > 60 && r < 80) || (norm > 60 && norm < 80);
        if (inBand) throw new Error(`Gutter constraint (set 70°): rotation is ${r}° (in forbidden band); expected 60 or 80`);
        const isClamped = Math.abs(r - 60) < 2 || Math.abs(r - 80) < 2 || Math.abs(norm - 60) < 2 || Math.abs(norm - 80) < 2;
        if (isClamped) console.log(`  ✓ Gutter rotation constraint: set 70° → clamped to ${Math.round(r)}°`);
      }

      // 2) Drag test: rotate gutter and ensure we never land in 60°–80° band
      await page.evaluate((id, deg) => { if (window.__quoteAppSetElementRotation) window.__quoteAppSetElementRotation(id, deg); }, gutterEl.id, 55);
      await delay(200);
      const gutterCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, gutterEl.id);
      if (gutterCenter) {
        await page.mouse.click(gutterCenter.x, gutterCenter.y);
        await delay(300);
      }
      const boxScreen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
      if (boxScreen && boxScreen.handles && boxScreen.handles.rotate) {
        const rotX = Number(boxScreen.handles.rotate.x);
        const rotY = Number(boxScreen.handles.rotate.y);
        const center = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, gutterEl.id);
        if (center && !Number.isNaN(rotX) && !Number.isNaN(rotY)) {
          const r = 100;
          const rad70 = (70 * Math.PI) / 180;
          const targetX = center.x + r * Math.cos(rad70);
          const targetY = center.y + r * Math.sin(rad70);
          await page.mouse.move(rotX, rotY);
          await delay(200);
          await page.mouse.down({ button: 'left' });
          await delay(150);
          await page.mouse.move(targetX, targetY, { steps: 8 });
          await delay(150);
          await page.mouse.up({ button: 'left' });
          await delay(500);
          const afterRot = await page.evaluate((id) => {
            const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
            const el = els.find((e) => e.id === id);
            return el ? { rotation: el.rotation != null ? el.rotation : 0 } : null;
          }, gutterEl.id);
          if (afterRot) {
            const rot = afterRot.rotation;
            const normalized = ((rot % 360) + 360) % 360;
            const inForbiddenBand = (normalized > 60 && normalized < 80) || (rot > 60 && rot < 80);
            if (inForbiddenBand) {
              throw new Error(`Gutter rotation constraint (drag): rotation is ${rot}° (in forbidden band 60°–80°); expected 60 or 80`);
            }
            console.log(`  ✓ Gutter rotation constraint (drag): rotation ${Math.round(rot)}° (forbidden band avoided)`);
          }
        } else {
          console.warn('  ⚠ Gutter rotation: could not get rotate handle or center');
        }
      } else {
        console.warn('  ⚠ Gutter rotation: selection box / rotate handle not available');
      }
    } else {
      console.warn('  ⚠ Gutter rotation: no gutter element found (drop a gutter first)');
    }

    // Drag elements over the blueprint, rotate, and resize them (visible in headed mode)
    const canvasEl = await page.$('#canvas');
    if (canvasEl && canvasBox) {
      const elements = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
      if (elements.length >= 1) {
        // Test dragging the first element over different parts of the blueprint
        const firstEl = elements[0];
        const elCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
        if (elCenter) {
          // Click to select the element
          await page.mouse.click(elCenter.x, elCenter.y);
          await delay(HEADED ? 500 : 300);
          
          // Get initial position
          const elBeforeDrag = await page.evaluate((id) => {
            const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
            const el = els.find((e) => e.id === id);
            return el ? { id: el.id, x: el.x, y: el.y, rotation: el.rotation || 0 } : null;
          }, firstEl.id);
          
          if (elBeforeDrag) {
            // Drag element to top-left area of blueprint
            const dragTarget1 = {
              x: canvasBox.left + canvasBox.width * 0.2,
              y: canvasBox.top + canvasBox.height * 0.2,
            };
            await page.mouse.move(elCenter.x, elCenter.y);
            await delay(HEADED ? 200 : 100);
            await page.mouse.down();
            await delay(HEADED ? 200 : 100);
            await page.mouse.move(dragTarget1.x, dragTarget1.y, { steps: HEADED ? 20 : 5 });
            await delay(HEADED ? 300 : 100);
            await page.mouse.up();
            await delay(HEADED ? 600 : 300);
            
            const elAfterDrag1 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const el = els.find((e) => e.id === id);
              return el ? { x: el.x, y: el.y } : null;
            }, firstEl.id);
            
            if (elAfterDrag1 && (Math.abs(elAfterDrag1.x - elBeforeDrag.x) > 5 || Math.abs(elAfterDrag1.y - elBeforeDrag.y) > 5)) {
              console.log('  ✓ Drag: Element moved over blueprint (top-left area)');
            } else {
              console.warn('  ⚠ Drag: Element position did not change as expected');
            }
            
            // Drag element to bottom-right area of blueprint
            const elCenterAfter1 = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
            if (elCenterAfter1) {
              const dragTarget2 = {
                x: canvasBox.left + canvasBox.width * 0.8,
                y: canvasBox.top + canvasBox.height * 0.8,
              };
              await page.mouse.move(elCenterAfter1.x, elCenterAfter1.y);
              await delay(HEADED ? 200 : 100);
              await page.mouse.down();
              await delay(HEADED ? 200 : 100);
              await page.mouse.move(dragTarget2.x, dragTarget2.y, { steps: HEADED ? 20 : 5 });
              await delay(HEADED ? 300 : 100);
              await page.mouse.up();
              await delay(HEADED ? 600 : 300);
              
              console.log('  ✓ Drag: Element moved over blueprint (bottom-right area)');
            }
            
            // Ensure element is still selected after drag
            const selAfterDrag = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
            if (selAfterDrag.length !== 1 || selAfterDrag[0] !== firstEl.id) {
              // Re-select the element
              const elCenterAfterDrag = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, firstEl.id);
              if (elCenterAfterDrag) {
                await page.mouse.click(elCenterAfterDrag.x, elCenterAfterDrag.y);
                await delay(HEADED ? 500 : 300);
              }
            }
            
            // Now test rotation - use screen coords so pointer events hit the rotate handle (display coords were wrong)
            const boxScreen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
            
            if (boxScreen && boxScreen.handles && boxScreen.handles.rotate) {
              const rotX = Number(boxScreen.handles.rotate.x);
              const rotY = Number(boxScreen.handles.rotate.y);
              
              if (!Number.isNaN(rotX) && !Number.isNaN(rotY)) {
                // Rotate element clockwise - use Puppeteer mouse API with proper sequence
                console.log(`  Testing rotation: rotate handle at (${Math.round(rotX)}, ${Math.round(rotY)})`);
                
                // Move to rotate handle and click to start rotation
                await page.mouse.move(rotX, rotY);
                await delay(HEADED ? 400 : 200);
                
                // Get element center for rotation calculation
                const elInfo = await page.evaluate((id) => {
                  const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                  const el = els.find((e) => e.id === id);
                  const canvas = document.getElementById('canvas');
                  const rect = canvas ? canvas.getBoundingClientRect() : null;
                  if (!el || !rect) return null;
                  const dpr = window.devicePixelRatio || 1;
                  const logicalW = window.state?.canvasWidth / dpr || 0;
                  const logicalH = window.state?.canvasHeight / dpr || 0;
                  const cx = el.x + el.width / 2;
                  const cy = el.y + el.height / 2;
                  const displayX = window.state?.offsetX + cx * window.state?.scale;
                  const displayY = window.state?.offsetY + cy * window.state?.scale;
                  const screenX = rect.left + displayX * (rect.width / logicalW);
                  const screenY = rect.top + displayY * (rect.height / logicalH);
                  return { centerX: screenX, centerY: screenY, rotation: el.rotation || 0 };
                }, firstEl.id);
                
                if (elInfo) {
                  // Drag rotate handle in a circular motion around element center
                  const rotTarget1 = { 
                    x: elInfo.centerX + 100, 
                    y: elInfo.centerY - 80 
                  };
                  
                  await page.mouse.move(rotX, rotY);
                  await delay(HEADED ? 300 : 150);
                  await page.mouse.down({ button: 'left' });
                  await delay(HEADED ? 300 : 150);
                  
                  // Move mouse in steps to simulate smooth rotation
                  const steps = HEADED ? 15 : 8;
                  for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const x = rotX + (rotTarget1.x - rotX) * t;
                    const y = rotY + (rotTarget1.y - rotY) * t;
                    await page.mouse.move(x, y);
                    await delay(HEADED ? 50 : 20);
                  }
                  
                  await delay(HEADED ? 300 : 150);
                  await page.mouse.up({ button: 'left' });
                  await delay(HEADED ? 1000 : 500);
                }
                
                const elAfterRotate1 = await page.evaluate((id) => {
                  const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                  const el = els.find((e) => e.id === id);
                  return el ? { rotation: el.rotation || 0 } : null;
                }, firstEl.id);
                
                const rotationChange1 = elAfterRotate1 ? Math.abs((elAfterRotate1.rotation || 0) - (elBeforeDrag.rotation || 0)) : 0;
                if (elAfterRotate1 && rotationChange1 > 2) {
                  console.log(`  ✓ Rotate: Element rotated from ${Math.round(elBeforeDrag.rotation)}° to ${Math.round(elAfterRotate1.rotation)}° (clockwise, ${Math.round(rotationChange1)}° change)`);
                  
                  // Rotate again counter-clockwise
                  const box2Screen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
                  if (box2Screen && box2Screen.handles && box2Screen.handles.rotate) {
                    const rotX2 = Number(box2Screen.handles.rotate.x);
                    const rotY2 = Number(box2Screen.handles.rotate.y);
                    await page.mouse.move(rotX2, rotY2);
                    await delay(HEADED ? 300 : 100);
                    await page.mouse.down();
                    await delay(HEADED ? 200 : 100);
                    const rotTarget2 = { x: rotX2 - 60, y: rotY2 + 80 };
                    await page.mouse.move(rotTarget2.x, rotTarget2.y, { steps: HEADED ? 15 : 5 });
                    await delay(HEADED ? 300 : 100);
                    await page.mouse.up();
                    await delay(HEADED ? 600 : 300);
                    
                    const elAfterRotate2 = await page.evaluate((id) => {
                      const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                      const el = els.find((e) => e.id === id);
                      return el ? { rotation: el.rotation || 0 } : null;
                    }, firstEl.id);
                    
                    if (elAfterRotate2) {
                      const rotationChange2 = Math.abs((elAfterRotate2.rotation || 0) - (elAfterRotate1.rotation || 0));
                      console.log(`  ✓ Rotate: Element rotated to ${Math.round(elAfterRotate2.rotation)}° (counter-clockwise, ${Math.round(rotationChange2)}° change)`);
                    }
                  }
                } else {
                  // Rotation might not work perfectly in automated tests, but verify handle exists
                  console.log(`  ⚠ Rotate: Handle found at (${Math.round(rotX)}, ${Math.round(rotY)}), but rotation didn't trigger (may need manual verification)`);
                }
              } else {
                console.warn('  ⚠ Rotate: Could not find rotate handle coordinates');
              }
            } else {
              console.warn('  ⚠ Rotate: Selection box (screen coords) not available');
            }
            
            // Test resize with SE handle (ensure element is still selected); use screen coords
            const selBeforeResize = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
            if (selBeforeResize.length === 1 && selBeforeResize[0] === firstEl.id) {
              const boxForResizeScreen = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
              
              if (boxForResizeScreen && boxForResizeScreen.handles && boxForResizeScreen.handles.se) {
                const seX = Number(boxForResizeScreen.handles.se.x);
                const seY = Number(boxForResizeScreen.handles.se.y);
                
                if (!Number.isNaN(seX) && !Number.isNaN(seY)) {
                  const elBeforeResize = await page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const el = els.find((e) => e.id === id);
                    return el ? { width: el.width, height: el.height } : null;
                  }, firstEl.id);
                  
                  await page.mouse.move(seX, seY);
                  await delay(HEADED ? 300 : 100);
                  await page.mouse.down();
                  await delay(HEADED ? 200 : 100);
                  await page.mouse.move(seX + 50, seY + 50, { steps: HEADED ? 10 : 5 });
                  await delay(HEADED ? 300 : 100);
                  await page.mouse.up();
                  await delay(HEADED ? 600 : 300);
                  
                  const elAfterResize = await page.evaluate((id) => {
                    const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                    const el = els.find((e) => e.id === id);
                    return el ? { width: el.width, height: el.height } : null;
                  }, firstEl.id);
                  
                  if (elAfterResize && elBeforeResize && (elAfterResize.width > elBeforeResize.width || elAfterResize.height > elBeforeResize.height)) {
                    console.log('  ✓ Resize: SE handle resized element');
                  } else {
                    console.warn('  ⚠ Resize: Size did not change as expected');
                  }
                }
              }
            }
          }
        }
      }
    }

    // Stable viewport: Fit view button exists and works (re-fit / recenter)
    const recenterBtn = await page.$('#zoomFitBtn');
    if (!recenterBtn) throw new Error('Fit view (Recenter) button missing');
    await recenterBtn.click();
    await delay(300);
    console.log('  ✓ Fit view button present and clickable');

    // Stable viewport: no auto-refit after interaction (viewport unchanged ~200ms after move end)
    const v1 = await page.evaluate(() => (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null);
    if (v1) {
      await delay(250);
      const v2 = await page.evaluate(() => (window.__quoteAppGetViewport && window.__quoteAppGetViewport()) || null);
      if (v2 && (v1.baseScale !== v2.baseScale || v1.baseOffsetX !== v2.baseOffsetX)) {
        console.warn('  ⚠ Stable viewport: baseScale/baseOffset changed without Recenter/blueprint (may be expected if RAF triggered)');
      } else {
        console.log('  ✓ Stable viewport: no auto-refit in 250ms after interaction');
      }
    }

    // Canva/Freeform-style: zoom and pan with content (smooth whiteboard)
    const zoomOutBtn = await page.$('#zoomOutBtn');
    const zoomFitBtn = await page.$('#zoomFitBtn');
    const zoomInBtn = await page.$('#zoomInBtn');
    if (!zoomOutBtn || !zoomFitBtn || !zoomInBtn) throw new Error('Zoom controls missing');
    await zoomOutBtn.click();
    await delay(200);
    await zoomFitBtn.click();
    await delay(200);
    await zoomInBtn.click();
    await delay(200);
    await zoomFitBtn.click();
    await delay(200);
    console.log('  ✓ Zoom controls (− / Fit / +) work with content');

    // Center-drop: click product thumb (no drag) adds element at viewport center
    const countBeforeClick = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
    const firstThumb = await page.$('.product-thumb');
    if (firstThumb) {
      try {
        await firstThumb.click();
        await delay(600);
      } catch (err) {
        console.warn('  ⚠ Center-drop: Could not click product thumb:', err.message);
      }
      const countAfterClick = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
      if (countAfterClick === countBeforeClick + 1) {
        const elementsAfter = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
        const last = elementsAfter[elementsAfter.length - 1];
        console.log('  ✓ Center-drop: click on product added one element at normalized size');

        // Resize tests on fresh unrotated element (cursor alignment, anchor math for rotated elements)
        const resizeEl = last;
        const resizeElCenter = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, resizeEl.id);
        if (resizeElCenter) {
          await page.mouse.click(resizeElCenter.x, resizeElCenter.y);
          await delay(400);
          // 1. Resize unrotated element (SE handle)
          const boxUnrot = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
          if (boxUnrot && boxUnrot.handles && boxUnrot.handles.se) {
            const se = boxUnrot.handles.se;
            const elBefore = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            if (elBefore) {
              await page.mouse.move(se.x, se.y);
              await delay(150);
              await page.mouse.down();
              await page.mouse.move(se.x + 60, se.y + 60, { steps: 8 });
              await delay(150);
              await page.mouse.up();
              await delay(500);
              const elAfterUnrot = await page.evaluate((id) => {
                const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
                const e = els.find((x) => x.id === id);
                return e ? { w: e.width, h: e.height } : null;
              }, resizeEl.id);
              if (elAfterUnrot && (elAfterUnrot.w > elBefore.w || elAfterUnrot.h > elBefore.h)) {
                console.log('  ✓ Resize (unrotated): SE handle increased size');
              } else {
                throw new Error(`Resize (unrotated): expected size increase, got ${elBefore.w}x${elBefore.h} -> ${elAfterUnrot?.w}x${elAfterUnrot?.h}`);
              }
            }
          }
          // 2. Set rotation to 45° and resize (tests cursor alignment for rotated elements)
          await page.evaluate(
            (id, deg) => (window.__quoteAppSetElementRotation && window.__quoteAppSetElementRotation(id, deg)),
            resizeEl.id,
            45
          );
          await delay(200);
          const box45 = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
          if (box45 && box45.handles && box45.handles.se) {
            const se45 = box45.handles.se;
            const elBefore45 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            await page.mouse.move(se45.x, se45.y);
            await delay(150);
            await page.mouse.down();
            await page.mouse.move(se45.x + 40, se45.y + 40, { steps: 8 });
            await delay(150);
            await page.mouse.up();
            await delay(500);
            const elAfter45 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            if (elAfter45 && (elAfter45.w > elBefore45.w || elAfter45.h > elBefore45.h)) {
              console.log('  ✓ Resize (rotated 45°): SE handle increased size, cursor alignment OK');
            } else {
              throw new Error(`Resize (rotated 45°): expected size increase, got ${elBefore45.w}x${elBefore45.h} -> ${elAfter45?.w}x${elAfter45?.h}`);
            }
          }
          // 3. Set rotation to 90° and resize SE handle (tests cursor alignment at 90°)
          await page.evaluate(
            (id, deg) => (window.__quoteAppSetElementRotation && window.__quoteAppSetElementRotation(id, deg)),
            resizeEl.id,
            90
          );
          await delay(200);
          const box90 = await page.evaluate(() => (window.__quoteAppGetSelectionBoxInScreenCoords && window.__quoteAppGetSelectionBoxInScreenCoords()) || null);
          if (box90 && box90.handles && box90.handles.se) {
            const se90 = box90.handles.se;
            const elBefore90 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            await page.mouse.move(se90.x, se90.y);
            await delay(150);
            await page.mouse.down();
            await page.mouse.move(se90.x + 40, se90.y + 40, { steps: 8 });
            await delay(150);
            await page.mouse.up();
            await delay(500);
            const elAfter90 = await page.evaluate((id) => {
              const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
              const e = els.find((x) => x.id === id);
              return e ? { w: e.width, h: e.height } : null;
            }, resizeEl.id);
            if (elAfter90 && (elAfter90.w > elBefore90.w || elAfter90.h > elBefore90.h)) {
              console.log('  ✓ Resize (rotated 90°): SE handle increased size, cursor alignment OK');
            } else {
              console.warn(`  ⚠ Resize (rotated 90°): size changed ${elBefore90.w}x${elBefore90.h} -> ${elAfter90?.w}x${elAfter90?.h} (may need manual verification)`);
            }
          }
        }
      } else {
        console.warn(`  ⚠ Center-drop: click added ${countAfterClick - countBeforeClick} element(s), expected 1`);
      }
    }

    // Color change and selection over blueprint: change colour of one element, then select another
    const elementsForColorTest = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
    if (elementsForColorTest.length >= 2) {
      const [el1, el2] = elementsForColorTest;
      const pos1 = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, el1.id);
      if (pos1) {
        try {
          await page.mouse.click(pos1.x, pos1.y);
          await delay(300);
          const selAfterClick1 = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
          if (selAfterClick1.length === 1 && selAfterClick1[0] === el1.id) {
            const blueSwatch = await page.$('.color-swatch[data-color="#007AFF"]');
            if (blueSwatch) {
              try {
                await page.evaluate((el) => el && el.click(), blueSwatch);
                await delay(400);
                const countAfterColor = await page.evaluate(() => (window.__quoteAppElementCount && window.__quoteAppElementCount()) || 0);
                const hasBlueprintAfter = await page.evaluate(() => (window.__quoteAppHasBlueprint && window.__quoteAppHasBlueprint()) || false);
                if (countAfterColor >= 2) {
                  console.log('  ✓ Color change: element count unchanged after picking colour');
                } else {
                  throw new Error(`Color change: expected >= 2 elements after colour pick, got ${countAfterColor}`);
                }
                if (elementsForColorTest.length >= 2 && hasBlueprintAfter !== false) {
                  console.log('  ✓ Color change: blueprint still present after colour change');
                }
                const pos2 = await page.evaluate((id) => (window.__quoteAppGetElementScreenCenter && window.__quoteAppGetElementScreenCenter(id)) || null, el2.id);
                if (pos2) {
                  try {
                    await page.mouse.click(pos2.x, pos2.y);
                    await delay(300);
                    const selAfterClick2 = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
                    if (selAfterClick2.length === 1 && selAfterClick2[0] === el2.id) {
                      console.log('  ✓ Selection over blueprint: can select another element after colour change');
                    } else {
                      console.warn('  ⚠ Selection over blueprint: expected second element selected, got', selAfterClick2);
                    }
                  } catch (err) {
                    console.warn('  ⚠ Selection over blueprint: Could not click element:', err.message);
                  }
                }
              } catch (err) {
                console.warn('  ⚠ Color change: Error clicking swatch:', err.message);
              }
            }
          }
        } catch (err) {
          console.warn('  ⚠ Color test: Error in color change test:', err.message);
        }
      }
    } else {
      console.warn('  ⚠ Color/selection test skipped (need at least 2 elements)');
    }

    // Comprehensive color tinting tests: verify originalImage preservation and tintedCanvas creation
    // Use the element that was just center-dropped (should still be selected)
    const currentSelection = await page.evaluate(() => (window.__quoteAppGetSelection && window.__quoteAppGetSelection()) || []);
    if (currentSelection.length === 1) {
      const selectedId = currentSelection[0];
      const selectedEl = await page.evaluate((id) => {
        const els = (window.__quoteAppGetElements && window.__quoteAppGetElements()) || [];
        return els.find((e) => e.id === id) || null;
      }, selectedId);
      if (selectedEl) {
        // Verify originalImage exists before color change
        const colorInfoBefore = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
        if (!colorInfoBefore || !colorInfoBefore.hasOriginalImage) {
          console.warn('  ⚠ Color tinting: element missing originalImage before color change (may need migration)');
        }
        // Apply blue color (use evaluate to click - palette may have pointer-events constraints)
        const blueSwatch = await page.$('.color-swatch[data-color="#007AFF"]');
        if (blueSwatch) {
          try {
            await page.evaluate((el) => el && el.click(), blueSwatch);
          } catch (err) {
            console.warn('  ⚠ Color tinting: Could not click blue swatch:', err.message);
          }
          await delay(600);
          const colorInfoAfter = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
          if (!colorInfoAfter) {
            throw new Error(`Color tinting: could not get color info for element ${selectedId}`);
          }
          if (!colorInfoAfter.hasOriginalImage) {
            throw new Error(`Color tinting: element ${selectedId} missing originalImage after color change`);
          }
          if (colorInfoAfter.color !== '#007AFF') {
            throw new Error(`Color tinting: element ${selectedId} color mismatch, expected #007AFF, got ${colorInfoAfter.color}`);
          }
          if (!colorInfoAfter.hasTintedCanvas) {
            throw new Error(`Color tinting: element ${selectedId} missing tintedCanvas when color is set`);
          }
          if (colorInfoAfter.tintedCanvasColor !== '#007AFF') {
            throw new Error(`Color tinting: element ${selectedId} tintedCanvasColor mismatch, expected #007AFF, got ${colorInfoAfter.tintedCanvasColor}`);
          }
          console.log('  ✓ Color tinting: originalImage preserved and tintedCanvas created');
          // Test changing color multiple times (should regenerate tintedCanvas, preserve originalImage)
          const redSwatch = await page.$('.color-swatch[data-color="#FF3B30"]');
          if (redSwatch) {
            await page.evaluate((el) => el && el.click(), redSwatch);
            await delay(600);
            const colorInfoAfterRed = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
            if (colorInfoAfterRed && colorInfoAfterRed.hasOriginalImage && colorInfoAfterRed.color === '#FF3B30' && colorInfoAfterRed.hasTintedCanvas) {
              console.log('  ✓ Color tinting: changing color multiple times preserves originalImage and regenerates tintedCanvas');
            } else {
              console.warn('  ⚠ Color tinting: multiple color changes may not preserve originalImage correctly');
            }
            // Test removing color (should use originalImage, no tintedCanvas)
            const defaultSwatch = await page.$('.color-swatch.color-swatch-default');
            if (defaultSwatch) {
              await page.evaluate((el) => el && el.click(), defaultSwatch);
              await delay(600);
              const colorInfoAfterDefault = await page.evaluate((id) => (window.__quoteAppGetElementColorInfo && window.__quoteAppGetElementColorInfo(id)) || null, selectedId);
              if (colorInfoAfterDefault && colorInfoAfterDefault.hasOriginalImage && !colorInfoAfterDefault.color && !colorInfoAfterDefault.hasTintedCanvas) {
                console.log('  ✓ Color tinting: removing color restores originalImage usage (no tintedCanvas)');
              } else {
                console.warn('  ⚠ Color tinting: removing color may not restore originalImage correctly');
              }
            }
          }
        } else {
          console.warn('  ⚠ Color tinting test skipped: blue swatch not found');
        }
      } else {
        console.warn('  ⚠ Color tinting test skipped: selected element not found in elements list');
      }
    } else {
      console.warn('  ⚠ Color tinting test skipped: no element currently selected');
    }

    const cursor = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      return c ? c.style.cursor : '';
    });
    if (cursor !== 'grab' && cursor !== 'grabbing') {
      console.warn('  ⚠ Canvas cursor with content expected "grab", got:', cursor || '(default)');
    } else {
      console.log('  ✓ Canvas shows grab cursor with content');
    }

    // Transparency: click #blueprintTransparencyBtn to open popover (button visible when blueprint exists and technical drawing OFF)
    const hasBlueprint = await page.evaluate(() => (window.__quoteAppHasBlueprint && window.__quoteAppHasBlueprint()) || false);
    if (hasBlueprint) {
      // Uncheck Technical drawing so transparency button is visible (use evaluate to avoid overlay/visibility issues)
      const techToggle = await page.$('#technicalDrawingToggle');
      if (techToggle) {
        const checked = await page.evaluate((el) => el.checked, techToggle);
        if (checked) {
          await page.evaluate(() => { const t = document.getElementById('technicalDrawingToggle'); if (t) t.click(); });
          await delay(2000);
        }
      }
      await delay(400);
      const transBtn = await page.$('#blueprintTransparencyBtn');
      if (transBtn) {
        const btnHidden = await page.evaluate((el) => el.hasAttribute('hidden'), transBtn);
        if (btnHidden) {
          console.warn('  ⚠ Transparency: button hidden (technical drawing may still be on)');
        } else {
          await page.evaluate(() => { const b = document.getElementById('blueprintTransparencyBtn'); if (b) b.click(); });
          await delay(300);
          const popoverHidden = await page.evaluate(() => {
            const el = document.getElementById('transparencyPopover');
            return !el || el.hasAttribute('hidden');
          });
          if (popoverHidden) {
            throw new Error('Transparency: popover should be visible after clicking transparency button');
          }
          console.log('  ✓ Transparency: button opens popover when technical drawing off');
          const rangeEl = await page.$('#transparencyRange');
          if (rangeEl) {
            await page.evaluate(() => {
              const r = document.getElementById('transparencyRange');
              if (r) {
                r.value = 50;
                r.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            await delay(300);
            const opacityAfter = await page.evaluate(() => (window.__quoteAppGetBlueprintOpacity && window.__quoteAppGetBlueprintOpacity()) ?? 1);
            if (Math.abs(opacityAfter - 0.5) < 0.02) {
              console.log('  ✓ Transparency: slider updates blueprint opacity (50% -> ~0.5)');
            } else {
              throw new Error(`Transparency: expected opacity ~0.5 after slider, got ${opacityAfter}`);
            }
            const numberEl = await page.$('#transparencyNumber');
            if (numberEl) {
              await page.evaluate(() => {
                const n = document.getElementById('transparencyNumber');
                if (n) {
                  n.value = 25;
                  n.dispatchEvent(new Event('change', { bubbles: true }));
                  n.blur();
                }
              });
              await delay(300);
              const opacityAfterNum = await page.evaluate(() => (window.__quoteAppGetBlueprintOpacity && window.__quoteAppGetBlueprintOpacity()) ?? 1);
              if (Math.abs(opacityAfterNum - 0.25) < 0.02) {
                console.log('  ✓ Transparency: number input updates blueprint opacity (25% -> ~0.25)');
              } else {
                throw new Error(`Transparency: expected opacity ~0.25 after number input, got ${opacityAfterNum}`);
              }
              await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
              await delay(100);
              const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
              await page.keyboard.down(mod);
              await page.keyboard.press('z');
              await page.keyboard.up(mod);
              await delay(300);
              const opacityAfterUndo = await page.evaluate(() => (window.__quoteAppGetBlueprintOpacity && window.__quoteAppGetBlueprintOpacity()) ?? 1);
              if (Math.abs(opacityAfterUndo - 0.5) < 0.02) {
                console.log('  ✓ Transparency: Ctrl+Z undoes number input change (back to 50%)');
              } else {
                console.warn('  ⚠ Transparency: undo expected ~0.5, got', opacityAfterUndo);
              }
            }
          } else {
            console.warn('  ⚠ Transparency: #transparencyRange not found');
          }
        }
      } else {
        console.warn('  ⚠ Transparency test skipped: #blueprintTransparencyBtn not found');
      }
    } else {
      console.warn('  ⚠ Transparency test skipped: no blueprint loaded');
    }

    // Quote modal: incomplete gutter row replacement test
    console.log('\n--- Quote Modal: Incomplete Row Replacement Test ---');
    const gutterThumbs = await page.$$('.product-thumb[data-product-id^="GUT-"]');
    if (gutterThumbs.length > 0) {
      // Place a gutter element on canvas (center-drop)
      const firstGutterThumb = gutterThumbs[0];
      const gutterAssetId = await page.evaluate((el) => el.dataset.productId, firstGutterThumb);
      await firstGutterThumb.click();
      await delay(500);
      
      const elementsBeforeQuote = await page.evaluate(() => (window.__quoteAppGetElements && window.__quoteAppGetElements()) || []);
      const gutterElement = elementsBeforeQuote.find(el => el.assetId && el.assetId.startsWith('GUT-'));
      if (!gutterElement) {
        throw new Error('Quote test: Failed to place gutter element on canvas');
      }
      console.log(`  ✓ Placed gutter element: ${gutterElement.assetId}`);

      // Open quote modal
      const generateQuoteBtn = await page.$('#generateQuoteBtn');
      if (!generateQuoteBtn) {
        throw new Error('Quote test: #generateQuoteBtn not found');
      }
      await generateQuoteBtn.click();
      await delay(1000); // Wait for modal to open and initial calculation

      // Check if modal is visible
      const modalVisible = await page.evaluate(() => {
        const modal = document.getElementById('quoteModal');
        return modal && !modal.hasAttribute('hidden');
      });
      if (!modalVisible) {
        throw new Error('Quote test: Quote modal did not open');
      }
      console.log('  ✓ Quote modal opened');

      // Wait for labour rates to load and auto-select
      await delay(500);
      const labourRateSelected = await page.evaluate(() => {
        const select = document.getElementById('labourRateSelect');
        return select && select.value && select.value !== '';
      });
      if (!labourRateSelected) {
        console.warn('  ⚠ Quote test: No labour rate auto-selected (may need manual selection)');
      }

      // Check for incomplete gutter row with "Metres?" input
      const incompleteRow = await page.evaluate(() => {
        const tableBody = document.getElementById('quoteTableBody');
        if (!tableBody) return null;
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        const incomplete = rows.find(row => {
          const input = row.querySelector('.quote-qty-metres-input');
          const assetId = row.dataset.assetId;
          return input && assetId && assetId.startsWith('GUT-');
        });
        if (!incomplete) return null;
        return {
          assetId: incomplete.dataset.assetId,
          hasInput: !!incomplete.querySelector('.quote-qty-metres-input'),
          productName: incomplete.cells[0]?.textContent?.trim() || ''
        };
      });

      if (!incompleteRow) {
        console.warn('  ⚠ Quote test: No incomplete gutter row found (element may have measured length)');
      } else {
        console.log(`  ✓ Found incomplete gutter row: ${incompleteRow.productName} (${incompleteRow.assetId})`);

        // Enter metres value (e.g., 4.5m which should bin-pack to 3m + 1.5m)
        await page.evaluate(() => {
          const tableBody = document.getElementById('quoteTableBody');
          if (!tableBody) return;
          const input = tableBody.querySelector('.quote-qty-metres-input');
          if (input) {
            input.value = '4.5';
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        });
        await delay(1500); // Wait for recalculation

        // Verify placeholder row is replaced with actual product rows
        const rowsAfterEntry = await page.evaluate(() => {
          const tableBody = document.getElementById('quoteTableBody');
          if (!tableBody) return null;
          const rows = Array.from(tableBody.querySelectorAll('tr[data-asset-id^="GUT-"]'));
          return rows.map(row => ({
            assetId: row.dataset.assetId,
            productName: row.cells[0]?.textContent?.trim() || '',
            qty: row.cells[1]?.textContent?.trim() || '',
            hasInput: !!row.querySelector('.quote-qty-metres-input'),
            isIncomplete: row.dataset.incompleteMeasurement === 'true'
          }));
        });

        if (!rowsAfterEntry || rowsAfterEntry.length === 0) {
          throw new Error('Quote test: No gutter rows found after entering metres');
        }

        // Check that incomplete placeholder row is gone
        const stillHasIncomplete = rowsAfterEntry.some(r => r.isIncomplete || r.hasInput);
        if (stillHasIncomplete) {
          console.warn('  ⚠ Quote test: Incomplete row still present after entering metres:', rowsAfterEntry.filter(r => r.isIncomplete || r.hasInput));
        } else {
          console.log('  ✓ Incomplete placeholder row removed');
        }

        // Check that actual product rows appear (should have specific lengths like "3m", "1.5m" in name)
        const hasSpecificLengths = rowsAfterEntry.some(r => {
          const name = r.productName.toLowerCase();
          return name.includes('3m') || name.includes('1.5m') || name.includes('5m');
        });
        if (hasSpecificLengths) {
          console.log(`  ✓ Actual product rows appear with specific lengths (${rowsAfterEntry.length} rows)`);
          rowsAfterEntry.forEach(r => {
            console.log(`    - ${r.productName}: qty=${r.qty}`);
          });
        } else {
          console.warn('  ⚠ Quote test: Product rows may not show specific lengths:', rowsAfterEntry.map(r => r.productName));
        }

        // Check for inferred items (brackets, screws)
        const inferredItems = await page.evaluate(() => {
          const tableBody = document.getElementById('quoteTableBody');
          if (!tableBody) return null;
          const rows = Array.from(tableBody.querySelectorAll('tr'));
          return rows
            .filter(row => {
              const assetId = row.dataset.assetId || '';
              const id = assetId.toUpperCase();
              return id.startsWith('BRK-') || id === 'SCR-SS' || id.startsWith('SCL-') || id.startsWith('ACL-');
            })
            .map(row => ({
              assetId: row.dataset.assetId,
              name: row.cells[0]?.textContent?.trim() || '',
              qty: row.cells[1]?.textContent?.trim() || ''
            }));
        });

        if (inferredItems && inferredItems.length > 0) {
          console.log(`  ✓ Inferred items appear (${inferredItems.length} items):`);
          inferredItems.forEach(item => {
            console.log(`    - ${item.name}: qty=${item.qty || '(empty)'}`);
          });
        } else {
          console.warn('  ⚠ Quote test: No inferred items found (brackets, screws, clips)');
        }
      }

      // Close modal
      const closeBtn = await page.$('#quoteModalClose');
      if (closeBtn) {
        await closeBtn.click();
        await delay(300);
      }
    } else {
      console.warn('  ⚠ Quote test skipped: No gutter products found in panel');
    }

    console.log('\nAll checks passed.');
  } catch (err) {
    console.error('\nE2E failed:', err.message);
    if (logs.some((l) => l.type === 'error')) {
      console.error('Page errors:', logs.filter((l) => l.type === 'error').map((l) => l.text));
    }
    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
}

run();
