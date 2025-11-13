import { requireNodeModule } from './node-bridge.js';

const fs = requireNodeModule('fs');

function bind(method) {
  return typeof method === 'function' ? method.bind(fs) : undefined;
}

export default fs;
export const promises = fs.promises;
export const constants = fs.constants;
export const readFile = bind(fs.readFile);
export const readFileSync = bind(fs.readFileSync);
export const writeFile = bind(fs.writeFile);
export const writeFileSync = bind(fs.writeFileSync);
export const existsSync = bind(fs.existsSync);
export const stat = bind(fs.stat);
export const statSync = bind(fs.statSync);
export const lstat = bind(fs.lstat);
export const lstatSync = bind(fs.lstatSync);
export const readdir = bind(fs.readdir);
export const readdirSync = bind(fs.readdirSync);
export const mkdir = bind(fs.mkdir);
export const mkdirSync = bind(fs.mkdirSync);
export const rm = bind(fs.rm);
export const rmSync = bind(fs.rmSync);
export const realpathSync = bind(fs.realpathSync);
export const createReadStream = bind(fs.createReadStream);
export const createWriteStream = bind(fs.createWriteStream);
