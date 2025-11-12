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

export { createRoot, render };
