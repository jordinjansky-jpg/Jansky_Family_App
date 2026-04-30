# AI Features Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish all AI import entry points across kitchen.js, calendar.html, and admin.html — shared image resize, tap-to-deselect confirm rows with confidence indicators, consistent loading/empty/error states, and a redesigned email imports inbox.

**Architecture:** New `shared/ai-helpers.js` exports `resizeImageForUpload`, `renderConfirmRow`, and `openMonthClarificationSheet`. Each page imports what it needs. Confirm screens migrate from checkboxes to tap-to-deselect via CSS class toggling (`is-deselected`). No new Firebase schema; email imports reads the existing `rundown/emailImports` node. The month clarification sheet is extracted from calendar.html and made a document-level overlay (appended to body) so it works in both calendar.html and admin.html without either page needing a shared mount point.

**Spec:** `docs/superpowers/specs/2026-04-29-ai-features-polish.md`

**Tech Stack:** Vanilla ES modules (`.js` extension required on all imports), Firebase RTDB compat SDK (`firebase.` global), Cloudflare Worker at `https://kitchen-import.jordin-jansky.workers.dev`. No bundler, no npm. No test runner — verify steps are manual browser checks.

---

## File Map

| Action | File | What changes |
|---|---|---|
| **Create** | `shared/ai-helpers.js` | `resizeImageForUpload`, `renderConfirmRow`, `openMonthClarificationSheet` |
| **Modify** | `styles/components.css` | `.confirm-row`, `.confidence-dot`, `.ai-loading` spinner |
| **Modify** | `kitchen.js` | Image resize, photo-to-list redesign, recipe photo empty state |
| **Modify** | `calendar.html` | Image resize, confirm redesign, month clarification refactor, iCal/parseEvent state fixes |
| **Modify** | `admin.html` | Image resize, school lunch + task scanner + email imports redesigns |
| **Modify** | `sw.js` | Add `shared/ai-helpers.js` to cache list, bump CACHE_NAME |

---

### Task 1: Create `shared/ai-helpers.js`

**Files:**
- Create: `shared/ai-helpers.js`

- [ ] **Step 1: Create the file with all three exports**

```javascript
// shared/ai-helpers.js

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CHECK_FILLED = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="currentColor"/><path d="M6.5 11l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK_EMPTY = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="1.5"/></svg>`;

/**
 * Resize an image file to max 1092px on its longest side before base64 encoding.
 * PDFs are passed through unchanged.
 * @param {File} file
 * @param {number} maxPx
 * @returns {Promise<{base64: string, mediaType: string}>}
 */
export async function resizeImageForUpload(file, maxPx = 1092) {
  if (file.type === 'application/pdf') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: 'application/pdf' });
      reader.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Render a single tap-to-deselect confirm row as an HTML string.
 * Mount rows inside a <div class="confirm-list"> container.
 * The page owns: click delegation on .confirm-list, toggling .is-deselected, reading selected state.
 *
 * @param {object} item
 * @param {object} opts
 * @param {string}  opts.labelKey         - item property for the main label
 * @param {string}  [opts.subKey]         - item property for the sub-label
 * @param {string}  [opts.confidenceKey]  - item property for 'high'|'medium'|'low'
 * @param {string}  [opts.subConfidenceKey] - item property controlling sub-label amber color
 * @param {number|string} [opts.key]      - value for data-key (use array index)
 */
export function renderConfirmRow(item, { labelKey = 'name', subKey, confidenceKey, subConfidenceKey, key = '' } = {}) {
  const label = item[labelKey] ?? '';
  const sub = subKey != null ? (item[subKey] ?? '') : null;
  const confidence = confidenceKey ? item[confidenceKey] : null;
  const subConfidence = subConfidenceKey ? item[subConfidenceKey] : null;
  const isLow = confidence === 'low';
  const hasDot = confidence === 'medium' || confidence === 'low';
  const dot = hasDot ? `<span class="confidence-dot" aria-hidden="true">·</span>` : '';
  const rowClass = ['confirm-row', isLow ? 'confidence-low' : ''].filter(Boolean).join(' ');
  const subClass = ['confirm-row__sub', subConfidence === 'low' ? 'confidence-date-low' : ''].filter(Boolean).join(' ');
  return `<div class="${rowClass}" data-key="${key}">
  <div class="confirm-row__body">
    <span class="confirm-row__label">${dot}${esc(label)}</span>
    ${sub ? `<span class="${subClass}">${esc(sub)}</span>` : ''}
  </div>
  <div class="confirm-row__check">
    <span class="check-filled">${CHECK_FILLED}</span>
    <span class="check-empty">${CHECK_EMPTY}</span>
  </div>
</div>`;
}

/**
 * Mount a bottom-sheet overlay (appended to document.body) asking the user to
 * confirm the month for an AI result where monthUncertain === true.
 * Calls onConfirm(yearMonth) where yearMonth is a YYYY-MM string (e.g. "2026-05").
 * @param {string} assumedMonth - human-readable e.g. "May 2026"
 * @param {function} onConfirm
 * @returns {{ close: function }}
 */
export function openMonthClarificationSheet(assumedMonth, onConfirm) {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const parts = (assumedMonth || '').split(' ');
  const mIdx = monthNames.findIndex(m => m.toLowerCase() === (parts[0] || '').toLowerCase());
  const year = parseInt(parts[1], 10);
  const monthVal = (mIdx >= 0 && year) ? `${year}-${String(mIdx + 1).padStart(2, '0')}` : '';

  const overlay = document.createElement('div');
  overlay.className = 'bottom-sheet-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="bottom-sheet">
      <div class="bottom-sheet__handle"></div>
      <div class="bottom-sheet__content">
        <div class="sheet__header">
          <h2 class="sheet__title">Confirm month</h2>
        </div>
        <div class="sheet__content">
          <p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:var(--spacing-md)">
            I couldn't clearly read the month${assumedMonth ? ` — I guessed <strong>${esc(assumedMonth)}</strong>` : ''}. Set the correct month to continue.
          </p>
          <div class="field">
            <label class="field__label" for="monthClarifyInput">Month</label>
            <input type="month" class="field__input" id="monthClarifyInput" value="${monthVal}">
          </div>
        </div>
        <div class="sheet__footer">
          <button class="btn btn--ghost" id="monthClarifyCancel">Cancel</button>
          <button class="btn btn--primary" id="monthClarifyConfirm">Continue</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  function close() {
    overlay.classList.remove('active');
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 320);
  }

  overlay.querySelector('#monthClarifyCancel').addEventListener('click', close);
  overlay.querySelector('#monthClarifyConfirm').addEventListener('click', () => {
    const val = overlay.querySelector('#monthClarifyInput').value;
    close();
    if (val) onConfirm(val);
  });

  return { close };
}
```

- [ ] **Step 2: Verify the file is importable**

Open any page that has `<script type="module">` in the browser console and run:

```javascript
import('/shared/ai-helpers.js').then(m => console.log(Object.keys(m)));
// Expected: ['resizeImageForUpload', 'renderConfirmRow', 'openMonthClarificationSheet']
```

No errors. Module loads.

- [ ] **Step 3: Commit**

```bash
git add shared/ai-helpers.js
git commit -m "feat(ai): add shared/ai-helpers.js — resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet"
```

---

### Task 2: CSS additions for confirm rows and loading spinner

**Files:**
- Modify: `styles/components.css` (append to end of file)

- [ ] **Step 1: Append confirm-row styles to `styles/components.css`**

```css
/* ── AI confirm rows ──────────────────────────────────────────── */
.confirm-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.confirm-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s, background 0.1s;
}

