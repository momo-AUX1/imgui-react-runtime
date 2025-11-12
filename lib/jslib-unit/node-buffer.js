// Buffer module bridge for bundler imports
// Resolves the Buffer polyfill installed in the Hermes runtime.

function resolveBuffer() {
    if (typeof globalThis.require === 'function') {
        try {
            const mod = globalThis.require('buffer');
            if (mod && typeof mod.Buffer === 'function') {
                return mod.Buffer;
            }
            if (typeof mod === 'function') {
                return mod;
            }
        } catch (error) {
            // fall through to global lookup
        }
    }
    if (typeof globalThis.Buffer === 'function') {
        return globalThis.Buffer;
    }
    throw new Error('Buffer polyfill is not installed');
}

const RuntimeBuffer = resolveBuffer();

export const Buffer = RuntimeBuffer;
export default RuntimeBuffer;
