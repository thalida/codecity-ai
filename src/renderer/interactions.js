// =============================================================================
// interactions.js — Pan, Zoom, Click, and Hover Interactions
// CodeCity AI — Handles all user input for the isometric city canvas.
//
// All functions are declared with `function` keyword so they are hoisted and
// available globally after script concatenation.
//
// Depends on (loaded before this file in the assembled HTML):
//   engine.js  — setupCanvas(), drawBuilding(), drawGround(), drawLabel()
//   colors.js  — getBuildingColor(), getDateRanges()
//   layout.js  — layoutCity(), sortForRendering()
//   sidebar.js — showFileSidebar(), showDirSidebar(), closeSidebar()
//
// Interface contract property names:
//   Building: { x, y, w, d, h, color, file, hitBox: { x, y, w, h } }
//   Block:    { x, y, w, d, label, dir }
// =============================================================================


// -----------------------------------------------------------------------------
// hitTest(screenX, screenY, buildings, zoomLevel, panX, panY,
//         canvasWidth, canvasHeight)
//
// Transforms a screen-space click/hover coordinate back into the world space
// used by building hitBoxes, then tests against each building's hitBox.
//
// hitBox format (from layout.js):
//   { x, y, w, h }  — in screen-space BEFORE zoom/pan are applied
//
// Returns the matching building object, or null if no hit.
// -----------------------------------------------------------------------------
function hitTest(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight) {
  var worldX = (screenX - canvasWidth  / 2 - panX) / zoomLevel;
  var worldY = (screenY - canvasHeight / 2 - panY) / zoomLevel;

  // Iterate in reverse paint order so topmost (last-drawn) building wins
  for (var i = buildings.length - 1; i >= 0; i--) {
    var b = buildings[i];
    if (!b.hitBox) continue;

    var hb = b.hitBox;
    if (worldX >= hb.x && worldX <= hb.x + hb.w &&
        worldY >= hb.y && worldY <= hb.y + hb.h) {
      return b;
    }
  }

  return null;
}


// -----------------------------------------------------------------------------
// hitTestBlock(screenX, screenY, blocks, zoomLevel, panX, panY,
//              canvasWidth, canvasHeight)
//
// Tests whether a screen-space click falls within any block's ground plane.
// Projects the 4 corners of each block and checks if the point is inside
// the resulting isometric diamond using cross-product winding.
//
// Returns the matching block object, or null if no hit.
// -----------------------------------------------------------------------------
function hitTestBlock(screenX, screenY, blocks, zoomLevel, panX, panY, canvasWidth, canvasHeight) {
  var worldX = (screenX - canvasWidth  / 2 - panX) / zoomLevel;
  var worldY = (screenY - canvasHeight / 2 - panY) / zoomLevel;

  for (var i = blocks.length - 1; i >= 0; i--) {
    var block = blocks[i];
    var hw = block.w / 2;
    var hd = block.d / 2;

    // Project the 4 corners of the block ground plane
    var bx = block.x;
    var by = block.y;
    var sp = isoProject(bx, by, 0);
    var pfl = isoProject(bx - hw, by - hd, 0);
    var pfr = isoProject(bx + hw, by - hd, 0);
    var pbr = isoProject(bx + hw, by + hd, 0);
    var pbl = isoProject(bx - hw, by + hd, 0);

    // Point-in-quad test using cross product signs
    if (_pointInQuad(worldX, worldY, pfl, pfr, pbr, pbl)) {
      return block;
    }
  }

  return null;
}


// -----------------------------------------------------------------------------
// _pointInQuad(px, py, a, b, c, d) -> boolean
//
// Tests if point (px, py) is inside the quadrilateral defined by corners
// a, b, c, d (in order). Each corner has { sx, sy } properties.
// Uses cross-product winding test.
// -----------------------------------------------------------------------------
function _pointInQuad(px, py, a, b, c, d) {
  var corners = [a, b, c, d];
  var positive = 0;
  var negative = 0;

  for (var i = 0; i < 4; i++) {
    var c1 = corners[i];
    var c2 = corners[(i + 1) % 4];
    var cross = (c2.sx - c1.sx) * (py - c1.sy) - (c2.sy - c1.sy) * (px - c1.sx);
    if (cross > 0) positive++;
    else if (cross < 0) negative++;
  }

  return positive === 0 || negative === 0;
}


