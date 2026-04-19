// =============================================================================
// engine.js — Isometric Rendering Engine
// CodeCity AI — Low-level drawing primitives for the isometric 2.5D city view.
//
// All functions are declared with `function` keyword so they are hoisted and
// available globally after script concatenation.
// =============================================================================

// -----------------------------------------------------------------------------
// Isometric Projection Constants
// ISO_ANGLE = 30° — the classic isometric angle that produces equal-looking
// axes. COS_A and SIN_A are precomputed for performance.
// -----------------------------------------------------------------------------
var ISO_ANGLE = Math.PI / 6;        // 30 degrees
var COS_A = Math.cos(ISO_ANGLE);    // ≈ 0.866
var SIN_A = Math.sin(ISO_ANGLE);    // 0.5


// -----------------------------------------------------------------------------
// isoProject(x, y, z) → { sx, sy }
//
// Converts 3D world coordinates to 2D isometric screen coordinates.
//   x  — world X (east-west axis)
//   y  — world Y (north-south / depth axis)
//   z  — world Z (vertical / height axis)
//
// The resulting sx, sy are relative offsets from the canvas origin. Callers
// are expected to add their pan/translate offset before drawing.
// -----------------------------------------------------------------------------
function isoProject(x, y, z) {
  return {
    sx: (x - y) * COS_A,
    sy: (x + y) * SIN_A - z
  };
}


// -----------------------------------------------------------------------------
// shadeColor(hslString, amount) → hslString
//
// Adjusts the lightness of an HSL color string by `amount` (positive = lighter,
// negative = darker). Clamps lightness to [0, 100].
//
// Example:
//   shadeColor("hsl(210, 80%, 50%)", -20) → "hsl(210, 80%, 30%)"
// -----------------------------------------------------------------------------
function shadeColor(hslString, amount) {
  var components = hslToComponents(hslString);
  var newL = Math.max(0, Math.min(100, components.l + amount));
  return componentsToHsl(components.h, components.s, newL);
}


// -----------------------------------------------------------------------------
// hslToComponents(hslString) → { h, s, l }
//
// Parses an HSL string of the form "hsl(H, S%, L%)" and returns the numeric
// components. Handles both integer and decimal values.
// -----------------------------------------------------------------------------
function hslToComponents(hslString) {
  // Strip "hsl(" prefix and ")" suffix, then split on commas
  var inner = hslString.replace(/^hsl\(/i, '').replace(/\)$/, '');
  var parts = inner.split(',');
  return {
    h: parseFloat(parts[0].trim()),
    s: parseFloat(parts[1].trim()),   // strips the "%" via parseFloat
    l: parseFloat(parts[2].trim())    // strips the "%" via parseFloat
  };
}


// -----------------------------------------------------------------------------
// componentsToHsl(h, s, l) → hslString
//
// Rebuilds an HSL string from numeric components. Values are rounded to one
// decimal place to keep strings compact.
// -----------------------------------------------------------------------------
function componentsToHsl(h, s, l) {
  return 'hsl(' + Math.round(h) + ', ' + s.toFixed(1) + '%, ' + l.toFixed(1) + '%)';
}


