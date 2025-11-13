// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

// ImGui renderer - traverses React tree and calls FFI functions
// This file must be in typed mode to use FFI
// @ts-nocheck

// ImGui renderer loaded

/* global console, _sizeof_c_bool, _sizeof_c_float, _sizeof_c_int */

var SIZEOF_C_BOOL = 1;
if (typeof globalThis._sizeof_c_bool === "number") {
  SIZEOF_C_BOOL = globalThis._sizeof_c_bool;
}

var SIZEOF_C_FLOAT = 4;
if (typeof globalThis._sizeof_c_float === "number") {
  SIZEOF_C_FLOAT = globalThis._sizeof_c_float;
}

var SIZEOF_C_INT = 4;
if (typeof globalThis._sizeof_c_int === "number") {
  SIZEOF_C_INT = globalThis._sizeof_c_int;
}

var SIZEOF_C_DOUBLE = 8;
if (typeof globalThis._sizeof_c_double === "number") {
  SIZEOF_C_DOUBLE = globalThis._sizeof_c_double;
}

var SIZEOF_C_LONG_LONG = 8;
if (typeof globalThis._sizeof_c_long_long === "number") {
  SIZEOF_C_LONG_LONG = globalThis._sizeof_c_long_long;
}

var SIZEOF_C_PTR = 8;
if (typeof globalThis._sizeof_c_ptr === "number") {
  SIZEOF_C_PTR = globalThis._sizeof_c_ptr;
}

var renderDockSpaceWarned = false;

function getFontHandleFromRegistry(font) {
  if (font === undefined || font === null) {
    return 0;
  }

  if (typeof font === 'number' && Number.isFinite(font)) {
    return font;
  }

  if (typeof font === 'string') {
    const fonts = globalThis && globalThis.__reactImguiFonts;
    if (fonts && Object.prototype.hasOwnProperty.call(fonts, font)) {
      const handle = fonts[font];
      if (typeof handle === 'number' && Number.isFinite(handle)) {
        return handle;
      }
    }
  }

  return 0;
}

function logErrorMessage(message) {
  const consoleObj = globalThis && globalThis.console;
  if (consoleObj && typeof consoleObj.error === "function") {
    consoleObj.error(message);
    return;
  }
  if (typeof globalThis.print === "function") {
    globalThis.print("ERROR:", message);
  }
}

var _cleanupStack = /** @type {Array<() => void>} */ ([]);

function pushCleanup(cleanupFn) {
  if (typeof cleanupFn === "function") {
    _cleanupStack.push(cleanupFn);
  }
}

function popAndRunCleanup() {
  if (_cleanupStack.length === 0) {
    return;
  }
  const cleanup = _cleanupStack.pop();
  try {
    cleanup();
  } catch (error) {
    logErrorMessage("Error running cleanup: " + String(error));
  }
}

function runCleanupsFrom(startDepth) {
  const targetDepth = startDepth !== undefined && startDepth >= 0 ? startDepth : 0;
  while (_cleanupStack.length > targetDepth) {
    const cleanup = _cleanupStack.pop();
    try {
      cleanup();
    } catch (error) {
      logErrorMessage("Error running cleanup: " + String(error));
    }
  }
}

function ensureCleanupStackReset() {
  if (_cleanupStack.length !== 0) {
    logErrorMessage("Cleanup stack not empty before render; forcing cleanup.");
    runCleanupsFrom(0);
  }
}

/**
 * Parse a color value to ImVec4 format.
 * Supports hex strings (#RRGGBB or #RRGGBBAA) and objects {r,g,b,a}.
 * @param outVec Pointer to ImVec4 output buffer (caller must allocate)
 * @param color Color value to parse
 */
function parseColorToImVec4(outVec, color) {
  let r = 255, g = 255, b = 255, a = 255;

  if (typeof color === 'string' && color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) : 255;
    }
    // Invalid length - fall through with white
  } else if (typeof color === 'object' && color !== null) {
    r = +color.r;
    g = +color.g;
    b = +color.b;
    a = color.a !== undefined ? +color.a : 255;
  }

  // Check for NaN (invalid hex digits) - fall back to white
  if (isNaN(r + g + b + a)) {
    r = g = b = a = 255;
  }

  set_ImVec4_x(outVec, r * (1/255));
  set_ImVec4_y(outVec, g * (1/255));
  set_ImVec4_z(outVec, b * (1/255));
  set_ImVec4_w(outVec, a * (1/255));
}

/**
 * Parse a color value to ABGR format (used by ImGui DrawList).
 * Supports hex strings (#RRGGBB or #RRGGBBAA) and objects {r,g,b,a}.
 * Returns a 32-bit unsigned integer in ABGR format.
 */
function parseColorToABGR(color) {
  const vec = allocTmp(_sizeof_ImVec4);
  parseColorToImVec4(vec, color);
  const r = Math.floor(+get_ImVec4_x(vec) * 255);
  const g = Math.floor(+get_ImVec4_y(vec) * 255);
  const b = Math.floor(+get_ImVec4_z(vec) * 255);
  const a = Math.floor(+get_ImVec4_w(vec) * 255);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function getStyleFromProps(props) {
  if (!props) {
    return null;
  }

  const style = props.style;
  if (!style || typeof style !== "object") {
    return null;
  }

  return style;
}

function getStyleColor(style, key) {
  if (!style) {
    return undefined;
  }

  const value = style[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  return value;
}

function getStyleNumber(style, key) {
  if (!style) {
    return undefined;
  }

  const raw = style[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const num = +raw;
  if (!Number.isFinite(num)) {
    return undefined;
  }

  return num;
}

function pushFrameBgColorsFromStyle(style, vec4) {
  const colorValue = getStyleColor(style, "backgroundColor");
  if (colorValue === undefined) {
    return 0;
  }

  parseColorToImVec4(vec4, colorValue);
  _igPushStyleColor_Vec4(_ImGuiCol_FrameBg, vec4);
  _igPushStyleColor_Vec4(_ImGuiCol_FrameBgHovered, vec4);
  _igPushStyleColor_Vec4(_ImGuiCol_FrameBgActive, vec4);
  return 3;
}

function pushHeaderColorsFromStyle(style, vec4) {
  const colorValue = getStyleColor(style, "backgroundColor");
  if (colorValue === undefined) {
    return 0;
  }

  parseColorToImVec4(vec4, colorValue);
  _igPushStyleColor_Vec4(_ImGuiCol_Header, vec4);
  _igPushStyleColor_Vec4(_ImGuiCol_HeaderHovered, vec4);
  _igPushStyleColor_Vec4(_ImGuiCol_HeaderActive, vec4);
  return 3;
}

function pushButtonColorsFromStyle(style, vec4) {
  const colorValue = getStyleColor(style, "backgroundColor");
  if (colorValue === undefined) {
    return 0;
  }

  parseColorToImVec4(vec4, colorValue);
  _igPushStyleColor_Vec4(_ImGuiCol_Button, vec4);
  _igPushStyleColor_Vec4(_ImGuiCol_ButtonHovered, vec4);
  _igPushStyleColor_Vec4(_ImGuiCol_ButtonActive, vec4);
  return 3;
}

function pushTextColorFromStyle(style, vec4) {
  const colorValue = getStyleColor(style, "color");
  if (colorValue === undefined) {
    return 0;
  }

  parseColorToImVec4(vec4, colorValue);
  _igPushStyleColor_Vec4(_ImGuiCol_Text, vec4);
  return 1;
}

function readUtf8String(ptr, maxBytes) {
  if (ptr === 0 || maxBytes <= 0) {
    return "";
  }

  let result = "";
  let index = 0;

  while (index < maxBytes) {
    const firstByte = _sh_ptr_read_c_uchar(ptr, index) | 0;
    if (firstByte === 0) {
      break;
    }
    index += 1;

    if (firstByte < 0x80) {
      result += String.fromCharCode(firstByte);
      continue;
    }

    if ((firstByte & 0xE0) === 0xC0) {
      if (index >= maxBytes) {
        break;
      }
      const secondByte = _sh_ptr_read_c_uchar(ptr, index) & 0x3F;
      index += 1;
      const codePoint = ((firstByte & 0x1F) << 6) | secondByte;
      result += String.fromCharCode(codePoint);
      continue;
    }

    if ((firstByte & 0xF0) === 0xE0) {
      if (index + 1 >= maxBytes) {
        break;
      }
      const secondByte = _sh_ptr_read_c_uchar(ptr, index) & 0x3F;
      const thirdByte = _sh_ptr_read_c_uchar(ptr, index + 1) & 0x3F;
      index += 2;
      const codePoint = ((firstByte & 0x0F) << 12) | (secondByte << 6) | thirdByte;
      result += String.fromCharCode(codePoint);
      continue;
    }

    if ((firstByte & 0xF8) === 0xF0) {
      if (index + 2 >= maxBytes) {
        break;
      }
      const secondByte = _sh_ptr_read_c_uchar(ptr, index) & 0x3F;
      const thirdByte = _sh_ptr_read_c_uchar(ptr, index + 1) & 0x3F;
      const fourthByte = _sh_ptr_read_c_uchar(ptr, index + 2) & 0x3F;
      index += 3;
      const codePoint = ((firstByte & 0x07) << 18) | (secondByte << 12) | (thirdByte << 6) | fourthByte;
      const adjusted = codePoint - 0x10000;
      const high = 0xD800 | ((adjusted >> 10) & 0x3FF);
      const low = 0xDC00 | (adjusted & 0x3FF);
      result += String.fromCharCode(high);
      result += String.fromCharCode(low);
      continue;
    }

    // Invalid continuation byte sequence - replace with replacement character
    result += '\uFFFD';
  }

  return result;
}

function truncateStringToMaxLength(value, maxLength) {
  if (maxLength <= 0) {
    return "";
  }

  let result = "";
  let count = 0;
  let truncated = false;

  for (const ch of value) {
    if (count >= maxLength) {
      truncated = true;
      break;
    }
    result += ch;
    count += 1;
  }

  if (!truncated && count <= maxLength) {
    return value;
  }

  return result;
}

function dropLastCodePoint(value) {
  let result = "";
  let previous = "";
  let hasPrevious = false;

  for (const ch of value) {
    if (hasPrevious) {
      result += previous;
    } else {
      hasPrevious = true;
    }
    previous = ch;
  }

  if (!hasPrevious) {
    return "";
  }

  return result;
}

/**
 * Validates and returns a finite number, or a default value if invalid.
 * @param value Value to validate
 * @param defaultValue Default value if invalid
 * @param propName Property name for error messages
 * @returns Valid number or default
 */
function validateNumber(value, defaultValue, propName) {
  const num = +value;
  if (!Number.isFinite(num)) {
    logErrorMessage(`Invalid ${propName}: ${value} (NaN or Infinity). Using ${defaultValue}.`);
    return defaultValue;
  }
  return num;
}

function validateInteger(value, defaultValue, propName) {
  const num = validateNumber(value, defaultValue, propName);
  if (!Number.isFinite(num)) {
    return defaultValue;
  }
  return Math.round(num);
}

function gatherInlineText(node, componentName) {
  if (!node) {
    return "";
  }

  const version = typeof node.getInlineContentVersion === "function"
    ? node.getInlineContentVersion()
    : (node._inlineCacheVersion >>> 0) || 0;

  const cache = typeof node.getInlineTextCache === "function"
    ? node.getInlineTextCache()
    : node._inlineTextCache;

  if (cache && cache.version === version) {
    const nonTextCached = cache.nonTextTypes;
    if (nonTextCached && nonTextCached.length > 0) {
      for (let i = 0; i < nonTextCached.length; i++) {
        logErrorMessage(
          `<${componentName}> only supports text children. Ignoring <${nonTextCached[i]}>.`
        );
      }
    }
    return cache.value;
  }

  let text = "";
  const nonTextTypes = /** @type {Array<string>} */ ([]);

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.text !== undefined) {
        text += child.text;
      } else {
        const typeName = child && child.type !== undefined ? child.type : "unknown";
        nonTextTypes.push(typeName);
      }
    }
  }

  if (nonTextTypes.length > 0) {
    for (let i = 0; i < nonTextTypes.length; i++) {
      logErrorMessage(
        `<${componentName}> only supports text children. Ignoring <${nonTextTypes[i]}>.`
      );
    }
  }

  const newCache = {
    version,
    value: text,
    nonTextTypes
  };

  if (typeof node.setInlineTextCache === "function") {
    node.setInlineTextCache(newCache);
  } else {
    node._inlineTextCache = newCache;
  }

  return text;
}

/**
 * Safely invokes a callback with exception handling.
 * @param callback The callback function to invoke
 * @param args Arguments to pass to callback
 */
