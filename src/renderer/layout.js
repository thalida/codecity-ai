// =============================================================================
// layout.js — Grid Layout Algorithm
// CodeCity AI — Computes world-space positions for buildings, blocks, and streets.
//
// All functions are declared with `function` keyword so they are hoisted and
// available globally after script concatenation. No imports or dependencies.
//
// Coordinate system:
//   World X (cx) — east-west axis (increases right)
//   World Y (cy) — north-south / depth axis (increases toward viewer)
//   World Z       — vertical / height axis (not stored; passed to drawBuilding)
//
// The layout pipeline:
//   1. getBuildingDimensions  — derives w/d/h from file metadata
//   2. layoutBlock            — places buildings inside a single directory block
//   3. layoutCity             — tiles blocks on a top-level grid with streets
//   4. sortForRendering       — painter's-algorithm sort for correct overdraw order
// =============================================================================


// -----------------------------------------------------------------------------
// getStreetTier(childrenCount, tiers) → number  [1-5]
//
// Maps a directory's child count to one of 5 street tiers using threshold
// breakpoints. The tiers array contains 4 thresholds from config
// (e.g. [3, 8, 15, 30]). Tier meaning:
//
//   tier 1 — count ≤ tiers[0]   (tiny alley)
//   tier 2 — count ≤ tiers[1]   (narrow lane)
//   tier 3 — count ≤ tiers[2]   (standard street)
//   tier 4 — count ≤ tiers[3]   (wide avenue)
//   tier 5 — count > tiers[3]   (boulevard)
//
// @param {number} childrenCount - Number of direct children in the directory.
// @param {number[]} tiers       - Array of 4 ascending threshold values.
// @returns {number} Tier integer in [1, 5].
// -----------------------------------------------------------------------------
function getStreetTier(childrenCount, tiers) {
  if (childrenCount <= tiers[0]) return 1;
  if (childrenCount <= tiers[1]) return 2;
  if (childrenCount <= tiers[2]) return 3;
  if (childrenCount <= tiers[3]) return 4;
  return 5;
}


// -----------------------------------------------------------------------------
// getStreetWidth(tier) → number
//
// Returns the pixel width of a street for the given tier.
//
//   tier 1 →  4px  (alley)
//   tier 2 →  8px  (lane)
//   tier 3 → 14px  (street)
//   tier 4 → 22px  (avenue)
//   tier 5 → 32px  (boulevard)
//
// @param {number} tier - Street tier integer in [1, 5].
// @returns {number} Street width in world units.
// -----------------------------------------------------------------------------
function getStreetWidth(tier) {
  var widths = [0, 4, 8, 14, 22, 32];
  var t = Math.max(1, Math.min(5, Math.round(tier)));
  return widths[t];
}


// -----------------------------------------------------------------------------
// getBuildingDimensions(file, config) → { width, depth, height }
//
// Derives isometric building dimensions from file metadata using logarithmic
// scaling so that both tiny and enormous files produce readable buildings.
//
//   height — from line count  (more lines → taller)
//   width  — from file size in bytes (larger file → wider)
//   depth  — average of height and width: (h + w) / 2
//
// Logarithm base: natural log (Math.log). A value of 0 or less is treated as 1
// before taking the log to avoid -Infinity / NaN results.
//
// The raw log values are linearly mapped from [log(1), log(largeRef)] into
// [min, max] where largeRef is a reference ceiling that keeps the mapping
// stable. We use 100,000 lines and 10 MB as the reference ceilings for height
// and width respectively.
//
// @param {Object} file   - File node from the scanner manifest.
// @param {Object} config - Config object with a `building` key:
//                          { min_height, max_height, min_width, max_width }
// @returns {{ width: number, depth: number, height: number }}
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
    width:  Math.round(width  * 10) / 10,
    depth:  Math.round(depth  * 10) / 10,
    height: Math.round(height * 10) / 10
  };
}


