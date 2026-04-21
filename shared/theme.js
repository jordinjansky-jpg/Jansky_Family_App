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
      '--surface': '#222244',
      '--text-muted': '#707080',
      '--border': '#2a2a4a',
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
      '--surface': '#332d28',
      '--text-muted': '#807868',
      '--border': '#3d3530',
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
      '--surface': '#332d28',
      '--text-muted': '#807868',
      '--border': '#3d3530',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)'
    }
  }
};

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

  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }

  // Set accent if not in vars
  if (!vars['--accent']) {
    const fallbackAccent = '#5b7fd6';
    const preset = PRESETS[themeConfig.preset] || PRESETS['light-warm'];
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

  // Set data attribute for CSS selectors
  root.setAttribute('data-theme', themeConfig.mode || 'light');

  // Set colored cells attribute based on preset
  const preset = PRESETS[themeConfig.preset];
  if (preset?.coloredCells) {
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
