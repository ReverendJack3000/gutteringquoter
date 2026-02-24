# Context prompt: Desktop user management (invite & remove users)

**Use this prompt at the start of your next chat to restore context and continue work.**

---

Copy and paste the following (250–400 words) into the new chat:

---

**Project:** Quote App (Repair Blueprint MVP) – single codebase, desktop + mobile (adaptive layout). Deployed on Railway; all changes must remain deploy-safe. Task list: **TASK_LIST.md** (index + “Where to look”); section files in **docs/tasks/** (e.g. Sections 35–48 → **docs/tasks/sections-35-48.md**). Mark tasks [x] in the section file when done; update the uncompleted table in TASK_LIST.md if a section is fully complete.

**Goal for this session:** Add **desktop-only** user management: **invite users** (by email, optional default role) and **remove users** from the **User Permissions** page. No mobile UI changes. Follow the implementation plan so we avoid regressions and assumptions.

**Implementation plan (mandatory):** **docs/plans/2026-02-22-desktop-user-management-invite-remove.md** – read it first. It defines current state (with line refs), invite flow (UI + backend POST + Supabase `auth.admin.invite_user_by_email`), remove flow (UI per-row + confirm + backend DELETE + Supabase `auth.admin.delete_user`), guards (no self-remove, optional last-admin guard), regression checklist, and key file reference. Do not assume behaviour; verify against the codebase using the plan’s refs.

**Key files and lines (for quick restore):**  
- **User Permissions view HTML:** **frontend/index.html** L557–597 (`#view-user-permissions`, header, search, table `#userPermissionsTableBody`).  
- **Frontend state and logic:** **frontend/app.js** – `userPermissionsState` L195–204; `renderUserPermissionsList` L12241–12317; `fetchUserPermissions` L12320–12380; `saveUserPermissionRole` L12383–12441; `initUserPermissionsView` L12443–12462.  
- **Backend admin API:** **backend/main.py** – GET list L420–448 (`api_admin_user_permissions`), PATCH role L451+ (`api_update_admin_user_permission`); helpers L148–184 (`_list_auth_users_via_admin_api`, `_load_profile_roles`).  
- **Desktop admin gate:** **frontend/app.js** L1430–1431 `canAccessDesktopAdminUi()`; backend `require_role(["admin"])`.  
- **Navigation to view:** Profile menu → User Permissions uses `switchView('view-user-permissions')` (app.js L9672, L13143–13145); ensure no regressions.

**Rules:** Use **.cursor/rules/task-list-completion.mdc** for updating tasks. For creative/feature work, use the **brainstorming** rule (plan before code). Branch: create **feature/desktop-user-invite-remove** from main; when done, merge to main and update TASK_LIST. All changes **desktop-only**; mobile production UI unchanged; Railway deployment must still succeed.

Please read the plan document, then implement invite and remove users on the User Permissions page per the plan, and tick off the regression checklist. Do not add mobile behaviour or new env vars unless the plan specifies them.
