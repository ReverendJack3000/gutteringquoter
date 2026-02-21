# Task list refactor for quicker context restoration

**Goal:** Reduce how much of the task list is loaded each chat (e.g. ~100–300 lines instead of ~1500) while keeping a single source of truth and existing workflows.

---

## Why it helps

- **Current:** One 1,470-line file. Every chat that needs “what’s the current branch / what’s uncompleted / what’s in section 54?” tends to pull in the whole file.
- **After refactor:** A short **index** (~80–120 lines) gives branch, uncompleted table, locked decisions, and section map. Full section content lives in **section files**. New chats load the index; only open the section file(s) for the work at hand (e.g. section 54).

---

## Proposed structure

### 1. Keep one entry point (backward‑friendly)

- **`TASK_LIST.md`** at repo root stays the **index** and remains the named “task list” so existing refs (“update TASK_LIST.md”) still make sense.
- It is shortened to:
  - Title + single‑source-of‑truth statement (task list = this file + `docs/tasks/*.md`).
  - **Current working branch** (unchanged).
  - **Uncompleted tasks table** (unchanged).
  - **Locked decisions table** (unchanged).
  - **Section map:** list of section numbers/ranges with links to section files, e.g.  
    `54. Mobile app → [docs/tasks/section-54.md](docs/tasks/section-54.md)`  
  - Optional: 1–2 line “How to update” for agents (mark `[x]` in the relevant section file; update index uncompleted table when a section’s tasks change).

No full task bullets in the index; those move to section files.

### 2. Section files under `docs/tasks/`

- One file per **major section** that has task bullets: e.g. `section-01.md` … `section-57.md` (only create files for sections that exist).
- **Alternative (fewer files):** group small sections into ranges, e.g. `sections-01-09.md`, `sections-10-34.md`, `section-54.md`, `section-55.md`, `sections-56-57.md`, so the number of files stays small and section 54 (the long one) is isolated.
- Each file contains the **exact current content** for that section (heading, intro, all `- [ ]` / `- [x]` lines). No duplicate uncompleted table inside section files; that stays only in the index.

### 3. Single source of truth

- **Rule wording:** “All task tracking lives in `TASK_LIST.md` (index) and the section files in `docs/tasks/`. Do not maintain a separate or duplicate task list elsewhere.”
- **Completion:** Marking a task done = edit the **section file** for that section (e.g. `docs/tasks/section-54.md`), change `[ ]` to `[x]`. If a task is removed from the uncompleted table, update the **index** (top of `TASK_LIST.md`).

---

## What to update if you refactor

1. **`.cursor/rules/task-list-completion.mdc`**  
   - Point to “TASK_LIST.md and docs/tasks/ section files”; say “mark completion in the section file for that section; update the uncompleted table in TASK_LIST.md when needed.”

2. **`.cursor/rules/github-rule.mdc`**  
   - Keep “update the top of TASK_LIST.md” (branch block + uncompleted table live there).

3. **`.cursor/rules/brainstorming.mdc`**  
   - “Task source: review TASK_LIST.md (and the relevant docs/tasks/section-*.md for the section you’re working on).”

4. **Plans / docs**  
   - Any doc that says “update TASK_LIST.md” can stay as-is (you’re still updating the task list; the index is part of it). Optionally add “and the section file for that section” where you want to be explicit.

5. **No code or script changes**  
   - Nothing in the app or backend references TASK_LIST.md.

---

## Suggested section grouping (to avoid 50+ files)

| File | Sections | Approx. lines |
|------|----------|----------------|
| `TASK_LIST.md` (index) | — | ~90 |
| `docs/tasks/sections-01-09.md` | 1–9 | ~100 |
| `docs/tasks/sections-10-27.md` | 10–27 | ~420 |
| `docs/tasks/sections-28-34.md` | 28–34 | ~120 |
| `docs/tasks/sections-35-48.md` | 35–48 | ~320 |
| `docs/tasks/sections-49-53.md` | 49–53 | ~200 |
| `docs/tasks/section-54.md` | 54 | ~215 |
| `docs/tasks/section-55.md` | 55 | ~30 |
| `docs/tasks/sections-56-57.md` | 56–57 | ~25 |

So “working on 54” = load index + section-54.md ≈ 90 + 215 ≈ 305 lines instead of 1,470.

---

## Summary

- **Yes**, refactoring the task list into an index + section files under a folder makes sense for **quicker, more efficient context restoration** without reading 1,500 lines every time.
- Keep **`TASK_LIST.md`** at root as the **index** (branch, uncompleted table, locked decisions, section map).
- Put full section content in **`docs/tasks/section-*.md`** (or grouped as above).
- Update the **task-list-completion** (and optionally github + brainstorming) rules so the “single source of truth” is the index + section files and agents know where to mark completion.

If you want to proceed, next step is to split the current `TASK_LIST.md` into the index and the section files and then update the three cursor rules.
