import { requireNodeModule } from './node-bridge.js';

const streamPromises = requireNodeModule('stream/promises');

export default streamPromises;
export const finished = streamPromises.finished;
export const pipeline = streamPromises.pipeline;
