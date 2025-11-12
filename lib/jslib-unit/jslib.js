// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

// Event loop implementation for Static Hermes
// Based on hermes-jsi-demos/evloop/jslib.js.inc
// Provides setTimeout, setImmediate, and helper functions for C++ integration

/* global Promise */

(function() {
    "use strict";

    var tasks = [];
    var nextTaskID = 0;
    var curTime = 0;
    var intervals = {}; // Map of interval IDs to their state

    // Return the deadline of the next task, or -1 if there is no task.
    function peekMacroTask() {
        return tasks.length ? tasks[0].deadline : -1;
    }

    // Run the next task if it's time.
    // `tm` is the current time in milliseconds.
    function runMacroTask(tm) {
        curTime = tm;
        if (tasks.length && tasks[0].deadline <= tm) {
            var task = tasks.shift();
            task.fn.apply(undefined, task.args);
        }
    }

    function setTimeout(fn, ms = 0, ...args) {
        var id = nextTaskID++;
        var task = {id, fn, deadline: curTime + Math.max(0, ms | 0), args};
        // Insert the task in the sorted list.
        var i = 0;
        for (i = 0; i < tasks.length; ++i) {
            if (tasks[i].deadline > task.deadline) {
                break;
            }
        }
        tasks.splice(i, 0, task);
        return id;
    }

    function clearTimeout(id) {
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === id) {
                tasks.splice(i, 1);
                break;
            }
        }
    }

    function setImmediate(fn, ...args) {
        return setTimeout(fn, 0, ...args);
    }
    function clearImmediate(id) {
        return clearTimeout(id);
    }

    function setInterval(fn, ms = 0, ...args) {
        var id = nextTaskID++;
        intervals[id] = {
            fn: fn,
            ms: ms,
            args: args,
            timeoutId: null
        };

        function repeat() {
            // Check if interval was cleared
            if (!intervals[id]) {
                return;
            }

            // Call the function
            fn.apply(undefined, args);

            // Schedule next execution
            if (intervals[id]) {
                intervals[id].timeoutId = setTimeout(repeat, ms);
            }
        }

        // Start the interval
        intervals[id].timeoutId = setTimeout(repeat, ms);
        return id;
    }

    function clearInterval(id) {
        if (intervals[id]) {
            if (intervals[id].timeoutId !== null) {
                clearTimeout(intervals[id].timeoutId);
            }
            delete intervals[id];
        }
    }

    // Expose to global scope
    globalThis.setTimeout = setTimeout;
    globalThis.clearTimeout = clearTimeout;
    globalThis.setImmediate = setImmediate;
    globalThis.clearImmediate = clearImmediate;
    globalThis.setInterval = setInterval;
    globalThis.clearInterval = clearInterval;

    // Polyfills needed by React
    // NODE_ENV will be set from C++ based on build configuration
    globalThis.process = {
        env: { NODE_ENV: 'production' }  // Default, overridden by C++
    };

    // Console implementation using Hermes global print()
    // Formats arrays and objects using JSON.stringify with circular reference handling
    function formatArg(arg) {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';

        // Special handling for Error objects
        if (arg instanceof Error) {
            let result = arg.name + ': ' + arg.message;
            if (arg.stack) {
                result += '\n' + arg.stack;
            }
            return result;
        }

        if (typeof arg === 'object') {
          const maxLength = 200;
          try {
                // Use JSON.stringify with a replacer to handle circular references
                const seen = new WeakSet();
                const json = JSON.stringify(arg , function(key, value) {
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) {
                            return '[Circular]';
                        }
                        seen.add(value);
                    }
                    return value;
                });
                // Truncate if too long
                if (json.length > maxLength) {
                    return json.substring(0, maxLength) + '... [truncated]';
                }
                return json;
            } catch (e) {
                // Fallback for other stringify errors
                return '[object]';
            }
        }
        return String(arg);
    }

    globalThis.console = {
        log: function(...args) {
            const formatted = args.map(formatArg).join(' ');
            print(formatted);
        },
        error: function(...args) {
            const formatted = args.map(formatArg).join(' ');
            print('ERROR:', formatted);
        },
        debug: function(...args) {
            // No-op for now
        }
    };

    const sFetchPending = new Map();
    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }
    const windowMetricsListeners = new Set();
    const windowMetrics = {
        width: 0,
        height: 0,
        scale: 1,
        fontScale: 1
    };

    globalThis.__windowMetrics = windowMetrics;

    function emitWindowMetricsChange() {
        const snapshot = {
            width: windowMetrics.width,
            height: windowMetrics.height,
            scale: windowMetrics.scale,
            fontScale: windowMetrics.fontScale
        };

        windowMetricsListeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                // Surface listener errors without interrupting other callbacks
                if (globalThis.console && typeof globalThis.console.error === 'function') {
                    globalThis.console.error('Dimensions listener error', error);
                }
            }
        });
    }

    globalThis.__setWindowMetrics = function(width, height, scale, fontScale) {
        const numericWidth = isFiniteNumber(width) ? width : windowMetrics.width;
        const numericHeight = isFiniteNumber(height) ? height : windowMetrics.height;
        const numericScale = isFiniteNumber(scale) && scale > 0 ? scale : windowMetrics.scale;
        const numericFontScale = isFiniteNumber(fontScale) && fontScale > 0 ? fontScale : numericScale;

        const changed =
            numericWidth !== windowMetrics.width ||
            numericHeight !== windowMetrics.height ||
            numericScale !== windowMetrics.scale ||
            numericFontScale !== windowMetrics.fontScale;

        if (!changed) {
            return;
        }

        windowMetrics.width = numericWidth;
        windowMetrics.height = numericHeight;
        windowMetrics.scale = numericScale;
        windowMetrics.fontScale = numericFontScale;
        emitWindowMetricsChange();
    };

    globalThis.__registerWindowMetricsListener = function(listener) {
        if (typeof listener !== 'function') {
            return function noop() {};
        }
        windowMetricsListeners.add(listener);
        // Immediately emit current metrics so listeners have a value
        try {
            listener({
                width: windowMetrics.width,
                height: windowMetrics.height,
                scale: windowMetrics.scale,
                fontScale: windowMetrics.fontScale
            });
        } catch (error) {
            if (globalThis.console && typeof globalThis.console.error === 'function') {
                globalThis.console.error('Dimensions listener error', error);
            }
        }
        return function unregister() {
            windowMetricsListeners.delete(listener);
        };
    };

    globalThis.__unregisterWindowMetricsListener = function(listener) {
        windowMetricsListeners.delete(listener);
    };

    const defaultPlatformInfo = {
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
        isTV: false
    };

    globalThis.__platformInfo = defaultPlatformInfo;

    globalThis.__setPlatformInfo = function(info) {
        if (!info || typeof info !== 'object') {
            globalThis.__platformInfo = defaultPlatformInfo;
            return;
        }
        const merged = { ...defaultPlatformInfo, ...info };
        // Preserve required string field
        merged.os = typeof info.os === 'string' ? info.os : defaultPlatformInfo.os;
        globalThis.__platformInfo = merged;
    };

    const navigationState = {
        keyboard: true,
        gamepad: true
    };

    globalThis.__navigationState = navigationState;

    globalThis.__setNavigationState = function(keyboard, gamepad) {
        navigationState.keyboard = !!keyboard;
        navigationState.gamepad = !!gamepad;
    };

    globalThis.__getNavigationState = function() {
        return {
            keyboard: !!navigationState.keyboard,
            gamepad: !!navigationState.gamepad
        };
    };

    const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const base64Lookup = (function() {
        const table = [];
        for (let i = 0; i < 256; i++) {
            table[i] = -1;
        }
        for (let i = 0; i < BASE64_TABLE.length; i++) {
            table[BASE64_TABLE.charCodeAt(i)] = i;
        }
        return table;
    })();

    const textDecoder = (typeof TextDecoder === 'function') ? new TextDecoder('utf-8') : null;

    function decodeUtf8(bytes) {
        if (!bytes || bytes.length === 0) {
            return '';
        }
        if (textDecoder) {
            return textDecoder.decode(bytes);
        }
        let out = '';
        let i = 0;
        while (i < bytes.length) {
            let c = bytes[i++];
            if (c < 0x80) {
                out += String.fromCharCode(c);
                continue;
            }
            if ((c & 0xe0) === 0xc0) {
                const c2 = bytes[i++] & 0x3f;
                const code = ((c & 0x1f) << 6) | c2;
                out += String.fromCharCode(code);
                continue;
            }
            if ((c & 0xf0) === 0xe0) {
                const c2 = bytes[i++] & 0x3f;
                const c3 = bytes[i++] & 0x3f;
                const code = ((c & 0x0f) << 12) | (c2 << 6) | c3;
                out += String.fromCharCode(code);
                continue;
            }
            if ((c & 0xf8) === 0xf0) {
                const c2 = bytes[i++] & 0x3f;
                const c3 = bytes[i++] & 0x3f;
                const c4 = bytes[i++] & 0x3f;
                let code = ((c & 0x07) << 18) | (c2 << 12) | (c3 << 6) | c4;
                if (code > 0xFFFF) {
                    code -= 0x10000;
                    out += String.fromCharCode(0xD800 + ((code >> 10) & 0x3FF));
                    out += String.fromCharCode(0xDC00 + (code & 0x3FF));
                } else {
                    out += String.fromCharCode(code);
                }
                continue;
            }
            out += '?';
        }
        return out;
    }

    function decodeBase64ToUint8Array(base64) {
        if (!base64) {
            return new Uint8Array(0);
        }
        const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
        let padding = 0;
        if (clean.endsWith('==')) {
            padding = 2;
        } else if (clean.endsWith('=')) {
            padding = 1;
        }
        const byteLength = ((clean.length * 3) >> 2) - padding;
        const output = new Uint8Array(byteLength);
        let buffer = 0;
        let bits = 0;
        let index = 0;
        for (let i = 0; i < clean.length; i++) {
            const code = base64Lookup[clean.charCodeAt(i) & 0xff];
            if (code === -1) {
                continue;
            }
            buffer = (buffer << 6) | code;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                if (index < byteLength) {
                    output[index++] = (buffer >> bits) & 0xff;
                }
            }
        }
        return output;
    }

    class HeadersPolyfill {
        constructor(init) {
            this._map = new Map();
            if (init !== undefined && init !== null) {
                this._init(init);
            }
        }

        _normalizeName(name) {
            return String(name).toLowerCase();
        }

        _normalizeValue(value) {
            return String(value);
        }

        _init(init) {
            if (init instanceof HeadersPolyfill) {
                init.forEach((value, key) => {
                    this.set(key, value);
                });
                return;
            }
            if (Array.isArray(init)) {
                for (let i = 0; i < init.length; i++) {
                    const entry = init[i];
                    if (entry && entry.length >= 2) {
                        this.append(entry[0], entry[1]);
                    }
                }
                return;
            }
            if (typeof init === 'object') {
                for (const key in init) {
                    if (Object.prototype.hasOwnProperty.call(init, key)) {
                        this.append(key, init[key]);
                    }
                }
            }
        }

        append(name, value) {
            const key = this._normalizeName(name);
            const val = this._normalizeValue(value);
            const existing = this._map.get(key);
            if (existing) {
                existing.push(val);
            } else {
                this._map.set(key, [val]);
            }
        }

        set(name, value) {
            const key = this._normalizeName(name);
            this._map.set(key, [this._normalizeValue(value)]);
        }

        get(name) {
            const key = this._normalizeName(name);
            const values = this._map.get(key);
            return values ? values.join(', ') : null;
        }

        has(name) {
            return this._map.has(this._normalizeName(name));
        }

        delete(name) {
            this._map.delete(this._normalizeName(name));
        }

        forEach(callback, thisArg) {
            this._map.forEach((values, key) => {
                const combined = values.join(', ');
                callback.call(thisArg, combined, key, this);
            });
        }

        entries() {
            const list = [];
            this.forEach((value, key) => {
                list.push([key, value]);
            });
            return list[Symbol.iterator]();
        }

        keys() {
            const list = [];
            this.forEach((_, key) => {
                list.push(key);
            });
            return list[Symbol.iterator]();
        }

        values() {
            const list = [];
            this.forEach((value) => {
                list.push(value);
            });
            return list[Symbol.iterator]();
        }

        _toNativeInit() {
            const entries = [];
            this._map.forEach((values, key) => {
                entries.push([key, values.join(', ')]);
            });
            return entries;
        }
    }

    HeadersPolyfill.prototype[Symbol.iterator] = HeadersPolyfill.prototype.entries;

    class FetchResponse {
        constructor(nativeResult, bodyBytes) {
            this._bodyBytes = bodyBytes;
            this._bodyUsed = false;
            this.status = nativeResult.status | 0;
            this.statusText = nativeResult.statusText || '';
            this.ok = !!nativeResult.ok;
            this.url = nativeResult.url || '';
            this.headers = new HeadersPolyfill(nativeResult.headers || []);
        }

        get bodyUsed() {
            return this._bodyUsed;
        }

        _consumeBody() {
            if (this._bodyUsed) {
                throw new TypeError('Body has already been consumed');
            }
            this._bodyUsed = true;
            const bytes = this._bodyBytes || new Uint8Array(0);
            this._bodyBytes = null;
            return bytes;
        }

        async arrayBuffer() {
            const bytes = this._consumeBody();
            const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            return buffer;
        }

        async text() {
            const bytes = this._consumeBody();
            return decodeUtf8(bytes);
        }

        async json() {
            const text = await this.text();
            if (!text) {
                return null;
            }
            return JSON.parse(text);
        }
    }

    function normalizeFetchArgs(input, init) {
        let urlValue = input;
        let methodValue;
        let headersSource;
        let bodyValue;
        let timeoutValue;
        let redirectValue;

        if (input && typeof input === 'object' && input.url !== undefined) {
            urlValue = input.url;
            methodValue = input.method;
            headersSource = input.headers;
            bodyValue = input.body;
            timeoutValue = input.timeout;
            redirectValue = input.redirect;
        }

        const options = init || {};
        if (options.method !== undefined) {
            methodValue = options.method;
        }
        if (options.headers !== undefined) {
            headersSource = options.headers;
        }
        if (options.body !== undefined) {
            bodyValue = options.body;
        }
        if (options.timeout !== undefined) {
            timeoutValue = options.timeout;
        }
        if (options.redirect !== undefined) {
            redirectValue = options.redirect;
        }

        if (urlValue === undefined || urlValue === null) {
            throw new TypeError('fetch requires a resource');
        }

        const method = methodValue ? String(methodValue).toUpperCase() : 'GET';
        const headers = new HeadersPolyfill(headersSource);
        let body = bodyValue;
        if (body !== undefined && body !== null && typeof body !== 'string') {
            body = String(body);
        } else if (body === undefined || body === null) {
            body = undefined;
        }
        if ((method === 'GET' || method === 'HEAD') && body !== undefined) {
            throw new TypeError(method + ' request cannot have a body');
        }

        let timeout;
        if (timeoutValue !== undefined) {
            const numericTimeout = Number(timeoutValue);
            if (Number.isFinite(numericTimeout) && numericTimeout >= 0) {
                timeout = numericTimeout;
            }
        }

        const redirect = redirectValue !== undefined ? String(redirectValue) : undefined;

        return {
            url: String(urlValue),
            method,
            headers,
            body,
            timeout,
            redirect
        };
    }

    class RequestPolyfill {
        constructor(input, init) {
            const normalized = normalizeFetchArgs(input, init);
            this.url = normalized.url;
            this.method = normalized.method;
            this.headers = normalized.headers;
            this.body = normalized.body;
            this.timeout = normalized.timeout;
            this.redirect = normalized.redirect;
        }

        clone() {
            return new RequestPolyfill(this);
        }
    }

    globalThis.Headers = HeadersPolyfill;
    globalThis.Response = FetchResponse;
    globalThis.Request = RequestPolyfill;

    globalThis.__onNativeFetchComplete = function(result) {
        const entry = sFetchPending.get(result.id);
        if (!entry) {
            return;
        }
        sFetchPending.delete(result.id);
        if (result.error) {
            entry.reject(new TypeError(result.error));
            return;
        }
        const bytes = decodeBase64ToUint8Array(result.body || '');
        entry.resolve(new FetchResponse(result, bytes));
    };

    globalThis.fetch = function(input, init) {
        const NativePromise = globalThis.Promise;
        if (typeof NativePromise !== 'function') {
            throw new TypeError('Native fetch requires Promise support');
        }
        if (typeof globalThis.__nativeFetch !== 'function') {
            return NativePromise.reject(new TypeError('Native fetch is not available'));
        }
        const request = normalizeFetchArgs(input, init);
        return new NativePromise(function(resolve, reject) {
            const nativeInit = {
                method: request.method,
                headers: request.headers._toNativeInit()
            };
            if (request.body !== undefined) {
                nativeInit.body = request.body;
            }
            if (request.timeout !== undefined && isFinite(request.timeout)) {
                nativeInit.timeout = request.timeout;
            }
            if (request.redirect) {
                nativeInit.redirect = request.redirect;
            }
            try {
                const requestId = globalThis.__nativeFetch(request.url, nativeInit);
                sFetchPending.set(requestId, { resolve: resolve, reject: reject });
            } catch (error) {
                reject(error);
            }
        });
    };

    // Return helper functions for C++ to use
    return {peek: peekMacroTask, run: runMacroTask};
})();
