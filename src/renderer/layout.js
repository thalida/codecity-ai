// =============================================================================
// layout.js — Grid Layout Algorithm
// CodeCity AI — Computes world-space positions for buildings, blocks, and streets.
//
// All functions are declared with `function` keyword so they are hoisted and
// available globally after script concatenation. No imports or dependencies
// except isoProject from engine.js (used in _computeHitBox).
//
// Interface contract:
//   Building: { x, y, w, d, h, color, file, hitBox: { x, y, w, h } }
//   Block:    { x, y, w, d, label, dir }
//
// The layout pipeline:
//   1. getBuildingDimensions  — derives w/d/h from file metadata
//   2. layoutBlock            — places buildings inside a single directory block
//   3. layoutCity             — tiles blocks on a top-level grid with streets
//   4. sortForRendering       — painter's-algorithm sort for correct overdraw order
// =============================================================================


// -----------------------------------------------------------------------------
// getStreetTier(childrenCount, tiers) -> number [1-5]
//
// Maps a directory's child count to one of 5 street tiers using threshold
// breakpoints. The tiers array contains 4 thresholds from config
// (e.g. [3, 8, 15, 30]).
// -----------------------------------------------------------------------------
function getStreetTier(childrenCount, tiers) {
  if (childrenCount <= tiers[0]) return 1;
  if (childrenCount <= tiers[1]) return 2;
  if (childrenCount <= tiers[2]) return 3;
  if (childrenCount <= tiers[3]) return 4;
  return 5;
}


// -----------------------------------------------------------------------------
// getStreetWidth(tier) -> number
//
// Returns the pixel width of a street for the given tier.
// -----------------------------------------------------------------------------
function getStreetWidth(tier) {
  var widths = [0, 4, 8, 14, 22, 32];
  var t = Math.max(1, Math.min(5, Math.round(tier)));
  return widths[t];
}


// -----------------------------------------------------------------------------
// getBuildingDimensions(file, config) -> { w, d, h }
//
// Derives isometric building dimensions from file metadata using logarithmic
// scaling so that both tiny and enormous files produce readable buildings.
//
//   h — from line count  (more lines -> taller)
//   w — from file size in bytes (larger file -> wider)
//   d — average of h and w: (h + w) / 2
// -----------------------------------------------------------------------------
function getBuildingDimensions(file, config) {
  var bc = config.building;

  // ---- Height from line count ------------------------------------------------
  var lines = (file.lines && file.lines > 0) ? file.lines : 1;
  var logLines    = Math.log(lines);
  var logLinesMax = Math.log(100000);  // reference ceiling: 100k lines
  var tH = Math.max(0, Math.min(1, logLines / logLinesMax));
  var height = bc.min_height + tH * (bc.max_height - bc.min_height);
  height = Math.max(bc.min_height, Math.min(bc.max_height, height));

  // ---- Width from file size in bytes ----------------------------------------
  var bytes = (file.size && file.size > 0) ? file.size : 1;
  var logBytes    = Math.log(bytes);
  var logBytesMax = Math.log(10 * 1024 * 1024);  // reference ceiling: 10 MB
  var tW = Math.max(0, Math.min(1, logBytes / logBytesMax));
  var width = bc.min_width + tW * (bc.max_width - bc.min_width);
  width = Math.max(bc.min_width, Math.min(bc.max_width, width));

  // ---- Depth = average of height and width ----------------------------------
  var depth = (height + width) / 2;

  return {
    w: Math.round(width  * 10) / 10,
    d: Math.round(depth  * 10) / 10,
    h: Math.round(height * 10) / 10
  };
}


// -----------------------------------------------------------------------------
// Street-network layout constants
// -----------------------------------------------------------------------------
var STREET_WIDTH = 14;   // street width perpendicular to its orientation
var CHILD_GAP    = 5;    // gap between adjacent children (files or subdirs)
// END_PAD must be at least STREET_WIDTH/2 + buffer so that a child placed at
// the start of THIS street doesn't cross over the PARENT street's footprint at
// the intersection. (A child's near-edge sits at along-street position = END_PAD;
// parent's far-edge is at STREET_WIDTH/2 from its centerline.)
var END_PAD      = STREET_WIDTH / 2 + 3;  // 10 units
var BLDG_OFFSET  = STREET_WIDTH / 2 + 4;  // street centerline → building near-edge