function safeInvokeCallback(callback, ...args) {
  if (!callback || typeof callback !== 'function') {
    return;
  }

  const canRender = !!(globalThis && globalThis.reactApp && typeof globalThis.reactApp.render === 'function');
  const hasImmediate = !!(globalThis && typeof globalThis.setImmediate === 'function');
  const hasQueueMicrotask = !!(globalThis && typeof globalThis.queueMicrotask === 'function');

  let callbackExecuted = false;
  const invoke = function() {
    callbackExecuted = true;
    callback(...args);
  };

  try {
    if (globalThis && typeof globalThis.__reactImguiFlushSync === 'function') {
      globalThis.__reactImguiFlushSync(invoke);
      return;
    }
    if (globalThis && typeof globalThis.__reactImguiDiscreteUpdates === 'function') {
      globalThis.__reactImguiDiscreteUpdates(invoke);
      return;
    }
    if (globalThis && typeof globalThis.__reactImguiBatchedUpdates === 'function') {
      globalThis.__reactImguiBatchedUpdates(invoke);
      return;
    }
    invoke();
  } catch (e) {
    logErrorMessage("Error in callback: " + String(e));
    return;
  }

  if (callbackExecuted && canRender) {
    const renderFn = globalThis.reactApp.render;
    const runRender = function() {
      try {
        renderFn();
      } catch (error) {
        logErrorMessage("Error re-rendering after callback: " + String(error));
      }
    };

    if (hasImmediate) {
      globalThis.setImmediate(runRender);
    } else if (hasQueueMicrotask) {
      globalThis.queueMicrotask(runRender);
    } else {
      runRender();
    }
  }
}

/**
 * Renders a window component with controlled/uncontrolled position and size.
 */
function renderWindow(node, vec2, vec4) {
  const props = node.props;
  const title = (props && props.title) ? props.title : "Window";

  // Track which properties are controlled vs uncontrolled
  const hasControlledPos = props && (props.x !== undefined || props.y !== undefined);
  const hasDefaultPos = props && (props.defaultX !== undefined || props.defaultY !== undefined);
  const hasControlledSize = props && (props.width !== undefined || props.height !== undefined);
  const hasDefaultSize = props && (props.defaultWidth !== undefined || props.defaultHeight !== undefined);

  // Warn about conflicting props
  if (hasControlledPos && hasDefaultPos) {
    logErrorMessage(`Window "${title}" has both x/y and defaultX/defaultY props. Controlled props (x/y) will be used.`);
  }
  if (hasControlledSize && hasDefaultSize) {
    logErrorMessage(`Window "${title}" has both width/height and defaultWidth/defaultHeight props. Controlled props (width/height) will be used.`);
  }

  // Flags to track whether we should read from ImGui after rendering
  let shouldReadPos = false;
  let shouldReadSize = false;

  // Handle controlled position
  // Strategy: Compare current prop values against last prop values we recorded
  // - If different -> React changed it -> write to ImGui, don't read
  // - If same -> React didn't change it -> read from ImGui (user may have moved window)
  if (hasControlledPos) {
    const propX = validateNumber(props.x !== undefined ? props.x : 0, 0, "window x");
    const propY = validateNumber(props.y !== undefined ? props.y : 0, 0, "window y");

    // Check if this is first render or if React changed the position
    const isFirstRender = node._lastPropX === undefined;
    const posChanged = propX !== node._lastPropX || propY !== node._lastPropY;

    if (isFirstRender || posChanged) {
      // First render or React changed position -> write to ImGui with ImGuiCond_Always
      set_ImVec2_x(vec2, propX);
      set_ImVec2_y(vec2, propY);
      const pivot = allocTmp(_sizeof_ImVec2);
      set_ImVec2_x(pivot, 0);
      set_ImVec2_y(pivot, 0);
      _igSetNextWindowPos(vec2, _ImGuiCond_Always, pivot);

      // Update last prop values
      node._lastPropX = propX;
      node._lastPropY = propY;
    }

    // Always read back to sync with ImGui's actual state
    shouldReadPos = true;
  } else if (hasDefaultPos) {
    // Uncontrolled: set position once on first frame
    const defaultX = validateNumber(props.defaultX !== undefined ? props.defaultX : 0, 0, "window defaultX");
    const defaultY = validateNumber(props.defaultY !== undefined ? props.defaultY : 0, 0, "window defaultY");
    set_ImVec2_x(vec2, defaultX);
    set_ImVec2_y(vec2, defaultY);
    const pivot = allocTmp(_sizeof_ImVec2);
    set_ImVec2_x(pivot, 0);
    set_ImVec2_y(pivot, 0);
    _igSetNextWindowPos(vec2, _ImGuiCond_Once, pivot);
  }

  // Handle controlled size (same strategy as position)
  if (hasControlledSize) {
    const propWidth = validateNumber(props.width !== undefined ? props.width : 0, 0, "window width");
    const propHeight = validateNumber(props.height !== undefined ? props.height : 0, 0, "window height");

    // Validate positive dimensions
    if (propWidth <= 0 || propHeight <= 0) {
      logErrorMessage(`Window "${title}" has invalid size: ${propWidth}x${propHeight}. Size must be positive. Using defaults.`);
    }

    // Check if this is first render or if React changed the size
    const isFirstRender = node._lastPropWidth === undefined;
    const sizeChanged = propWidth !== node._lastPropWidth || propHeight !== node._lastPropHeight;

    if (isFirstRender || sizeChanged) {
      // First render or React changed size -> write to ImGui with ImGuiCond_Always
      if (propWidth > 0 && propHeight > 0) {
        set_ImVec2_x(vec2, propWidth);
        set_ImVec2_y(vec2, propHeight);
        _igSetNextWindowSize(vec2, _ImGuiCond_Always);
      }

      // Update last prop values
      node._lastPropWidth = propWidth;
      node._lastPropHeight = propHeight;
    }

    // Always read back to sync with ImGui's actual state
    shouldReadSize = true;
  } else if (hasDefaultSize) {
    // Uncontrolled: set size once on first frame
    const defaultWidth = validateNumber(props.defaultWidth !== undefined ? props.defaultWidth : 0, 0, "window defaultWidth");
    const defaultHeight = validateNumber(props.defaultHeight !== undefined ? props.defaultHeight : 0, 0, "window defaultHeight");
    set_ImVec2_x(vec2, defaultWidth);
    set_ImVec2_y(vec2, defaultHeight);
    _igSetNextWindowSize(vec2, _ImGuiCond_Once);
  }

  // Get window flags and merge convenience props
  let windowFlags = props && props.flags !== undefined ? props.flags | 0 : 0;

  if (props) {
    if (props.noTitleBar) windowFlags |= _ImGuiWindowFlags_NoTitleBar;
    if (props.noResize) windowFlags |= _ImGuiWindowFlags_NoResize;
    if (props.noMove) windowFlags |= _ImGuiWindowFlags_NoMove;
    if (props.noScrollbar) windowFlags |= _ImGuiWindowFlags_NoScrollbar;
    if (props.noScrollWithMouse) windowFlags |= _ImGuiWindowFlags_NoScrollWithMouse;
    if (props.noCollapse) windowFlags |= _ImGuiWindowFlags_NoCollapse;
    if (props.alwaysAutoResize) windowFlags |= _ImGuiWindowFlags_AlwaysAutoResize;
    if (props.noBackground) windowFlags |= _ImGuiWindowFlags_NoBackground;
    if (props.noSavedSettings) windowFlags |= _ImGuiWindowFlags_NoSavedSettings;
    if (props.noMouseInputs) windowFlags |= _ImGuiWindowFlags_NoMouseInputs;
    if (props.horizontalScrollbar) windowFlags |= _ImGuiWindowFlags_HorizontalScrollbar;
    if (props.noFocusOnAppearing) windowFlags |= _ImGuiWindowFlags_NoFocusOnAppearing;
    if (props.noBringToFrontOnFocus) windowFlags |= _ImGuiWindowFlags_NoBringToFrontOnFocus;
    if (props.alwaysVerticalScrollbar) windowFlags |= _ImGuiWindowFlags_AlwaysVerticalScrollbar;
    if (props.alwaysHorizontalScrollbar) windowFlags |= _ImGuiWindowFlags_AlwaysHorizontalScrollbar;
    if (props.alwaysUseWindowPadding) windowFlags |= _ImGuiWindowFlags_AlwaysUseWindowPadding;
    if (props.noNavInputs) windowFlags |= _ImGuiWindowFlags_NoNavInputs;
    if (props.noNavFocus) windowFlags |= _ImGuiWindowFlags_NoNavFocus;
    if (props.unsavedDocument) windowFlags |= _ImGuiWindowFlags_UnsavedDocument;
  }

  let wantsMenuBar = !!(props && props.menuBar);
  if (!wantsMenuBar && node.children) {
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].type === "menubar") {
        wantsMenuBar = true;
        break;
      }
    }
  }
  if (wantsMenuBar) {
    windowFlags |= _ImGuiWindowFlags_MenuBar;
  }

  // Handle window close button via p_open parameter
  // If onClose callback exists, allocate a boolean pointer and pass it to igBegin
  // This enables the close button (X) in the window title bar
  const hasOnClose = props && props.onClose;
  const pOpen = hasOnClose ? allocTmp(SIZEOF_C_BOOL) : c_null;

  if (hasOnClose) {
    // Initialize p_open to true (window is open)
    _sh_ptr_write_c_bool(pOpen, 0, 1);
  }

  const windowVisible = _igBegin(tmpUtf8(title), pOpen, windowFlags) !== 0;
  pushCleanup(function() {
    _igEnd();
  });

  if (windowVisible) {
    // Read actual state from ImGui if needed and fire callback if changed
    let stateChanged = false;
    let actualX = node._lastPropX !== undefined ? node._lastPropX : 0;
    let actualY = node._lastPropY !== undefined ? node._lastPropY : 0;
    let actualWidth = node._lastPropWidth !== undefined ? node._lastPropWidth : 0;
    let actualHeight = node._lastPropHeight !== undefined ? node._lastPropHeight : 0;

    if (shouldReadPos) {
      _igGetWindowPos(vec2);
      actualX = +get_ImVec2_x(vec2);
      actualY = +get_ImVec2_y(vec2);

      // Check if position changed (either user moved window or ImGui clamped our values)
      if (actualX !== node._lastPropX || actualY !== node._lastPropY) {
        stateChanged = true;
        node._lastPropX = actualX;
        node._lastPropY = actualY;
      }
    }

    if (shouldReadSize) {
      _igGetWindowSize(vec2);
      actualWidth = +get_ImVec2_x(vec2);
      actualHeight = +get_ImVec2_y(vec2);

      // Check if size changed (either user resized window or ImGui adjusted our values)
      if (actualWidth !== node._lastPropWidth || actualHeight !== node._lastPropHeight) {
        stateChanged = true;
        node._lastPropWidth = actualWidth;
        node._lastPropHeight = actualHeight;
      }
    }

    // Fire callback if state changed
    if (stateChanged && props && props.onWindowState) {
      safeInvokeCallback(props.onWindowState, actualX, actualY, actualWidth, actualHeight);
    }

    // Render children
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }
  }

  popAndRunCleanup();

  // Check if user clicked the close button
  if (hasOnClose) {
    const isStillOpen = _sh_ptr_read_c_bool(pOpen, 0);
    if (!isStillOpen) {
      // User clicked close button - invoke callback
      safeInvokeCallback(props.onClose);
    }
  }
}

function renderDemoWindow(node) {
  const props = node.props;
  const pointer = allocTmp(SIZEOF_C_BOOL);
  const hasControlledValue = !!(props && props.open !== undefined);

  let currentValue;
  if (hasControlledValue && props) {
    currentValue = !!props.open;
  } else {
    if (node._demoWindowOpen === undefined) {
      const defaultOpen = props && props.defaultOpen !== undefined
        ? !!props.defaultOpen
        : false;
      node._demoWindowOpen = defaultOpen;
    }
    currentValue = !!node._demoWindowOpen;
  }

  _sh_ptr_write_c_bool(pointer, 0, currentValue ? 1 : 0);
  _igShowDemoWindow(pointer);
  const newValue = _sh_ptr_read_c_bool(pointer, 0) !== 0;

  if (!hasControlledValue && newValue !== currentValue) {
    node._demoWindowOpen = newValue;
  }

  if (props) {
    if (newValue !== currentValue && props.onChange) {
      safeInvokeCallback(props.onChange, newValue);
    }

    if (currentValue && !newValue && props.onClose) {
      safeInvokeCallback(props.onClose);
    }
  }
}

/**
 * Renders a root window that covers the entire viewport.
 * This window is always fullscreen, transparent, and cannot be moved or decorated.
 */
