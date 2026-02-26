# Context restore — Quick Quote entry visibility (desktop + mobile)

**Quote App:** Single codebase, desktop + mobile via `body[data-viewport-mode="desktop"]` / `"mobile"`. Deployed on Railway. Task source of truth: **TASK_LIST.md** (branch, uncompleted table, “Where to look”); mark done in **docs/tasks/section-XX.md** and update the index when a section is complete. Rules: **.cursor/rules/task-list-completion.mdc**, **.cursor/rules/brainstorming.mdc** (plan before creative work), **.cursor/rules/github-rule.mdc** (one feature branch, update TASK_LIST branch header).

**Next logical task:** Ensure the **Quick Quote** canvas entry (`#quickQuoterEntry` > `#quickQuoterEntryBtn`) **disappears from view once an image is uploaded on both desktop and mobile**. Currently the JS in `updatePlaceholderVisibility()` is viewport-agnostic (hides when `state.blueprintImage` exists), but we must verify it behaves correctly on desktop as well as mobile and fix any gap (e.g. `[hidden]` styling, call sites, or timing).

**Key files and line references:**

- **frontend/app.js**  
  - `updatePlaceholderVisibility()` at **6467–6481**: gets `#quickQuoterEntry`; if `state.blueprintImage` sets `hidden` on it and calls `closeQuickQuoterModal`, else removes `hidden`. No viewport branch.  
  - Call sites: **5164** (after blueprint load), **7208, 7221, 7263, 7295** (undo/redo), **9436, 9569, 9607, 9636, 9642, 9648** (canvas/upload paths), **9850, 10868, 13353**.

- **frontend/index.html**  
  - Quick Quote entry wrapper and button: **251–270**. Structure: `div.quick-quoter-entry#quickQuoterEntry` > `button.placeholder-card.quick-quoter-entry-card#quickQuoterEntryBtn` (aria-label "Open Quick Quote", aria-controls quickQuoterModal). No `hidden` in initial markup.

- **frontend/styles.css**  
  - Base placeholder/Quick Quote: **.quick-quoter-entry** ~**1787–1859** (`.placeholder-card`, `.quick-quoter-entry .placeholder-card`).  
  - Mobile Quick Quote block: **~2730–2776** (62.16 blue button, 92% width, 44px).  
  - Desktop Quick Quote block: **~2803–2848** (62.17 blue button, width 100%, max-width 500px, 44px).  
  - **No rule** targets `#quickQuoterEntry[hidden]` or `.quick-quoter-entry[hidden]`; reliance is on the HTML5 `[hidden]` attribute (UA: `display: none`). If desktop or a wrapper doesn’t hide, consider adding an explicit `[hidden]` rule for the entry or its parent.

- **docs/tasks/section-62.md**  
  - Section 62 checklist: **62.9** (visibility follows blueprint), **62.11** (desktop visibility parity), **62.15** (verification/QA). Next work may warrant a new sub-task or verification under 62.15.

- **TASK_LIST.md**  
  - Uncompleted table: Section **62** row (~**99**): 62.15, 62.16, 62.17. Branch: **main** (lines **56–59**). “Where to look”: Section 62 → **docs/tasks/section-62.md** (lines **31, 51**).

- **e2e/run.js**  
  - Desktop Quick Quoter: **620–629** (entry visible before upload), **632** (click `#quickQuoterEntryBtn`), **762–772** (entry hidden after upload). Use for regression after visibility fix.

**Scope:** Ensure Quick Quote entry is hidden when a blueprint exists on **both** desktop and mobile (upload and load paths). Prefer minimal change: confirm all code paths that set `state.blueprintImage` call `updatePlaceholderVisibility()`, and that `[hidden]` on `#quickQuoterEntry` is respected in both viewports (add CSS if needed). Desktop must remain stable; mobile behavior must not regress. Railway-safe (frontend-only).
