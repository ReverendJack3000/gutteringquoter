# Plan: Super admin label not displaying (User Permissions)

**Date:** 2026-02-22  
**Scope:** Desktop-only User Permissions view. No mobile UI changes. Railway-safe.

---

## 1. Goal

The User Permissions page should show the label **"Super admin"** (plain text, no dropdown) for the user whose email matches `SUPER_ADMIN_EMAIL`. The Remove button is already correctly hidden for that user. Currently the label does not display; the role column shows the normal role dropdown instead.

**Required behaviour:**

- Show plain text **"Super admin"** for the super admin row (no role dropdown).
- Styling: `.permissions-role-super-admin` → `font-weight: 600`, `color: #6b7280` (already in `styles.css`).
- Accessibility: `aria-label="Super admin (cannot be changed)"` (already set in JS when the span is created).

---

## 2. Root cause (verified in code)

**Backend** correctly returns `is_super_admin` for each user:

- `backend/main.py`: `GET /api/admin/user-permissions` builds the list via `_serialize_auth_user_for_permissions(auth_user, role)` (L461–483).
- `_serialize_auth_user_for_permissions` (L131–140) includes `"is_super_admin": _is_super_admin(auth_user)`.
- So the API response shape is `{ users: [ { user_id, email, role, is_super_admin, created_at, last_sign_in_at }, ... ] }`.

**Frontend** drops `is_super_admin` when storing the response:

- `frontend/app.js` – `fetchUserPermissions()` (L12460–12523). After `resp.json()`, it maps `payload.users` into state (L12494–12502):

```javascript
userPermissionsState.users = users
  .map((user) => ({
    user_id: String(user?.user_id || '').trim(),
    email: String(user?.email || '').trim(),
    role: normalizeAppRole(user?.role),
    created_at: user?.created_at || null,
    last_sign_in_at: user?.last_sign_in_at || null,
  }))
  .filter((user) => user.user_id);
```

- **`is_super_admin` is not included in this map.** So every stored user object lacks `is_super_admin`.
- `renderUserPermissionsList()` (L12352–12458) reads `const isSuperAdmin = !!user?.is_super_admin;` (L12367). Because the property was never stored, it is always `undefined` → `false`. The branch that creates the "Super admin" span (L12382–12388) is never taken; the role dropdown is always shown instead.

**Conclusion:** The only fix required is in the frontend: preserve `is_super_admin` when mapping the API response into `userPermissionsState.users`.

---

## 3. Implementation plan

### 3.1 Frontend – preserve `is_super_admin` in state

**File:** `frontend/app.js`  
**Location:** `fetchUserPermissions`, the `.map()` that builds `userPermissionsState.users` (approx. L12494–12502).

**Change:** Add `is_super_admin` to the mapped user object so it is available in `renderUserPermissionsList`:

- In the object passed to `.map()`, add: `is_super_admin: !!user?.is_super_admin`,
- No other fields or logic changes.

After this change, `renderUserPermissionsList` will receive `user.is_super_admin === true` for the super admin row and will render the existing span (class `permissions-role-super-admin`, text "Super admin", aria-label). No changes are needed to `renderUserPermissionsList`, HTML, or CSS; the existing markup and styles already match the spec.

### 3.2 Backend

No change. The list endpoint already returns `is_super_admin` per user.

### 3.3 Environment / config

- For the label to appear, **`SUPER_ADMIN_EMAIL`** must be set in the backend environment (e.g. Railway or `backend/.env`) and the listed user’s email must match (case-insensitive). If it is not set, no user is treated as super admin and the label will never show (expected).

---

## 4. Verification

1. **Local:** Set `SUPER_ADMIN_EMAIL` in `backend/.env` to an admin user’s email. Ensure that user has `role = 'admin'` in `public.profiles` (see TROUBLESHOOTING.md). Start server (`./scripts/run-server.sh`), sign in as that admin, open profile → User Permissions. The row for that email should show **"Super admin"** (bold, grey) in the Role column and no role dropdown; no Save button; no Remove button.
2. **Other users:** Other rows should still show the role dropdown, Save, and Remove (when not self) as today.
3. **Desktop vs mobile:** User Permissions is desktop-only (`canAccessDesktopAdminUi()`); no mobile UI impact.
4. **Railway:** No new env vars; existing `SUPER_ADMIN_EMAIL` optional. Deploy unchanged.

---

## 5. Edge cases

- **`SUPER_ADMIN_EMAIL` unset:** Backend returns `is_super_admin: false` for everyone; frontend will show dropdowns for all (current behaviour). No change.
- **Invite response:** Invite endpoint also returns a user object via `_serialize_auth_user_for_permissions`; if the frontend ever merges that into `userPermissionsState.users`, it should also preserve `is_super_admin` for consistency. Current invite flow does not add the invited user into the list with that shape; no change required for this fix.

---

## 6. Files to touch

| File | Change |
|------|--------|
| `frontend/app.js` | In `fetchUserPermissions`, add `is_super_admin: !!user?.is_super_admin` to the user object in the `.map()` over `payload.users`. |

No changes to `frontend/index.html`, `frontend/styles.css`, or backend.
