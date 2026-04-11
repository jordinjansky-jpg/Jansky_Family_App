# UX Polish & Technical Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add micro-animations, context-aware empty states, swipe-to-complete gestures, offline-first support, modular CSS, and real-time Firebase listeners to the Family Hub app.

**Architecture:** Six sequential features building on a vanilla JS + Firebase RTDB stack with no bundler. All animations are CSS-only. Offline support uses Firebase's built-in persistence + a cache-first service worker. Real-time listeners replace one-shot reads for completions/schedule. CSS is mechanically split from one 2,856-line file into 10 focused files.

**Tech Stack:** Vanilla JS (ES modules), Firebase RTDB compat SDK (CDN), CSS animations/transitions, Service Worker Cache API

**Spec:** `docs/superpowers/specs/2026-04-03-ux-polish-and-technical-improvements-design.md`

---

## Task 1: Split common.css into modular files

This is a mechanical extraction — no style changes, no refactoring. Cut sections from `common.css` into new files based on the section comment headers already in the file.

**Files:**
- Read: `styles/common.css` (2,856 lines — the source file being split)
- Create: `styles/base.css` (lines 1-145 of common.css: CSS variables, reset, page fade-in)
- Create: `styles/layout.css` (lines 147-325 of common.css: page-content, header, bottom nav)
- Create: `styles/components.css` (lines 327-691 of common.css: cards, buttons, loading, connection status, empty state, person filter, undo toast, bottom sheet, form elements, chips, utilities, plus lines 826-1089: progress bar, task card, task card variants. Also lines 1409-1468: overdue banner, grade badge)
- Create: `styles/dashboard.css` (lines 748-825 of common.css: date header. Lines 1090-1115: time-of-day section. Lines 1469-1604: task detail sheet, celebration)
- Create: `styles/calendar.css` (lines 1116-1408 of common.css: calendar grid, calendar day sheet)
- Create: `styles/scoreboard.css` (lines 1605-2056 of common.css: scoreboard section)
- Create: `styles/tracker.css` (lines 2057-2285 of common.css: tracker section)
- Create: `styles/admin.css` (lines 2286-2840 of common.css: admin section. Also lines 692-747: color swatch, step indicator — these are admin/setup only)
- Create: `styles/kid.css` (empty initially — kid-specific styles are inline in kid.html's `<style>` tag already)
- Create: `styles/responsive.css` (lines 2841-2856 of common.css: responsive breakpoints)
- Modify: `index.html`, `calendar.html`, `scoreboard.html`, `tracker.html`, `admin.html`, `kid.html`, `setup.html` — replace single `<link>` with multiple `<link>` tags
- Delete: `styles/common.css` (after verification)

**Important:** The line numbers above are approximate guides for which CSS section comments map to which file. When extracting, use the `/* ============ Section Name ============ */` comment headers as exact cut points. The key mapping is:

| Section header in common.css | Target file |
|---|---|
| CSS Variables, Reset, Page Fade-in | base.css |
| Layout, Header, Bottom Navigation | layout.css |
| Cards, Buttons, Loading, Connection Status, Empty State, Person Filter, Undo Toast, Bottom Sheet, Form Elements, Chip/Tag, Utilities | components.css |
| Progress Bar, Task Card (all variants) | components.css |
| Overdue Banner, Grade Badge | components.css |
| Dashboard — Date Header | dashboard.css |
| Time of Day Section | dashboard.css |
| Task Detail Sheet, Celebration | dashboard.css |
| Calendar Grid, Calendar Day Sheet | calendar.css |
| Scoreboard | scoreboard.css |
| Tracker | tracker.css |
| Admin, Color Swatch, Step Indicator | admin.css |
| Responsive | responsive.css |

- [ ] **Step 1: Read common.css fully and create base.css**

Read `styles/common.css` from line 1 through the end of the Page Fade-in section (up to but not including the `/* ============ Layout ============ */` header). Write that content to `styles/base.css`.

- [ ] **Step 2: Create layout.css**

Extract from `/* ============ Layout ============ */` through end of `/* ============ Bottom Navigation ============ */` section (up to but not including `/* ============ Cards ============ */`). Write to `styles/layout.css`.

- [ ] **Step 3: Create components.css**

Extract these sections into `styles/components.css`, in this order:
1. Cards
2. Buttons
3. Loading
4. Connection Status
5. Empty State
6. Person Filter
7. Undo Toast
8. Bottom Sheet
9. Form Elements
10. Chip / Tag
11. Utilities
12. Progress Bar
13. Task Card (including all sub-sections: done, overdue, avatar, body, check, colored cells, event cards, action tags)
14. Overdue Banner
15. Grade Badge

- [ ] **Step 4: Create dashboard.css**

Extract these sections into `styles/dashboard.css`:
1. Dashboard — Date Header
2. Time of Day Section
3. Task Detail Sheet
4. Celebration

- [ ] **Step 5: Create calendar.css**

Extract these sections into `styles/calendar.css`:
1. Calendar Grid
2. Calendar Day Sheet

- [ ] **Step 6: Create scoreboard.css**

Extract `/* ============ Scoreboard ============ */` section into `styles/scoreboard.css`.

- [ ] **Step 7: Create tracker.css**

Extract `/* ============ Tracker ============ */` section into `styles/tracker.css`.

- [ ] **Step 8: Create admin.css**

Extract these sections into `styles/admin.css`:
1. Color Swatch (for setup/admin)
2. Step Indicator (for setup wizard)
3. Admin

- [ ] **Step 9: Create kid.css**

Create `styles/kid.css` as an empty file with a header comment:
```css
/* kid.css — Kid mode specific styles */
/* Kid-specific styles are currently inline in kid.html <style> tag */
```

- [ ] **Step 10: Create responsive.css**

Extract `/* ============ Responsive ============ */` section into `styles/responsive.css`.

- [ ] **Step 11: Update index.html link tags**

Replace:
```html
<link rel="stylesheet" href="styles/common.css">
```
With:
```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/dashboard.css">
<link rel="stylesheet" href="styles/responsive.css">
```

- [ ] **Step 12: Update calendar.html link tags**

Replace the single link with:
```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/calendar.css">
<link rel="stylesheet" href="styles/responsive.css">
```

Note: calendar.html also uses task detail sheet and dashboard-style components in its day sheet. Include dashboard.css too:
```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/dashboard.css">
<link rel="stylesheet" href="styles/calendar.css">
<link rel="stylesheet" href="styles/responsive.css">
```

- [ ] **Step 13: Update scoreboard.html link tags**

```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/scoreboard.css">
<link rel="stylesheet" href="styles/responsive.css">
```

- [ ] **Step 14: Update tracker.html link tags**

```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/tracker.css">
<link rel="stylesheet" href="styles/responsive.css">
```

- [ ] **Step 15: Update admin.html link tags**

```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/admin.css">
<link rel="stylesheet" href="styles/responsive.css">
```

- [ ] **Step 16: Update kid.html link tags**

```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/dashboard.css">
<link rel="stylesheet" href="styles/kid.css">
<link rel="stylesheet" href="styles/responsive.css">
```

Note: kid.html uses task cards, progress bars, celebration, overdue banner, and task detail sheets — so it needs components.css and dashboard.css. It does NOT need layout.css (no header/nav bar).

- [ ] **Step 17: Update setup.html link tags**

```html
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/admin.css">
<link rel="stylesheet" href="styles/responsive.css">
```

- [ ] **Step 18: Delete common.css**

Delete `styles/common.css`.

- [ ] **Step 19: Verify visually**

Open each page in the browser and verify styles render correctly. Check:
- index.html: header, nav, task cards, progress bar, celebration, overdue banner
- calendar.html: calendar grid, day sheet, task cards
- scoreboard.html: leaderboard cards, grade badges
- tracker.html: status rows, filters
- admin.html: forms, tabs, PIN screen
- kid.html: kid header, task cards, celebrations
- setup.html: wizard steps, forms

- [ ] **Step 20: Commit**

```bash
git add styles/base.css styles/layout.css styles/components.css styles/dashboard.css styles/calendar.css styles/scoreboard.css styles/tracker.css styles/admin.css styles/kid.css styles/responsive.css index.html calendar.html scoreboard.html tracker.html admin.html kid.html setup.html
git rm styles/common.css
git commit -m "refactor: split common.css into 10 modular CSS files

No style changes — purely mechanical extraction using existing section
comment headers as cut points. Each page now loads only the CSS it needs.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Micro-animations on completion

Add satisfying animations when tasks are completed: card press effect, enhanced checkmark, smooth progress bar, and CSS confetti on 100% celebration.

**Files:**
- Modify: `styles/components.css` — add `task-card--completing` class styles, progress bar transition, `prefers-reduced-motion` rules
- Modify: `styles/dashboard.css` — add confetti keyframes and celebration confetti styles
- Modify: `shared/components.js:384-392` — update `renderCelebration()` to include confetti spans
- Modify: `index.html:442-475` — add 400ms render delay in `toggleTask()`
- Modify: `index.html:525-533` — update `checkCelebration()` with confetti auto-dismiss
- Modify: `kid.html:1040-1098` — same 400ms render delay in `toggleTask()`

- [ ] **Step 1: Add completing animation CSS to components.css**

Add to the end of `styles/components.css`:

```css
/* ── Task completion animation ── */
@keyframes cardPress {
  0% { transform: scale(1); }
  30% { transform: scale(0.98); }
  100% { transform: scale(1); }
}

.task-card--completing {
  animation: cardPress 0.3s ease;
  background: color-mix(in srgb, var(--success-text) 8%, var(--bg-card));
}

.task-card--completing .task-card__check {
  background: var(--accent);
  border-color: var(--accent);
  transform: scale(1.2);
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* prefers-reduced-motion: disable all animations */
@media (prefers-reduced-motion: reduce) {
  .task-card--completing,
  .task-card--done .task-card__check,
  .task-card--done .task-card__check::after,
  .celebration__content {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: Add confetti CSS to dashboard.css**

Add after the existing `@keyframes celebrationPop` in `styles/dashboard.css`:

```css
/* ── Celebration confetti ── */
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
}

.celebration__confetti {
  position: fixed;
  top: -10px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  animation: confettiFall 2.5s ease-in forwards;
  pointer-events: none;
  z-index: 251;
}

.celebration--dismiss {
  opacity: 0;
  transition: opacity 0.4s ease;
}

@media (prefers-reduced-motion: reduce) {
  .celebration__confetti { display: none; }
}
```

- [ ] **Step 3: Update renderCelebration() in components.js**

In `shared/components.js`, replace the existing `renderCelebration()` function (around line 384):

```js
export function renderCelebration() {
  // Generate 15 confetti pieces with varied colors and positions
  const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997','#ff6b6b'];
  let confetti = '';
  for (let i = 0; i < 15; i++) {
    const color = colors[i % colors.length];
    const left = 5 + Math.round((i * 6.5) % 90);
    const delay = (i * 0.12).toFixed(2);
    const size = 8 + (i % 3) * 4;
    confetti += `<span class="celebration__confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;width:${size}px;height:${size}px;"></span>`;
  }
  return `<div class="celebration" id="celebration">
    ${confetti}
    <div class="celebration__content">
      <span class="celebration__icon">🎉</span>
      <h3 class="celebration__title">All Done!</h3>
      <p class="celebration__subtitle">Great job finishing today's tasks!</p>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Add 400ms render delay in index.html toggleTask()**

In `index.html`, modify the `toggleTask()` function. Find the line `render();` at approximately line 475 (after the completion write and before the undo toast). Replace the direct `render()` call with a delayed render that adds the completing class first:

Find in `index.html` inside `toggleTask()`:
```js
      render();

      // Undo toast
```

Replace with:
```js
      // Animate completion before re-render
      if (!wasComplete) {
        const card = main.querySelector(`[data-entry-key="${entryKey}"]`);
        if (card) card.classList.add('task-card--completing');
        setTimeout(() => render(), 400);
      } else {
        render();
      }

      // Undo toast
```

- [ ] **Step 5: Add 400ms render delay in kid.html toggleTask()**

In `kid.html`, find the `render();` call in `toggleTask()` (around line 1070). Apply the same pattern:

Find:
```js
          render();
          showUndoToast(
```

Replace with:
```js
          // Animate completion before re-render
          if (!wasComplete) {
            const card = document.querySelector(`[data-entry-key="${entryKey}"]`);
            if (card) card.classList.add('task-card--completing');
            setTimeout(() => {
              render();
              showUndoToast(
```

**Wait** — this breaks the undo toast logic. The simpler approach: keep `render()` + `showUndoToast()` together but delay both:

Find in kid.html `toggleTask()`:
```js
          render();
          showUndoToast(
            wasComplete ? 'Task marked incomplete' : 'Task completed!',
```

Replace with:
```js
          const doRenderAndToast = () => {
            render();
            showUndoToast(
              wasComplete ? 'Task marked incomplete' : 'Task completed!',
```

And after the undo toast closing paren + semicolon, add:
```js
          );
          if (!wasComplete) {
            const card = document.querySelector(`[data-entry-key="${entryKey}"]`);
            if (card) card.classList.add('task-card--completing');
            setTimeout(doRenderAndToast, 400);
          } else {
            doRenderAndToast();
          }
```

This requires wrapping the `render()` + `showUndoToast(...)` block into `doRenderAndToast`. Read the full `toggleTask` in `kid.html` carefully and restructure accordingly. The pattern is:
1. Do the Firebase write (already done above this block)
2. If completing: add `task-card--completing` class, wait 400ms, then render + show toast
3. If uncompleting: render + show toast immediately

Apply the same pattern to `index.html` — wrap `render()` + `showUndoToast(...)` + `checkCelebration()` into a delayed callback.

- [ ] **Step 6: Update checkCelebration() in index.html for auto-dismiss**

In `index.html`, update `checkCelebration()` to auto-dismiss with fade:

Find:
```js
        celebrationShown = true;
        const cel = document.getElementById('celebration');
        cel.classList.add('active');
        setTimeout(() => cel.classList.remove('active'), 2500);
```

Replace with:
```js
        celebrationShown = true;
        const cel = document.getElementById('celebration');
        cel.classList.add('active');
        setTimeout(() => {
          cel.classList.add('celebration--dismiss');
          setTimeout(() => {
            cel.classList.remove('active', 'celebration--dismiss');
          }, 400);
        }, 2500);
```

- [ ] **Step 7: Add streak flip animation to scoreboard.html**

In `scoreboard.html`, find where streak values are rendered. Add a CSS class `streak-flip` with a `@keyframes flip-up` animation to `styles/scoreboard.css`:

```css
@keyframes flipUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.streak-value--animate {
  animation: flipUp 0.3s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .streak-value--animate { animation: none; }
}
```

In `scoreboard.html`, add the `streak-value--animate` class to the streak number elements when they render.

- [ ] **Step 8: Note — progress bar transition already exists**

The progress bar at `styles/components.css` (originally line 855 of common.css) already has `transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1)`. No change needed — this is already smooth.

- [ ] **Step 9: Commit**

```bash
git add styles/components.css styles/dashboard.css styles/scoreboard.css shared/components.js index.html kid.html scoreboard.html
git commit -m "feat: add micro-animations on task completion

Card press effect, enhanced checkmark animation, smooth progress bar
fill, and CSS confetti on 100% celebration. All animations respect
prefers-reduced-motion. 400ms render delay lets animation play before
card relocates to completed section.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Context-aware empty states

Replace generic empty state messages with contextual, personality-rich variants.

**Files:**
- Modify: `shared/components.js:113-119` — extend `renderEmptyState()` with variant support
- Modify: `styles/components.css` — add entrance animation for `.empty-state`
- Modify: `index.html:213-215` — pass appropriate variant
- Modify: `kid.html:861` — pass kid variant
- Modify: `calendar.html` — pass variant for day detail empty states

- [ ] **Step 1: Add entrance animation CSS**

Add to `styles/components.css` after the existing `.empty-state` styles:

```css
/* ── Empty state entrance animation ── */
@keyframes emptyBob {
  0% { transform: scale(0.8); opacity: 0; }
  60% { transform: scale(1.02); }
  100% { transform: scale(1); opacity: 1; }
}

.empty-state__icon {
  animation: emptyBob 0.6s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .empty-state__icon { animation: none; }
}
```

- [ ] **Step 2: Extend renderEmptyState() in components.js**

Replace the existing `renderEmptyState` function in `shared/components.js`:

```js
const EMPTY_VARIANTS = {
  'all-done':     { icon: '🏆', title: 'Nothing left — you crushed it!' },
  'free-day':     { icon: '🏖️', title: 'Free day!', subtitle: 'Nothing scheduled — enjoy it.' },
  'future-empty': { icon: '📅', title: 'Nothing planned yet' },
  'no-match':     { icon: '🔍', title: 'No tasks for {name}', subtitle: 'Try a different filter.' },
  'kid-done':     { icon: '🎉', title: "You're all done!", subtitle: 'Go play!' },
  'kid-free':     { icon: '☀️', title: 'No chores today!', subtitle: 'Lucky you!' }
};

export function renderEmptyState(icon, title, subtitle = '', options = {}) {
  const { variant, personName, gradeHtml } = options;
  if (variant && EMPTY_VARIANTS[variant]) {
    const v = EMPTY_VARIANTS[variant];
    icon = v.icon;
    title = v.title.replace('{name}', esc(personName || ''));
    subtitle = v.subtitle || subtitle || '';
  }
  const gradeRow = gradeHtml ? `<div class="empty-state__grade">${gradeHtml}</div>` : '';
  return `<div class="empty-state">
    <span class="empty-state__icon">${icon}</span>
    <h3 class="empty-state__title">${title}</h3>
    ${subtitle ? `<p class="empty-state__subtitle">${subtitle}</p>` : ''}
    ${gradeRow}
  </div>`;
}
```

- [ ] **Step 3: Update index.html empty state calls**

In `index.html`, find (around line 213-215):
```js
        const emptyMsg = isToday ? 'Enjoy your free time!' : 'Nothing scheduled for this day.';
        html += renderEmptyState('📭', 'No tasks', emptyMsg);
```

Replace with:
```js
        const variant = isToday ? 'free-day' : 'future-empty';
        html += renderEmptyState('', '', '', { variant });
```

Also check if there's a case where `prog.total > 0` but all are complete and we should show 'all-done'. Currently the app shows completed cards at the bottom, so the empty state only fires when `prog.total === 0`. The 'all-done' variant would be better used where the celebration fires. No change needed — the celebration overlay handles the all-done case.

- [ ] **Step 4: Update kid.html empty state**

In `kid.html`, find (around line 861):
```js
            html += renderEmptyState('🎉', 'All clear!', emptyMsg);
```

Read the surrounding context to determine what `emptyMsg` is. Replace with the appropriate kid variant:
- If no tasks scheduled: use `{ variant: 'kid-free' }`
- If all tasks done: use `{ variant: 'kid-done' }`

The actual replacement depends on the condition. Read the full context around line 861 and use the right variant for each branch.

- [ ] **Step 5: Update person-filtered empty states**

In `index.html`, search for any empty state that shows when a person filter yields no results. If the person filter results in 0 entries visible but there ARE entries for other people, add:
```js
html += renderEmptyState('', '', '', { variant: 'no-match', personName: activePerson?.name });
```

Check the render function in `index.html` to see if this case is handled. If the person filter just filters `viewEntries` before the `prog.total === 0` check, then the existing empty state at line 213-215 already covers it — just needs the variant parameter added. In that case, update the logic:

```js
        if (activePerson) {
          html += renderEmptyState('', '', '', { variant: 'no-match', personName: people.find(p => p.id === activePerson)?.name });
        } else {
          const variant = isToday ? 'free-day' : 'future-empty';
          html += renderEmptyState('', '', '', { variant });
        }
```

- [ ] **Step 6: Commit**

```bash
git add shared/components.js styles/components.css index.html kid.html calendar.html
git commit -m "feat: add context-aware empty states with entrance animation

Empty states now show contextual messages based on why the list is empty:
all-done, free-day, future-empty, no-match (filtered), kid variants.
Icon bobs in with a subtle entrance animation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Swipe-to-complete on task cards

Add horizontal swipe gestures on task cards: swipe right to complete, swipe left to open details.

**Files:**
- Modify: `shared/components.js:180-241` — wrap `renderTaskCard` output in swipe container
- Create: `shared/swipe.js` — reusable swipe handler logic (touch events, thresholds, conflict resolution)
- Modify: `styles/components.css` — add swipe container and strip styles
- Modify: `index.html:421-434` — update swipe logic to exclude card swipes
- Modify: `index.html` — import and init card swipe handler
- Modify: `calendar.html` — import and init card swipe handler
- Modify: `kid.html` — import and init card swipe handler

- [ ] **Step 1: Add swipe CSS to components.css**

Add to `styles/components.css`:

```css
/* ── Swipe-to-complete ── */
.swipe-container {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.swipe-container + .swipe-container {
  margin-top: 6px;
}

.swipe-strip {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100%;
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  font-weight: 700;
  font-size: var(--font-size-sm);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.swipe-strip--right {
  left: 0;
  background: var(--success-text);
  justify-content: flex-start;
}

.swipe-strip--left {
  right: 0;
  background: var(--accent);
  justify-content: flex-end;
}

.swipe-strip--undo {
  background: var(--danger-text);
}

.swipe-strip--visible {
  opacity: 1;
}

.swipe-container .task-card {
  position: relative;
  z-index: 1;
  transition: transform 0.2s ease-out;
  margin-top: 0;
}

.swipe-container .task-card + .task-card {
  margin-top: 0;
}

@media (prefers-reduced-motion: reduce) {
  .swipe-container .task-card { transition: none; }
}
```

- [ ] **Step 2: Update renderTaskCard in components.js**

Modify `renderTaskCard()` in `shared/components.js` to wrap its output in a swipe container. Find the `return` statement (around line 229-241) and wrap it:

The current return is:
```js
  return `<button class="task-card${doneClass}...">...</button>`;
```

Replace with:
```js
  const stripRight = completed
    ? `<div class="swipe-strip swipe-strip--right swipe-strip--undo">↩ Undo</div>`
    : `<div class="swipe-strip swipe-strip--right">✓ Done</div>`;
  const stripLeft = `<div class="swipe-strip swipe-strip--left">ℹ Details</div>`;

  return `<div class="swipe-container">
    ${stripRight}
    ${stripLeft}
    <button class="task-card${doneClass}${overdueClass}${eventClass}" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button" aria-pressed="${completed}" style="--owner-color:${ownerColor}${eventStyle}">
      <span class="task-card__avatar">${ownerInitial}</span>
      <div class="task-card__body">
        <span class="task-card__name">${taskName}</span>
        ${tagsRow}
      </div>
      <div class="task-card__right">
        <span class="task-card__meta">${meta}</span>
        ${dateLine}
        <span class="task-card__check"></span>
      </div>
    </button>
  </div>`;
```

- [ ] **Step 3: Create shared/swipe.js**

Create `shared/swipe.js` — a reusable module that sets up swipe handling on a container element.

```js
// swipe.js — Card swipe gesture handler
// Handles swipe-to-complete (right) and swipe-to-details (left) on task cards.
// No DOM rendering — only attaches touch event listeners.

const DEAD_ZONE = 15;        // px before swipe engages
const THRESHOLD_PCT = 0.30;  // 30% of card width to trigger action
const DRAG_RESISTANCE = 0.8; // drag multiplier for feel

/**
 * Initialize swipe handling on a container element.
 * @param {HTMLElement} container - The element containing .swipe-container cards
 * @param {Object} callbacks
 * @param {function(string, string)} callbacks.onComplete - Called with (entryKey, dateKey) on swipe-right
 * @param {function(string, string)} callbacks.onDetails - Called with (entryKey, dateKey) on swipe-left
 * @returns {function} cleanup - Call to remove listeners
 */
export function initSwipe(container, { onComplete, onDetails }) {
  let activeCard = null;
  let startX = 0;
  let startY = 0;
  let swiping = false;
  let cancelled = false;

  function onTouchStart(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;

    activeCard = card;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = false;
    cancelled = false;
  }

  function onTouchMove(e) {
    if (!activeCard || cancelled) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Cancel if vertical movement dominates before swipe engages
    if (!swiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DEAD_ZONE) {
      cancelled = true;
      resetCard();
      return;
    }

    if (!swiping && Math.abs(dx) < DEAD_ZONE) return;
    swiping = true;

    // Prevent vertical scroll while swiping
    e.preventDefault();

    const dragX = dx * DRAG_RESISTANCE;
    activeCard.style.transform = `translateX(${dragX}px)`;
    activeCard.style.transition = 'none';

    // Show appropriate strip
    const wrapper = activeCard.closest('.swipe-container');
    if (!wrapper) return;
    const rightStrip = wrapper.querySelector('.swipe-strip--right');
    const leftStrip = wrapper.querySelector('.swipe-strip--left');
    const cardWidth = activeCard.offsetWidth;
    const pct = Math.abs(dx) / cardWidth;

    if (dx > 0 && rightStrip) {
      rightStrip.classList.toggle('swipe-strip--visible', pct > 0.1);
      if (leftStrip) leftStrip.classList.remove('swipe-strip--visible');
    } else if (dx < 0 && leftStrip) {
      leftStrip.classList.toggle('swipe-strip--visible', pct > 0.1);
      if (rightStrip) rightStrip.classList.remove('swipe-strip--visible');
    }
  }

  function onTouchEnd(e) {
    if (!activeCard || cancelled) {
      activeCard = null;
      return;
    }

    if (!swiping) {
      activeCard = null;
      return;
    }

    const dx = e.changedTouches[0].clientX - startX;
    const cardWidth = activeCard.offsetWidth;
    const pct = Math.abs(dx) / cardWidth;
    const entryKey = activeCard.dataset.entryKey;
    const dateKey = activeCard.dataset.dateKey;

    if (pct >= THRESHOLD_PCT) {
      if (dx > 0 && onComplete) {
        onComplete(entryKey, dateKey);
      } else if (dx < 0 && onDetails) {
        onDetails(entryKey, dateKey);
      }
    }

    resetCard();
    activeCard = null;
  }

  function resetCard() {
    if (!activeCard) return;
    activeCard.style.transform = '';
    activeCard.style.transition = '';
    const wrapper = activeCard.closest('.swipe-container');
    if (wrapper) {
      wrapper.querySelectorAll('.swipe-strip').forEach(s => s.classList.remove('swipe-strip--visible'));
    }
  }

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
  };
}
```

- [ ] **Step 4: Update day-navigation swipe in index.html**

In `index.html`, the existing swipe-to-change-day listener (around line 421-434) needs to ignore swipes that start on a task card. Modify:

Find:
```js
    main.addEventListener('touchstart', (e) => {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });
```

Replace with:
```js
    main.addEventListener('touchstart', (e) => {
      // Don't capture swipes starting on task cards (handled by card swipe)
      if (e.target.closest('.task-card')) return;
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });
```

And in the `touchend` handler, add the same guard:
```js
    main.addEventListener('touchend', (e) => {
      if (e.target.closest('.task-card')) return;
      // ... existing logic
```

- [ ] **Step 5: Import and init swipe in index.html**

Add to the imports at the top of `index.html`:
```js
import { initSwipe } from './shared/swipe.js';
```

After the render function is defined and the main element is set up, initialize swipe:
```js
    initSwipe(main, {
      onComplete: (entryKey, dateKey) => toggleTask(entryKey, dateKey),
      onDetails: (entryKey, dateKey) => openTaskSheet(entryKey, dateKey)
    });
```

- [ ] **Step 6: Import and init swipe in calendar.html**

Add swipe import and initialization in `calendar.html`. The task cards appear inside the calendar day detail sheet. Initialize swipe on the sheet content area after the sheet is rendered. Read `calendar.html` to find where task cards are rendered in the day sheet and init swipe there.

- [ ] **Step 7: Import and init swipe in kid.html**

Same pattern as index.html. Add import and init. Kid.html also has day-navigation swipe — apply the same `.task-card` guard.

- [ ] **Step 8: Commit**

```bash
git add shared/swipe.js shared/components.js styles/components.css index.html calendar.html kid.html
git commit -m "feat: add swipe-to-complete and swipe-to-details on task cards

Swipe right to complete (green strip), left for details (blue strip).
30% threshold to trigger, 0.8x drag resistance for native feel. Coexists
with day-navigation swipe by checking touch target origin.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Offline-first with sync

Enable Firebase offline persistence and rewrite the service worker for app shell caching.

**Files:**
- Modify: `shared/firebase.js:23-31` — add `setPersistenceEnabled(true)` in `initFirebase()`
- Rewrite: `sw.js` — cache-first service worker with versioned app shell
- Modify: `shared/components.js` — add `renderOfflineBanner()`
- Modify: `styles/components.css` — add offline banner styles
- Modify: `index.html`, `calendar.html`, `scoreboard.html`, `tracker.html`, `kid.html`, `admin.html` — show offline/online banners

- [ ] **Step 1: Note on Firebase persistence**

No changes to `shared/firebase.js` are needed for offline support. The Firebase RTDB web compat SDK automatically caches data for active `onValue` listeners and queues writes when offline. When Task 6 switches pages from `readOnce` to `onValue` listeners, offline data access comes for free. The service worker (next step) handles the other half: making the app *load* without a network connection.

- [ ] **Step 2: Rewrite sw.js**

Replace the contents of `sw.js` with a cache-first service worker:

```js
// Service Worker — cache-first for app shell, network-only for Firebase API
const CACHE_NAME = 'family-hub-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/calendar.html',
  '/scoreboard.html',
  '/tracker.html',
  '/kid.html',
  '/admin.html',
  '/setup.html',
  '/manifest.json',
  '/App Icon.png',
  // CSS (modular)
  '/styles/base.css',
  '/styles/layout.css',
  '/styles/components.css',
  '/styles/dashboard.css',
  '/styles/calendar.css',
  '/styles/scoreboard.css',
  '/styles/tracker.css',
  '/styles/admin.css',
  '/styles/kid.css',
  '/styles/responsive.css',
  // JS modules
  '/shared/firebase.js',
  '/shared/scheduler.js',
  '/shared/scoring.js',
  '/shared/state.js',
  '/shared/components.js',
  '/shared/theme.js',
  '/shared/utils.js',
  '/shared/swipe.js',
  // Firebase SDK (CDN — cached cross-origin with CORS)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
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

  // Network-only for Firebase API calls — SDK manages its own caching
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        // Update cache with fresh version (stale-while-revalidate)
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Network failed — cached version is all we have
        return cached;
      });

      // Return cached immediately if available, otherwise wait for network
      return cached || fetchPromise;
    })
  );
});
```

- [ ] **Step 3: Add offline banner component**

Add to `shared/components.js`:

```js
export function renderOfflineBanner(message) {
  return `<div class="offline-banner" role="status" aria-live="polite">
    <span class="offline-banner__dot"></span>
    <span class="offline-banner__text">${esc(message)}</span>
  </div>`;
}
```

- [ ] **Step 4: Add offline banner CSS**

Add to `styles/components.css`:

```css
/* ── Offline banner ── */
@keyframes bannerSlideIn {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.offline-banner {
  position: fixed;
  top: var(--header-height);
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--warning-bg);
  color: var(--warning-text);
  font-size: var(--font-size-sm);
  font-weight: 600;
  z-index: 99;
  animation: bannerSlideIn 0.3s ease-out;
}

