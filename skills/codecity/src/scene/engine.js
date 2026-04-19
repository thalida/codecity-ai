// engine.js — Three.js scene builder. Turns layout output into a Scene of meshes.
//
// World axes: X east-west, Y north-south, Z up. Buildings are BoxGeometry with
// per-face CanvasTextures (floor bands, windows, ground-floor door). Streets
// are flat planes. The root of the tree gets a spinning gold octahedron on a
// plaza.

import * as THREE from 'three';
function hslToComponents(hslString) {
  var inner = hslString.replace(/^hsl\(/i, '').replace(/\)$/, '');
  var parts = inner.split(',');
  return {
    h: parseFloat(parts[0].trim()),
    s: parseFloat(parts[1].trim()),
    l: parseFloat(parts[2].trim())
  };
}

function componentsToHsl(h, s, l) {
  return 'hsl(' + Math.round(h) + ', ' + s.toFixed(1) + '%, ' + l.toFixed(1) + '%)';
}

function shadeColor(hslString, amount) {
  var c = hslToComponents(hslString);
  var newL = Math.max(0, Math.min(100, c.l + amount));
  return componentsToHsl(c.h, c.s, newL);
}

function shadeAndShiftHue(hslString, lightnessDelta, hueDelta, minLightness) {
  var c = hslToComponents(hslString);
  var floor = (minLightness != null) ? minLightness : 0;
  var newL = Math.max(floor, Math.min(100, c.l + lightnessDelta));
  var newH = ((c.h + hueDelta) % 360 + 360) % 360;
  return componentsToHsl(newH, c.s, newL);
}

// Multiplicative darkening with an absolute floor. Used for side walls so
// that contrast against the front face scales with the base lightness — dim
// files still have visibly darker sides without ever crushing to black.
function shadeByRatio(hslString, ratio, hueDelta, floor) {
  var c = hslToComponents(hslString);
  var newL = Math.max(floor, c.l * ratio);
  var newH = ((c.h + hueDelta) % 360 + 360) % 360;
  return componentsToHsl(newH, c.s, newL);
}


// -----------------------------------------------------------------------------
// Scene-wide constants
// -----------------------------------------------------------------------------
var FLOOR_HEIGHT = 10;                  // one floor = 10 world units tall
var STREET_COLOR_ASPHALT  = 0x1a1d28;
var STREET_COLOR_SIDEWALK = 0x2a3050;
var GROUND_COLOR          = 0x0a0b10;


