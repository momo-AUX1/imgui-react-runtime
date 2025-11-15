// Copyright (c) Momo-AUX1
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import React from 'react';
import {
  createRoot,
  render,
  batchedUpdates,
  discreteUpdates,
  flushSync,
  StyleSheet,
  Platform,
  Dimensions,
  useWindowDimensions,
  Appearance,
  useColorScheme,
  getColorScheme,
  Navigation,
  Window as ImguiWindow,
  ChildWindow,
  Group,
  Text as ImguiText,
  Button as ImguiButton,
  InputText,
  InputTextMultiline,
  Checkbox as ImguiCheckbox,
  SliderFloat,
  PopupModal
} from '../index.js';
import { Alert } from './Alert.js';
import { AppRegistry } from './AppRegistry.js';

function createAliasComponent(Component, displayName, mapProps) {
  const Alias = function aliasComponent(props = {}) {
    const normalizedProps = mapProps ? mapProps(props) : props;
    return React.createElement(Component, normalizedProps);
  };
  Alias.displayName = displayName;
  return Alias;
}

const View = createAliasComponent(Group, 'View');
const SafeAreaView = View;
const WindowView = createAliasComponent(ImguiWindow, 'WindowView');
const Text = createAliasComponent(ImguiText, 'Text');

function normalizeButtonChildren(title, children) {
  if (children !== undefined && children !== null) {
    return children;
  }
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }
  return 'Button';
}

const Button = function ReactNativeButton(props = {}) {
  const { title, children, onPress, onClick, ...rest } = props;
  const handler = typeof onPress === 'function'
    ? () => onPress()
    : onClick;
  const content = normalizeButtonChildren(title, children);
  return React.createElement(ImguiButton, { ...rest, onClick: handler }, content);
};

function renderPressableChildren(children) {
  if (typeof children === 'function') {
    return children({ pressed: false });
  }
  return children;
}

const Pressable = function ReactNativePressable(props = {}) {
  const { children, onPress, onClick, ...rest } = props;
  const handler = typeof onPress === 'function'
    ? () => onPress()
    : onClick;
  return React.createElement(ImguiButton, { ...rest, onClick: handler }, renderPressableChildren(children));
};

const TouchableOpacity = Pressable;
const TouchableHighlight = Pressable;
const TouchableWithoutFeedback = Pressable;

function composeStyles(styleA, styleB) {
  if (!styleA) {
    return styleB;
  }
  if (!styleB) {
    return styleA;
  }
  return StyleSheet.compose(styleA, styleB);
}

const ScrollView = function ReactNativeScrollView(props = {}) {
  const {
    children,
    style,
    contentContainerStyle,
    scrollEnabled = true,
    horizontal = false,
    ...rest
  } = props;

  const combinedStyle = StyleSheet.flatten(
    composeStyles(style, contentContainerStyle)
  );

  return React.createElement(
    ChildWindow,
    {
      ...rest,
      noScrollbar: scrollEnabled === false,
      style: combinedStyle,
      horizontal
    },
    children
  );
};

const Switch = function ReactNativeSwitch(props = {}) {
  const {
    value,
    defaultValue,
    onValueChange,
    onChange,
    children,
    ...rest
  } = props;

  return React.createElement(
    ImguiCheckbox,
    {
      ...rest,
      checked: value,
      defaultChecked: defaultValue,
      onChange: onValueChange || onChange
    },
    children
  );
};

const Slider = function ReactNativeSlider(props = {}) {
  const {
    value,
    defaultValue,
    minimumValue = 0,
    maximumValue = 1,
    onValueChange,
    onChange,
    ...rest
  } = props;

  return React.createElement(SliderFloat, {
    ...rest,
    value,
    defaultValue,
    min: minimumValue,
    max: maximumValue,
    onChange: onValueChange || onChange
  });
};

const TextInput = function ReactNativeTextInput(props = {}) {
  const {
    multiline,
    numberOfLines,
    onChangeText,
    onChange,
    children,
    style,
    ...rest
  } = props;

  const commonProps = {
    ...rest,
    onChange: onChangeText || onChange,
    style
  };

  if (multiline || numberOfLines > 1) {
    const multilineProps = { ...commonProps };
    if (numberOfLines && multilineProps.height === undefined) {
      multilineProps.height = numberOfLines * 24;
    }
    return React.createElement(InputTextMultiline, multilineProps, children);
  }

  return React.createElement(InputText, commonProps, children);
};

const Modal = function ReactNativeModal(props = {}) {
  const {
    children,
    visible = true,
    onRequestClose,
    onClose,
    ...rest
  } = props;

  if (!visible) {
    return null;
  }

  return React.createElement(
    PopupModal,
    {
      ...rest,
      onClose: onRequestClose || onClose
    },
    children
  );
};

function resolveInstallTarget(target) {
  if (target && typeof target === 'object') {
    return target;
  }
  if (typeof globalThis === 'object' && globalThis !== null) {
    if (!globalThis.ReactNative) {
      globalThis.ReactNative = {};
    }
    return globalThis.ReactNative;
  }
  return {};
}

const nativeModuleExports = Object.freeze({
  View,
  SafeAreaView,
  WindowView,
  Text,
  Button,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Switch,
  Slider,
  Modal,
  Alert,
  AppRegistry,
  StyleSheet,
  Platform,
  Dimensions,
  Appearance,
  useWindowDimensions,
  useColorScheme,
  getColorScheme,
  Navigation,
  createRoot,
  render,
  batchedUpdates,
  discreteUpdates,
  flushSync
});

const RNCompat = Object.freeze({
  install(target) {
    const resolvedTarget = resolveInstallTarget(target);
    Object.assign(resolvedTarget, nativeModuleExports);
    return resolvedTarget;
  },
  exports: nativeModuleExports
});

export {
  View,
  SafeAreaView,
  WindowView,
  Text,
  Button,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Switch,
  Slider,
  Modal,
  Alert,
  AppRegistry,
  StyleSheet,
  Platform,
  Dimensions,
  Appearance,
  useWindowDimensions,
  useColorScheme,
  getColorScheme,
  Navigation,
  createRoot,
  render,
  batchedUpdates,
  discreteUpdates,
  flushSync,
  RNCompat
};

export default RNCompat;
