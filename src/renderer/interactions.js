// =============================================================================
// interactions.js — Three.js render loop + orbit/pan/zoom + raycast picking
// CodeCity AI
//
// Depends on (loaded before this file in the assembled HTML):
//   THREE             — Three.js global, from CDN
//   OrbitControls     — Three.js addon, exposed as a global by the module shim
//   engine.js         — buildCityScene()
//   colors.js         — getBuildingColor(), getDateRanges()
//   layout.js         — layoutCity()
//   sidebar.js        — showFileSidebar(), showDirSidebar(), closeSidebar()
//   tree.js           — showTreeSidebar()
// =============================================================================

/* global THREE, OrbitControls,
          buildCityScene,
          getBuildingColor, getDateRanges,
          layoutCity,
          showFileSidebar, showDirSidebar, closeSidebar,
          showTreeSidebar */


// -----------------------------------------------------------------------------
// startRenderLoop(canvas, manifest, config)
//
// Main entry point. Builds the scene from the manifest + config, wires up
// OrbitControls (orbit = left drag, pan = right drag or shift+drag, zoom =
// wheel), hooks up raycaster-based click picking, and kicks off the render
// loop.
// -----------------------------------------------------------------------------
function startRenderLoop(canvas, manifest, config) {
  // -- 1. Layout + colors ------------------------------------------------------
  var layout    = layoutCity(manifest.tree, config);
  var dateRanges = getDateRanges(manifest.tree);
  var palette    = config.palette || {};

  for (var i = 0; i < layout.buildings.length; i++) {
    var b = layout.buildings[i];
    if (b.file && b.file.type === 'file') {
      b.color = getBuildingColor(b.file, palette, dateRanges, config);
    } else {
      b.color = 'hsl(220, 15%, 25%)';
    }
  }

  // -- 2. Scene ----------------------------------------------------------------
  var built = buildCityScene(layout);
  var scene = built.scene;
  var buildingMeshes  = built.buildingMeshes;
  var streetPickables = built.streetPickables;
  var streetLabels    = built.streetLabels;
  var rootGem         = built.rootGem;
  var pickables = buildingMeshes.concat(streetPickables);
  var bbox = built.bbox;

  // -- 3. Renderer -------------------------------------------------------------
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  _resizeRendererToCanvas(renderer, canvas);

  // -- 4. Camera ---------------------------------------------------------------
  var W = canvas.clientWidth;
  var H = canvas.clientHeight;
  var camera = new THREE.PerspectiveCamera(45, W / Math.max(1, H), 1, 20000);

  // Isometric framing from the -X/+Y/+Z octant. The root park sits at -X
  // relative to center, so positioning the camera on that same X-axis side
  // pulls the park toward the bottom of the view (closer to camera = lower
  // on screen) while keeping it on the LEFT (camera's right vector points
  // toward +X/+Z, so -X is the left half of the frame).
  var center = new THREE.Vector3();
  bbox.getCenter(center);
  var size = new THREE.Vector3();
  bbox.getSize(size);
  var radius = Math.max(size.x, size.z, size.y) * 0.5 + 10;
  var dist = radius / Math.sin((camera.fov * Math.PI / 180) / 2) * 1.4;
  var dir = new THREE.Vector3(-1, 1, 1).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist));
  camera.lookAt(center);

  // -- 5. Controls -------------------------------------------------------------
  // OrbitControls is a global assigned by the module bootstrap (ES module
  // namespaces are frozen, so we can't stash it on THREE itself).
  var controls = new OrbitControls(camera, canvas);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;   // pan across ground plane, not screen plane
  controls.maxPolarAngle = Math.PI * 0.49;  // prevent going below the ground
  controls.minDistance = 30;
  controls.maxDistance = dist * 4;
  // Left = orbit, middle = dolly, right = pan. Matches common 3D-viewer UX.
  controls.mouseButtons = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.PAN
  };

  // -- 6. Raycaster picking ----------------------------------------------------
  var raycaster = new THREE.Raycaster();
  var pointer   = new THREE.Vector2();

  // We distinguish click vs. drag by tracking pointerdown → pointerup with a
  // small movement threshold; OrbitControls swallows the events internally
  // but pointer events still fire on the canvas.
  var downX = 0, downY = 0, downTime = 0;
  var CLICK_MOVE_THRESHOLD_SQ = 5 * 5;   // px²
  var CLICK_TIME_THRESHOLD    = 400;     // ms

  canvas.addEventListener('pointerdown', function (e) {
    downX = e.clientX;
    downY = e.clientY;
    downTime = Date.now();
  });

  canvas.addEventListener('pointerup', function (e) {
    if (e.button !== 0) return;   // only left click selects
    var dx = e.clientX - downX;
    var dy = e.clientY - downY;
    var dtime = Date.now() - downTime;
    if (dx * dx + dy * dy > CLICK_MOVE_THRESHOLD_SQ) return;
    if (dtime > CLICK_TIME_THRESHOLD) return;
    _handlePick(e.clientX, e.clientY);
  });

  function _handlePick(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
    pointer.y = -((clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickables, false);

    if (hits.length > 0) {
      var hit = hits[0].object.userData;
      if (hit.building && hit.building.file) {
        if (hit.building.file.type === 'directory') showDirSidebar(hit.building.file);
        else showFileSidebar(hit.building.file);
      } else if (hit.street && hit.street.dir) {
        showDirSidebar(hit.street.dir);
      } else {
        closeSidebar();
      }
    } else {
      closeSidebar();
    }
  }

  // Hover cursor — pointer when over a pickable (building or street sidewalk).
  canvas.addEventListener('pointermove', function (e) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
  });

  // -- 7. Resize ---------------------------------------------------------------
  function onResize() {
    _resizeRendererToCanvas(renderer, canvas);
    var cw = canvas.clientWidth;
    var ch = canvas.clientHeight;
    camera.aspect = cw / Math.max(1, ch);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  // -- 8. Keyboard: Escape closes sidebar -------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  // -- 9. Tree sidebar --------------------------------------------------------
  if (typeof showTreeSidebar === 'function') {
    showTreeSidebar(manifest);
  }

  // -- 10. Render loop --------------------------------------------------------
  var startTime = performance.now();
  function animate() {
    controls.update();
    _orientLabelsForCamera(streetLabels, camera);
    if (rootGem) {
      var t = (performance.now() - startTime) / 1000;   // seconds
      rootGem.rotation.y = t * 0.6;                      // slow spin
      rootGem.position.y = rootGem.userData.baseY + Math.sin(t * 1.4) * 1.5;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}


// -----------------------------------------------------------------------------
// _orientLabelsForCamera — keep flat street labels readable at any orbit.
//
// The flip decision has to come from the camera's ORIENTATION, not its
// position. At top-down the camera can sit over the center of the scene yet
// still be rotated 180° around Y; a position-based check flips the wrong way
// in that case. Reading the camera's world-right vector directly handles
// every orbit angle consistently.
//
// x-orient label: text runs along scene-X. Flip if the camera's right points
// in -X (the camera is mirrored relative to the text).
// y-orient label: text runs along scene-Z (after the baseRotY = -π/2 turn).
// Flip if the camera's right points in +Z.
// -----------------------------------------------------------------------------
var _labelRight = null;

function _orientLabelsForCamera(labels, camera) {
  // Lazy-init: the classic scripts load before the module bootstrap has set
  // window.THREE, so we can't construct a Vector3 at module top level.
  if (_labelRight === null) _labelRight = new THREE.Vector3();

  _labelRight.setFromMatrixColumn(camera.matrixWorld, 0);
  var rightX = _labelRight.x;
  var rightZ = _labelRight.z;

  for (var i = 0; i < labels.length; i++) {
    var lbl = labels[i];
    var street = lbl.userData.street;
    var base = lbl.userData.baseRotY || 0;
    var flip;
    if (street.orientation === 'x') {
      // x-street baseline runs along +X → flip when camera right points -X.
      flip = (rightX < 0) ? Math.PI : 0;
    } else {
      // y-street baseline runs along +Z (after the -π/2 baseRotY) → flip
      // when camera right points -Z.
      flip = (rightZ < 0) ? Math.PI : 0;
    }
    lbl.rotation.y = base + flip;
  }
}


// -----------------------------------------------------------------------------
// _resizeRendererToCanvas — sync the WebGL backing store to the canvas CSS size
// -----------------------------------------------------------------------------
function _resizeRendererToCanvas(renderer, canvas) {
  var cw = canvas.clientWidth;
  var ch = canvas.clientHeight;
  renderer.setSize(cw, ch, false);
}


// CommonJS exports for Vitest (guarded so browser concatenation still works).
// The rendering layer is now WebGL-only and not unit-tested in Node; e2e
// coverage lives in src/tests/e2e/city.spec.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    startRenderLoop
  };
}
