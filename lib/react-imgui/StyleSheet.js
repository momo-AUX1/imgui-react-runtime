// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

const EMPTY_OBJECT = Object.freeze({});
const FONT_REGISTRY = (typeof globalThis !== 'undefined' && globalThis.__reactImguiFonts)
  ? globalThis.__reactImguiFonts
  : Object.create(null);

if (typeof globalThis !== 'undefined' && !globalThis.__reactImguiFonts) {
  globalThis.__reactImguiFonts = FONT_REGISTRY;
}

const THEME_COLOR_KEYS = new Set([
  'text',
  'windowBg',
  'childBg',
  'popupBg',
  'border',
  'borderShadow',
  'frameBg',
  'frameBgHovered',
  'frameBgActive',
  'titleBg',
  'titleBgActive',
  'titleBgCollapsed',
  'menuBarBg',
  'scrollbarBg',
  'scrollbarGrab',
  'scrollbarGrabHovered',
  'scrollbarGrabActive',
  'checkMark',
  'sliderGrab',
  'sliderGrabActive',
  'button',
  'buttonHovered',
  'buttonActive',
  'header',
  'headerHovered',
  'headerActive',
  'separator',
  'separatorHovered',
  'separatorActive',
  'tab',
  'tabHovered',
  'tabActive',
  'tabUnfocused',
  'tabUnfocusedActive',
  'plotLines',
  'plotLinesHovered',
  'plotHistogram',
  'plotHistogramHovered'
]);

const THEME_STYLE_KEYS = new Set([
  'windowRounding',
  'windowPadding',
  'framePadding',
  'frameRounding',
  'itemSpacing',
  'itemInnerSpacing',
  'indentSpacing',
  'scrollbarSize',
  'grabMinSize'
]);

let currentTheme = undefined;

function sanitizeStyle(style) {
  if (!style || typeof style !== 'object') {
    return EMPTY_OBJECT;
  }

  const result = {};
  for (const key in style) {
    if (Object.prototype.hasOwnProperty.call(style, key)) {
      const value = style[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return Object.freeze(result);
}

function flattenStyle(style) {
  if (style === undefined || style === null || style === false) {
    return undefined;
  }

  if (Array.isArray(style)) {
    let merged = null;
    for (let i = 0; i < style.length; i++) {
      const value = flattenStyle(style[i]);
      if (value && typeof value === 'object') {
        if (merged === null) {
          merged = {};
        }
        Object.assign(merged, value);
      }
    }
    return merged || undefined;
  }

  if (typeof style === 'object') {
    return style;
  }

  return undefined;
}

const StyleSheet = {
  create(styles) {
    if (!styles || typeof styles !== 'object') {
      return Object.freeze({});
    }

    const resolved = {};
    for (const key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) {
        resolved[key] = sanitizeStyle(styles[key]);
      }
    }

    return Object.freeze(resolved);
  },

  compose(style1, style2) {
    if (!style1) {
      return style2 || null;
    }
    if (!style2) {
      return style1;
    }
    return [style1, style2];
  },

  flatten(style) {
    return flattenStyle(style);
  },

  hairlineWidth: 1,

  registerFont(name, nativeHandle) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('StyleSheet.registerFont(name, handle) expects a string name');
    }
    if (nativeHandle === undefined || nativeHandle === null) {
      delete FONT_REGISTRY[name];
      return;
    }

    if (typeof nativeHandle !== 'number') {
      throw new TypeError('StyleSheet.registerFont expected a numeric native handle');
    }

    FONT_REGISTRY[name] = nativeHandle;
  },

  getFontHandle(name) {
    if (!name || typeof name !== 'string') {
      return undefined;
    }
    return FONT_REGISTRY[name];
  },

  createTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      return EMPTY_OBJECT;
    }

    const normalized = {};

    if (theme.colors && typeof theme.colors === 'object') {
      const normalizedColors = {};
      for (const key in theme.colors) {
        if (Object.prototype.hasOwnProperty.call(theme.colors, key) && THEME_COLOR_KEYS.has(key)) {
          const value = theme.colors[key];
          if (value !== undefined && value !== null) {
            normalizedColors[key] = value;
          }
        }
      }
      if (Object.keys(normalizedColors).length > 0) {
        normalized.colors = Object.freeze(normalizedColors);
      }
    }

    if (theme.style && typeof theme.style === 'object') {
      const normalizedVars = {};
      for (const key in theme.style) {
        if (Object.prototype.hasOwnProperty.call(theme.style, key) && THEME_STYLE_KEYS.has(key)) {
          const value = theme.style[key];
          if (value !== undefined && value !== null) {
            normalizedVars[key] = value;
          }
        }
      }
      if (Object.keys(normalizedVars).length > 0) {
        normalized.style = Object.freeze(normalizedVars);
      }
    }

    if (theme.fonts && typeof theme.fonts === 'object') {
      const normalizedFonts = {};
      for (const key in theme.fonts) {
        if (Object.prototype.hasOwnProperty.call(theme.fonts, key)) {
          const registered = theme.fonts[key];
          if (typeof registered === 'string' || typeof registered === 'number') {
            normalizedFonts[key] = registered;
          }
        }
      }
      if (Object.keys(normalizedFonts).length > 0) {
        normalized.fonts = Object.freeze(normalizedFonts);
      }
    }

    return Object.freeze(normalized);
  },

  applyTheme(theme) {
    const normalized = StyleSheet.createTheme(theme);
    currentTheme = normalized;
    if (typeof globalThis !== 'undefined') {
      globalThis.__reactImguiTheme = normalized;
    }
    return normalized;
  },

  clearTheme() {
    currentTheme = undefined;
    if (typeof globalThis !== 'undefined' && globalThis.__reactImguiTheme) {
      delete globalThis.__reactImguiTheme;
    }
  },

  getTheme() {
    return currentTheme;
  }
};

export default StyleSheet;
