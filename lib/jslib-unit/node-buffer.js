// Buffer shim for esbuild alias resolution inside the Hermes runtime
// Exports the runtime-provided Buffer polyfill (installed via __registerNodeModule)

function resolveBufferModule() {
	if (typeof globalThis.require === 'function') {
		try {
			return globalThis.require('buffer');
		} catch (error) {
			// Ignore resolution errors and fall back to global Buffer if available
		}
	}

	if (typeof globalThis.Buffer === 'function') {
		return {
			Buffer: globalThis.Buffer,
			SlowBuffer: globalThis.Buffer,
			kMaxLength: globalThis.Buffer.kMaxLength || 0x7fffffff,
			kStringMaxLength: globalThis.Buffer.kStringMaxLength || 0x7fffffff,
			INSPECT_MAX_BYTES: globalThis.Buffer.INSPECT_MAX_BYTES || 50,
			constants: globalThis.Buffer.constants || {
				MAX_LENGTH: 0x7fffffff,
				MAX_STRING_LENGTH: 0x7fffffff,
			},
		};
	}

	throw new Error('Buffer module is not available in this runtime');
}

const bufferModule = resolveBufferModule();
const Buffer = bufferModule.Buffer || bufferModule;

export default Buffer;
export { Buffer };
export const SlowBuffer = bufferModule.SlowBuffer || Buffer;
export const kMaxLength = bufferModule.kMaxLength || 0x7fffffff;
export const kStringMaxLength = bufferModule.kStringMaxLength || 0x7fffffff;
export const INSPECT_MAX_BYTES = bufferModule.INSPECT_MAX_BYTES || 50;
export const constants = bufferModule.constants || {
	MAX_LENGTH: 0x7fffffff,
	MAX_STRING_LENGTH: 0x7fffffff,
};
