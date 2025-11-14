// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import * as React from 'react';

const VALID_COLOR_SCHEMES = new Set(['light', 'dark']);
const FALLBACK_SCHEME = 'unknown';

function normalizeColorScheme(scheme) {
  if (typeof scheme !== 'string') {
    return FALLBACK_SCHEME;
  }
  const normalized = scheme.trim().toLowerCase();
  return VALID_COLOR_SCHEMES.has(normalized) ? normalized : FALLBACK_SCHEME;
}

function ensureGlobals() {
  if (typeof globalThis === 'undefined') {
    return {
      scheme: FALLBACK_SCHEME,
      addListener: () => () => {},
      removeListener: () => {}
    };
  }

  const scheme = normalizeColorScheme(globalThis.__colorScheme);
  const addListener = typeof globalThis.__registerColorSchemeListener === 'function'
    ? globalThis.__registerColorSchemeListener
    : () => () => {};
  const removeListener = typeof globalThis.__unregisterColorSchemeListener === 'function'
    ? globalThis.__unregisterColorSchemeListener
    : () => {};

  return { scheme, addListener, removeListener };
}

const globals = ensureGlobals();
let latestColorScheme = globals.scheme;

if (typeof globals.addListener === 'function') {
  globals.addListener((scheme) => {
    latestColorScheme = normalizeColorScheme(scheme);
  });
}

const subscriptions = new Map();

function getColorScheme() {
  return latestColorScheme;
}

function addChangeListener(listener) {
  if (typeof listener !== 'function') {
    return { remove() {} };
  }

  const wrapped = (scheme) => {
    latestColorScheme = normalizeColorScheme(scheme);
    listener({ colorScheme: latestColorScheme });
  };

  const unsubscribe = globals.addListener(wrapped);
  subscriptions.set(listener, { wrapped, unsubscribe });

  return {
    remove() {
      removeChangeListener(listener);
    }
  };
}

function removeChangeListener(listener) {
  if (!listener) {
    return;
  }
  const entry = subscriptions.get(listener);
  if (!entry) {
    return;
  }
  subscriptions.delete(listener);
  if (typeof entry.unsubscribe === 'function') {
    entry.unsubscribe();
  } else if (typeof globals.removeListener === 'function') {
    globals.removeListener(entry.wrapped);
  }
}

const Appearance = {
  getColorScheme,
  addChangeListener,
  removeChangeListener
};

function useColorScheme() {
  const [scheme, setScheme] = React.useState(() => getColorScheme());

  React.useEffect(() => {
    const subscription = addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return scheme;
}

export { Appearance, useColorScheme, getColorScheme };
export default Appearance;
