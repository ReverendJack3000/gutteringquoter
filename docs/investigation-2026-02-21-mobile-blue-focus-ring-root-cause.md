# Investigation: Mobile blue focus ring – root cause (no code changes)

**Date:** 2026-02-21  
**Scope:** Why blue borders persist on mobile and why they appear where they do.

---

## 1. What you’re seeing

- **Products panel:** After opening the panel, the blue border appears along the top of the panel content area (you described it as on `div.app > … > aside#panel > div#panelContent` at top=368px, width=650px, height=366px). Previously it was around the close button `#panelClose`.
- **Header (toolbar):** Collapsing/expanding the header leaves a blue border on the collapse button `#toolbarCollapseBtn` and “all the buttons” keep showing blue when used.

---

## 2. Root cause: one design rule drives everything

**Task 54.6 (mobile focus ring)** in `frontend/styles.css` (lines 135–144) does this on mobile only:

```css
body[data-viewport-mode="mobile"] button:focus,
body[data-viewport-mode="mobile"] a:focus,
body[data-viewport-mode="mobile"] input:focus,
body[data-viewport-mode="mobile"] select:focus,
body[data-viewport-mode="mobile"] textarea:focus,
body[data-viewport-mode="mobile"] [tabindex]:focus,
body[data-viewport-mode="mobile"] .product-thumb:focus {
  outline: 2px solid #0b68ff;
  outline-offset: 2px;
}
```

So **any** element that is focusable and currently has `:focus` gets the blue ring. There is no distinction between:

- focus from a **tap** (user tapped a button), and  
- focus from **code** (we called `.focus()` for accessibility).

And there is no “hide ring for this element” exception. So:

1. **Whoever has focus gets the ring** – buttons, links, inputs, anything with `[tabindex]`.
2. **Focus persists** until we move it or the user taps something else (we added blur-on-canvas-tap to clear it when tapping the canvas).
3. **Programmatic focus** (panel open, modal open, toolbar toggle) is still “focus”, so the element we focus gets the same ring.

That single rule is the root cause of all the blue borders you’re seeing.

---

## 3. Why the blue is “on” `#panelContent` (and along the top)

When the products panel **opens** on mobile, we no longer focus the close button; we focus the **panel container** (`aside#panel`):

- In `setPanelExpanded` we do `panel.setAttribute('tabindex', '-1')` and `panel.focus()`.
- So the **focused element** is `aside#panel`, not `#panelContent` and not `#panelClose`.

`aside#panel` matches `[tabindex]:focus`, so it gets the 54.6 outline. The outline is drawn around the **aside**’s box. That aside wraps:

- the collapsed bar (`#panelCollapsed`), and  
- `div#panelContent` (header + “Parts” + filters + product grid).

So the outline is a rectangle around the whole panel. On screen, the **top edge** of that rectangle is the top of the panel; the main visible area below the header is `#panelContent`. So when you say the blue is “along the top of … `div#panelContent`”, you’re describing where the outline **visually** appears (the top of the panel/content area). The **DOM element** that actually has focus and the outline is still `aside#panel`; we didn’t add `tabindex` to `#panelContent`, and nothing focuses it. So:

- **Root cause for the panel:** We moved focus from the close button to the aside so the close button wouldn’t be blue. The aside has `[tabindex]`, so it gets the same 54.6 ring. The ring is drawn around the aside, which visually shows “along the top” of the panel content region.

---

## 4. Why the header collapse button and “all the buttons” stay blue

There is **no** code that explicitly focuses `#toolbarCollapseBtn` when you collapse/expand the header. In `initGlobalToolbar` we only:

- toggle classes and aria,
- update the label and the +/− symbol,
- run `applyState()`.

So the collapse button gets focus the normal way: **you tap it**. On tap, the browser gives it focus. Because of 54.6, any focused button gets the blue ring, and focus stays there until you tap something else (or we blur it, e.g. when you tap the canvas). So:

- **Root cause for the header:** The collapse button (and every other button you tap) keeps focus after the tap and therefore keeps the 54.6 ring. It’s the same rule: “whoever has focus gets the ring; we don’t blur after toolbar toggle.”

“All the buttons” behave the same: tap → focus → 54.6 ring → ring stays until focus moves or is blurred.

---

## 5. Summary table

| What you do | Who gets focus | Why it gets the blue ring |
|-------------|----------------|----------------------------|
| Open products panel | `aside#panel` (we call `panel.focus()`) | Has `tabindex="-1"` → matches `[tabindex]:focus` → 54.6 outline around the aside (looks like “along the top” of panel content). |
| Tap toolbar collapse | `#toolbarCollapseBtn` | Native focus from tap → matches `button:focus` → 54.6 ring. |
| Tap any other button | That button | Same: tap → focus → 54.6 ring, which persists. |

So:

- **Single root cause:** 54.6 shows a focus ring on **every** focused focusable element on mobile, with no exception for programmatic focus or for “container” elements like the panel.
- **Panel:** Focusing the aside instead of the close button only moved the ring from a small button to the whole panel (aside); it didn’t remove it.
- **Header / all buttons:** No special focus logic; the ring persists because focus persists after tap and 54.6 always shows the ring on the focused element.

---

## 6. What would need to change (for later, not in this doc)

To actually remove or narrow the blue ring you’d need to change the **rule** or the **focus** behaviour, for example:

- **Option A:** Don’t show the ring for programmatic focus (e.g. only for `:focus-visible`, or a data attribute set only when focus came from keyboard/tap and cleared when focus was set by script). That would require both CSS and JS.
- **Option B:** After opening panels/toolbar, blur the focused element (or move focus to something that doesn’t match the 54.6 selectors). That can make the ring go away but may conflict with a11y (e.g. focus trap, “focus inside dialog”).
- **Option C:** Remove or narrow 54.6 (e.g. only `:focus-visible`) and accept that on some mobile browsers tap might not show a ring, or add a different tap-only indicator.

This file is investigation only; no code changes were made.