// -----------------------------------------------------------------------------
// _computeHitBox(x, y, w, d, h) -> { x, y, w, h }
//
// Projects all 8 corners of a building's bounding box into screen space using
// isoProject and returns the axis-aligned bounding rectangle for hit testing.
// -----------------------------------------------------------------------------
function _computeHitBox(bx, by, w, d, h) {
  var hw = w / 2;
  var hd = d / 2;

  // Project the building's world center to isometric screen space
  var center = isoProject(bx, by, 0);

  var corners = [
    isoProject(-hw, -hd, 0),
    isoProject( hw, -hd, 0),
    isoProject( hw,  hd, 0),
    isoProject(-hw,  hd, 0),
    isoProject(-hw, -hd, h),
    isoProject( hw, -hd, h),
    isoProject( hw,  hd, h),
    isoProject(-hw,  hd, h)
  ];

  var minSx = Infinity, maxSx = -Infinity;
  var minSy = Infinity, maxSy = -Infinity;
  for (var i = 0; i < corners.length; i++) {
    if (corners[i].sx < minSx) minSx = corners[i].sx;
    if (corners[i].sx > maxSx) maxSx = corners[i].sx;
    if (corners[i].sy < minSy) minSy = corners[i].sy;
    if (corners[i].sy > maxSy) maxSy = corners[i].sy;
  }

  return {
    x: center.sx + minSx,
    y: center.sy + minSy,
    w: maxSx - minSx,
    h: maxSy - minSy
  };
}


// -----------------------------------------------------------------------------
// layoutCity(manifest, config) -> { streets, buildings, blocks }
//
// Top-level layout function. Walks the directory tree and produces a STREET
// NETWORK in world coordinates: each directory becomes a street, files line
// the street's "near" side as buildings, and subdirectories branch off the
// "far" side as perpendicular streets (recursively).
//
// Return shape:
//   streets:   [{ x, y, length, width, orientation, label, dir }]
//   buildings: [{ x, y, w, d, h, color, file, orient, hitBox: { x, y, w, h } }]
//   blocks:    []  (kept for backward-compat with hit-testing code; unused)
//
// `color` starts as null — the renderer must call getBuildingColor before drawing.
// -----------------------------------------------------------------------------
function layoutCity(manifest, config) {
  var tree = manifest.tree || manifest;
  var result = { streets: [], buildings: [], paths: [], blocks: [] };

  _layoutDir(tree, config, 0, 0, 'x', result);

  // Compute paths from each building's door to the adjacent street
  for (var pi = 0; pi < result.buildings.length; pi++) {
    var path = _pathForBuilding(result.buildings[pi]);
    if (path) result.paths.push(path);
  }

  // Compute screen-space hit boxes for each building
  for (var i = 0; i < result.buildings.length; i++) {
    var b = result.buildings[i];
    b.hitBox = _computeHitBox(b.x, b.y, b.w, b.d, b.h);
  }

  return result;
}


// -----------------------------------------------------------------------------
// _pathForBuilding(building) -> path | null
//
// Returns a thin sidewalk-colored strip connecting the building's door (on its
// front face) to the adjacent street's sidewalk. Returns null for buildings
// with hidden doors ('n' or 'w' orientation) — no visible door, no visible path.
// -----------------------------------------------------------------------------
var _PATH_LENGTH = BLDG_OFFSET - STREET_WIDTH / 2;  // distance from building face to street edge
var _PATH_WIDTH  = 3;                                // narrow walkway

function _pathForBuilding(b) {
  if (b.orient === 's') {
    // Door on +y face → path extends from building's +y edge northward to street
    return {
      x: b.x,
      y: b.y + b.d / 2 + _PATH_LENGTH / 2,
      w: _PATH_WIDTH,
      d: _PATH_LENGTH
    };
  }
  if (b.orient === 'e') {
    // Door on +x face → path extends from building's +x edge eastward to street
    return {
      x: b.x + b.w / 2 + _PATH_LENGTH / 2,
      y: b.y,
      w: _PATH_LENGTH,
      d: _PATH_WIDTH
    };
  }
  if (b.orient === 'n') {
    // Door on -y face (hidden) → path extends southward to street behind/under building
    return {
      x: b.x,
      y: b.y - b.d / 2 - _PATH_LENGTH / 2,
      w: _PATH_WIDTH,
      d: _PATH_LENGTH
    };
  }
  if (b.orient === 'w') {
    // Door on -x face (hidden) → path extends westward
    return {
      x: b.x - b.w / 2 - _PATH_LENGTH / 2,
      y: b.y,
      w: _PATH_LENGTH,
      d: _PATH_WIDTH
    };
  }
  return null;
}


