# react-imgui Quick Reference

## Installation
```bash
npm install -g .    # Install globally
npm link            # Or link for development
```

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `react-imgui create <name>` | Create new project | `react-imgui create my-app` |
| `react-imgui run [path]` | Build and run project | `react-imgui run` |
| `react-imgui help` | Show help message | `react-imgui help` |

## Typical Workflow

```bash
# 1. Create project
react-imgui create my-app

# 2. Install dependencies
cd my-app
npm install

# 3. Edit your React components
# Edit app.jsx, add components, hooks, etc.

# 4. Build and run
react-imgui run
```

## Available Components

See main README.md for full component documentation.

**Containers:**
- `<root>` - Fullscreen transparent background
- `<window>` - Moveable window
- `<child>` - Scrollable region

**Text & Display:**
- `<text>` - Text with optional color
- `<separator>` - Horizontal line

**Interactive:**
- `<button onClick={...}>` - Clickable button

**Layout:**
- `<sameline>` - Place next item on same line
- `<group>` - Visual grouping
- `<indent>` - Indent children
- `<collapsingheader>` - Collapsible section

**Tables:**
- `<table>`, `<tablecolumn>`, `<tableheader>`, `<tablerow>`, `<tablecell>`

**Drawing:**
- `<rect>` - Rectangle (filled or outline)
- `<circle>` - Circle (filled or outline)

## Common Patterns

### Window with State
```jsx
import React, { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);
  
  return (
    <window title="Counter">
      <button onClick={() => setCount(count + 1)}>Click</button>
      <text>Clicked {count} times</text>
    </window>
  );
}
```

### Multiple Windows
```jsx
<>
  <window title="Window 1" defaultX={20} defaultY={20}>
    <text>First window</text>
  </window>
  
  <window title="Window 2" defaultX={400} defaultY={20}>
    <text>Second window</text>
  </window>
</>
```

### Background with Root
```jsx
<root>
  <rect x={0} y={0} width={1200} height={30} color="#00000080" />
  <text color="#00FF00">Status Bar</text>
  
  <window title="Main">
    <text>Content</text>
  </window>
</root>
```

## Project Configuration

Edit `CMakeLists.txt` to set the runtime path:

```cmake
set(IMGUI_REACT_RUNTIME_PATH "/path/to/imgui-react-runtime")
```

## Build Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| Debug (default) | Fast builds, source bundles | Development |
| Release | Slow builds, native compilation | Production |

To manually build in Release:
```bash
cmake -B cmake-build-release -DCMAKE_BUILD_TYPE=Release -G Ninja
cmake --build cmake-build-release
./cmake-build-release/my-app
```