.offline-banner--online {
  background: var(--success-bg);
  color: var(--success-text);
}

.offline-banner__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning-text);
}

.offline-banner--online .offline-banner__dot {
  background: var(--success-text);
}
```

- [ ] **Step 5: Add offline banner logic to index.html**

In `index.html`, find the `onConnectionChange` usage. Add banner show/hide logic. After the existing connection handling code, add:

```js
    // ── Offline/Online banner ──
    const bannerMount = document.createElement('div');
    bannerMount.id = 'offlineBannerMount';
    document.body.appendChild(bannerMount);

    let bannerTimer = null;
    let wasOffline = false;

    onConnectionChange((connected) => {
      if (bannerTimer) clearTimeout(bannerTimer);
      if (!connected) {
        wasOffline = true;
        bannerMount.innerHTML = renderOfflineBanner('Working offline — changes will sync');
        bannerTimer = setTimeout(() => { bannerMount.innerHTML = ''; }, 3000);
      } else if (wasOffline) {
        bannerMount.innerHTML = renderOfflineBanner('Back online');
        bannerMount.querySelector('.offline-banner')?.classList.add('offline-banner--online');
        bannerTimer = setTimeout(() => { bannerMount.innerHTML = ''; }, 2000);
      }
    });
```

Add `renderOfflineBanner` to the import line for components.js in index.html.

- [ ] **Step 6: Add offline banner to other pages**

Apply the same offline banner pattern to: `calendar.html`, `scoreboard.html`, `tracker.html`, `kid.html`, `admin.html`. Each page already imports `onConnectionChange` or can add it. Read each page to find where connection handling exists and add the banner logic.

For kid.html, the banner should appear without requiring layout.css (it uses fixed positioning, so it works standalone).

- [ ] **Step 7: Commit**

```bash
git add sw.js shared/firebase.js shared/components.js styles/components.css index.html calendar.html scoreboard.html tracker.html kid.html admin.html
git commit -m "feat: add offline-first support with service worker app shell caching

