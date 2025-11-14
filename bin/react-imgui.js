#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = realpathSync(resolve(__dirname, '..'));
const RUNTIME_CMAKE_PATH = PACKAGE_ROOT.replace(/\\/g, '/');

const BUILD_DIRS = {
  Debug: 'cmake-build-debug',
  Release: 'cmake-build-release'
};

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function toTitleCase(name) {
  const cleaned = name.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) {
    return name;
  }
  return cleaned
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function showHelp() {
  console.log(`
react-imgui - React + ImGui Runtime CLI

Usage:
  react-imgui create <project-name>                     Create a new react-imgui project
  react-imgui build [project-path] [--debug|--release]  Configure & build (default: --debug)
  react-imgui run   [project-path] [--debug|--release]  Run an existing build
  react-imgui clean [project-path] [--debug] [--release] Remove CMake build folders (default: both)
  react-imgui help                               Show this help message

Examples:
  react-imgui create my-app
  react-imgui build ./my-app --release
  react-imgui run ./my-app
  react-imgui clean ./my-app --debug
`);
}

function parseProjectArgs(rawArgs) {
  let projectPath;
  let requestedType;

  for (const arg of rawArgs) {
    if (arg === '--debug' || arg === '-d') {
      if (requestedType && requestedType !== 'Debug') {
        fail('Conflicting build type flags provided');
      }
      requestedType = 'Debug';
    } else if (arg === '--release' || arg === '-r') {
      if (requestedType && requestedType !== 'Release') {
        fail('Conflicting build type flags provided');
      }
      requestedType = 'Release';
    } else if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`);
    } else if (!projectPath) {
      projectPath = arg;
    } else {
      fail('Too many positional arguments');
    }
  }

  return {
    projectPath: projectPath || '.',
    buildType: requestedType || 'Debug'
  };
}

function parseCleanArgs(rawArgs) {
  let projectPath;
  const requestedTypes = new Set();

  for (const arg of rawArgs) {
    if (arg === '--debug' || arg === '-d') {
      requestedTypes.add('Debug');
    } else if (arg === '--release' || arg === '-r') {
      requestedTypes.add('Release');
    } else if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`);
    } else if (!projectPath) {
      projectPath = arg;
    } else {
      fail('Too many positional arguments');
    }
  }

  const buildTypes = requestedTypes.size > 0 ? Array.from(requestedTypes) : ['Debug', 'Release'];

  return {
    projectPath: projectPath || '.',
    buildTypes
  };
}

function getBuildDirName(buildType) {
  const dir = BUILD_DIRS[buildType];
  if (!dir) {
    fail(`Unsupported build type: ${buildType}`);
  }
  return dir;
}

function resolveProject(projectPath) {
  const resolvedPath = resolve(process.cwd(), projectPath);
  if (!existsSync(resolvedPath)) {
    fail(`Directory "${projectPath}" does not exist`);
  }

  const cmakeListsPath = join(resolvedPath, 'CMakeLists.txt');
  if (!existsSync(cmakeListsPath)) {
    fail(`CMakeLists.txt not found in ${resolvedPath}`);
  }

  return { resolvedPath, cmakeListsPath };
}

function readTargetName(cmakeListsPath) {
  const cmakeContent = readFileSync(cmakeListsPath, 'utf8');
  const targetMatch = cmakeContent.match(/TARGET\s+([A-Za-z0-9_\-]+)/);
  if (!targetMatch) {
    fail('Could not find TARGET in CMakeLists.txt');
  }
  return targetMatch[1];
}

function readEntryPoint(cmakeListsPath) {
  const cmakeContent = readFileSync(cmakeListsPath, 'utf8');
  const entryMatch = cmakeContent.match(/ENTRY_POINT\s+([A-Za-z0-9_./\\-]+)/);
  if (entryMatch) {
    return entryMatch[1];
  }
  return 'index.js';
}

let signalHandlersInstalled = false;
const childProcesses = new Set();

function installSignalHandlers() {
  if (signalHandlersInstalled) {
    return;
  }
  signalHandlersInstalled = true;

  const terminate = (signal) => {
    for (const proc of childProcesses) {
      try {
        proc.kill(signal);
      } catch (error) {
        if (error && error.code !== 'ESRCH') {
          console.error(`Failed to forward ${signal}: ${error.message}`);
        }
      }
    }
    if (signal === 'SIGINT') {
      process.exit(130);
    }
  };

  process.on('SIGINT', () => terminate('SIGINT'));
  process.on('SIGTERM', () => terminate('SIGTERM'));
}

