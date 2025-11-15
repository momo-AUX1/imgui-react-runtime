// Copyright (c) Momo-AUX1
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
let latestFontConfiguration = undefined;

const textEncoder = (typeof TextEncoder === 'function') ? new TextEncoder() : null;

function normalizeFontData(data) {
  if (!data) {
    return undefined;
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
  }

  if (typeof data === 'object' && data !== null) {
    const maybeBuffer = data;
    if (typeof maybeBuffer.buffer === 'object' && typeof maybeBuffer.byteLength === 'number') {
      return new Uint8Array(maybeBuffer.buffer, maybeBuffer.byteOffset || 0, maybeBuffer.byteLength);
    }
  }

  if (typeof data === 'string' && textEncoder) {
    return textEncoder.encode(data);
  }

  throw new TypeError('Font data must be an ArrayBuffer, TypedArray, or encoded string');
}

function normalizeGlyphPresets(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const presets = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        presets.push(trimmed);
      }
    }
  }
  return presets.length > 0 ? presets : undefined;
}

function normalizeGlyphRanges(value) {
  if (!value) {
    return undefined;
  }

  const ranges = [];
  const appendRange = (start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return;
    }
    const lower = Math.max(0, Math.min(65535, Math.floor(start)));
    const upper = Math.max(0, Math.min(65535, Math.floor(end)));
    if (upper < lower) {
      ranges.push(upper, lower);
    } else {
      ranges.push(lower, upper);
    }
  };

  const processEntry = (entry) => {
    if (entry === undefined || entry === null) {
      return;
    }
    if (Array.isArray(entry) && entry.length >= 2) {
      appendRange(+entry[0], +entry[1]);
      return;
    }
    if (typeof entry === 'number') {
      appendRange(entry, entry);
      return;
    }
    if (typeof entry === 'object' && entry !== null && 'start' in entry && 'end' in entry) {
      appendRange(+entry.start, +entry.end);
    }
  };

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      processEntry(value[i]);
    }
  } else {
    processEntry(value);
  }

  if (ranges.length % 2 === 1) {
    ranges.pop();
  }

  return ranges.length > 0 ? ranges : undefined;
}