// -----------------------------------------------------------------------------
// handleClick(screenX, screenY, buildings, zoomLevel, panX, panY,
//             canvasWidth, canvasHeight)
//
// Performs a hit test against all buildings.
//   Hit on a file building   -> showFileSidebar(building.file)
//   Hit on a dir building    -> showDirSidebar(building.file)
//   Miss (empty space click) -> closeSidebar()
// -----------------------------------------------------------------------------
function handleClick(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight, blocks) {
  var hit = hitTest(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight);

  if (hit) {
    if (hit.file && hit.file.type === 'directory') {
      showDirSidebar(hit.file);
    } else if (hit.file) {
      showFileSidebar(hit.file);
    }
  } else if (blocks) {
    // Check if click falls on a block's ground plane (Issue 6: clickable folders)
    var blockHit = hitTestBlock(screenX, screenY, blocks, zoomLevel, panX, panY, canvasWidth, canvasHeight);
    if (blockHit && blockHit.dir) {
      showDirSidebar(blockHit.dir);
    } else {
      closeSidebar();
    }
  } else {
    closeSidebar();
  }
}


// -----------------------------------------------------------------------------
// updateCursor(canvas, screenX, screenY, buildings, zoomLevel, panX, panY,
//              isPanning, canvasWidth, canvasHeight)
//
// Updates the canvas CSS cursor based on current interaction state.
// -----------------------------------------------------------------------------
function updateCursor(canvas, screenX, screenY, buildings, zoomLevel, panX, panY, isPanning, canvasWidth, canvasHeight) {
  if (isPanning) {
    canvas.style.cursor = 'grabbing';
    return;
  }

  var hit = hitTest(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight);
  canvas.style.cursor = hit ? 'pointer' : 'grab';
}


