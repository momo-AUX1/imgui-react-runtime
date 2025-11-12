// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

const EMPTY_OBJECT = Object.freeze({});

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
};

export default StyleSheet;