Cache-first service worker pre-caches all HTML, CSS, JS, and Firebase SDK.
Firebase API calls remain network-only (SDK handles its own caching).
Offline/online banners show on connection status changes.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Real-time listeners

Replace one-shot reads with Firebase `onValue` listeners for completions, schedule, and settings on live pages.

**Files:**
- Modify: `shared/firebase.js` — add `onCompletions()`, `onScheduleDay()`, `onSettings()` convenience wrappers
- Modify: `shared/utils.js` — add `debounce()` utility
- Modify: `index.html` — replace one-shot reads with listeners, debounced render
- Modify: `calendar.html` — same
- Modify: `kid.html` — same

- [ ] **Step 1: Add debounce utility to utils.js**

Add to the end of `shared/utils.js`:

```js
/**
 * Debounce a function — delays invocation until `ms` milliseconds after the
 * last call. Returns a wrapper function with a .cancel() method.
 */
export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return debounced;
}
```

- [ ] **Step 2: Add listener wrappers to firebase.js**

Add to `shared/firebase.js` after the existing `onValue` export:

```js
/**
 * Subscribe to all completions (real-time).
 * Returns an unsubscribe function.
 */
export function onCompletions(callback) {
  return onValue('completions', callback);
}

/**
 * Subscribe to a single day's schedule entries (real-time).
 * Returns an unsubscribe function.
 */
export function onScheduleDay(dateKey, callback) {
  return onValue(`schedule/${dateKey}`, callback);
}

/**
 * Subscribe to settings changes (real-time).
 * Returns an unsubscribe function.
 */
export function onSettings(callback) {
  return onValue('settings', callback);
}
```

