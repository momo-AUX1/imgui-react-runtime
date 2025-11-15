// Copyright (c) Momo-AUX1
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import React from 'react';
import { createRoot, render } from '../index.js';

const componentRegistry = new Map();
const runnableRegistry = new Map();
const runtimeByRoot = new WeakMap();
const activeApps = new Map();

let defaultRoot = null;

function isValidRoot(candidate) {
  return (
    candidate &&
    typeof candidate === 'object' &&
    typeof candidate.container === 'object' &&
    typeof candidate.fiberRoot === 'object'
  );
}

function ensureRoot(candidate) {
  if (isValidRoot(candidate)) {
    return candidate;
  }
  if (!defaultRoot) {
    defaultRoot = createRoot();
  }
  return defaultRoot;
}

function ensureReactAppSurface(root, options = {}) {
  const attachToGlobal = options.autoInstallGlobal !== false;
  if (!attachToGlobal || typeof globalThis !== 'object' || globalThis === null) {
    return {
      __reactImguiNative: true,
      rootChildren: root.container.rootChildren || [],
      render() {
        return render(null, root);
      }
    };
  }

  const existing = (typeof globalThis.reactApp === 'object' && globalThis.reactApp !== null)
    ? globalThis.reactApp
    : {};

  if (!Array.isArray(existing.rootChildren)) {
    existing.rootChildren = root.container.rootChildren || [];
  }

  if (typeof existing.render !== 'function') {
    existing.render = () => Promise.resolve(root.container);
  }

  existing.__reactImguiNative = true;
  globalThis.reactApp = existing;
  return existing;
}

function rememberRuntime(runtime) {
  activeApps.set(runtime.appKey, runtime);
  runtimeByRoot.set(runtime.root, runtime);
}

function forgetRuntime(runtime) {
  activeApps.delete(runtime.appKey);
  runtimeByRoot.delete(runtime.root);
}

function createRuntime(appKey, Component, appParameters = {}) {
  const root = ensureRoot(appParameters.root || appParameters.reactImguiRoot || null);
  const reactAppSurface = ensureReactAppSurface(root, appParameters);
  let latestProps = appParameters.initialProps || {};

  const runtime = {
    appKey,
    root,
    reactApp: reactAppSurface,
    updateProps(nextProps) {
      latestProps = nextProps || {};
      return runtime.render();
    },
    render() {
      const element = React.createElement(Component, latestProps);
      return render(element, root);
    }
  };

  reactAppSurface.render = () => runtime.render();
  rememberRuntime(runtime);
  runtime.render();
  return runtime;
}

const AppRegistry = {
  registerComponent(appKey, componentProvider) {
    if (!appKey || typeof appKey !== 'string') {
      throw new TypeError('AppRegistry.registerComponent expects a string appKey');
    }
    if (typeof componentProvider !== 'function') {
      throw new TypeError('AppRegistry.registerComponent expects a component provider function');
    }
    componentRegistry.set(appKey, componentProvider);
    return appKey;
  },

  registerRunnable(appKey, runnable) {
    if (!appKey || typeof appKey !== 'string') {
      throw new TypeError('AppRegistry.registerRunnable expects a string appKey');
    }
    if (typeof runnable !== 'function') {
      throw new TypeError('AppRegistry.registerRunnable expects a function');
    }
    runnableRegistry.set(appKey, runnable);
    return appKey;
  },

  getRunnable(appKey) {
    if (!appKey || typeof appKey !== 'string') {
      return undefined;
    }

    if (runnableRegistry.has(appKey)) {
      const runnable = runnableRegistry.get(appKey);
      return runnable;
    }

    if (!componentRegistry.has(appKey)) {
      return undefined;
    }

    return (appParameters = {}) => {
      const provider = componentRegistry.get(appKey);
      const Component = provider();
      if (!Component) {
        throw new Error(`AppRegistry: provider for "${appKey}" did not return a component`);
      }
      return createRuntime(appKey, Component, appParameters);
    };
  },

  runApplication(appKey, appParameters = {}) {
    const runnable = this.getRunnable(appKey);
    if (typeof runnable !== 'function') {
      throw new Error(`No application registered for key "${appKey}"`);
    }
    return runnable(appParameters);
  },

  unmountApplicationComponentAtRootTag(rootTag) {
    let runtime = null;

    if (typeof rootTag === 'string' && activeApps.has(rootTag)) {
      runtime = activeApps.get(rootTag);
    } else if (isValidRoot(rootTag)) {
      runtime = runtimeByRoot.get(rootTag) || null;
    }

    if (!runtime) {
      return;
    }

    forgetRuntime(runtime);
    render(null, runtime.root);

    const surface = runtime.reactApp;
    if (surface && typeof surface === 'object') {
      surface.rootChildren = [];
      if (surface === globalThis?.reactApp) {
        surface.render = () => {};
      }
    }
  }
};

export { AppRegistry };
export default AppRegistry;
