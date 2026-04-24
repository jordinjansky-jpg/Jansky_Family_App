// theme.js — Theme application, dark mode, admin-configured styles (v2)
// No DOM access. Returns CSS variable maps. Pages apply them.

const PRESETS = {
  'light-warm': {
    mode: 'light',
    label: 'Light Warm',
    vars: {
      '--surface': '#ffffff',
      '--text-muted': '#6b6b6b',
      '--border': '#e8e4de',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.12)',
      '--overlay-bg': 'rgba(0,0,0,0.4)',
      '--bg-hover': 'rgba(0,0,0,0.04)'
    }
  },
  'dark': {
    mode: 'dark',
    label: 'Dark',
    vars: {
      '--bg': '#1a1a2e',
      '--surface': '#222244',
      '--surface-2': '#16213e',
      '--text': '#e8e8e8',
      '--text-muted': '#707080',
      '--text-faint': '#5a5a6a',
      '--border': '#2a2a4a',
      '--success': '#66bb6a',
      '--success-soft': '#1b3a1b',
      '--warning': '#ffa726',
      '--warning-soft': '#3a2a1b',
      '--danger': '#ef5350',
      '--danger-soft': '#3a1b1b',
      '--info': '#42a5f5',
      '--info-soft': '#1b2a3a',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)'
    }
  },
  'dark-warm': {
    mode: 'dark',
    label: 'Dark Warm',
    vars: {
      '--bg': '#1e1a17',
      '--surface': '#332d28',
      '--surface-2': '#2a2420',
      '--text': '#e8e0d8',
      '--text-muted': '#807868',
      '--text-faint': '#625a4e',
      '--border': '#3d3530',
      '--success': '#81c784',
      '--success-soft': '#1b2e1b',
      '--warning': '#ffb74d',
      '--warning-soft': '#2e2a1b',
      '--danger': '#e57373',
      '--danger-soft': '#2e1b1b',
      '--info': '#64b5f6',
      '--info-soft': '#1b2a33',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)'
    }
  },
  'light-vivid': {
    mode: 'light',
    label: 'Light Vivid',
    coloredCells: true,
    vars: {
      '--surface': '#ffffff',
      '--text-muted': '#6b6b6b',
      '--border': '#e8e4de',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.12)',
      '--overlay-bg': 'rgba(0,0,0,0.4)',
      '--bg-hover': 'rgba(0,0,0,0.04)'
    }
  },
  'dark-vivid': {
    mode: 'dark',
    label: 'Dark Vivid',
    coloredCells: true,
    vars: {
      '--bg': '#1e1a17',
      '--surface': '#332d28',
      '--surface-2': '#2a2420',
      '--text': '#e8e0d8',
      '--text-muted': '#807868',
      '--text-faint': '#625a4e',
      '--border': '#3d3530',
      '--success': '#81c784',
      '--success-soft': '#1b2e1b',
      '--warning': '#ffb74d',
      '--warning-soft': '#2e2a1b',
      '--danger': '#e57373',
      '--danger-soft': '#2e1b1b',
      '--info': '#64b5f6',
      '--info-soft': '#1b2a33',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)'
    }
  }
};

// Union of all CSS variable names any preset can set. Used by applyTheme
// to strip stale inline overrides on theme switch — without this, switching
// dark → light leaves dark-only vars (--text, --bg, --text-faint, etc.) on
// the root element, and since inline styles beat base.css :root defaults,
// the new light preset gets dark text on light surfaces.
const PRESET_VAR_KEYS = new Set();
for (const _preset of Object.values(PRESETS)) {
  for (const _key of Object.keys(_preset.vars)) PRESET_VAR_KEYS.add(_key);
}

/**
 * Get all available theme presets.
 */
export function getPresets() {
  return Object.entries(PRESETS).map(([key, preset]) => ({
    key,
    label: preset.label,
    mode: preset.mode,
    coloredCells: !!preset.coloredCells
  }));
}

/**
 * Get the CSS variables for a given theme config.
 * themeConfig: { mode, preset, accentColor }
 * Returns a flat object of CSS variable key-value pairs.
 */
export function getThemeVars(themeConfig) {
  const preset = PRESETS[themeConfig.preset] || PRESETS['light-warm'];
  const vars = { ...preset.vars };
  const isDark = (preset.mode || themeConfig.mode) === 'dark';

  if (themeConfig.accentColor) {
    const accent = themeConfig.accentColor;
    vars['--accent'] = accent;
    vars['--accent-hover'] = accent + 'dd';

    // Spec-aligned tokens. color-mix(in srgb, X% accent, white/black)
    // — X is how much accent remains, so lower X = more of the other color.
    if (isDark) {
      // Dark mode: brighter accent, even brighter ink, darker soft surface.
      vars['--accent'] = `color-mix(in srgb, ${accent} 75%, #fff)`;
      vars['--accent-ink'] = `color-mix(in srgb, ${accent} 40%, #fff)`;
      vars['--accent-soft'] = `color-mix(in srgb, ${accent} 30%, #000)`;
    } else {
      vars['--accent-ink'] = `color-mix(in srgb, ${accent} 60%, #000)`;
      vars['--accent-soft'] = `color-mix(in srgb, ${accent} 12%, #fff)`;
    }
  }

  return vars;
}

