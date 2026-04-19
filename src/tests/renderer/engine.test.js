// engine.test.js — Unit tests for src/renderer/engine.js
import { describe, it, expect } from 'vitest';

// Load the renderer file via CommonJS exports
const {
  isoProject,
  hslToComponents,
  componentsToHsl,
  shadeColor,
  drawBuilding,
  drawGround,
  drawLabel,
} = require('../../renderer/engine.js');

// Minimal canvas 2D context mock for drawing tests
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

// ---- isoProject ----
describe('isoProject', () => {
  it('maps origin to (0, 0)', () => {
    const p = isoProject(0, 0, 0);
    expect(p.sx).toBeCloseTo(0, 5);
    expect(p.sy).toBeCloseTo(0, 5);
  });

  it('projects x=10 correctly', () => {
    const p = isoProject(10, 0, 0);
    expect(p.sx).toBeCloseTo(8.660, 2);
    expect(p.sy).toBeCloseTo(5.0, 2);
  });

  it('projects y=10 correctly', () => {
    const p = isoProject(0, 10, 0);
    expect(p.sx).toBeCloseTo(-8.660, 2);
    expect(p.sy).toBeCloseTo(5.0, 2);
  });

  it('projects z=10 correctly (pure vertical)', () => {
    const p = isoProject(0, 0, 10);
    expect(p.sx).toBeCloseTo(0, 5);
    expect(p.sy).toBeCloseTo(-10, 5);
  });

  it('projects diagonal x=y correctly (sx cancels)', () => {
    const p = isoProject(5, 5, 0);
    expect(p.sx).toBeCloseTo(0, 3);
    expect(p.sy).toBeCloseTo(5, 3);
  });

  it('returns an object with sx and sy keys', () => {
    const p = isoProject(1, 2, 3);
    expect(p).toHaveProperty('sx');
    expect(p).toHaveProperty('sy');
    expect(typeof p.sx).toBe('number');
    expect(typeof p.sy).toBe('number');
  });
});

// ---- hslToComponents ----
describe('hslToComponents', () => {
  it('parses "hsl(210, 80%, 50%)" correctly', () => {
    const c = hslToComponents('hsl(210, 80%, 50%)');
    expect(c.h).toBe(210);
    expect(c.s).toBe(80);
    expect(c.l).toBe(50);
  });

  it('parses "hsl(0, 0%, 100%)" correctly', () => {
    const c = hslToComponents('hsl(0, 0%, 100%)');
    expect(c.h).toBe(0);
    expect(c.s).toBe(0);
    expect(c.l).toBe(100);
  });

  it('handles case-insensitive prefix', () => {
    const c = hslToComponents('HSL(120, 50%, 30%)');
    expect(c.h).toBe(120);
    expect(c.s).toBe(50);
    expect(c.l).toBe(30);
  });
});

// ---- componentsToHsl ----
describe('componentsToHsl', () => {
  it('formats integer hue', () => {
    expect(componentsToHsl(210, 80, 50)).toBe('hsl(210, 80.0%, 50.0%)');
  });

  it('rounds fractional hue', () => {
    expect(componentsToHsl(210.4, 80, 50)).toBe('hsl(210, 80.0%, 50.0%)');
  });

  it('handles zeros and hundreds', () => {
    expect(componentsToHsl(0, 0, 100)).toBe('hsl(0, 0.0%, 100.0%)');
  });
});

// ---- shadeColor ----
describe('shadeColor', () => {
  it('darkens by 30', () => {
    expect(shadeColor('hsl(210, 80%, 50%)', -30)).toBe('hsl(210, 80.0%, 20.0%)');
  });

  it('lightens by 30', () => {
    expect(shadeColor('hsl(210, 80%, 50%)', 30)).toBe('hsl(210, 80.0%, 80.0%)');
  });

  it('clamps to 0 at bottom', () => {
    expect(shadeColor('hsl(210, 80%, 5%)', -30)).toBe('hsl(210, 80.0%, 0.0%)');
  });

  it('clamps to 100 at top', () => {
    expect(shadeColor('hsl(210, 80%, 95%)', 30)).toBe('hsl(210, 80.0%, 100.0%)');
  });

  it('preserves color on zero amount', () => {
    expect(shadeColor('hsl(210, 80%, 50%)', 0)).toBe('hsl(210, 80.0%, 50.0%)');
  });
});

// ---- drawBuilding ----
describe('drawBuilding', () => {
  it('does not throw with mock ctx', () => {
    expect(() => {
      drawBuilding(mockCtx(), 0, 0, 20, 20, 50, 'hsl(215, 80%, 50%)');
    }).not.toThrow();
  });

  it('does not throw with tall building (triggers windows)', () => {
    expect(() => {
      drawBuilding(mockCtx(), 0, 0, 30, 30, 80, 'hsl(215, 80%, 50%)');
    }).not.toThrow();
  });

  it('does not throw with min-size building', () => {
    expect(() => {
      drawBuilding(mockCtx(), 0, 0, 6, 6, 4, 'hsl(200, 40%, 50%)');
    }).not.toThrow();
  });
});

// ---- drawGround ----
describe('drawGround', () => {
  it('does not throw with mock ctx', () => {
    expect(() => {
      drawGround(mockCtx(), 0, 0, 40, 40, 'rgba(18,24,40,0.95)', 'rgba(60,80,120,0.4)');
    }).not.toThrow();
  });

  it('does not throw with null fill/stroke', () => {
    expect(() => {
      drawGround(mockCtx(), 0, 0, 40, 40, null, null);
    }).not.toThrow();
  });
});

// ---- drawLabel ----
describe('drawLabel', () => {
  it('renders text without throwing', () => {
    expect(() => {
      drawLabel(mockCtx(), 0, 0, 'src', '#ffffff');
    }).not.toThrow();
  });

  it('handles empty text without throwing', () => {
    expect(() => {
      drawLabel(mockCtx(), 0, 0, '', '#ffffff');
    }).not.toThrow();
  });
});
