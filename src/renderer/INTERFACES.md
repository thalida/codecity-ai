# Renderer Module Interfaces

This document defines the data shapes passed between renderer modules.
All modules MUST use these exact property names. Tests verify compliance.

## Building (output of layoutCity, consumed by engine.js)

```text
{
  x: number,        // world-space X position (center of building base)
  y: number,        // world-space Y position (center of building base)
  w: number,        // building width  (world units, along world-X)
  d: number,        // building depth  (world units, along world-Y)
  h: number,        // building height (world units, along world-Z)
  color: string,    // HSL color string, e.g. "hsl(215, 80%, 50%)"
  orient: string,   // 's' | 'e' | 'n' | 'w' — which face has the door
  file: object      // reference to manifest file node
}
```

Note: layout coords are `(x east-west, y north-south)` with z up. The
Three.js scene maps `(x, y, z-up)` → `(x, z, y-up)` so the camera's Y axis
points up, while the underlying layout math stays in its natural frame.

## Manifest File Node (from scanner, consumed by colors.js and sidebar.js)

```text
{
  name: string,
  type: "file",
  path: string,
  fullPath: string,
  extension: string,
  size: number,
  lines: number,
  binary: boolean,
  created: string,       // ISO-8601 filesystem date
  modified: string,      // ISO-8601 filesystem date
  git: {                 // null if no git data
    created: string,
    modified: string,
    commits: number,
    contributors: string[]
  }
}
```

## Manifest Directory Node

```text
{
  name: string,
  type: "directory",
  path: string,
  fullPath: string,
  children_count: number,
  children_file_count: number,
  children_dir_count: number,
  descendants_count: number,
  descendants_file_count: number,
  descendants_dir_count: number,
  descendants_size: number,
  children: (FileNode | DirectoryNode)[]
}
```

## Function Signatures

### engine.js (Three.js scene builders)

- `createBuildingMesh(building)` → `THREE.Mesh`
- `createStreetMesh(street, yBase)` → `THREE.Group`
- `createPathMesh(path, yBase)` → `THREE.Mesh`
- `buildCityScene(layout)` → `{ scene, buildingMeshes, bbox }`
- `shadeColor(hslString, amount)` / `shadeAndShiftHue(hslString, dL, dH)` — HSL helpers

### colors.js

- `getHue(extension, palette)` → number
- `getSaturation(createdDate, minDate, maxDate, config)` → number
- `getLightness(modifiedDate, minDate, maxDate, config)` → number
- `getDateRanges(manifestTree)` → `{ createdMin, createdMax, modifiedMin, modifiedMax }`
- `getBuildingColor(fileNode, palette, dateRanges, config)` → HSL string

### layout.js

- `getStreetTier(childrenCount, tiers)` → number (1-5)
- `getStreetWidth(tier)` → number
- `getBuildingDimensions(fileNode, config)` → `{ w, d, h }`
- `layoutCity(manifestTree, config)` → `{ streets, buildings, paths, blocks }`
- `sortForRendering(buildings)` → Building[]

### sidebar.js

- `showFileSidebar(fileNode)` — populates and shows sidebar
- `showDirSidebar(dirNode)` — populates and shows sidebar
- `closeSidebar()` — hides sidebar

### interactions.js

- `startRenderLoop(canvas, manifest, config)` — main entry point. Builds the
  scene, attaches OrbitControls, raycaster click-picking, and kicks off the
  render loop. Expects `window.THREE` and `THREE.OrbitControls` to be present.
