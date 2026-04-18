// theme.js — Theme application, dark mode, admin-configured styles (v2)
// No DOM access. Returns CSS variable maps. Pages apply them.

const PRESETS = {
  'light-warm': {
    mode: 'light',
    label: 'Light Warm',
    vars: {
      '--bg-primary': '#faf8f5',
      '--bg-secondary': '#f0ece6',
      '--bg-card': '#ffffff',
      '--surface': '#ffffff',
      '--bg-nav': '#ffffff',
      '--text-primary': '#2c2c2c',
      '--text-secondary': '#6b6b6b',
      '--text-muted': '#999999',
      '--border-color': '#e8e4de',
      '--border': '#e8e4de',
      '--border-light': '#f0ece6',
      '--border-subtle': '#f3f0eb',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.12)',
      '--overlay-bg': 'rgba(0,0,0,0.4)',
      '--bg-hover': 'rgba(0,0,0,0.04)',
      '--success-bg': '#e8f5e9',
      '--success-text': '#2e7d32',
      '--warning-bg': '#fff3e0',
      '--warning-text': '#e65100',
      '--danger-bg': '#ffebee',
      '--danger-text': '#c62828',
      '--info-bg': '#e3f2fd',
      '--info-text': '#1565c0'
    }
  },
  'dark': {
    mode: 'dark',
    label: 'Dark',
    vars: {
      '--bg-primary': '#1a1a2e',
      '--bg-secondary': '#16213e',
      '--bg-card': '#222244',
      '--surface': '#222244',
      '--bg-nav': '#16213e',
      '--text-primary': '#e8e8e8',
      '--text-secondary': '#a0a0b0',
      '--text-muted': '#707080',
      '--border-color': '#2a2a4a',
      '--border': '#2a2a4a',
      '--border-light': '#222244',
      '--border-subtle': '#1e1e3a',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)',
      '--success-bg': '#1b3a1b',
      '--success-text': '#66bb6a',
      '--warning-bg': '#3a2a1b',
      '--warning-text': '#ffa726',
      '--danger-bg': '#3a1b1b',
      '--danger-text': '#ef5350',
      '--info-bg': '#1b2a3a',
      '--info-text': '#42a5f5'
    }
  },
  'dark-warm': {
    mode: 'dark',
    label: 'Dark Warm',
    vars: {
      '--bg-primary': '#1e1a17',
      '--bg-secondary': '#2a2420',
      '--bg-card': '#332d28',
      '--surface': '#332d28',
      '--bg-nav': '#2a2420',
      '--text-primary': '#e8e0d8',
      '--text-secondary': '#b0a898',
      '--text-muted': '#807868',
      '--border-color': '#3d3530',
      '--border': '#3d3530',
      '--border-light': '#332d28',
      '--border-subtle': '#2f2924',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)',
      '--success-bg': '#1b2e1b',
      '--success-text': '#81c784',
      '--warning-bg': '#2e2a1b',
      '--warning-text': '#ffb74d',
      '--danger-bg': '#2e1b1b',
      '--danger-text': '#e57373',
      '--info-bg': '#1b2a33',
      '--info-text': '#64b5f6'
    }
  },
  'light-vivid': {
    mode: 'light',
    label: 'Light Vivid',
    coloredCells: true,
    vars: {
      '--bg-primary': '#faf7f2',
      '--bg-secondary': '#f3ede4',
      '--bg-card': '#ffffff',
      '--surface': '#ffffff',
      '--bg-nav': '#ffffff',
      '--text-primary': '#2c2c2c',
      '--text-secondary': '#6b6b6b',
      '--text-muted': '#999999',
      '--border-color': '#e8e4de',
      '--border': '#e8e4de',
      '--border-light': '#f0ece6',
      '--border-subtle': '#f5f1ec',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.12)',
      '--overlay-bg': 'rgba(0,0,0,0.4)',
      '--bg-hover': 'rgba(0,0,0,0.04)',
      '--success-bg': '#e8f5e9',
      '--success-text': '#2e7d32',
      '--warning-bg': '#fff3e0',
      '--warning-text': '#e65100',
      '--danger-bg': '#ffebee',
      '--danger-text': '#c62828',
      '--info-bg': '#e3f2fd',
      '--info-text': '#1565c0'
    }
  },
  'dark-vivid': {
    mode: 'dark',
    label: 'Dark Vivid',
    coloredCells: true,
    vars: {
      '--bg-primary': '#1e1a17',
      '--bg-secondary': '#2a2420',
      '--bg-card': '#332d28',
      '--surface': '#332d28',
      '--bg-nav': '#2a2420',
      '--text-primary': '#e8e0d8',
      '--text-secondary': '#b0a898',
      '--text-muted': '#807868',
      '--border-color': '#3d3530',
      '--border': '#3d3530',
      '--border-light': '#332d28',
      '--border-subtle': '#2f2924',
      '--shadow-sm': '0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.25)',
      '--shadow-md': '0 2px 8px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
      '--overlay-bg': 'rgba(0,0,0,0.6)',
      '--bg-hover': 'rgba(255,255,255,0.06)',
      '--success-bg': '#1b2e1b',
      '--success-text': '#81c784',
      '--warning-bg': '#2e2a1b',
      '--warning-text': '#ffb74d',
      '--danger-bg': '#2e1b1b',
      '--danger-text': '#e57373',
      '--info-bg': '#1b2a33',
      '--info-text': '#64b5f6'
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

  if (themeConfig.accentColor) {
    vars['--accent'] = themeConfig.accentColor;
    vars['--accent-light'] = themeConfig.accentColor + '20';
    vars['--accent-hover'] = themeConfig.accentColor + 'dd';
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
    root.style.setProperty('--accent', '#5b7fd6');
    root.style.setProperty('--accent-light', '#5b7fd620');
    root.style.setProperty('--accent-hover', '#5b7fd6dd');
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
