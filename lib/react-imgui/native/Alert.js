// Copyright (c) Momo-AUX1
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import { TreeNode, TextNode } from '../../react-imgui-reconciler/tree-node.js';

const ALERT_OVERLAY_FLAG = '__reactImguiAlertOverlay';
const alertQueue = [];
let activeAlert = null;
let customHandler = null;
let nextAlertId = 1;
let renderScheduled = false;

function markOverlayNode(node) {
  if (node && typeof node === 'object') {
    node[ALERT_OVERLAY_FLAG] = true;
  }
  return node;
}

function isOverlayNode(node) {
  return !!(node && node[ALERT_OVERLAY_FLAG]);
}

function normalizeButton(button, index) {
  if (!button || typeof button !== 'object') {
    return {
      text: `Button ${index + 1}`,
      onPress: undefined,
      style: undefined
    };
  }

  return {
    text: typeof button.text === 'string' && button.text ? button.text : `Button ${index + 1}`,
    onPress: typeof button.onPress === 'function' ? button.onPress : undefined,
    style: button.style === 'cancel' || button.style === 'destructive' ? button.style : undefined
  };
}

function normalizeButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [normalizeButton({ text: 'OK' }, 0)];
  }
  return buttons.map((button, index) => normalizeButton(button, index));
}

function formatAlertMessage(title, message) {
  const safeTitle = title && typeof title === 'string' ? title : 'Alert';
  const safeMessage = message && typeof message === 'string' ? message : '';
  if (!safeMessage) {
    return safeTitle;
  }
  return `${safeTitle}\n\n${safeMessage}`;
}

function browserFallbackHandler(payload) {
  const { title, message, buttons } = payload;
  const formatted = formatAlertMessage(title, message);

  if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
    try {
      globalThis.alert(formatted);
    } catch {
      // Ignore errors from host alert implementation
    }
  } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[react-imgui-native] Alert: ${formatted}`);
  }

  const firstRunnable = buttons.find((button) => button.style !== 'cancel') || buttons[0];
  if (firstRunnable && typeof firstRunnable.onPress === 'function') {
    try {
      firstRunnable.onPress();
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('Alert button handler failed', error);
      }
    }
  }

  return false;
}

function getReactAppSurface() {
  if (typeof globalThis !== 'object' || globalThis === null) {
    return null;
  }
  const surface = globalThis.reactApp;
  if (!surface || typeof surface !== 'object') {
    return null;
  }
  return surface;
}

function canRenderOverlay() {
  const surface = getReactAppSurface();
  if (!surface || typeof surface.render !== 'function') {
    return false;
  }
  if (!Array.isArray(surface.rootChildren)) {
    surface.rootChildren = [];
  }
  return Array.isArray(surface.rootChildren);
}

function ensureRenderHookInstalled() {
  const surface = getReactAppSurface();
  if (!surface || typeof surface.render !== 'function') {
    return;
  }
  if (surface.__reactImguiAlertPatched) {
    return;
  }
  const originalRender = surface.render.bind(surface);
  surface.render = async function patchedRender(...args) {
    try {
      const result = await originalRender(...args);
      injectOverlayNodes();
      return result;
    } finally {
      // No-op: overlay injection happens regardless of render result
    }
  };
  surface.__reactImguiAlertPatched = true;
}

function scheduleReactRender() {
  if (renderScheduled) {
    return;
  }
  const surface = getReactAppSurface();
  if (!surface || typeof surface.render !== 'function') {
    return;
  }
  renderScheduled = true;
  Promise.resolve().then(() => {
    renderScheduled = false;
    try {
      const result = surface.render();
      if (result && typeof result.then === 'function' && typeof result.catch === 'function') {
        result.catch((error) => {
          if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error('[react-imgui-native] Alert overlay render failed', error);
          }
        });
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[react-imgui-native] Alert overlay render failed', error);
      }
    }
  });
}

function appendChild(parent, child) {
  if (!parent || !child) {
    return child;
  }
  if (Array.isArray(parent.children)) {
    parent.children.push(child);
  } else {
    parent.children = [child];
  }
  child.parent = parent;
  if (typeof parent.markChildrenChanged === 'function') {
    parent.markChildrenChanged();
  }
  return child;
}

function createNode(type, props = {}) {
  return markOverlayNode(new TreeNode(type, props));
}

function createTextNode(text) {
  return markOverlayNode(new TextNode(text));
}

function createSpacingNode() {
  return createNode('spacing', {});
}

function resolveButtonStyle(button) {
  if (!button || !button.style) {
    return undefined;
  }
  if (button.style === 'destructive') {
    return { color: '#FF6B6B' };
  }
  if (button.style === 'cancel') {
    return { color: '#CCCCCC' };
  }
  return undefined;
}

function handleModalClose(alertId) {
  if (!activeAlert || activeAlert.id !== alertId) {
    return;
  }
  if (activeAlert.options && activeAlert.options.cancelable === false) {
    scheduleOverlayUpdate();
    return;
  }
  const cancelButton = activeAlert.buttons.find((button) => button.style === 'cancel');
  dismissActiveAlert(cancelButton || null);
}

function invokeButtonHandler(button) {
  if (!button || typeof button.onPress !== 'function') {
    return;
  }
  try {
    button.onPress();
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error('Alert button handler failed', error);
    }
  }
}

function handleButtonPress(alertId, button) {
  if (!activeAlert || activeAlert.id !== alertId) {
    invokeButtonHandler(button);
    return;
  }
  dismissActiveAlert(button || null);
}

function buildMessageNodes(container, message) {
  if (!message) {
    return;
  }
  const lines = String(message).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const textComponent = createNode('text', { wrapped: true });
    appendChild(textComponent, createTextNode(line.length > 0 ? line : ' '));
    appendChild(container, textComponent);
  }
}

function buildButtonsRow(alertPayload) {
  const row = createNode('group', {});
  const { buttons } = alertPayload;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const buttonNode = createNode('button', {
      onClick: () => handleButtonPress(alertPayload.id, button),
      style: resolveButtonStyle(button)
    });
    appendChild(buttonNode, createTextNode(button.text));
    appendChild(row, buttonNode);
    if (i < buttons.length - 1) {
      appendChild(row, createNode('sameline', {}));
    }
  }
  return row;
}

function buildAlertOverlayNode(alertPayload) {
  const modal = createNode('popupmodal', {
    id: `ReactImguiAlert##${alertPayload.id}`,
    title: alertPayload.title,
    open: true,
    modal: true,
    defaultOpen: true,
    onClose: () => handleModalClose(alertPayload.id)
  });

  const body = createNode('group', { style: { minWidth: 320 } });
  buildMessageNodes(body, alertPayload.message);
  appendChild(body, createSpacingNode());
  appendChild(body, buildButtonsRow(alertPayload));
  appendChild(modal, body);

  return modal;
}

