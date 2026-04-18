// =============================================================================
// interactions.js — Pan, Zoom, Click, and Hover Interactions
// CodeCity AI — Handles all user input for the isometric city canvas.
//
// All functions are declared with `function` keyword so they are hoisted and
// available globally after script concatenation.
//
// Depends on (loaded before this file in the assembled HTML):
//   engine.js  — setupCanvas(), drawBuilding(), drawGround()
//   colors.js  — getBuildingColor(), getDateRanges()
//   layout.js  — layoutCity(), sortForRendering()
//   sidebar.js — showFileSidebar(), showDirSidebar(), closeSidebar()
// =============================================================================


// -----------------------------------------------------------------------------
// hitTest(screenX, screenY, buildings, zoomLevel, panX, panY)
//
// Transforms a screen-space click/hover coordinate back into the world space
// used by building hitBoxes, then tests against each building's hitBox.
//
// hitBox format (from layout.js):
//   { x, y, width, height }  — in screen-space BEFORE zoom/pan are applied
//
// The render transform is: ctx.translate(W/2 + panX, H/2 + panY)
//                           ctx.scale(zoomLevel, zoomLevel)
// So to invert:             worldX = (screenX - W/2 - panX) / zoomLevel
//
// Returns the matching building object, or null if no hit.
// -----------------------------------------------------------------------------
function hitTest(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight) {
  // Invert the viewport transform to get coordinates in layout world space
  var worldX = (screenX - canvasWidth  / 2 - panX) / zoomLevel;
  var worldY = (screenY - canvasHeight / 2 - panY) / zoomLevel;

  // Iterate in reverse paint order so topmost (last-drawn) building wins
  for (var i = buildings.length - 1; i >= 0; i--) {
    var b = buildings[i];
    if (!b.hitBox) continue;

    var hb = b.hitBox;
    if (worldX >= hb.x && worldX <= hb.x + hb.width &&
        worldY >= hb.y && worldY <= hb.y + hb.height) {
      return b;
    }
  }

  return null;
}


// -----------------------------------------------------------------------------
// handleClick(screenX, screenY, buildings, zoomLevel, panX, panY,
//             canvasWidth, canvasHeight)
//
// Performs a hit test against all buildings.
//   Hit on a file building   → showFileSidebar(building.node)
//   Hit on a dir building    → showDirSidebar(building.node)
//   Miss (empty space click) → closeSidebar()
//
// `building.node` is the manifest node stored by layout.js on each building.
// `building.file` is the manifest node; `building.file.type` is "file" or "directory".
// -----------------------------------------------------------------------------
function handleClick(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight) {
  var hit = hitTest(screenX, screenY, buildings, zoomLevel, panX, panY, canvasWidth, canvasHeight);

  if (hit) {
    if (hit.file && hit.file.type === 'directory') {
      showDirSidebar(hit.file);
    } else if (hit.file) {
      showFileSidebar(hit.file);
    }
  } else {
    closeSidebar();
  }
}