// -----------------------------------------------------------------------------
// drawBuilding(ctx, cx, cy, w, d, h, hslColor)
//
// Renders a building as a STACK OF FLOORS, where each floor is a complete unit
// (walls + ceiling slab + windows). The number of floors is derived from the
// requested building height divided by FLOOR_HEIGHT (a fixed real-world size),
// so a 30-unit building has 3 floors and a 60-unit building has 6 — every
// floor in every building is the same size. The actual rendered height is
// snapped to the nearest multiple of FLOOR_HEIGHT.
//
// Per floor: walls (front + right) + a thin "ceiling slab" sitting on top,
// slightly darker than the walls so it reads as a horizontal banding between
// floors. Each floor's wall has one row of windows. The bottom floor's front
// wall has the entrance door instead of a window row.
//
// Painter's order is implicit: floors are drawn bottom-to-top, and within
// each floor the front wall, right wall, slab faces, top (only on the topmost
// floor), windows, and door are drawn in z-order so nothing is overdrawn.
// -----------------------------------------------------------------------------
function drawBuilding(ctx, cx, cy, w, d, h, hslColor) {
  var hw = w / 2;
  var hd = d / 2;

  function tx(p) { return cx + p.sx; }
  function ty(p) { return cy + p.sy; }

  ctx.globalAlpha = 1;

  // Floor structure — fixed-size floors. Number of floors derived from height.
  var FLOOR_HEIGHT = 10;
  var floors = Math.max(1, Math.round(h / FLOOR_HEIGHT));
  var slabT  = 1;                      // ceiling slab thickness per floor
  var wallH  = FLOOR_HEIGHT - slabT;   // wall height per floor

  // Face & accent colors — same hue shifts as before for sun/sky lighting.
  var colorTop   = hslColor;
  var colorFront = _shadeAndShiftHue(hslColor, -10,  18);  // lit, warmer
  var colorRight = _shadeAndShiftHue(hslColor, -32, -18);  // shadow, cooler
  var slabFront  = _shadeAndShiftHue(hslColor, -18,  18);  // banding stripe (front)
  var slabRight  = _shadeAndShiftHue(hslColor, -36, -18);  // banding stripe (right)
  var winColor   = shadeColor(hslColor, 20);
  var doorColor  = _shadeAndShiftHue(hslColor, -55,   0);

  var frontCols = Math.max(1, Math.min(5, Math.floor(w / 8)));
  var rightCols = Math.max(1, Math.min(5, Math.floor(d / 8)));

  // Stack floors bottom → top. Each floor occupies z ∈ [fi·FH, (fi+1)·FH].
  for (var fi = 0; fi < floors; fi++) {
    var zWb = fi * FLOOR_HEIGHT;        // wall bottom of this floor
    var zWt = zWb + wallH;              // wall top (= slab bottom)
    var zSt = (fi + 1) * FLOOR_HEIGHT;  // slab top (= top of this floor)

    // Project all corners we'll need for this floor
    var wprb  = isoProject( hw,  hd, zWb);
    var wplb  = isoProject(-hw,  hd, zWb);
    var wprf  = isoProject( hw, -hd, zWb);
    var wprbt = isoProject( hw,  hd, zWt);
    var wplbt = isoProject(-hw,  hd, zWt);
    var wprft = isoProject( hw, -hd, zWt);
    var sprbt = isoProject( hw,  hd, zSt);
    var splbt = isoProject(-hw,  hd, zSt);
    var sprft = isoProject( hw, -hd, zSt);

    // ---- Wall: FRONT face (y = +hd) ----
    ctx.beginPath();
    ctx.moveTo(tx(wprb),  ty(wprb));
    ctx.lineTo(tx(wplb),  ty(wplb));
    ctx.lineTo(tx(wplbt), ty(wplbt));
    ctx.lineTo(tx(wprbt), ty(wprbt));
    ctx.closePath();
    ctx.fillStyle = colorFront;
    ctx.fill();

    // ---- Wall: RIGHT face (x = +hw) ----
    ctx.beginPath();
    ctx.moveTo(tx(wprf),  ty(wprf));
    ctx.lineTo(tx(wprb),  ty(wprb));
    ctx.lineTo(tx(wprbt), ty(wprbt));
    ctx.lineTo(tx(wprft), ty(wprft));
    ctx.closePath();
    ctx.fillStyle = colorRight;
    ctx.fill();

    // ---- Ceiling slab: FRONT face (thin band atop the wall) ----
    ctx.beginPath();
    ctx.moveTo(tx(wprbt), ty(wprbt));
    ctx.lineTo(tx(wplbt), ty(wplbt));
    ctx.lineTo(tx(splbt), ty(splbt));
    ctx.lineTo(tx(sprbt), ty(sprbt));
    ctx.closePath();
    ctx.fillStyle = slabFront;
    ctx.fill();

    // ---- Ceiling slab: RIGHT face ----
    ctx.beginPath();
    ctx.moveTo(tx(wprft), ty(wprft));
    ctx.lineTo(tx(wprbt), ty(wprbt));
    ctx.lineTo(tx(sprbt), ty(sprbt));
    ctx.lineTo(tx(sprft), ty(sprft));
    ctx.closePath();
    ctx.fillStyle = slabRight;
    ctx.fill();

    // ---- Top face: ONLY for the topmost floor (= the building's roof) ----
    if (fi === floors - 1) {
      var pTopFront = isoProject(-hw, -hd, zSt);
      ctx.beginPath();
      ctx.moveTo(tx(sprft),     ty(sprft));
      ctx.lineTo(tx(sprbt),     ty(sprbt));
      ctx.lineTo(tx(splbt),     ty(splbt));
      ctx.lineTo(tx(pTopFront), ty(pTopFront));
      ctx.closePath();
      ctx.fillStyle = colorTop;
      ctx.fill();
    }

    // ---- Windows: one row per floor ----
    // Right face: every floor.
    _drawFaceWindows(ctx, cx, cy, rightCols, 1,
      wprf, wprb, wprft, wprbt, 0.40, 0.50, winColor);
    // Front face: every floor EXCEPT the bottom (which has the door).
    if (fi > 0) {
      _drawFaceWindows(ctx, cx, cy, frontCols, 1,
        wprb, wplb, wprbt, wplbt, 0.40, 0.50, winColor);
    }

    // ---- Door: bottom floor only, on the front wall ----
    if (fi === 0 && w > 2) {
      var doorWFrac = Math.min(0.30, 3.5 / w);
      var doorHFrac = 0.65;  // tops out just below the window row (which ends at v=0.70)
      var doorU0 = 0.5 - doorWFrac / 2;
      var doorU1 = 0.5 + doorWFrac / 2;

      // Bilinear across the bottom floor's front face.
      // U=0 at wprb (screen-LEFT corner), U=1 at wplb (screen-RIGHT).
      var doorPt = function (u, v) {
        var bx   = wprb.sx  + u * (wplb.sx  - wprb.sx);
        var by   = wprb.sy  + u * (wplb.sy  - wprb.sy);
        var topx = wprbt.sx + u * (wplbt.sx - wprbt.sx);
        var topy = wprbt.sy + u * (wplbt.sy - wprbt.sy);
        return {
          sx: cx + bx + v * (topx - bx),
          sy: cy + by + v * (topy - by)
        };
      };

      var d00 = doorPt(doorU0, 0);
      var d10 = doorPt(doorU1, 0);
      var d11 = doorPt(doorU1, doorHFrac);
      var d01 = doorPt(doorU0, doorHFrac);

      ctx.beginPath();
      ctx.moveTo(d00.sx, d00.sy);
      ctx.lineTo(d10.sx, d10.sy);
      ctx.lineTo(d11.sx, d11.sy);
      ctx.lineTo(d01.sx, d01.sy);
      ctx.closePath();
      ctx.fillStyle = doorColor;
      ctx.fill();
    }
  }
}