function injectOverlayNodes() {
  const surface = getReactAppSurface();
  if (!surface || !Array.isArray(surface.rootChildren)) {
    return;
  }
  const { rootChildren } = surface;
  for (let i = rootChildren.length - 1; i >= 0; i--) {
    if (isOverlayNode(rootChildren[i])) {
      rootChildren.splice(i, 1);
    }
  }
  if (activeAlert) {
    rootChildren.push(buildAlertOverlayNode(activeAlert));
  }
}

function scheduleOverlayUpdate() {
  if (!canRenderOverlay()) {
    return;
  }
  ensureRenderHookInstalled();
  injectOverlayNodes();
  scheduleReactRender();
}

function processAlertQueue() {
  if (!canRenderOverlay()) {
    return;
  }
  if (!activeAlert && alertQueue.length > 0) {
    activeAlert = alertQueue.shift();
  }
  scheduleOverlayUpdate();
}

function dismissActiveAlert(button) {
  if (!activeAlert) {
    return;
  }
  const current = activeAlert;
  activeAlert = null;
  invokeButtonHandler(button);
  scheduleOverlayUpdate();
  if (!activeAlert && alertQueue.length > 0) {
    processAlertQueue();
  }
  if (!activeAlert && current && current.options && typeof current.options.onDismiss === 'function') {
    try {
      current.options.onDismiss();
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('Alert onDismiss handler failed', error);
      }
    }
  }
}

function enqueueOverlayAlert(payload) {
  if (!canRenderOverlay()) {
    return false;
  }
  alertQueue.push(payload);
  processAlertQueue();
  return true;
}

function overlayAlertHandler(payload) {
  if (enqueueOverlayAlert(payload)) {
    return true;
  }
  return browserFallbackHandler(payload);
}

function resolveHandler() {
  if (typeof customHandler === 'function') {
    return customHandler;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.__reactImguiNativeAlert === 'function') {
    return globalThis.__reactImguiNativeAlert;
  }
  return overlayAlertHandler;
}

function alert(title, message, buttons, options = {}) {
  const handler = resolveHandler();
  const normalizedButtons = normalizeButtons(buttons);
  const payload = {
    id: nextAlertId++,
    title: typeof title === 'string' && title ? title : 'Alert',
    message: typeof message === 'string' ? message : '',
    buttons: normalizedButtons,
    options: options && typeof options === 'object' ? { ...options } : {}
  };
  return handler(payload);
}

function setAlertHandler(handler) {
  if (handler !== undefined && handler !== null && typeof handler !== 'function') {
    throw new TypeError('Alert.setHandler expects a function or null');
  }
  customHandler = handler || null;
}

function getAlertHandler() {
  return resolveHandler();
}

export const Alert = Object.freeze({
  alert,
  setHandler: setAlertHandler,
  getHandler: getAlertHandler
});

export default Alert;
