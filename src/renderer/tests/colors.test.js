// colors.test.js — Unit tests for src/renderer/colors.js
import { describe, it, expect } from 'vitest';

const {
  getHue,
  getSaturation,
  getLightness,
  getDateRanges,
  getBuildingColor,
} = require('../colors.js');

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

// ---- getHue ----
describe('getHue', () => {
  it('returns palette value for known extension .ts', () => {
    expect(getHue('.ts', TEST_CONFIG.palette)).toBe(215);
  });

  it('returns palette value for known extension .js', () => {
    expect(getHue('.js', TEST_CONFIG.palette)).toBe(220);
  });

  it('returns palette value for known extension .md', () => {
    expect(getHue('.md', TEST_CONFIG.palette)).toBe(275);
  });

  it('returns palette value for known extension .json', () => {
    expect(getHue('.json', TEST_CONFIG.palette)).toBe(50);
  });

  it('returns palette value for known extension .png', () => {
    expect(getHue('.png', TEST_CONFIG.palette)).toBe(30);
  });

  it('returns deterministic hash for unknown extension', () => {
    const hue1 = getHue('.xyz', TEST_CONFIG.palette);
    const hue2 = getHue('.xyz', TEST_CONFIG.palette);
    expect(hue1).toBe(hue2);
    expect(hue1).toBeGreaterThanOrEqual(0);
    expect(hue1).toBeLessThanOrEqual(359);
  });

  it('does not crash on empty extension', () => {
    const hue = getHue('', TEST_CONFIG.palette);
    expect(typeof hue).toBe('number');
  });
});

// ---- getSaturation ----
describe('getSaturation', () => {
  const cfg = TEST_CONFIG.saturation;

  it('returns min saturation for oldest file', () => {
    expect(getSaturation(
      '2024-01-10T09:00:00Z',
      '2024-01-10T09:00:00Z',
      '2024-02-15T10:00:00Z',
      cfg
    )).toBe(20);
  });

  it('returns max saturation for newest file', () => {
    expect(getSaturation(
      '2024-02-15T10:00:00Z',
      '2024-01-10T09:00:00Z',
      '2024-02-15T10:00:00Z',
      cfg
    )).toBe(100);
  });

  it('interpolates linearly for midpoint', () => {
    // t = 0.5 => 20 + 0.5 * 80 = 60
    const minDate = '2024-01-01T00:00:00Z';
    const maxDate = '2024-03-01T00:00:00Z';
    const midDate = '2024-01-31T00:00:00Z'; // ~halfway
    const sat = getSaturation(midDate, minDate, maxDate, cfg);
    expect(sat).toBeGreaterThan(cfg.min);
    expect(sat).toBeLessThan(cfg.max);
  });

  it('returns 60 for null date', () => {
    expect(getSaturation(null, '2024-01-10T09:00:00Z', '2024-02-15T10:00:00Z', cfg)).toBe(60);
  });

  it('returns max for degenerate range', () => {
    expect(getSaturation(
      '2024-01-10T09:00:00Z',
      '2024-01-10T09:00:00Z',
      '2024-01-10T09:00:00Z',
      cfg
    )).toBe(100);
  });
});

// ---- getLightness ----
describe('getLightness', () => {
  const cfg = TEST_CONFIG.lightness;

  it('returns max lightness for most recently modified', () => {
    expect(getLightness(
      '2024-03-22T14:30:00Z',
      '2024-01-10T09:00:00Z',
      '2024-03-22T14:30:00Z',
      cfg
    )).toBe(70);
  });

  it('returns min lightness for longest untouched', () => {
    expect(getLightness(
      '2024-01-10T09:00:00Z',
      '2024-01-10T09:00:00Z',
      '2024-03-22T14:30:00Z',
      cfg
    )).toBe(25);
  });

  it('interpolates linearly for midpoint', () => {
    const minDate = '2024-01-01T00:00:00Z';
    const maxDate = '2024-03-01T00:00:00Z';
    const midDate = '2024-01-31T00:00:00Z';
    const l = getLightness(midDate, minDate, maxDate, cfg);
    expect(l).toBeGreaterThan(cfg.min);
    expect(l).toBeLessThan(cfg.max);
  });

  it('returns 45 for null date', () => {
    expect(getLightness(null, '2024-01-10T09:00:00Z', '2024-03-22T14:30:00Z', cfg)).toBe(45);
  });

  it('returns max for degenerate range', () => {
    expect(getLightness(
      '2024-01-10T09:00:00Z',
      '2024-01-10T09:00:00Z',
      '2024-01-10T09:00:00Z',
      cfg
    )).toBe(70);
  });
});

// ---- getDateRanges ----
describe('getDateRanges', () => {
  it('finds min/max across tree', () => {
    const dr = getDateRanges(TEST_TREE);
    expect(dr.createdMin).toBe('2024-01-10T09:00:00Z');
    expect(dr.createdMax).toBe('2024-02-15T10:00:00Z');
    expect(dr.modifiedMin).toBe('2024-01-10T09:00:00Z');
    expect(dr.modifiedMax).toBe('2024-03-22T14:30:00Z');
  });

  it('returns nulls for empty tree', () => {
    const dr = getDateRanges({ name: 'root', type: 'directory', children: [] });
    expect(dr.createdMin).toBeNull();
    expect(dr.createdMax).toBeNull();
    expect(dr.modifiedMin).toBeNull();
    expect(dr.modifiedMax).toBeNull();
  });

  it('handles single file tree', () => {
    const single = {
      name: 'root', type: 'directory', path: '.',
      children: [
        { name: 'only.ts', type: 'file', extension: '.ts',
          git: { created: '2024-06-01T00:00:00Z', modified: '2024-06-15T00:00:00Z' } }
      ]
    };
    const dr = getDateRanges(single);
    expect(dr.createdMin).toBe(dr.createdMax);
    expect(dr.modifiedMin).toBe(dr.modifiedMax);
  });
});

// ---- getBuildingColor ----
describe('getBuildingColor', () => {
  it('returns valid "hsl(...)" string', () => {
    const dateRanges = getDateRanges(TEST_TREE);
    const color = getBuildingColor(TEST_TREE.children[0], TEST_CONFIG.palette, dateRanges, TEST_CONFIG);
    expect(color).toMatch(/^hsl\(\d+,\s*[\d.]+%,\s*[\d.]+%\)$/);
  });

  it('uses correct hue for .ts files', () => {
    const dateRanges = getDateRanges(TEST_TREE);
    const color = getBuildingColor(TEST_TREE.children[0], TEST_CONFIG.palette, dateRanges, TEST_CONFIG);
    expect(color).toMatch(/^hsl\(215,/);
  });

  it('uses correct hue for .md files', () => {
    const dateRanges = getDateRanges(TEST_TREE);
    const color = getBuildingColor(TEST_TREE.children[1], TEST_CONFIG.palette, dateRanges, TEST_CONFIG);
    expect(color).toMatch(/^hsl\(275,/);
  });

  it('handles unknown extension', () => {
    const dateRanges = getDateRanges(TEST_TREE);
    const unknownFile = {
      name: 'foo.xyz', type: 'file', extension: '.xyz',
      size: 1000, lines: 10,
      git: { created: '2024-01-10T09:00:00Z', modified: '2024-03-22T14:30:00Z' }
    };
    const color = getBuildingColor(unknownFile, TEST_CONFIG.palette, dateRanges, TEST_CONFIG);
    expect(color).toMatch(/^hsl\(/);
  });
});
