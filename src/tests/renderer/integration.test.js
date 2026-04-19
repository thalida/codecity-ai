// integration.test.js — Cross-module integration tests
import { describe, it, expect } from 'vitest';

// Load all modules in dependency order.
// layout.js depends on isoProject from engine.js as a global function.
const engineMod = require('../../renderer/engine.js');
globalThis.isoProject = engineMod.isoProject;

const {
  layoutCity,
  sortForRendering,
} = require('../../renderer/layout.js');
const {
  getDateRanges,
  getBuildingColor,
} = require('../../renderer/colors.js');
const {
  drawBuilding,
  drawGround,
  drawLabel,
} = engineMod;

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

function mockCtx() {
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    fillText() {},
    measureText() { return { width: 40 }; },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  };
}

describe('Cross-module integration', () => {
  it('layoutCity -> color assignment -> all buildings get valid HSL (not null, not placeholder)', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    const buildings = sortForRendering(layout.buildings);
    const dateRanges = getDateRanges(TEST_TREE);
    const palette = TEST_CONFIG.palette;

    for (const b of buildings) {
      if (b.file && b.file.type === 'file') {
        b.color = getBuildingColor(b.file, palette, dateRanges, TEST_CONFIG);
      } else {
        b.color = 'hsl(220, 15%, 25%)';
      }
    }

    for (const b of buildings) {
      expect(b.color).not.toBeNull();
      expect(b.color).not.toBe('placeholder');
      expect(b.color).toMatch(/^hsl\(/);
    }
  });

  it('layoutCity -> every building.file.type is "file" or "directory"', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const b of layout.buildings) {
      expect(b.file).toBeTruthy();
      expect(['file', 'directory']).toContain(b.file.type);
    }
  });

  it('layoutCity has at least one block with a label string', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    const hasLabel = layout.blocks.some(b => typeof b.label === 'string' && b.label.length > 0);
    expect(hasLabel).toBe(true);
  });

  it('full pipeline: layoutCity -> sortForRendering -> simulated render loop does not throw', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    const buildings = sortForRendering(layout.buildings);
    const dateRanges = getDateRanges(TEST_TREE);
    const palette = TEST_CONFIG.palette;
    const ctx = mockCtx();

    // Assign colors
    for (const b of buildings) {
      if (b.file && b.file.type === 'file') {
        b.color = getBuildingColor(b.file, palette, dateRanges, TEST_CONFIG);
      } else {
        b.color = 'hsl(220, 15%, 25%)';
      }
    }

    // Simulate render loop
    expect(() => {
      // Draw blocks
      for (const block of layout.blocks) {
        drawGround(ctx, block.x, block.y, block.w, block.d,
          'rgba(18, 24, 40, 0.95)', 'rgba(60, 80, 120, 0.4)');
        if (block.label) {
          drawLabel(ctx, block.x, block.y, block.label, '#ffffff');
        }
      }

      // Draw buildings
      for (const b of buildings) {
        drawBuilding(ctx, b.x, b.y, b.w, b.d, b.h, b.color);
      }
    }).not.toThrow();
  });
});