function registerChildProcess(child) {
  childProcesses.add(child);
  installSignalHandlers();
  child.on('exit', () => {
    childProcesses.delete(child);
  });
}

function startHotReloadWatcher(resolvedPath, buildDirName, entryPoint) {
  const bundlePath = join(resolvedPath, buildDirName, 'react-unit-bundle.js');
  if (!existsSync(bundlePath)) {
    console.warn(`Hot reload: bundle ${bundlePath} not found, skipping watch.`);
    return null;
  }

  const bundleScript = join(PACKAGE_ROOT, 'scripts/bundle-react-unit.js');
  if (!existsSync(bundleScript)) {
    console.warn('Hot reload: bundle script missing, skipping watch.');
    return null;
  }

  const watchArgs = [bundleScript, entryPoint, bundlePath, 'development', '--watch'];
  console.log('Hot reload enabled. Watching JS sources for changes...');

  const watcher = spawn('node', watchArgs, {
    cwd: resolvedPath,
    stdio: 'inherit'
  });

  watcher.on('error', (error) => {
    console.error(`Failed to start hot reload watcher: ${error.message}`);
  });

  watcher.on('exit', (code) => {
    childProcesses.delete(watcher);
    if (code !== 0 && code !== null) {
      console.warn(`Hot reload watcher exited with code ${code}`);
    }
  });

  registerChildProcess(watcher);
  return watcher;
}

function ensureDependencies(resolvedPath) {
  const packageJsonPath = join(resolvedPath, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return;
  }

  const nodeModulesDir = join(resolvedPath, 'node_modules');
  if (existsSync(nodeModulesDir)) {
    return;
  }

  console.log('Installing npm dependencies (node_modules missing)...');
  try {
    execSync('npm install', {
      cwd: resolvedPath,
      stdio: 'inherit'
    });
  } catch (error) {
    fail('npm install failed');
  }
}

function configureProject(resolvedPath, buildDirName, buildType) {
  console.log(`Configuring (${buildType})...`);
  const bundleMode = buildType === 'Release' ? 0 : 2;
  const configureCommand = `cmake -B ${buildDirName} -DCMAKE_BUILD_TYPE=${buildType} -DREACT_BUNDLE_MODE=${bundleMode} -G Ninja`;
  try {
    execSync(configureCommand, {
      cwd: resolvedPath,
      stdio: 'inherit'
    });
  } catch (error) {
    fail('CMake configuration failed');
  }
}

function buildProject(projectPath = '.', buildType = 'Debug') {
  const { resolvedPath, cmakeListsPath } = resolveProject(projectPath);
  const buildDirName = getBuildDirName(buildType);

  ensureDependencies(resolvedPath);
  configureProject(resolvedPath, buildDirName, buildType);

  console.log('Building...');
  try {
    execSync(`cmake --build ${buildDirName}`, {
      cwd: resolvedPath,
      stdio: 'inherit'
    });
  } catch (error) {
    fail('Build failed');
  }

  const targetName = readTargetName(cmakeListsPath);
  let executable = join(resolvedPath, buildDirName, targetName);
  let appBundle = null;
  if (process.platform === 'darwin') {
    const bundleCandidate = join(resolvedPath, buildDirName, `${targetName}.app`);
    if (existsSync(bundleCandidate)) {
      appBundle = bundleCandidate;
      executable = join(bundleCandidate, 'Contents', 'MacOS', targetName);
    }
  }

  if (!existsSync(executable)) {
    fail(`Executable not found at ${executable}`);
  }

  console.log(`Build complete: ${appBundle ?? executable}`);
  return { resolvedPath, targetName, executable, buildType, appBundle };
}

