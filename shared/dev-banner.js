// Dev-mode banner — only active when ?env=dev is in the URL.
// Shows a floating chip with the active Firebase root and a one-click clear button.
// Plain script (not a module) so it loads synchronously on every page without an import chain.
(function () {
  if (!location.search.includes('env=dev')) return;

  const style = document.createElement('style');
  style.textContent = `
    #dev-banner {
      position: fixed;
      bottom: 72px;
      right: 12px;
      z-index: 99999;
      background: #e05a00;
      color: #fff;
      padding: 7px 11px;
      border-radius: 20px;
      font: 600 11px/1 system-ui, sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
      letter-spacing: .01em;
      pointer-events: auto;
    }
    #dev-banner-clear {
      background: rgba(255,255,255,.18);
      border: none;
      color: #fff;
      padding: 4px 9px;
      border-radius: 12px;
      cursor: pointer;
      font: 600 10px/1 system-ui, sans-serif;
      letter-spacing: .01em;
    }
    #dev-banner-clear:hover { background: rgba(255,255,255,.32); }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.id = 'dev-banner';
  banner.innerHTML =
    '<span>DEV &mdash; rundown-dev</span>' +
    '<button id="dev-banner-clear">Clear data</button>';

  function mount() { document.body.appendChild(banner); }
  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }

  // Two-tap confirm (first tap arms for 3s) — native confirm() is banned
  // app-wide, and dev tooling shouldn't be the one exception.
  let armedUntil = 0;
  document.addEventListener('click', async function (e) {
    if (e.target.id !== 'dev-banner-clear') return;
    const btn = e.target;
    if (Date.now() > armedUntil) {
      armedUntil = Date.now() + 3000;
      btn.textContent = 'Tap again to wipe';
      setTimeout(() => {
        if (Date.now() > armedUntil) btn.textContent = 'Clear data';
      }, 3200);
      return;
    }
    armedUntil = 0;
    btn.textContent = '...';
    btn.disabled = true;

    try {
      await firebase.database().ref('rundown-dev').remove();
      btn.textContent = 'Cleared!';
      setTimeout(() => {
        btn.textContent = 'Clear data';
        btn.disabled = false;
      }, 2000);
    } catch (err) {
      console.error('[dev-banner] clear failed:', err);
      btn.textContent = 'Error';
      setTimeout(() => {
        btn.textContent = 'Clear data';
        btn.disabled = false;
      }, 2000);
    }
  });
})();
