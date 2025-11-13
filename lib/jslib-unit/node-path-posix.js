import { requireNodeModule } from './node-bridge.js';

const pathPosix = requireNodeModule('path/posix');

export default pathPosix;
export const resolve = pathPosix.resolve;
export const normalize = pathPosix.normalize;
export const isAbsolute = pathPosix.isAbsolute;
export const join = pathPosix.join;
export const relative = pathPosix.relative;
export const dirname = pathPosix.dirname;
export const basename = pathPosix.basename;
export const extname = pathPosix.extname;
export const parse = pathPosix.parse;
export const format = pathPosix.format;
export const toNamespacedPath = pathPosix.toNamespacedPath;
export const sep = pathPosix.sep;
export const delimiter = pathPosix.delimiter;
