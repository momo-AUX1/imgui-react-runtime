import { requireNodeModule } from './node-bridge.js';

const fsPromises = requireNodeModule('fs/promises');

export default fsPromises;
export const {
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  stat,
  lstat,
  realpath,
  exists,
} = fsPromises;