/**
 * Get the default theme config.
 */
export function defaultThemeConfig() {
  return {
    mode: 'light',
    preset: 'light-warm',
    accentColor: '#5b7fd6'
  };
}

/**
 * Apply theme CSS variables to the document root.
 * This is the ONE exception where a shared module touches the DOM —
 * it's called by pages to apply the theme.
 */
export function applyTheme(themeConfig) {
  const vars = getThemeVars(themeConfig);
  const root = document.documentElement;
  const preset = PRESETS[themeConfig.preset] || PRESETS['light-warm'];

  // Strip stale inline overrides from any previously-applied preset so the
  // new preset can fall through to base.css :root / [data-theme="dark"]
  // defaults for any vars it doesn't explicitly set.
  for (const prop of PRESET_VAR_KEYS) {
    if (!(prop in vars)) root.style.removeProperty(prop);
  }

  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }

  // Set accent if not in vars
  if (!vars['--accent']) {
    const fallbackAccent = '#5b7fd6';
    const isDark = (preset.mode || themeConfig.mode) === 'dark';
    root.style.setProperty('--accent', fallbackAccent);
    root.style.setProperty('--accent-hover', fallbackAccent + 'dd');
    // Spec-aligned tokens.
    if (isDark) {
      root.style.setProperty('--accent', `color-mix(in srgb, ${fallbackAccent} 75%, #fff)`);
      root.style.setProperty('--accent-ink', `color-mix(in srgb, ${fallbackAccent} 40%, #fff)`);
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${fallbackAccent} 30%, #000)`);
    } else {
      root.style.setProperty('--accent-ink', `color-mix(in srgb, ${fallbackAccent} 60%, #000)`);
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${fallbackAccent} 12%, #fff)`);
    }
  }

  // Set data attribute for CSS selectors. Use the preset's mode (not
  // themeConfig.mode) — otherwise a stale themeConfig.mode='dark' paired
  // with a light preset like light-warm makes [data-theme="dark"] rules
  // in base.css override --text/--bg while the preset keeps --surface
  // white, producing near-white text on white cards.
  root.setAttribute('data-theme', preset.mode || themeConfig.mode || 'light');

  // Set colored cells attribute based on preset
  if (preset.coloredCells) {
    root.setAttribute('data-colored-cells', 'true');
  } else {
    root.removeAttribute('data-colored-cells');
  }

  // Persist to localStorage for immediate load on next page
  localStorage.setItem('dr-theme', JSON.stringify(themeConfig));
}

/**
 * Load theme from localStorage (for instant apply before Firebase loads).
 * Returns theme config or null.
 */
export function loadCachedTheme() {
  try {
    const cached = localStorage.getItem('dr-theme');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

/**
 * Load device-local theme override (takes priority over family theme).
 * Returns theme config or null.
 */
export function loadDeviceTheme() {
  try {
    const dt = localStorage.getItem('dr-device-theme');
    return dt ? JSON.parse(dt) : null;
  } catch {
    return null;
  }
}

/**
 * Save device-local theme override. Pass null to clear.
 */
export function saveDeviceTheme(themeConfig) {
  if (themeConfig) {
    localStorage.setItem('dr-device-theme', JSON.stringify(themeConfig));
  } else {
    localStorage.removeItem('dr-device-theme');
  }
}

/**
 * Resolve which theme to apply: device override > cached family > Firebase settings > default.
 */
export function resolveTheme(settingsTheme) {
  return loadDeviceTheme() || loadCachedTheme() || settingsTheme || defaultThemeConfig();
}

/**
 * Grade color mapping — consistent across all pages.
 */
export function gradeColor(grade) {
  if (!grade) return '#999';
  const letter = grade.charAt(0);
  const colors = {
    'A': '#2e7d32',
    'B': '#1565c0',
    'C': '#f9a825',
    'D': '#e65100',
    'F': '#c62828'
  };
  return colors[letter] || '#999';
}

/**
 * Person color palette for the setup wizard.
 */
export function getColorPalette() {
  return [
    '#ef5350', '#e85d75', '#ec407a', '#f06292',
    '#ab47bc', '#8e24aa', '#7e57c2', '#5b7fd6',
    '#42a5f5', '#00acc1', '#26a69a', '#43a047',
    '#66bb6a', '#ffca28', '#ffa726', '#ff9800',
    '#ff7043', '#8d6e63', '#78909c', '#546e7a',
    '#d4e157', '#aed581', '#4dd0e1', '#ba68c8'
  ];
}
