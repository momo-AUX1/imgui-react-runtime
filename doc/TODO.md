# TODO List

## Runtime Improvements

### Proper Timer Implementation
Currently, timer implementation is tied to the Sokol frame callback, which means:
- Timers are only checked and executed before each frame render
- No true background timer events (limited to ~60Hz frame rate)
- Timer precision is limited by the frame rate

**Goal**: Implement proper timer support with:
- Native timer events from the platform (separate from frame callbacks)
- Better precision for setTimeout/setInterval
- Ability to wake event loop independently of rendering
- Expose the high-precision timer entry points through a Node-compatible `timers` facade (`setTimeout`, `setInterval`, `setImmediate`) that maps onto the native scheduler

### Environment Variable Import on Startup
Add ability to import system environment variables when the runtime starts.

**Goal**:
- Populate `process.env` with system environment variables
- Allow configuration via environment (e.g., `DEBUG=1`, custom paths)
- Match Node.js behavior more closely

### Node.js API Compatibility

Provide Node.js-compatible APIs:

- **Priority modules** (wrap or extend existing functionality):
	- `fs` - File system operations (readFile, writeFile, stat, readdir, etc.)
	- `path` - Path manipulation utilities (join, resolve, dirname, etc.)
	- `os` - Provide a Node-style facade backed by existing `platform.os` data
	- `buffer` - Buffer class for binary data handling
	- `stream` - Stream handling for file and data operations
	- `timers` - Public API surface layered on the new native timer implementation

**Future modules**:
- `http`/`https` - Network operations
- `child_process` - Process spawning
- `worker_threads` - Parallel execution

**Already available primitives** (to integrate into Node facades):
- `fetch` for `http`/`https`-style requests
- `platform.os` for OS identification and platform metadata

### Web Workers

Multi-thread support will be nice.

### Misc

- ~~Remove try/finally in rendering~~
- react compiler (already done)
- ~~caching of component data~~