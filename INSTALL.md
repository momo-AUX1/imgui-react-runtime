# Installation and Usage Guide

## Installing react-imgui globally

To use the `react-imgui` command from anywhere on your system:

```bash
# From the imgui-react-runtime directory
npm install -g .
```

Or for development (creates a symlink):

```bash
npm link
```

After installation, you can use the `react-imgui` command from any directory.

## Creating a new project

```bash
react-imgui create my-awesome-app
```

This creates a new directory `my-awesome-app` with:
- A simple React component with state management
- Proper CMake configuration
- C++ entry point
- Package.json with React dependencies

## Installing dependencies

```bash
cd my-awesome-app
npm install
```

This installs React and react-reconciler needed for your project.

## Running your project

From your project directory:

```bash
react-imgui run
```

This will:
1. Configure CMake (first time only)
2. Build your project in debug mode
3. Launch the executable

## Modifying your app

Edit `app.jsx` to add your React components. The template includes:
- A window component
- State management with useState
- Button with click handler
- Text display

Example:

```jsx
import React, { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <window title="My App" defaultX={20} defaultY={20}>
      <text>My custom text here!</text>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
      <text>Count: {count}</text>
    </window>
  );
}
```

After making changes, just run `react-imgui run` again to rebuild and launch.

## Project structure

When you set IMGUI_REACT_RUNTIME_PATH in the generated CMakeLists.txt, it should point to where you have imgui-react-runtime installed. For example:

```cmake
# If imgui-react-runtime is in your parent directory
set(IMGUI_REACT_RUNTIME_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../imgui-react-runtime")

# Or use an absolute path
set(IMGUI_REACT_RUNTIME_PATH "/path/to/imgui-react-runtime")
```

The default assumes imgui-react-runtime is in the parent directory of your project.

## Troubleshooting

### "imgui-react-runtime not found"

The generated CMakeLists.txt looks for imgui-react-runtime in the parent directory. If yours is elsewhere, edit the CMakeLists.txt:

```cmake
set(IMGUI_REACT_RUNTIME_PATH "/absolute/path/to/imgui-react-runtime")
```

### "shermes not found" or "CMake configuration failed"

Make sure you have all the build requirements installed. See the main README.md for details on installing:
- CMake 3.20+
- Ninja
- Clang compiler
- Node.js and npm

### Rebuild from scratch

```bash
rm -rf cmake-build-debug
react-imgui run
```

## Advanced usage

### Running from a different directory

```bash
react-imgui run path/to/my-app
```

### Manual CMake build (without CLI)

```bash
cmake -B cmake-build-debug -DCMAKE_BUILD_TYPE=Debug -G Ninja
cmake --build cmake-build-debug
./cmake-build-debug/my-app
```

### Release build

For a production build, use CMake directly:

```bash
cmake -B cmake-build-release -DCMAKE_BUILD_TYPE=Release -G Ninja
cmake --build cmake-build-release
./cmake-build-release/my-app
```

Release builds use native compilation (slowest build, fastest runtime).