function renderRoot(node, vec2) {
  const viewport = _igGetMainViewport();

  // Get viewport position and size (these return pointers to ImVec2 inside viewport)
  const vpPos = get_ImGuiViewport_Pos(viewport);
  const vpSize = get_ImGuiViewport_Size(viewport);

  // Copy viewport position into our buffer and set window position
  set_ImVec2_x(vec2, +get_ImVec2_x(vpPos));
  set_ImVec2_y(vec2, +get_ImVec2_y(vpPos));
  const pivot = allocTmp(_sizeof_ImVec2);
  set_ImVec2_x(pivot, 0);
  set_ImVec2_y(pivot, 0);
  _igSetNextWindowPos(vec2, _ImGuiCond_Always, pivot);

  // Copy viewport size into our buffer and set window size
  set_ImVec2_x(vec2, +get_ImVec2_x(vpSize));
  set_ImVec2_y(vec2, +get_ImVec2_y(vpSize));
  _igSetNextWindowSize(vec2, _ImGuiCond_Always);

  // Combine required flags for root window behavior
  const rootFlags =
    _ImGuiWindowFlags_NoDecoration |
    _ImGuiWindowFlags_NoMove |
    _ImGuiWindowFlags_NoSavedSettings |
    _ImGuiWindowFlags_NoBringToFrontOnFocus |
    _ImGuiWindowFlags_NoBackground;

  const rootVisible = _igBegin(tmpUtf8("##Root"), c_null, rootFlags) !== 0;
  pushCleanup(function() {
    _igEnd();
  });

  if (rootVisible) {
    // Render children
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }
  }
  popAndRunCleanup();
}

/**
 * Renders a child window component.
 */
function renderChild(node, vec2) {
  const props = node.props;
  const childWidth = (props && props.width !== undefined) ? +props.width : 0;
  const childHeight = (props && props.height !== undefined) ? +props.height : 0;
  const childNoPadding = (props && props.noPadding !== undefined) ? props.noPadding : false;
  const childNoScrollbar = (props && props.noScrollbar !== undefined) ? props.noScrollbar : false;

  // Build child flags
  let childFlags = 0;
  if (childNoScrollbar) {
    childFlags |= _ImGuiWindowFlags_NoScrollbar;
    childFlags |= _ImGuiWindowFlags_NoScrollWithMouse;
  }

  // Push zero padding if requested (separate allocation needed - remains live on style stack)
  if (childNoPadding) {
    const zeroPadding = allocTmp(_sizeof_ImVec2);
    set_ImVec2_x(zeroPadding, 0);
    set_ImVec2_y(zeroPadding, 0);
    _igPushStyleVar_Vec2(_ImGuiStyleVar_WindowPadding, zeroPadding);
    pushCleanup(function() {
      _igPopStyleVar(1);
    });
  }

  set_ImVec2_x(vec2, childWidth);
  set_ImVec2_y(vec2, childHeight);

  const childVisible = _igBeginChild_Str(tmpUtf8("Content"), vec2, 0, childFlags) !== 0;
  pushCleanup(function() {
    _igEndChild();
  });

  if (childVisible && node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }

  popAndRunCleanup();

  if (childNoPadding) {
    popAndRunCleanup();
  }
}

function renderMenuBar(node) {
  if (!_igBeginMenuBar()) {
    return;
  }

  pushCleanup(function() {
    _igEndMenuBar();
  });

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }

  popAndRunCleanup();
}

function renderMainMenuBar(node) {
  if (!_igBeginMainMenuBar()) {
    return;
  }

  pushCleanup(function() {
    _igEndMainMenuBar();
  });

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }

  popAndRunCleanup();
}

function renderMenu(node) {
  const props = node.props;

  let label = "Menu";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (node.children) {
    let labelFromChildren = "";
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.text !== undefined) {
        labelFromChildren += child.text;
      }
    }
    if (labelFromChildren !== "") {
      label = labelFromChildren;
    }
  }

  const enabled = !(props && props.enabled === false);

  if (_igBeginMenu(tmpUtf8(label), enabled ? 1 : 0)) {
    pushCleanup(function() {
      _igEndMenu();
    });

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }

    popAndRunCleanup();
  }
}

function renderMenuItem(node) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "menuitem");

  let label = "Item";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  const shortcut = props && props.shortcut !== undefined && props.shortcut !== null
    ? String(props.shortcut)
    : "";
  const shortcutPtr = shortcut !== "" ? tmpUtf8(shortcut) : c_null;
  const enabled = !(props && props.enabled === false);
  const hasSelectedProp = props && props.selected !== undefined;
  const hasToggle = !!(props && (props.onChange || props.defaultSelected !== undefined || props.toggle));

  if (hasToggle) {
    const pointer = allocTmp(SIZEOF_C_BOOL);
    let currentValue;

    if (props && props.selected !== undefined) {
      const controlledValue = !!props.selected;
      const pendingValue = node._pendingControlledMenuItem;
      if (pendingValue !== undefined) {
        if (pendingValue === controlledValue) {
          node._pendingControlledMenuItem = undefined;
          currentValue = controlledValue;
        } else {
          currentValue = pendingValue;
        }
      } else {
        currentValue = controlledValue;
      }
    } else {
      if (node._menuItemSelected === undefined) {
        const defaultSelected = props && props.defaultSelected !== undefined ? !!props.defaultSelected : false;
        node._menuItemSelected = defaultSelected;
      }
      currentValue = !!node._menuItemSelected;
    }

    _sh_ptr_write_c_bool(pointer, 0, currentValue ? 1 : 0);
    const activated = _igMenuItem_BoolPtr(tmpUtf8(label), shortcutPtr, pointer, enabled ? 1 : 0) !== 0;
    const newValue = _sh_ptr_read_c_bool(pointer, 0) !== 0;

    if (props && props.selected !== undefined) {
      node._pendingControlledMenuItem = newValue;
    } else if (node._menuItemSelected !== newValue) {
      node._menuItemSelected = newValue;
    }

    if ((activated || newValue !== currentValue) && props && props.onChange) {
      safeInvokeCallback(props.onChange, newValue);
    }

    if (activated && props && props.onSelect) {
      safeInvokeCallback(props.onSelect, newValue);
    }
  } else {
    const displaySelected = hasSelectedProp && props ? !!props.selected : false;
    const activated = _igMenuItem_Bool(tmpUtf8(label), shortcutPtr, displaySelected ? 1 : 0, enabled ? 1 : 0) !== 0;
    if (activated && props && props.onSelect) {
      safeInvokeCallback(props.onSelect);
    }
  }
}

/**
 * Renders a button component.
 */
function renderButton(node, vec2, vec4) {
  let buttonText = gatherInlineText(node, "button");
  if (buttonText === "") {
    buttonText = "Button";
  }
  set_ImVec2_x(vec2, 0);
  set_ImVec2_y(vec2, 0);

  const props = node.props;
  const style = getStyleFromProps(props);
  let styleColorPushes = 0;

  let width = 0;
  let height = 0;

  if (props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "button width");
  }
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "button height");
  }

  if (style) {
    styleColorPushes += pushButtonColorsFromStyle(style, vec4);
    styleColorPushes += pushTextColorFromStyle(style, vec4);

    const styleWidth = getStyleNumber(style, "width");
    if (styleWidth !== undefined) {
      width = styleWidth;
    }

    const styleHeight = getStyleNumber(style, "height");
    if (styleHeight !== undefined) {
      height = styleHeight;
    }
  }

  if (width !== 0) {
    set_ImVec2_x(vec2, width);
  }
  if (height !== 0) {
    set_ImVec2_y(vec2, height);
  }

  if (_igButton(tmpUtf8(buttonText), vec2)) {
    // Button was clicked - invoke callback directly
    if (node.props && node.props.onClick) {
      safeInvokeCallback(node.props.onClick);
    }
  }

  if (styleColorPushes > 0) {
    _igPopStyleColor(styleColorPushes);
  }
}

/**
 * Renders a text component.
 */
function renderText(node, vec4) {
  // Concatenate all text children
  let text = "";
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const textChild = node.children[i];
      if (textChild.text !== undefined) {
        text += textChild.text;
      } else {
        logErrorMessage(
          `<text> only supports text children. Ignoring <${textChild.type}>.`
        );
      }
    }
  }

  const props = node.props;
  const style = getStyleFromProps(props);
  const styleColor = style ? getStyleColor(style, "color") : undefined;
  const explicitColor = styleColor !== undefined
    ? styleColor
    : (props && props.color ? props.color : null);

  // Check for color prop (style overrides legacy prop)
  if (explicitColor) {
    parseColorToImVec4(vec4, explicitColor);
    _igTextColored(vec4, tmpUtf8(text));
  } else if (props && props.disabled) {
    _igTextDisabled(tmpUtf8(text));
  } else if (props && props.wrapped) {
    _igTextWrapped(tmpUtf8(text));
  } else {
    _igText(tmpUtf8(text));
  }
}

/**
 * Renders a group component.
 */
function renderGroup(node) {
  _igBeginGroup();
  pushCleanup(function() {
    _igEndGroup();
  });
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
  popAndRunCleanup();
}

/**
 * Renders a collapsing header component.
 */
function renderCollapsingHeader(node) {
  const props = node.props;
  const headerTitle = (props && props.title) ? props.title : "Section";
  if (_igCollapsingHeader_TreeNodeFlags(tmpUtf8(headerTitle), 0)) {
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }
  }
}

/**
 * Renders an indent component.
 */
function renderIndent(node) {
  _igIndent(0.0);
  pushCleanup(function() {
    _igUnindent(0.0);
  });
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
  popAndRunCleanup();
}

/**
 * Renders a table component.
 */
function renderTable(node, vec2) {
  const props = node.props;
  const tableId = (props && props.id) ? props.id : "table";
  const columnCount = (props && props.columns !== undefined) ? +props.columns : 1;

  if (+columnCount <= 0) {
    logErrorMessage(
      `<table> requires a positive 'columns' prop. Got: columns=${columnCount}. Skipping table.`
    );
    return;
  }

  const tableFlags = (props && props.flags !== undefined) ? props.flags : _ImGuiTableFlags_Resizable;
  set_ImVec2_x(vec2, 0);
  set_ImVec2_y(vec2, 0);

  if (_igBeginTable(tmpUtf8(tableId), columnCount, tableFlags, vec2, 0)) {
    pushCleanup(function() {
      _igEndTable();
    });

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }

    popAndRunCleanup();
  }
}

/**
 * Renders a table row component.
 */
function renderTableRow(node) {
  const props = node.props;
  const rowFlags = (props && props.flags !== undefined) ? props.flags : 0;
  const minHeight = (props && props.minHeight !== undefined) ? props.minHeight : 0;
  _igTableNextRow(rowFlags, minHeight);

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
}

/**
 * Renders a table cell component.
 */
function renderTableCell(node) {
  const props = node.props;
  const colIndex = (props && props.index !== undefined) ? props.index : 0;
  _igTableSetColumnIndex(colIndex);

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
}

/**
 * Renders a table column setup.
 */
function renderTableColumn(node) {
  const props = node.props;
  const colLabel = (props && props.label) ? props.label : "";
  const colFlags = (props && props.flags !== undefined) ? props.flags : _ImGuiTableColumnFlags_None;
  const colWidth = (props && props.width !== undefined) ? props.width : 0;
  _igTableSetupColumn(tmpUtf8(colLabel), colFlags, colWidth, 0);
}

/**
 * Renders a rectangle component.
 */
function renderRect(node, vec2) {
  const props = node.props;
  const drawList = _igGetWindowDrawList();
  const rectX = validateNumber((props && props.x !== undefined) ? props.x : 0, 0, "rect x");
  const rectY = validateNumber((props && props.y !== undefined) ? props.y : 0, 0, "rect y");
  const rectWidth = validateNumber((props && props.width !== undefined) ? props.width : 100, 100, "rect width");
  const rectHeight = validateNumber((props && props.height !== undefined) ? props.height : 100, 100, "rect height");
  const rectFilled = (props && props.filled !== undefined) ? props.filled : true;

  // Get window cursor position (top-left of content area)
  _igGetCursorScreenPos(vec2);
  const winX = +get_ImVec2_x(vec2);
  const winY = +get_ImVec2_y(vec2);

  // Calculate absolute screen coordinates
  set_ImVec2_x(vec2, winX + rectX);
  set_ImVec2_y(vec2, winY + rectY);

  const rectMax = allocTmp(_sizeof_ImVec2);
  set_ImVec2_x(rectMax, winX + rectX + rectWidth);
  set_ImVec2_y(rectMax, winY + rectY + rectHeight);

  // Parse color (default: white)
  const rectColor = (props && props.color)
    ? parseColorToABGR(props.color)
    : 0xFFFFFFFF;

  if (rectFilled) {
    _ImDrawList_AddRectFilled(drawList, vec2, rectMax, rectColor, 0.0, 0);
  } else {
    _ImDrawList_AddRect(drawList, vec2, rectMax, rectColor, 0.0, 0, 1.0);
  }
}

