## 49. ServiceM8 OAuth 2.0 Auth setup

*Context: Enable Quote App as a ServiceM8 Public Application so users can connect their ServiceM8 accounts and sync quotes/jobs. ServiceM8 uses OAuth 2.0 (authorization code grant) for public apps. See [developer.servicem8.com/docs/authentication](https://developer.servicem8.com/docs/authentication). Production base URL (Railway) will be used for OAuth redirect_uri. Deployments must remain compatible with Railway.*

**Partner and app registration**

- [x] **49.1** Register as a ServiceM8 Development Partner at [servicem8.com/developer-registration](https://www.servicem8.com/developer-registration).
- [x] **49.2** Create a Public Application in the ServiceM8 developer account (Store Connect).
- [x] **49.3** Obtain App ID and App Secret from Store Connect; document where they are shown (Store Connect page).

**Store Connect configuration**

- [x] **49.4** Configure Return URL in Store Connect: set to `https://{RAILWAY_APP_URL}/api/servicem8/oauth/callback` (or equivalent path) so it matches the OAuth redirect_uri host.
- [x] **49.5** Ensure Return URL host matches the Railway production URL exactly (e.g. `https://quote-app-production-7897.up.railway.app`).

**Backend OAuth flow – authorize**

- [x] **49.6** Add backend route (e.g. GET `/api/servicem8/oauth/authorize`) that redirects the user to `https://go.servicem8.com/oauth/authorize` with query params: `response_type=code`, `client_id` (App ID), `scope` (space-separated), `redirect_uri` (must match Store Connect Return URL).
- [x] **49.7** Add CSRF protection: generate and store a `state` value (e.g. in session or signed cookie); include `state` in the authorize redirect; validate on callback.
- [x] **49.8** Define required scopes (e.g. `read_jobs`, `manage_jobs`, `read_job_materials`, `manage_job_materials` for quote sync); document scope rationale in docs.

**Backend OAuth flow – token exchange**

- [x] **49.9** Add OAuth callback route (e.g. GET `/api/servicem8/oauth/callback`): receive `code` and `state` from ServiceM8; validate `state` (CSRF); exchange `code` for tokens.
- [x] **49.10** Implement token exchange: POST to `https://go.servicem8.com/oauth/access_token` with `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`.
- [x] **49.11** Store access token and refresh token securely (e.g. per-user in Supabase; encrypted; never expose App Secret or refresh token to frontend).
- [x] **49.12** Handle token response: parse `access_token`, `expires_in` (3600 s), `refresh_token`, `scope`; handle errors (invalid code, revoked, etc.).

**Backend OAuth flow – token refresh**

- [x] **49.13** Implement refresh: before expiry, POST to `https://go.servicem8.com/oauth/access_token` with `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`.
- [x] **49.14** Update stored tokens on successful refresh; handle refresh failures (prompt user to re-authorize).

**Environment and Railway**

- [x] **49.15** Add `SERVICEM8_APP_ID` and `SERVICEM8_APP_SECRET` to backend `.env.example` (with placeholder values); document in `docs/RAILWAY_DEPLOYMENT.md`.
- [x] **49.16** Add `SERVICEM8_APP_ID` and `SERVICEM8_APP_SECRET` to Railway project variables; never commit secrets.
- [x] **49.17** Ensure OAuth callback URL uses `$PORT` and `0.0.0.0` binding (Procfile) so Railway routes correctly; verify HTTPS in production.

**Security**

- [x] **49.18** Keep App Secret server-side only; never send to frontend or log.
- [x] **49.19** Validate `redirect_uri` on callback matches the configured Return URL exactly.

**Integration with Quote flow**

- [x] **49.20** Link ServiceM8 OAuth connection to the authenticated user (e.g. Supabase user id → stored ServiceM8 tokens); provide UI for "Connect ServiceM8" and "Disconnect".
- [x] **49.20.1** Add to Job confirmation flow: Enter Job # → GET job by generated_job_id → show confirmation modal with job_address, total_invoice_amount, before→after amounts → "Add to current Job" / "Make new job" (no action yet). Extended ServiceM8 scopes for future manage_job_materials, create_jobs, etc.
- [x] **49.21** Use access token for API calls when user adds materials to a ServiceM8 job: POST jobmaterial and note via ServiceM8 API; wire Success/Error in Quote footer.
- [x] **49.22** Wire 22.29: Use real ServiceM8 API responses to toggle Success/Error states in the Quote footer after Add to Job.
- [ ] **49.23** Replace default material UUID (6129948b-4f79-4fc1-b611-23bbc4f9726b) with a more detailed bundle of per-product or per-profile ServiceM8 material UUIDs.
- [x] **49.24** Fix Add to Job material POST: ServiceM8 returns 400 "Provided displayed_amount is incorrect. Expected [X]". Need to send correct `displayed_amount` and/or `displayed_amount_is_tax_inclusive` per ServiceM8 jobmaterial API.
- [x] **49.24.1** Add TODO comment to material UUID line in `backend/app/servicem8.py`: "Remind us to come back to a more detailed bundle of uuids."
- [x] **49.24.2** Fix material name convention in `backend/main.py`: Change "Storm Cloud" to "Stormcloud" (lowercase 'c') so profile "stormcloud" maps to "Stormcloud repairs, labour & materials" (not "Storm Cloud repairs...").
- [x] **49.24.3** Update `add_job_material()` function signature in `backend/app/servicem8.py` to accept `displayed_amount` and `displayed_cost` parameters (both Optional[str]).
- [x] **49.24.4** Update jobmaterial payload in `add_job_material()` to include `displayed_amount` and `displayed_cost` fields when provided. Payload should include: job_uuid, material_uuid, quantity, name, price, displayed_amount, cost, displayed_cost.
- [x] **49.24.5** Update `api_servicem8_add_to_job()` in `backend/main.py` to pass `displayed_amount` (from `quote_total`) and `displayed_cost` (from `material_cost`) to `add_job_material()` call.
- [x] **49.25** Add Job Note formatting: Remove square brackets from element names; format quantities (whole numbers without decimal: 1 not 1.0); add blank line before totals; add dollar signs and "exc gst" to Total Price and Material Cost; format time used with singular/plural ("1 hour" vs "1.5 hours"). Format: `[appUserName]\n- Item Name x Qty\n- Item Name x Qty\n\nTotal Price = $[quotePrice] exc gst\n- Time used = [labourHours] hour(s)\n- Material Cost = $[materialCost] exc gst`.

**ServiceM8 job attachment full flow (2-step – required for file to appear in Job Diary)**

- [x] **49.26** Implement ServiceM8 attachment per official guide: two-step flow so the file appears in the Job Diary. Single multipart POST to attachment.json creates the record but does not attach file data; ServiceM8 requires a second request to upload the binary.
- [x] **49.26.1** Step 1 – Create attachment record: POST to `https://api.servicem8.com/api_1.0/Attachment.json` with JSON body only (no file): `related_object` (e.g. "job" or "JOB" per API), `related_object_uuid`, `attachment_name`, `file_type`, `active`. Read `x-record-uuid` from response headers to get the new attachment UUID.
- [x] **49.26.2** Step 2 – Submit file data: POST the binary to `https://api.servicem8.com/api_1.0/Attachment/{attachment_uuid}.file` with the file as multipart form field `file` (or raw body per API). This attaches the file to the record and makes it visible in the job diary.
- [x] **49.26.3** Wire `upload_job_attachment()` in `backend/app/servicem8.py` to perform step 1 then step 2; return success/error and optional response payload for logging. Keep frontend and `/api/servicem8/upload-job-attachment` contract unchanged.

*Implementation nuance (verified working):* Step 1 uses **JSON only** (no file): `Content-Type: application/json`, body `related_object: "job"` (lowercase per official “Attaching files to a Job Diary” guide), `active: true` (boolean). URL path is `Attachment.json` (capital A). Read **`x-record-uuid`** from response headers (check both `x-record-uuid` and `X-Record-Uuid`); if missing, fail with a clear error. Step 2: POST to `Attachment/{attachment_uuid}.file` with **multipart** form key `file`, value `(filename, image_bytes, "image/png")`; do not set Content-Type (let httpx set multipart boundary). The file must not be sent in step 1.

**Add New Job (Create new Job from confirm popup)**

*Pickup context:* Flow runs **after** the user has already matched a job by `generated_job_id` (job number) as we do today. The confirm job details popup shows “Add to Job #…” and “**Create New Job Instead**” (button id `jobConfirmCreateNew` in `frontend/index.html`; handler `handleCreateNew` in `frontend/app.js` in `initJobConfirmationOverlay()` — currently only hides overlay with a TODO). Backend: `backend/app/servicem8.py` has `add_job_material`, `add_job_note`, `upload_job_attachment` (2-step: create record then .file); `backend/main.py` has `POST /api/servicem8/add-to-job` and `POST /api/servicem8/upload-job-attachment`. Quote payload for add-to-job is built by `getAddToJobPayload(jobUuid)`; blueprint PNG by `getExportCanvasDataURL()`. New job flow must use **our generated UUID** for the new job (ServiceM8 often does not return the job UUID in the response header despite docs). All steps below assume we have the **original job** (from lookup) and will create one **new job** and apply materials/note/diagram to **both** where specified.

- [x] **49.27** Wire the “Create New Job Instead” button in the confirm job details popup to the new Add New Job flow: on click, run the 4 steps below (make job → add materials to new job → add note to both jobs → add diagram to both jobs) plus job contact (get contact from original job, create BILLING contact on new job). Show success/error feedback (e.g. re-use `servicem8Feedback` or similar). Frontend calls a new backend endpoint (e.g. `POST /api/servicem8/create-new-job`) that receives the same quote payload plus original job UUID and performs all steps server-side; or frontend orchestrates multiple existing/new endpoints. Ensure existing “Add to current Job” flow is unchanged.

- [x] **49.27.1** **Make Job.** POST `https://api.servicem8.com/api_1.0/job.json`. **Generate the new job UUID on our side** (e.g. UUID4) and send it as the `uuid` field so we can use it for all subsequent calls. Body: `uuid` = our generated UUID; `job_description` = dynamic string from quote form, e.g. “New job created via Jacks app for repairs …” plus full list of parts/elements used (same content as used for the job note); `status` = `"Quote"` (hard-coded). Populate from the **job already retrieved by job number** (the “original” job); if any field is missing, still proceed except **`company_uuid`** — if `company_uuid` is missing, do not create the job and display an “unmatched” or “company_uuid missing” error to the user. Fields to copy from original job into the POST body: `job_address`, `lat`, `lng`, `company_uuid`, `billing_address`, `geo_is_valid`, `category_uuid`, `badges` (and any other required fields per ServiceM8 job create API). Original job body may be provided by the frontend (from the lookup response) or re-fetched by the backend via GET job.json with `$filter=uuid eq 'ORIGINAL_JOB_UUID'`.

- [x] **49.27.2** **Add materials to new job.** Same format as the current add-to-job flow, populated from the quote table. POST `https://api.servicem8.com/api_1.0/jobmaterial.json`. **`job_uuid` must be the UUID we generated** in 49.27.1 (not from ServiceM8 response header). Payload shape and source identical to existing add-to-job (e.g. bundled line + displayed_amount/displayed_cost per 49.24).

- [x] **49.27.3** **Add note to original job and new job.** Two POSTs with **identical note content** (same format as current add-to-job note: user name, element list, totals, labour hours, material cost, etc.). One POST for the **original job’s `job_uuid`**, one for the **new job’s `job_uuid`**. Use existing `add_job_note(access_token, job_uuid, note_text)` or equivalent.

- [x] **49.27.4** **Add diagram image to original job and new job.** Two separate runs of the existing 2-step attachment flow (create attachment record, then POST file to `Attachment/{uuid}.file`), with **identical blueprint PNG** each time. First run: `related_object_uuid` = **original job UUID**. Second run: `related_object_uuid` = **new job UUID**. Re-use `upload_job_attachment()` or the same logic for both.

- [x] **49.27.5** **Job contact for new job.** (1) **Get** job contact info for the original job: `GET https://api.servicem8.com/api_1.0/jobcontact.json?$filter=job_uuid eq 'ORIGINAL_JOB_UUID'` (use the original job’s UUID in the filter). (2) **POST** to create a job contact for the new job: `POST https://api.servicem8.com/api_1.0/jobcontact.json`. Body: `job_uuid` = **new job’s UUID** (the one we generated); `type` = `"BILLING"`. Populate from the GET response and include in the POST: `first`, `last`, `phone`, `mobile`, `email` (copy from the retrieved job contact(s) as appropriate — e.g. primary or first BILLING contact). If no job contact is returned for the original job, skip creating a job contact for the new job (no POST).

*Section 49 status: Add to Job flow implemented (49.20.1, 49.21, 49.22). Job lookup and confirmation overlay working. POST jobmaterial fix complete (49.24, 49.24.1–49.24.5). Note formatting complete (49.25). Attachment: 49.26–49.26.3 two-step flow implemented and verified. Create New Job (49.27–49.27.5): create-new-job endpoint and frontend wired; create job, materials, note/diagram to both jobs, job contact. Docs: [developer.servicem8.com/docs/authentication](https://developer.servicem8.com/docs/authentication).*

---

## 50. Quote modal: Labour as table row and independent from materials

*Context: Adding Labour Hours currently changes or decreases the materials subtotal and total quote price. Labour and materials should be independent: adding labour must not affect materials price/cost. We will move labour from the dropdown section into the quote table as editable row(s), and ensure calculations keep materials and labour separate. All changes must preserve existing behaviour: labour hours must still appear in "Add note to existing job" (getAddToJobPayload, job note formatting). Deployments must continue to succeed on Railway.*

**Calculation independence**

- [x] **50.1** Ensure labour and materials are fully independent: materials subtotal is computed only from material rows (product lines); labour contributes only to labour subtotal and total. Adding or changing labour must never alter materials subtotal or material line totals. (Backend already separates them; verify and fix any frontend logic that causes materials to change when labour is updated.)

**Labour as table row(s)**

- [x] **50.2** Remove the current labour UI from below the table: the "Labour hours" input and "Labour rate" dropdown in `.quote-labour-section`. Keep labour rates available (e.g. for use in labour row rate selector).
- [x] **50.3** Add labour as a line in the quote parts table with inline editing like other rows. Position it always on the **2nd-bottom row** (immediately above the "Type or select product…" empty row). Columns: Product (bold label, e.g. "Labour"), Qty (hours), Cost/Markup/Unit Price/Total as appropriate for labour (inline editable where applicable).
- [x] **50.4** Style the labour row product cell text in **bold** font, unlike other product rows.
- [x] **50.5** Add a small clickable icon on the right of the labour row’s product column: **"+👷"** with a thin border, visible **only on hover**. On click, duplicate the labour row (insert another labour line above the empty row; new row has same structure, default hours/rate as needed).

**Preserve existing behaviour**

- [x] **50.6** Ensure **Add note to existing job** still shows labour hours: `getAddToJobPayload()` and job note formatting must derive **total labour hours** (sum of all labour row hours when 2+ labour lines) and **number of people** (number of labour rows). Job note format: "Total Time used = X hour(s)" and under it "    - People Req = N" (e.g. "People Req = 2"). Backend must accept and include `people_count` in the note.
- [x] **50.7** Update **Print** and **Copy to Clipboard** to use labour from the labour table row(s) instead of the removed `labourHoursInput` / `labourRateSelect` (hours and rate from labour row(s), labour subtotal from sum of labour row totals).

**Totals and API**

- [x] **50.8** Quote totals: materials subtotal = sum of material row totals only; labour subtotal = sum of labour row totals; total = materials subtotal + labour subtotal. Ensure `calculateAndDisplayQuote` (or equivalent) and any `/api/calculate-quote` usage send only material elements for materials; labour is applied from labour row(s) so materials response is never affected by labour.
- [ ] **50.9** After implementation: smoke-test quote modal (add materials, add/edit labour row(s), duplicate labour row, verify materials subtotal unchanged when labour changes; verify Add to Job note still shows labour hours; verify Print/Copy; confirm app still deploys to Railway).

**Labour as product (remove labour rate dropdown)** — *See docs/PLAN_LABOUR_AS_PRODUCT.md. Use product id REP-LAB, name "Technician Repair Labour", cost 35 / price 100 exc GST, servicem8_material_uuid per plan. Keep existing labour row CSS; add delete X and inline editable unit price.*

- [x] **50.10** Supabase: Migration to insert labour product into `public.products`: id=REP-LAB, item_number=REP-LAB, servicem8_material_uuid=6129948b-4f79-4fc1-b611-23bbc4f9726b, name=Technician Repair Labour, cost_price=35, price 100 exc GST (via markup_percentage or price_exc_gst per plan), unit=hour, category=labour, profile=other; thumbnail_url/diagram_url placeholder. Migration name e.g. `add_labour_product`.
- [x] **50.11** Backend: Change POST `/api/calculate-quote` to price labour from `public.products` (labour product id REP-LAB or category labour). Accept labour as elements (e.g. labour_elements or include in elements and split by id/category). Use `get_product_pricing` for labour; stop reading `labour_rates`. Response: keep labour_subtotal / labour_hours (and labour line details) for frontend compatibility.
- [x] **50.12** Backend: Remove or repurpose GET `/api/labour-rates` once frontend no longer uses it (frontend will use labour product from products).
- [x] **50.13** Frontend: Labour row — remove rate dropdown (`.quote-labour-rate-select`). Replace with inline editable unit price (input) with default value from labour product sell price (from state.products or calculate-quote response). Labour row total = hours × unit price; recalc on hours or unit price change.
- [x] **50.14** Frontend: Add delete X to labour row total cell (same `quote-row-remove-x` as material rows; keep existing labour row CSS). Ensure remove handler continues to call `ensureLabourRowsExist()` so at least one labour row remains after delete.
- [x] **50.15** Frontend: Exclude labour product from Marley panel: in `getPanelProducts()`, exclude id REP-LAB (or category === 'labour'). Use constant e.g. LABOUR_PRODUCT_IDS = ['REP-LAB'] and filter.
- [x] **50.16** Frontend: Exclude labour product from quote "Add item" search: in `filterProductsForQuoteSearch` (or equivalent), exclude products with id REP-LAB or category labour so labour cannot be added as a material line.
- [x] **50.17** Frontend: Quote modal open and calculate-quote — ensure labour product (REP-LAB) is loaded (in state.products or via API); labour rows use its sell price as default unit price; send labour_elements (assetId REP-LAB, quantity = hours) per labour row when calling calculate-quote.
- [ ] **50.18** After labour-as-product implementation: smoke-test (labour row unit price default, inline edit, delete X, multiple labour rows, calculate quote, Add to Job note, Print/Copy); confirm app still deploys to Railway. No new env vars or build steps.

*Section 50 status: Labour as table row(s) (50.1–50.8). Labour as product (50.10–50.17) implemented: REP-LAB in products, calculate-quote uses labour_elements, labour row has inline unit price and delete X, REP-LAB excluded from panel and Add item. Pending: 50.9 and 50.18 smoke-test and Railway deploy check.*

---

## 51. Quote modal: Measured materials and Confirm Job popup fixes

*Bugs and improvements: measured-materials header rows (totals, qty "m" suffix, styling, placeholders), measurement click-out behaviour, Confirm Job popup exc gst display.*

**Measured materials – header rows**

- [x] **51.1** Quote modal: Fix or clarify the total $ amount shown in **header rows** for measured materials (e.g. Gutter Length, Downpipe). Currently confusing; amount excludes screws — either make the label/calculation clear or adjust what is included so the total is understandable.
- [x] **51.2** Header row **Qty** field: In the inline editing field for metres, display **"m"** after the number (e.g. "3.5 m") so it is clear the value is quantity in metres.
- [x] **51.3** Header row (measured materials): When the Qty field is filled, apply **UI styling** so the row has internal vertical borders matching the row background, giving the appearance of **two cells** (product + qty | merged: markup%, Unit Price, Total). UI/visual only; no change to table structure or the inline qty field behaviour.
- [x] **51.4** Remove **"—"** placeholders from **header measured rows** only (leave placeholders in other row types if present).

**Measured materials – measurement behaviour**

- [x] **51.5** Measured materials measurement: When clicking into the length field from the canvas view, **clicking anywhere outside** (not only within the element borders) should commit the number and exit edit mode. Make it easier to click out after typing.
- [x] **51.8** Measured materials measurement: When editing the length from the canvas view, **any click away** (outside the popover) should commit the number and close; currently the user has to click within the element borders. Fix so any click away enters the number and exits edit mode.

**Confirm Job Details popup**

- [x] **51.6** Confirm Job Details popup: Display the job’s **total_invoice_amount** and also show that value **divided by 1.15** with an explicit **"exc gst"** label after both values (e.g. "X inc gst" and "Y exc gst").
- [ ] **51.7** Confirm Job Details popup: Further refine UI (spacing, alignment, typography, responsive behaviour) as needed.

---

## 52. Quote modal and ServiceM8 UI enhancements

*Context: Enhance quote modal and ServiceM8 UX without affecting existing functionality. Ensure all changes are non-breaking (e.g. loaders match existing add-to-job button behaviour; explanations only additive).*

**Quote modal – labour and header row**

- [x] **52.1** Add a **warning** when the user clicks Add to Job (or opens the Add to Job flow) if **no labour** is included on the quote (e.g. no labour row or zero labour hours). Display a clear warning so the user can add labour before sending to ServiceM8.
- [x] **52.2** Header row **qty** inline editing (Metres? / length field): change increment from **0.001** to **0.5** for increase/decrease (e.g. spinner, arrow keys, or stepper) so adjustments are practical; 0.001 is impractically small.

**Confirm Job overlay – loaders and tick**

- [x] **52.3** **Add to Job #...** button (in Confirm Job Details overlay): when clicked, show the **white spinning load wheel** and then the **centralised tick emoji** when done — same UI as the original Add to Job button in the quote footer (implemented before the popup existed).
- [x] **52.4** **Create New Job Instead** button (in Confirm Job Details overlay): when clicked, show the **blue spinning load wheel** and then the **centralised tick emoji** when done — same style as used for the original add-to-job button before the popup.

**ServiceM8 connection and greyed-out state**

- [x] **52.5** When the user is **not signed into ServiceM8**, display a **warning symbol** to the left of the **download (Export)** icon in the canvas view toolbar (top left area). Visible only when ServiceM8 is not connected.
- [x] **52.6** When the **Add to Job** section (Job # input and Add to Job button) is **greyed out**, display **small red text** explaining why: e.g. "Not signed in to ServiceM8" or "Complete manual entries (Metres?) first" / "Missing materials" as appropriate. Ensures users understand why the section is disabled.

**Refinements (Feb 2026) – behaviour/placement/UX fixes**

- [x] **52.7** **Labour hours warning placement (52.1):** Display the no-labour warning **inside the quote modal** (e.g. in the Add to Job section or a dedicated message block in the modal), not on the canvas/toolbar. When the user clicks Add to Job (or opens the Add to Job flow) with no labour row or zero labour hours, show the warning in-context in the modal; remove or replace the current `showMessage()` so the warning does not appear in the toolbar.
- [x] **52.8** **Confirm Job popup button UI (52.3, 52.4, 51.7):** (a) Centre-align the load wheel in both "Add to Job #…" and "Create New Job Instead" buttons (spinner in centre of button, replacing text until done). (b) Make button shape more rectangular: add min-height and sufficient top/bottom padding (match quote footer Add to Job button: e.g. min-height 40px, padding 10px 20px); avoid thin-pill appearance. (c) Add a blue border to "Create New Job Instead" matching the shape of the Add to Job # button (border-radius, border colour). (d) Use the same spinner pattern and spacing as the quote footer Add to Job button (`.quote-servicem8-btn`) for both overlay buttons.
- [x] **52.9** **ServiceM8 disconnection warning (52.5, 52.6):** (a) Ensure the toolbar warning symbol is visible **only when the user is not signed into ServiceM8** (fix any logic or initial state that causes it to always display). (b) Increase the symbol size so it is clearly visible. (c) Provide clear information/help: e.g. improved tooltip or short explanatory text (e.g. "Not connected to ServiceM8 — connect via profile menu"), so the user knows what to do. (d) When the Add to Job section is greyed out, ensure the small red explanation text (52.6) is visible and helpful (e.g. "Not signed in to ServiceM8" / "Complete manual entries (Metres?) first" / "Missing materials" as appropriate).

---

## 53. Login screen branding and ServiceM8 at login

*Context: Customise the login screen with a branded image (user will upload) and, if required, integrate ServiceM8 authentication with the login flow so users can connect or sign in with ServiceM8 where appropriate.*

- [ ] **53.1** **Login screen custom image:** Set up the login screen (`#view-login`) to use a custom branding/background image. User will upload the image asset; implement the UI/CSS to display it (e.g. as background, hero image, or logo area). Ensure layout remains usable and accessible; document recommended dimensions/format for the uploaded image.
- [ ] **53.2** **ServiceM8 and login (if needed):** If product or user research determines that ServiceM8 should be part of the login experience (e.g. “Connect ServiceM8” or sign-in-with-ServiceM8 on the login screen), implement the required flow. Otherwise document that ServiceM8 remains optional and is connected from the canvas profile menu after sign-in.

---

