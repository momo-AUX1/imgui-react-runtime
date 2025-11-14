import React from 'react';
import { createRoot, render } from 'react-imgui';
import { App } from './app.jsx';

const PROJECT_TITLE = "__PROJECT_TITLE__";

function configureSapp(options = {}) {
  const sappConfig = globalThis.sappConfig || (globalThis.sappConfig = {});

  const stringFields = {
    title: 'title',
    icon: 'iconPath',
    iconPath: 'iconPath',
    html5CanvasName: 'html5_canvas_name',
  };

  const numericFields = {
    width: 'width',
    height: 'height',
    sampleCount: 'sample_count',
    swapInterval: 'swap_interval',
    clipboardSize: 'clipboard_size',
    maxDroppedFiles: 'max_dropped_files',
    maxDroppedFilePathLength: 'max_dropped_file_path_length',
    glMajorVersion: 'gl_major_version',
    glMinorVersion: 'gl_minor_version',
  };

  const booleanFields = {
    fullscreen: 'fullscreen',
    highDpi: 'high_dpi',
    alpha: 'alpha',
    enableClipboard: 'enable_clipboard',
    enableDragAndDrop: 'enable_dragndrop',
    html5CanvasResize: 'html5_canvas_resize',
    html5PreserveDrawingBuffer: 'html5_preserve_drawing_buffer',
    html5PremultipliedAlpha: 'html5_premultiplied_alpha',
    html5AskLeaveSite: 'html5_ask_leave_site',
    iosKeyboardResizesCanvas: 'ios_keyboard_resizes_canvas',
    win32ConsoleUTF8: 'win32_console_utf8',
    win32ConsoleCreate: 'win32_console_create',
    win32ConsoleAttach: 'win32_console_attach',
  };

  for (const [key, field] of Object.entries(stringFields)) {
    if (options[key] !== undefined && options[key] !== null) {
      sappConfig[field] = options[key];
    }
  }

  for (const [key, field] of Object.entries(numericFields)) {
    if (options[key] !== undefined && options[key] !== null) {
      sappConfig[field] = options[key];
    }
  }

  for (const [key, field] of Object.entries(booleanFields)) {
    if (options[key] !== undefined) {
      sappConfig[field] = !!options[key];
    }
  }

  if (options.resizable !== undefined) {
    sappConfig.window_resizable = !!options.resizable;
    sappConfig.nonresize = !options.resizable;
  } else if (options.nonresize !== undefined) {
    const fixed = !!options.nonresize;
    sappConfig.nonresize = fixed;
    sappConfig.window_resizable = !fixed;
  }
}

configureSapp({
  title: PROJECT_TITLE,
  width: 800,
  height: 600,
  icon: './icon.png',
  resizable: true, // set to false or provide nonresize: true for fixed windows
  highDpi: true,
  enableClipboard: true,
});

// Create React root
const root = createRoot();

// Expose to imgui unit
globalThis.reactApp = {
  rootChildren: [],
  render() {
    render(React.createElement(App), root);
  }
};

// Initial render
globalThis.reactApp.render();
