// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

const platformInfo = (typeof globalThis !== 'undefined' && globalThis.__platformInfo)
  ? globalThis.__platformInfo
  : {
      os: 'unknown',
      ios: false,
      android: false,
      macos: false,
      windows: false,
      linux: false,
      web: false,
      isNative: false,
      isWeb: false,
      isDesktop: false,
      isMobile: false,
      isTV: false,
      version: 0
    };

function select(spec) {
  if (!spec || typeof spec !== 'object') {
    return undefined;
  }

  // Prioritize explicit OS key
  if (Object.prototype.hasOwnProperty.call(spec, platformInfo.os)) {
    return spec[platformInfo.os];
  }

  if (platformInfo.web && Object.prototype.hasOwnProperty.call(spec, 'web')) {
    return spec.web;
  }
  if (platformInfo.ios && Object.prototype.hasOwnProperty.call(spec, 'ios')) {
    return spec.ios;
  }
  if (platformInfo.android && Object.prototype.hasOwnProperty.call(spec, 'android')) {
    return spec.android;
  }
  if (platformInfo.macos && Object.prototype.hasOwnProperty.call(spec, 'macos')) {
    return spec.macos;
  }
  if (platformInfo.windows && Object.prototype.hasOwnProperty.call(spec, 'windows')) {
    return spec.windows;
  }
  if (platformInfo.linux && Object.prototype.hasOwnProperty.call(spec, 'linux')) {
    return spec.linux;
  }

  if (Object.prototype.hasOwnProperty.call(spec, 'default')) {
    return spec.default;
  }

  return undefined;
}

const Platform = Object.freeze({
  get OS() {
    return platformInfo.os;
  },
  get Version() {
    return platformInfo.version;
  },
  get isTV() {
    return !!platformInfo.isTV;
  },
  get isTesting() {
    return !!platformInfo.isTesting;
  },
  get constants() {
    return platformInfo.constants || {
      isTesting: !!platformInfo.isTesting,
      os: platformInfo.os
    };
  },
  get isNative() {
    return !!platformInfo.isNative;
  },
  get isWeb() {
    return !!platformInfo.isWeb;
  },
  get isDesktop() {
    return !!platformInfo.isDesktop;
  },
  get isMobile() {
    return !!platformInfo.isMobile;
  },
  get ios() {
    return !!platformInfo.ios;
  },
  get android() {
    return !!platformInfo.android;
  },
  get macos() {
    return !!platformInfo.macos;
  },
  get windows() {
    return !!platformInfo.windows;
  },
  get linux() {
    return !!platformInfo.linux;
  },
  select
});

export { Platform };
export default Platform;