// -----------------------------------------------------------------------------
// _buildFacadeTexture(opts) -> THREE.CanvasTexture
//
// Paints the side of a building onto a 2D canvas and returns it as a Three.js
// texture. The texture encodes:
//   - the wall base color
//   - a thin darker slab band at each floor ceiling
//   - a grid of lighter window rectangles, one row per floor
//   - (optional) a door on the ground floor
//
// The texture is sampled across the full face, so widths/heights in the
// building mesh are real-world units — the texture stretches to fit.
// -----------------------------------------------------------------------------
function _buildFacadeTexture(opts) {
  var floors     = opts.floors;
  var cols       = opts.cols;
  var wallColor  = opts.wallColor;
  var slabColor  = opts.slabColor;
  var winColor   = opts.winColor;
  var doorColor  = opts.doorColor;
  var hasDoor    = !!opts.hasDoor;

  // Pixel canvas — 64 px per floor vertically gives enough room for a window
  // row that reads clearly at typical zoom. 128 px wide per column.
  var pxPerFloor = 64;
  var pxPerCol   = 128;
  var width      = Math.max(128, pxPerCol * cols);
  var height     = Math.max(64,  pxPerFloor * floors);

  var canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');

  // Base wall color
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, width, height);

  // Slab band at the top of every floor (a thin horizontal stripe)
  ctx.fillStyle = slabColor;
  var slabPx = Math.max(3, Math.floor(pxPerFloor * 0.12));
  for (var fi = 0; fi < floors; fi++) {
    // Texture Y=0 is the TOP of the face. Floor `fi` (counting from the
    // ground) occupies texture rows [height - (fi+1)*pxPerFloor, height - fi*pxPerFloor].
    // The slab sits at the top of that span.
    var bandTop = height - (fi + 1) * pxPerFloor;
    ctx.fillRect(0, bandTop, width, slabPx);
  }

  // Windows — one row per floor, `cols` columns across, inset within a
  // margin on each face edge.
  var marginX = Math.floor(width  * 0.08);
  var cellW   = (width - 2 * marginX) / cols;
  var winW    = Math.floor(cellW * 0.45);
  var winH    = Math.floor(pxPerFloor * 0.45);

  ctx.fillStyle = winColor;
  for (var f = 0; f < floors; f++) {
    var floorBottomPx = height - f * pxPerFloor;
    var floorTopPx    = floorBottomPx - pxPerFloor;
    // Window row sits roughly centered in the floor, above the slab band.
    var winCenterY    = floorTopPx + slabPx + (pxPerFloor - slabPx) / 2;
    var winY          = Math.floor(winCenterY - winH / 2);

    // Skip this floor's window row on the door face, ground floor only.
    if (hasDoor && f === 0) continue;

    for (var c = 0; c < cols; c++) {
      var cellCenterX = marginX + cellW * (c + 0.5);
      var winX        = Math.floor(cellCenterX - winW / 2);
      ctx.fillRect(winX, winY, winW, winH);
    }
  }

  // Door — centered on the ground floor, on the door face.
  if (hasDoor) {
    var doorW = Math.floor(width * 0.14);
    var doorH = Math.floor(pxPerFloor * 0.7);
    var doorX = Math.floor((width - doorW) / 2);
    var doorY = height - doorH;
    ctx.fillStyle = doorColor;
    ctx.fillRect(doorX, doorY, doorW, doorH);
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}


