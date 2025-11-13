import { requireNodeModule } from './node-bridge.js';

const streamModule = requireNodeModule('stream');

export default streamModule;
export const Stream = streamModule.Stream;
export const Readable = streamModule.Readable;
export const Writable = streamModule.Writable;
export const Duplex = streamModule.Duplex;
export const Transform = streamModule.Transform;
export const PassThrough = streamModule.PassThrough;
export const finished = streamModule.finished;
export const pipeline = streamModule.pipeline;
export const promises = streamModule.promises;