function runProject(projectPath = '.', buildType = 'Debug') {
  const { resolvedPath, cmakeListsPath } = resolveProject(projectPath);
  const buildDirName = getBuildDirName(buildType);
  const targetName = readTargetName(cmakeListsPath);
  let executable = join(resolvedPath, buildDirName, targetName);
  let appBundle = null;
  if (process.platform === 'darwin') {
    const bundleCandidate = join(resolvedPath, buildDirName, `${targetName}.app`);
    if (existsSync(bundleCandidate)) {
      appBundle = bundleCandidate;
      executable = join(bundleCandidate, 'Contents', 'MacOS', targetName);
    }
  }

  if (!existsSync(executable)) {
    const flag = buildType === 'Release' ? '--release' : '';
    const pathComponent = projectPath === '.' ? '' : ` ${projectPath}`;
    const flagComponent = flag ? ` ${flag}` : '';
    fail(`Executable not found at ${executable}. Run "react-imgui build${pathComponent}${flagComponent}" first.`);
  }

  let hotReloadWatcher = null;
  if (buildType === 'Debug') {
    const entryPoint = readEntryPoint(cmakeListsPath);
    const entryAbsolute = resolve(resolvedPath, entryPoint);
    if (existsSync(entryAbsolute)) {
      hotReloadWatcher = startHotReloadWatcher(resolvedPath, buildDirName, entryAbsolute);
    } else {
      console.warn(`Hot reload: entry point ${entryAbsolute} not found, skipping watcher.`);
    }
  } else {
    console.log('Hot reload disabled for release builds; bundle is embedded in the executable.');
  }

  const displayTarget = appBundle ?? executable;
  console.log(`Running ${displayTarget} (${buildType})...\n`);
  const child = spawn(executable, [], {
    cwd: resolvedPath,
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    console.error(`Failed to start: ${error.message}`);
    if (hotReloadWatcher && !hotReloadWatcher.killed) {
      hotReloadWatcher.kill();
    }
    process.exit(1);
  });

  registerChildProcess(child);

  child.on('exit', (code) => {
    if (hotReloadWatcher && !hotReloadWatcher.killed) {
      hotReloadWatcher.kill();
    }
    process.exit(code ?? 0);
  });
}

function createProject(projectName) {
  if (!projectName) {
    fail('Project name is required. Usage: react-imgui create <project-name>');
  }

  const projectPath = resolve(process.cwd(), projectName);

  if (existsSync(projectPath)) {
    fail(`Directory "${projectName}" already exists`);
  }

  console.log(`Creating new react-imgui project: ${projectName}`);

  mkdirSync(projectPath, { recursive: true });

  const templatesDir = join(PACKAGE_ROOT, 'templates');

  const appJsx = readFileSync(join(templatesDir, 'app.jsx'), 'utf8');
  const indexJs = readFileSync(join(templatesDir, 'index.js'), 'utf8');
  const mainCpp = readFileSync(join(templatesDir, 'main.cpp'), 'utf8');
  const cmakeLists = readFileSync(join(templatesDir, 'CMakeLists.txt'), 'utf8');

  const processedCmake = cmakeLists
    .replace(/PROJECT_NAME/g, projectName)
    .replace(/__RUNTIME_PATH__/g, RUNTIME_CMAKE_PATH);
  const processedCpp = mainCpp.replace(/PROJECT_NAME/g, projectName);
  const processedIndex = indexJs.replace(/__PROJECT_TITLE__/g, toTitleCase(projectName));

  writeFileSync(join(projectPath, 'app.jsx'), appJsx);
  writeFileSync(join(projectPath, 'index.js'), processedIndex);
  writeFileSync(join(projectPath, `${projectName}.cpp`), processedCpp);
  writeFileSync(join(projectPath, 'CMakeLists.txt'), processedCmake);
  copyFileSync(join(templatesDir, 'icon.png'), join(projectPath, 'icon.png'));

  const packageJson = {
    name: projectName,
    version: '1.0.0',
    type: 'module',
    dependencies: {
      react: '18.2.0',
      'react-reconciler': '0.29.0'
    }
  };
  writeFileSync(join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

  console.log(`\nProject created successfully!

Next steps:
  cd ${projectName}
  react-imgui build
  react-imgui run

The build step installs npm dependencies automatically if needed. Replace icon.png to customize the window icon.
`);
}

function cleanProject(projectPath = '.', buildTypes = ['Debug', 'Release']) {
  const { resolvedPath } = resolveProject(projectPath);
  const targets = buildTypes.length > 0 ? buildTypes : ['Debug', 'Release'];

  for (const buildType of targets) {
    const dirName = getBuildDirName(buildType);
    const dirPath = join(resolvedPath, dirName);
    if (existsSync(dirPath)) {
      console.log(`Removing ${dirName}...`);
      try {
        rmSync(dirPath, { recursive: true, force: true });
      } catch (error) {
        fail(`Failed to remove ${dirName}: ${error.message}`);
      }
    } else {
      console.log(`Skipping ${dirName} (not found).`);
    }
  }

  console.log('Clean complete.');
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'create':
    createProject(args[1]);
    break;

  case 'build': {
    const { projectPath, buildType } = parseProjectArgs(args.slice(1));
    buildProject(projectPath, buildType);
    break;
  }

  case 'run': {
    const { projectPath, buildType } = parseProjectArgs(args.slice(1));
    runProject(projectPath, buildType);
    break;
  }

  case 'clean': {
    const { projectPath, buildTypes } = parseCleanArgs(args.slice(1));
    cleanProject(projectPath, buildTypes);
    break;
  }

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  case undefined:
    showHelp();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