// -----------------------------------------------------------------------------
// _layoutDir(dir, config, originX, originY, orientation, result)
//
// Recursively places a directory and its descendants into `result` (in WORLD
// coordinates).
//
//   originX, originY — world position of this street's START (the end nearest
//                      the parent street; for the root, this is (0, 0))
//   orientation       — 'x' or 'y'; the axis the street extends along
//
// Algorithm:
//   1. Sort all children (files + subdirs) alphabetically by name.
//   2. Pre-compute each subdir's layout in its own local frame and measure
//      its bounding box (so we can space siblings correctly).
//   3. Walk children in order, placing each one along the street with a
//      single shared cursor. Alternate sides (primary/secondary) as we go:
//        - X-street primary = SOUTH, secondary = NORTH
//        - Y-street primary = WEST,  secondary = EAST
//      Subdirs on the secondary side branch in the +perp direction (default);
//      subdirs on the primary side branch in the -perp direction (we mirror
//      their local layout by negating the perp axis).
//
// Buildings are sized so their LONG side (dim.w) runs along the street.
// Door faces back toward the street when visible (orient='s' or 'e'); when
// the file is on the secondary side the door is on a hidden face ('n' or 'w').
// -----------------------------------------------------------------------------
function _layoutDir(dir, config, originX, originY, orientation, result) {
  // ---- Sort children alphabetically (files + dirs intermingled) -----------
  var children = (dir.children || [])
    .filter(function (c) { return c.type === 'file' || c.type === 'directory'; })
    .slice()
    .sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

  var subOrient = (orientation === 'x') ? 'y' : 'x';

  // ---- Pre-compute each subdir's layout in its own local frame ------------
  // We need each subdir's bbox BEFORE positioning it, so siblings can be
  // packed without overlap. Local layout has subdir's street at (0,0) extending
  // in +subOrient.
  var subLayouts = {};
  for (var i = 0; i < children.length; i++) {
    if (children[i].type === 'directory') {
      var localResult = { streets: [], buildings: [] };
      _layoutDir(children[i], config, 0, 0, subOrient, localResult);
      subLayouts[i] = {
        result: localResult,
        bbox: _computeBbox(localResult)
      };
    }
  }

  // ---- Walk children in alphabetical order, alternating sides -------------
  var cursor = END_PAD;
  var fileBuildings = [];

  for (var ci = 0; ci < children.length; ci++) {
    var child = children[ci];
    var sideIdx = ci % 2;   // 0 = primary side (south/west), 1 = secondary (north/east)

    if (child.type === 'file') {
      var dim = getBuildingDimensions(child, config);
      var alongStreet = dim.w;   // long side runs along the street
      var perpStreet  = dim.d;

      cursor += alongStreet / 2;

      var bx, by, bldgW, bldgD, orient;
      if (orientation === 'x') {
        bx = originX + cursor;
        if (sideIdx === 0) {
          by = originY - BLDG_OFFSET - perpStreet / 2;   // south
          orient = 's';
        } else {
          by = originY + BLDG_OFFSET + perpStreet / 2;   // north
          orient = 'n';                                   // door hidden
        }
        bldgW = alongStreet;   // world-X
        bldgD = perpStreet;    // world-Y
      } else {
        by = originY + cursor;
        if (sideIdx === 0) {
          bx = originX - BLDG_OFFSET - perpStreet / 2;   // west
          orient = 'e';
        } else {
          bx = originX + BLDG_OFFSET + perpStreet / 2;   // east
          orient = 'w';                                   // door hidden
        }
        // Y-street: long side runs along world-Y, short side along world-X
        bldgW = perpStreet;
        bldgD = alongStreet;
      }

      fileBuildings.push({
        x: bx, y: by,
        w: bldgW, d: bldgD, h: dim.h,
        file: child,
        color: null,
        orient: orient
      });

      cursor += alongStreet / 2 + CHILD_GAP;
    } else {
      // ---- Subdir branch ----
      var sl = subLayouts[ci];

      // Subdir's "width along parent's axis" = its bbox extent perpendicular
      // to subdir's own street.
      var widthLow, widthHigh;
      if (orientation === 'x') {
        widthLow  = sl.bbox.minX;
        widthHigh = sl.bbox.maxX;
      } else {
        widthLow  = sl.bbox.minY;
        widthHigh = sl.bbox.maxY;
      }

      // Position so subdir's left (low) edge lands at the cursor
      var subAnchorOffset = cursor + (-widthLow);

      // Determine direction the subdir's street should extend.
      // Primary side (sideIdx=0) extends in the NEGATIVE perp direction;
      // secondary (sideIdx=1) extends in the POSITIVE perp direction (default).
      // We mirror the subdir's local layout by negating the perp axis when
      // it's on the primary side. (Bbox extents along parent's axis are
      // unaffected by this perp negation, so positioning logic stays the same.)
      var negateY = (orientation === 'x' && sideIdx === 0);
      var negateX = (orientation === 'y' && sideIdx === 0);

      var subAnchorX, subAnchorY;
      if (orientation === 'x') {
        subAnchorX = originX + subAnchorOffset;
        subAnchorY = originY;   // overlap parent's centerline
      } else {
        subAnchorX = originX;
        subAnchorY = originY + subAnchorOffset;
      }

      for (var ssi = 0; ssi < sl.result.streets.length; ssi++) {
        var s = sl.result.streets[ssi];
        result.streets.push({
          x: (negateX ? -s.x : s.x) + subAnchorX,
          y: (negateY ? -s.y : s.y) + subAnchorY,
          length: s.length,
          width: s.width,
          orientation: s.orientation,
          label: s.label,
          dir: s.dir
        });
      }
      for (var sbi = 0; sbi < sl.result.buildings.length; sbi++) {
        var b = sl.result.buildings[sbi];
        result.buildings.push({
          x: (negateX ? -b.x : b.x) + subAnchorX,
          y: (negateY ? -b.y : b.y) + subAnchorY,
          w: b.w, d: b.d, h: b.h,
          file: b.file,
          color: b.color,
          orient: b.orient
        });
      }

      cursor += (widthHigh - widthLow) + CHILD_GAP;
    }
  }
  if (children.length > 0) cursor -= CHILD_GAP;
  cursor += END_PAD;

  // ---- Compute street length and add street ------------------------------
  var streetLength = Math.max(cursor, END_PAD * 2);

  var streetCenterX = originX;
  var streetCenterY = originY;
  if (orientation === 'x') {
    streetCenterX = originX + streetLength / 2;
  } else {
    streetCenterY = originY + streetLength / 2;
  }

  result.streets.push({
    x: streetCenterX,
    y: streetCenterY,
    length: streetLength,
    width: STREET_WIDTH,
    orientation: orientation,
    label: dir.name || '',
    dir: dir
  });

  for (var bi2 = 0; bi2 < fileBuildings.length; bi2++) {
    result.buildings.push(fileBuildings[bi2]);
  }
}


