// layout.test.js — Unit tests for src/renderer/layout.js
import { describe, it, expect } from 'vitest';

// layout.js depends on engine.js for isoProject (used in _computeHitBox).
// Since these are vanilla JS files designed for concatenation, the dependency
// expects isoProject as a global function. We must attach it to globalThis.
const engine = require('../../renderer/engine.js');
globalThis.isoProject = engine.isoProject;

const {
  getStreetTier,
  getStreetWidth,
  getBuildingDimensions,
  layoutCity,
  sortForRendering,
} = require('../../renderer/layout.js');

const TEST_CONFIG = {
  street_tiers: [3, 8, 15, 30],
  building: { min_height: 4, max_height: 120, min_width: 6, max_width: 40 },
  saturation: { min: 20, max: 100 },
  lightness: { min: 25, max: 70 },
  palette: { ".ts": 215, ".js": 220, ".md": 275, ".json": 50, ".png": 30 },
};

const TEST_TREE = {
  name: "project", type: "directory", path: ".", fullPath: "/tmp/project",
  children_count: 3, children_file_count: 2, children_dir_count: 1,
  descendants_count: 4, descendants_file_count: 3, descendants_dir_count: 1,
  descendants_size: 5000,
  children: [
    { name: "index.ts", type: "file", path: "index.ts", fullPath: "/tmp/project/index.ts",
      extension: ".ts", size: 2000, lines: 80, binary: false,
      created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z",
      git: { created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z", commits: 5, contributors: ["alice"] } },
    { name: "README.md", type: "file", path: "README.md", fullPath: "/tmp/project/README.md",
      extension: ".md", size: 500, lines: 20, binary: false,
      created: "2024-01-10T09:00:00Z", modified: "2024-01-10T09:00:00Z",
      git: { created: "2024-01-10T09:00:00Z", modified: "2024-01-10T09:00:00Z", commits: 1, contributors: ["alice"] } },
    { name: "src", type: "directory", path: "src", fullPath: "/tmp/project/src",
      children_count: 1, children_file_count: 1, children_dir_count: 0,
      descendants_count: 1, descendants_file_count: 1, descendants_dir_count: 0,
      descendants_size: 800,
      children: [
        { name: "utils.ts", type: "file", path: "src/utils.ts", fullPath: "/tmp/project/src/utils.ts",
          extension: ".ts", size: 800, lines: 30, binary: false,
          created: "2024-02-15T10:00:00Z", modified: "2024-03-20T12:00:00Z",
          git: { created: "2024-02-15T10:00:00Z", modified: "2024-03-20T12:00:00Z", commits: 3, contributors: ["bob"] } }
      ]
    }
  ]
};

// ---- getStreetTier ----
describe('getStreetTier', () => {
  const tiers = TEST_CONFIG.street_tiers; // [3, 8, 15, 30]

  it('maps count 0 to tier 1', () => expect(getStreetTier(0, tiers)).toBe(1));
  it('maps count 3 to tier 1', () => expect(getStreetTier(3, tiers)).toBe(1));
  it('maps count 4 to tier 2', () => expect(getStreetTier(4, tiers)).toBe(2));
  it('maps count 8 to tier 2', () => expect(getStreetTier(8, tiers)).toBe(2));
  it('maps count 9 to tier 3', () => expect(getStreetTier(9, tiers)).toBe(3));
  it('maps count 15 to tier 3', () => expect(getStreetTier(15, tiers)).toBe(3));
  it('maps count 16 to tier 4', () => expect(getStreetTier(16, tiers)).toBe(4));
  it('maps count 30 to tier 4', () => expect(getStreetTier(30, tiers)).toBe(4));
  it('maps count 31 to tier 5', () => expect(getStreetTier(31, tiers)).toBe(5));
  it('maps count 100 to tier 5', () => expect(getStreetTier(100, tiers)).toBe(5));
});

// ---- getStreetWidth ----
describe('getStreetWidth', () => {
  it('tier 1 returns 4', () => expect(getStreetWidth(1)).toBe(4));
  it('tier 2 returns 8', () => expect(getStreetWidth(2)).toBe(8));
  it('tier 3 returns 14', () => expect(getStreetWidth(3)).toBe(14));
  it('tier 4 returns 22', () => expect(getStreetWidth(4)).toBe(22));
  it('tier 5 returns 32', () => expect(getStreetWidth(5)).toBe(32));
  it('tier 0 clamps to tier 1 (4)', () => expect(getStreetWidth(0)).toBe(4));
  it('tier 6 clamps to tier 5 (32)', () => expect(getStreetWidth(6)).toBe(32));
});

// ---- getBuildingDimensions ----
describe('getBuildingDimensions', () => {
  it('uses log scale — returns min dimensions for null/zero data', () => {
    const dim = getBuildingDimensions({ lines: null, size: null }, TEST_CONFIG);
    expect(dim.h).toBe(4);
    expect(dim.w).toBe(6);
  });

  it('returns values within configured min/max', () => {
    const dim = getBuildingDimensions({ lines: 80, size: 2000 }, TEST_CONFIG);
    expect(dim.h).toBeGreaterThan(4);
    expect(dim.h).toBeLessThan(120);
    expect(dim.w).toBeGreaterThan(6);
    expect(dim.w).toBeLessThan(40);
  });

  it('respects max dimensions at reference ceilings', () => {
    const dim = getBuildingDimensions({ lines: 100000, size: 10 * 1024 * 1024 }, TEST_CONFIG);
    expect(dim.h).toBe(120);
    expect(dim.w).toBe(40);
  });

  it('depth is (height + width) / 2', () => {
    const dim = getBuildingDimensions({ lines: 80, size: 2000 }, TEST_CONFIG);
    expect(dim.d).toBeCloseTo((dim.h + dim.w) / 2, 0);
  });

  it('zero lines treated as 1 (no -Infinity)', () => {
    const dim = getBuildingDimensions({ lines: 0, size: 0 }, TEST_CONFIG);
    expect(dim.h).toBe(4);
    expect(dim.w).toBe(6);
  });
});

// ---- layoutCity ----
describe('layoutCity', () => {
  it('returns { blocks, buildings } arrays', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    expect(Array.isArray(layout.blocks)).toBe(true);
    expect(Array.isArray(layout.buildings)).toBe(true);
  });

  it('has at least 1 block', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    expect(layout.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('produces 3 file buildings for the test tree', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    expect(layout.buildings.length).toBe(3);
  });

  it('every building has x, y, w, d, h, file, hitBox', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const b of layout.buildings) {
      expect(typeof b.x).toBe('number');
      expect(typeof b.y).toBe('number');
      expect(typeof b.w).toBe('number');
      expect(typeof b.d).toBe('number');
      expect(typeof b.h).toBe('number');
      expect(b.file).toBeTruthy();
      expect(b.hitBox).toBeTruthy();
    }
  });

  it('every building has hitBox with x, y, w, h', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const b of layout.buildings) {
      expect(typeof b.hitBox.x).toBe('number');
      expect(typeof b.hitBox.y).toBe('number');
      expect(b.hitBox.w).toBeGreaterThan(0);
      expect(b.hitBox.h).toBeGreaterThan(0);
    }
  });

  it('every building starts with color = null', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const b of layout.buildings) {
      expect(b.color).toBeNull();
    }
  });

  it('every block has x, y, w, d, label, dir', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const block of layout.blocks) {
      expect(typeof block.x).toBe('number');
      expect(typeof block.y).toBe('number');
      expect(typeof block.w).toBe('number');
      expect(block.w).toBeGreaterThan(0);
      expect(typeof block.d).toBe('number');
      expect(block.d).toBeGreaterThan(0);
      expect(typeof block.label).toBe('string');
      expect(block.dir).toBeTruthy();
    }
  });

  it('at least one block has a non-empty label', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    const hasLabel = layout.blocks.some(b => b.label && b.label.length > 0);
    expect(hasLabel).toBe(true);
  });
});

// ---- sortForRendering ----
describe('sortForRendering', () => {
  it('sorts back-to-front (lowest x+y first — behind draws first)', () => {
    const unsorted = [
      { x: 5, y: 5, id: 'near' },
      { x: 20, y: 20, id: 'far' },
      { x: 10, y: 10, id: 'mid' },
    ];
    const sorted = sortForRendering(unsorted);
    // Lowest x+y = behind (north/west), drawn first
    // Highest x+y = in front (south/east), drawn last (on top)
    expect(sorted[0].id).toBe('near');
    expect(sorted[1].id).toBe('mid');
    expect(sorted[2].id).toBe('far');
  });

  it('does not mutate original array', () => {
    const original = [
      { x: 5, y: 5, id: 'close' },
      { x: 20, y: 20, id: 'far' },
    ];
    sortForRendering(original);
    expect(original[0].id).toBe('close');
  });

  it('handles single element', () => {
    const sorted = sortForRendering([{ x: 0, y: 0 }]);
    expect(sorted.length).toBe(1);
  });

  it('handles empty array', () => {
    const sorted = sortForRendering([]);
    expect(sorted.length).toBe(0);
  });
});