// -----------------------------------------------------------------------------
// startRenderLoop(canvas, manifest, config)
//
// Main entry point. Ties together layout, colors, and rendering with the full
// interaction layer (pan, zoom, click, hover, keyboard).
//
// Call once after the DOM is ready:
//   startRenderLoop(document.getElementById('city'), MANIFEST, CONFIG);
// -----------------------------------------------------------------------------
function startRenderLoop(canvas, manifest, config) {
  // -- 1. Canvas setup ---------------------------------------------------------
  var ctx = setupCanvas(canvas);

  var W = canvas.offsetWidth;
  var H = canvas.offsetHeight;

  // -- 2. Layout ---------------------------------------------------------------
  var layout = layoutCity(manifest.tree, config);
  var buildings = sortForRendering(layout.buildings);

  // -- 3. Colors ---------------------------------------------------------------
  var dateRanges = getDateRanges(manifest.tree);
  var palette    = config.palette || {};

  for (var i = 0; i < buildings.length; i++) {
    var b = buildings[i];
    if (b.file && b.file.type === 'file') {
      b.color = getBuildingColor(b.file, palette, dateRanges, config);
    } else {
      b.color = 'hsl(220, 15%, 25%)';
    }
  }

  // -- 4. Interaction state ----------------------------------------------------
  var panX      = 0;
  var panY      = 0;
  var zoomLevel = 1;

  var isPanning   = false;
  var dragStartX  = 0;
  var dragStartY  = 0;
  var panStartX   = 0;
  var panStartY   = 0;
  var didDrag     = false;

  var DRAG_THRESHOLD = 4;
  var MIN_ZOOM = 0.3;
  var MAX_ZOOM = 5.0;

  // -- 5. Render function ------------------------------------------------------
  function renderCity() {
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // Apply viewport transform: center -> pan -> zoom
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoomLevel, zoomLevel);

    // ---- Ground blocks (drawn first -- painter's algorithm) ------------------
    for (var g = 0; g < layout.blocks.length; g++) {
      var block = layout.blocks[g];

      // Project block world coordinates to isometric screen coordinates
      var bp = isoProject(block.x, block.y, 0);

      // Draw a slightly lighter ground for the street area (visual distinction)
      drawGround(
        ctx,
        bp.sx,
        bp.sy,
        block.w,
        block.d,
        '#121828',
        '#283050'
      );
    }

    // ---- Buildings (sorted back-to-front) -----------------------------------
    for (var bi = 0; bi < buildings.length; bi++) {
      var bld = buildings[bi];

      // Pass world coordinates directly — drawBuilding handles projection
      // internally via isoProject on the corner offsets, then adds cx/cy.
      // cx/cy must be in the SAME coordinate space as the projected offsets
      // (screen space), so we project the building position here.
      var bp = isoProject(bld.x, bld.y, 0);

      drawBuilding(
        ctx,
        bp.sx,
        bp.sy,
        bld.w,
        bld.d,
        bld.h,
        bld.color
      );
    }

    // ---- Labels (drawn AFTER buildings so they aren't occluded) ---------------
    for (var li = 0; li < layout.blocks.length; li++) {
      var lblBlock = layout.blocks[li];
      if (lblBlock.label) {
        // Project to isometric screen coordinates, position at the front edge
        // of the block (high y = front in isometric) so label sits below buildings
        var lp = isoProject(lblBlock.x, lblBlock.y + lblBlock.d / 2, 0);
        drawLabel(
          ctx,
          lp.sx,
          lp.sy + 8,
          lblBlock.label,
          '#8ca0c8'
        );
      }
    }

    ctx.restore();
  }

  // Initial render
  renderCity();

  // Populate the left tree sidebar if available
  if (typeof showTreeSidebar === 'function') {
    showTreeSidebar(manifest);
  }

  // -- 6. Event listeners ------------------------------------------------------

  // ---- Mouse down: start potential pan or click ----------------------------
  canvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    isPanning  = true;
    didDrag    = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX  = panX;
    panStartY  = panY;
    canvas.style.cursor = 'grabbing';
  });

  // ---- Mouse move: pan and hover cursor ------------------------------------
  canvas.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    if (isPanning) {
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;

      if (!didDrag && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        didDrag = true;
      }

      if (didDrag) {
        panX = panStartX + dx;
        panY = panStartY + dy;
        renderCity();
      }

      canvas.style.cursor = 'grabbing';
    } else {
      updateCursor(canvas, mx, my, buildings, zoomLevel, panX, panY, false, W, H);
    }
  });

  // ---- Mouse up: end pan / fire click if not dragged ----------------------
  canvas.addEventListener('mouseup', function (e) {
    if (e.button !== 0) return;

    if (!didDrag) {
      var rect = canvas.getBoundingClientRect();
      var mx   = e.clientX - rect.left;
      var my   = e.clientY - rect.top;
      handleClick(mx, my, buildings, zoomLevel, panX, panY, W, H, layout.blocks);
    }

    isPanning = false;
    didDrag   = false;

    var rect2 = canvas.getBoundingClientRect();
    var mx2 = e.clientX - rect2.left;
    var my2 = e.clientY - rect2.top;
    updateCursor(canvas, mx2, my2, buildings, zoomLevel, panX, panY, false, W, H);
  });

  // ---- Mouse leave: release pan if cursor leaves canvas -------------------
  canvas.addEventListener('mouseleave', function () {
    isPanning = false;
    didDrag   = false;
    canvas.style.cursor = 'grab';
  });

  // ---- Wheel: zoom centered on cursor position ----------------------------
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();

    var rect = canvas.getBoundingClientRect();
    var mx   = e.clientX - rect.left;
    var my   = e.clientY - rect.top;

    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 24;
    if (e.deltaMode === 2) delta *= 400;

    var zoomFactor = Math.pow(0.999, delta);
    var newZoom    = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel * zoomFactor));

    if (newZoom === zoomLevel) return;

    var worldX = (mx - W / 2 - panX) / zoomLevel;
    var worldY = (my - H / 2 - panY) / zoomLevel;

    panX = mx - W / 2 - worldX * newZoom;
    panY = my - H / 2 - worldY * newZoom;

    zoomLevel = newZoom;
    renderCity();
  }, { passive: false });

  // ---- Keyboard: Escape closes sidebar ------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });

  // ---- Resize: re-setup canvas and re-render ------------------------------
  window.addEventListener('resize', function () {
    ctx = setupCanvas(canvas);
    renderCity();
  });
}

// CommonJS exports for Vitest (guarded so browser concatenation still works)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hitTest,
    hitTestBlock,
    _pointInQuad,
    handleClick,
    updateCursor,
    startRenderLoop,
  };
}
