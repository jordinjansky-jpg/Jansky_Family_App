// Service Worker — network-first for app shell, network-only for Firebase API
//
// MAINTENANCE: When you add, rename, or remove any file in APP_SHELL below,
// you MUST bump CACHE_NAME (e.g. v28 → v29) so existing clients fetch the new
// shell. There is no build step generating this list.
//
// CACHE_BUMPS
// -----------
// Record every CACHE_NAME bump here so future readers can correlate cache
// versions to phases/PRs.
//
// v275 (2026-05-13) — Pass 2 — Person switcher: replace native <select> with
//                     avatar chip + bottom sheet; persist selection to localStorage.
// v274 (2026-05-13) — Pass 1 — Feature M: surface reward descriptions on
//                     shop reward cards (2-line clamp), intent sheet (full text),
//                     and bank tokens (below acquired date).
// v252 (2026-05-12) — Meal voting redesign: Plan-a-meal Single/Vote
//                     segmented control with candidate rows; vote sheet
//                     extracted to shared openVoteSheet; display rule
//                     'Vote · N options' replaces per-option lists across
//                     dashboard/meals tab/calendar; vote-sheet entry
//                     points inline (no more kitchen.html detour);
//                     appendMode + kp_occupiedNotice removed.
// v251 (2026-05-12) — Cache-bust: Cloudflare Pages corrupted blob storage on the first deploy of 4362d05 — 6 files modified in that commit (this file, dashboard.js, kitchen.js, shared/components.js, styles/components.css, styles/kitchen.css) were returning 500 with empty body because subsequent deploys dedup-matched the bad hash. Bumping cache + adding a comment to each of the 6 to force fresh content hashes + re-upload.
// v235 (2026-05-11) — Remove share-list feature (overflow menu entry, openShareListSheet, share-list.html, .shr-/.share- CSS, shared/firebase.js exports, shared/utils.js generateShareToken). User asked to remove since it wasn't a feature they wanted.
// v234 (2026-05-11) — SP4 Kitchen new features: recipe URL dedup; Cook mode (steps[] + full-viewport sheet + wake-lock); meal history sheet (30-day dinners by week); AI 'What can I make?' suggest sheet (new recipeSuggest Worker handler); multi-option meal voting (kitchenPlan schema migrates to array shape via normalizePlanSlot — lazy backfill).
// v233 (2026-05-11) — SP3 Lists tab polish: '· N left' chip on switcher, overflow action menu, AI Tools LISTS section, inline wand/camera removed, 'Add from staples' empty-state CTA, self-healing categorization, hide noise OTHER-only category header.
// v232 (2026-05-11) — Hot-fix: recipe imports capture videoUrl (schema.org VideoObject); detail sheet shows a Watch-video play-icon button alongside the recipe-link icon.
// v231 (2026-05-11) — Hot-fix: recipe imports now capture cookTime + totalTime + tags from JSON-LD; detail-sheet meta chips display Prep/Cook when both are present.
// v230 (2026-05-11) — Hot-fix: Refresh-image button now re-calls Worker with recipe.url to get a fresh imageUrl, then persists as data URL (works for already-expired TikTok URLs).
// v229 (2026-05-11) — Hot-fix: TikTok image fallback (onerror → placeholder), recipe image persistence as data URLs on import, per-person ratings with half-star popup, drop favorite star UI, Filter SHOW: Top rated.
// v228 (2026-05-10) — Kitchen Recipes tab depth: 56×56 thumbs, sticky search, 5-dimension filter, AI Tools RECIPES wiring.
// v227 (2026-05-10) — Kitchen Meals redesign (T14): precache shared/kitchen-ical.js.
// v226 (2026-05-10) — Kitchen meals: per-day + button on day-header, today accent-soft bg, null-slot support.
//
// v208 (2026-05-10) — Form polish PR 1 — easy batch (5 items): hide Badge
//                    threshold for boolean conditions + show ≥ operator;
//                    auto-collapse Recipe URL after AI parse; bulk-add
//                    star-toggle for staples; Meal Plan recipe row thumbs.
// v207 (2026-05-10) — Post-initiative review cleanup: admin Reward Expires
//                    migrated to fs-date-btn (parity with rewards.js); Repeat
//                    sub-sheet inline-style violations replaced with CSS
//                    classes (.ef2-repeat-end-* family); rptEndCount gets
//                    inputmode='numeric'. Plus docs: CLAUDE.md form-pattern
//                    reference + DESIGN.md primitives table deferral notes.
// v206 (2026-05-10) — Form-system Phase 5 (a11y polish sweep): emoji picker
//                    role='radio'/aria-checked; color swatch tap target
//                    28→36px; emoji cell transitions w/ reduced-motion;
//                    inputmode=numeric|decimal on cooldown/servings/qty
//                    inputs; sub-sheet reduced-motion honored. Master plan
//                    Phase 5 fully shipped.
// v205 (2026-05-10) — Form-system Phase 4 (3/3 — Repeat sub-sheet dedup):
//                    extracted shared openRepeatSubsheet() helper. Replaces
//                    identical wiring in calendar.html openRepeatSheet and
//                    admin.html openAdminRepeatSheet (closeSheet param picks
//                    closeTaskSheet vs closeAdminSheet). dashboard.js richer
//                    variant stays page-local — different rule structure.
// v204 (2026-05-10) — Form-system Phase 4 (2/3 — photo source picker dedup):
//                    extracted shared openEventPhotoSourceSheet() helper.
//                    Removes ~95% duplicate HTML between dashboard.js
//                    openPhotoSourceSheet and calendar.html
//                    openCalPhotoSourceSheet. Kitchen's photo→list variant
//                    intentionally not consolidated (different flow).
// v203 (2026-05-10) — Form-system Phase 4 (1/3 — iCal sub-sheet dedup):
//                    extracted shared openIcalUrlSubsheet() helper. Removes
//                    ~95% duplicate HTML between dashboard.js openEfIcalSheet
//                    and calendar.html openCalEfIcalSheet. Each opener now
//                    delegates page-specific fetch+confirm via onImport.
// v202 (2026-05-10) — Form-system Phase 3 (8/N — Meal Editor): renderMealEditorSheet
//                    gets sticky fs-footer + disabled save state when name
//                    empty. Footer Save delegates via form.requestSubmit().
// v201 (2026-05-10) — Fix(forms): Send Message sheet gets disabled Send state
//                    on empty title. Brings it in line with broader disabled-
//                    save pattern (DESIGN.md §5.23 v2).
// v200 (2026-05-10) — Fix(forms): add 14px calendar-icon ::after affordance
//                    to .fs-date-btn and .fs-date-wrap > .tf-detail-chip so
//                    date pills read as tap-to-open buttons (form review
//                    flagged the pills as visually identical to display tags).
//                    Affects 6+ date pills in one CSS rule.
// v199 (2026-05-10) — Form-system Phase 3 (7/N — remaining date pickers):
//                    mp_date in renderMealPlanSheet (calendar) + rptEndDate
//                    in renderRepeatSheet (dashboard) migrated to fs-date-btn.
//                    Move-task-date pickers already use the right pattern.
// v198 (2026-05-10) — Form-system Phase 3 (6/N — Bonus Day sheet): bd_date
//                    raw <input type='date'> migrated to fs-date-btn pattern.
//                    Form already had ef2-footer with Cancel + Save (ahead of
//                    curve, kept intact).
// v197 (2026-05-10) — Form-system Phase 3 (5/N — Reward admin variant): sticky
//                    fs-footer + disabled save when rf_name empty. Brings the
//                    admin.html duplicate of rewards.js openRewardForm to
//                    parity. Phase 4 dedup of the 2 implementations into one
//                    shared opener is still pending.
// v196 (2026-05-10) — Form-system Phase 3 (4/N — Badge Form): sticky fs-footer
//                    (Cancel + Add Badge/Save) + disabled save when af_name
//                    empty. Single opener (admin.html openAdminAchSheet ->
//                    bindAchievementForm). Used af_footerCancel/af_footerSave
//                    since af_cancel is the existing header ✕.
// v195 (2026-05-10) — Form-system Phase 3 (3/N — Category Form): sticky
//                    fs-footer + disabled save when cf_label empty. Single
//                    opener (admin.html openAdminCatSheet). Also drops inline
//                    style='' violation on .form-hint per §12.
// v194 (2026-05-10) — Form-system Phase 3 (2/N — Person Form): sticky fs-footer
//                    + disabled save state when ps_name empty. Single opener
//                    (admin.html openPersonSheet). Color picker (cpick-) and
//                    Personal Theme native <select> intentionally untouched —
//                    color is already canonical, theme is a feature decision.
// v193 (2026-05-10) — Fix(forms): replace solid-black-fill chip-active state
//                    with solid-border-in-accent (sticky-hover style). Resolves
//                    form review P11 + DESIGN.md §5.23 v2 "Active states" #2
//                    rule violation. Affects every form with .ef2-add-chip
//                    instances (+ Notes / + Location / + Repeat / + Options /
//                    + Advanced / + Pricing help / etc.) — single CSS rule.
// v192 (2026-05-10) — Form-system Phase 3 (1/N — Task Form): sticky fs-footer
//                    (Cancel + Save Changes/Add Task), One-Time date input
//                    migrated from raw <input type="date"> (form review's
//                    🔴 critical) to fs-date-btn pattern. Disabled save state
//                    on header tf_save + footer tf_footerSave when title
//                    empty. Wired in all 4 openers (dashboard.js, calendar.html,
//                    admin.html openAdminTaskSheet, tracker.html).
// v191 (2026-05-10) — Form-system Phase 2: bring Event Form up to §5.23 v2.
//                    (1) Sticky fs-footer with Cancel + Save Changes/Add Event;
//                    (2) Date pill triggers OS .showPicker() directly (drop
//                    inline reveal — fs-date-btn pattern);
//                    (3) Drop browser-default focus chrome on form-sheet text
//                    inputs (no more magenta on Location);
//                    (4) Header ✓ + footer Save share visible disabled state
//                    when title is empty. Wired in all three openers
//                    (dashboard.js, calendar.html, admin.html).
// v190 (2026-05-10) — Fix(forms): mirror Recipe meta-row + chip-picker into
//                    dashboard.js openRecipeForm so Plan-a-meal "+ New recipe"
//                    matches kitchen.js. Plus padding fix for cf-icon-section
//                    so emoji grid has breathing room above ef2-divider.
// v189 (2026-05-10) — Form-system PR E: renderSwitchToggle + renderHelperText
//                    helpers. Migrate Reward "Approval required" from a
//                    chip-toggle (visual-only is-active class + closure var) to
//                    a real .form-toggle switch with native checkbox state.
// v188 (2026-05-10) — Form-system PR D: fs-emoji-grid CSS + renderEmojiPicker
//                    + bindEmojiPicker helpers (selection = card border + ✓
//                    overlay per spec). Migrate Category form's emoji text
//                    input to the grid picker (admin.html). Custom-emoji cell
//                    falls back to a text input for OS emoji keyboard entry.
// v187 (2026-05-10) — Form-system PR C: renderChipPicker + bindChipPicker
//                    helpers for short-list picking. Migrate Recipe form's
//                    Difficulty native <select> to pill chips (Easy/Medium/Hard).
// v186 (2026-05-10) — Form-system PR B (closeout): renderTimeInput helper
//                    extracted from renderEventForm. Pure refactor — Event Form
//                    time picker DOM unchanged (still .ef2-time-* classes).
// v185 (2026-05-10) — Form-system PR B: add fs-date-btn + renderDateInput +
//                    bindDateInput primitives (DESIGN.md §5.23 v2), migrate
//                    rewards.js Expires field as smoke test (replaces raw
//                    <input type="date"> with pill button + hidden input + .showPicker()).
// v184 (2026-05-10) — Form-system PR A: introduce fs-footer + renderFormFooter +
//                    renderFormSheetHeader shared primitives (DESIGN.md §5.23 v2),
//                    migrate kitchen.js openPlanMealSheet as smoke test.
// v183 (2026-05-09) — Dev mode banner: shared/firebase.js routes to rundown-dev/ when ?env=dev,
//                    shared/dev-banner.js shows a floating chip + clear-data button on dev URLs,
//                    script tag added to 9 HTML pages. No-op in production (IIFE early-returns).
// v182 (2026-05-09) — New PWA icon: family-on-calendar (4 navy silhouettes — Dad/Mom/girl/boy by descending
//                    size on a teal background calendar). Renamed from "App Icon.png" → "app-icon.png"
//                    (no space) to fix local-dev URL encoding. Updated manifest.json + sw.js + 9 HTML files.
// v152 (2026-05-06) — Dashboard patch v2: tiles full-width, dark mode surface lift, AM/PM SVG pills,
//                    bottom nav active uses --accent-ink. base.css, dashboard.css, components.js/css, layout.css.
// v151 (2026-05-02) — Dashboard patch: accent FAB with auto-contrast --fab-ink, coming-up hover fix,
//                    small avatar restored, dashboard tiles compact. components.js/css, theme.js, dashboard.js.
// v150 (2026-05-02) — Dashboard P1 redesign: frosted header, dashboard tiles, coming-up rail, section header,
//                    bottom nav decoupled from accent. layout.css, components.css/js, dashboard.css/js.
// v130 (2026-05-01) — "+ New recipe" opens inline recipe form on dashboard (no navigation), same form as kitchen.
// v129 (2026-05-01) — Dashboard meal picker rewritten to match kitchen: date picker, slot select, kp-* layout.
// v102 (2026-05-01) — Event form redesign: ef2-* CSS, renderEventForm v2, import flows, repeat sub-sheet.
// v94 (2026-04-29) — Kitchen shell: add kitchen.html + styles/kitchen.css to
//                    precache. No kitchen.js in APP_SHELL (entry + CSS only).
// v93 (2026-04-28) — Calendar, scoreboard, tracker now read linkedPerson.theme
//                    on load and write theme changes to person.theme in Firebase
//                    (same fix as v92 for rewards). initNavMore gains personOpts
//                    so the More → Theme path also syncs correctly.
// v92 (2026-04-28) — Rewards theme now reads/writes person.theme in Firebase
//                    (same store as dashboard) so theme syncs across all pages.
// v91 (2026-04-28) — Center text in view-as select dropdown.
// v90 (2026-04-28) — View-as dropdown replaces person chip + sheet; filter badge
//                    no longer counts sort (cost is default, not a filter).
// v89 (2026-04-28) — Increase .list-row gap sm→md, default shop sort = cost (cheap first).
// v88 (2026-04-28) — Fix sb-balances layout (display:block so rows stack), add
//                    gap to .list-row so avatar doesn't cramp the name.
// v87 (2026-04-28) — Card gap fix (reset legacy margin-top), emoji picker CSS moved
//                    to components.css so FAB reward form matches admin.
// v86 (2026-04-28) — Rewards layout (remove double padding, tab spacing), dashboard
//                    overflow replaces Rewards→Calendar, event form matches admin,
//                    backdrop close on reward create, filter/tab gap tightened.
// v85 (2026-04-27) — Rewards page bug fixes: person switcher, filter sheets, pricing
//                    helper in FAB form, filter-chips CSS, admin label tweak.
// v84 (2026-04-27) — Phase 6 Rewards Unification: add rewards.html, rewards.js,
//                    styles/rewards.css to precache.
// v83 (2026-04-27) — tracker: Back to Today pill + slide animation on period nav
// v82 (2026-04-27) — tracker: compact person pills (font-xs, tighter padding + gap)
// v81 (2026-04-27) — admin library: unified Filter & Sort chip across all 6 sections
//                    (Tasks, Events, Meals, Categories, Rewards, Badges);
//                    tasks gains search; events gains time range + owner filter;
//                    meals gains favorites filter + prep time sort; rewards gains
//                    type + status filter with absorbed archived section;
//                    badges gains earned/not-earned filter + least-unlocked sort.
// v80 (2026-04-27) — tracker: remove filter chip and category/status filter
// v79 (2026-04-27) — fix tracker: person pills scroll on mobile, swipe works on empty periods
// v78 (2026-04-27) — tracker redesign: 2-row top chrome, status sections (weekly),
//                    completion ratios (monthly), tap-to-complete, swipe-only nav
// v75 (2026-04-26) — cpick popover flips above button when too close to screen bottom
// v74 (2026-04-26) — fix cpick popover positioning: sheet active state now uses
//                    transform:none so position:fixed pops use viewport coords
// v73 (2026-04-26) — move cpick CSS from admin.css → components.css so color
//                    button is visible in More/overflow theme sheet on all pages
// v72 (2026-04-26) — cpick button+popover replaces native color picker everywhere
//                    (admin person/event/category/accent, calendar event form,
//                    device theme sheet); 40-color palette; event save color fix.
// v71 (2026-04-26) — Color swatch palette replaces native color picker, spacing
//                    fix (mt-xs), admin message form matches bell pattern.
// v70 (2026-04-26) — Polish pass 2: banner full-width, admin tabs fill space,
//                    FAB rename, More sort alpha, remove back-online toast,
//                    PIN placeholder fix, stat card wrap + dot, native color
//                    pickers, More nav on all pages, bell message upgrade
//                    (custom default + reward send), weather AM/PM + pop%.
// v68 (2026-04-26) — Admin settings redesign: section-divider layout CSS,
//                    balance ID fix (person.id→personId), data-person-id fix.
// v67 (2026-04-25) — Admin polish: task selection highlight, task filters
//                    2-column grid (compact), search+sort for Events/Meals/
//                    Categories/Rewards/Badges, all checkboxes → form-toggle,
//                    balance uses calculateBalance() (full store balance),
//                    person detail nav padding fix.
// v66 (2026-04-25) — Admin redesign: 11 tabs → 4 (Library · People ·
//                    Settings · Tools), shared list-row pattern, Person
//                    detail page with isAdmin toggle, PIN bypass for
//                    admin-flagged users, Theme controls merged into
//                    Settings, Debug/Templates/Archive removed, auto-prune
//                    on load.
// v63 (2026-04-25) — Sort fix: a task moved to today (via overdue review or
//                    Move) was getting bumped to top-of-owner via the
//                    "late-today" branch, but using the move flow IS the
//                    resolution — it shouldn't re-flag the task as late.
//                    sortEntries no longer treats movedFromDate as late;
//                    moved tasks now sort normally by time-of-day. Genuinely
//                    overdue tasks still surface via the overdue banner +
//                    review sheet (the dedicated late/missed surface).
// v62 (2026-04-25) — Hotfix: person.html still had the old loadingState +
//                    is-hidden shell, but dashboard.js (Task 4) stopped
//                    managing them. mainContent stayed hidden -> blank
//                    screen on PWA person shortcuts. Updated person.html
//                    to match index.html's new shell (just <div id="mainContent">).
// v61 (2026-04-25) — Dashboard final-form rework: Coming up rail (3.3),
//                    ambient strip slot, store-pt + grade meta chips
//                    when filtered, banner queue gains --info offline +
//                    cross-page mount on scoreboard/tracker, removed
//                    settings.showPoints (and per-card Npt chip), bumped
//                    long-press default 500 -> 800ms on dashboard,
//                    loading skeleton replaces inline spinner. Bounty
//                    tag relabeled "+5 pt" without emoji. Spec:
//                    docs/superpowers/specs/2026-04-25-dashboard-final-design.md
// v60 (2026-04-24) — Remove v51 diagnostic overlay from index.html and
//                    delete /test.html. The mobile load bug (person.html
//                    missing #fabMount) has been understood and fixed in
//                    v52; the diagnostic scaffolding has served its
//                    purpose. No behavior change for users — just
//                    removes an orange error-overlay script that only
//                    rendered when something was already broken.
// v59 (2026-04-24) — Fix: Phase 1.5 .section--filtered ::before accent
//                    bar was positioned inside the section's old 16px
//                    margin gutter; v57 removed that margin so the
//                    cue now overlapped the cards (the "random blue
//                    line behind pills"). Retired the cue — filter
//                    chip + owner-color stripe already carry signal.
// v58 (2026-04-24) — Fix: notification bell + person filter chip were
//                    both hidden in person link mode (!linkedPerson
//                    guards). Person shortcut is for adults and
//                    should have the same controls as Home. Also
//                    fixed the remaining !linkedPerson guards
//                    elsewhere in dashboard.js header.
// v57 (2026-04-24) — Fix: .section had a 16px horizontal margin on
//                    top of the 16px .page-content padding, so cards
//                    sat 32px in from each edge. Dropped horizontal
//                    margin on .section and .section__head inner
//                    padding. Also walked card min-height back from
//                    68 → 60 and padding to spacing-sm/spacing-md
//                    after the 68 felt too tall.
// v56 (2026-04-24) — Fix: v55 edited the wrong rule. Task cards
//                    render with class="card task-card ...", so the
//                    later-in-file .card rule (line 1541) wins over
//                    .task-card (line 733) for shared properties.
//                    Applied the density/radius/min-height alignment
//                    to .card itself: padding 8/16 → 16 all around,
//                    min-height 56 → 68, margin-bottom xs → sm.
// v55 (2026-04-24) — Align .task-card with mockup spec: radius-md→lg,
//                    gap sm→md, owner stripe 4px→3px, min-height 64→68,
//                    avatar 28→36px, title font-weight 600→500, body
//                    gap 2→3px. Phase 1.5 density pass had diverged
//                    from mockup (mockups/01-dashboard.html) and cards
//                    felt squat and heavy.
// v54 (2026-04-24) — Fix: calendar still had the header-height double-count
//                    via .cal-page .page-content override; person mode
//                    overflow menu was missing Rewards + Admin (guarded
//                    on !linkedPerson with no good reason — the person
//                    shortcut is for adults); task-card padding bumped
//                    from 10px/16px to 16px all around with min-height
//                    48→64 so cards feel less compressed next to their
//                    avatar/check tokens.
// v53 (2026-04-24) — Fix: .page-content double-counted header-height in
//                    padding-top. .app-header is position:sticky and
//                    already reserves its own height in flow, so the
//                    extra header-height in .page-content produced a
//                    large blank gap below the header on every page
//                    that uses .page-content (calendar, scoreboard,
//                    tracker, admin, kid, person).
// v52 (2026-04-24) — Fix: person.html was missing <div id="fabMount">,
//                    causing dashboard.js to throw on
//                    document.getElementById('fabMount').innerHTML and
//                    halt module init — stuck loading spinner on PWA
//                    person shortcut. That was the Phase 1+1.5 mobile
//                    bug (bell/overflow buttons looked dead because the
//                    module never finished wiring them).
// v51 (2026-04-24) — Diagnostic: on-page error overlay in index.html +
//                    /test.html sanity check page. Temp — removed once
//                    the Phase 1+1.5 mobile load bug is understood.
// v50 (2026-04-24) — Theme fix #2: applyTheme now strips stale inline
//                    var overrides on switch, so a previous dark preset's
//                    --text/--bg/etc. can't linger on root when switching
//                    to a light preset that doesn't redeclare them.
// v49 (2026-04-24) — Theme fix: data-theme now follows preset.mode, not
//                    themeConfig.mode, so a light preset can never inherit
//                    dark base.css token overrides (and vice versa).
// v48 (2026-04-24) — Phase 1.5 dashboard polish: completed-card mute
//                    (no strikethrough), check hover+press, section
//                    head grid + divider + muted meta, larger header
//                    title + narrow-phone subtitle, FAB depth + nav
//                    active rail, Back-to-Today chevron + entrance,
//                    filter chip dot/verb + section cue, bell pulse.
// v47 (2026-04-23) — Phase 1 polish hotfix: light theme contrast
//                    (data-theme guard), Back-to-Today centering,
//                    card density + stripe geometry + shadow leak.
// v46 (2026-04-23) — Phase 1 dashboard rework: mockup-aligned header,
//                    card slot DOM, priority banner queue, FAB + 5-tab
//                    nav with More sheet, person filter chip, owner
//                    left-stripe, empty state.
// v45 (2026-04-21) — Phase 0 foundation: token layer rewrite, hex purge in
//                    components.css, inline-style sweep in stable modules,
//                    reduced-motion guards on all animating CSS, retired-
//                    token sweep in HTML files.
// v44 (2026-04-xx) — prior rename to 'family-hub' branding.
// v42 (2026-04-17) — Kid mode CSS fix for status-bar layering.
// (older bumps not recorded retroactively)
// v64 (2026-04-25) — 1.3 Meal Planning: meal library, plan/detail/editor sheets,
//                    calendar day view meals section, admin Meals tab, kid Tonight
//                    tile, dashboard ambient strip wiring, ambientStrip setting.
// v65 (2026-04-25) — 1.4 Weather Widget: add shared/weather.js to cache.
// v69 (2026-04-26) — Admin polish: category/rewards/badges Add button merged into
//                    filter toolbar row; category/events/meals/rewards/badges all
//                    open as task-form-backdrop modals; balance anchor inline;
//                    bonus/deduction side-by-side; send-message replaced with
//                    openMsgModal (select templates); schedule stats icon-tile
//                    pattern; settings theme preset → select dropdown.
// v68 (2026-04-26) — Admin settings redesign: section-divider layout CSS,
//                    balance ID fix (person.id→personId), data-person-id fix.
// v95 (2026-04-29) — Kitchen UX polish: tabs--pill CSS, sheet__header/footer/content CSS,
//                    field/field__label CSS, recipe-pick-list CSS, kitchen.css padding fix,
//                    initNavMore wires headerOverflow, click-outside sheets, slot edit sheet,
//                    recipe picker replaces datalist.
// v101 (2026-04-29) — AI features polish: add shared/ai-helpers.js to cache.
// v103 (2026-05-01) — Event form: photo source action sheet (Camera / Gallery / Files).
// v104 (2026-05-01) — Event form polish: repeat header, Every/units inline, color dots on chips,
//                     time button focus fix, scroll fade indicator, all-day pill outlined, checkmarks vs radios.
// v105 (2026-05-01) — Event form: tighter person chips, custom time picker (hour/min/AMPM selects), icon focus tint.
// v106 (2026-05-01) — Event form: Family chip up next to For label, single-line time picker, tighter add chips, balanced padding.
// v107 (2026-05-01) — Event form: remove duplicate horizontal padding on sections, shrink time selects to fit phone width.
// v108 (2026-05-01) — Kitchen: preserve recipe qty on add to list, show qty on shopping cards, dedup ingredients, auto-create list, categorize from recipe.
// v109 (2026-05-01) — Kitchen: AI mergeQty handler for smart unit-aware ingredient combination.
// v110 (2026-05-01) — Kitchen: cleanIngredientName heuristic + dedupIngredients AI handler — clean names on every entry, smart name+qty merge.
// v111 (2026-05-01) — Kitchen: list cleanup wand button (cleanList Worker handler) — drop per-add AI for heuristic-only.
// v112 (2026-05-01) — Event form photo: explicit context note input in source sheet (was relying on title field, undiscoverable).
// v113 (2026-05-01) — Kitchen: drop per-add categorize (wand only), editable qty in shopping list edit, editable ingredient name+qty in recipe form.
// v114 (2026-05-01) — Kitchen: shopping list qty inline before name (matches recipe form layout).
// v115 (2026-05-01) — Kitchen: revert list display, fix edit sheet to inline qty+name row instead.
// v116 (2026-05-01) — Kitchen: TikTok URL import (rehydration JSON + oEmbed + meta tags), partial-failure preserves URL.
// v117 (2026-05-01) — Kitchen: port all 7 forms to Event Form pattern (sticky footer, per-prefix CSS, focus tint, delete zones).
// v135 (2026-05-03) — Kitchen: meal dates show month, FAB week context, recipe CSS classes, list undo/clear.
// v136 (2026-05-03) — Kitchen: staples chip style, icons right-aligned, recipe count + find ideas layout.
// v137 (2026-05-03) — Kitchen: find ideas uses chip style to match staples button.
// v138 (2026-05-04) — Scoreboard: close btn, streak visual, sparkline labels, balance summary, Missed/Late only, Year label, balance delta.
// v139 (2026-05-04) — Scoreboard: rolling 7/30 grades, achievement icons on cards, Highlights section, Category Leaders section.
// v140 (2026-05-04) — Task detail: Mark Complete in sticky footer at bottom of sheet.
// v141 (2026-05-04) — Meal detail: unified sheet with action rows, Add to list, Change meal.
// v142 (2026-05-04) — Move task-detail action row styles to components.css (shared across all pages).
// v143 (2026-05-04) — Rewards: intent sheet action rows, cost chip color, chip--success variant.
// v144 (2026-05-04) — Rewards: intent sheet inline pts+name, side-by-side buttons, touch long press.
// v145 (2026-05-04) — Rewards: card trailing column (pts+flat get btn), intent sheet tabs--pill.
// v147 (2026-05-04) — P2c: self-host Plus Jakarta Sans (fonts/ dir), remove Google Fonts CDN,
//                     manifest fixes (maskable icon, bg/theme colors, scope/lang/orientation/categories/shortcuts).
// v148 (2026-05-04) — P3: setup.css extracted from setup.html inline <style> block.
// v149 (2026-05-02) — Foundation: type scale shifted down (15px default), text-size localStorage persistence, kid.css floor.
// v150 (2026-05-02) — Dashboard P1: frosted header, dashboard tiles, coming-up card, section-header, neutral FAB, nav active fix, no avatar on task cards.
// v153 (2026-05-06) — Dashboard P3: task card layout rework (leading/body/meta), 3 display toggles, nav glow, tiles full-width.
// v154 (2026-05-06) — Dashboard P4: avatar ring+soft fill, time pill enlarged + anytime icon, accent-bright token, nav neon glow.
// v155 (2026-05-06) — Dashboard P5: edge-flush avatar/event pill, AM/PM 20px, new anytime icon, nav two-tone neon.
// v156 (2026-05-06) — Dashboard P6: capsule pill geometry (inset, rounded), strip avatar circle, two-tone anytime icon.
// v157 (2026-05-06) — Dashboard P7: avatar tab flush-left w/ border, anytime sun+moon side-by-side, recurrence to meta col.
// v158 (2026-05-06) — Dashboard P8: tab truly flush (box-shadow border, explicit left radius), anytime diagonal sun/divider/moon.
// v159 (2026-05-06) — Dashboard P9: cascade fix (.card.task-card 0,2,0), tab flush + strip fallback, circle time pills, anytime moon unclipped.
// v160 (2026-05-06) — Dashboard P10: avatar tab 40px + 2.5px border, initial bolder+shadow, pills 30×30 circles, svg 20×20 CSS-sized.
// v161 (2026-05-06) — Dashboard P11: initial color darkened (color-mix→black 40%), 13px explicit size; anytime sun moved to (7,7) equidistant from divider.
// v162 (2026-05-06) — Dashboard P12: avatar border 3px, initial 45% blend to black; dashboard-tile__icon overflow:hidden + 18px svg; fork/cloud stay in circle.
// v163 (2026-05-06) — Dashboard P13: initial 15px + white halo text-shadow for readability on any tinted background.
// v164 (2026-05-06) — Dashboard P14: drop text-shadow (caused fuzz/J bleed); color-mix(pill 30%, --text) — crisp, readable in both modes.
// v165 (2026-05-06) — Nav active: pill indicator (24×3px) at top edge + bold 2px stroke, no glow filter.
// v166 (2026-05-06) — Dashboard tiles: hide labels, 28px icon, 10px h-pad, 6px gap; back-to-today: accent-tinted pill.
// v167 (2026-05-06) — Tile value back to font-sm; back-to-today zero-height so button floats without shifting layout.
// v168 (2026-05-06) — Back-to-today in header center slot (absolute, 45% max-width, shrinks on long names, no layout shift).
// v169 (2026-05-06) — Kid mode: .kid-tasks .card.task-card (0,3,0) forces padding:0 so avatar tab stays flush.
// v170 (2026-05-06) — Fix: color picker in More theme sheet no longer forces a preset when activePreset is '' (Family Default).
// v171 (2026-05-07) — Per-person display prefs in My Settings: avatar, duration, points, AM/PM icons. Overrides family defaults per person.
// v172 (2026-05-07) — Text size from Firebase settings applied on all pages (dashboard, calendar, scoreboard, tracker, kid).
// v173 (2026-05-07) — Fix text size: scale all font tokens (xs/sm/md/lg/xl/2xl/3xl) per size; body uses --font-base.
// v174 (2026-05-07) — Text size in My Settings: per-person override via person.prefs.textSize, applied immediately.
// v175 (2026-05-07) — Event location taps open Google Maps (with pin icon); works as native maps prompt on mobile.
// v176 (2026-05-07) — iCal feed sync: admin Calendars tab, per-feed owner assignment, 6-hr cooldown, dashboard fire-and-forget sync.
// v177 (2026-05-07) — iCal form restyled to task-form pattern; calendar display settings moved from Settings→Calendar into Settings→Style.
// v178 (2026-05-07) — Move iCal feed management from Library→Calendars into Settings→Connect; library back to 5 tabs.
// v179 (2026-05-07) — Imports tab reorganized: Connected / Scan & Import / Review Queue sections; iCal feeds in Connected.
// v180 (2026-05-07) — Imports layout reworked: section labels + border-top rhythm, no bordered cards, consistent admin list spacing.
// v181 (2026-05-07) — iCal form: suppress URL focus chrome, chip scroll fix, primary/attending state machine, tf-rot-pill interval.
const CACHE_NAME = 'family-hub-v287';