// -----------------------------------------------------------------------------
// _shadeAndShiftHue(hslString, lightnessDelta, hueDelta) → hslString
//
// Like shadeColor but also rotates the hue. Used for face shading: positive
// hueDelta warms (toward yellow/red), negative cools (toward blue/cyan).
// -----------------------------------------------------------------------------
function _shadeAndShiftHue(hslString, lightnessDelta, hueDelta) {
  var c = hslToComponents(hslString);
  var newL = Math.max(0, Math.min(100, c.l + lightnessDelta));
  var newH = ((c.h + hueDelta) % 360 + 360) % 360;
  return componentsToHsl(newH, c.s, newL);
}


// -----------------------------------------------------------------------------
// _drawBuildingWindows (private helper)
//
// Draws proportional window grids on the right and left faces of a building.
// Window count, size, and spacing are derived from building dimensions so they
// scale naturally. Called only by drawBuilding when the building is large enough.
//
// Windows are drawn as small semi-transparent bright rectangles approximated
// as isometric parallelograms on each face.
// -----------------------------------------------------------------------------
function _drawBuildingWindows(ctx, cx, cy, w, d, h, hslColor,
  plf, prf, prb, prbt, prft, plft, plbt, plb) {

  // Window color — a lighter, fully opaque version of the building color
  // Using transparent windows caused see-through artifacts when buildings overlap
  var winColor = shadeColor(hslColor, 20);

  // Only draw windows on the 2 visible walls (left and right).
  // The y=-hd and y=+hd faces are not visible in this isometric projection.
  var colsPerWall = Math.max(1, Math.min(5, Math.floor(d / 8)));
  var rows        = Math.max(1, Math.min(8, Math.floor(h / 10)));

  var winWidthFrac  = 0.35;
  var winHeightFrac = 0.40;

  // ---- Left wall windows (x = -hw) -----------------------------------------
  // Bottom edge: plb → plf, Top edge: plbt → plft
  _drawFaceWindows(ctx, cx, cy, colsPerWall, rows,
    plb, plf, plbt, plft, winWidthFrac, winHeightFrac, winColor);

  // ---- Right wall windows (x = +hw) ----------------------------------------
  // Bottom edge: prf → prb, Top edge: prft → prbt
  _drawFaceWindows(ctx, cx, cy, colsPerWall, rows,
    prf, prb, prft, prbt, winWidthFrac, winHeightFrac, winColor);
}