.confirm-row:active {
  background: var(--bg-secondary);
}

.confirm-row.confidence-low {
  opacity: 0.7;
}

.confirm-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.confirm-row__label {
  font-size: var(--font-size-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s, text-decoration 0.15s;
}

.confirm-row.is-deselected .confirm-row__label {
  text-decoration: line-through;
  color: var(--text-muted);
}

.confirm-row__sub {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.confirm-row__sub.confidence-date-low {
  color: var(--c-warning);
}

.confirm-row__check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  color: var(--accent);
}

.confirm-row.is-deselected .confirm-row__check {
  color: var(--border);
}

.confirm-row .check-filled { display: block; }
.confirm-row .check-empty  { display: none;  }
.confirm-row.is-deselected .check-filled { display: none;  }
.confirm-row.is-deselected .check-empty  { display: block; }

.confidence-dot {
  color: var(--c-warning);
  margin-right: 4px;
  font-size: 1.1em;
  line-height: 1;
}

/* ── AI loading state ─────────────────────────────────────────── */
.ai-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl) 0;
  gap: var(--spacing-sm);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.ai-loading__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: ai-spin 0.7s linear infinite;
}

@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ai-loading__spinner { animation: none; border-top-color: var(--accent); opacity: 0.6; }
}
```

- [ ] **Step 2: Verify styles render correctly**

Open any page in the browser. In the DevTools console:

```javascript
document.body.insertAdjacentHTML('beforeend', `
  <div style="padding:16px;background:var(--bg);max-width:320px;border:1px solid var(--border);border-radius:8px;margin:16px">
    <div class="confirm-list">
      <div class="confirm-row" data-key="0">
        <div class="confirm-row__body">
          <span class="confirm-row__label">Milk</span>
          <span class="confirm-row__sub">dairy</span>
        </div>
        <div class="confirm-row__check">
          <span class="check-filled"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="currentColor"/><path d="M6.5 11l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span class="check-empty"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </div>
      </div>
      <div class="confirm-row confidence-low is-deselected" data-key="1">
        <div class="confirm-row__body">
          <span class="confirm-row__label"><span class="confidence-dot">·</span>Eggs?</span>
          <span class="confirm-row__sub">produce</span>
        </div>
        <div class="confirm-row__check">
          <span class="check-filled"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="currentColor"/><path d="M6.5 11l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span class="check-empty"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </div>
      </div>
    </div>
    <div class="ai-loading" style="margin-top:12px"><div class="ai-loading__spinner"></div>Scanning photo…</div>
  </div>`);
```

Expected:
- Row 1: accent checkmark, full opacity, label normal
- Row 2: empty circle, 70% opacity, label struck through, amber `·` dot
- Spinner animates below the rows
- No inline styles bleeding or double-padding

- [ ] **Step 3: Commit**

```bash
git add styles/components.css
git commit -m "feat(ai): add confirm-row and ai-loading CSS to components.css"
```

---

### Task 3: Image resize and loading/empty/error state standardisation — `kitchen.js`

**Files:**
- Modify: `kitchen.js`

Context: three `FileReader` blocks need replacing.
1. Recipe photo (screenshot) import — around line 943
2. Photo-to-list camera/gallery handler — around line 1532
3. The `runImport` function needs an empty-recipe fallback

- [ ] **Step 1: Add import at the top of the `<script type="module">` block in `kitchen.js`**

Find the existing import block (first few lines of the module script). Add:

```javascript
import { resizeImageForUpload, renderConfirmRow } from './shared/ai-helpers.js';
```

- [ ] **Step 2: Replace the recipe screenshot FileReader (around line 946–951)**

Find this block:
```javascript
  document.getElementById('screenshotInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      runImport('screenshot', { base64, mediaType: file.type || 'image/jpeg' }, 'importScreenshotBtn', 'screenshotStatus');
    };
    reader.readAsDataURL(file);
  });
```

Replace with:
```javascript
  document.getElementById('screenshotInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { base64, mediaType } = await resizeImageForUpload(file);
    runImport('screenshot', { base64, mediaType }, 'importScreenshotBtn', 'screenshotStatus');
  });
```

- [ ] **Step 3: Add empty-recipe fallback inside `runImport` (around line 900–906)**

Find the block that handles `data.error`:
```javascript
      if (data.error) {
        status.textContent = data.error === 'not a recipe' ? 'No recipe found.' : 'Import failed.';
        status.style.color = 'var(--danger)';
        status.style.display = 'inline';
        return;
      }
```

Replace with:
```javascript
      if (data.error) {
        status.textContent = data.error === 'not a recipe' ? 'No recipe found.' : 'Import failed.';
        status.style.color = 'var(--danger)';
        status.style.display = 'inline';
        return;
      }
      if (!data.name && !data.ingredients?.length) {
        status.textContent = 'Couldn\'t read that URL — check the link or try a photo instead.';
        status.style.color = 'var(--text-muted)';
        status.style.display = 'inline';
        return;
      }
```

- [ ] **Step 4: Replace the photo-to-list FileReader (around line 1541–1545)**

Find this block inside `openPhotoToListSheet`:
```javascript
          const base64 = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file);
          });
          const resp = await fetch(KITCHEN_WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'photoToList', input: { base64, mediaType: file.type || 'image/jpeg' } }),
          });
```

Replace with:
```javascript
          const { base64, mediaType } = await resizeImageForUpload(file);
          const resp = await fetch(KITCHEN_WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'photoToList', input: { base64, mediaType } }),
          });
```

- [ ] **Step 5: Standardise the loading state inside `openPhotoToListSheet` (around line 1534–1540)**

Find:
```javascript
        mount.innerHTML = renderBottomSheet(`
          <div class="sheet__header"><h2 class="sheet__title">Scanning photo…</h2></div>
          <div class="sheet__content" style="text-align:center;padding:var(--spacing-xl) 0">
            <span style="color:var(--text-muted);font-size:var(--font-sm)">Identifying items…</span>
          </div>`);
```

Replace with:
```javascript
        mount.innerHTML = renderBottomSheet(`
          <div class="sheet__header"><h2 class="sheet__title">Scan for items</h2></div>
          <div class="sheet__content">
            <div class="ai-loading">
              <div class="ai-loading__spinner"></div>
              Scanning photo…
            </div>
          </div>`);
