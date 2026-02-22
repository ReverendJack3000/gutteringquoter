## 33. Save/Load project files

*Context: Allow users to persist and reload full diagram/blueprint state as project files.*

- [x] **33.1** Ability to save diagrams/blueprints as project files (e.g. export to .json or save to backend; load from file or backend to restore blueprint + elements + view state).
- [x] **33.2** When loading from a project (saved diagram), load the **blueprint image** as well; currently only elements are restored and the blueprint image is not. Enhance save/load so the blueprint image is persisted and restored.
- [x] **33.3** Fix blueprint not persisting on save: rollback diagram row when Storage upload fails (no half-saved diagram); send blueprintImageUrl when canvas export fails (CORS/tainted); surface upload error in 500 response; ensure SUPABASE_SERVICE_ROLE_KEY is set on Railway for Storage uploads (see TROUBLESHOOTING).
- [ ] **33.4** Signed-in server autosave trigger + threshold rules (desktop/mobile).
- [ ] **33.5** One hidden rolling autosave draft (POST/PATCH reuse).
- [ ] **33.6** Startup restore/discard prompt with stale-prompt guard.
- [ ] **33.7** Immediate autosave delete when below threshold.
- [ ] **33.8** Hide autosave draft from saved-diagrams UIs.
- [ ] **33.9** Fix shared auth-header scope so job-number stamped autosave works.
- [ ] **33.10** QA matrix + Railway safety verification.

---
