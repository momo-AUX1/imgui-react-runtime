// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

// Event loop implementation for Static Hermes
// Based on hermes-jsi-demos/evloop/jslib.js.inc
// Provides setTimeout, setImmediate, and helper functions for C++ integration
    const scheduleMicrotask = typeof globalThis.queueMicrotask === 'function'
        ? (fn) => globalThis.queueMicrotask(fn)
        : (fn) => Promise.resolve().then(fn);

    function getCurrentWorkingDirectory() {
        try {
            if (typeof globalThis.process === 'object' && globalThis.process !== null && typeof globalThis.process.cwd === 'function') {
                return String(globalThis.process.cwd());
            }
        } catch (error) {
            // Ignore failures and return empty string.
        }
        return '';
    }

    function assertPath(value, name) {
        if (typeof value !== 'string') {
            throw new TypeError(`${name || 'path'} must be a string`);
        }
    }

    function splitOnSeparator(path, separatorPattern) {
        if (path.length === 0) {
            return [];
        }
        return path.split(separatorPattern);
    }

    function normalizeSegments(parts, allowAboveRoot) {
        const result = [];
        for (const part of parts) {
            if (!part || part === '.') {
                continue;
            }
            if (part === '..') {
                if (result.length > 0 && result[result.length - 1] !== '..') {
                    result.pop();
                } else if (allowAboveRoot) {
                    result.push('..');
                }
            } else {
                result.push(part);
            }
        }
        return result;
    }

    function formatPathResult(isAbsolute, segments, trailingSlash, separator) {
        let path = segments.join(separator);
        if (!path && !isAbsolute) {
            path = '.';
        }
        if (path && trailingSlash) {
            path += separator;
        }
        if (isAbsolute) {
            return separator + path;
        }
        return path;
    }

    const nodeModuleFactories = new Map();
    const nodeModuleCache = new Map();

    function normalizeModuleName(name) {
        const text = String(name);
        return text.startsWith('node:') ? text.slice(5) : text;
    }

    function registerNodeModule(name, factory) {
        if (!name || typeof factory !== 'function') {
            return;
        }
        nodeModuleFactories.set(normalizeModuleName(name), factory);
    }

    function requireNodeModule(request) {
        const specifier = normalizeModuleName(request);
        if (nodeModuleCache.has(specifier)) {
            return nodeModuleCache.get(specifier).exports;
        }
        const factory = nodeModuleFactories.get(specifier);
        if (typeof factory !== 'function') {
            throw new Error(`Cannot find module '${request}'`);
        }
        const moduleRecord = { exports: {} };
        nodeModuleCache.set(specifier, moduleRecord);
        try {
            factory(moduleRecord, moduleRecord.exports, requireNodeModule);
        } catch (error) {
            nodeModuleCache.delete(specifier);
            throw error;
        }
        return moduleRecord.exports;
    }

    function defineNodeModule(names, factory) {
        if (!Array.isArray(names)) {
            names = [names];
        }
        for (const name of names) {
            registerNodeModule(name, factory);
        }
    }

    globalThis.__registerNodeModule = registerNodeModule;
    globalThis.__nodeModuleFactories = nodeModuleFactories;

    function runtimeRequire(request) {
        return requireNodeModule(request);
    }

    runtimeRequire.cache = nodeModuleCache;
    runtimeRequire.resolve = function(request) {
        return normalizeModuleName(request);
    };

    if (typeof globalThis.require !== 'function') {
        globalThis.require = runtimeRequire;
    }

    function normalizeEncodingValue(value, fallback) {
        if (value === undefined || value === null) {
            return fallback;
        }
        const lowered = String(value).trim().toLowerCase();
        if (lowered === 'utf8' || lowered === 'utf-8') {
            return 'utf8';
        }
        if (lowered === 'base64') {
            return 'base64';
        }
        if (lowered === 'hex') {
            return 'hex';
        }
        if (lowered === 'latin1' || lowered === 'binary' || lowered === 'ascii') {
            return 'latin1';
        }
        return lowered || fallback;
    }

    function createPosixPathModule() {
        const separator = '/';
        const split = (value) => value.split(/\/+/);

        function normalize(path) {
            assertPath(path);
            const isAbsolute = path.startsWith(separator);
            const trailingSlash = path.endsWith(separator);
            const parts = split(path);
            const filtered = normalizeSegments(parts, !isAbsolute);
            return formatPathResult(isAbsolute, filtered, trailingSlash, separator);
        }

        function resolve(...paths) {
            let resolvedPath = '';
            let resolvedAbsolute = false;
            for (let i = paths.length - 1; i >= 0; i--) {
                const path = paths[i];
                if (path == null) {
                    continue;
                }
                assertPath(path);
                if (path.length === 0) {
                    continue;
                }
                resolvedPath = `${path}${resolvedPath ? separator + resolvedPath : ''}`;
                if (path.startsWith(separator)) {
                    resolvedAbsolute = true;
                    break;
                }
            }

            if (!resolvedAbsolute) {
                const cwd = getCurrentWorkingDirectory();
                if (cwd) {
                    resolvedPath = `${cwd}${resolvedPath ? separator + resolvedPath : ''}`;
                    resolvedAbsolute = cwd.startsWith(separator);
                }
            }

            if (!resolvedPath) {
                return resolvedAbsolute ? separator : '.';
            }

            const parts = split(resolvedPath);
            const filtered = normalizeSegments(parts, !resolvedAbsolute);
            const result = filtered.join(separator);
            if (resolvedAbsolute) {
                return separator + result;
            }
            return result || '.';
        }

        function isAbsolute(path) {
            assertPath(path);
            return path.startsWith(separator);
        }

        function join(...paths) {
            let joined;
            for (const path of paths) {
                if (path == null || path.length === 0) {
                    continue;
                }
                assertPath(path);
                if (joined === undefined) {
                    joined = path;
                } else {
                    joined += separator + path;
                }
            }
            if (joined === undefined) {
                return '.';
            }
            return normalize(joined);
        }

        function relative(from, to) {
            assertPath(from, 'from');
            assertPath(to, 'to');
            if (from === to) {
                return '';
            }
            const fromResolved = resolve(from);
            const toResolved = resolve(to);
            if (fromResolved === toResolved) {
                return '';
            }
            const fromSegments = split(fromResolved).filter(Boolean);
            const toSegments = split(toResolved).filter(Boolean);
            let length = Math.min(fromSegments.length, toSegments.length);
            let same = length;
            for (let i = 0; i < length; i++) {
                if (fromSegments[i] !== toSegments[i]) {
                    same = i;
                    break;
                }
            }
            const up = fromSegments.slice(same).map(() => '..');
            const down = toSegments.slice(same);
            const result = up.concat(down).join(separator);
            return result || '.';
        }

        function basename(path, ext) {
            assertPath(path);
            if (ext !== undefined) {
                assertPath(ext, 'ext');
            }
            const segments = split(path).filter(Boolean);
            if (segments.length === 0) {
                return path.startsWith(separator) ? separator : '';
            }
            let base = segments[segments.length - 1];
            if (ext && base.endsWith(ext) && ext.length < base.length) {
                base = base.slice(0, -ext.length);
            }
            return base;
        }

        function dirname(path) {
            assertPath(path);
            if (path.length === 0) {
                return '.';
            }
            const hasRoot = path.startsWith(separator);
            const segments = split(path).filter(Boolean);
            if (segments.length <= 1) {
                return hasRoot ? separator : '.';
            }
            segments.pop();
            const result = segments.join(separator);
            return hasRoot ? separator + result : result;
        }

        function extname(path) {
            assertPath(path);
            const segments = split(path).filter(Boolean);
            if (segments.length === 0) {
                return '';
            }
            const base = segments[segments.length - 1];
            const index = base.lastIndexOf('.');
            if (index <= 0) {
                return '';
            }
            return base.slice(index);
        }

        function format(pathObject) {
            if (!pathObject || typeof pathObject !== 'object') {
                throw new TypeError('pathObject must be an object');
            }
            const dir = pathObject.dir || pathObject.root || '';
            const base = pathObject.base || `${pathObject.name || ''}${pathObject.ext || ''}`;
            if (!dir) {
                return base;
            }
            return dir.endsWith(separator) ? dir + base : dir + separator + base;
        }

        function parse(path) {
            assertPath(path);
            const isAbs = path.startsWith(separator);
            const dir = dirname(path);
            const base = basename(path);
            const ext = extname(path);
            const name = base.slice(0, base.length - ext.length);
            return {
                root: isAbs ? separator : '',
                dir,
                base,
                ext,
                name,
            };
        }

        function toNamespacedPath(path) {
            assertPath(path);
            return path;
        }

        return {
            sep: separator,
            delimiter: ':',
            resolve,
            normalize,
            isAbsolute,
            join,
            relative,
            basename,
            dirname,
            extname,
            parse,
            format,
            toNamespacedPath,
        };
    }

    function createWin32PathModule() {
        const separator = '\\';

        function splitDevice(path) {
            const replaced = path.replace(/\//g, '\\');
            if (replaced.length === 0) {
                return { device: '', absolute: false, tail: '' };
            }
            if (replaced.startsWith('\\\\')) {
                const segments = replaced.split('\\').filter(Boolean);
                if (segments.length >= 2) {
                    const device = `\\\\${segments[0]}\\${segments[1]}`;
                    const tail = segments.slice(2).join('\\');
                    return { device, absolute: true, tail };
                }
                return { device: replaced, absolute: true, tail: '' };
            }
            const driveMatch = /^[A-Za-z]:/.exec(replaced);
            if (driveMatch) {
                const device = driveMatch[0];
                const rest = replaced.slice(device.length);
                const absolute = rest.startsWith('\\');
                const tail = absolute ? rest.slice(1) : rest;
                return { device, absolute, tail };
            }
            const absolute = replaced.startsWith('\\');
            const tail = absolute ? replaced.slice(1) : replaced;
            return { device: '', absolute, tail };
        }

        function normalizeTail(tail, isAbsolute) {
            const parts = tail.split(/\\+/);
            const filtered = normalizeSegments(parts, !isAbsolute);
            return filtered.join('/');
        }

        function buildResult(device, isAbsolute, tail, trailingSlash) {
            let result = '';
            if (device) {
                result += device;
            }
            if (isAbsolute) {
                result += separator;
            }
            if (tail) {
                if (result && !result.endsWith(separator)) {
                    result += separator;
                }
                result += tail.replace(/\//g, separator);
            }
            if (!tail && trailingSlash && !result.endsWith(separator)) {
                result += separator;
            }
            if (!result) {
                return isAbsolute ? separator : '.';
            }
            return result;
        }

        function normalize(path) {
            assertPath(path);
            const trailingSlash = path.endsWith('/') || path.endsWith('\\');
            const { device, absolute, tail } = splitDevice(path);
            const normalized = normalizeTail(tail, absolute);
            return buildResult(device, absolute, normalized, trailingSlash);
        }

        function resolve(...paths) {
            let device = '';
            let absolute = false;
            let tail = '';
            for (let i = paths.length - 1; i >= 0; i--) {
                let path = paths[i];
                if (path == null) {
                    continue;
                }
                assertPath(path);
                if (path.length === 0) {
                    continue;
                }
                const parsed = splitDevice(path);
                if (!parsed.device && !parsed.absolute) {
                    tail = parsed.tail + (tail ? `/${tail}` : '');
                    continue;
                }
                device = parsed.device;
                absolute = parsed.absolute;
                tail = parsed.tail + (tail ? `/${tail}` : '');
                if (device || absolute) {
                    break;
                }
            }
            if (!device && !absolute) {
                const cwd = getCurrentWorkingDirectory().replace(/\//g, '\\');
                const parsedCwd = splitDevice(cwd);
                device = parsedCwd.device;
                absolute = parsedCwd.absolute;
                tail = parsedCwd.tail + (tail ? `/${tail}` : '');
            }
            const normalizedTail = normalizeTail(tail, absolute);
            return buildResult(device, absolute, normalizedTail, false);
        }

        function isAbsolute(path) {
            assertPath(path);
            const { absolute, device } = splitDevice(path);
            return absolute || !!device;
        }

        function join(...paths) {
            let joined = '';
            for (const path of paths) {
                if (path == null || path.length === 0) {
                    continue;
                }
                assertPath(path);
                if (!joined) {
                    joined = path;
                } else {
                    joined += `${separator}${path}`;
                }
            }
            if (!joined) {
                return '.';
            }
            return normalize(joined);
        }

        function basename(path, ext) {
            assertPath(path);
            if (ext !== undefined) {
                assertPath(ext, 'ext');
            }
            const { tail } = splitDevice(path);
            const parts = tail.split(/\\+/).filter(Boolean);
            if (parts.length === 0) {
                const device = splitDevice(path).device;
                return device || (path.startsWith('\\') ? '\\' : '');
            }
            let base = parts[parts.length - 1];
            if (ext && base.toLowerCase().endsWith(ext.toLowerCase()) && ext.length < base.length) {
                base = base.slice(0, -ext.length);
            }
            return base;
        }

        function dirname(path) {
            assertPath(path);
            const parsed = splitDevice(path);
            const parts = parsed.tail.split(/\\+/).filter(Boolean);
            if (parts.length <= 1) {
                return parsed.device || (parsed.absolute ? separator : '.');
            }
            parts.pop();
            const dir = parts.join(separator);
            if (parsed.device) {
                return `${parsed.device}${parsed.absolute ? separator : ''}${dir}`;
            }
            if (parsed.absolute) {
                return separator + dir;
            }
            return dir;
        }

        function extname(path) {
            assertPath(path);
            const base = basename(path);
            const index = base.lastIndexOf('.');
            if (index <= 0) {
                return '';
            }
            return base.slice(index);
        }

        function relative(from, to) {
            assertPath(from, 'from');
            assertPath(to, 'to');
            if (from === to) {
                return '';
            }
            const resolvedFrom = resolve(from);
            const resolvedTo = resolve(to);
            if (resolvedFrom === resolvedTo) {
                return '';
            }
            const fromParts = resolvedFrom.split(/\\+/).filter(Boolean);
            const toParts = resolvedTo.split(/\\+/).filter(Boolean);
            let length = Math.min(fromParts.length, toParts.length);
            let same = length;
            for (let i = 0; i < length; i++) {
                if (fromParts[i].toLowerCase() !== toParts[i].toLowerCase()) {
                    same = i;
                    break;
                }
            }
            const up = fromParts.slice(same).map(() => '..');
            const down = toParts.slice(same);
            const result = up.concat(down).join(separator);
            return result || '.';
        }

        function format(pathObject) {
            if (!pathObject || typeof pathObject !== 'object') {
                throw new TypeError('pathObject must be an object');
            }
            const dir = pathObject.dir || '';
            const root = pathObject.root || '';
            const base = pathObject.base || `${pathObject.name || ''}${pathObject.ext || ''}`;
            const dirPath = dir || root;
            if (!dirPath) {
                return base;
            }
            const separatorChar = dirPath.endsWith(separator) ? '' : separator;
            return `${dirPath}${separatorChar}${base}`;
        }

        function parse(path) {
            assertPath(path);
            const parsed = splitDevice(path);
            const dir = dirname(path);
            const base = basename(path);
            const ext = extname(path);
            const name = base.slice(0, base.length - ext.length);
            return {
                root: parsed.device ? `${parsed.device}${parsed.absolute ? separator : ''}` : (parsed.absolute ? separator : ''),
                dir,
                base,
                ext,
                name,
            };
        }

        function toNamespacedPath(path) {
            assertPath(path);
            if (path.length === 0) {
                return '';
            }
            const resolved = resolve(path);
            if (resolved.startsWith('\\\\?\\')) {
                return resolved;
            }
            if (resolved.startsWith('\\\\')) {
                return `\\\\?\${resolved.slice(2)}`;
            }
            return resolved;
        }

        return {
            sep: separator,
            delimiter: ';',
            resolve,
            normalize,
            isAbsolute,
            join,
            relative,
            basename,
            dirname,
            extname,
            parse,
            format,
            toNamespacedPath,
        };
    }

    defineNodeModule(['path', 'node:path'], (module, exports) => {
        const posix = createPosixPathModule();
        const win32 = createWin32PathModule();
        const osInfo = globalThis.__nodeOsInfo || {};
        const active = osInfo.windows ? win32 : posix;
        module.exports = {
            ...active,
            posix,
            win32,
        };
    });

    defineNodeModule(['path/posix'], (module) => {
        module.exports = createPosixPathModule();
    });

    defineNodeModule(['path/win32'], (module) => {
        module.exports = createWin32PathModule();
    });

    defineNodeModule(['os', 'node:os'], (module) => {
        const source = globalThis.__nodeOsInfo || {};
        const osModule = {
            ...source,
            cpus: source.cpus || (() => []),
            networkInterfaces: source.networkInterfaces || (() => ({})),
            uptime: source.uptime || (() => 0),
            totalmem: source.totalmem || (() => 0),
            freemem: source.freemem || (() => 0),
            endianness: source.endianness || (() => 'LE'),
            tmpdir: source.tmpdir || (() => ''),
            homedir: source.homedir || (() => ''),
            hostname: source.hostname || (() => 'localhost'),
            release: source.release || (() => ''),
            type: source.type || (() => 'unknown'),
            platform: source.platform || 'unknown',
            arch: source.arch || 'unknown',
            constants: source.constants || {},
            EOL: source.EOL || '\n',
            userInfo: source.userInfo || (() => ({ username: '', homedir: '', shell: '' })),
            loadavg: source.loadavg || (() => [0, 0, 0]),
        };
        module.exports = osModule;
    });

    const kFsErrorMessage = 'Native fs bindings are unavailable: ensure runtime initialized them';

    function ensureNativeFs() {
        const native = globalThis.__nodeFsNative;
        if (!native) {
            throw new Error(kFsErrorMessage);
        }
        return native;
    }

    function toBuffer(data, encoding, BufferClass) {
        if (BufferClass.isBuffer && BufferClass.isBuffer(data)) {
            return data;
        }
        if (data instanceof Uint8Array) {
            return BufferClass.from(data);
        }
        if (typeof data === 'string') {
            return BufferClass.from(data, encoding || 'utf8');
        }
        throw new TypeError('Data must be a string, Buffer, or Uint8Array');
    }

    function normalizeFileEncoding(options, defaultEncoding) {
        let encoding = defaultEncoding || null;
        let mode = 0o666;
        let flag = 'r';
        if (typeof options === 'string') {
            encoding = normalizeEncodingValue(options, encoding);
        } else if (options && typeof options === 'object') {
            if (options.encoding != null) {
                encoding = normalizeEncodingValue(options.encoding, encoding);
            }
            if (options.mode != null) {
                mode = options.mode;
            }
            if (options.flag != null) {
                flag = options.flag;
            }
        }
        return { encoding, mode, flag };
    }

    function createAsyncAdapter(syncFn) {
        return (...args) => {
            const callback = args.pop();
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    const result = syncFn(...args);
                    callback(null, result);
                } catch (error) {
                    callback(error);
                }
            });
        };
    }

    function promiseFromCallback(fn, args) {
        return new Promise((resolve, reject) => {
            fn(...args, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    defineNodeModule(['fs', 'node:fs'], (module, exports, require) => {
        const native = ensureNativeFs();
        const { Buffer: BufferClass } = require('buffer');
        const pathModule = require('path');

        function readFileSync(pathLike, options) {
            const { encoding } = normalizeFileEncoding(options, null);
            const encodingToUse = encoding === 'utf8' ? 'utf8' : 'base64';
            const result = native.readFile(String(pathLike), encodingToUse);
            if (encoding === 'utf8') {
                return result;
            }
            const buffer = BufferClass.from(result, 'base64');
            if (!encoding) {
                return buffer;
            }
            return buffer.toString(encoding);
        }

        function readFile(pathLike, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            const opts = options;
            scheduleMicrotask(() => {
                try {
                    const result = readFileSync(pathLike, opts);
                    callback(null, result);
                } catch (error) {
                    callback(error);
                }
            });
        }

        function writeFileSync(pathLike, data, options) {
            const isBinaryInput = (BufferClass.isBuffer && BufferClass.isBuffer(data)) || data instanceof Uint8Array;
            const { encoding } = normalizeFileEncoding(options, isBinaryInput ? null : 'utf8');
            const buffer = toBuffer(data, encoding, BufferClass);
            const encodingToUse = !encoding ? 'base64' : (encoding === 'utf8' ? 'utf8' : 'base64');
            const payload = encodingToUse === 'utf8'
                ? buffer.toString('utf8')
                : buffer.toString('base64');
            const append = options && typeof options === 'object' && options.flag && String(options.flag).startsWith('a');
            const nativeOptions = { encoding: encodingToUse };
            if (append) {
                nativeOptions.append = true;
            }
            native.writeFile(String(pathLike), payload, nativeOptions);
        }

        function writeFile(pathLike, data, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    writeFileSync(pathLike, data, options);
                    callback(null);
                } catch (error) {
                    callback(error);
                }
            });
        }

        function existsSync(pathLike) {
            return !!native.exists(String(pathLike));
        }

        function statSync(pathLike, options) {
            const stat = native.stat(String(pathLike), { followSymbolicLinks: true });
            if (options && options.throwIfNoEntry === false && !stat.exists) {
                return undefined;
            }
            return stat;
        }

        function lstatSync(pathLike, options) {
            const stat = native.lstat(String(pathLike));
            if (options && options.throwIfNoEntry === false && !stat.exists) {
                return undefined;
            }
            return stat;
        }

        function readdirSync(pathLike, options) {
            const { encoding } = normalizeFileEncoding(options, 'utf8');
            const entries = native.readdir(String(pathLike));
            if (encoding && encoding !== 'utf8') {
                return entries.map((item) => BufferClass.from(item, 'utf8').toString(encoding));
            }
            return entries;
        }

        function mkdirSync(pathLike, options) {
            const opts = {};
            if (options && typeof options === 'object') {
                if (options.recursive) {
                    opts.recursive = true;
                }
            }
            native.mkdir(String(pathLike), opts);
        }

        function rmSync(pathLike, options) {
            const opts = {};
            if (options && typeof options === 'object') {
                if (options.recursive) {
                    opts.recursive = true;
                }
                if (options.force) {
                    opts.force = true;
                }
            }
            native.rm(String(pathLike), opts);
        }

        function realpathSync(pathLike) {
            return native.realpath(String(pathLike));
        }

        function mkdir(pathLike, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    mkdirSync(pathLike, options);
                    callback(null);
                } catch (error) {
                    callback(error);
                }
            });
        }

        function rm(pathLike, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    rmSync(pathLike, options);
                    callback(null);
                } catch (error) {
                    callback(error);
                }
            });
        }

        function readdir(pathLike, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    const result = readdirSync(pathLike, options);
                    callback(null, result);
                } catch (error) {
                    callback(error);
                }
            });
        }

        function stat(pathLike, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    const result = statSync(pathLike, options);
                    callback(null, result);
                } catch (error) {
                    callback(error);
                }
            });
        }

        function lstat(pathLike, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must be a function');
            }
            scheduleMicrotask(() => {
                try {
                    const result = lstatSync(pathLike, options);
                    callback(null, result);
                } catch (error) {
                    callback(error);
                }
            });
        }

        const promises = {
            readFile: (...args) => promiseFromCallback(readFile, args),
            writeFile: (...args) => promiseFromCallback(writeFile, args),
            mkdir: (...args) => promiseFromCallback(mkdir, args),
            rm: (...args) => promiseFromCallback(rm, args),
            readdir: (...args) => promiseFromCallback(readdir, args),
            stat: (...args) => promiseFromCallback(stat, args),
            lstat: (...args) => promiseFromCallback(lstat, args),
            realpath: (pathLike) => Promise.resolve().then(() => realpathSync(pathLike)),
            exists: (pathLike) => Promise.resolve().then(() => existsSync(pathLike)),
        };

        function createReadStream(pathLike, options = {}) {
            const { Readable } = require('stream');
            const encoding = options.encoding ? normalizeEncodingValue(options.encoding, 'utf8') : null;
            const readable = new Readable({ read() {} });
            scheduleMicrotask(() => {
                try {
                    const content = readFileSync(pathLike, encoding || undefined);
                    if (encoding) {
                        readable.push(content, encoding);
                    } else {
                        readable.push(content);
                    }
                    readable.push(null);
                } catch (error) {
                    readable.destroy(error);
                }
            });
            return readable;
        }

        function createWriteStream(pathLike, options = {}) {
            const { Writable } = require('stream');
            const encoding = options.encoding ? normalizeEncodingValue(options.encoding, 'utf8') : 'utf8';
            let append = false;
            if (options.flags && options.flags.startsWith('a')) {
                append = true;
            }
            const writable = new Writable({
                write(chunk, enc, callback) {
                    try {
                        const resolvedEncoding = typeof chunk === 'string' ? (encoding || enc || 'utf8') : undefined;
                        writeFileSync(pathLike, chunk, { encoding: resolvedEncoding, flag: append ? 'a' : 'w', append: append });
                        append = true;
                        callback();
                    } catch (error) {
                        callback(error);
                    }
                },
            });
            return writable;
        }

        const fsModule = {
            readFileSync,
            readFile,
            writeFileSync,
            writeFile,
            existsSync,
            statSync,
            lstatSync,
            readdirSync,
            readdir,
            mkdirSync,
            mkdir,
            rmSync,
            rm,
            realpathSync,
            stat,
            lstat,
            promises,
            createReadStream,
            createWriteStream,
            constants: {
                F_OK: 0,
                R_OK: 4,
                W_OK: 2,
                X_OK: 1,
            },
        };

        module.exports = fsModule;
    });

    defineNodeModule(['fs/promises', 'node:fs/promises'], (module, exports, require) => {
        const fs = require('fs');
        module.exports = fs.promises;
    });

    function createEventEmitter() {
        return class EventEmitter {
            constructor() {
                this._events = Object.create(null);
            }

            on(event, listener) {
                if (typeof listener !== 'function') {
                    throw new TypeError('Listener must be a function');
                }
                const list = this._events[event] || (this._events[event] = []);
                list.push(listener);
                return this;
            }

            once(event, listener) {
                const wrapped = (...args) => {
                    this.off(event, wrapped);
                    listener.apply(this, args);
                };
                wrapped.__originalListener = listener;
                return this.on(event, wrapped);
            }

            off(event, listener) {
                const list = this._events[event];
                if (!list) {
                    return this;
                }
                this._events[event] = list.filter((item) => item !== listener && item.__originalListener !== listener);
                return this;
            }

            emit(event, ...args) {
                const list = this._events[event];
                if (!list || list.length === 0) {
                    return false;
                }
                for (const listener of list.slice()) {
                    try {
                        listener.apply(this, args);
                    } catch (error) {
                        scheduleMicrotask(() => { throw error; });
                    }
                }
                return true;
            }

            removeListener(event, listener) {
                return this.off(event, listener);
            }

            removeAllListeners(event) {
                if (event === undefined) {
                    this._events = Object.create(null);
                } else {
                    delete this._events[event];
                }
                return this;
            }
        };
    }

    const BaseEventEmitter = createEventEmitter();

    defineNodeModule(['stream', 'node:stream'], (module, exports, require) => {
        const { Buffer: BufferClass } = require('buffer');

        class Stream extends BaseEventEmitter {
            pipe(destination, options = {}) {
                this.on('data', (chunk) => {
                    const writable = destination.write(chunk);
                    if (writable === false) {
                        this.pause?.();
                    }
                });
                this.once('end', () => {
                    if (options.end !== false) {
                        destination.end();
                    }
                });
                this.once('error', (error) => destination.emit('error', error));
                destination.emit('pipe', this);
                return destination;
            }
        }

        class Readable extends Stream {
            constructor(options = {}) {
                super();
                this.readableHighWaterMark = options.highWaterMark || 16384;
                this.readable = true;
                this.readableEnded = false;
                this._encoding = null;
                this._objectMode = !!options.objectMode;
                this._buffer = [];
                this._read = options.read || null;
            }

            setEncoding(encoding) {
                this._encoding = normalizeEncodingValue(encoding, 'utf8');
                return this;
            }

            push(chunk, encoding) {
                if (chunk === null) {
                    if (!this.readableEnded) {
                        this.readableEnded = true;
                        this.emit('end');
                        this.emit('close');
                    }
                    return false;
                }
                if (!this._objectMode) {
                    if (typeof chunk === 'string') {
                        const enc = encoding ? normalizeEncodingValue(encoding, 'utf8') : 'utf8';
                        chunk = BufferClass.from(chunk, enc);
                        if (this._encoding) {
                            chunk = chunk.toString(this._encoding);
                        }
                    } else if (BufferClass.isBuffer && !BufferClass.isBuffer(chunk)) {
                        chunk = BufferClass.from(chunk);
                    }
                    if (this._encoding && BufferClass.isBuffer && BufferClass.isBuffer(chunk)) {
                        chunk = chunk.toString(this._encoding);
                    }
                }
                this._buffer.push(chunk);
                this.emit('data', chunk);
                return this._buffer.length < this.readableHighWaterMark;
            }

            read() {
                if (this._buffer.length === 0) {
                    this._read?.(this.readableHighWaterMark);
                    return null;
                }
                return this._buffer.shift();
            }

            resume() {
                this.emit('resume');
                this._read?.(this.readableHighWaterMark);
                return this;
            }

            pause() {
                this.emit('pause');
                return this;
            }

            destroy(error) {
                if (error) {
                    this.emit('error', error);
                }
                if (!this.readable) {
                    return this;
                }
                this.emit('close');
                this.readable = false;
                this._buffer.length = 0;
                return this;
            }
        }

        Readable.prototype[Symbol.asyncIterator] = function() {
            const source = this;
            return {
                async next() {
                    const immediate = source.read();
                    if (immediate !== null && immediate !== undefined) {
                        return { value: immediate, done: false };
                    }
                    return new Promise((resolve, reject) => {
                        let settled = false;
                        const onData = (chunk) => {
                            if (settled) {
                                return;
                            }
                            settled = true;
                            cleanup();
                            resolve({ value: chunk, done: false });
                        };
                        const onEnd = () => {
                            if (settled) {
                                return;
                            }
                            settled = true;
                            cleanup();
                            resolve({ value: undefined, done: true });
                        };
                        const onError = (error) => {
                            if (settled) {
                                return;
                            }
                            settled = true;
                            cleanup();
                            reject(error);
                        };
                        const cleanup = () => {
                            source.off('data', onData);
                            source.off('end', onEnd);
                            source.off('error', onError);
                        };

                        source.on('data', onData);
                        source.once('end', onEnd);
                        source.once('error', onError);

                        if (typeof source._read === 'function') {
                            try {
                                source._read(source.readableHighWaterMark);
                            } catch (error) {
                                onError(error);
                            }
                        }
                    });
                },
                return() {
                    source.destroy();
                    return Promise.resolve({ value: undefined, done: true });
                },
            };
        };

        Readable.from = function(iterable, options = {}) {
            if (iterable == null) {
                throw new TypeError('Readable.from requires an iterable source');
            }

            const asyncIterator = typeof iterable[Symbol.asyncIterator] === 'function'
                ? iterable[Symbol.asyncIterator]()
                : null;
            const iterator = asyncIterator || (typeof iterable[Symbol.iterator] === 'function'
                ? iterable[Symbol.iterator]()
                : null);

            if (!iterator || typeof iterator.next !== 'function') {
                throw new TypeError('Source is not iterable');
            }

            const readable = new Readable(options);
            let pulling = false;
            let done = false;

            const pull = async () => {
                if (pulling || done) {
                    return;
                }
                pulling = true;
                try {
                    while (true) {
                        const step = await Promise.resolve(iterator.next());
                        if (!step || step.done) {
                            done = true;
                            readable.push(null);
                            break;
                        }
                        readable.push(step.value);
                    }
                } catch (error) {
                    done = true;
                    readable.destroy(error);
                } finally {
                    pulling = false;
                }
            };

            readable._read = () => {
                pull();
            };

            scheduleMicrotask(pull);
            return readable;
        };

        class Writable extends Stream {
            constructor(options = {}) {
                super();
                this._initWritable(options);
            }

            _initWritable(options = {}) {
                this.writable = true;
                this.writableFinished = false;
                this._writeImpl = options.write || null;
                this._objectModeWritable = !!options.objectMode;
            }

            write(chunk, encoding, callback) {
                let cb = callback;
                let data = chunk;
                let enc = encoding;
                if (typeof encoding === 'function') {
                    cb = encoding;
                    enc = undefined;
                }
                if (!this._objectModeWritable && typeof data === 'string' && enc) {
                    data = BufferClass.from(data, normalizeEncodingValue(enc, 'utf8'));
                }
                try {
                    if (this._writeImpl) {
                        this._writeImpl(data, enc || 'utf8', cb || (() => {}));
                    } else {
                        this.emit('data', data);
                        cb?.();
                    }
                } catch (error) {
                    this.emit('error', error);
                    cb?.(error);
                    return false;
                }
                return true;
            }

            end(chunk, encoding, callback) {
                if (typeof chunk === 'function') {
                    callback = chunk;
                    chunk = undefined;
                }
                if (chunk !== undefined) {
                    this.write(chunk, encoding);
                }
                this.writableFinished = true;
                this.emit('finish');
                callback?.();
                this.emit('close');
                return this;
            }

            destroy(error) {
                if (error) {
                    this.emit('error', error);
                }
                if (!this.writable) {
                    return this;
                }
                this.emit('close');
                this.writable = false;
                return this;
            }
        }

        class Duplex extends Readable {
            constructor(options = {}) {
                super(options);
                Writable.prototype._initWritable.call(this, options);
            }

            write(chunk, encoding, callback) {
                return Writable.prototype.write.call(this, chunk, encoding, callback);
            }

            end(chunk, encoding, callback) {
                return Writable.prototype.end.call(this, chunk, encoding, callback);
            }

            destroy(error) {
                Readable.prototype.destroy.call(this, error);
                return Writable.prototype.destroy.call(this, error);
            }
        }

        class Transform extends Duplex {
            constructor(options = {}) {
                super(options);
                this._transform = options.transform || this._transform;
            }

            _transform(chunk, encoding, callback) {
                callback(null, chunk);
            }

            write(chunk, encoding, callback) {
                const cb = typeof encoding === 'function' ? encoding : callback;
                const enc = typeof encoding === 'function' ? undefined : encoding;
                this._transform(chunk, enc || 'utf8', (error, transformed) => {
                    if (error) {
                        this.emit('error', error);
                        cb?.(error);
                        return;
                    }
                    if (transformed !== undefined && transformed !== null) {
                        this.push(transformed);
                    }
                    cb?.();
                });
                return true;
            }
        }

        class PassThrough extends Transform {
            constructor(options = {}) {
                super(options);
                this._transform = (chunk, encoding, callback) => {
                    callback(null, chunk);
                };
            }
        }

        function finished(stream, callback) {
            const done = (error) => {
                cleanup();
                callback(error);
            };
            const onFinish = () => done();
            const onError = (error) => done(error);
            const onClose = () => done();

            function cleanup() {
                stream.off('finish', onFinish);
                stream.off('error', onError);
                stream.off('close', onClose);
            }

            stream.on('finish', onFinish);
            stream.on('error', onError);
            stream.on('close', onClose);
        }

        function pipeline(...args) {
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
            const streams = args;
            for (let i = 0; i < streams.length - 1; i++) {
                streams[i].pipe(streams[i + 1]);
            }
            const last = streams[streams.length - 1];
            finished(last, (error) => callback(error));
        }

        const promises = {
            finished: (stream) => new Promise((resolve, reject) => {
                finished(stream, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            }),
            pipeline: (...streams) => new Promise((resolve, reject) => {
                pipeline(...streams, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            }),
        };

        module.exports = {
            Stream,
            Readable,
            Writable,
            Duplex,
            Transform,
            PassThrough,
            finished,
            pipeline,
            promises,
        };
    });

    defineNodeModule(['stream/promises', 'node:stream/promises'], (module, exports, require) => {
        const streamModule = require('stream');
        module.exports = streamModule.promises;
    });


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
    const textEncoder = (typeof TextEncoder === 'function') ? new TextEncoder() : null;

    function encodeUtf8String(value) {
        if (!value || typeof value !== 'string') {
            return new Uint8Array(0);
        }
        if (textEncoder) {
            return textEncoder.encode(value);
        }
        const encoded = unescape(encodeURIComponent(value));
        const result = new Uint8Array(encoded.length);
        for (let i = 0; i < encoded.length; i++) {
            result[i] = encoded.charCodeAt(i) & 0xff;
        }
        return result;
    }

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

    function encodeUint8ArrayToBase64(bytes) {
        if (!bytes || bytes.length === 0) {
            return '';
        }
        let result = '';
        let i = 0;
        while (i + 2 < bytes.length) {
            const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
            result += BASE64_TABLE[(triple >> 18) & 0x3f];
            result += BASE64_TABLE[(triple >> 12) & 0x3f];
            result += BASE64_TABLE[(triple >> 6) & 0x3f];
            result += BASE64_TABLE[triple & 0x3f];
            i += 3;
        }
        if (i < bytes.length) {
            const remaining = bytes.length - i;
            let triple = bytes[i] << 16;
            if (remaining === 2) {
                triple |= bytes[i + 1] << 8;
            }
            result += BASE64_TABLE[(triple >> 18) & 0x3f];
            result += BASE64_TABLE[(triple >> 12) & 0x3f];
            result += remaining === 2 ? BASE64_TABLE[(triple >> 6) & 0x3f] : '=';
            result += '=';
        }
        return result;
    }

    defineNodeModule(['buffer', 'node:buffer'], (module, exports, require) => {
        function decodeHexString(input) {
            if (!input || typeof input !== 'string') {
                return new Uint8Array(0);
            }
            const clean = input.length % 2 === 0 ? input : '0' + input;
            const length = Math.floor(clean.length / 2);
            const result = new Uint8Array(length);
            for (let i = 0; i < length; i++) {
                const byte = parseInt(clean.substr(i * 2, 2), 16);
                result[i] = Number.isFinite(byte) ? (byte & 0xff) : 0;
            }
            return result;
        }

        function encodeHexString(bytes) {
            if (!bytes || bytes.length === 0) {
                return '';
            }
            let result = '';
            for (let i = 0; i < bytes.length; i++) {
                const value = bytes[i] & 0xff;
                const hex = value.toString(16).padStart(2, '0');
                result += hex;
            }
            return result;
        }

        function encodeLatin1String(value) {
            const result = new Uint8Array(value.length);
            for (let i = 0; i < value.length; i++) {
                result[i] = value.charCodeAt(i) & 0xff;
            }
            return result;
        }

        function toSize(value) {
            const number = Number(value);
            if (!Number.isFinite(number) || number < 0) {
                throw new RangeError('The value "size" is invalid');
            }
            return Math.min(number, 0x7fffffff) >>> 0;
        }

        class BufferPolyfill extends Uint8Array {
            constructor(value, encoding) {
                if (typeof value === 'number') {
                    super(toSize(value));
                    return;
                }
                const bytes = BufferPolyfill._toUint8Array(value, encoding);
                super(bytes.length);
                this.set(bytes, 0);
            }

            static _toUint8Array(value, encoding) {
                if (value instanceof BufferPolyfill) {
                    return new Uint8Array(value);
                }
                if (value instanceof Uint8Array) {
                    return new Uint8Array(value);
                }
                if (ArrayBuffer.isView(value)) {
                    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                    const copy = new Uint8Array(view.length);
                    copy.set(view);
                    return copy;
                }
                if (value instanceof ArrayBuffer) {
                    const view = new Uint8Array(value);
                    const copy = new Uint8Array(view.length);
                    copy.set(view);
                    return copy;
                }
                if (Array.isArray(value)) {
                    return Uint8Array.from(value);
                }
                if (typeof value === 'string') {
                    const normalized = normalizeEncodingValue(encoding, 'utf8');
                    if (normalized === 'base64') {
                        return decodeBase64ToUint8Array(value);
                    }
                    if (normalized === 'hex') {
                        return decodeHexString(value);
                    }
                    if (normalized === 'latin1') {
                        return encodeLatin1String(value);
                    }
                    return encodeUtf8String(value);
                }
                if (value == null) {
                    return new Uint8Array(0);
                }
                throw new TypeError('Unsupported Buffer input type');
            }

            static from(value, encoding) {
                if (typeof value === 'number') {
                    throw new TypeError('The "value" argument must not be of type number');
                }
                return new BufferPolyfill(value, encoding);
            }

            static alloc(size, fill, encoding) {
                const buffer = new BufferPolyfill(toSize(size));
                if (fill !== undefined) {
                    buffer.fill(fill, 0, buffer.length, encoding);
                }
                return buffer;
            }

            static allocUnsafe(size) {
                return new BufferPolyfill(toSize(size));
            }

            static isBuffer(value) {
                return value instanceof BufferPolyfill;
            }

            static byteLength(value, encoding) {
                if (BufferPolyfill.isBuffer(value) || value instanceof Uint8Array) {
                    return value.length;
                }
                return BufferPolyfill._toUint8Array(value, encoding).length;
            }

            static concat(list, totalLength) {
                if (!Array.isArray(list)) {
                    throw new TypeError('List must be an array of Buffers');
                }
                if (list.length === 0) {
                    return BufferPolyfill.alloc(0);
                }
                let length = 0;
                if (typeof totalLength === 'number') {
                    length = toSize(totalLength);
                } else {
                    for (const item of list) {
                        length += BufferPolyfill.byteLength(item);
                    }
                }
                const buffer = BufferPolyfill.alloc(length);
                let offset = 0;
                for (const item of list) {
                    const bytes = BufferPolyfill._toUint8Array(item);
                    buffer.set(bytes, offset);
                    offset += bytes.length;
                }
                return buffer;
            }

            static compare(a, b) {
                if (!BufferPolyfill.isBuffer(a) || !BufferPolyfill.isBuffer(b)) {
                    throw new TypeError('Arguments must be Buffers');
                }
                if (a === b) {
                    return 0;
                }
                const length = Math.min(a.length, b.length);
                for (let i = 0; i < length; i++) {
                    if (a[i] !== b[i]) {
                        return a[i] < b[i] ? -1 : 1;
                    }
                }
                if (a.length === b.length) {
                    return 0;
                }
                return a.length < b.length ? -1 : 1;
            }

            toString(encoding, start, end) {
                const normalized = normalizeEncodingValue(encoding, 'utf8');
                const sliceStart = start === undefined ? 0 : Math.max(0, start | 0);
                const sliceEnd = end === undefined ? this.length : Math.min(this.length, end | 0);
                const segment = this.subarray(sliceStart, sliceEnd);
                if (normalized === 'base64') {
                    return encodeUint8ArrayToBase64(segment);
                }
                if (normalized === 'hex') {
                    return encodeHexString(segment);
                }
                if (normalized === 'latin1') {
                    let out = '';
                    for (let i = 0; i < segment.length; i++) {
                        out += String.fromCharCode(segment[i]);
                    }
                    return out;
                }
                return decodeUtf8(segment);
            }

            equals(other) {
                if (!BufferPolyfill.isBuffer(other)) {
                    return false;
                }
                if (other.length !== this.length) {
                    return false;
                }
                for (let i = 0; i < this.length; i++) {
                    if (this[i] !== other[i]) {
                        return false;
                    }
                }
                return true;
            }

            fill(value, start, end, encoding) {
                const length = this.length;
                let startIndex = start === undefined ? 0 : Math.max(0, start | 0);
                let endIndex = end === undefined ? length : Math.min(length, end | 0);
                if (startIndex >= endIndex) {
                    return this;
                }
                if (typeof value === 'string') {
                    const bytes = BufferPolyfill._toUint8Array(value, encoding);
                    if (bytes.length === 0) {
                        return this;
                    }
                    for (let i = startIndex; i < endIndex; i++) {
                        this[i] = bytes[(i - startIndex) % bytes.length];
                    }
                    return this;
                }
                const numeric = Number(value) & 0xff;
                for (let i = startIndex; i < endIndex; i++) {
                    this[i] = numeric;
                }
                return this;
            }

            write(string, offset, length, encoding) {
                const start = offset === undefined ? 0 : offset | 0;
                const remaining = this.length - start;
                const bytes = BufferPolyfill._toUint8Array(string, encoding);
                const writeLength = length === undefined
                    ? Math.min(bytes.length, remaining)
                    : Math.min(length | 0, remaining, bytes.length);
                for (let i = 0; i < writeLength; i++) {
                    this[start + i] = bytes[i];
                }
                return writeLength;
            }

            slice(start, end) {
                return this.subarray(start, end);
            }

            toJSON() {
                return {
                    type: 'Buffer',
                    data: Array.from(this)
                };
            }

            subarray(start, end) {
                const view = super.subarray(start, end);
                Object.setPrototypeOf(view, BufferPolyfill.prototype);
                return view;
            }
        }

        Object.defineProperty(BufferPolyfill.prototype, Symbol.toStringTag, {
            value: 'Buffer'
        });

        module.exports = BufferPolyfill;
        module.exports.Buffer = BufferPolyfill;
        module.exports.SlowBuffer = BufferPolyfill;
        module.exports.kMaxLength = 0x7fffffff;
        module.exports.kStringMaxLength = 0x7fffffff;
        module.exports.INSPECT_MAX_BYTES = 50;
        module.exports.constants = {
            MAX_LENGTH: 0x7fffffff,
            MAX_STRING_LENGTH: 0x7fffffff
        };
        module.exports.__esModule = true;

        if (typeof globalThis.Buffer !== 'function') {
            globalThis.Buffer = BufferPolyfill;
        }
    });

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