// -----------------------------------------------------------------------------
// _computeBbox(layout) -> { minX, maxX, minY, maxY }
//
// Computes the axis-aligned bounding box (in world or local coords, depending
// on what the layout is in) covering all streets and buildings.
// -----------------------------------------------------------------------------
function _computeBbox(layout) {
  var minX = Infinity, maxX = -Infinity;
  var minY = Infinity, maxY = -Infinity;

  for (var i = 0; i < layout.streets.length; i++) {
    var s = layout.streets[i];
    var halfL = s.length / 2;
    var halfW = s.width / 2;
    var x1, x2, y1, y2;
    if (s.orientation === 'x') {
      x1 = s.x - halfL; x2 = s.x + halfL;
      y1 = s.y - halfW; y2 = s.y + halfW;
    } else {
      x1 = s.x - halfW; x2 = s.x + halfW;
      y1 = s.y - halfL; y2 = s.y + halfL;
    }
    if (x1 < minX) minX = x1;
    if (x2 > maxX) maxX = x2;
    if (y1 < minY) minY = y1;
    if (y2 > maxY) maxY = y2;
  }

  for (var j = 0; j < layout.buildings.length; j++) {
    var b = layout.buildings[j];
    var bx1 = b.x - b.w / 2, bx2 = b.x + b.w / 2;
    var by1 = b.y - b.d / 2, by2 = b.y + b.d / 2;
    if (bx1 < minX) minX = bx1;
    if (bx2 > maxX) maxX = bx2;
    if (by1 < minY) minY = by1;
    if (by2 > maxY) maxY = by2;
  }

  if (minX === Infinity) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}


// -----------------------------------------------------------------------------
// sortForRendering(buildings) -> buildings[]
//
// Painter's algorithm: sorts buildings so that those further from the viewer
// (higher x + y sum) are drawn first. Returns a new sorted array.
// -----------------------------------------------------------------------------
function sortForRendering(buildings) {
  var sorted = buildings.slice();
  sorted.sort(function(a, b) {
    // Ascending: lowest x+y drawn first.
    // In our projection sx=(x-y)*cos30, sy=(x+y)*sin30-z:
    //   Lower x+y = higher on screen (north-west) = behind
    //   Higher x+y = lower on screen (south-east) = in front
    // Painter's: draw behind first (low x+y), in-front last (high x+y).
    return (a.x + a.y) - (b.x + b.y);
  });
  return sorted;
}

// CommonJS exports for Vitest (guarded so browser concatenation still works)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getStreetTier,
    getStreetWidth,
    getBuildingDimensions,
    layoutCity,
    sortForRendering,
  };
}
