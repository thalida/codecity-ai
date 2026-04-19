// layout.test.js — Unit tests for src/renderer/layout.js
import { describe, it, expect } from 'vitest';

const {
  getStreetTier,
  getStreetWidth,
  getBuildingDimensions,
  layoutCity,
  sortForRendering,
} = require('../layout.js');

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
  it('tier 1 returns 10', () => expect(getStreetWidth(1)).toBe(10));
  it('tier 2 returns 16', () => expect(getStreetWidth(2)).toBe(16));
  it('tier 3 returns 24', () => expect(getStreetWidth(3)).toBe(24));
  it('tier 4 returns 36', () => expect(getStreetWidth(4)).toBe(36));
  it('tier 5 returns 52', () => expect(getStreetWidth(5)).toBe(52));
  it('tier 0 clamps to tier 1', () => expect(getStreetWidth(0)).toBe(10));
  it('tier 6 clamps to tier 5', () => expect(getStreetWidth(6)).toBe(52));
  it('each tier is strictly wider than the previous', () => {
    expect(getStreetWidth(2)).toBeGreaterThan(getStreetWidth(1));
    expect(getStreetWidth(3)).toBeGreaterThan(getStreetWidth(2));
    expect(getStreetWidth(4)).toBeGreaterThan(getStreetWidth(3));
    expect(getStreetWidth(5)).toBeGreaterThan(getStreetWidth(4));
  });
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
  it('returns { streets, buildings, blocks } arrays', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    expect(Array.isArray(layout.streets)).toBe(true);
    expect(Array.isArray(layout.buildings)).toBe(true);
    expect(Array.isArray(layout.blocks)).toBe(true);  // legacy field, empty
  });

  it('has at least 1 street', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    expect(layout.streets.length).toBeGreaterThanOrEqual(1);
  });

  it('produces 3 file buildings for the test tree', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    expect(layout.buildings.length).toBe(3);
  });

  it('every building has x, y, w, d, h, file, orient', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const b of layout.buildings) {
      expect(typeof b.x).toBe('number');
      expect(typeof b.y).toBe('number');
      expect(typeof b.w).toBe('number');
      expect(typeof b.d).toBe('number');
      expect(typeof b.h).toBe('number');
      expect(b.file).toBeTruthy();
      expect(typeof b.orient).toBe('string');
    }
  });

  it('every building starts with color = null', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const b of layout.buildings) {
      expect(b.color).toBeNull();
    }
  });

  it('every street has x, y, length, width, orientation, label, dir', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    for (const s of layout.streets) {
      expect(typeof s.x).toBe('number');
      expect(typeof s.y).toBe('number');
      expect(typeof s.length).toBe('number');
      expect(s.length).toBeGreaterThan(0);
      expect(typeof s.width).toBe('number');
      expect(s.width).toBeGreaterThan(0);
      expect(s.orientation === 'x' || s.orientation === 'y').toBe(true);
      expect(typeof s.label).toBe('string');
      expect(s.dir).toBeTruthy();
    }
  });

  it('at least one street has a non-empty label', () => {
    const layout = layoutCity({ tree: TEST_TREE }, TEST_CONFIG);
    const hasLabel = layout.streets.some(s => s.label && s.label.length > 0);
    expect(hasLabel).toBe(true);
  });
});

// ---- Deeply-nested orient correctness ----
//
// Exercises the mirror-orient fix. Builds a tree deep enough that a grandchild
// file goes through TWO levels of mirroring (x-parent primary side → y-subdir
// primary side → x-sub-subdir with a file), then verifies every building's
// orient still points toward its own street after all the coordinate flips.
describe('orient correctness for mirrored subtrees', () => {
  function makeFile(name) {
    return { name, type: 'file', path: name, extension: '.ts',
             size: 500, lines: 20, created: '2024-01-01T00:00:00Z',
             modified: '2024-01-01T00:00:00Z' };
  }
  function makeDir(name, children) {
    return { name, type: 'directory', path: name,
             children_count: children.length,
             descendants_count: children.length + children.filter(c => c.type === 'directory').length,
             descendants_size: 1000, children };
  }

  // Tree: root has several subdirs spanning all sideIdx combinations.
  // aaaa/ (ci=0) -> primary side of root: negateY
  //   inner/ (ci=0) -> primary side of aaaa: negateX
  //     f1.ts (file, orient='s' locally after being in inner-x-street)
  //     f2.ts
  // bbbb/ (ci=1) -> secondary side of root: no mirror
  //   f3.ts
  const TREE = makeDir('root', [
    makeDir('aaaa', [ makeDir('inner', [ makeFile('f1.ts'), makeFile('f2.ts') ]) ]),
    makeDir('bbbb', [ makeFile('f3.ts') ]),
    makeDir('cccc', [ makeFile('f4.ts') ]),
    makeDir('dddd', [ makeFile('f5.ts') ]),
  ]);

  // For each building, verify its door-facing direction actually points at its
  // adjacent street. We find the nearest street and check the direction matches.
  it('every building has orient pointing toward its adjacent street', () => {
    const layout = layoutCity({ tree: TREE }, TEST_CONFIG);

    for (const b of layout.buildings) {
      // Compute the door-face direction in world coords from orient.
      let doorDX = 0, doorDY = 0;
      if (b.orient === 's') doorDY =  1;   // +y
      else if (b.orient === 'n') doorDY = -1;
      else if (b.orient === 'e') doorDX =  1;   // +x
      else if (b.orient === 'w') doorDX = -1;

      // Building edge in the direction of the door.
      const edgeX = b.x + doorDX * b.w / 2;
      const edgeY = b.y + doorDY * b.d / 2;

      // Find the closest street AHEAD OF the door along its facing direction.
      // The door should be within a few units of some street's footprint.
      let matched = false;
      for (const s of layout.streets) {
        // Compute s's footprint rect
        const halfL = s.length / 2;
        const halfW = s.width / 2;
        let sx1, sx2, sy1, sy2;
        if (s.orientation === 'x') {
          sx1 = s.x - halfL; sx2 = s.x + halfL;
          sy1 = s.y - halfW; sy2 = s.y + halfW;
        } else {
          sx1 = s.x - halfW; sx2 = s.x + halfW;
          sy1 = s.y - halfL; sy2 = s.y + halfL;
        }
        // Probe a point a few units in front of the door.
        const probeX = edgeX + doorDX * 5;
        const probeY = edgeY + doorDY * 5;
        if (probeX >= sx1 && probeX <= sx2 && probeY >= sy1 && probeY <= sy2) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(true);
    }
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
