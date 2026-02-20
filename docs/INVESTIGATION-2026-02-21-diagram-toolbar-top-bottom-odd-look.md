# Investigation: Diagram toolbar odd look at top/bottom (horizontal orientation)

**Date:** 2026-02-21  
**Symptom:** When the diagram floating toolbar is dragged to the **left or right** edge of the phone screen it looks correct. When dragged to the **middle top or bottom** of the screen, both **expanded** and **collapsed** views look odd.  
**Context:** Horizontal scroll was limited to horizontal orientation only; vertical orientation has no scroll. This report identifies the root cause of the top/bottom (horizontal orientation) odd appearance.

---

## Root cause: orientation rule overrides collapsed state (specificity tie, source order wins)

### What’s going on

- At **top/bottom** the toolbar has **`data-orientation="horizontal"`** (horizontal bar).
- At **left/right** it has **`data-orientation="vertical"`** (vertical strip).

The problematic rule is the **horizontal-orientation-only** block that does **not** exclude the collapsed state:

```css
/* 54.57: Horizontal mobile toolbar … */
body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"] {
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;   /* ← applied even when collapsed */
  max-width: calc(100vw - 16px);
}
```

The **collapsed** state is defined earlier as:

```css
body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed {
  padding: 0;
  gap: 0;
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  max-width: 48px;
  max-height: 48px;
  border-radius: 50%;
}
```

When the toolbar is **both** collapsed **and** horizontal (top/bottom):

- Both selectors match.
- **Specificity is the same:**  
  `body` + `.diagram-floating-toolbar` + `.diagram-floating-toolbar--collapsed`  
  vs  
  `body` + `.diagram-floating-toolbar` + `[data-orientation="horizontal"]`  
  (same number of classes/attributes).
- **Source order decides:** the horizontal block comes **after** the collapsed block (2188 vs 2162), so the horizontal rule **wins** for `padding` and `gap`.

So in the **collapsed + horizontal** case you get:

- From collapsed: `width/height: 48px`, `max-width/max-height: 48px`, `padding: 0`, `gap: 0`.
- From horizontal (overriding): **`padding: 0.375rem 0.5rem`**, **`gap: 0.375rem`**.

The toolbar uses **`box-sizing: border-box`** (base rule at 1236 and global `*`). So the 48×48px size **includes** that padding:

- Horizontal padding: `0.5rem` × 2 ≈ 16px → content width ≈ **32px**.
- Vertical padding: `0.375rem` × 2 ≈ 12px → content height ≈ **36px**.

The collapse button is **44×44px**. It cannot fit inside a 32×36px content area, so it **overflows** the 48×48 circle. That leads to:

- Clipping (if `overflow: hidden`), or  
- The circle visually “bursting” or looking distorted,

and explains the **odd collapsed look** at top/bottom.

Left/right (vertical orientation) looks correct because there is **no** `[data-orientation="vertical"]` rule that overrides the collapsed block’s `padding: 0` / `gap: 0`. So the circle stays 48×48 with no extra padding and the 44px button fits.

---

## Why expanded at top/bottom can also look odd

For **expanded** horizontal (top/bottom), the same horizontal rule is intended and applies:

- `padding: 0.375rem 0.5rem` and `gap: 0.375rem` on the **container**.
- `overflow-x: auto` only on the **tools-wrap** (horizontal scroll, no scroll on the outer container).

So horizontal scroll is correctly scoped. Any “odd” expanded look at top/bottom could be:

1. **Carry-over impression** from the collapsed bug (same position, same orientation).
2. **Layout quirk** from the base mobile rule:  
   `body[data-viewport-mode="mobile"] .diagram-floating-toolbar` sets `flex-direction: column` and `justify-content: flex-start`; the horizontal block overrides to `flex-direction: row` but does **not** override `justify-content`. So you get `flex-start` on a row, which is fine, but the mix of base vs horizontal rules can make the bar feel slightly off if padding/gap or alignment are not fully tuned for the horizontal bar.
3. **Padding/gap** on the container (0.375rem 0.5rem) making the bar feel “boxy” or uneven compared to the vertical strip.

The **primary** root cause is still: **horizontal-orientation rule applies to the collapsed state and overrides padding/gap, breaking the 48px circle.**

---

## Summary

| Location              | Orientation | Collapsed rule padding/gap | Horizontal rule padding/gap | Result |
|-----------------------|------------|----------------------------|----------------------------|--------|
| Left/right (vertical) | vertical   | Applied (padding: 0, gap: 0) | Does not match             | Circle correct (48×48, no extra padding). |
| Top/bottom (horizontal) | horizontal | Overridden by horizontal  | Applied (padding, gap)     | Circle gets padding; content area &lt; 44px; 44px button overflows → odd look. |

**Root cause:**  
The selector `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"]` does not exclude `.diagram-floating-toolbar--collapsed`, so when the toolbar is at the **middle top or bottom** (horizontal orientation), the horizontal block overrides the collapsed block’s `padding: 0` and `gap: 0`. With `box-sizing: border-box` and a fixed 48×48 size, that padding shrinks the content area below 44px and the 44×44 collapse button overflows the circle, producing the odd collapsed (and possibly expanded) appearance. Horizontal scroll is correctly limited to the tools-wrap in horizontal orientation; the bug is the orientation rule applying to the **collapsed** container and conflicting with the intended circle styling.

**Fix direction (for implementation):**  
Ensure that when the toolbar is collapsed, the circle styling always wins. For example:

- Add a rule that applies **only** when **both** collapsed **and** horizontal, e.g.  
  `body[data-viewport-mode="mobile"] .diagram-floating-toolbar.diagram-floating-toolbar--collapsed[data-orientation="horizontal"]`  
  with `padding: 0; gap: 0;` (and any other needed resets), placed **after** the current horizontal block so it wins for the collapsed + horizontal case; or  
- Restrict the current horizontal block so it does **not** apply when collapsed, e.g.  
  `body[data-viewport-mode="mobile"] .diagram-floating-toolbar[data-orientation="horizontal"]:not(.diagram-floating-toolbar--collapsed)`  
  for the properties that must be zero when collapsed (padding, gap).

Either way, the horizontal scroll (overflow-x on the tools-wrap) remains unchanged and only applies when expanded.
