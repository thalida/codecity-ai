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
// layoutBlock(dirNode, config) -> { buildings, blockW, blockD }
//
// Arranges all direct file children of a directory node in a rectangular grid
// within a single "city block". Directory children are ignored at this level.
// Returns buildings with positions relative to block center (0, 0).
// -----------------------------------------------------------------------------
function layoutBlock(dirNode, config) {
  var SPACING       = 6;   // gap between building bounding boxes (world units)
  var BLOCK_PADDING = 6;   // empty border inside the block perimeter

  // Collect only file children
  var files = [];
  var children = dirNode.children || [];
  for (var i = 0; i < children.length; i++) {
    if (children[i].type === 'file') {
      files.push(children[i]);
    }
  }

  // Empty block
  if (files.length === 0) {
    return { buildings: [], blockW: BLOCK_PADDING * 2, blockD: BLOCK_PADDING * 2 };
  }

  // Compute dimensions for every file building
  var dims = [];
  for (var fi = 0; fi < files.length; fi++) {
    dims.push(getBuildingDimensions(files[fi], config));
  }

  // Find the maximum footprint to use as the uniform cell size
  var maxW = 0;
  var maxD = 0;
  for (var di = 0; di < dims.length; di++) {
    if (dims[di].w > maxW) maxW = dims[di].w;
    if (dims[di].d > maxD) maxD = dims[di].d;
  }

  // Grid layout: aim for a square arrangement
  var cols = Math.ceil(Math.sqrt(files.length));
  var rows = Math.ceil(files.length / cols);

  // Cell size = max building footprint + spacing
  var cellW = maxW + SPACING;
  var cellD = maxD + SPACING;

  // Total block size
  var blockW = cols * cellW + BLOCK_PADDING * 2;
  var blockD = rows * cellD + BLOCK_PADDING * 2;

  // Place buildings: center of each cell relative to block center
  var buildings = [];
  var startX = -blockW / 2 + BLOCK_PADDING + cellW / 2;
  var startY = -blockD / 2 + BLOCK_PADDING + cellD / 2;

  for (var bi = 0; bi < files.length; bi++) {
    var col = bi % cols;
    var row = Math.floor(bi / cols);

    buildings.push({
      x:    startX + col * cellW,
      y:    startY + row * cellD,
      w:    dims[bi].w,
      d:    dims[bi].d,
      h:    dims[bi].h,
      file: files[bi]
    });
  }

  return {
    buildings: buildings,
    blockW:    blockW,
    blockD:    blockD
  };
}


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
// layoutCity(manifest, config) -> { blocks, buildings }
//
// Top-level layout function. Takes the full scanner manifest and produces
// world-space positions for every block and building.
//
// Return shape:
//   blocks:    [{ x, y, w, d, label, dir }]
//   buildings: [{ x, y, w, d, h, color, file, hitBox: { x, y, w, h } }]
//
// `color` starts as null — the renderer must call getBuildingColor before drawing.
// -----------------------------------------------------------------------------
function layoutCity(manifest, config) {
  var STREET_PADDING = 8;

  var tree = manifest.tree || manifest;

  // ---- Collect top-level blocks -----------------------------------------------
  var topDirs  = [];
  var rootFiles = [];
  var children  = tree.children || [];

  for (var i = 0; i < children.length; i++) {
    if (children[i].type === 'directory') {
      topDirs.push(children[i]);
    } else if (children[i].type === 'file') {
      rootFiles.push(children[i]);
    }
  }

  // Synthesise a fake dir node for root-level files
  var allDirNodes = topDirs.slice();
  if (rootFiles.length > 0) {
    var syntheticRoot = {
      name:           tree.name || 'root',
      type:           'directory',
      path:           '.',
      children_count: rootFiles.length,
      children:       rootFiles
    };
    allDirNodes.unshift(syntheticRoot);
  }

  // If no directories at all, treat root as the only block
  if (allDirNodes.length === 0) {
    allDirNodes = [tree];
  }

  // ---- Compute per-block layouts ----------------------------------------------
  var blockLayouts = [];
  for (var bi = 0; bi < allDirNodes.length; bi++) {
    var dir = allDirNodes[bi];
    var bl  = layoutBlock(dir, config);

    // Fold in nested subdirectory file buildings (one level deep)
    var subBuildings = _collectSubdirBuildings(dir, config, bl.blockW, bl.blockD);

    if (subBuildings.extraW || subBuildings.extraD) {
      bl.blockW += subBuildings.extraW;
      bl.blockD += subBuildings.extraD;
    }

    blockLayouts.push({
      dir:       dir,
      buildings: bl.buildings.concat(subBuildings.buildings),
      blockW:    bl.blockW,
      blockD:    bl.blockD
    });
  }

  // ---- Determine street widths and block grid dimensions ----------------------
  var tiers = config.street_tiers || [3, 8, 15, 30];
  var cols = Math.ceil(Math.sqrt(allDirNodes.length));
  var rows = Math.ceil(allDirNodes.length / cols);

  var colWidths = [];
  var rowDepths = [];
  for (var c = 0; c < cols; c++) colWidths.push(0);
  for (var r = 0; r < rows; r++) rowDepths.push(0);

  for (var k = 0; k < blockLayouts.length; k++) {
    var col = k % cols;
    var row = Math.floor(k / cols);
    if (blockLayouts[k].blockW > colWidths[col]) colWidths[col] = blockLayouts[k].blockW;
    if (blockLayouts[k].blockD > rowDepths[row]) rowDepths[row] = blockLayouts[k].blockD;
  }

  // Use a consistent moderate street width (tier 2) so spacing is uniform
  // between all blocks instead of varying based on the largest directory.
  var streetW = getStreetWidth(2) + STREET_PADDING;

  // Cumulative offsets
  var colOffsets = [0];
  for (var ci = 1; ci <= cols; ci++) {
    colOffsets[ci] = colOffsets[ci - 1] + colWidths[ci - 1] + streetW;
  }

  var rowOffsets = [0];
  for (var ri = 1; ri <= rows; ri++) {
    rowOffsets[ri] = rowOffsets[ri - 1] + rowDepths[ri - 1] + streetW;
  }

  var totalWidth = colOffsets[cols];
  var totalDepth = rowOffsets[rows];

  // ---- Place blocks and translate buildings to world space --------------------
  var outBlocks    = [];
  var outBuildings = [];

  for (var n = 0; n < blockLayouts.length; n++) {
    var bcol = n % cols;
    var brow = Math.floor(n / cols);

    var slotCx = colOffsets[bcol] + colWidths[bcol] / 2;
    var slotCy = rowOffsets[brow] + rowDepths[brow] / 2;

    // Center city around (0, 0)
    var worldX = slotCx - totalWidth / 2;
    var worldY = slotCy - totalDepth / 2;

    outBlocks.push({
      x:     worldX,
      y:     worldY,
      w:     blockLayouts[n].blockW,
      d:     blockLayouts[n].blockD,
      label: blockLayouts[n].dir.name || '',
      dir:   blockLayouts[n].dir
    });

    // Translate each building from block-local coords to world coords
    var bldgs = blockLayouts[n].buildings;
    for (var bj = 0; bj < bldgs.length; bj++) {
      var b   = bldgs[bj];
      var wx = worldX + b.x;
      var wy = worldY + b.y;

      outBuildings.push({
        x:      wx,
        y:      wy,
        w:      b.w,
        d:      b.d,
        h:      b.h,
        color:  null,
        file:   b.file,
        hitBox: _computeHitBox(wx, wy, b.w, b.d, b.h)
      });
    }
  }

  return {
    blocks:    outBlocks,
    buildings: outBuildings
  };
}