// -----------------------------------------------------------------------------
// layoutBlock(dirNode, config) → { buildings, blockWidth, blockDepth }
//
// Arranges all direct file children of a directory node in a rectangular grid
// within a single "city block". Directory children are ignored at this level
// (they become nested blocks in layoutCity).
//
// Grid packing strategy:
//   - Target a roughly-square arrangement: cols ≈ ceil(sqrt(fileCount))
//   - Rows = ceil(fileCount / cols)
//   - Each cell is sized to the maximum building footprint + SPACING
//   - Buildings are centered within their cells
//   - The block has BLOCK_PADDING on all four sides
//
// Origin: buildings are positioned relative to (0, 0) at the block's center.
// The caller (layoutCity) will translate them to world coordinates.
//
// @param {Object} dirNode - Directory node from the manifest (with .children).
// @param {Object} config  - Full config object (used for building dimension limits).
// @returns {{
//   buildings:  Array<{ cx, cy, width, depth, height, file }>,
//   blockWidth: number,
//   blockDepth: number
// }}
// -----------------------------------------------------------------------------
function layoutBlock(dirNode, config) {
  var SPACING       = 6;   // gap between building bounding boxes (world units)
  var BLOCK_PADDING = 10;  // empty border inside the block perimeter

  // Collect only file children (dirs are handled as separate blocks in layoutCity)
  var files = [];
  var children = dirNode.children || [];
  for (var i = 0; i < children.length; i++) {
    if (children[i].type === 'file') {
      files.push(children[i]);
    }
  }

  // Empty block — return a minimal stub
  if (files.length === 0) {
    return { buildings: [], blockWidth: BLOCK_PADDING * 2, blockDepth: BLOCK_PADDING * 2 };
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
    if (dims[di].width > maxW) maxW = dims[di].width;
    if (dims[di].depth > maxD) maxD = dims[di].depth;
  }

  // Grid layout: aim for a square arrangement
  var cols = Math.ceil(Math.sqrt(files.length));
  var rows = Math.ceil(files.length / cols);

  // Cell size = max building footprint + spacing
  var cellW = maxW + SPACING;
  var cellD = maxD + SPACING;

  // Total block size
  var blockWidth = cols * cellW + BLOCK_PADDING * 2;
  var blockDepth = rows * cellD + BLOCK_PADDING * 2;

  // Place buildings: center of each cell relative to block center
  // Block spans x ∈ [-blockWidth/2, blockWidth/2],
  //             y ∈ [-blockDepth/2, blockDepth/2]
  var buildings = [];
  var startX = -blockWidth / 2 + BLOCK_PADDING + cellW / 2;
  var startY = -blockDepth / 2 + BLOCK_PADDING + cellD / 2;

  for (var bi = 0; bi < files.length; bi++) {
    var col = bi % cols;
    var row = Math.floor(bi / cols);

    var cx = startX + col * cellW;
    var cy = startY + row * cellD;

    buildings.push({
      cx:     cx,
      cy:     cy,
      width:  dims[bi].width,
      depth:  dims[bi].depth,
      height: dims[bi].height,
      file:   files[bi]
    });
  }

  return {
    buildings:  buildings,
    blockWidth: blockWidth,
    blockDepth: blockDepth
  };
}


// -----------------------------------------------------------------------------
// _computeHitBox(cx, cy, width, depth, height) → { x, y, width, height }
//
// Projects all 8 corners of a building's footprint into screen space using the
// global isoProject function and returns the axis-aligned bounding rectangle.
// Used for click / hover hit-testing.
//
// The result coordinates are relative to the building's own screen-space center
// (cx, cy). The caller (layoutCity) adds the world-origin screen-offset when
// composing the final hitBox if needed, but since isoProject is relative to
// world origin the hit box here is expressed in the same relative space:
//   hitBox.x and hitBox.y are the offset from (cx, cy) to the top-left corner.
//
// @param {number} cx, cy         - World-space center of the building base.
// @param {number} width, depth, height - Building dimensions.
// @returns {{ x: number, y: number, width: number, height: number }}
// -----------------------------------------------------------------------------
function _computeHitBox(cx, cy, width, depth, height) {
  var hw = width  / 2;
  var hd = depth  / 2;

  // Project all 8 corners of the building box
  var corners = [
    isoProject(-hw, -hd, 0),
    isoProject( hw, -hd, 0),
    isoProject( hw,  hd, 0),
    isoProject(-hw,  hd, 0),
    isoProject(-hw, -hd, height),
    isoProject( hw, -hd, height),
    isoProject( hw,  hd, height),
    isoProject(-hw,  hd, height)
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
    x:      cx + minSx,
    y:      cy + minSy,
    width:  maxSx - minSx,
    height: maxSy - minSy
  };
}