const APP_SHELL = [
  '/',
  '/index.html',
  '/person.html',
  '/dashboard.js',
  '/rewards.js',
  '/calendar.html',
  '/scoreboard.html',
  '/tracker.html',
  '/kid.html',
  '/admin.html',
  '/setup.html',
  '/rewards.html',
  '/kitchen.html',
  '/manifest.json',
  '/app-icon.png',
  // Self-hosted variable fonts
  '/fonts/PlusJakartaSans[wght].woff2',
  '/fonts/PlusJakartaSans-Italic[wght].woff2',
  // CSS (modular)
  '/styles/base.css',
  '/styles/layout.css',
  '/styles/components.css',
  '/styles/dashboard.css',
  '/styles/calendar.css',
  '/styles/scoreboard.css',
  '/styles/tracker.css',
  '/styles/admin.css',
  '/styles/setup.css',
  '/styles/rewards.css',
  '/styles/kitchen.css',
  '/styles/kid.css',
  '/styles/responsive.css',
  // JS modules
  '/shared/firebase.js',
  '/shared/scheduler.js',
  '/shared/scoring.js',
  '/shared/state.js',
  '/shared/components.js',
  '/shared/dom-helpers.js',
  '/shared/theme.js',
  '/shared/utils.js',
  '/shared/weather.js',
  '/shared/calendar-views.js',
  '/shared/ai-helpers.js',
  '/shared/dev-banner.js',
  '/shared/kitchen-ical.js',
  // Firebase SDK (CDN — cached cross-origin with CORS)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'
];

