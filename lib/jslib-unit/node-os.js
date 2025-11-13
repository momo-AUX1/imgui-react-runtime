import { requireNodeModule } from './node-bridge.js';

const osModule = requireNodeModule('os');

export default osModule;
export const {
  platform,
  arch,
  release,
  type,
  homedir,
  tmpdir,
  hostname,
  userInfo,
  loadavg,
  totalmem,
  freemem,
  uptime,
  endianness,
  constants,
  EOL,
} = osModule;

export const cpus = osModule.cpus;
export const networkInterfaces = osModule.networkInterfaces;
