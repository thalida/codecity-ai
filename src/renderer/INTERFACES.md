# Renderer Module Interfaces

This document defines the data shapes passed between renderer modules.
All modules MUST use these exact property names. Tests verify compliance.

## Building (output of layoutCity, consumed by renderCity in interactions.js)

```
{
  x: number,        // world-space X position (center of building base)
  y: number,        // world-space Y position (center of building base)
  w: number,        // building width (world units)
  d: number,        // building depth (world units)
  h: number,        // building height (world units)
  color: string,    // HSL color string, e.g. "hsl(215, 80%, 50%)"
  file: object,     // reference to manifest file/dir node
  hitBox: {         // axis-aligned bounding box for click detection
    x: number,      // top-left X in world space
    y: number,      // top-left Y in world space
    w: number,      // box width
    h: number       // box height
  }
}
```

## Block (output of layoutCity, consumed by renderCity)

```
{
  x: number,        // world-space X position (center of block)
  y: number,        // world-space Y position (center of block)
  w: number,        // block width (world units)
  d: number,        // block depth (world units)
  label: string,    // directory name to render as street label
  dir: object       // reference to manifest directory node
}
```

## Manifest File Node (from scanner, consumed by colors.js and sidebar.js)

```
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

```
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

### engine.js
- `isoProject(x, y, z)` → `{ sx, sy }`
- `drawBuilding(ctx, x, y, w, d, h, hslColor)` — draws at world position
- `drawGround(ctx, x, y, w, d, fill, stroke)` — draws ground plane
- `drawLabel(ctx, x, y, text, color)` — draws text label at world position
- `setupCanvas(canvas)` → `ctx`

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
- `layoutCity(manifestTree, config)` → `{ blocks: Block[], buildings: Building[] }`
- `sortForRendering(buildings)` → Building[]

### sidebar.js
- `showFileSidebar(fileNode)` — populates and shows sidebar
- `showDirSidebar(dirNode)` — populates and shows sidebar
- `closeSidebar()` — hides sidebar

### interactions.js
- `startRenderLoop(canvas, manifest, config)` — main entry point