- [ ] **Step 3: Update index.html to use real-time listeners**

This is the most involved change. In `index.html`:

1. Add `debounce` to the utils.js import:
```js
import { todayKey, addDays, formatDateLong, formatDateShort, DAY_NAMES, dayOfWeek, escapeHtml, debounce } from './shared/utils.js';
```

2. Add `onCompletions`, `onScheduleDay` to the firebase.js import.

3. Replace the one-shot completion read with a listener. Find where `completions` is loaded (it should be a `readCompletions()` call). Replace with:

```js
    let completions = {};
    const debouncedRender = debounce(() => render(), 100);

    // Real-time completions listener
    onCompletions((val) => {
      completions = val || {};
      debouncedRender();
    });
```

4. For schedule, add a listener that resubscribes when `viewDate` changes. Find `loadData()` and modify it:

```js
    let unsubSchedule = null;

    function subscribeSchedule(dateKey) {
      if (unsubSchedule) unsubSchedule();
      unsubSchedule = onScheduleDay(dateKey, (val) => {
        viewEntries = val || {};
        debouncedRender();
      });
    }

    subscribeSchedule(viewDate);
```

5. Update `changeDay()` to resubscribe:
```js
    async function changeDay(delta) {
      viewDate = addDays(viewDate, delta);
      celebrationShown = false;
      overdueExpanded = false;
      subscribeSchedule(viewDate);
      // Overdue entries still use one-shot (they span multiple dates)
      overdueItems = viewDate === today ? await getOverdueEntries(...) : [];
      render();
    }
```