// -----------------------------------------------------------------------------
// _buildRoofTexture(opts) -> THREE.CanvasTexture
//
// A simple texture for the top face: flat roof color with a faint darker
// border so it reads as a roof slab rather than a featureless cap.
// -----------------------------------------------------------------------------
function _buildRoofTexture(opts) {
  var canvas = document.createElement('canvas');
  canvas.width  = 128;
  canvas.height = 128;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.roofColor;
  ctx.fillRect(0, 0, 128, 128);
  // Subtle border
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


// -----------------------------------------------------------------------------
// createBuildingMesh(building) -> THREE.Mesh
//
// Builds a single building mesh from a layout Building object:
//   { x, y, w, d, h, color, orient, file }
//
// Three.js box geometry has 6 faces; we assign a material per face with a
// CanvasTexture that paints the right pattern for each side. Texture widths
// are based on the number of window columns per face (so tall, thin buildings
// get narrow one-window-wide textures and wide buildings get more columns).
//
// The mesh is positioned so its base sits on z=0 and its center is at (x, y).
// `building.file` is attached to `mesh.userData.building` so raycast hits can
// look the original building object back up.
// -----------------------------------------------------------------------------
function createBuildingMesh(building) {
  var w = building.w;
  var d = building.d;
  var h = building.h;
  var color = building.color || 'hsl(220, 10%, 40%)';

  // Snap height to whole floors so textures line up.
  var floors = Math.max(1, Math.round(h / FLOOR_HEIGHT));
  var renderH = floors * FLOOR_HEIGHT;

  // Scene convention: Three.js Y is up. Layout coords (x, y) map to scene
  // (x, z) with building height along scene-Y. So a BoxGeometry(w, renderH, d)
  // has its sides running along world-X and world-Z — exactly what we want.
  //
  // BoxGeometry material order: [+X, -X, +Y, -Y, +Z, -Z]
  // Window-column counts scale with each face's horizontal extent:
  //   ±X faces (east/west walls)   have horizontal extent = d
  //   ±Z faces (north/south walls) have horizontal extent = w
  var colsEW = Math.max(1, Math.min(5, Math.floor(d / 8)));
  var colsNS = Math.max(1, Math.min(5, Math.floor(w / 8)));

  // Palette — opposing faces share a color so the building looks symmetric
  // as the camera orbits. Front/back faces use a slight absolute lightness
  // bump; side faces use a MULTIPLICATIVE darkening so they always read as
  // proportionally darker than the front regardless of the base lightness,
  // with an absolute floor that keeps them from crushing to pure black on
  // dim files (old/untouched) and blending into the dark background.
  var wallFront  = shadeAndShiftHue(color,  -5,  18);           // lighter, warmer
  var wallSide   = shadeByRatio(color, 0.55, -10, 14);          // ~45% darker, floor 14
  var slabFront  = shadeAndShiftHue(color, -15,  18);
  var slabSide   = shadeByRatio(color, 0.40, -10, 10);
  var winColor   = shadeColor(color,  20);
  var doorColor  = shadeAndShiftHue(color, -55,  0);
  var roofColor  = color;
  var roofBorder = shadeAndShiftHue(color, -15, 0);

  // Door face mapping. Layout orient describes which face actually points at
  // the adjacent street; scene maps layout-y to scene-z.
  //   's' → door on layout +y = scene +Z (material index 4)
  //   'n' → door on layout -y = scene -Z (material index 5)
  //   'e' → door on layout +x = scene +X (material index 0)
  //   'w' → door on layout -x = scene -X (material index 1)
  var orient = building.orient || 's';
  var doorOnEW = (orient === 'e' || orient === 'w');

  // Assign the lighter "front" palette to the pair of faces that contains
  // the door; the other pair gets the darker "side" palette.
  var wallNS = doorOnEW ? wallSide  : wallFront;
  var wallEW = doorOnEW ? wallFront : wallSide;
  var slabNS = doorOnEW ? slabSide  : slabFront;
  var slabEW = doorOnEW ? slabFront : slabSide;

  var geometry = new THREE.BoxGeometry(w, renderH, d);

  // One material per face, in BoxGeometry order: [+X, -X, +Y, -Y, +Z, -Z].
  function facadeMat(cols, hasDoor, wallColor, slabColor) {
    var tex = _buildFacadeTexture({
      floors: floors,
      cols: cols,
      wallColor: wallColor,
      slabColor: slabColor,
      winColor: winColor,
      doorColor: doorColor,
      hasDoor: hasDoor
    });
    return new THREE.MeshBasicMaterial({ map: tex });
  }

  function roofMat() {
    var tex = _buildRoofTexture({ roofColor: roofColor, borderColor: roofBorder });
    return new THREE.MeshBasicMaterial({ map: tex });
  }

  function bottomMat() {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(wallEW) });
  }

  var materials = [
    facadeMat(colsEW, orient === 'e', wallEW, slabEW),   // +X (east)
    facadeMat(colsEW, orient === 'w', wallEW, slabEW),   // -X (west)
    roofMat(),                                            // +Y (roof)
    bottomMat(),                                          // -Y (bottom)
    facadeMat(colsNS, orient === 's', wallNS, slabNS),   // +Z (south)
    facadeMat(colsNS, orient === 'n', wallNS, slabNS)    // -Z (north)
  ];

  var mesh = new THREE.Mesh(geometry, materials);

  // Position: building center in XY plane, base sits on z=0.
  // We use Three.js default Y-up internally but position Y to be "up" in the
  // scene as well — the camera is set up for that. World-space mapping from
  // layout (x, y, z-up) to scene (x, y-up, z):
  //     scene.x = layout.x
  //     scene.y = layout.z (height)
  //     scene.z = layout.y
  mesh.position.set(building.x, renderH / 2, building.y);

  mesh.userData.building = building;
  mesh.userData.type = 'building';
  return mesh;
}


// -----------------------------------------------------------------------------
// Ground-plane materials — all the flat pieces (sidewalk, asphalt, paths)
// sit at the same world Y. `polygonOffset` alone isn't enough to kill
// z-fighting between coplanar meshes at typical camera distances, so we
// also disable depth-write and control their stacking via `renderOrder`:
// the lowest renderOrder draws first, higher orders draw on top cleanly
// regardless of their actual Y coordinate.
//
// Ground planes still `depthTest` so buildings occlude them correctly.
// -----------------------------------------------------------------------------
function _flatMat(color, renderOrderLayer) {
  var mat = new THREE.MeshBasicMaterial({
    color: color,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -renderOrderLayer,
    polygonOffsetUnits: -renderOrderLayer
  });
  mat.userData.renderOrderLayer = renderOrderLayer;
  return mat;
}