/**
 * Renders a circle component.
 */
function renderCircle(node, vec2) {
  const props = node.props;
  const circleDrawList = _igGetWindowDrawList();
  const circleX = validateNumber((props && props.x !== undefined) ? props.x : 50, 50, "circle x");
  const circleY = validateNumber((props && props.y !== undefined) ? props.y : 50, 50, "circle y");
  const circleRadius = validateNumber((props && props.radius !== undefined) ? props.radius : 10, 10, "circle radius");
  const circleFilled = (props && props.filled !== undefined) ? props.filled : true;
  const circleSegments = validateNumber((props && props.segments !== undefined) ? props.segments : 12, 12, "circle segments");

  // Get window cursor position
  _igGetCursorScreenPos(vec2);
  const circleWinX = +get_ImVec2_x(vec2);
  const circleWinY = +get_ImVec2_y(vec2);

  // Calculate absolute center position
  set_ImVec2_x(vec2, circleWinX + circleX);
  set_ImVec2_y(vec2, circleWinY + circleY);

  // Parse color (default: white)
  const circleColor = (props && props.color)
    ? parseColorToABGR(props.color)
    : 0xFFFFFFFF;

  if (circleFilled) {
    _ImDrawList_AddCircleFilled(circleDrawList, vec2, circleRadius, circleColor, circleSegments);
  } else {
    _ImDrawList_AddCircle(circleDrawList, vec2, circleRadius, circleColor, circleSegments, 1.0);
  }
}

function renderCheckbox(node, vec4) {
  const props = node.props;
  const childLabel = gatherInlineText(node, "checkbox");
  const style = getStyleFromProps(props);

  let label = "";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else {
    label = childLabel;
  }
  if (label === "") {
    label = "Checkbox";
  }

  const boolPtr = allocTmp(SIZEOF_C_BOOL);
  const hasControlledValue = !!(props && props.checked !== undefined);

  let currentValue;
  if (hasControlledValue && props) {
    const controlledValue = !!props.checked;
    const pendingValue = node._pendingControlledValue;
    if (pendingValue !== undefined) {
      if (pendingValue === controlledValue) {
        node._pendingControlledValue = undefined;
        currentValue = controlledValue;
      } else {
        currentValue = pendingValue;
      }
    } else {
      currentValue = controlledValue;
    }
  } else {
    if (node._checkboxValue === undefined) {
      const defaultChecked = props && props.defaultChecked !== undefined
        ? !!props.defaultChecked
        : false;
      node._checkboxValue = defaultChecked;
    }
    currentValue = !!node._checkboxValue;
  }

  _sh_ptr_write_c_bool(boolPtr, 0, currentValue ? 1 : 0);
  let styleColorPushes = 0;
  let pushedWidth = false;

  if (style) {
    styleColorPushes += pushFrameBgColorsFromStyle(style, vec4);
    styleColorPushes += pushTextColorFromStyle(style, vec4);

    const styleWidth = getStyleNumber(style, "width");
    if (styleWidth !== undefined) {
      _igPushItemWidth(styleWidth);
      pushedWidth = true;
    }
  }

  const changed = _igCheckbox(tmpUtf8(label), boolPtr);
  const actualValue = _sh_ptr_read_c_bool(boolPtr, 0) !== 0;

  if (hasControlledValue) {
    node._pendingControlledValue = actualValue;
  } else if (changed || node._checkboxValue !== actualValue) {
    node._checkboxValue = actualValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, actualValue);
  }

  if (pushedWidth) {
    _igPopItemWidth();
  }
  if (styleColorPushes > 0) {
    _igPopStyleColor(styleColorPushes);
  }
}

function renderSliderFloat(node) {
  const props = node.props;

  let label = "";
  if (props && typeof props.label === "string") {
    label = props.label;
  }
  if (label === "") {
    label = "Slider";
  }

  let min = 0;
  if (props && props.min !== undefined) {
    min = validateNumber(props.min, 0, "sliderfloat min");
  }

  let max = 1;
  if (props && props.max !== undefined) {
    max = validateNumber(props.max, 1, "sliderfloat max");
  }
  if (!(max > min)) {
    logErrorMessage(`Invalid <sliderfloat> range: min=${min}, max=${max}. Adjusting max.`);
    max = min + 1;
  }

  let formatStr = "%.3f";
  if (props && props.format !== undefined) {
    formatStr = String(props.format);
  }

  let flags = 0;
  if (props && props.flags !== undefined) {
    flags = props.flags | 0;
  }

  const valuePtr = allocTmp(SIZEOF_C_FLOAT);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateNumber(props.value, min, "sliderfloat value");
  } else {
    if (node._sliderFloatValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? props.defaultValue
        : min;
      node._sliderFloatValue = validateNumber(defaultValue, min, "sliderfloat defaultValue");
    }
    currentValue = +node._sliderFloatValue;
  }

  if (!Number.isFinite(currentValue)) {
    currentValue = min;
  }
  if (currentValue < min) currentValue = min;
  if (currentValue > max) currentValue = max;

  _sh_ptr_write_c_float(valuePtr, 0, currentValue);
  const changed = _igSliderFloat(tmpUtf8(label), valuePtr, min, max, tmpUtf8(formatStr), flags);
  const newValue = _sh_ptr_read_c_float(valuePtr, 0);

  if (!Number.isFinite(newValue)) {
    return;
  }

  const clampedValue = Math.min(Math.max(newValue, min), max);

  if (!hasControlledValue && (changed || node._sliderFloatValue !== clampedValue)) {
    node._sliderFloatValue = clampedValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, clampedValue);
  }
}

function renderSliderInt(node) {
  const props = node.props;

  let label = "";
  if (props && typeof props.label === "string") {
    label = props.label;
  }
  if (label === "") {
    label = "Slider";
  }

  let min = 0;
  if (props && props.min !== undefined) {
    min = validateInteger(props.min, 0, "sliderint min");
  }

  let max = 100;
  if (props && props.max !== undefined) {
    max = validateInteger(props.max, 100, "sliderint max");
  }
  if (max < min) {
    logErrorMessage(`Invalid <sliderint> range: min=${min}, max=${max}. Adjusting max.`);
    max = min;
  }
  if (max === min) {
    max = min + 1;
  }

  let formatStr = "%d";
  if (props && props.format !== undefined) {
    formatStr = String(props.format);
  }

  let flags = 0;
  if (props && props.flags !== undefined) {
    flags = props.flags | 0;
  }

  const valuePtr = allocTmp(SIZEOF_C_INT);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateInteger(props.value, min, "sliderint value");
  } else {
    if (node._sliderIntValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? props.defaultValue
        : min;
      node._sliderIntValue = validateInteger(defaultValue, min, "sliderint defaultValue");
    }
    currentValue = node._sliderIntValue | 0;
  }

  if (currentValue < min) currentValue = min;
  if (currentValue > max) currentValue = max;

  _sh_ptr_write_c_int(valuePtr, 0, currentValue);
  const changed = _igSliderInt(tmpUtf8(label), valuePtr, min, max, tmpUtf8(formatStr), flags);
  const newValue = _sh_ptr_read_c_int(valuePtr, 0);
  const clampedValue = Math.min(Math.max(newValue, min), max);

  if (!hasControlledValue && (changed || node._sliderIntValue !== clampedValue)) {
    node._sliderIntValue = clampedValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, clampedValue);
  }
}

function renderProgressBar(node, vec2) {
  const props = node.props;

  let min = 0;
  if (props && props.min !== undefined) {
    min = validateNumber(props.min, 0, "progressbar min");
  }

  let max = 1;
  if (props && props.max !== undefined) {
    max = validateNumber(props.max, 1, "progressbar max");
  }
  if (!(max > min)) {
    logErrorMessage(`Invalid <progressbar> range: min=${min}, max=${max}. Adjusting max.`);
    max = min + 1;
  }

  let value = min;
  if (props && props.value !== undefined) {
    value = validateNumber(props.value, min, "progressbar value");
  }
  if (!Number.isFinite(value)) {
    value = min;
  }

  let fraction = (value - min) / (max - min);
  if (!Number.isFinite(fraction)) {
    fraction = 0;
  }
  if (fraction < 0) fraction = 0;
  if (fraction > 1) fraction = 1;

  let width = -1;
  if (props && props.width !== undefined) {
    width = validateNumber(props.width, -1, "progressbar width");
  }
  let height = 0;
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "progressbar height");
  }
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  const overlayValue = props && props.overlay !== undefined && props.overlay !== null
    ? tmpUtf8(String(props.overlay))
    : c_null;

  _igProgressBar(fraction, vec2, overlayValue);
}

