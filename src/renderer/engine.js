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
// Draws a complete isometric building centered at screen position (cx, cy).
//
//   ctx      — Canvas 2D context
//   cx, cy   — Screen-space center of the building base (already translated
//              for pan/zoom — this is where the building "sits" on the ground)
//   w        — Building width  (world units, controls left-right span)
//   d        — Building depth  (world units, controls front-back span)
//   h        — Building height (world units, controls vertical span)
//   hslColor — Base HSL color string "hsl(H, S%, L%)"
//
// Face shading convention:
//   Top face  — base color (most visible, brightest)
//   Right face — base color darkened by 30 (mid shade, lit side)
//   Left face  — base color darkened by 50 (darkest, shadow side)
//
// The isometric coordinate system used here:
//   - World origin is at (0, 0, 0)
//   - Building occupies world box: x ∈ [-w/2, w/2], y ∈ [-d/2, d/2], z ∈ [0, h]
//   - All 8 corners are projected via isoProject and the three visible faces
//     are drawn as filled polygons.
// -----------------------------------------------------------------------------
function drawBuilding(ctx, cx, cy, w, d, h, hslColor) {
  // Half-extents for clarity
  var hw = w / 2;
  var hd = d / 2;

  // Project all 8 corners of the building bounding box.
  // Naming: p[xyz][xyz] where first letter = x-side (l=left/-x, r=right/+x),
  // second = y-side (f=front/-y, b=back/+y), third = z-side (b=bottom, t=top).
  //
  // Bottom face corners (z = 0)
  var plf = isoProject(-hw, -hd, 0);  // left-front-bottom
  var prf = isoProject( hw, -hd, 0);  // right-front-bottom
  var prb = isoProject( hw,  hd, 0);  // right-back-bottom
  var plb = isoProject(-hw,  hd, 0);  // left-back-bottom

  // Top face corners (z = h)
  var plft = isoProject(-hw, -hd, h); // left-front-top
  var prft = isoProject( hw, -hd, h); // right-front-top
  var prbt = isoProject( hw,  hd, h); // right-back-top
  var plbt = isoProject(-hw,  hd, h); // left-back-top

  // Helper: translate a projected point by the screen center offset
  function tx(p) { return cx + p.sx; }
  function ty(p) { return cy + p.sy; }

  // ---- Determine face colors --------------------------------------------------
  var colorTop   = hslColor;                    // base color
  var colorRight = shadeColor(hslColor, -30);   // mid shade (right/lit side)
  var colorLeft  = shadeColor(hslColor, -50);   // darkest (left/shadow side)

  // Ensure all faces are fully opaque (no bleed-through from prior globalAlpha)
  ctx.globalAlpha = 1;

  // In isometric view (camera from bottom-right), the 3 visible faces are:
  //   1. Front-left face  (y = -hd) — faces the viewer on the left side
  //   2. Front-right face (x = +hw) — faces the viewer on the right side
  //   3. Top face         (z = h)   — visible from above

  // ---- Draw front-left face (shadow side) ------------------------------------
  // The face at y = -hd: plf (left-front-bottom) → prf (right-front-bottom)
  //                       → prft (right-front-top) → plft (left-front-top)
  ctx.beginPath();
  ctx.moveTo(tx(plf),  ty(plf));
  ctx.lineTo(tx(prf),  ty(prf));
  ctx.lineTo(tx(prft), ty(prft));
  ctx.lineTo(tx(plft), ty(plft));
  ctx.closePath();
  ctx.fillStyle = colorLeft;
  ctx.fill();

  // ---- Draw front-right face (lit side) --------------------------------------
  // The face at x = +hw: prf (right-front-bottom) → prb (right-back-bottom)
  //                       → prbt (right-back-top) → prft (right-front-top)
  ctx.beginPath();
  ctx.moveTo(tx(prf),  ty(prf));
  ctx.lineTo(tx(prb),  ty(prb));
  ctx.lineTo(tx(prbt), ty(prbt));
  ctx.lineTo(tx(prft), ty(prft));
  ctx.closePath();
  ctx.fillStyle = colorRight;
  ctx.fill();

  // ---- Draw top face ---------------------------------------------------------
  // Vertices: plft → prft → prbt → plbt
  ctx.beginPath();
  ctx.moveTo(tx(plft), ty(plft));
  ctx.lineTo(tx(prft), ty(prft));
  ctx.lineTo(tx(prbt), ty(prbt));
  ctx.lineTo(tx(plbt), ty(plbt));
  ctx.closePath();
  ctx.fillStyle = colorTop;
  ctx.fill();

  // ---- Window details --------------------------------------------------------
  // Draw windows on the right and left faces when the building is tall enough
  // and wide/deep enough to make windows visible. Conditions:
  //   h > 14 — building tall enough to have multiple floors
  //   w > 6 || d > 6 — building wide/deep enough for windows to be readable
  // (The spec states "w/d > 6" which we interpret as either w or d exceeding 6,
  //  since a strict ratio check would exclude most moderate buildings.)
  if (h > 14 && (w > 6 || d > 6)) {
    _drawBuildingWindows(ctx, cx, cy, w, d, h, hslColor,
      plf, prf, prb, prbt, prft, plft, plbt, plb);
  }

  // ---- Edge highlights -------------------------------------------------------
  // Subtle white rim lighting along the top edges to separate faces and add
  // visual crispness on the isometric silhouette.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 0.75;

  // Vertical front-left edge
  ctx.beginPath();
  ctx.moveTo(tx(plf),  ty(plf));
  ctx.lineTo(tx(plft), ty(plft));
  ctx.stroke();

  // Vertical front-right edge
  ctx.beginPath();
  ctx.moveTo(tx(prf),  ty(prf));
  ctx.lineTo(tx(prft), ty(prft));
  ctx.stroke();

  // Top ridge: left → front → right → back (full top perimeter)
  ctx.beginPath();
  ctx.moveTo(tx(plbt), ty(plbt));
  ctx.lineTo(tx(plft), ty(plft));
  ctx.lineTo(tx(prft), ty(prft));
  ctx.lineTo(tx(prbt), ty(prbt));
  ctx.lineTo(tx(plbt), ty(plbt));
  ctx.stroke();
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

  // Number of window columns and rows — scale with building size, capped
  var colsFrontLeft  = Math.max(1, Math.min(5, Math.floor(w / 8)));
  var colsFrontRight = Math.max(1, Math.min(5, Math.floor(d / 8)));
  var rows           = Math.max(1, Math.min(8, Math.floor(h / 10)));

  // Window proportions relative to the face cell size
  var winWidthFrac  = 0.35;
  var winHeightFrac = 0.40;

  // ---- Front-left face windows (y = -hd) ------------------------------------
  // Bottom: plf → prf, Top: plft → prft
  _drawFaceWindows(ctx, cx, cy, colsFrontLeft, rows,
    plf, prf, plft, prft, winWidthFrac, winHeightFrac, winColor);

  // ---- Front-right face windows (x = +hw) -----------------------------------
  // Bottom: prf → prb, Top: prft → prbt
  _drawFaceWindows(ctx, cx, cy, colsFrontRight, rows,
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
  winWidthFrac, winHeightFrac, winColor) {

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

  for (var row = 0; row < rows; row++) {
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
