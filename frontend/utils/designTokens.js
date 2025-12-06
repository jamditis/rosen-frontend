/**
 * Design System Token Utilities
 *
 * Helper functions to extract CSS custom properties from the design system
 * for use in Canvas rendering and JavaScript calculations.
 */

/**
 * Get a design token value from CSS custom properties
 * @param {string} tokenName - The CSS variable name (with or without --)
 * @returns {string} The computed value
 */
export const getToken = (tokenName) => {
  const varName = tokenName.startsWith('--') ? tokenName : `--${tokenName}`;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
};

/**
 * Get multiple tokens at once
 * @param {string[]} tokenNames - Array of token names
 * @returns {Object} Object with token names as keys and values
 */
export const getTokens = (tokenNames) => {
  const tokens = {};
  tokenNames.forEach(name => {
    tokens[name] = getToken(name);
  });
  return tokens;
};

/**
 * Convert hex color to rgba
 * @param {string} hex - Hex color code
 * @param {number} alpha - Alpha value 0-1
 * @returns {string} rgba color string
 */
export const hexToRgba = (hex, alpha = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Get all accent colors from design system
 * @returns {Object} Object with accent color sets
 */
export const getAccentColors = () => {
  return {
    sky: {
      main: getToken('color-accent-sky'),
      light: getToken('color-accent-sky-light'),
      dark: getToken('color-accent-sky-dark')
    },
    green: {
      main: getToken('color-accent-green'),
      light: getToken('color-accent-green-light'),
      dark: getToken('color-accent-green-dark')
    },
    amber: {
      main: getToken('color-accent-amber'),
      light: getToken('color-accent-amber-light'),
      dark: getToken('color-accent-amber-dark')
    },
    pink: {
      main: getToken('color-accent-pink'),
      light: getToken('color-accent-pink-light'),
      dark: getToken('color-accent-pink-dark')
    },
    violet: {
      main: getToken('color-accent-violet'),
      light: getToken('color-accent-violet-light'),
      dark: getToken('color-accent-violet-dark')
    },
    orange: {
      main: getToken('color-accent-orange'),
      light: getToken('color-accent-orange-light'),
      dark: getToken('color-accent-orange-dark')
    },
    emerald: {
      main: getToken('color-accent-emerald'),
      light: getToken('color-accent-emerald-light'),
      dark: getToken('color-accent-emerald-dark')
    },
    rose: {
      main: getToken('color-accent-rose'),
      light: getToken('color-accent-rose-light'),
      dark: getToken('color-accent-rose-dark')
    }
  };
};

/**
 * Get category color mapping from COLORS constant
 * Uses the same hash algorithm as Explorer.js
 */
export const getCategoryColorFromHash = (categoryName, colorArray) => {
  const hash = categoryName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colorArray[hash % colorArray.length];
};