```

- [ ] **Step 6: Standardise empty and error states inside `openPhotoToListSheet`**

Find the empty-result block:
```javascript
          if (data.error || !data.items?.length) {
            mount.innerHTML = renderBottomSheet(`
              <div class="sheet__header"><h2 class="sheet__title">No items found</h2></div>
              <div class="sheet__content"><p style="color:var(--text-muted);font-size:var(--font-sm)">${data.error || 'No items detected in that photo.'}</p></div>
              <div class="sheet__footer"><button class="btn btn--secondary" id="ptlClose">Close</button></div>`);
```

Replace with:
```javascript
          if (data.error || !data.items?.length) {
            mount.innerHTML = renderBottomSheet(`
              <div class="sheet__header"><h2 class="sheet__title">Scan for items</h2></div>
              <div class="sheet__content">
                <p style="color:var(--text-muted);font-size:var(--font-size-sm)">No items detected — try a clearer photo.</p>
              </div>
              <div class="sheet__footer">
                <button class="btn btn--secondary" id="ptlRetry">Try again</button>
              </div>`);
            activateSheet(mount);
            mount.querySelector('#ptlRetry')?.addEventListener('click', () => openPhotoToListSheet());
            return;
          }
```

Find the catch block:
```javascript
        } catch {
          mount.innerHTML = renderBottomSheet(`
            <div class="sheet__header"><h2 class="sheet__title">Error</h2></div>
            <div class="sheet__content"><p style="color:var(--text-muted);font-size:var(--font-sm)">Could not reach import service. Check your connection.</p></div>
            <div class="sheet__footer"><button class="btn btn--secondary" id="ptlClose">Close</button></div>`);
            activateSheet(mount);
            mount.querySelector('#ptlClose')?.addEventListener('click', () => { mount.innerHTML = ''; });
```

Replace with:
```javascript
        } catch (err) {
          mount.innerHTML = renderBottomSheet(`
            <div class="sheet__header"><h2 class="sheet__title">Scan for items</h2></div>
            <div class="sheet__content">
              <p style="color:var(--text-muted);font-size:var(--font-size-sm)">Something went wrong.</p>
              <p style="color:var(--text-muted);font-size:var(--font-size-xs)">${err?.message || 'Check your connection.'}</p>
            </div>
            <div class="sheet__footer">
              <button class="btn btn--secondary" id="ptlRetry">Try again</button>
            </div>`);
          activateSheet(mount);
          mount.querySelector('#ptlRetry')?.addEventListener('click', () => openPhotoToListSheet());
```

- [ ] **Step 7: Rewrite `renderPhotoToListConfirm` to use `renderConfirmRow` with tap-to-deselect**

Replace the entire `renderPhotoToListConfirm` function (around lines 1575–1599) with:

```javascript
function renderPhotoToListConfirm(mount, items) {
  const rows = items.map((item, i) => renderConfirmRow(
    { ...item, _cat: item.category || 'Uncategorised' },
    { labelKey: 'name', subKey: '_cat', confidenceKey: 'confidence', key: i }
  )).join('');

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header"><h2 class="sheet__title">Add to list</h2></div>
    <div class="sheet__content">
      <div class="confirm-list" id="ptlList">${rows}</div>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="ptlCancel">Cancel</button>
      <button class="btn btn--primary" id="ptlAdd">Add ${items.length} item${items.length !== 1 ? 's' : ''}</button>
    </div>`);
  activateSheet(mount);

  const list = mount.querySelector('#ptlList');
  const addBtn = mount.querySelector('#ptlAdd');

  function updateBtn() {
    const n = list.querySelectorAll('.confirm-row:not(.is-deselected)').length;
    addBtn.textContent = `Add ${n} item${n !== 1 ? 's' : ''}`;
    addBtn.disabled = n === 0;
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.confirm-row');
    if (!row) return;
    row.classList.toggle('is-deselected');
    updateBtn();
  });

  mount.querySelector('#ptlCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  addBtn.addEventListener('click', async () => {
    const selected = [...list.querySelectorAll('.confirm-row:not(.is-deselected)')]
      .map(row => items[+row.dataset.key].name);
    mount.innerHTML = '';
    for (const name of selected) await addItemToActiveList(name);
  });
}
```

- [ ] **Step 8: Verify in browser**

Open kitchen.html → Lists tab → FAB → "Scan fridge / pantry" → Gallery → pick any photo.

Expected:
- Loading state shows spinner + "Scanning photo…" while Worker runs
- Confirm screen shows tap-to-deselect rows (no checkboxes)
- Low-confidence items show amber dot + 70% opacity
- Tapping a row toggles strikethrough + empty circle
- Button count updates live
- "Add 0 items" is disabled
- Try again from error/empty states re-opens the picker

- [ ] **Step 9: Commit**

```bash
git add kitchen.js
git commit -m "feat(ai): kitchen.js image resize, photo-to-list tap-to-deselect rows, loading/error state fixes"
```

---

### Task 4: Image resize — `calendar.html` and `admin.html`

**Files:**
- Modify: `calendar.html`
- Modify: `admin.html`

- [ ] **Step 1: Add import to `calendar.html` module script**

Find the existing `import` block near the top of the `<script type="module">` tag in calendar.html. Add:

```javascript
import { resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet } from './shared/ai-helpers.js';
```

- [ ] **Step 2: Replace the FileReader in `openCalendarPhotoImport` (calendar.html ~line 707)**

Find:
```javascript
                const base64 = await new Promise((res, rej) => {
                  const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file);
                });
                const resp = await fetch(KITCHEN_WORKER_URL, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'calendarPhoto', input: { base64, mediaType: file.type || 'image/jpeg', contextDate: today } }),
                });
```

Replace with:
```javascript
                const { base64, mediaType } = await resizeImageForUpload(file);
                const resp = await fetch(KITCHEN_WORKER_URL, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'calendarPhoto', input: { base64, mediaType, contextDate: today } }),
                });
```

- [ ] **Step 3: Add import to `admin.html` module script**

Find the existing `import` block near the top of the `<script type="module">` tag in admin.html. Add:

```javascript
import { resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet } from './shared/ai-helpers.js';
```

- [ ] **Step 4: Replace the FileReader in `onSchoolLunch` (admin.html ~line 3982)**

Find:
```javascript
          const base64 = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file);
          });
          const resp = await fetch(KITCHEN_WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'schoolLunch', input: { base64, mediaType: file.type || 'application/pdf' } }),
          });
```

Replace with:
```javascript
          const { base64, mediaType } = await resizeImageForUpload(file);
          const resp = await fetch(KITCHEN_WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'schoolLunch', input: { base64, mediaType } }),
          });
```

- [ ] **Step 5: Replace the FileReader in `onTaskScan` (admin.html ~line 4014)**

Find:
```javascript
          const base64 = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file);
          });
          const resp = await fetch(KITCHEN_WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'taskScan', input: { base64, mediaType: file.type || 'image/jpeg', contextDate: todayKey(settings?.timezone || 'America/Chicago') } }),
          });
```

Replace with:
```javascript
          const { base64, mediaType } = await resizeImageForUpload(file);
          const resp = await fetch(KITCHEN_WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'taskScan', input: { base64, mediaType, contextDate: todayKey(settings?.timezone || 'America/Chicago') } }),
          });
```

- [ ] **Step 6: Verify resize is working**

In browser DevTools Network tab, trigger any photo import (school lunch, calendar photo, task scan). In the Worker request payload, confirm:
- `mediaType` is `"image/jpeg"` (not `"image/heic"` or original type)
- Request body size is under 500KB for a typical phone photo

- [ ] **Step 7: Commit**

```bash
git add calendar.html admin.html
git commit -m "feat(ai): replace raw FileReader with resizeImageForUpload in calendar.html and admin.html"
```

---

### Task 5: Calendar photo confirm, month clarification refactor, iCal and parseEvent fixes — `calendar.html`

**Files:**
- Modify: `calendar.html`

- [ ] **Step 1: Replace `openMonthClarificationSheet` with the shared helper**

The local `openMonthClarificationSheet` function (around line 757) in calendar.html takes `(events, assumedMonth)` and calls `openImportEventsConfirm` after the user picks a month. We're replacing it with the shared helper, which calls a callback. Also delete the `remapEventMonth` helper since we'll inline the remap.

Delete the local `remapEventMonth` function (around line 750–755) and the local `openMonthClarificationSheet` function (around lines 757–785).

In `openCalendarPhotoImport`, find the block that calls the local month clarification:
```javascript
                if (data.monthUncertain) {
                  setTimeout(() => openMonthClarificationSheet(data.events, data.assumedMonth), 320);
                } else {
                  setTimeout(() => openImportEventsConfirm(data.events, false), 320);
                }
```

Replace with:
```javascript
                if (data.monthUncertain) {
                  setTimeout(() => {
                    openMonthClarificationSheet(data.assumedMonth, (yearMonth) => {
                      const remapped = data.events.map(ev => ev.date
                        ? { ...ev, date: `${yearMonth}-${ev.date.slice(8, 10)}` }
                        : ev);
                      openImportEventsConfirm(remapped, false);
                    });
                  }, 320);
                } else {
                  setTimeout(() => openImportEventsConfirm(data.events, false), 320);
                }
```

- [ ] **Step 2: Rewrite `openImportEventsConfirm` to use `renderConfirmRow` with confidence + dateConfidence**

Replace the entire `openImportEventsConfirm` function (starting around line 829) with:

```javascript
    function openImportEventsConfirm(eventsArr, hadRecurring) {
      const formatDate = (d) => {
        if (!d) return '—';
        const [y, m, day] = d.split('-');
        return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };

      const recurringBanner = hadRecurring
        ? `<div class="banner banner--info" role="status" style="margin-bottom:var(--spacing-sm)">Recurring events were skipped — only one-time events are supported.</div>`
        : '';

      const enriched = eventsArr.map((ev, i) => ({
        ...ev,
        _sub: `${formatDate(ev.date)}${ev.time ? ' · ' + ev.time : ev.allDay ? ' · All day' : ''}`,
        _key: i,
      }));

      const rows = enriched.map((ev, i) => renderConfirmRow(ev, {
        labelKey: 'name',
        subKey: '_sub',
        confidenceKey: 'confidence',
        subConfidenceKey: 'dateConfidence',
        key: i,
      })).join('');

      const n = eventsArr.length;

      taskSheetMount.innerHTML = renderBottomSheet(`
        <div class="sheet__header"><h2 class="sheet__title">Import events</h2></div>
        <div class="sheet__content">
          ${recurringBanner}
          <div class="confirm-list" id="ievList">${rows}</div>
        </div>
        <div class="sheet__footer">
          <button class="btn btn--secondary" id="ievCancel">Cancel</button>
          <button class="btn btn--primary" id="ievImport">Import ${n} event${n !== 1 ? 's' : ''}</button>
        </div>`);
      applyDataColors(taskSheetMount);
      requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

      const list = taskSheetMount.querySelector('#ievList');
      const importBtn = taskSheetMount.querySelector('#ievImport');

      function updateBtn() {
        const count = list.querySelectorAll('.confirm-row:not(.is-deselected)').length;
        importBtn.textContent = `Import ${count} event${count !== 1 ? 's' : ''}`;
        importBtn.disabled = count === 0;
      }

      list.addEventListener('click', (e) => {
        const row = e.target.closest('.confirm-row');
        if (!row) return;
        row.classList.toggle('is-deselected');
        updateBtn();
      });

      taskSheetMount.querySelector('#ievCancel')?.addEventListener('click', closeTaskSheet);

      importBtn.addEventListener('click', async () => {
        const selected = [...list.querySelectorAll('.confirm-row:not(.is-deselected)')]
          .map(row => eventsArr[+row.dataset.key]);
        closeTaskSheet();
        for (const ev of selected) {
          const newId = await pushEvent({
            name: ev.name, date: ev.date, allDay: ev.allDay ?? true,
            startTime: ev.time || null, endTime: null,
            color: people?.[0]?.color || '#4285f4',
            people: [], notes: ev.notes || null, url: null,
          });
          const schedKey = `sched_${Date.now()}_im_${Math.random().toString(36).slice(2, 6)}`;
          await multiUpdate({ [`schedule/${ev.date}/${schedKey}`]: { type: 'event', eventId: newId } });
        }
        showToast(`${selected.length} event${selected.length !== 1 ? 's' : ''} added`);
        loadData();
        render();
      });
    }
```

**Note:** `pushEvent` and `multiUpdate` are used here — confirm they are defined/imported in calendar.html before this function runs. If not, check the existing `em-import` button handler in admin.html which already calls `pushEvent`; calendar.html may use a different helper. Match whatever pattern creates events in the existing calendar FAB handler.

- [ ] **Step 3: Standardise iCal loading and empty states**

In `openIcalImportSheet`, the `icalImport` click handler currently sets `btn.textContent = 'Importing…'` and shows status text. Replace the status text approach with a proper loading state by updating the import button text. The loading text "Importing calendar…" is shown in the existing `status` element — this is acceptable since it's inside a form field, not a full sheet reload. No change needed here unless the status element is missing; it exists at line 636.

For the empty-events case (line 658):
```javascript
          if (!data.events?.length) { if (status) status.textContent = 'No upcoming events found in that calendar.'; btn.disabled = false; btn.textContent = 'Import'; return; }
```

Replace with:
```javascript
          if (!data.events?.length) {
            if (status) status.textContent = 'No events found in that calendar.';
            btn.disabled = false; btn.textContent = 'Import';
            return;
          }
```

- [ ] **Step 4: Add parseEvent empty/error state**

In `openTextEventSheet`, the `doParse` function currently does nothing visible when Worker returns a null/no-event result (it only checks `data.error`). After the `data.error` check, add:

```javascript
          if (data.error) { if (status) status.textContent = data.error; btn.disabled = false; btn.textContent = 'Add'; return; }
          if (!data.name) {
            if (status) status.textContent = 'Couldn\'t parse that — try being more specific (e.g. "dentist Friday May 2 at 3pm").';
            btn.disabled = false; btn.textContent = 'Add';
            return;
          }
```

- [ ] **Step 5: Standardise calendar photo loading state (around line 699)**

Find:
```javascript
              taskSheetMount.innerHTML = renderBottomSheet(`
                <div class="sheet__header"><h2 class="sheet__title">Reading photo…</h2></div>
                <div class="sheet__content" style="text-align:center;padding:var(--spacing-xl) 0">
                  <span style="color:var(--text-muted);font-size:var(--font-sm)">Extracting events…</span>
                </div>`);
```

Replace with:
```javascript
              taskSheetMount.innerHTML = renderBottomSheet(`
                <div class="sheet__header"><h2 class="sheet__title">Photo of flyer</h2></div>
                <div class="sheet__content">
                  <div class="ai-loading">
                    <div class="ai-loading__spinner"></div>
                    Reading calendar…
                  </div>
                </div>`);
```

- [ ] **Step 6: Standardise calendar photo empty and error states**

Find the empty-events block (around line 716):
```javascript
                if (data.error || !data.events?.length) {
                  setTimeout(() => { taskSheetMount.innerHTML = renderBottomSheet(`
                    <div class="sheet__header"><h2 class="sheet__title">No events found</h2></div>
                    <div class="sheet__content"><p style="color:var(--text-muted);font-size:var(--font-sm)">${data.error || 'No events could be extracted from that photo.'}</p></div>
                    <div class="sheet__footer"><button class="btn btn--secondary" id="cpClose">Close</button></div>`);
```

Replace with:
```javascript
                if (data.error || !data.events?.length) {
                  setTimeout(() => {
                    taskSheetMount.innerHTML = renderBottomSheet(`
                      <div class="sheet__header"><h2 class="sheet__title">Photo of flyer</h2></div>
                      <div class="sheet__content">
                        <p style="color:var(--text-muted);font-size:var(--font-size-sm)">No events found — try a clearer photo.</p>
                      </div>
                      <div class="sheet__footer">
                        <button class="btn btn--secondary" id="cpRetry">Try again</button>
                      </div>`);
                    applyDataColors(taskSheetMount);
                    requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
                    taskSheetMount.querySelector('#cpRetry')?.addEventListener('click', () => {
                      closeTaskSheet();
                      setTimeout(() => openCalendarPhotoImport(), 320);
                    });
                  }, 320);
```

Find the catch block error state (around line 732):
```javascript
                closeTaskSheet();
                setTimeout(() => { taskSheetMount.innerHTML = renderBottomSheet(`
                  <div class="sheet__header"><h2 class="sheet__title">Error</h2></div>
                  <div class="sheet__content"><p style="color:var(--text-muted);font-size:var(--font-sm)">Could not reach import service.</p></div>
                  <div class="sheet__footer"><button class="btn btn--secondary" id="cpClose">Close</button></div>`);
```

Replace with:
```javascript
                closeTaskSheet();
                setTimeout(() => {
                  taskSheetMount.innerHTML = renderBottomSheet(`
                    <div class="sheet__header"><h2 class="sheet__title">Photo of flyer</h2></div>
                    <div class="sheet__content">
                      <p style="color:var(--text-muted);font-size:var(--font-size-sm)">Something went wrong.</p>
                      <p style="color:var(--text-muted);font-size:var(--font-size-xs)">Check your connection and try again.</p>
                    </div>
                    <div class="sheet__footer">
                      <button class="btn btn--secondary" id="cpRetry">Try again</button>
                    </div>`);
                  applyDataColors(taskSheetMount);
                  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
                  taskSheetMount.querySelector('#cpRetry')?.addEventListener('click', () => {
                    closeTaskSheet();
                    setTimeout(() => openCalendarPhotoImport(), 320);
                  });
```

- [ ] **Step 7: Verify in browser**

Open calendar.html. Test all three import flows:

**Calendar photo:** FAB → Import → Photo of flyer → pick image.
- Loading spinner while Worker runs
- If events found: confirm sheet with tap-to-deselect rows; low-confidence events dimmed + amber dot; dates with `dateConfidence: 'low'` show amber date sub-label
- If no events: "No events found" + Try again re-opens picker
- If Worker error: "Something went wrong" + Try again

**iCal:** FAB → Import → iCal URL → bad URL → "No events found in that calendar." (not a blank screen)

**Text event (parseEvent):** FAB → Import → Type event → submit something nonsensical → "Couldn't parse that — try being more specific..."

- [ ] **Step 8: Commit**

```bash
git add calendar.html
git commit -m "feat(ai): calendar.html confirm redesign, month clarification refactor, iCal/parseEvent state fixes"
```

---

### Task 6: School lunch confirm and month clarification — `admin.html`

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Update `onSchoolLunch` to use `openMonthClarificationSheet` from shared module**

Find the `onSchoolLunch` handler block. The `renderSchoolLunchClarification` call (around line 3995) needs to call the shared helper instead. Replace:

```javascript
          if (data.monthUncertain) {
            renderSchoolLunchClarification(data.days, data.assumedMonth, statusEl);
          } else {
            renderSchoolLunchConfirm(data.days, statusEl);
          }
```

Replace with:
```javascript
          if (data.monthUncertain) {
            openMonthClarificationSheet(data.assumedMonth, (yearMonth) => {
              const remapped = data.days.map(d => d.date
                ? { ...d, date: `${yearMonth}-${d.date.slice(8, 10)}` }
                : d);
              renderSchoolLunchConfirm(remapped, statusEl);
            });
          } else {
            renderSchoolLunchConfirm(data.days, statusEl);
          }
```

- [ ] **Step 2: Delete `renderSchoolLunchClarification` function**

The function at around lines 4039–4064 is now replaced by the shared helper. Delete the entire `renderSchoolLunchClarification` function.

- [ ] **Step 3: Standardise `onSchoolLunch` loading and error states**

Find the loading text at the start of `onSchoolLunch` (around line 3980):
```javascript
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:var(--font-sm)">Reading file…</span>';
```

Replace with:
```javascript
        if (statusEl) statusEl.innerHTML = `<div class="ai-loading"><div class="ai-loading__spinner"></div>Parsing lunch menu…</div>`;
```

Find the empty-result error (around line 3991):
```javascript
          if (data.error || !data.days?.length) {
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--c-danger,#c0392b);font-size:var(--font-sm)">${data.error || 'No lunch entries found.'}</span>`;
```

Replace with:
```javascript
          if (data.error || !data.days?.length) {
            if (statusEl) statusEl.innerHTML = `
              <p style="color:var(--text-muted);font-size:var(--font-size-sm)">No lunch items found — try a clearer photo or PDF.</p>
              <button class="btn btn--secondary btn--sm" id="slRetry" style="margin-top:var(--spacing-sm)">Try again</button>`;
            statusEl?.querySelector('#slRetry')?.addEventListener('click', () => { statusEl.innerHTML = ''; });
```

Find the catch error (around line 3999–4001):
```javascript
        } catch {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--c-danger,#c0392b);font-size:var(--font-sm)">Import failed. Check your connection.</span>';
        }
```

Replace with:
```javascript
        } catch (err) {
          if (statusEl) statusEl.innerHTML = `
            <p style="color:var(--text-muted);font-size:var(--font-size-sm)">Something went wrong.</p>
            <p style="color:var(--text-muted);font-size:var(--font-size-xs)">${err?.message || 'Check your connection.'}</p>
            <button class="btn btn--secondary btn--sm" id="slRetry" style="margin-top:var(--spacing-sm)">Try again</button>`;
          statusEl?.querySelector('#slRetry')?.addEventListener('click', () => { statusEl.innerHTML = ''; });
        }
```

- [ ] **Step 4: Rewrite `renderSchoolLunchConfirm` to use `renderConfirmRow`**

Replace the entire `renderSchoolLunchConfirm` function (around lines 4066–4095) with:

```javascript
    function renderSchoolLunchConfirm(days, statusEl) {
      if (!statusEl) return;

      const formatLunchDate = (d) => {
        if (!d) return d;
        const [y, m, day] = d.split('-');
        return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      };

      const enriched = days.map((d, i) => ({
        ...d,
        _label: formatLunchDate(d.date),
        _sub: d.lunch2 ? `${d.lunch1} · ${d.lunch2}` : d.lunch1,
        _key: i,
      }));

      const rows = enriched.map((d, i) => renderConfirmRow(d, {
        labelKey: '_label',
        subKey: '_sub',
        confidenceKey: 'confidence',
        key: i,
      })).join('');

      statusEl.innerHTML = `
        <div class="confirm-list" id="slItems">${rows}</div>
        <div class="admin-form__actions mt-md">
          <button class="btn btn--secondary btn--sm" id="slCancel">Cancel</button>
          <button class="btn btn--primary btn--sm" id="slSave">Import ${days.length} day${days.length !== 1 ? 's' : ''}</button>
        </div>`;

      const list = statusEl.querySelector('#slItems');
      const saveBtn = statusEl.querySelector('#slSave');

      function updateBtn() {
        const n = list.querySelectorAll('.confirm-row:not(.is-deselected)').length;
        saveBtn.textContent = `Import ${n} day${n !== 1 ? 's' : ''}`;
        saveBtn.disabled = n === 0;
      }

      list.addEventListener('click', (e) => {
        const row = e.target.closest('.confirm-row');
        if (!row) return;
        row.classList.toggle('is-deselected');
        updateBtn();
      });

      statusEl.querySelector('#slCancel')?.addEventListener('click', () => { statusEl.innerHTML = ''; });

      saveBtn.addEventListener('click', async () => {
        const selected = [...list.querySelectorAll('.confirm-row:not(.is-deselected)')]
          .map(row => days[+row.dataset.key]);
        if (!selected.length) { statusEl.innerHTML = ''; return; }
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        const db = firebase.database();
        for (const d of selected) {
          await db.ref(`rundown/kitchen/plan/${d.date}/school-lunch`).set({ mealName: d.lunch1, source: 'school' });
          if (d.lunch2) await db.ref(`rundown/kitchen/plan/${d.date}/school-lunch-2`).set({ mealName: d.lunch2, source: 'school' });
        }
        statusEl.innerHTML = `<span style="color:var(--c-success,#27ae60);font-size:var(--font-size-sm)">${selected.length} day${selected.length !== 1 ? 's' : ''} imported.</span>`;
      });
    }
```

- [ ] **Step 5: Verify in browser**

Open admin.html → Tools tab → AI Imports → School Lunch.

- Upload a school lunch PDF or image
- Loading spinner shows "Parsing lunch menu…"
- If `monthUncertain`: shared month clarification sheet slides up from bottom; selecting a month and tapping Continue opens the confirm screen with dates remapped
- Confirm screen: tap-to-deselect rows, formatted dates as labels, lunch items as sub-text
- Low-confidence days show amber dot + opacity
- Button count updates on tap
- Import saves to Firebase

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat(ai): admin school lunch tap-to-deselect confirm, shared month clarification, standardised states"
```

---

### Task 7: Task scanner confirm — `admin.html`

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Standardise `onTaskScan` loading and error states**

Find the loading text (around line 4012):
```javascript
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:var(--font-sm)">Scanning…</span>';
```

Replace with:
```javascript
        if (statusEl) statusEl.innerHTML = `<div class="ai-loading"><div class="ai-loading__spinner"></div>Scanning document…</div>`;
```

Find the empty-result block (around line 4022):
```javascript
          if (data.error || !data.tasks?.length) {
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--c-danger,#c0392b);font-size:var(--font-sm)">${data.error || 'No tasks found.'}</span>`;
```

Replace with:
```javascript
          if (data.error || !data.tasks?.length) {
            if (statusEl) statusEl.innerHTML = `
              <p style="color:var(--text-muted);font-size:var(--font-size-sm)">No tasks found — try a clearer photo.</p>
              <button class="btn btn--secondary btn--sm" id="hwRetry" style="margin-top:var(--spacing-sm)">Try again</button>`;
            statusEl?.querySelector('#hwRetry')?.addEventListener('click', () => { statusEl.innerHTML = ''; });
```

Find the catch block (around line 4027):
```javascript
        } catch {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--c-danger,#c0392b);font-size:var(--font-sm)">Scan failed. Check your connection.</span>';
        }
```

Replace with:
```javascript
        } catch (err) {
          if (statusEl) statusEl.innerHTML = `
            <p style="color:var(--text-muted);font-size:var(--font-size-sm)">Something went wrong.</p>
            <p style="color:var(--text-muted);font-size:var(--font-size-xs)">${err?.message || 'Check your connection.'}</p>
            <button class="btn btn--secondary btn--sm" id="hwRetry" style="margin-top:var(--spacing-sm)">Try again</button>`;
          statusEl?.querySelector('#hwRetry')?.addEventListener('click', () => { statusEl.innerHTML = ''; });
        }