// -----------------------------------------------------------------------------
// createStreetMesh(street) -> THREE.Group
//
// A street is two stacked flat planes — sidewalk (wider) and asphalt (narrower).
// The group's userData.street points back to the layout street so raycaster
// hits can recover the directory this street represents.
// -----------------------------------------------------------------------------
function createStreetMesh(street, yBase) {
  var group = new THREE.Group();
  var asphaltFrac = 0.6;
  // End caps: small sidewalk-only terminators at each end so streets don't
  // trail off into empty space. Kept subtle (~2 units) — larger caps read
  // as dead-end "rooms" rather than a clean street end.
  var endCap = Math.min(2, street.width * 0.2);
  var asphaltLength = Math.max(street.length * 0.2, street.length - 2 * endCap);

  var swW, swD, asW, asD;
  if (street.orientation === 'x') {
    swW = street.length;   swD = street.width;
    asW = asphaltLength;   asD = street.width * asphaltFrac;
  } else {
    swW = street.width;            swD = street.length;
    asW = street.width * asphaltFrac;  asD = asphaltLength;
  }

  // Sidewalk — the clickable target for street picking. renderOrder=1
  // means all sidewalks across the city draw first, as a single bottom layer.
  var sidewalk = new THREE.Mesh(
    new THREE.PlaneGeometry(swW, swD),
    _flatMat(STREET_COLOR_SIDEWALK, 1)
  );
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(street.x, yBase, street.y);
  sidewalk.renderOrder = 1;
  sidewalk.userData.street = street;
  sidewalk.userData.type = 'street';
  group.add(sidewalk);

  // Asphalt — narrower, always draws on top of every sidewalk (renderOrder=3).
  var asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(asW, asD),
    _flatMat(STREET_COLOR_ASPHALT, 3)
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(street.x, yBase, street.y);
  asphalt.renderOrder = 3;
  group.add(asphalt);

  group.userData.street = street;
  group.userData.sidewalk = sidewalk;   // exposed so callers can pick on it
  group.userData.type = 'street';
  return group;
}


// -----------------------------------------------------------------------------
// createRootGem(street) -> THREE.Group
//
// A floating, slowly spinning octahedron gem hovering over a tiny neon plaza
// that connects to the root street's origin end. Each of the 8 gem faces
// gets a different vibrant color (per-vertex colors on a non-indexed
// octahedron). Render loop drives the rotation and a subtle bob via
// `userData.gem`.
// -----------------------------------------------------------------------------
// 8 gem faces in the GOLD family — amber/honey/yellow tones with varied
// brightness so the gem has life without leaving its color family.
var _GEM_FACE_COLORS = [
  [1.00, 0.84, 0.20],   // classic gold
  [1.00, 0.72, 0.05],   // amber
  [1.00, 0.92, 0.40],   // pale gold
  [0.95, 0.60, 0.00],   // deep gold / saffron
  [1.00, 0.80, 0.35],   // honey
  [0.85, 0.55, 0.10],   // bronze-gold
  [1.00, 0.95, 0.55],   // champagne
  [1.00, 0.68, 0.20]    // warm amber
];
var _GEM_EDGES   = 0xfff4c2;   // warm pale gold edges
var _PLAZA_BORDER = 0xb8b8c4;  // cool light gray — neutral, doesn't steal the gem's spotlight
var _PLAZA_CORE   = 0x1a1026;  // deep plum-black core, reads the border cleanly

