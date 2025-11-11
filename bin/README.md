# react-imgui CLI

Command-line tool for creating and running React + ImGui applications.

## Installation

Install globally to use the `react-imgui` command from anywhere:

```bash
npm install -g .
```

Or use `npm link` during development:

```bash
npm link
```

**Important**: Before creating projects, you should build imgui-react-runtime at least once to set up Hermes:

```bash
# From the imgui-react-runtime directory
npm install
cmake -B cmake-build-debug -DCMAKE_BUILD_TYPE=Debug -G Ninja
cmake --build cmake-build-debug --target hello
```

This initial build downloads and compiles Hermes, which will be reused by all projects you create.

## Usage

### Create a new project

```bash
react-imgui create my-app
cd my-app
npm install
```

This creates a new React + ImGui project with:
- `app.jsx` - Main React component
- `index.js` - Application entry point
- `my-app.cpp` - C++ entry point
- `CMakeLists.txt` - Build configuration
- `package.json` - Node.js dependencies

### Run a project

Build and run a project in debug mode:

```bash
react-imgui run
```

Or specify a project directory:

```bash
react-imgui run ./my-app
```

This will:
1. Configure CMake (if not already configured)
2. Build the project in debug mode
3. Run the executable

### Help

```bash
react-imgui help
```

## Project Structure

After creating a project, you'll have:

```
my-app/
├── app.jsx           # React components
├── index.js          # React entry point
├── my-app.cpp        # C++ entry point
├── CMakeLists.txt    # Build configuration
└── package.json      # Dependencies
```

## Development Workflow

1. Create a project: `react-imgui create my-app`
2. Install dependencies: `cd my-app && npm install`
3. Edit your React components in `app.jsx`
4. Run: `react-imgui run`
5. Make changes and run again to see updates