function renderInputText(node) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "inputtext");

  let label = "Input";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  let maxLength = 256;
  if (props && props.maxLength !== undefined) {
    maxLength = validateInteger(props.maxLength, 256, "inputtext maxLength");
    if (maxLength < 1) {
      maxLength = 1;
    }
  }

  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue = "";

  if (hasControlledValue && props) {
    currentValue = String(props.value);
  } else {
    if (node._inputTextValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? String(props.defaultValue)
        : "";
      node._inputTextValue = defaultValue;
    }
    currentValue = String(node._inputTextValue);
  }

  currentValue = truncateStringToMaxLength(currentValue, maxLength);

  const bufferSize = maxLength + 1;
  const buffer = allocTmp(bufferSize);
  let valueForBuffer = currentValue;

  while (true) {
    try {
      copyToUtf8(valueForBuffer, buffer, bufferSize);
      break;
    } catch (error) {
      const shorter = dropLastCodePoint(valueForBuffer);
      if (shorter === valueForBuffer) {
        valueForBuffer = "";
      } else {
        valueForBuffer = shorter;
      }
      if (valueForBuffer === "") {
        copyToUtf8("", buffer, bufferSize);
        break;
      }
    }
  }

  currentValue = valueForBuffer;

  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  const placeholderText = props && props.placeholder !== undefined && props.placeholder !== null
    ? String(props.placeholder)
    : "";

  const changed = placeholderText !== ""
    ? _igInputTextWithHint(
        tmpUtf8(label),
        tmpUtf8(placeholderText),
        buffer,
        bufferSize,
        flags,
        c_null,
        c_null
      ) !== 0
    : _igInputText(tmpUtf8(label), buffer, bufferSize, flags, c_null, c_null) !== 0;

  const newValue = readUtf8String(buffer, bufferSize);

  if (!hasControlledValue && node._inputTextValue !== newValue) {
    node._inputTextValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderInputFloat(node) {
  const props = node.props;

  let label = "Input";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const valuePtr = allocTmp(SIZEOF_C_FLOAT);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateNumber(props.value, 0, "inputfloat value");
  } else {
    if (node._inputFloatValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? props.defaultValue
        : 0;
      node._inputFloatValue = validateNumber(defaultValue, 0, "inputfloat defaultValue");
    }
    currentValue = +node._inputFloatValue;
  }

  const step = props && props.step !== undefined ? validateNumber(props.step, 0, "inputfloat step") : 0;
  const stepFast = props && props.stepFast !== undefined ? validateNumber(props.stepFast, 0, "inputfloat stepFast") : 0;
  const formatStr = props && props.format !== undefined ? String(props.format) : "%.3f";
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  _sh_ptr_write_c_float(valuePtr, 0, currentValue);
  const changed = _igInputFloat(tmpUtf8(label), valuePtr, step, stepFast, tmpUtf8(formatStr), flags);
  const newValue = _sh_ptr_read_c_float(valuePtr, 0);

  if (!Number.isFinite(newValue)) {
    return;
  }

  if (!hasControlledValue && node._inputFloatValue !== newValue) {
    node._inputFloatValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderInputInt(node) {
  const props = node.props;

  let label = "Input";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const valuePtr = allocTmp(SIZEOF_C_INT);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateInteger(props.value, 0, "inputint value");
  } else {
    if (node._inputIntValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? props.defaultValue
        : 0;
      node._inputIntValue = validateInteger(defaultValue, 0, "inputint defaultValue");
    }
    currentValue = node._inputIntValue | 0;
  }

  const step = props && props.step !== undefined ? validateInteger(props.step, 1, "inputint step") : 1;
  const stepFast = props && props.stepFast !== undefined ? validateInteger(props.stepFast, 100, "inputint stepFast") : 100;
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  _sh_ptr_write_c_int(valuePtr, 0, currentValue);
  const changed = _igInputInt(tmpUtf8(label), valuePtr, step, stepFast, flags);
  const newValue = _sh_ptr_read_c_int(valuePtr, 0);

  if (!hasControlledValue && node._inputIntValue !== newValue) {
    node._inputIntValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderDragFloat(node) {
  const props = node.props;

  let label = "Drag";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const valuePtr = allocTmp(SIZEOF_C_FLOAT);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateNumber(props.value, 0, "dragfloat value");
  } else {
    if (node._dragFloatValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? props.defaultValue
        : 0;
      node._dragFloatValue = validateNumber(defaultValue, 0, "dragfloat defaultValue");
    }
    currentValue = +node._dragFloatValue;
  }

  const speed = props && props.speed !== undefined ? validateNumber(props.speed, 1, "dragfloat speed") : 1;
  const min = props && props.min !== undefined ? validateNumber(props.min, 0, "dragfloat min") : 0;
  const max = props && props.max !== undefined ? validateNumber(props.max, 0, "dragfloat max") : 0;
  const formatStr = props && props.format !== undefined ? String(props.format) : "%.3f";
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  _sh_ptr_write_c_float(valuePtr, 0, currentValue);
  const changed = _igDragFloat(tmpUtf8(label), valuePtr, speed, min, max, tmpUtf8(formatStr), flags);
  const newValue = _sh_ptr_read_c_float(valuePtr, 0);

  if (!Number.isFinite(newValue)) {
    return;
  }

  if (!hasControlledValue && node._dragFloatValue !== newValue) {
    node._dragFloatValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderDragInt(node) {
  const props = node.props;

  let label = "Drag";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const valuePtr = allocTmp(SIZEOF_C_INT);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateInteger(props.value, 0, "dragint value");
  } else {
    if (node._dragIntValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined
        ? props.defaultValue
        : 0;
      node._dragIntValue = validateInteger(defaultValue, 0, "dragint defaultValue");
    }
    currentValue = node._dragIntValue | 0;
  }

  const speed = props && props.speed !== undefined ? validateInteger(props.speed, 1, "dragint speed") : 1;
  const min = props && props.min !== undefined ? validateInteger(props.min, 0, "dragint min") : 0;
  const max = props && props.max !== undefined ? validateInteger(props.max, 0, "dragint max") : 0;
  const formatStr = props && props.format !== undefined ? String(props.format) : "%d";
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  _sh_ptr_write_c_int(valuePtr, 0, currentValue);
  const changed = _igDragInt(tmpUtf8(label), valuePtr, speed, min, max, tmpUtf8(formatStr), flags);
  const newValue = _sh_ptr_read_c_int(valuePtr, 0);

  if (!hasControlledValue && node._dragIntValue !== newValue) {
    node._dragIntValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderCombo(node) {
  const props = node.props;

  const itemsProp = props && Array.isArray(props.items) ? props.items : [];
  const items = [];
  for (let i = 0; i < itemsProp.length; i++) {
    const item = itemsProp[i];
    if (item === undefined || item === null) {
      items.push("");
    } else {
      items.push(String(item));
    }
  }

  let label = "Combo";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const hasControlledIndex = !!(props && props.selectedIndex !== undefined);
  let currentIndex = 0;

  if (hasControlledIndex && props) {
    const itemCount = items.length;
    let controlledIndex = validateInteger(props.selectedIndex, 0, "combo selectedIndex");
    if (itemCount > 0) {
      controlledIndex = Math.max(0, Math.min(controlledIndex, itemCount - 1));
    } else {
      controlledIndex = 0;
    }

    const pendingIndex = node._pendingControlledComboIndex;
    if (pendingIndex !== undefined) {
      const clampedPending = itemCount > 0
        ? Math.max(0, Math.min(pendingIndex | 0, itemCount - 1))
        : 0;
      if (clampedPending === controlledIndex) {
        node._pendingControlledComboIndex = undefined;
        currentIndex = controlledIndex;
      } else {
        currentIndex = clampedPending;
      }
    } else {
      currentIndex = controlledIndex;
    }
  } else {
    if (node._comboIndex === undefined) {
      const defaultIndex = props && props.defaultIndex !== undefined
        ? props.defaultIndex
        : 0;
      node._comboIndex = validateInteger(defaultIndex, 0, "combo defaultIndex");
    }
    currentIndex = node._comboIndex | 0;
  }

  if (items.length === 0) {
    currentIndex = 0;
  } else if (currentIndex < 0 || currentIndex >= items.length) {
    currentIndex = Math.max(0, Math.min(currentIndex, items.length - 1));
  }

  const currentPtr = allocTmp(SIZEOF_C_INT);
  _sh_ptr_write_c_int(currentPtr, 0, currentIndex);

  let separatedItems = "";
  for (let i = 0; i < items.length; i++) {
    separatedItems += items[i];
    separatedItems += "\u0000";
  }
  separatedItems += "\u0000";

  const popupHeight = props && props.maxHeightItems !== undefined
    ? validateInteger(props.maxHeightItems, -1, "combo maxHeightItems")
    : -1;

  const changed = _igCombo_Str(
    tmpUtf8(label),
    currentPtr,
    tmpUtf8(separatedItems),
    popupHeight
  );

  let newIndex = _sh_ptr_read_c_int(currentPtr, 0);
  if (newIndex < 0 || newIndex >= items.length) {
    newIndex = Math.max(0, Math.min(newIndex, items.length - 1));
  }

  if (hasControlledIndex) {
    if (changed) {
      node._pendingControlledComboIndex = newIndex;
    }
  } else if (node._comboIndex !== newIndex) {
    node._comboIndex = newIndex;
  }

  if (changed && props && props.onChange) {
    const selectedItem = items[newIndex] !== undefined ? items[newIndex] : "";
    safeInvokeCallback(props.onChange, newIndex, selectedItem);
  }
}

function renderSelectable(node, vec2, vec4) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "selectable");
  const style = getStyleFromProps(props);

  let label = "Selectable";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  const hasControlledValue = !!(props && props.selected !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    const controlledValue = !!props.selected;
    const pendingValue = node._pendingControlledSelected;
    if (pendingValue !== undefined) {
      if (pendingValue === controlledValue) {
        node._pendingControlledSelected = undefined;
        currentValue = controlledValue;
      } else {
        currentValue = pendingValue;
      }
    } else {
      currentValue = controlledValue;
    }
  } else {
    if (node._selectableSelected === undefined) {
      const defaultSelected = props && props.defaultSelected !== undefined
        ? !!props.defaultSelected
        : false;
      node._selectableSelected = defaultSelected;
    }
    currentValue = !!node._selectableSelected;
  }

  const boolPtr = allocTmp(SIZEOF_C_BOOL);
  _sh_ptr_write_c_bool(boolPtr, 0, currentValue ? 1 : 0);

  let width = 0;
  let height = 0;
  let hasWidth = false;
  let hasHeight = false;

  if (style) {
    const styleWidth = getStyleNumber(style, "width");
    if (styleWidth !== undefined) {
      width = styleWidth;
      hasWidth = true;
    }
    const styleHeight = getStyleNumber(style, "height");
    if (styleHeight !== undefined) {
      height = styleHeight;
      hasHeight = true;
    }
  }

  if (!hasWidth && props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "selectable width");
    hasWidth = true;
  }
  if (!hasHeight && props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "selectable height");
    hasHeight = true;
  }

  set_ImVec2_x(vec2, hasWidth ? width : 0);
  set_ImVec2_y(vec2, hasHeight ? height : 0);

  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  let styleColorPushes = 0;
  if (style) {
    styleColorPushes += pushHeaderColorsFromStyle(style, vec4);
    styleColorPushes += pushTextColorFromStyle(style, vec4);
  }

  const activated = _igSelectable_BoolPtr(tmpUtf8(label), boolPtr, flags, vec2) !== 0;
  const newValue = _sh_ptr_read_c_bool(boolPtr, 0) !== 0;

  if (hasControlledValue) {
    node._pendingControlledSelected = newValue;
  } else if (node._selectableSelected !== newValue) {
    node._selectableSelected = newValue;
  }

  if ((activated || newValue !== currentValue) && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }

  if (styleColorPushes > 0) {
    _igPopStyleColor(styleColorPushes);
  }
}

function renderRadioButton(node, vec4) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "radiobutton");
  const style = getStyleFromProps(props);

  let label = "Radio";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  const hasGroupControl = props && props.value !== undefined && props.selectedValue !== undefined;
  const hasBoolControl = props && props.selected !== undefined;
  const parent = node.parent || null;
  const groupKey = hasGroupControl
    ? (props && props.groupId !== undefined
        ? `gid:${String(props.groupId)}`
        : `parent:${parent ? parent.id : node.id}`)
    : null;
  const groupPendingMap = parent
    ? (parent._radioPendingMap || (parent._radioPendingMap = Object.create(null)))
    : null;

  let isSelected = false;
  if (hasGroupControl && props) {
    let groupValue = props.selectedValue;
    if (groupPendingMap && groupKey !== null) {
      const pendingValue = groupPendingMap[groupKey];
      if (pendingValue !== undefined) {
        if (pendingValue === groupValue) {
          delete groupPendingMap[groupKey];
          groupValue = pendingValue;
        } else {
          groupValue = pendingValue;
        }
      }
    }
    isSelected = groupValue === props.value;
  } else if (hasBoolControl && props) {
    const controlledValue = !!props.selected;
    const pendingValue = node._pendingControlledSelected;
    if (pendingValue !== undefined) {
      if (pendingValue === controlledValue) {
        node._pendingControlledSelected = undefined;
        isSelected = controlledValue;
      } else {
        isSelected = pendingValue;
      }
    } else {
      isSelected = controlledValue;
    }
  } else {
    if (node._radioSelected === undefined) {
      const defaultSelected = props && props.defaultSelected !== undefined
        ? !!props.defaultSelected
        : false;
      node._radioSelected = defaultSelected;
    }
    isSelected = !!node._radioSelected;
  }

  let styleColorPushes = 0;
  if (style) {
    styleColorPushes += pushFrameBgColorsFromStyle(style, vec4);
    styleColorPushes += pushTextColorFromStyle(style, vec4);
  }

  const pressed = _igRadioButton_Bool(tmpUtf8(label), isSelected ? 1 : 0) !== 0;

  if (pressed) {
    if (hasGroupControl && groupPendingMap && groupKey !== null) {
      groupPendingMap[groupKey] = props.value;
    } else if (hasBoolControl) {
      node._pendingControlledSelected = true;
    } else {
      node._radioSelected = true;
    }

    if (props && props.onChange) {
      if (props.value !== undefined) {
        safeInvokeCallback(props.onChange, props.value);
      } else {
        safeInvokeCallback(props.onChange, true);
      }
    }
  }

  if (styleColorPushes > 0) {
    _igPopStyleColor(styleColorPushes);
  }
}

function readColorComponent(ptr, offset) {
  const value = _sh_ptr_read_c_float(ptr, offset);
  if (!Number.isFinite(value)) {
    return 0;
  }
  let component = Math.round(value * 255);
  if (component < 0) component = 0;
  if (component > 255) component = 255;
  return component;
}

function renderColorEdit3(node) {
  const props = node.props;

  let label = "Color";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const colorPtr = allocTmp(SIZEOF_C_FLOAT * 4);
  const hasControlledValue = !!(props && props.value !== undefined);
  let colorValue;

  if (hasControlledValue && props) {
    colorValue = props.value;
  } else {
    if (node._colorEdit3Value === undefined) {
      node._colorEdit3Value = props && props.defaultValue !== undefined ? props.defaultValue : { r: 255, g: 255, b: 255 };
    }
    colorValue = node._colorEdit3Value;
  }

  parseColorToImVec4(colorPtr, colorValue);

  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  const changed = _igColorEdit3(tmpUtf8(label), colorPtr, flags);

  const r = readColorComponent(colorPtr, 0);
  const g = readColorComponent(colorPtr, SIZEOF_C_FLOAT);
  const b = readColorComponent(colorPtr, SIZEOF_C_FLOAT * 2);

  const newColor = { r: r, g: g, b: b };

  if (!hasControlledValue) {
    node._colorEdit3Value = newColor;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newColor);
  }
}

