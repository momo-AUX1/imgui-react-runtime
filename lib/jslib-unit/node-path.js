import { requireNodeModule } from './node-bridge.js';

const pathModule = requireNodeModule('path');

export default pathModule;
export const posix = pathModule.posix;
export const win32 = pathModule.win32;
export const resolve = pathModule.resolve;
export const normalize = pathModule.normalize;
export const isAbsolute = pathModule.isAbsolute;
export const join = pathModule.join;
export const relative = pathModule.relative;
export const dirname = pathModule.dirname;
export const basename = pathModule.basename;
export const extname = pathModule.extname;
export const parse = pathModule.parse;
export const format = pathModule.format;
export const toNamespacedPath = pathModule.toNamespacedPath;
export const sep = pathModule.sep;
export const delimiter = pathModule.delimiter;