```

- [ ] **Step 2: Rewrite `renderTaskScanConfirm` to use `renderConfirmRow` with tap-to-deselect**

The task scanner has a special requirement: tasks without a `dueDate` need an inline date input. We render the `renderConfirmRow` for the row itself, then append an extra date-input element below rows that have no date.

Replace the entire `renderTaskScanConfirm` function (around lines 4097–4153) with:

```javascript
    function renderTaskScanConfirm(tasks, statusEl, hasUncertainDates) {
      if (!statusEl) return;

      const formatDueDate = (d) => {
        if (!d) return null;
        const [y, m, day] = d.split('-');
        return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      };

      const uncertainBanner = hasUncertainDates
        ? `<p style="font-size:var(--font-size-sm);color:var(--c-warning);margin-bottom:var(--spacing-sm)">Some dates were unclear — review before importing.</p>`
        : '';

      const rowsHtml = tasks.map((t, i) => {
        const sub = t.dueDate ? `Due ${formatDueDate(t.dueDate)}${t.notes ? ' · ' + t.notes : ''}` : null;
        const row = renderConfirmRow(
          { ...t, _sub: sub },
          { labelKey: 'name', subKey: '_sub', confidenceKey: 'confidence', key: i }
        );
        const dateInput = !t.dueDate
          ? `<div class="hw-date-wrap" data-idx="${i}" style="padding:0 var(--spacing-md) var(--spacing-xs);display:none">
               <label style="font-size:var(--font-size-xs);color:var(--text-muted)">Due date (optional)</label>
               <input type="date" class="field__input hw-date" data-idx="${i}" style="margin-top:4px">
             </div>`
          : '';
        return row + dateInput;
      }).join('');

      statusEl.innerHTML = `
        ${uncertainBanner}
        <div class="confirm-list" id="hwItems">${rowsHtml}</div>
        <div class="admin-form__actions mt-md">
          <button class="btn btn--secondary btn--sm" id="hwCancel">Cancel</button>
          <button class="btn btn--primary btn--sm" id="hwSave">Add ${tasks.length} task${tasks.length !== 1 ? 's' : ''}</button>
        </div>`;

      const list = statusEl.querySelector('#hwItems');
      const saveBtn = statusEl.querySelector('#hwSave');

      function updateBtn() {
        const n = list.querySelectorAll('.confirm-row:not(.is-deselected)').length;
        saveBtn.textContent = `Add ${n} task${n !== 1 ? 's' : ''}`;
        saveBtn.disabled = n === 0;
      }

      list.addEventListener('click', (e) => {
        const row = e.target.closest('.confirm-row');
        if (!row) return;
        // Don't toggle if the click came from inside a date input wrap
        if (e.target.closest('.hw-date-wrap')) return;
        const idx = row.dataset.key;
        row.classList.toggle('is-deselected');
        // Show/hide the inline date input for no-date tasks
        const dateWrap = list.querySelector(`.hw-date-wrap[data-idx="${idx}"]`);
        if (dateWrap) dateWrap.style.display = row.classList.contains('is-deselected') ? 'none' : 'block';
        updateBtn();
      });

      // Show date inputs for all selected no-date tasks initially
      list.querySelectorAll('.hw-date-wrap').forEach(wrap => { wrap.style.display = 'block'; });

      statusEl.querySelector('#hwCancel')?.addEventListener('click', () => { statusEl.innerHTML = ''; });

      saveBtn.addEventListener('click', async () => {
        const selected = [...list.querySelectorAll('.confirm-row:not(.is-deselected)')]
          .map(row => {
            const t = tasks[+row.dataset.key];
            if (!t.dueDate) {
              const dateEl = list.querySelector(`.hw-date[data-idx="${row.dataset.key}"]`);
              return { ...t, dueDate: dateEl?.value || null };
            }
            return t;
          })
          .filter(t => t.dueDate); // skip tasks with no date set
        if (!selected.length) { statusEl.innerHTML = ''; return; }
        saveBtn.disabled = true; saveBtn.textContent = 'Adding…';
        const tz = settings?.timezone || 'America/Chicago';
        for (const t of selected) {
          const firstPersonId = Object.keys(peopleObj)[0] || null;
          const taskData = {
            name: t.name, rotation: 'once', owners: firstPersonId ? [firstPersonId] : [],
            ownerAssignmentMode: 'fixed', timeOfDay: 'anytime',
            dedicatedDate: t.dueDate, estMin: 30, difficulty: 'medium',
            category: 'general', status: 'active',
            createdDate: todayKey(tz), notes: t.notes || null, exempt: false,
          };
          const taskId = await pushTask(taskData);
          const schedKey = `sched_${Date.now()}_hw_${Math.random().toString(36).slice(2, 6)}`;
          await multiUpdate({ [`schedule/${t.dueDate}/${schedKey}`]: {
            taskId, ownerId: taskData.owners[0], rotationType: 'once',
            ownerAssignmentMode: 'fixed', timeOfDay: 'anytime',
          }});
        }
        statusEl.innerHTML = `<span style="color:var(--c-success,#27ae60);font-size:var(--font-size-sm)">${selected.length} task${selected.length !== 1 ? 's' : ''} added.</span>`;
      });
    }