function renderColorEdit4(node) {
  const props = node.props;

  let label = "Color";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const colorPtr = allocTmp(SIZEOF_C_FLOAT * 4);
  const hasControlledValue = !!(props && props.value !== undefined);
  let colorValue;

  if (hasControlledValue && props) {
    colorValue = props.value;
  } else {
    if (node._colorEdit4Value === undefined) {
      node._colorEdit4Value = props && props.defaultValue !== undefined ? props.defaultValue : { r: 255, g: 255, b: 255, a: 255 };
    }
    colorValue = node._colorEdit4Value;
  }

  parseColorToImVec4(colorPtr, colorValue);

  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  const changed = _igColorEdit4(tmpUtf8(label), colorPtr, flags);

  const r = readColorComponent(colorPtr, 0);
  const g = readColorComponent(colorPtr, SIZEOF_C_FLOAT);
  const b = readColorComponent(colorPtr, SIZEOF_C_FLOAT * 2);
  const a = readColorComponent(colorPtr, SIZEOF_C_FLOAT * 3);

  const newColor = { r: r, g: g, b: b, a: a };

  if (!hasControlledValue) {
    node._colorEdit4Value = newColor;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newColor);
  }
}

function renderColorButton(node, vec2) {
  const props = node.props;

  let label = props && props.label !== undefined ? String(props.label) : "##ColorButton";

  const colorPtr = allocTmp(SIZEOF_C_FLOAT * 4);
  const colorValue = props && props.color !== undefined ? props.color : { r: 255, g: 255, b: 255, a: 255 };
  parseColorToImVec4(colorPtr, colorValue);

  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  let width = 0;
  let height = 0;
  if (props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "colorbutton width");
  }
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "colorbutton height");
  }
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  const pressed = _igColorButton(tmpUtf8(label), colorPtr, flags, vec2) !== 0;

  if (pressed && props && props.onClick) {
    safeInvokeCallback(props.onClick);
  }
}

function renderSpacing(node) {
  const props = node.props;

  let count = 1;
  if (props && props.count !== undefined) {
    count = validateInteger(props.count, 1, "spacing count");
  }
  if (!Number.isFinite(count) || count < 1) {
    count = 1;
  }

  for (let i = 0; i < count; i++) {
    _igSpacing();
  }

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
}

function renderTreeNodeComponent(node) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "treenode");

  let label = "Tree";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  const vec4 = allocTmp(_sizeof_ImVec4);
  const style = getStyleFromProps(props);
  let colorPushes = 0;
  if (style) {
    colorPushes += pushHeaderColorsFromStyle(style, vec4);
    colorPushes += pushTextColorFromStyle(style, vec4);
  }

  let flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  if (props && props.open !== undefined) {
    _igSetNextItemOpen(props.open ? 1 : 0, _ImGuiCond_Always);
  } else if (props && props.defaultOpen !== undefined) {
    if (!node._treeNodeDefaultApplied) {
      _igSetNextItemOpen(props.defaultOpen ? 1 : 0, _ImGuiCond_Once);
      node._treeNodeDefaultApplied = true;
    }
  }

  const id = props && props.id !== undefined ? String(props.id) : null;
  const opened = id !== null
    ? _igTreeNodeEx_StrStr(tmpUtf8(id), flags, tmpUtf8(label)) !== 0
    : _igTreeNodeEx_Str(tmpUtf8(label), flags) !== 0;

  if (_igIsItemToggledOpen() && props && props.onToggle) {
    safeInvokeCallback(props.onToggle, opened);
  }

  if (opened) {
    const shouldTreePop = !(flags & _ImGuiTreeNodeFlags_NoTreePushOnOpen);
    if (shouldTreePop) {
      pushCleanup(function() {
        _igTreePop();
      });
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }

    if (shouldTreePop) {
      popAndRunCleanup();
    }
  }

  if (colorPushes > 0) {
    _igPopStyleColor(colorPushes);
  }
}

function renderTabBar(node) {
  const props = node.props;
  const id = props && props.id !== undefined ? String(props.id) : "TabBar##" + String(node.id);
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  if (_igBeginTabBar(tmpUtf8(id), flags)) {
    pushCleanup(function() {
      _igEndTabBar();
    });

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }

    popAndRunCleanup();
  }
}

function renderTabItem(node) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "tabitem");

  let label = "Tab";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  const tabParent = node.parent || null;
  const tabKey = props && props.id !== undefined ? String(props.id) : `${label}##${node.id}`;
  const controlledSelection = props && props.selected !== undefined;

  const frameId = _igGetFrameCount();
  if (node._tabItemLastFrameId !== frameId) {
    node._tabItemPrevActive = !!node._tabItemWasActive;
    node._tabItemLastFrameId = frameId;
  }

  const wasActiveLastFrame = !!node._tabItemPrevActive;

  let flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  if (controlledSelection) {
    // Avoid reasserting selection for tabs ImGui already considers active so user clicks can take effect.
    let shouldSelect = !!(props && props.selected && !wasActiveLastFrame);
    let hasPendingMatch = false;
    if (tabParent) {
      const pendingSelection = tabParent._tabPendingSelection;
      if (pendingSelection !== undefined) {
        if (pendingSelection === tabKey) {
          hasPendingMatch = true;
          shouldSelect = true;
          if (props.selected) {
            tabParent._tabPendingSelection = undefined;
          }
        } else {
          shouldSelect = false;
        }
      }
    }
    if (!hasPendingMatch && node._tabItemSelectionSuppressed) {
      shouldSelect = false;
    } else if (hasPendingMatch && node._tabItemSelectionSuppressed && (!props || !props.selected)) {
      node._tabItemSelectionSuppressed = false;
    }
    if (shouldSelect) {
      flags |= _ImGuiTabItemFlags_SetSelected;
    }
  } else {
    if (props && props.selected) {
      flags |= _ImGuiTabItemFlags_SetSelected;
    } else if (props && props.defaultSelected && !node._tabItemDefaultSelected) {
      flags |= _ImGuiTabItemFlags_SetSelected;
      node._tabItemDefaultSelected = true;
    }
  }

  const closeEnabled = !!(props && props.onClose);
  const closePtr = closeEnabled ? allocTmp(SIZEOF_C_BOOL) : c_null;
  if (closeEnabled) {
    _sh_ptr_write_c_bool(closePtr, 0, 1);
  }

  const becameActive = _igBeginTabItem(tmpUtf8(label), closePtr, flags) !== 0;
  const wasActive = wasActiveLastFrame;
  let stillOpen = true;

  if (closeEnabled) {
    stillOpen = _sh_ptr_read_c_bool(closePtr, 0) !== 0;
    if (!stillOpen) {
      if (props && props.onClose && !node._tabItemCloseDispatched) {
        safeInvokeCallback(props.onClose);
        node._tabItemCloseDispatched = true;
      }
    } else {
      node._tabItemCloseDispatched = false;
    }
  }

  if (becameActive) {
    pushCleanup(function() {
      _igEndTabItem();
    });

    if (controlledSelection && tabParent && !wasActive && (!props || !props.selected)) {
      tabParent._tabPendingSelection = tabKey;
    }

    if (!wasActive && props && props.onSelect) {
      safeInvokeCallback(props.onSelect);
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }

    popAndRunCleanup();
  }

  if (controlledSelection) {
    if (!becameActive && wasActive && props && props.selected) {
      node._tabItemSelectionSuppressed = true;
    } else if (node._tabItemSelectionSuppressed) {
      if (!props || !props.selected || becameActive) {
        node._tabItemSelectionSuppressed = false;
      }
    }
  }

  node._tabItemWasActive = becameActive;
}

function renderListBox(node, vec2) {
  const props = node.props;
  const itemsInput = props && Array.isArray(props.items) ? props.items : [];
  const items = [];
  for (let i = 0; i < itemsInput.length; i++) {
    const value = itemsInput[i];
    items.push(value === undefined || value === null ? "" : String(value));
  }

  let label = "List";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const hasControlledIndex = !!(props && props.selectedIndex !== undefined);
  let currentIndex = 0;

  if (hasControlledIndex && props) {
    const itemCount = items.length;
    let controlledIndex = validateInteger(props.selectedIndex, 0, "listbox selectedIndex");
    if (itemCount > 0) {
      controlledIndex = Math.max(0, Math.min(controlledIndex, itemCount - 1));
    } else {
      controlledIndex = 0;
    }

    const pendingIndex = node._pendingControlledListIndex;
    if (pendingIndex !== undefined) {
      const clampedPending = itemCount > 0
        ? Math.max(0, Math.min(pendingIndex | 0, itemCount - 1))
        : 0;
      if (clampedPending === controlledIndex) {
        node._pendingControlledListIndex = undefined;
        currentIndex = controlledIndex;
      } else {
        currentIndex = clampedPending;
      }
    } else {
      currentIndex = controlledIndex;
    }
  } else {
    if (node._listBoxIndex === undefined) {
      const defaultIndex = props && props.defaultIndex !== undefined ? props.defaultIndex : 0;
      node._listBoxIndex = validateInteger(defaultIndex, 0, "listbox defaultIndex");
    }
    currentIndex = node._listBoxIndex | 0;
  }

  if (items.length === 0) {
    currentIndex = 0;
  } else if (currentIndex < 0 || currentIndex >= items.length) {
    currentIndex = Math.max(0, Math.min(currentIndex, items.length - 1));
  }

  const currentPtr = allocTmp(SIZEOF_C_INT);
  _sh_ptr_write_c_int(currentPtr, 0, currentIndex);

  let width = 0;
  let height = 0;
  if (props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "listbox width");
  }
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "listbox height");
  }
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  const visibleItems = props && props.heightInItems !== undefined
    ? validateInteger(props.heightInItems, -1, "listbox heightInItems")
    : -1;

  let itemsPtr = c_null;
  if (items.length > 0) {
    itemsPtr = allocTmp(items.length * SIZEOF_C_PTR);
    for (let i = 0; i < items.length; i++) {
      const itemPtr = tmpUtf8(items[i]);
      _sh_ptr_write_c_ptr(itemsPtr, i * SIZEOF_C_PTR, itemPtr);
    }
  }

  const changed = _igListBox_Str_arr(
    tmpUtf8(label),
    currentPtr,
    itemsPtr,
    items.length,
    visibleItems
  );

  const newIndex = _sh_ptr_read_c_int(currentPtr, 0);
  const clampedIndex = items.length === 0
    ? 0
    : Math.max(0, Math.min(newIndex, items.length - 1));

  if (hasControlledIndex) {
    if (changed) {
      node._pendingControlledListIndex = clampedIndex;
    }
  } else if (node._listBoxIndex !== clampedIndex) {
    node._listBoxIndex = clampedIndex;
  }

  if (changed && props && props.onChange) {
    const selectedItem = items[clampedIndex] !== undefined ? items[clampedIndex] : "";
    safeInvokeCallback(props.onChange, clampedIndex, selectedItem);
  }
}