function normalizeOversample(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const result = {};
  if (typeof value.x === 'number' && Number.isFinite(value.x)) {
    const coerced = Math.max(1, Math.floor(value.x));
    if (coerced !== 3) {
      result.x = coerced;
    }
  }
  if (typeof value.y === 'number' && Number.isFinite(value.y)) {
    const coerced = Math.max(1, Math.floor(value.y));
    if (coerced !== 1) {
      result.y = coerced;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeGlyphOffset(value) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const offset = {};
  if (typeof value.x === 'number' && Number.isFinite(value.x)) {
    offset.x = value.x;
  }
  if (typeof value.y === 'number' && Number.isFinite(value.y)) {
    offset.y = value.y;
  }
  return Object.keys(offset).length > 0 ? offset : undefined;
}

function normalizeFontDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new TypeError('Font descriptor must be an object');
  }

  const name = typeof descriptor.name === 'string' ? descriptor.name.trim() : '';
  if (!name) {
    throw new TypeError('Font descriptor requires a non-empty name');
  }

  const normalized = { name };

  if (descriptor.size !== undefined) {
    const size = Number(descriptor.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new TypeError(`Invalid font size for "${name}"`);
    }
    normalized.size = size;
  }

  if (descriptor.merge !== undefined) {
    normalized.merge = !!descriptor.merge;
  }
  if (descriptor.pixelSnap !== undefined) {
    normalized.pixelSnap = !!descriptor.pixelSnap;
  }

  if (descriptor.rasterizerMultiply !== undefined) {
    const multiplier = Number(descriptor.rasterizerMultiply);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new TypeError(`Invalid rasterizerMultiply for "${name}"`);
    }
    normalized.rasterizerMultiply = multiplier;
  }

  const glyphOffset = normalizeGlyphOffset(descriptor.glyphOffset);
  if (glyphOffset) {
    normalized.glyphOffset = glyphOffset;
  }

  const oversample = normalizeOversample(descriptor.oversample);
  if (oversample) {
    normalized.oversample = oversample;
  }

  if (descriptor.path !== undefined) {
    if (descriptor.path === null) {
      throw new TypeError(`Font descriptor for "${name}" has null path`);
    }
    const pathValue = String(descriptor.path);
    if (!pathValue) {
      throw new TypeError(`Font descriptor for "${name}" requires a non-empty path`);
    }
    normalized.path = pathValue;
  }

  if (descriptor.source !== undefined) {
    const sourceValue = String(descriptor.source).trim();
    if (sourceValue) {
      normalized.source = sourceValue;
    }
  }

  const data = normalizeFontData(descriptor.data);
  if (data) {
    normalized.data = data;
  }

  const presets = normalizeGlyphPresets(descriptor.glyphPresets);
  if (presets) {
    normalized.glyphPresets = presets;
  }

  const ranges = normalizeGlyphRanges(descriptor.glyphRanges);
  if (ranges) {
    normalized.glyphRanges = ranges;
  }

  return normalized;
}

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

    if (typeof nativeHandle !== 'number' && typeof nativeHandle !== 'string') {
      throw new TypeError('StyleSheet.registerFont expected a numeric or string native handle');
    }

    FONT_REGISTRY[name] = nativeHandle;
  },

  configureFonts(fonts, options = {}) {
    if (!Array.isArray(fonts) || fonts.length === 0) {
      throw new TypeError('StyleSheet.configureFonts expects a non-empty array of font descriptors');
    }

    if (typeof globalThis === 'undefined' || typeof globalThis.__configureImGuiFonts !== 'function') {
      throw new Error('ImGui font configuration is not available in this runtime');
    }

    const normalizedDescriptors = fonts.map(normalizeFontDescriptor);
    const hostOptions = {};

    if (options && typeof options === 'object') {
      if (options.defaultFont !== undefined) {
        hostOptions.defaultFont = String(options.defaultFont);
      }
      if (options.globalScale !== undefined) {
        const scale = Number(options.globalScale);
        if (!Number.isFinite(scale) || scale <= 0) {
          throw new TypeError('StyleSheet.configureFonts globalScale must be a positive number');
        }
        hostOptions.globalScale = scale;
      }
    }

    const result = globalThis.__configureImGuiFonts(normalizedDescriptors, hostOptions);
    const fontHandles = result && typeof result === 'object' && result.fonts && typeof result.fonts === 'object'
      ? result.fonts
      : {};

    for (const key in FONT_REGISTRY) {
      if (Object.prototype.hasOwnProperty.call(FONT_REGISTRY, key)) {
        delete FONT_REGISTRY[key];
      }
    }

    for (const key in fontHandles) {
      if (!Object.prototype.hasOwnProperty.call(fontHandles, key)) {
        continue;
      }
      const handle = fontHandles[key];
      if ((typeof handle === 'number' && Number.isFinite(handle)) || typeof handle === 'string') {
        FONT_REGISTRY[key] = handle;
      }
    }

    const summary = Object.freeze({
      fonts: Object.freeze({ ...FONT_REGISTRY }),
      defaultFont: (result && (typeof result.defaultFont === 'string' || typeof result.defaultFont === 'number'))
        ? result.defaultFont
        : undefined,
      atlasWidth: result && typeof result.atlasWidth === 'number' ? result.atlasWidth : undefined,
      atlasHeight: result && typeof result.atlasHeight === 'number' ? result.atlasHeight : undefined,
      globalScale: result && typeof result.globalScale === 'number' ? result.globalScale : undefined
    });

    latestFontConfiguration = summary;
    if (typeof globalThis !== 'undefined') {
      globalThis.__reactImguiFontConfig = summary;
    }

    return summary;
  },

  getCurrentFontConfiguration() {
    return latestFontConfiguration || null;
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