6. The initial `loadData()` call can be simplified — completions come from the listener, schedule comes from `subscribeSchedule`. Overdue entries still need a one-shot read since they span multiple past dates.

Read the full `loadData()` function in `index.html` to understand what it currently fetches, then restructure to use listeners for completions and today's schedule while keeping one-shot reads for overdue entries.

- [ ] **Step 4: Update calendar.html to use real-time listeners**

Calendar.html loads `allSchedule` (all dates) and `completions` at startup. The completions listener is the most valuable here — same pattern as index.html. For schedule, the calendar shows a month grid, so keeping `readAllSchedule` as one-shot is fine. Just add a completions listener:

1. Add `debounce` import and `onCompletions` import.
2. Replace `readCompletions()` with `onCompletions` listener.
3. Wrap render in debounce.

- [ ] **Step 5: Update kid.html to use real-time listeners**

Same pattern as index.html. Kid.html loads schedule for `viewDate` and completions. Add:
1. `debounce` import
2. `onCompletions` listener
3. `onScheduleDay` with resubscribe on date change

Read kid.html's `loadData()` equivalent to understand the current data flow and restructure.

- [ ] **Step 6: Commit**

```bash
git add shared/utils.js shared/firebase.js index.html calendar.html kid.html
git commit -m "feat: add real-time listeners for completions and schedule

Completions and per-day schedule now use Firebase onValue listeners
instead of one-shot reads. Family members see each other's task
completions in real-time. Renders are debounced at 100ms to prevent
thrashing during bulk operations.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update CLAUDE.md

Update the project documentation to reflect the new file structure and architecture.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update file structure section**

Update the file structure in CLAUDE.md to show the new CSS files and `shared/swipe.js`:

```
├── shared/
│   ├── firebase.js       ← Firebase init + CRUD helpers + real-time listener wrappers
│   ├── scheduler.js      ← Schedule generation
│   ├── scoring.js        ← Points formula, letter grades, snapshots, streaks
│   ├── state.js          ← Completion queries, entry filtering/sorting/grouping
│   ├── components.js     ← All reusable HTML rendering
│   ├── theme.js          ← Theme presets, CSS variable generation
│   ├── utils.js          ← Date math, timezone, formatting, debounce
│   └── swipe.js          ← Card swipe gesture handler (touch events)
└── styles/
    ├── base.css          ← CSS variables, reset, typography
    ├── layout.css        ← Header, nav bar, page-content
    ├── components.css    ← Task cards, buttons, forms, badges, swipe containers
    ├── dashboard.css     ← Date header, time sections, detail sheet, celebration
    ├── calendar.css      ← Calendar grid, day cells, day sheet
    ├── scoreboard.css    ← Leaderboard, sparklines, category breakdown
    ├── tracker.css       ← Status rows, filters, weekly/monthly grids
    ├── admin.css         ← Admin forms, tabs, PIN screen, setup wizard
    ├── kid.css           ← Kid mode specific styles
    └── responsive.css    ← Breakpoint overrides (400px, 768px, 1024px)
```

- [ ] **Step 2: Update architecture decisions**

Add/update these points:
- **CSS split:** Styles are split into 10 files by responsibility. Each page loads only the CSS it needs via multiple `<link>` tags. Order matters: base → layout → components → page-specific → responsive.
- **Offline support:** Service worker caches the full app shell (cache-first strategy). Firebase API calls are network-only. The app loads and functions offline; writes queue and sync on reconnect.
- **Real-time updates:** Dashboard, calendar, and kid mode use Firebase `onValue` listeners for completions and schedule. Renders are debounced at 100ms. Scoreboard and tracker use one-shot reads (historical data).
- **Swipe gestures:** Card swipes (complete/details) coexist with day-navigation swipes via touch target detection. Implemented in `shared/swipe.js`.

- [ ] **Step 3: Update Gotchas**

Add:
- SW cache list must be updated manually when files are added/renamed (bump `CACHE_NAME` version)
- CSS `<link>` tag order matters: base, layout, components, page-specific, responsive
- `swipe.js` touchmove uses `passive: false` to call `preventDefault()` during horizontal swipes

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for modular CSS, offline, real-time, swipe

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
