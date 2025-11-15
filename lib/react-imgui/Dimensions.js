// Copyright (c) Momo-AUX1
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import * as React from 'react';

const emptyMetrics = Object.freeze({
  width: 0,
  height: 0,
  scale: 1,
  fontScale: 1
});

function cloneMetrics(metrics) {
  if (!metrics) {
    return { ...emptyMetrics };
  }
  return {
    width: typeof metrics.width === 'number' ? metrics.width : emptyMetrics.width,
    height: typeof metrics.height === 'number' ? metrics.height : emptyMetrics.height,
    scale: typeof metrics.scale === 'number' ? metrics.scale : emptyMetrics.scale,
    fontScale: typeof metrics.fontScale === 'number' ? metrics.fontScale : emptyMetrics.fontScale
  };
}

const subscriptions = new Map();

function ensureGlobals() {
  if (typeof globalThis === 'undefined') {
    return {
      metrics: emptyMetrics,
      addListener: () => () => {},
      removeListener: () => {}
    };
  }
  const metrics = cloneMetrics(globalThis.__windowMetrics);
  const addListener = typeof globalThis.__registerWindowMetricsListener === 'function'
    ? globalThis.__registerWindowMetricsListener
    : () => () => {};
  const removeListener = typeof globalThis.__unregisterWindowMetricsListener === 'function'
    ? globalThis.__unregisterWindowMetricsListener
    : () => {};
  return { metrics, addListener, removeListener };
}

const globals = ensureGlobals();
let latestMetrics = globals.metrics;

if (typeof globals.addListener === 'function') {
  globals.addListener((metrics) => {
    latestMetrics = cloneMetrics(metrics);
  });
}

function get(dim) {
  if (dim !== 'window' && dim !== 'screen') {
    throw new Error("Dimensions.get: expected 'window' or 'screen'");
  }
  return { ...latestMetrics };
}

function addEventListener(type, handler) {
  if (type !== 'change' || typeof handler !== 'function') {
    return { remove() {} };
  }

  const wrapped = (metrics) => {
    latestMetrics = cloneMetrics(metrics);
    handler({
      window: { ...latestMetrics },
      screen: { ...latestMetrics }
    });
  };

  const unsubscribe = globals.addListener(wrapped);
  subscriptions.set(handler, { wrapped, unsubscribe });

  return {
    remove() {
      removeEventListener(type, handler);
    }
  };
}

function removeEventListener(type, handler) {
  if (type !== 'change') {
    return;
  }
  const entry = subscriptions.get(handler);
  if (!entry) {
    return;
  }
  subscriptions.delete(handler);
  if (typeof entry.unsubscribe === 'function') {
    entry.unsubscribe();
  } else if (typeof globals.removeListener === 'function') {
    globals.removeListener(entry.wrapped);
  }
}

const Dimensions = {
  get,
  addEventListener,
  removeEventListener
};

function useWindowDimensions() {
  const [dimensions, setDimensions] = React.useState(() => get('window'));

  React.useEffect(() => {
    const subscription = addEventListener('change', ({ window: windowMetrics }) => {
      setDimensions(windowMetrics);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return dimensions;
}

export { Dimensions, useWindowDimensions };
export default Dimensions;
