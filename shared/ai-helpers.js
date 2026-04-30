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
  return `<div class="${rowClass}" data-key="${esc(key)}">
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
    if (!val) return;
    close();
    onConfirm(val);
  });

  return { close };
}
