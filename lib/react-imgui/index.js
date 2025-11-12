// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import React from 'react';
import { createRoot, render } from '../react-imgui-reconciler/reconciler.js';
export { default as Platform } from './Platform.js';
export { default as Dimensions, useWindowDimensions } from './Dimensions.js';

function normalizeDisplayName(type) {
  if (!type) {
    return 'ImguiComponent';
  }
  return type
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function createPrimitiveComponent(type) {
  const displayName = normalizeDisplayName(type);

  const Component = function ImguiPrimitive(props = {}) {
    const { children, ...rest } = props;
    return React.createElement(type, rest, children);
  };

  Component.displayName = displayName;

  return Component;
}

export const Root = createPrimitiveComponent('root');
export const Window = createPrimitiveComponent('window');
export const ChildWindow = createPrimitiveComponent('child');
export const MainMenuBar = createPrimitiveComponent('mainmenubar');
export const MenuBar = createPrimitiveComponent('menubar');
export const Menu = createPrimitiveComponent('menu');
export const MenuItem = createPrimitiveComponent('menuitem');
export const Button = createPrimitiveComponent('button');
export const Text = createPrimitiveComponent('text');
export const Group = createPrimitiveComponent('group');
export const Separator = createPrimitiveComponent('separator');
export const SameLine = createPrimitiveComponent('sameline');
export const Indent = createPrimitiveComponent('indent');
export const CollapsingHeader = createPrimitiveComponent('collapsingheader');
export const Table = createPrimitiveComponent('table');
export const TableHeader = createPrimitiveComponent('tableheader');
export const TableRow = createPrimitiveComponent('tablerow');
export const TableCell = createPrimitiveComponent('tablecell');
export const TableColumn = createPrimitiveComponent('tablecolumn');
export const Rect = createPrimitiveComponent('rect');
export const Circle = createPrimitiveComponent('circle');
export const Checkbox = createPrimitiveComponent('checkbox');
export const SliderFloat = createPrimitiveComponent('sliderfloat');
export const SliderInt = createPrimitiveComponent('sliderint');
export const ProgressBar = createPrimitiveComponent('progressbar');
export const Spacing = createPrimitiveComponent('spacing');
export const InputText = createPrimitiveComponent('inputtext');
export const InputFloat = createPrimitiveComponent('inputfloat');
export const InputInt = createPrimitiveComponent('inputint');
export const DragFloat = createPrimitiveComponent('dragfloat');
export const DragInt = createPrimitiveComponent('dragint');
export const Combo = createPrimitiveComponent('combo');
export const Selectable = createPrimitiveComponent('selectable');
export const RadioButton = createPrimitiveComponent('radiobutton');
export const ColorEdit3 = createPrimitiveComponent('coloredit3');
export const ColorEdit4 = createPrimitiveComponent('coloredit4');
export const ColorButton = createPrimitiveComponent('colorbutton');

export { createRoot, render };

const Navigation = Object.freeze({
  configure(options = {}) {
    const current = Navigation.getState();
    const desiredKeyboard = options.keyboard === undefined ? current.keyboard : !!options.keyboard;
    const desiredGamepad = options.gamepad === undefined ? current.gamepad : !!options.gamepad;

    if (typeof globalThis.__configureImGuiNavigation === 'function') {
      globalThis.__configureImGuiNavigation(desiredKeyboard, desiredGamepad);
      return Navigation.getState();
    }

    if (typeof globalThis.__setNavigationState === 'function') {
      try {
        globalThis.__setNavigationState(desiredKeyboard, desiredGamepad);
      } catch (error) {
        if (globalThis.console && typeof globalThis.console.error === 'function') {
          globalThis.console.error('Navigation.configure fallback failed', error);
        }
      }
    }

    return {
      keyboard: desiredKeyboard,
      gamepad: desiredGamepad
    };
  },

  getState() {
    if (typeof globalThis.__getNavigationState === 'function') {
      try {
        const state = globalThis.__getNavigationState();
        if (state && typeof state === 'object') {
          return {
            keyboard: !!state.keyboard,
            gamepad: !!state.gamepad
          };
        }
      } catch (error) {
        if (globalThis.console && typeof globalThis.console.error === 'function') {
          globalThis.console.error('Navigation.getState failed', error);
        }
      }
    }

    return { keyboard: true, gamepad: true };
  }
});

export { Navigation };