function createRootGem(street) {
  var group = new THREE.Group();

  // Size scales with the street so the gem stays proportionate to the city.
  // Plaza matches the street width EXACTLY so it reads as a continuation of
  // the road. Gem is a bit smaller than the plaza so it fits within the
  // bordered core when viewed top-down.
  var plazaSize = street.width;
  var radius = Math.min(plazaSize * 0.35, street.width * 0.45);
  if (radius < 5) radius = 5;
  var hoverY = radius + street.width * 0.3;

  // Anchor the plaza so its inner edge is flush with the road's origin end,
  // and float the gem above the plaza's center. This keeps everything
  // tightly coupled to the start of the road.
  var gemX, gemZ;
  if (street.orientation === 'x') {
    gemX = street.x - street.length / 2 - plazaSize / 2;
    gemZ = street.y;
  } else {
    gemX = street.x;
    gemZ = street.y - street.length / 2 - plazaSize / 2;
  }

  // ---- Plaza: two-layer pad (single border) ---------------------------------
  // Outer: gold border, matches the gem family and stands out against the bg.
  // Core:  deep plum-black so the gold reads as a clean single frame.
  var plazaBorder = new THREE.Mesh(
    new THREE.PlaneGeometry(plazaSize, plazaSize),
    _flatMat(_PLAZA_BORDER, 1)
  );
  plazaBorder.rotation.x = -Math.PI / 2;
  plazaBorder.position.set(gemX, 0, gemZ);
  plazaBorder.renderOrder = 1;
  group.add(plazaBorder);

  var borderWidth = plazaSize * 0.12;
  var coreSize = plazaSize - borderWidth * 2;
  var plazaCore = new THREE.Mesh(
    new THREE.PlaneGeometry(coreSize, coreSize),
    _flatMat(_PLAZA_CORE, 2)
  );
  plazaCore.rotation.x = -Math.PI / 2;
  plazaCore.position.set(gemX, 0, gemZ);
  plazaCore.renderOrder = 2;
  group.add(plazaCore);

  // ---- Gem: per-face colored octahedron -------------------------------------
  var geo = new THREE.OctahedronGeometry(radius, 0);
  var colorAttr = new Float32Array(geo.attributes.position.count * 3);
  for (var f = 0; f < 8; f++) {
    var fc = _GEM_FACE_COLORS[f];
    for (var v = 0; v < 3; v++) {
      var idx = (f * 3 + v) * 3;
      colorAttr[idx]     = fc[0];
      colorAttr[idx + 1] = fc[1];
      colorAttr[idx + 2] = fc[2];
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));

  var body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  }));

  var edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: _GEM_EDGES })
  );

  var gem = new THREE.Group();
  gem.add(body);
  gem.add(edges);
  gem.position.set(gemX, hoverY, gemZ);
  gem.userData.baseY = hoverY;
  gem.userData.type = 'root-gem';

  group.add(gem);
  group.userData.gem = gem;
  return group;
}


// -----------------------------------------------------------------------------
// createPathMesh(path) -> THREE.Mesh
//
// Thin sidewalk-colored strip connecting a building's door to the adjacent
// street. Sits between the sidewalk and asphalt layers via polygonOffset so
// it doesn't z-fight at intersections with either.
// -----------------------------------------------------------------------------
function createPathMesh(path, yBase) {
  // Paths sit between sidewalks (1) and asphalts (3) so they extend the
  // sidewalk all the way to the building without overdrawing the asphalt.
  var mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(path.w, path.d),
    _flatMat(STREET_COLOR_SIDEWALK, 2)
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(path.x, yBase, path.y);
  mesh.renderOrder = 2;
  return mesh;
}


// -----------------------------------------------------------------------------
// createStreetLabels(street) -> THREE.Group[]
//
// Flat text painted on the road, aligned with the street's long axis (like
// labels on a map). Longer streets repeat the label so you always have one
// nearby. Each label is a plane lifted a tiny amount above the asphalt so it
// doesn't z-fight with the road, and it participates in normal depth testing
// so buildings occlude it correctly — no clipping through them.
//
// Each returned Group wraps one label plane and exposes its orientation via
// userData so the render loop can flip it 180° around scene-Y when the
// camera orbits to the "upside-down" side.
// -----------------------------------------------------------------------------
function _buildLabelTexture(text) {
  var fontPx = 72;
  var pad    = 18;
  var measure = document.createElement('canvas').getContext('2d');
  measure.font = '700 ' + fontPx + 'px Inter, "SF Mono", sans-serif';
  var textW = Math.ceil(measure.measureText(text).width);
  var canvas = document.createElement('canvas');
  canvas.width  = textW + pad * 2;
  canvas.height = fontPx + pad * 2;
  var ctx = canvas.getContext('2d');
  ctx.font = '700 ' + fontPx + 'px Inter, "SF Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Dark outline + bright fill — readable over asphalt at any zoom.
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(10, 11, 16, 0.9)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#eef1fa';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, aspect: canvas.width / canvas.height };
}

