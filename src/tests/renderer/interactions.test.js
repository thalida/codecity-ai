// interactions.test.js — Unit tests for block click detection and hit testing
import { describe, it, expect } from 'vitest';

// Load engine.js for isoProject (needed as global by layout.js and interactions.js)
const engineMod = require('../../renderer/engine.js');
globalThis.isoProject = engineMod.isoProject;

// Stub sidebar functions that interactions.js expects as globals
globalThis.showFileSidebar = function() {};
globalThis.showDirSidebar = function() {};
globalThis.closeSidebar = function() {};
globalThis.showTreeSidebar = function() {};

const {
  hitTest,
  hitTestBlock,
  _pointInQuad,
  handleClick,
} = require('../../renderer/interactions.js');

const {
  layoutCity,
  sortForRendering,
} = require('../../renderer/layout.js');

const TEST_CONFIG = {
  street_tiers: [3, 8, 15, 30],
  building: { min_height: 4, max_height: 120, min_width: 6, max_width: 40 },
  saturation: { min: 20, max: 100 },
  lightness: { min: 25, max: 70 },
  palette: { ".ts": 215, ".js": 220, ".md": 275 },
};

const TEST_TREE = {
  name: "project", type: "directory", path: ".",
  children_count: 2, children_file_count: 1, children_dir_count: 1,
  descendants_count: 3, descendants_file_count: 2, descendants_dir_count: 1,
  descendants_size: 3000,
  children: [
    { name: "index.ts", type: "file", path: "index.ts",
      extension: ".ts", size: 2000, lines: 80,
      created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z",
      git: { created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z", commits: 5, contributors: ["alice"] } },
    { name: "src", type: "directory", path: "src",
      children_count: 1, children_file_count: 1, children_dir_count: 0,
      descendants_count: 1, descendants_file_count: 1, descendants_dir_count: 0,
      descendants_size: 800,
      children: [
        { name: "utils.ts", type: "file", path: "src/utils.ts",
          extension: ".ts", size: 800, lines: 30,
          created: "2024-02-15T10:00:00Z", modified: "2024-03-20T12:00:00Z",
          git: { created: "2024-02-15T10:00:00Z", modified: "2024-03-20T12:00:00Z", commits: 3, contributors: ["bob"] } }
      ]
    }
  ]
};

// ---- _pointInQuad ----
describe('_pointInQuad', () => {
  it('detects point inside a simple square', () => {
    var a = { sx: 0, sy: 0 };
    var b = { sx: 10, sy: 0 };
    var c = { sx: 10, sy: 10 };
    var d = { sx: 0, sy: 10 };
    expect(_pointInQuad(5, 5, a, b, c, d)).toBe(true);
  });

  it('detects point outside a simple square', () => {
    var a = { sx: 0, sy: 0 };
    var b = { sx: 10, sy: 0 };
    var c = { sx: 10, sy: 10 };
    var d = { sx: 0, sy: 10 };
    expect(_pointInQuad(15, 5, a, b, c, d)).toBe(false);
  });

  it('detects point inside a diamond shape', () => {
    var a = { sx: 0, sy: -5 };
    var b = { sx: 5, sy: 0 };
    var c = { sx: 0, sy: 5 };
    var d = { sx: -5, sy: 0 };
    expect(_pointInQuad(0, 0, a, b, c, d)).toBe(true);
  });

  it('detects point outside a diamond shape', () => {
    var a = { sx: 0, sy: -5 };
    var b = { sx: 5, sy: 0 };
    var c = { sx: 0, sy: 5 };
    var d = { sx: -5, sy: 0 };
    expect(_pointInQuad(4, 4, a, b, c, d)).toBe(false);
  });
});

// ---- hitTestBlock ----
describe('hitTestBlock', () => {
  it('returns null for empty blocks array', () => {
    var result = hitTestBlock(0, 0, [], 1, 0, 0, 800, 600);
    expect(result).toBeNull();
  });

  it('returns a block when clicking within its projected ground area', () => {
    // Block at world (0, 0) with a 40×40 footprint and a fake `dir` payload
    var blocks = [{ x: 0, y: 0, w: 40, d: 40, dir: { name: 'fake' } }];

    // Center of the block projects to (0, 0) in screen-relative coords.
    // hitTestBlock: worldX = (screenX - W/2) / zoom — with zoom=1, W=800:
    //   screenX = worldX * 1 + 400 = 400 (for worldX=0)
    var result = hitTestBlock(400, 300, blocks, 1, 0, 0, 800, 600);
    expect(result).not.toBeNull();
    expect(result.dir.name).toBe('fake');
  });

  it('returns null when clicking far from any block', () => {
    var blocks = [{ x: 0, y: 0, w: 40, d: 40, dir: { name: 'fake' } }];
    var result = hitTestBlock(9999, 9999, blocks, 1, 0, 0, 800, 600);
    expect(result).toBeNull();
  });
});

// ---- handleClick with blocks ----
describe('handleClick with blocks', () => {
  it('calls showDirSidebar when clicking on a block ground area', () => {
    var called = false;
    globalThis.showDirSidebar = function() { called = true; };
    globalThis.closeSidebar = function() {};

    var blocks = [{ x: 0, y: 0, w: 40, d: 40, dir: { name: 'fake' } }];
    handleClick(400, 300, [], 1, 0, 0, 800, 600, blocks);

    expect(called).toBe(true);
  });

  it('calls closeSidebar when clicking empty space with no block', () => {
    var closeCalled = false;
    globalThis.showDirSidebar = function() {};
    globalThis.showFileSidebar = function() {};
    globalThis.closeSidebar = function() { closeCalled = true; };

    handleClick(9999, 9999, [], 1, 0, 0, 800, 600, []);
    expect(closeCalled).toBe(true);
  });
});
