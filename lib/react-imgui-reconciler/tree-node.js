// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

/**
 * Global counter for assigning unique IDs to TreeNodes.
 * Each TreeNode gets a unique ID that persists for its lifetime,
 * which is used by ImGui's ID stack for widget identity.
 */
let nextNodeId = 1;

/**
 * TreeNode represents a component instance in our tree.
 * This is what React creates and manipulates through our host config.
 */
export class TreeNode {
  constructor(type, props) {
    this.id = nextNodeId++; // Unique ID for ImGui ID stack
    this.type = type; // Component type like "Window", "Button", etc.
    this.props = props; // Props object passed to the component
    this.children = []; // Array of child TreeNodes or TextNodes
    this.parent = null; // Parent TreeNode (for debugging/traversal)
    this._propsVersion = 0; // Tracks prop updates for cache invalidation
    this._inlineCacheVersion = 0; // Tracks inline text invalidations
    this._inlineTextCache = undefined; // Cached inline text payload
  }

  markPropsChanged() {
    this._propsVersion = (this._propsVersion + 1) >>> 0;
    this._inlineTextCache = undefined;
  }

  markChildrenChanged() {
    this.markInlineContentDirty();
  }

  markInlineContentDirty() {
    this._inlineCacheVersion = (this._inlineCacheVersion + 1) >>> 0;
    this._inlineTextCache = undefined;
  }

  getInlineContentVersion() {
    return this._inlineCacheVersion >>> 0;
  }

  getInlineTextCache() {
    return this._inlineTextCache;
  }

  setInlineTextCache(cache) {
    this._inlineTextCache = cache;
  }
}

/**
 * TextNode represents text content in our tree.
 * React treats text as a special type of child.
 */
export class TextNode {
  constructor(text) {
    this.id = nextNodeId++; // Unique ID for ImGui ID stack
    this.text = text; // The text content
    this.parent = null; // Parent TreeNode
    this._textVersion = 0; // Tracks updates for caching
  }

  markTextChanged() {
    this._textVersion = (this._textVersion + 1) >>> 0;
    const parent = this.parent;
    if (parent && typeof parent.markInlineContentDirty === 'function') {
      parent.markInlineContentDirty();
    }
  }

  getTextVersion() {
    return this._textVersion >>> 0;
  }
}