// -----------------------------------------------------------------------------
// updateCursor(canvas, screenX, screenY, buildings, zoomLevel, panX, panY,
//              isPanning, canvasWidth, canvasHeight)
//
// Updates the canvas CSS cursor based on current interaction state:
//   grabbing  — while actively panning (mouse button held)
//   pointer   — hovering over a building hitBox
//   grab      — hovering over empty space (pan available)
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
//
// Parameters:
//   canvas   — <canvas id="city"> element
//   manifest — JSON manifest from scan.sh (has .tree root node)
//   config   — merged defaults + user overrides from defaults.json
// -----------------------------------------------------------------------------
function startRenderLoop(canvas, manifest, config) {
  // ── 1. Canvas setup ─────────────────────────────────────────────────────────
  var ctx = setupCanvas(canvas);

  // Logical CSS dimensions (what we draw in)
  var W = canvas.offsetWidth;
  var H = canvas.offsetHeight;

  // ── 2. Layout ────────────────────────────────────────────────────────────────
  var layout = layoutCity(manifest.tree, config);
  var buildings = sortForRendering(layout.buildings);

  // ── 3. Colors ────────────────────────────────────────────────────────────────
  var dateRanges = getDateRanges(manifest.tree);
  var palette    = config.palette || {};

  for (var i = 0; i < buildings.length; i++) {
    var b = buildings[i];
    if (b.file && b.file.type === 'file') {
      b.color = getBuildingColor(b.file, palette, dateRanges, config);
    } else {
      // Directory blocks get a neutral dark color
      b.color = 'hsl(220, 15%, 25%)';
    }
  }

  // ── 4. Interaction state ─────────────────────────────────────────────────────
  var panX      = 0;
  var panY      = 0;
  var zoomLevel = 1;

  var isPanning   = false;
  var dragStartX  = 0;
  var dragStartY  = 0;
  var panStartX   = 0;
  var panStartY   = 0;
  var didDrag     = false;  // distinguish click from drag

  // Drag threshold in CSS pixels — moves smaller than this count as clicks
  var DRAG_THRESHOLD = 4;

  // Zoom bounds
  var MIN_ZOOM = 0.3;
  var MAX_ZOOM = 5.0;

  // ── 5. Render function ───────────────────────────────────────────────────────
  function renderCity() {
    // Re-read logical dimensions each frame in case of resize
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;

    // Clear the full canvas in logical (CSS pixel) coordinates.
    // setupCanvas() pre-scales the context by devicePixelRatio so 1 unit = 1 CSS pixel;
    // clearRect(0, 0, W, H) covers the entire canvas without touching that scale.
    ctx.clearRect(0, 0, W, H);

    ctx.save();

    // Apply viewport transform: center → pan → zoom
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoomLevel, zoomLevel);

    // ---- Ground blocks (drawn first — painter's algorithm) ------------------
    for (var g = 0; g < layout.blocks.length; g++) {
      var block = layout.blocks[g];
      drawGround(
        ctx,
        block.screenX,
        block.screenY,
        block.width,
        block.depth,
        block.fill   || 'rgba(18, 24, 40, 0.95)',
        block.stroke || 'rgba(60, 80, 120, 0.4)'
      );
    }

    // ---- Buildings (sorted back-to-front) -----------------------------------
    for (var bi = 0; bi < buildings.length; bi++) {
      var bld = buildings[bi];
      drawBuilding(
        ctx,
        bld.screenX,
        bld.screenY,
        bld.width,
        bld.depth,
        bld.height,
        bld.color
      );
    }

    ctx.restore();
  }

  // Initial render
  renderCity();

  // ── 6. Event listeners ───────────────────────────────────────────────────────

  // ---- Mouse down: start potential pan or click ----------------------------
  canvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return; // left button only
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

      // Only commit to drag once we exceed the threshold
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
      // Hover cursor: pointer over buildings, grab otherwise
      updateCursor(canvas, mx, my, buildings, zoomLevel, panX, panY, false, W, H);
    }
  });

  // ---- Mouse up: end pan / fire click if not dragged ----------------------
  canvas.addEventListener('mouseup', function (e) {
    if (e.button !== 0) return;

    if (!didDrag) {
      // This was a click — do hit testing
      var rect = canvas.getBoundingClientRect();
      var mx   = e.clientX - rect.left;
      var my   = e.clientY - rect.top;
      handleClick(mx, my, buildings, zoomLevel, panX, panY, W, H);
    }

    isPanning = false;
    didDrag   = false;

    // Reset cursor based on current hover position
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

    // Determine zoom factor from scroll delta.
    // deltaMode 0 = pixels, 1 = lines, 2 = pages. Normalize to pixels.
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 24;
    if (e.deltaMode === 2) delta *= 400;

    // Exponential zoom step (feels more natural than linear)
    var zoomFactor = Math.pow(0.999, delta);
    var newZoom    = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel * zoomFactor));

    if (newZoom === zoomLevel) return; // already at bounds

    // Zoom centered on cursor: adjust pan so the point under the cursor stays fixed.
    // Point under cursor in world space before zoom:
    //   worldX = (mx - W/2 - panX) / zoomLevel
    // After zoom the same world point should map to the same screen point:
    //   panX_new = mx - W/2 - worldX * newZoom
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