```

- [ ] **Step 3: Verify in browser**

Open admin.html → Tools tab → AI Imports → Task Scanner. Upload a photo of a homework sheet or permission slip.

- Loading spinner shows "Scanning document…"
- Confirm shows tap-to-deselect rows (no checkboxes)
- Tasks without due dates show an inline date input below the row
- Tapping a no-date row hides its date input
- Low-confidence tasks show amber dot + dimmed row
- `hasUncertainDates` banner appears when appropriate
- Button count updates on tap
- Tasks with dates are written to Firebase on import

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(ai): admin task scanner tap-to-deselect confirm, confidence indicators, standardised states"
```

---

### Task 8: Email imports inbox — `admin.html`

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add a relative timestamp helper near `loadEmailImports`**

Before `loadEmailImports`, add:

```javascript
    function formatRelativeTime(epochMs) {
      const diff = Date.now() - epochMs;
      const mins = Math.floor(diff / 60000);
      if (mins < 2) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days}d ago`;
      return new Date(epochMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function parseSenderName(from) {
      if (!from) return '?';
      const m = from.match(/^([^<]+)</);
      return m ? m[1].trim() : from.replace(/<[^>]+>/, '').trim() || from;
    }
```

- [ ] **Step 2: Replace the entire `loadEmailImports` function**

Replace the entire function (lines 4155–4230) with:

```javascript
    async function loadEmailImports() {
      const listEl = main.querySelector('#emailImportsList');
      if (!listEl) return;

      listEl.innerHTML = `<div class="ai-loading"><div class="ai-loading__spinner"></div>Loading email imports…</div>`;

      try {
        const db = firebase.database();
        const snap = await db.ref('rundown/emailImports').orderByChild('processed').equalTo(false).once('value');
        const imports = snap.val();

        if (!imports) {
          listEl.innerHTML = `
            <p style="color:var(--text-muted);font-size:var(--font-size-sm)">No pending imports.</p>`;
          return;
        }

        const entries = Object.entries(imports).sort((a, b) => (b[1].receivedAt || 0) - (a[1].receivedAt || 0));
        listEl.innerHTML = '';

        for (const [emailId, entry] of entries) {
          const events = entry.events || [];
          const senderName = parseSenderName(entry.from);
          const timestamp = entry.receivedAt ? formatRelativeTime(entry.receivedAt) : '';

          let eventsHtml;
          if (!events.length) {
            eventsHtml = `<p style="color:var(--text-muted);font-size:var(--font-size-sm)">No events found.</p>`;
          } else {
            eventsHtml = events.map((ev, i) => {
              const datePart = ev.date
                ? new Date(...ev.date.split('-').map((v, j) => j === 1 ? +v - 1 : +v)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : null;
              const timePart = ev.time ? ` · ${ev.time}` : (ev.allDay ? ' · All day' : '');
              const sub = datePart ? `${datePart}${timePart}` : null;
              const row = renderConfirmRow(
                { ...ev, _sub: sub, _noDate: !ev.date },
                { labelKey: 'name', subKey: '_sub', confidenceKey: 'confidence', key: i }
              );
              // Inline date input for null-date events
              const dateInput = !ev.date
                ? `<div class="em-date-wrap" data-idx="${i}" style="padding:0 var(--spacing-md) var(--spacing-xs)">
                     <label style="font-size:var(--font-size-xs);color:var(--c-warning)">Date unknown — tap to set</label>
                     <input type="date" class="field__input em-date" data-idx="${i}" style="margin-top:4px">
                   </div>`
                : '';
              return row + dateInput;
            }).join('');
          }

          const card = document.createElement('div');
          card.className = 'admin-form__section';
          card.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--spacing-md);margin-bottom:var(--spacing-md)';
          card.dataset.emailId = emailId;
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
              <span style="font-size:var(--font-size-sm);font-weight:600">${esc(senderName)}</span>
              <span style="font-size:var(--font-size-xs);color:var(--text-muted)">${esc(timestamp)}</span>
            </div>
            <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:var(--spacing-sm)">${esc(entry.subject || '(no subject)')}</div>
            <div class="confirm-list em-events">${eventsHtml}</div>
            <div class="admin-form__actions mt-sm">
              <button class="btn btn--secondary btn--sm em-dismiss">Dismiss</button>
              ${events.length ? `<button class="btn btn--primary btn--sm em-import">Import ${events.length} event${events.length !== 1 ? 's' : ''}</button>` : ''}
            </div>
            <div class="em-status" style="font-size:var(--font-size-sm);margin-top:var(--spacing-xs)"></div>`;

          listEl.appendChild(card);

          // Tap-to-deselect on event rows
          if (events.length) {
            const evList = card.querySelector('.em-events');
            const importBtn = card.querySelector('.em-import');

            function updateImportBtn() {
              const n = evList.querySelectorAll('.confirm-row:not(.is-deselected)').length;
              importBtn.textContent = `Import ${n} event${n !== 1 ? 's' : ''}`;
              importBtn.disabled = n === 0;
            }

            evList.addEventListener('click', (e) => {
              if (e.target.closest('.em-date-wrap')) return;
              const row = e.target.closest('.confirm-row');
              if (!row) return;
              row.classList.toggle('is-deselected');
              updateImportBtn();
            });

            importBtn.addEventListener('click', async () => {
              const selected = [...evList.querySelectorAll('.confirm-row:not(.is-deselected)')]
                .map(row => {
                  const ev = events[+row.dataset.key];
                  if (!ev.date) {
                    const dateEl = evList.querySelector(`.em-date[data-idx="${row.dataset.key}"]`);
                    return { ...ev, date: dateEl?.value || null };
                  }
                  return ev;
                })
                .filter(ev => ev.date);

              if (!selected.length) return;
              importBtn.disabled = true; importBtn.textContent = 'Adding…';

              for (const ev of selected) {
                const newId = await pushEvent({
                  name: ev.name, date: ev.date, allDay: ev.allDay ?? true,
                  startTime: ev.time || null, endTime: null,
                  color: people?.[0]?.color || '#4285f4',
                  people: [], notes: ev.notes || null, url: null,
                });
                const schedKey = `sched_${Date.now()}_em_${Math.random().toString(36).slice(2, 6)}`;
                await multiUpdate({ [`schedule/${ev.date}/${schedKey}`]: { type: 'event', eventId: newId } });
              }

              await db.ref(`rundown/emailImports/${emailId}/processed`).set(true);
              const statusEl = card.querySelector('.em-status');
              if (statusEl) statusEl.innerHTML = `<span style="color:var(--c-success,#27ae60)">${selected.length} event${selected.length !== 1 ? 's' : ''} added.</span>`;
              showToast(`${selected.length} event${selected.length !== 1 ? 's' : ''} added to schedule`);
              setTimeout(() => { card.style.opacity = '0'; card.style.transition = 'opacity 0.3s'; setTimeout(() => card.remove(), 300); }, 1500);
            });
          }

          card.querySelector('.em-dismiss').addEventListener('click', async () => {
            await db.ref(`rundown/emailImports/${emailId}/processed`).set(true);
            card.style.opacity = '0';
            card.style.transition = 'opacity 0.3s';
            setTimeout(() => {
              card.remove();
              if (!listEl.querySelector('[data-email-id]')) {
                listEl.innerHTML = `<p style="color:var(--text-muted);font-size:var(--font-size-sm)">No pending imports.</p>`;
              }
            }, 300);
          });
        }
      } catch (err) {
        listEl.innerHTML = `
          <p style="color:var(--text-muted);font-size:var(--font-size-sm)">Couldn't load imports.</p>
          <p style="color:var(--text-muted);font-size:var(--font-size-xs)">${err?.message || ''}</p>
          <button class="btn btn--secondary btn--sm" id="emRetry" style="margin-top:var(--spacing-sm)">Retry</button>`;
        listEl.querySelector('#emRetry')?.addEventListener('click', loadEmailImports);
      }
    }
```

- [ ] **Step 3: Add a Refresh link to the Email Imports section header in the HTML**

Find the section header HTML (around line 3965–3968):
```html
        <div class="admin-form__section mt-lg" id="emailImportsSection">
          <h4 class="admin-form__subtitle">Email Imports</h4>
          <p class="form-hint mb-md">Events extracted from forwarded emails appear here for review.</p>
          <div id="emailImportsList"><span style="color:var(--text-muted);font-size:var(--font-sm)">Loading…</span></div>
        </div>
```

Replace with:
```html
        <div class="admin-form__section mt-lg" id="emailImportsSection">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--spacing-xs)">
            <h4 class="admin-form__subtitle" style="margin:0">Email Imports</h4>
            <button class="btn btn--ghost btn--sm" id="emailImportsRefresh" style="font-size:var(--font-size-xs)">Refresh</button>
          </div>
          <p class="form-hint mb-md">Events extracted from forwarded emails appear here for review.</p>
          <div id="emailImportsList"></div>
        </div>
```

- [ ] **Step 4: Bind the Refresh button in `bindAiImportsTab`**

Inside `bindAiImportsTab`, after `loadEmailImports();`, add:

```javascript
      main.querySelector('#emailImportsRefresh')?.addEventListener('click', loadEmailImports);
```

- [ ] **Step 5: Verify in browser**

Open admin.html → Tools tab → AI Imports → scroll to Email Imports section.

- **Loading state:** spinner + "Loading email imports…" on tab activation
- **Empty state:** "No pending imports." if Firebase returns nothing
- **Error state:** error message + Retry button if Firebase read fails
- **Populated:** email cards with sender name, relative timestamp, subject, event rows
- Tap-to-deselect rows work; low-confidence events show amber dot
- Events with null date show "Date unknown — tap to set" + date input
- Import button count updates live; disabled at 0
- Import writes events + marks processed + card fades out + toast shown
- Dismiss marks processed + card fades out
- Refresh link re-runs `loadEmailImports`

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat(ai): email imports inbox redesign — tap-to-deselect, confidence, loading/empty/error states"
```

---

### Task 9: Add `shared/ai-helpers.js` to SW cache — `sw.js`

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Find CACHE_NAME and bump the version number**

Find (around line 204):
```javascript
const CACHE_NAME = 'family-hub-v100';
```

Replace with:
```javascript
const CACHE_NAME = 'family-hub-v101';
```

- [ ] **Step 2: Add `shared/ai-helpers.js` to the APP_SHELL array**

Find the list of `shared/` JS files in the APP_SHELL array (look for `'shared/firebase.js'`, `'shared/utils.js'`, etc.). Add `'shared/ai-helpers.js'` adjacent to the other shared modules:

```javascript
  'shared/ai-helpers.js',
```

- [ ] **Step 3: Verify cache includes the new file**

Open any page in the browser. Open DevTools → Application → Cache Storage → `family-hub-v101`. Confirm `shared/ai-helpers.js` appears in the list. Confirm the old `family-hub-v100` cache is gone (the SW activation logic deletes old caches on upgrade).

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: bump SW cache to v101, add shared/ai-helpers.js"
```

---

## Self-Review Checklist

- [ ] `shared/ai-helpers.js` exported functions match signatures used in all three pages
- [ ] `renderConfirmRow` `subConfidenceKey` used in calendar.html for `dateConfidence`
- [ ] `openMonthClarificationSheet` called with `(assumedMonth, callback)` — not `(events, assumedMonth)` like the old calendar.html signature
- [ ] Date remapping after month clarification uses `${yearMonth}-${date.slice(8, 10)}` in all three callers (calendar photo, school lunch in both pages)
- [ ] `pushEvent` used in both calendar.html and email imports (not `pushTask`) for event creation
- [ ] `loadData(); render();` called after import in calendar.html (see step 5, Task 5) — confirm it's there
- [ ] `esc` function is local to `ai-helpers.js` — pages don't need to escape before calling `renderConfirmRow`
- [ ] `is-deselected` toggled by click delegation on `.confirm-list`, not on individual elements
- [ ] SW cache version bumped in Task 9
- [ ] No inline styles added to HTML files (all styling uses CSS classes or existing `style=""` patterns in JS strings)
- [ ] No `window.confirm` or `window.alert` in any changed code