function renderInputTextMultiline(node, vec2) {
  const props = node.props;
  const labelFromChildren = gatherInlineText(node, "inputtextmultiline");

  let label = "Input";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  } else if (labelFromChildren !== "") {
    label = labelFromChildren;
  }

  let maxLength = 1024;
  if (props && props.maxLength !== undefined) {
    maxLength = validateInteger(props.maxLength, 1024, "inputtextmultiline maxLength");
    if (maxLength < 1) {
      maxLength = 1;
    }
  }

  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue = "";

  if (hasControlledValue && props) {
    currentValue = String(props.value);
  } else {
    if (node._inputTextMultilineValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined ? props.defaultValue : "";
      node._inputTextMultilineValue = String(defaultValue);
    }
    currentValue = String(node._inputTextMultilineValue);
  }

  currentValue = truncateStringToMaxLength(currentValue, maxLength);

  const bufferSize = maxLength + 1;
  const buffer = allocTmp(bufferSize);
  let valueForBuffer = currentValue;

  while (true) {
    try {
      copyToUtf8(valueForBuffer, buffer, bufferSize);
      break;
    } catch (_error) {
      const shorter = dropLastCodePoint(valueForBuffer);
      if (shorter === valueForBuffer) {
        valueForBuffer = "";
      } else {
        valueForBuffer = shorter;
      }
      if (valueForBuffer === "") {
        copyToUtf8("", buffer, bufferSize);
        break;
      }
    }
  }

  currentValue = valueForBuffer;

  let width = 0;
  let height = 0;
  if (props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "inputtextmultiline width");
  }
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "inputtextmultiline height");
  }
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  const changed = _igInputTextMultiline(
    tmpUtf8(label),
    buffer,
    bufferSize,
    vec2,
    flags,
    c_null,
    c_null
  ) !== 0;

  const newValue = readUtf8String(buffer, bufferSize);

  if (!hasControlledValue && node._inputTextMultilineValue !== newValue) {
    node._inputTextMultilineValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderInputDouble(node) {
  const props = node.props;

  let label = "Input";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const valuePtr = allocTmp(SIZEOF_C_DOUBLE);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = validateNumber(props.value, 0, "inputdouble value");
  } else {
    if (node._inputDoubleValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined ? props.defaultValue : 0;
      node._inputDoubleValue = validateNumber(defaultValue, 0, "inputdouble defaultValue");
    }
    currentValue = +node._inputDoubleValue;
  }

  const step = props && props.step !== undefined ? validateNumber(props.step, 0, "inputdouble step") : 0;
  const stepFast = props && props.stepFast !== undefined ? validateNumber(props.stepFast, 0, "inputdouble stepFast") : 0;
  const formatStr = props && props.format !== undefined ? String(props.format) : "%.6f";
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  _sh_ptr_write_c_double(valuePtr, 0, currentValue);
  const changed = _igInputDouble(tmpUtf8(label), valuePtr, step, stepFast, tmpUtf8(formatStr), flags) !== 0;
  const newValue = _sh_ptr_read_c_double(valuePtr, 0);

  if (!hasControlledValue && node._inputDoubleValue !== newValue) {
    node._inputDoubleValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function getInputScalarMeta(dataType) {
  switch (dataType) {
  case _ImGuiDataType_Float:
    return {
      size: SIZEOF_C_FLOAT,
      write(ptr, value) {
        _sh_ptr_write_c_float(ptr, 0, value);
      },
      read(ptr) {
        return _sh_ptr_read_c_float(ptr, 0);
      },
      normalize(value, propName) {
        return validateNumber(value, 0, propName);
      }
    };
  case _ImGuiDataType_Double:
    return {
      size: SIZEOF_C_DOUBLE,
      write(ptr, value) {
        _sh_ptr_write_c_double(ptr, 0, value);
      },
      read(ptr) {
        return _sh_ptr_read_c_double(ptr, 0);
      },
      normalize(value, propName) {
        return validateNumber(value, 0, propName);
      }
    };
  case _ImGuiDataType_S32:
    return {
      size: SIZEOF_C_INT,
      write(ptr, value) {
        _sh_ptr_write_c_int(ptr, 0, value | 0);
      },
      read(ptr) {
        return _sh_ptr_read_c_int(ptr, 0);
      },
      normalize(value, propName) {
        return validateInteger(value, 0, propName);
      }
    };
  case _ImGuiDataType_U32:
    return {
      size: SIZEOF_C_INT,
      write(ptr, value) {
        _sh_ptr_write_c_uint(ptr, 0, value >>> 0);
      },
      read(ptr) {
        return _sh_ptr_read_c_uint(ptr, 0) >>> 0;
      },
      normalize(value, propName) {
        const normalized = validateInteger(value, 0, propName);
        if (!Number.isFinite(normalized) || normalized < 0) {
          return 0;
        }
        return normalized >>> 0;
      }
    };
  default:
    return null;
  }
}

function renderInputScalar(node) {
  const props = node.props;

  let label = "Input";
  if (props && props.label !== undefined && props.label !== null) {
    label = String(props.label);
  }

  const dataType = props && props.dataType !== undefined ? props.dataType | 0 : _ImGuiDataType_Float;
  const meta = getInputScalarMeta(dataType);
  if (!meta) {
    logErrorMessage(`<inputscalar> dataType ${String(dataType)} is not currently supported.`);
    return;
  }

  const valuePtr = allocTmp(meta.size);
  const hasControlledValue = !!(props && props.value !== undefined);
  let currentValue;

  if (hasControlledValue && props) {
    currentValue = meta.normalize(props.value, "inputscalar value");
  } else {
    if (node._inputScalarValue === undefined) {
      const defaultValue = props && props.defaultValue !== undefined ? props.defaultValue : 0;
      node._inputScalarValue = meta.normalize(defaultValue, "inputscalar defaultValue");
    }
    currentValue = node._inputScalarValue;
  }

  meta.write(valuePtr, currentValue);

  let stepPtr = c_null;
  if (props && props.step !== undefined) {
    const stepValue = meta.normalize(props.step, "inputscalar step");
    stepPtr = allocTmp(meta.size);
    meta.write(stepPtr, stepValue);
  }

  let fastStepPtr = c_null;
  if (props && props.fastStep !== undefined) {
    const fastValue = meta.normalize(props.fastStep, "inputscalar fastStep");
    fastStepPtr = allocTmp(meta.size);
    meta.write(fastStepPtr, fastValue);
  }

  const formatPtr = props && props.format !== undefined ? tmpUtf8(String(props.format)) : c_null;
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;

  const changed = _igInputScalar(
    tmpUtf8(label),
    dataType,
    valuePtr,
    stepPtr,
    fastStepPtr,
    formatPtr,
    flags
  ) !== 0;

  const newValue = meta.read(valuePtr);

  if (!hasControlledValue && node._inputScalarValue !== newValue) {
    node._inputScalarValue = newValue;
  }

  if (changed && props && props.onChange) {
    safeInvokeCallback(props.onChange, newValue);
  }
}

function renderImage(node, vec2, vec4) {
  const props = node.props;

  if (!props || props.textureId === undefined) {
    logErrorMessage("<image> requires a textureId prop.");
    return;
  }

  const width = validateNumber(props.width, 0, "image width");
  const height = validateNumber(props.height, 0, "image height");
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  const uv0Ptr = allocTmp(_sizeof_ImVec2);
  const uv1Ptr = allocTmp(_sizeof_ImVec2);
  let uv0x = 0;
  let uv0y = 0;
  const uv0Value = props && props.uv0;
  if (uv0Value && typeof uv0Value === "object") {
    const uv0ValueX = uv0Value.x;
    const uv0ValueY = uv0Value.y;
    if (uv0ValueX !== undefined) {
      uv0x = validateNumber(uv0ValueX, 0, "image uv0.x");
    }
    if (uv0ValueY !== undefined) {
      uv0y = validateNumber(uv0ValueY, 0, "image uv0.y");
    }
  }
  let uv1x = 1;
  let uv1y = 1;
  const uv1Value = props && props.uv1;
  if (uv1Value && typeof uv1Value === "object") {
    const uv1ValueX = uv1Value.x;
    const uv1ValueY = uv1Value.y;
    if (uv1ValueX !== undefined) {
      uv1x = validateNumber(uv1ValueX, 1, "image uv1.x");
    }
    if (uv1ValueY !== undefined) {
      uv1y = validateNumber(uv1ValueY, 1, "image uv1.y");
    }
  }
  set_ImVec2_x(uv0Ptr, uv0x);
  set_ImVec2_y(uv0Ptr, uv0y);
  set_ImVec2_x(uv1Ptr, uv1x);
  set_ImVec2_y(uv1Ptr, uv1y);

  const tintPtr = allocTmp(_sizeof_ImVec4);
  const borderPtr = allocTmp(_sizeof_ImVec4);
  parseColorToImVec4(tintPtr, props && props.tintColor !== undefined ? props.tintColor : { r: 255, g: 255, b: 255, a: 255 });
  parseColorToImVec4(borderPtr, props && props.borderColor !== undefined ? props.borderColor : { r: 0, g: 0, b: 0, a: 0 });

  const textureId = Number(props.textureId);
  if (!Number.isFinite(textureId)) {
    logErrorMessage(`<image> textureId must be a finite number. Got: ${String(props.textureId)}`);
    return;
  }
  const texturePtr = allocTmp(SIZEOF_C_PTR);
  _sh_ptr_write_c_ptr(texturePtr, 0, textureId);

  _igImage(texturePtr, vec2, uv0Ptr, uv1Ptr, tintPtr, borderPtr);

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
}

function renderImageButton(node, vec2, vec4) {
  const props = node.props;

  if (!props || props.textureId === undefined) {
    logErrorMessage("<imagebutton> requires a textureId prop.");
    return;
  }
  if (!props.id) {
    logErrorMessage("<imagebutton> requires an id prop.");
    return;
  }

  const width = validateNumber(props.width, 0, "imagebutton width");
  const height = validateNumber(props.height, 0, "imagebutton height");
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  const uv0Ptr = allocTmp(_sizeof_ImVec2);
  const uv1Ptr = allocTmp(_sizeof_ImVec2);
  let uv0x = 0;
  let uv0y = 0;
  const uv0Value = props && props.uv0;
  if (uv0Value && typeof uv0Value === "object") {
    const uv0ValueX = uv0Value.x;
    const uv0ValueY = uv0Value.y;
    if (uv0ValueX !== undefined) {
      uv0x = validateNumber(uv0ValueX, 0, "imagebutton uv0.x");
    }
    if (uv0ValueY !== undefined) {
      uv0y = validateNumber(uv0ValueY, 0, "imagebutton uv0.y");
    }
  }
  let uv1x = 1;
  let uv1y = 1;
  const uv1Value = props && props.uv1;
  if (uv1Value && typeof uv1Value === "object") {
    const uv1ValueX = uv1Value.x;
    const uv1ValueY = uv1Value.y;
    if (uv1ValueX !== undefined) {
      uv1x = validateNumber(uv1ValueX, 1, "imagebutton uv1.x");
    }
    if (uv1ValueY !== undefined) {
      uv1y = validateNumber(uv1ValueY, 1, "imagebutton uv1.y");
    }
  }
  set_ImVec2_x(uv0Ptr, uv0x);
  set_ImVec2_y(uv0Ptr, uv0y);
  set_ImVec2_x(uv1Ptr, uv1x);
  set_ImVec2_y(uv1Ptr, uv1y);

  const bgPtr = allocTmp(_sizeof_ImVec4);
  const tintPtr = allocTmp(_sizeof_ImVec4);
  parseColorToImVec4(bgPtr, props && props.backgroundColor !== undefined ? props.backgroundColor : { r: 0, g: 0, b: 0, a: 0 });
  parseColorToImVec4(tintPtr, props && props.tintColor !== undefined ? props.tintColor : { r: 255, g: 255, b: 255, a: 255 });

  const textureId = Number(props.textureId);
  if (!Number.isFinite(textureId)) {
    logErrorMessage(`<imagebutton> textureId must be a finite number. Got: ${String(props.textureId)}`);
    return;
  }
  const texturePtr = allocTmp(SIZEOF_C_PTR);
  _sh_ptr_write_c_ptr(texturePtr, 0, textureId);

  const pressed = _igImageButton(tmpUtf8(String(props.id)), texturePtr, vec2, uv0Ptr, uv1Ptr, bgPtr, tintPtr) !== 0;
  if (pressed && props && props.onClick) {
    safeInvokeCallback(props.onClick);
  }

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
}

function renderPlotLines(node, vec2) {
  const props = node.props;
  const valuesInput = props && Array.isArray(props.values) ? props.values : [];
  const count = valuesInput.length;
  if (count === 0) {
    return;
  }

  const valuesPtr = allocTmp(count * SIZEOF_C_FLOAT);
  for (let i = 0; i < count; i++) {
    const value = Number(valuesInput[i]);
    _sh_ptr_write_c_float(valuesPtr, i * SIZEOF_C_FLOAT, Number.isFinite(value) ? value : 0);
  }

  const label = props && props.label !== undefined ? String(props.label) : "";
  const overlay = props && props.overlay !== undefined ? tmpUtf8(String(props.overlay)) : c_null;
  const scaleMin = props && props.scaleMin !== undefined ? validateNumber(props.scaleMin, 0, "plotlines scaleMin") : Number.MAX_VALUE;
  const scaleMax = props && props.scaleMax !== undefined ? validateNumber(props.scaleMax, 0, "plotlines scaleMax") : Number.MAX_VALUE;
  const stride = props && props.stride !== undefined ? props.stride | 0 : 0;

  let width = 0;
  let height = 0;
  if (props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "plotlines width");
  }
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "plotlines height");
  }
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  _igPlotLines_FloatPtr(tmpUtf8(label), valuesPtr, count, 0, overlay, scaleMin, scaleMax, vec2, stride);
}

function renderPlotHistogram(node, vec2) {
  const props = node.props;
  const valuesInput = props && Array.isArray(props.values) ? props.values : [];
  const count = valuesInput.length;
  if (count === 0) {
    return;
  }

  const valuesPtr = allocTmp(count * SIZEOF_C_FLOAT);
  for (let i = 0; i < count; i++) {
    const value = Number(valuesInput[i]);
    _sh_ptr_write_c_float(valuesPtr, i * SIZEOF_C_FLOAT, Number.isFinite(value) ? value : 0);
  }

  const label = props && props.label !== undefined ? String(props.label) : "";
  const overlay = props && props.overlay !== undefined ? tmpUtf8(String(props.overlay)) : c_null;
  const scaleMin = props && props.scaleMin !== undefined ? validateNumber(props.scaleMin, 0, "plothistogram scaleMin") : Number.MAX_VALUE;
  const scaleMax = props && props.scaleMax !== undefined ? validateNumber(props.scaleMax, 0, "plothistogram scaleMax") : Number.MAX_VALUE;
  const stride = props && props.stride !== undefined ? props.stride | 0 : 0;

  let width = 0;
  let height = 0;
  if (props && props.width !== undefined) {
    width = validateNumber(props.width, 0, "plothistogram width");
  }
  if (props && props.height !== undefined) {
    height = validateNumber(props.height, 0, "plothistogram height");
  }
  set_ImVec2_x(vec2, width);
  set_ImVec2_y(vec2, height);

  _igPlotHistogram_FloatPtr(tmpUtf8(label), valuesPtr, count, 0, overlay, scaleMin, scaleMax, vec2, stride);
}