// -----------------------------------------------------------------------------
// _drawFaceWindows (private helper)
//
// Draws a grid of windows on a single isometric building face.
//
// The face is defined by four corner projected points (already in raw isoProject
// coordinate space, without cx/cy offset — the offset is applied here):
//   bl — bottom-left corner of face (isoProject result, no cx/cy)
//   br — bottom-right corner of face
//   tl — top-left corner of face
//   tr — top-right corner of face
//
// We use bilinear interpolation across the face to place each window cell,
// which naturally handles the isometric skew of the face.
// -----------------------------------------------------------------------------
function _drawFaceWindows(ctx, cx, cy, cols, rows, bl, br, tl, tr,
  winWidthFrac, winHeightFrac, winColor, startRow) {

  // startRow lets a caller skip the bottom-most N rows while keeping the
  // overall row spacing intact (so windows on different faces can stay
  // aligned to the same grid even if some rows are omitted).
  startRow = startRow || 0;

  // Bilinear interpolation on a face defined by raw isoProject corners.
  // U=0 → left edge, U=1 → right edge.
  // V=0 → bottom edge, V=1 → top edge.
  // Returns screen-space coordinates (cx/cy applied).
  function facePoint(u, v) {
    // Interpolate along bottom edge at fraction U
    var bx = bl.sx + u * (br.sx - bl.sx);
    var by = bl.sy + u * (br.sy - bl.sy);
    // Interpolate along top edge at fraction U
    var topx = tl.sx + u * (tr.sx - tl.sx);
    var topy = tl.sy + u * (tr.sy - tl.sy);
    // Interpolate vertically between bottom and top at fraction V
    return {
      sx: cx + bx + v * (topx - bx),
      sy: cy + by + v * (topy - by)
    };
  }

  var margin = 0.1; // fraction of face kept as border (no windows in border zone)

  for (var row = startRow; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      // Cell bounds in [0,1] face-UV space, inset by margin
      var cellU0 = margin + (col     / cols) * (1 - 2 * margin);
      var cellU1 = margin + ((col+1) / cols) * (1 - 2 * margin);
      var cellV0 = margin + (row     / rows) * (1 - 2 * margin);
      var cellV1 = margin + ((row+1) / rows) * (1 - 2 * margin);

      // Window UV within the cell (centered, smaller than the cell)
      var winU0 = cellU0 + (cellU1 - cellU0) * (0.5 - winWidthFrac  / 2);
      var winU1 = cellU0 + (cellU1 - cellU0) * (0.5 + winWidthFrac  / 2);
      var winV0 = cellV0 + (cellV1 - cellV0) * (0.5 - winHeightFrac / 2);
      var winV1 = cellV0 + (cellV1 - cellV0) * (0.5 + winHeightFrac / 2);

      // Four corners of the window quad (screen-space)
      var wbl = facePoint(winU0, winV0);
      var wbr = facePoint(winU1, winV0);
      var wtr = facePoint(winU1, winV1);
      var wtl = facePoint(winU0, winV1);

      ctx.beginPath();
      ctx.moveTo(wbl.sx, wbl.sy);
      ctx.lineTo(wbr.sx, wbr.sy);
      ctx.lineTo(wtr.sx, wtr.sy);
      ctx.lineTo(wtl.sx, wtl.sy);
      ctx.closePath();
      ctx.fillStyle = winColor;
      ctx.fill();
    }
  }
}


