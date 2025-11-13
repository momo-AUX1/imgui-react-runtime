export function requireNodeModule(name) {
  if (typeof globalThis.require === 'function') {
    return globalThis.require(name);
  }
  throw new Error(`Node module "${name}" is not available in this runtime`);
}
