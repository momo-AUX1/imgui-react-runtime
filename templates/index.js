import React from 'react';
import { createRoot, render } from 'react-imgui-reconciler/reconciler.js';
import { App } from './app.jsx';

const PROJECT_TITLE = "__PROJECT_TITLE__";

// Configure window defaults
globalThis.sappConfig.title = PROJECT_TITLE;
globalThis.sappConfig.width = 800;
globalThis.sappConfig.height = 600;
globalThis.sappConfig.iconPath = "./icon.png";

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
