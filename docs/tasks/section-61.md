## 61. Technician job creation, labour default, and Create New Job flow (ServiceM8)

*Context: Prepare for pulling bonus/commission data from ServiceM8. Restrict technicians to Create New Job only (no Add to Job); add a mandatory post–Create New Job pop-up for "doing it now" vs "office to schedule" with optional co-seller; set default labour cost to $33 and restrict technicians to quantity-only editing; adjust labour stepper to 0.25 increments and show minutes when under one hour. All changes must preserve existing functionality for editor and admin roles; no implementation in this section—task list only.*

**Scope:** Permissions and UI changes apply on both mobile and desktop unless a task states otherwise. Do not harm existing Add to Job or Create New Job behaviour for non-technician roles.

---

### Technician permissions (Create New Job only)

- [x] **61.1** **Technician: Create New Job only (no Add to Job).** For users with role `technician`, on both mobile and desktop: hide or disable the "Add to Job" flow (e.g. job number lookup and "Add to current Job" in the confirm overlay). Technicians may only use "Create New Job" (or equivalent). Editor and admin roles retain full access to both Add to Job and Create New Job. Wire permission checks so that the job confirmation overlay and quote footer ServiceM8 actions respect role; document where the permission is enforced (e.g. frontend only or backend + frontend). Regression: editor/admin can still Add to Job and Create New Job; technician cannot Add to Job. **Implemented:** Frontend-only. `isTechnicianRole()` in app.js; quote section title/button set to "Create new job" / "Create New Job" for technician in `syncQuoteServicem8Section`; confirm overlay hides and disables "Add to Job #…" for technician in `runAddToJobLookupAndConfirm`; initial focus and registered modal focus use Create New when technician.

---

### Mandatory pop-up after Create New Job (doing it now vs office schedule)

- [x] **61.2** **Mandatory pop-up: "Are you doing it now?".** After a technician clicks the action that starts Create New Job (e.g. "Create New Job Instead" or the primary Create New Job entry point), show a **mandatory** pop-up before the create-new-job API is called. Pop-up copy: ask clearly "Are you doing it now?" with two button options: (1) **"Yes, doing it now"** — indicates the technician is both seller and executor (they will do the work now). (2) **"No, I can't do it now — please get the office to schedule"** — indicates seller only (they sold it; office will schedule execution). Buttons must be easy to understand and map to seller-only vs seller/executor for downstream bonus/ledger (e.g. for future job_personnel or ServiceM8). Implement so the Create New Job request (and any follow-up) proceeds only after the user selects one option; do not allow dismissing without a choice. Desktop and mobile. **Implemented:** Dedicated modal `#doingItNowModal` (index.html), `showDoingItNowModal(triggerEl)` in app.js returns Promise&lt;boolean&gt; (true = yes, false = no); registered with closeOnEscape/closeOnBackdrop false; `handleCreateNew` awaits it when `isTechnicianRole()` before building body and calling create-new-job API. Editor/admin unchanged.

- [x] **61.3** **Co-seller dropdown in mandatory pop-up.** In the same mandatory pop-up (61.2), add a dropdown that lists all other technicians (e.g. from profiles or staff list, excluding the current user). Purpose: allow the creating technician to optionally select a co-seller who should share in the seller split for this job. Dropdown label and placeholder should be clear (e.g. "Share seller credit with (optional)"); selection is optional. Data source for the list (e.g. `public.profiles` with role technician, or ServiceM8 staff) to be decided at implementation; ensure we do not break existing functionality. Desktop and mobile. **Implemented:** Backend `GET /api/technicians` (role technician from profiles; callable by technician/editor/admin); dropdown in `#doingItNowModal` with label "Share seller credit with (optional)", options from API excluding current user; `showDoingItNowModal` returns `{ doingItNow, coSellerUserId }`; selection stored in overlay dataset for future job_personnel.

---

### Labour default and technician editing restrictions

- [x] **61.4** **Default labour cost $33; technicians cannot edit labour cost.** Set the default labour cost (e.g. REP-LAB unit price or labour row default) to **$33** (ex-GST or as per company convention). For users with role `technician`: labour **cost** (rate/unit price) must not be editable—show as read-only or hide the control. Technicians may still edit **quantity** (hours) only. Editor and admin retain full edit on both cost and quantity. Apply wherever labour is edited (quote modal labour row, mobile labour editor, etc.). Do not change behaviour for non-technician roles.

---

### Labour hours stepper: 0.25 increments and minutes display

- [x] **61.5** **Labour stepper: 0.25 increments.** Change the labour hours stepper (or equivalent +/- controls) so that increments are **0.25** (e.g. 0.25, 0.5, 0.75, 1.0) instead of the current 0.5. Apply on both desktop and mobile where labour quantity is adjusted via stepper.

- [x] **61.6** **Show minutes when total hours &lt; 1.** When total labour hours are under one hour, display the value as **minutes** where one full hour = 60 minutes (e.g. 0.25 → "15 min", 0.5 → "30 min", 0.75 → "45 min"). When total is one hour or more, show hours (e.g. "1 hr", "1.25 hr" or equivalent). Apply in the same places as the labour stepper (desktop and mobile). Ensures clarity for short-duration jobs.

---

### Regression and safety

- [x] **61.7** **Regression and role safety.** After implementing 61.1–61.6: verify editor and admin can still Add to Job and Create New Job; technician can only Create New Job; mandatory pop-up does not appear for editor/admin (or is skipped when not technician); labour default and stepper apply consistently; no existing quote or ServiceM8 flows broken. Document any backend or permission changes in BACKEND_DATABASE or deployment docs if needed.

---

### Confirm Job overlay button wiring (regression)

- [x] **61.8** **Confirm Job Details overlay: Add to Job / Create New Job buttons.** Ensure both buttons in the Confirm Job Details popup (`#jobConfirmAddBtn`, `#jobConfirmCreateNew`) trigger the loading wheel and the correct API calls (add-to-job, create-new-job). If wiring was broken (listeners not attached or clicks not reaching buttons), fix init order, z-index/pointer-events, or early returns in `handleConfirm`/`handleCreateNew` so loading state and fetch always run on click. Desktop and mobile; Railway deploy must remain successful. See `docs/plans/PLAN_CONFIRM_JOB_OVERLAY_BUTTONS.md`.

---

*For the index and uncompleted table, see TASK_LIST.md. Implementation order: 61.1 (permissions) first; then 61.2–61.3 (pop-up); then 61.4–61.6 (labour); 61.7 (regression); 61.8 (confirm overlay buttons) last.*
