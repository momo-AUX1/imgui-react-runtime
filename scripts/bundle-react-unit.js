#!/usr/bin/env node
// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { transformAsync } from '@babel/core';
import { glob } from 'glob';

// Usage: bundle-react-unit.js <entry-point> <output-file> [node-env]
// Example: bundle-react-unit.js src/react-unit/index.js build/react-bundle.js production

const useReactCompiler = process.env.USE_REACT_COMPILER === 'true';
const bundlePlatform = process.env.BUNDLE_PLATFORM || 'neutral';
const entryPoint = process.argv[2];
const outfile = process.argv[3];
const nodeEnv = process.argv[4] || 'production';
const extraArgs = process.argv.slice(5);

let watchMode = false;
for (const arg of extraArgs) {
  if (arg === '--watch') {
    watchMode = true;
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

if (!entryPoint || !outfile) {
  console.error('Usage: bundle-react-unit.js <entry-point> <output-file> [node-env]');
  console.error('Example: bundle-react-unit.js src/react-unit/index.js build/react-bundle.js production');
  process.exit(1);
}

// Resolve lib directory relative to this script (scripts/ and lib/ are siblings)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const libDir = resolve(__dirname, '../lib/react-imgui-reconciler');
const runtimeDir = resolve(__dirname, '../lib/react-imgui');
const projectRoot = resolve(__dirname, '..');
const babelConfigPath = resolve(projectRoot, '.babelrc.cjs');

// Ensure output directory exists
mkdirSync(dirname(outfile), { recursive: true });

// Make entry point absolute for proper resolution
const absEntryPoint = resolve(entryPoint);
let actualEntryPoint = absEntryPoint;

function findPackageRoot(startDir) {
  let current = startDir;

  while (true) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return null;
}

const entryDir = dirname(absEntryPoint);
const projectPackageRoot = findPackageRoot(entryDir);

// Force all consumers (app + reconciler) to resolve React from the same install
// so we don't end up with two React copies bundled (which breaks hooks).
const alias = {
  'react-imgui-reconciler': libDir,
  'react-imgui': runtimeDir,
  buffer: resolve(__dirname, '../lib/jslib-unit/node-buffer.js'),
  'node:buffer': resolve(__dirname, '../lib/jslib-unit/node-buffer.js'),
  fs: resolve(__dirname, '../lib/jslib-unit/node-fs.js'),
  'node:fs': resolve(__dirname, '../lib/jslib-unit/node-fs.js'),
  'fs/promises': resolve(__dirname, '../lib/jslib-unit/node-fs-promises.js'),
  path: resolve(__dirname, '../lib/jslib-unit/node-path.js'),
  'node:path': resolve(__dirname, '../lib/jslib-unit/node-path.js'),
  'path/posix': resolve(__dirname, '../lib/jslib-unit/node-path-posix.js'),
  'path/win32': resolve(__dirname, '../lib/jslib-unit/node-path-win32.js'),
  stream: resolve(__dirname, '../lib/jslib-unit/node-stream.js'),
  'node:stream': resolve(__dirname, '../lib/jslib-unit/node-stream.js'),
  'stream/promises': resolve(__dirname, '../lib/jslib-unit/node-stream-promises.js'),
  os: resolve(__dirname, '../lib/jslib-unit/node-os.js'),
  'node:os': resolve(__dirname, '../lib/jslib-unit/node-os.js'),
};

const reactAliasRoots = [];
if (projectPackageRoot) {
  reactAliasRoots.push(projectPackageRoot);
}
reactAliasRoots.push(projectRoot);

for (const rootCandidate of reactAliasRoots) {
  const reactDir = join(rootCandidate, 'node_modules', 'react');
  if (!existsSync(reactDir)) {
    continue;
  }

  const reactEntry = join(reactDir, 'index.js');
  alias.react = reactEntry;

  const jsxRuntimePath = join(reactDir, 'jsx-runtime.js');
  if (existsSync(jsxRuntimePath)) {
    alias['react/jsx-runtime'] = jsxRuntimePath;
  }

  const jsxDevRuntimePath = join(reactDir, 'jsx-dev-runtime.js');
  if (existsSync(jsxDevRuntimePath)) {
    alias['react/jsx-dev-runtime'] = jsxDevRuntimePath;
  }

  break;
}

// If React Compiler is enabled, preprocess with Babel
if (useReactCompiler) {
  if (watchMode) {
    console.error('React Compiler is not supported in watch mode yet.');
    process.exit(1);
  }
  console.log('React Compiler: Preprocessing JSX files...');

  const tempDir = join(dirname(outfile), '.babel-temp');
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  const sourceRoot = dirname(absEntryPoint);

  // Transform all JS/JSX files in the source directory
  const files = glob.sync(join(sourceRoot, '**/*.{js,jsx}'));

  for (const file of files) {
    const relPath = relative(sourceRoot, file);
    const outputPath = join(tempDir, relPath);

    // Ensure subdirectories exist
    mkdirSync(dirname(outputPath), { recursive: true });

    // Transform with Babel
    try {
      const result = await transformAsync(readFileSync(file, 'utf8'), {
        filename: file,
        configFile: babelConfigPath,
      });

      writeFileSync(outputPath, result.code);
    } catch (error) {
      console.error(`Error transforming ${file}:`, error.message);
      throw error;
    }
  }

  actualEntryPoint = join(tempDir, relative(sourceRoot, absEntryPoint));
  console.log('React Compiler: Preprocessing complete');
}

const buildOptions = {
  entryPoints: [actualEntryPoint],
  bundle: true,
  outfile,
  platform: bundlePlatform,
  format: 'iife',
  target: 'esnext',
  minify: false,
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  ...(useReactCompiler ? {
    absWorkingDir: projectRoot,
    nodePaths: [join(projectRoot, 'node_modules')],
  } : {}),
  external: [],
  alias: {
    ...alias,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
  },
  logLevel: 'error',
  plugins: watchMode ? [{
    name: 'react-imgui-watch-logger',
    setup(build) {
      build.onEnd((result) => {
        if (!watchMode) {
          return;
        }
        if (result.errors && result.errors.length > 0) {
          console.error('React bundle rebuild failed.');
          return;
        }
        if (result.warnings && result.warnings.length > 0) {
          for (const warning of result.warnings) {
            console.warn(warning);
          }
        }
        console.log('React unit bundle updated:', outfile);
      });
    },
  }] : undefined,
};

const ctx = await esbuild.context(buildOptions);

try {
  const result = await ctx.rebuild();
  if (result.warnings?.length) {
    for (const warning of result.warnings) {
      console.warn(warning);
    }
  }
  console.log('React unit bundle created:', outfile, `(NODE_ENV=${nodeEnv}, React Compiler=${useReactCompiler})`);

  if (watchMode) {
    await ctx.watch();
    console.log('Watching for React unit changes...');
    process.stdin.resume();
  } else {
    await ctx.dispose();
  }
} catch (error) {
  await ctx.dispose();
  throw error;
}