// -----------------------------------------------------------------------------
// layoutCity(manifest, config) → { blocks, buildings }
//
// Top-level layout function. Takes the full scanner manifest and produces
// world-space positions for every block and building.
//
// Layout strategy for top-level directories:
//   - Each direct child directory of the manifest root becomes a "block".
//   - Blocks are arranged on a square grid (same cols ≈ sqrt approach).
//   - Streets run between blocks; street width is determined by the block's
//     directory children count via getStreetTier / getStreetWidth.
//   - Nested directories (grandchildren) are recursively inlined into their
//     parent block — their file buildings are offset into the parent's footprint.
//     (Full recursive sub-block nesting would require a more complex renderer;
//      for now we flatten one level deep and mark the source directory.)
//   - Files directly at the root level are placed in a synthetic "root" block.
//
// Return shape:
//   blocks:    [{ cx, cy, blockWidth, blockDepth, dir }]
//   buildings: [{ cx, cy, width, depth, height, color, file, hitBox }]
//
// `color` is set to the placeholder string "placeholder" — the renderer should
// call getBuildingColor(file, palette, dateRanges, config) before drawing.
//
// @param {Object} manifest - Full scanner manifest: { root, scanned_at, tree }.
// @param {Object} config   - Merged config object (see defaults.json schema).
// @returns {{ blocks: Array, buildings: Array }}
// -----------------------------------------------------------------------------
function layoutCity(manifest, config) {
  var STREET_PADDING = 8;  // extra buffer added to each side of every street gap

  var tree = manifest.tree || manifest;  // support both manifest.tree and bare tree

  // ---- Collect top-level blocks -----------------------------------------------
  // Each direct directory child of root → one city block.
  // Files directly at root → synthetic "root files" block.

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

  // Synthesise a fake dir node for root-level files so they form a block
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

  // If the codebase has no directories at all, treat root as the only block
  if (allDirNodes.length === 0) {
    allDirNodes = [tree];
  }

  // ---- Compute per-block layouts ----------------------------------------------
  var blockLayouts = [];
  for (var bi = 0; bi < allDirNodes.length; bi++) {
    var dir = allDirNodes[bi];
    var bl  = layoutBlock(dir, config);

    // Also fold in nested subdirectory file buildings (one level deep)
    var subBuildings = _collectSubdirBuildings(dir, config, bl.blockWidth, bl.blockDepth);

    // If subdirectories added buildings, expand the block to fit them
    if (subBuildings.extraW || subBuildings.extraD) {
      bl.blockWidth  += subBuildings.extraW;
      bl.blockDepth  += subBuildings.extraD;
    }

    blockLayouts.push({
      dir:        dir,
      buildings:  bl.buildings.concat(subBuildings.buildings),
      blockWidth: bl.blockWidth,
      blockDepth: bl.blockDepth
    });
  }

  // ---- Determine street widths and block grid dimensions ----------------------
  var tiers = config.street_tiers || [3, 8, 15, 30];
  var cols = Math.ceil(Math.sqrt(allDirNodes.length));
  var rows = Math.ceil(allDirNodes.length / cols);

  // Find max block dimensions per column / row for non-uniform block support
  var colWidths = [];
  var rowDepths = [];
  for (var c = 0; c < cols; c++) colWidths.push(0);
  for (var r = 0; r < rows; r++) rowDepths.push(0);

  for (var k = 0; k < blockLayouts.length; k++) {
    var col = k % cols;
    var row = Math.floor(k / cols);
    if (blockLayouts[k].blockWidth > colWidths[col]) colWidths[col] = blockLayouts[k].blockWidth;
    if (blockLayouts[k].blockDepth > rowDepths[row]) rowDepths[row] = blockLayouts[k].blockDepth;
  }

  // Street width between columns / rows — use the largest tier present
  var maxTier = 1;
  for (var mi = 0; mi < allDirNodes.length; mi++) {
    var count = allDirNodes[mi].children_count || 0;
    var tier  = getStreetTier(count, tiers);
    if (tier > maxTier) maxTier = tier;
  }
  var streetW = getStreetWidth(maxTier) + STREET_PADDING * 2;

  // Cumulative column X offsets
  var colOffsets = [0];
  for (var ci = 1; ci <= cols; ci++) {
    colOffsets[ci] = colOffsets[ci - 1] + colWidths[ci - 1] + streetW;
  }

  // Cumulative row Y offsets
  var rowOffsets = [0];
  for (var ri = 1; ri <= rows; ri++) {
    rowOffsets[ri] = rowOffsets[ri - 1] + rowDepths[ri - 1] + streetW;
  }

  // Total city footprint
  var totalWidth = colOffsets[cols];
  var totalDepth = rowOffsets[rows];

  // ---- Place blocks and translate buildings to world space --------------------
  var outBlocks    = [];
  var outBuildings = [];

  for (var n = 0; n < blockLayouts.length; n++) {
    var bcol = n % cols;
    var brow = Math.floor(n / cols);

    // Block center in world space
    // Offset within its column/row slot so the block is centered in the cell
    var slotCx = colOffsets[bcol] + colWidths[bcol] / 2;
    var slotCy = rowOffsets[brow] + rowDepths[brow] / 2;

    // Shift so city is centered around (0, 0)
    var worldCx = slotCx - totalWidth / 2;
    var worldCy = slotCy - totalDepth / 2;

    outBlocks.push({
      screenX:    worldCx,
      screenY:    worldCy,
      cx:         worldCx,
      cy:         worldCy,
      width:      blockLayouts[n].blockWidth,
      depth:      blockLayouts[n].blockDepth,
      blockWidth: blockLayouts[n].blockWidth,
      blockDepth: blockLayouts[n].blockDepth,
      dir:        blockLayouts[n].dir
    });

    // Translate each building from block-local coords to world coords
    var bldgs = blockLayouts[n].buildings;
    for (var bj = 0; bj < bldgs.length; bj++) {
      var b   = bldgs[bj];
      var wcx = worldCx + b.cx;
      var wcy = worldCy + b.cy;

      outBuildings.push({
        screenX: wcx,
        screenY: wcy,
        cx:      wcx,
        cy:      wcy,
        width:   b.width,
        depth:   b.depth,
        height:  b.height,
        color:   'placeholder',
        file:    b.file,
        hitBox:  _computeHitBox(wcx, wcy, b.width, b.depth, b.height)
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
//   → { buildings, extraW, extraD }
//
// Private helper for layoutCity. Recursively collects file buildings from all
// child directory nodes of dirNode and arranges them below / beside the parent
// block's existing footprint so they stay within the same city block.
//
// Strategy: each child subdirectory is laid out as its own sub-block and
// appended to the right of the parent block (x-axis). This keeps the city
// looking organised without requiring a recursive renderer.
//
// @param {Object} dirNode  - Parent directory node.
// @param {Object} config   - Full config.
// @param {number} parentW  - Parent block's current width (to avoid overlap).
// @param {number} parentD  - Parent block's current depth.
// @returns {{ buildings: Array, extraW: number, extraD: number }}
// -----------------------------------------------------------------------------
function _collectSubdirBuildings(dirNode, config, parentW, parentD) {
  var SUB_SPACING = 6;  // gap between parent block and sub-blocks

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

  // Lay out sub-blocks in a row to the right of the parent footprint
  var allBuildings = [];
  var cursorX = parentW / 2 + SUB_SPACING;  // start right of parent block
  var maxSubD  = 0;

  for (var si = 0; si < subDirs.length; si++) {
    var sub = layoutBlock(subDirs[si], config);

    // Skip empty sub-blocks
    if (sub.buildings.length === 0) continue;

    // Position the sub-block's center relative to parent center
    var subCx = cursorX + sub.blockWidth / 2;
    var subCy = 0;  // aligned to parent Y center

    // Translate sub buildings into parent-relative coords
    for (var bk = 0; bk < sub.buildings.length; bk++) {
      var b = sub.buildings[bk];
      var sx = subCx + b.cx;
      var sy = subCy + b.cy;
      allBuildings.push({
        screenX: sx,
        screenY: sy,
        cx:     sx,
        cy:     sy,
        width:  b.width,
        depth:  b.depth,
        height: b.height,
        file:   b.file
      });
    }

    cursorX += sub.blockWidth + SUB_SPACING;
    if (sub.blockDepth > maxSubD) maxSubD = sub.blockDepth;
  }

  var extraW = (allBuildings.length > 0) ? (cursorX - parentW / 2) : 0;
  var extraD = (maxSubD > parentD) ? (maxSubD - parentD) : 0;

  return {
    buildings: allBuildings,
    extraW:    extraW,
    extraD:    extraD
  };
}


// -----------------------------------------------------------------------------
// sortForRendering(buildings) → buildings[]
//
// Painter's algorithm: sorts buildings so that those further from the viewer
// (higher cx + cy sum) are drawn first and those closer (lower cx + cy) are
// drawn last. This produces correct occlusion in the isometric projection where
// the "back" of the scene has larger coordinate sums.
//
// Returns a new sorted array; the original array is not mutated.
//
// @param {Array} buildings - Array of building objects with cx and cy properties.
// @returns {Array} New array sorted back-to-front (farthest first).
// -----------------------------------------------------------------------------
function sortForRendering(buildings) {
  var sorted = buildings.slice();  // shallow copy — do not mutate input
  sorted.sort(function(a, b) {
    // Descending: higher (cx + cy) → earlier in the draw list (painted first)
    return (b.cx + b.cy) - (a.cx + a.cy);
  });
  return sorted;
}