// -----------------------------------------------------------------------------
// drawGround(ctx, x, y, w, d, fill, stroke)
//
// Draws an isometric ground plane (flat rectangle) for city blocks and streets.
//
//   ctx    — Canvas 2D context
//   x, y   — Screen-space center of the rectangle (already translated for pan/zoom)
//   w      — Width  (world units, controls left-right span)
//   d      — Depth  (world units, controls front-back span)
//   fill   — Fill color string (CSS color), or null to skip fill
//   stroke — Stroke color string (CSS color), or null to skip stroke
//
// The ground quad is the bottom face of a 3D box at z=0. The four corners are
// the standard isometric diamond seen from above.
// -----------------------------------------------------------------------------
function drawGround(ctx, x, y, w, d, fill, stroke) {
  var hw = w / 2;
  var hd = d / 2;

  // Project the four corners of the rectangular ground tile (z = 0).
  // This produces the correct isometric parallelogram for a w×d rectangle.
  var pfl = isoProject(-hw, -hd, 0);  // front-left  (north-west)
  var pfr = isoProject( hw, -hd, 0);  // front-right (north-east)
  var pbr = isoProject( hw,  hd, 0);  // back-right  (south-east)
  var pbl = isoProject(-hw,  hd, 0);  // back-left   (south-west)

  ctx.beginPath();
  ctx.moveTo(x + pfl.sx, y + pfl.sy);
  ctx.lineTo(x + pfr.sx, y + pfr.sy);
  ctx.lineTo(x + pbr.sx, y + pbr.sy);
  ctx.lineTo(x + pbl.sx, y + pbl.sy);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}


// -----------------------------------------------------------------------------
// drawLabel(ctx, x, y, text, color)
//
// Draws a text label at the given screen-space position, suitable for rendering
// directory names on or near their ground blocks.
//
//   ctx   — Canvas 2D context
//   x, y  — Screen-space position (already translated for pan/zoom)
//   text  — Label string to render
//   color — CSS color string for the text
//
// The label is drawn with a slight shadow for readability against dark ground.
// -----------------------------------------------------------------------------
function drawLabel(ctx, x, y, text, color) {
  if (!text) return;

  ctx.save();
  ctx.font = '10px "Inter", "SF Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shadow for readability
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000000';
  ctx.fillText(text, x + 1, y + 1);

  // Main text
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, x, y);

  ctx.restore();
}


// -----------------------------------------------------------------------------
// setupCanvas(canvas) → ctx
//
// Prepares a canvas element for DPR-aware (retina) rendering.
//
// On high-DPI displays, the canvas pixel buffer is scaled up by devicePixelRatio
// so drawing operations are sharp. The context is pre-scaled so callers can use
// logical CSS pixel coordinates without worrying about DPR.
//
// Returns the 2D rendering context, ready to use.
// -----------------------------------------------------------------------------
function setupCanvas(canvas) {
  var dpr  = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();

  // Set the backing store size to physical pixels
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;

  var ctx = canvas.getContext('2d');

  // Scale all drawing operations so 1 unit = 1 CSS pixel
  ctx.scale(dpr, dpr);

  return ctx;
}

// CommonJS exports for Vitest (guarded so browser concatenation still works)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isoProject,
    hslToComponents,
    componentsToHsl,
    shadeColor,
    drawBuilding,
    drawGround,
    drawLabel,
    setupCanvas,
  };
}
