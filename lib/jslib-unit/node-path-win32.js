import { requireNodeModule } from './node-bridge.js';

const pathWin32 = requireNodeModule('path/win32');

export default pathWin32;
export const resolve = pathWin32.resolve;
export const normalize = pathWin32.normalize;
export const isAbsolute = pathWin32.isAbsolute;
export const join = pathWin32.join;
export const relative = pathWin32.relative;
export const dirname = pathWin32.dirname;
export const basename = pathWin32.basename;
export const extname = pathWin32.extname;
export const parse = pathWin32.parse;
export const format = pathWin32.format;
export const toNamespacedPath = pathWin32.toNamespacedPath;
export const sep = pathWin32.sep;
export const delimiter = pathWin32.delimiter;