self.addEventListener('install', (event) => {
  // Pre-cache app shell for offline use
  // Cache each asset individually so one failure doesn't block all caching
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Failed to cache:', url, err.message))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for Firebase API calls
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Dynamic kid-mode manifest — returns a kid-specific manifest so
  // "Add to Home Screen" launches kid.html?kid=Name instead of index.html
  if (url.pathname === '/kid-manifest.json') {
    const kid = url.searchParams.get('kid') || 'Kid';
    const manifest = {
      name: kid + "'s Tasks",
      short_name: kid,
      description: "Daily tasks for " + kid,
      start_url: "/kid.html?kid=" + encodeURIComponent(kid),
      display: "standalone",
      background_color: "#141413",
      theme_color: "#141413",
      icons: [{ src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }]
    };
    event.respondWith(new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json' }
    }));
    return;
  }

  // Dynamic person manifest — "Install" launches person.html?person=Name
  if (url.pathname === '/person-manifest.json') {
    const person = url.searchParams.get('person') || 'User';
    const manifest = {
      id: "/person/" + encodeURIComponent(person),
      name: person + "'s Family Hub",
      short_name: person,
      description: "Daily tasks for " + person,
      start_url: "/person.html?person=" + encodeURIComponent(person),
      display: "standalone",
      background_color: "#141413",
      theme_color: "#141413",
      icons: [{ src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }]
    };
    event.respondWith(new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json' }
    }));
    return;
  }

  // Network-first: try network, fall back to cache for offline support
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