// -----------------------------------------------------------------------------
// _collectSubdirBuildings(dirNode, config, parentW, parentD)
//   -> { buildings, extraW, extraD }
//
// Collects file buildings from child directories and arranges them beside the
// parent block.
// -----------------------------------------------------------------------------
function _collectSubdirBuildings(dirNode, config, parentW, parentD) {
  var SUB_SPACING = 6;

  var children = dirNode.children || [];
  var subDirs  = [];
  for (var i = 0; i < children.length; i++) {
    if (children[i].type === 'directory') {
      subDirs.push(children[i]);
    }
  }

  if (subDirs.length === 0) {
    return { buildings: [], extraW: 0, extraD: 0 };
  }

  var allBuildings = [];
  var cursorX = parentW / 2 + SUB_SPACING;
  var maxSubD  = 0;

  for (var si = 0; si < subDirs.length; si++) {
    var sub = layoutBlock(subDirs[si], config);

    if (sub.buildings.length === 0) continue;

    var subCx = cursorX + sub.blockW / 2;
    var subCy = 0;

    for (var bk = 0; bk < sub.buildings.length; bk++) {
      var b = sub.buildings[bk];
      allBuildings.push({
        x:    subCx + b.x,
        y:    subCy + b.y,
        w:    b.w,
        d:    b.d,
        h:    b.h,
        file: b.file
      });
    }

    cursorX += sub.blockW + SUB_SPACING;
    if (sub.blockD > maxSubD) maxSubD = sub.blockD;
  }

  // Ensure the parent block expands enough to fully contain all sub-directory
  // buildings. Add padding so buildings don't sit right at the edge.
  var SUB_PADDING = 6;
  var extraW = (allBuildings.length > 0) ? (cursorX - parentW / 2 + SUB_PADDING) : 0;
  var extraD = (maxSubD > parentD) ? (maxSubD - parentD + SUB_PADDING) : 0;

  return {
    buildings: allBuildings,
    extraW:    extraW,
    extraD:    extraD
  };
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
    return (b.x + b.y) - (a.x + a.y);
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