function createStreetLabels(street) {
  var text = street.label || '';
  if (!text) return [];

  var info = _buildLabelTexture(text);

  // Label sizing scales with street width — narrow alleys get small text,
  // wide boulevards get large text — so the label always fits its asphalt
  // and reads at a consistent proportion of the street it's labeling.
  var worldH = street.width * 0.45;
  var worldW = worldH * info.aspect;

  // Repetition: one copy per ~120 world units, min 1. Big cities get many
  // labels along long streets so there's always one near the viewport.
  var spacing = 120;
  var count   = Math.max(1, Math.floor(street.length / spacing));

  var labels = [];
  for (var i = 0; i < count; i++) {
    var t = (count === 1) ? 0.5 : (i + 0.5) / count;
    var offset = (t - 0.5) * street.length;
    var sx = street.x, sz = street.y;
    if (street.orientation === 'x') sx += offset;
    else                             sz += offset;

    var mat = new THREE.MeshBasicMaterial({
      map: info.texture,
      transparent: true
    });
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), mat);
    plane.rotation.x = -Math.PI / 2;   // lay flat

    // Wrap in a group so we can apply a single rotation.y for camera-follow
    // flipping without fighting the Euler order of the flattened plane.
    var group = new THREE.Group();
    group.add(plane);
    // Lift a tiny amount off the asphalt to avoid coplanar z-fighting, while
    // staying well below building tops so buildings still occlude the label.
    group.position.set(sx, 0.5, sz);
    // Base rotation per orientation. For y-streets the label's reading
    // direction needs to run along scene-Z, so rotate the group 90°.
    group.userData.baseRotY = (street.orientation === 'y') ? -Math.PI / 2 : 0;
    group.rotation.y = group.userData.baseRotY;
    group.userData.street = street;
    group.userData.type = 'street-label';
    labels.push(group);
  }
  return labels;
}


export function buildCityScene(layout) {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND_COLOR);

  // Streets + their labels
  var streets = layout.streets || [];
  var streetPickables = [];
  var streetLabels = [];
  var rootGem = null;
  for (var si = 0; si < streets.length; si++) {
    var sg = createStreetMesh(streets[si], 0);
    scene.add(sg);
    streetPickables.push(sg.userData.sidewalk);

    var labels = createStreetLabels(streets[si]);
    for (var li = 0; li < labels.length; li++) {
      scene.add(labels[li]);
      streetLabels.push(labels[li]);
    }

    // Root-of-repo landmark at the street's origin end.
    if (streets[si].isRoot) {
      var gemGroup = createRootGem(streets[si]);
      scene.add(gemGroup);
      rootGem = gemGroup.userData.gem;
    }
  }

  // Paths
  var paths = layout.paths || [];
  for (var pi = 0; pi < paths.length; pi++) {
    scene.add(createPathMesh(paths[pi], 0));
  }

  // Buildings
  var buildingMeshes = [];
  var buildings = layout.buildings || [];
  for (var bi = 0; bi < buildings.length; bi++) {
    var b = buildings[bi];
    if (b.file && b.file.type === 'directory') continue;
    var mesh = createBuildingMesh(b);
    scene.add(mesh);
    buildingMeshes.push(mesh);
  }

  // Bounding box of the whole city (in scene coords). Used by the caller to
  // frame the camera.
  var bbox = new THREE.Box3().setFromObject(scene);
  if (bbox.isEmpty()) {
    bbox.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 10, 50));
  }

  return {
    scene: scene,
    buildingMeshes: buildingMeshes,
    streetPickables: streetPickables,
    streetLabels: streetLabels,
    rootGem: rootGem,
    bbox: bbox
  };
}
