# ServiceM8 API reference (for bonus logic)

Short reference for “what we can pull” from the ServiceM8 API for Section 59 (technician bonus, period/ledger, job performance). No code changes in this doc.

**Official API reference:** [https://developer.servicem8.com/reference/listjobs](https://developer.servicem8.com/reference/listjobs) (use the sidebar for Jobs, Job Activities, Job Payments, Job Materials, Staff Members). Full response field lists are available via the “Try It!” panels when logged in.

**Base URL:** `https://api.servicem8.com`  
**Auth:** OAuth 2.0; see [ServiceM8 authentication](https://developer.servicem8.com/docs/authentication). Our app uses Bearer token in `Authorization` header (see `backend/app/servicem8.py`). We do not move from OAuth in the app; an API key (`SERVICEM8_API_KEY`) is used only for local dev/testing. All such scripts live in **`scripts/servicem8-api-key-local/`**; we never rewrite project files for them. See TASK_LIST.md locked decisions and `.cursor/rules/servicem8-auth.mdc`.

---

## 1. Jobs

| Endpoint | Method | URL | Scope |
|----------|--------|-----|--------|
| List all Jobs | GET | `/api_1.0/job.json` | `read_jobs` |
| Create a new Job | POST | `/api_1.0/job.json` | (create_jobs) |
| Retrieve a Job | GET | `/api_1.0/job.json` with `$filter` | `read_jobs` |

**Filtering:** Use `$filter=uuid eq 'VALUE'` or `$filter=generated_job_id eq 'VALUE'` (value in single quotes). We use this in `fetch_job_by_uuid` and `fetch_job_by_generated_id` (`backend/app/servicem8.py`). For list-by-status: `$filter=status eq 'Completed'` (and `'Quote'`, `'Work Order'` per [ServiceM8 filtering](https://developer.servicem8.com/docs/filtering)); only `and` is supported (no `or`), so “Completed or Invoiced” requires two requests and merge.

**Response fields we use today:**

| Field | Use |
|-------|-----|
| `uuid` | Job UUID; stable identifier for API lookups and diagram link. |
| `generated_job_id` | Job number (e.g. displayed as “Job #123”); returned after create; used for diagram stamp and display. |
| `job_address` | Job location; we copy when creating a new job from an existing one. |
| `total_invoice_amount` | Invoiced/billed amount for the job. **Note:** Reported type can be string or number; normalise in code. Used for bonus revenue (e.g. `job_performance.invoiced_revenue_exc_gst`). |
| `company_uuid` | Client/customer; required when creating a new job (we copy from original). |
| `status` | Job status (e.g. Quote, In Progress, Complete). For bonus we care when job is complete/invoiced. |
| `job_description` | Description text; we set when creating a new job. |
| `billing_address`, `lat`, `lng`, `geo_is_valid`, `category_uuid`, `badges` | Optional fields we copy when creating a new job. |

**For bonus logic:** `status`, `total_invoice_amount` (and whether it's ex/incl GST). **Note:** ServiceM8 does **not** expose a dedicated "estimated labour" or "quoted hours" field on the job; labour is treated as a material in ServiceM8 (same as our REP-LAB line item). We source quoted labour from our own quote persistence (Section 59.3 Option A). See TROUBLESHOOTING.md § "ServiceM8: no estimated labour field".

---

## 2. Job Activities (schedule / time)

| Endpoint | Method | URL | Scope |
|----------|--------|-----|--------|
| List all Job Activities | GET | `/api_1.0/jobactivity.json` | `read_schedule` |

**Filtering:** Use `$filter=job_uuid eq 'VALUE'` to get activities for one job.

**Terminology (REST overview):**

- **Scheduled booking** = JobActivity with `activity_was_scheduled == 1`
- **Recorded time** (check-in to job) = JobActivity with `activity_was_scheduled == 0`

**Fields relevant for bonus:**

| Field | Purpose |
|-------|--------|
| `job_uuid` | Link to job. |
| `activity_was_scheduled` | 1 = scheduled booking, 0 = recorded time. |
| Staff/assignee | Assignee is typically a staff UUID or similar; confirm field name in Try It! (e.g. `staff_uuid` / `assigned_staff_uuid`). |
| Duration / start time | For “actual” labour (onsite, travel/shopping) we need start/duration or equivalent. **Known limitation:** Some timing details (e.g. booking duration, exact start) may not be fully exposed; “job is scheduled until stamp” is documented. Prefer inspecting the actual response for the fields available. |

Use this endpoint to infer who was scheduled or recorded on a job and, where available, time spent (for `job_personnel` onsite/travel and estimation accuracy).

**Response fields (for sync):** Assignee is **`staff_uuid`** (translate via staff.json → email → auth.users.id). Duration/start/end field names to be confirmed on first successful call; filter out zero-duration activity stubs before aggregating (see Section 59.8 plan).

---

## 3. Job Payments

| Endpoint | Method | URL | Scope |
|----------|--------|-----|--------|
| List all Job Payments | GET | `/api_1.0/jobpayment.json` | `read_job_payments` |
| Retrieve a Job Payment | GET | (per payment) | `read_job_payments` |

**Filtering:** Filter by `job_uuid` to get payments for a single job.

**For bonus:** Sum or select the appropriate payment(s) to derive **invoice/billed amount** for the job (e.g. for `invoiced_revenue_exc_gst`). Confirm field names (amount, tax, status) via Try It! and whether job-level `total_invoice_amount` is sufficient or we need to aggregate payments.

---

## 4. Job Materials

| Endpoint | Method | URL | Scope |
|----------|--------|-----|--------|
| List all Job Materials | GET | `/api_1.0/jobmaterial.json` | `read_job_materials` |
| Create a Job Material | POST | `/api_1.0/jobmaterial.json` | `manage_job_materials` |

**Filtering:** Use `$filter=job_uuid eq 'VALUE'` to get line items for one job.

**Terminology:** JobMaterial = line items on quote/invoice (REST overview).

**Fields we use when creating:** `job_uuid`, `material_uuid`, `name`, `quantity`, `price`, `cost`, `displayed_amount`, `displayed_cost`.

**For bonus:** List Job Materials for a job and sum **cost** (and optionally **price**) to get **materials cost** for that job (e.g. `job_performance.materials_cost`). Confirm exact field names (cost vs displayed_cost, tax handling) via Try It!. Useful for “Missed materials” comparison if we store quoted items in `public.quotes.items`.

---

## 5. Staff Members (for technician_id mapping — 59.2)

| Endpoint | Method | URL | Scope |
|----------|--------|-----|--------|
| List all Staff Members | GET | `/api_1.0/staff.json` | `read_staff` |
| Retrieve a Staff Member | GET | (per staff) | `read_staff` |

**Response shape (from live API):** Each staff object includes:

| Field | Type / notes |
|-------|----------------|
| `uuid` | string (UUID) — stable ServiceM8 staff id |
| `first` | string — first name |
| `last` | string — last name |
| `email` | string — may be empty for some staff |
| `active` | 0 or 1 |
| `mobile` | string |
| `hide_from_schedule` | 0 or 1 |
| `edit_date` | datetime string |
| `color` | hex string (e.g. EE7866) |
| `job_title` | string (e.g. "COA", "Contractor -Senior Technician") |
| `labour_material_uuid` | string (UUID) or empty |
| `security_role_uuid` | string (UUID) |
| `navigating_to_job_uuid`, `navigating_timestamp`, `navigating_expiry_timestamp` | navigation state |
| `status_message`, `status_message_timestamp` | status |
| `lat`, `lng`, `geo_timestamp` | location |
| `custom_icon_url`, `can_receive_push_notification` | optional |

**Mapping to technician_id:** See BACKEND_DATABASE.md “Staff → technician_id mapping (Section 59.2)”. We derive `technician_id` (auth.users.id) by matching staff `email` to auth.users; no mapping table required for initial implementation.

---

## 6. OAuth scopes we use

Current `DEFAULT_SCOPES` in `backend/app/servicem8.py` include:

- `read_jobs`, `read_job_materials`, `read_job_payments`, `read_job_contacts`, `read_job_notes`, `read_job_categories`
- `manage_job_materials`, `manage_job_contacts`, `publish_job_notes`
- `read_schedule`, `manage_schedule`
- `read_staff`
- `create_jobs`
- `manage_attachments`, `read_forms`, `read_inbox`, `read_messages`, `read_inventory`, `manage_badges`, `read_customers`, `vendor_email`

So we already have the scopes needed to list Jobs, Job Activities, Job Payments, Job Materials, and Staff. No new scopes required for the bonus “read” side; any write to job payments would need `manage_job_payments` if we add it later.

---

## 7. Summary: what we can pull for bonus logic

| Data | Source | Notes |
|------|--------|--------|
| Job uuid, generated_job_id, status | GET job.json (filter by uuid or generated_job_id) | In use. |
| Invoice/billed amount | Job `total_invoice_amount` and/or Job Payments list | Confirm ex-GST and field type (string/number). |
| Materials cost | GET jobmaterial.json filtered by job_uuid; sum cost | Confirm field names. |
| Labour (quoted) | Not on job object; labour is a material in ServiceM8 | Use our quoted_labor_minutes from quote persistence (59.3 Option A). See TROUBLESHOOTING.md. |
| Activity assignee & duration | GET jobactivity.json filtered by job_uuid | Assignee field name TBD; duration/start has known API limitations. |
| Staff list for technician mapping | GET staff.json | Staff response shape documented; staff → technician_id mapping in BACKEND_DATABASE.md (59.2). |

Job Activities, Job Payments, and Job Materials: confirm exact field names via Try It! or live calls when implementing sync.