function renderTooltip(node) {
  const props = node.props;
  const followItem = !!(props && props.followItem);

  if (!followItem) {
    const open = props && props.open !== undefined ? !!props.open : false;
    if (!open) {
      return;
    }
    if (!_igBeginTooltip()) {
      return;
    }
    pushCleanup(function() {
      _igEndTooltip();
    });
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }
    popAndRunCleanup();
    return;
  }

  if (!_igBeginItemTooltip()) {
    return;
  }
  pushCleanup(function() {
    _igEndTooltip();
  });
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i]);
    }
  }
  popAndRunCleanup();
}

function renderPopup(node) {
  const props = node.props;
  const popupId = props && props.id !== undefined ? String(props.id) : "Popup##" + String(node.id);
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  const popupIdPtr = tmpUtf8(popupId);

  if (props && props.open === true) {
    _igOpenPopup_Str(popupIdPtr, 0);
  } else if ((!props || props.open === undefined) && props && props.defaultOpen && !node._popupOpenedOnce) {
    _igOpenPopup_Str(popupIdPtr, 0);
    node._popupOpenedOnce = true;
  }

  if (props && props.open === false) {
    node._popupWasOpen = false;
    return;
  }

  const began = _igBeginPopup(popupIdPtr, flags);
  if (began) {
    pushCleanup(function() {
      _igEndPopup();
    });
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }
    popAndRunCleanup();
  }

  const isOpenNow = _igIsPopupOpen_Str(popupIdPtr, 0) !== 0;
  if (node._popupWasOpen && !isOpenNow && props && props.onClose) {
    safeInvokeCallback(props.onClose);
  }
  node._popupWasOpen = isOpenNow;
}

function renderPopupModal(node) {
  const props = node.props;
  const popupId = props && props.id !== undefined ? String(props.id) : "PopupModal##" + String(node.id);
  const flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  const popupIdPtr = tmpUtf8(popupId);

  const wasOpenLastFrame = !!node._popupModalWasOpen;
  const controlledOpen = props && props.open !== undefined;
  const desiredOpen = controlledOpen ? !!props.open : false;

  let shouldOpen = false;
  if (controlledOpen) {
    if (desiredOpen && !node._popupModalPendingClose && !wasOpenLastFrame) {
      shouldOpen = true;
    } else if (!desiredOpen) {
      node._popupModalPendingClose = false;
    }
  } else if (props && props.open === true) {
    if (!wasOpenLastFrame) {
      shouldOpen = true;
    }
  } else if ((!props || props.open === undefined) && props && props.defaultOpen && !node._popupModalOpenedOnce) {
    shouldOpen = true;
    node._popupModalOpenedOnce = true;
  }

  if (shouldOpen) {
    _igOpenPopup_Str(popupIdPtr, 0);
  }

  const wantsCloseCallback = !!(props && props.onClose);
  const pOpen = wantsCloseCallback ? allocTmp(SIZEOF_C_BOOL) : c_null;
  if (wantsCloseCallback) {
    _sh_ptr_write_c_bool(pOpen, 0, 1);
  }

  const began = _igBeginPopupModal(popupIdPtr, pOpen, flags);
  if (began) {
    pushCleanup(function() {
      _igEndPopup();
    });

    if (controlledOpen && !desiredOpen && wasOpenLastFrame) {
      _igCloseCurrentPopup();
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        renderNode(node.children[i]);
      }
    }
    popAndRunCleanup();
  }

  let isOpenNow = _igIsPopupOpen_Str(popupIdPtr, 0) !== 0;

  if (controlledOpen && !desiredOpen && isOpenNow) {
    _igCloseCurrentPopup();
    isOpenNow = false;
  }

  if (wantsCloseCallback) {
    const stillOpen = _sh_ptr_read_c_bool(pOpen, 0) !== 0;
    if (!stillOpen) {
      if (isOpenNow) {
        _igCloseCurrentPopup();
        isOpenNow = false;
      }
      if (!node._popupModalCloseNotified) {
        if (controlledOpen) {
          node._popupModalPendingClose = true;
        }
        safeInvokeCallback(props.onClose);
        node._popupModalCloseNotified = true;
      }
    } else {
      node._popupModalCloseNotified = false;
      if (!controlledOpen) {
        node._popupModalPendingClose = false;
      }
    }
  }

  if (node._popupModalWasOpen && !isOpenNow && props && props.onClose && !node._popupModalCloseNotified) {
    if (controlledOpen) {
      node._popupModalPendingClose = true;
    }
    safeInvokeCallback(props.onClose);
    node._popupModalCloseNotified = true;
  }

  if (isOpenNow && controlledOpen && desiredOpen) {
    node._popupModalPendingClose = false;
  }

  node._popupModalWasOpen = isOpenNow;
}

function renderDockSpace(node, vec2) {
  const props = node.props;
  const dockSpaceFn = globalThis && globalThis._igDockSpace;
  const dockSpaceViewportFn = globalThis && globalThis._igDockSpaceOverViewport;

  if (typeof dockSpaceFn !== "function" && typeof dockSpaceViewportFn !== "function") {
    if (!renderDockSpaceWarned) {
      logErrorMessage("DockSpace component requested but docking is not available in the current runtime.");
      renderDockSpaceWarned = true;
    }
    return;
  }

  let flags = props && props.flags !== undefined ? props.flags | 0 : 0;
  const dockId = props && props.id !== undefined ? props.id >>> 0 : node.id >>> 0;

  const sizeProp = props && props.size;
  if (sizeProp && typeof sizeProp === "object") {
    const dockWidth = validateNumber(sizeProp.x !== undefined ? sizeProp.x : 0, 0, "dockspace size.x");
    const dockHeight = validateNumber(sizeProp.y !== undefined ? sizeProp.y : 0, 0, "dockspace size.y");
    set_ImVec2_x(vec2, dockWidth);
    set_ImVec2_y(vec2, dockHeight);
  } else {
    set_ImVec2_x(vec2, 0);
    set_ImVec2_y(vec2, 0);
  }

  if (props && props.useViewport && typeof dockSpaceViewportFn === "function") {
    dockSpaceViewportFn(_igGetMainViewport(), flags, 0);
    return;
  }

  if (typeof dockSpaceFn === "function") {
    dockSpaceFn(dockId, vec2, flags, 0);
  }
}

// Tree traversal and rendering
function renderNode(node) {
  if (!node) return;

  // Push this node's unique ID onto ImGui's ID stack to ensure stable widget identity.
  _igPushID_Int(node.id);
  pushCleanup(function() {
    _igPopID();
  });

  // Handle text nodes early (no switch dispatch needed)
  if (node.text !== undefined) {
    _igText(tmpUtf8(node.text));
    popAndRunCleanup();
    return;
  }

  // Reusable buffers for ImVec2 and ImVec4 to reduce allocations
  const vec2 = allocTmp(_sizeof_ImVec2);
  const vec4 = allocTmp(_sizeof_ImVec4);

  // Handle component nodes by delegating to specific render functions
  switch (node.type) {
    case "root":
      renderRoot(node, vec2);
      break;

    case "mainmenubar":
      renderMainMenuBar(node);
      break;

    case "window":
      renderWindow(node, vec2, vec4);
      break;

    case "demowindow":
      renderDemoWindow(node);
      break;

    case "child":
      renderChild(node, vec2);
      break;

    case "menubar":
      renderMenuBar(node);
      break;

    case "menu":
      renderMenu(node);
      break;

    case "menuitem":
      renderMenuItem(node);
      break;

    case "button":
      renderButton(node, vec2, vec4);
      break;

    case "text":
      renderText(node, vec4);
      break;

    case "group":
      renderGroup(node);
      break;

    case "tree":
    case "treenode":
      renderTreeNodeComponent(node);
      break;

    case "tabbar":
      renderTabBar(node);
      break;

    case "tabitem":
      renderTabItem(node);
      break;

    case "separator":
      _igSeparator();
      break;

    case "sameline":
      _igSameLine(0.0, -1.0);
      break;

    case "indent":
      renderIndent(node);
      break;

    case "collapsingheader":
      renderCollapsingHeader(node);
      break;

    case "table":
      renderTable(node, vec2);
      break;

    case "tableheader":
      _igTableHeadersRow();
      break;

    case "tablerow":
      renderTableRow(node);
      break;

    case "tablecell":
      renderTableCell(node);
      break;

    case "tablecolumn":
      renderTableColumn(node);
      break;

    case "rect":
      renderRect(node, vec2);
      break;

    case "circle":
      renderCircle(node, vec2);
      break;

    case "checkbox":
      renderCheckbox(node, vec4);
      break;

    case "inputtext":
      renderInputText(node);
      break;

    case "inputtextmultiline":
      renderInputTextMultiline(node, vec2);
      break;

    case "inputfloat":
      renderInputFloat(node);
      break;

    case "inputint":
      renderInputInt(node);
      break;

    case "inputdouble":
      renderInputDouble(node);
      break;

    case "inputscalar":
      renderInputScalar(node);
      break;

    case "dragfloat":
      renderDragFloat(node);
      break;

    case "dragint":
      renderDragInt(node);
      break;

    case "combo":
      renderCombo(node);
      break;

    case "listbox":
      renderListBox(node, vec2);
      break;

    case "selectable":
      renderSelectable(node, vec2, vec4);
      break;

    case "radiobutton":
      renderRadioButton(node, vec4);
      break;

    case "coloredit3":
      renderColorEdit3(node);
      break;

    case "coloredit4":
      renderColorEdit4(node);
      break;

    case "colorbutton":
      renderColorButton(node, vec2);
      break;

    case "sliderfloat":
      renderSliderFloat(node);
      break;

    case "sliderint":
      renderSliderInt(node);
      break;

    case "image":
      renderImage(node, vec2, vec4);
      break;

    case "imagebutton":
      renderImageButton(node, vec2, vec4);
      break;

    case "plotlines":
      renderPlotLines(node, vec2);
      break;

    case "plothistogram":
      renderPlotHistogram(node, vec2);
      break;

    case "progressbar":
      renderProgressBar(node, vec2);
      break;

    case "spacing":
      renderSpacing(node);
      break;

    case "tooltip":
      renderTooltip(node);
      break;

    case "popup":
      renderPopup(node);
      break;

    case "popupmodal":
      renderPopupModal(node);
      break;

    case "dockspace":
      renderDockSpace(node, vec2);
      break;

    default:
      // Unknown type - just render children
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          renderNode(node.children[i]);
        }
      }
      break;
  }

  popAndRunCleanup();
}

// Export render function
globalThis.imguiUnit = {
  renderTree: function() {
    ensureCleanupStackReset();
    const startTime = globalThis.performance.now();

    const reactApp = globalThis.reactApp;
    if (reactApp && reactApp.rootChildren) {
      // Validate that only one root component exists
      let rootCount = 0;
      for (let i = 0; i < reactApp.rootChildren.length; i++) {
        if (reactApp.rootChildren[i].type === 'root') {
          rootCount++;
        }
      }

      if (rootCount > 1) {
        logErrorMessage(`Multiple <root> components detected (${rootCount}). Only one <root> component is allowed.`);
      }

      // Render all root children (supports fragments with multiple windows)
      for (let i = 0; i < reactApp.rootChildren.length; i++) {
        const cleanupDepth = _cleanupStack.length;
        try {
          renderNode(reactApp.rootChildren[i]);
        } catch (error) {
          runCleanupsFrom(cleanupDepth);
          throw error;
        }
        runCleanupsFrom(cleanupDepth);
      }
      runCleanupsFrom(0);
    }

    const duration = globalThis.performance.now() - startTime;

    // Store for C++ to read
    if (!globalThis.perfMetrics) {
      globalThis.perfMetrics = {};
    }
    globalThis.perfMetrics.renderTime = duration;
  },

  onTreeUpdate: function() {
    // Called by React unit when tree is updated
    // Could do something here if needed
  }
};
