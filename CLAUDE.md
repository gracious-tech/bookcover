# Paper Cover Generator

A modular book cover generation system. Core logic builds a virtual Typst filesystem;
platform wrappers compile it to PDF/SVG/PNG. The widget provides a live 3D preview UI.

## Packages

| Package | Purpose |
|---------|---------|
| `generator/` | Pure TS core — schema validation, dimension calc, Typst file assembly |
| `generator-node/` | Node wrapper — spawns `typst` binary, uses `sharp` for PNG cropping |
| `generator-web/` | Browser wrapper — compiles via WASM (`typst.ts` ^0.7.0-rc2) |
| `widget/` | Vue 3 web UI — sidebar form, preview pane, 3D book view |
| `3d/` | WebGL 3D book renderer — custom shaders, no external graphics libs |

Dependency graph: `generator` < `generator-node`, `generator-web` < `widget`; `3d` < `widget`.
`generator` and `3d` have no local dependencies on each other.

## Build

Each package compiles TypeScript to `dist/` via `tsc`. Local deps use `file:../package-name`.
Build in dependency order using the `.bin/` scripts:

```bash
.bin/build_modules       # generator -> generator-node -> generator-web -> 3d
.bin/build_widget        # vite build (widget/dist/)
.bin/build_site          # build_modules + build_widget
.bin/build_deploy        # npm ci all packages + build everything (for CI)
```

For development:

```bash
cd widget && npm run dev  # starts vite dev server with HMR
```

Individual package builds: `.bin/build_generator`, `.bin/build_generator-node`,
`.bin/build_generator-web`, `.bin/build_3d`.

Type-check a package: `cd <package> && npx tsc --noEmit`

### Tests

No test suite. `.bin/test` generates PDF/SVG/PNG files in the project root for manual
visual inspection. It builds `generator` and `generator-node` first, then runs a Node
script that calls `generate()` with a sample schema.

## Architecture

### Generator core (`generator/src/`)

- `schema.ts` — Zod schema for cover input; validates and parses all user options
- `dimensions.ts` — Queries `printing-services` for bleed, spine, trim, and cover regions
- `design.ts` — Derives colors (auto-contrast, gradient, blurb bg) from schema
- `font_sizes.ts` — Computes font sizes proportional to trim height; balances subtitle lines
- `build_files.ts` — Assembles the virtual filesystem: `_data.typ` (all variables), images,
  pattern SVG, icon SVGs, barcode SVG, frame composites
- `split.ts` — Splits a full-spread output into front/back/spine panels (SVG viewBox
  adjustment, PDF CropBox injection, PNG pixel cropping)
- `fonts.ts` — Bundled font manifest and lookup; `collect_fonts()` resolves which fonts a
  schema needs
- `patterns.ts` — 60+ SVG pattern definitions from heropatterns.com (large data file)
- `barcode.ts` — ISBN-13 barcode generation via bwip-js
- `frame.ts` — Composites background images into decorative frames (painted, torn edges)
- `icon_cache.ts` — Fetches and caches Iconify SVGs with size/color stripping

### Typst templates (`generator/assets/typst/`)

- `cover.typ` — Main template; receives all variables from `_data.typ` (generated at build
  time). Layers: background fills -> pattern -> image -> spine bg -> icons -> back content
  (blurb + barcode) -> spine text -> front content (title/subtitle/author in position boxes)
- `_helpers.typ` — `fit-to-width` and `shrink-to-width` scaling helpers used by cover.typ

### Platform wrappers

**generator-node**: Writes files to a temp directory, spawns the `typst` CLI binary, reads
output back. Uses `sharp` for PNG cropping in split mode.

**generator-web**: Manages a `TypstCompiler` + optional `TypstRenderer` (WASM). Files are
loaded into a virtual shadow filesystem. The compiler is reinitialised when the set of
required fonts changes (tracked by `active_fonts` cache key). Renderer is init'd once.

### Widget (`widget/src/`)

- `form_state.ts` — Reactive form state (`FormState` interface), injected via Vue provide/inject
- `schema.ts` — Converts `FormState` into the generator schema format
- `App.vue` — Root layout; initialises the WASM generator, manages generate-on-change loop
  with debouncing and deferred generation while modals are open
- `components/sidebar/SidebarPanel.vue` — Four collapsible sections: Cover Text, Book Size,
  Background, Advanced
- `components/preview/PreviewPane.vue` — Tab bar (Full/Split/3D/Photo/Print) + preview
  components; computes dimensions for display
- `services/` — Static data for suggested backgrounds, patterns, and icons

### 3D renderer (`3d/src/`)

Custom WebGL renderer — no Three.js or other graphics libs:
- `geometry.ts` — Book mesh generation (front/back/spine/pages with rounded spine)
- `webgl.ts` — WebGL context, shader compilation, texture management
- `math.ts` — Matrix/vector math (perspective, lookAt, normals)
- `photo.ts` — Composites the 3D render onto background photographs
- `svg.ts` — Rasterises SVG panels to textures via OffscreenCanvas

## printing-services

All dimension calculations and available print options come from the `printing-services`
library (installed in `generator/` and `widget/`). Do not hardcode dimensions, spine widths,
bleed values, or option lists.

- `get_service(id)` returns a service; `list_services()` returns all
- Services: `kdp`, `lulu`, `officeworks`, `vistaprint_au`, `ctrlprint`
- Each service exposes: `get_sizes()`, `get_binding_types()`, `get_ink_types()`,
  `get_paper_types()`, `get_cover_types()`, `get_dimensions()`
- `get_dimensions()` requires `size`, `pages`, `binding_type`; conditionally requires
  `paper_type` (when `cover_calc_requires_paper`) and `ink_type` (when
  `cover_calc_requires_ink`)
- Dimensions are `Big` instances (big.js) — use `.toNumber()` to convert
- The widget only shows options that affect dimension calculations

### Schema format

```js
printer: {service: 'kdp', binding_type: 'paperback', ink_type: 'bw', paper_type: 'white'}
size: {size_id: 'us_trade', page_count: 300}
// or custom size:
size: {trim_width: 152, trim_height: 229, trim_unit: 'mm', page_count: 300}
```

## Key patterns

- **Font loading (web)**: `loadFonts()` from typst.ts with `assets: ['text']`. Bundled fonts
  are served from the assets prefix; custom fonts use blob URLs created from raw TTF bytes.
  Blob URLs are revoked on reinit to prevent leaks.
- **Split output**: SVG splits adjust the viewBox; PDF splits inject CropBox arrays into the
  raw PDF bytes; PNG splits use a crop callback (`sharp` on Node, Canvas API on web).
- **Debounced inputs**: Color pickers debounce at 800ms (`ColorPicker.vue`) or 2000ms
  (`BackgroundSection.vue` bg_color, `ColorSwatch.vue`). The main generate loop in `App.vue`
  has its own debounce on top.
- **Modal tracking**: `modal_state.ts` tracks open modals; `App.vue` defers regeneration
  while any modal is open to avoid layout thrashing.
- **Custom fonts**: Uploaded .ttf/.otf/.zip files are processed in `custom_fonts.ts`, stored
  as `FontFace` objects in `document.fonts`, and passed as raw `Uint8Array` bytes to the
  generator for Typst compilation.
- **Vue Pug + TS**: Volar can't trace Pug template bindings, so components/refs used only
  in templates get `@ts-ignore TS6133` comments. `SidebarPanel.vue` uses `defineOptions({components})`
  to register its children explicitly.

## .bin/ scripts

| Script | Purpose |
|--------|---------|
| `build_generator` | `tsc` in generator/ |
| `build_generator-node` | `tsc` in generator-node/ |
| `build_generator-web` | `tsc` in generator-web/ |
| `build_3d` | `tsc` in 3d/ |
| `build_modules` | All four above in dependency order |
| `build_widget` | `vite build` in widget/ |
| `build_web` | generator + generator-web + 3d (no node) |
| `build_site` | build_modules + build_widget |
| `build_deploy` | npm ci all + full build (for CI/Netlify) |
| `serve_widget` | `vite` dev server in widget/ |
| `serve_site` | `vite` dev server in site/ |
| `test` | Generate test covers (PDF/SVG/PNG) for visual inspection |
| `setup_typst` | Download latest typst binary to .bin/ |
| `download_fonts` | Fetch Google Fonts into generator/assets/fonts/ + generate manifest |
| `gen_bg_thumbnails` | Generate 160x120 thumbnails for background images via sharp |

## Gotchas

- **Widget CSS**: `styles.sss` (SugarSS) for global styles; `tailwind.css` must stay vanilla
  CSS because Tailwind's plugin system breaks inside preprocessors.
- **Typst binary**: `generator-node` requires `typst` on PATH. Run `.bin/setup_typst` to install.
- **WASM lifecycle**: `generator-web` creates a `CoverGenerator` instance via `init()`.
  The compiler is reinitialised per-generate when fonts change; the renderer is not
  (glyph outlines are embedded in compiled vector data).
- **Pug comments**: Use `//-` not `//` in `<template lang="pug">` blocks.
- **npm v9 bug**: `widget/` fails `npm install` on npm 9.x due to nested `file:` dep
  resolution; use `npx npm@latest install` as a workaround.
- **generator_assets symlink**: `widget/public/generator_assets` is a symlink to
  `../../generator/assets` so Vite can serve fonts, backgrounds, and templates at dev time.
- **No semicolons**: All TypeScript uses no semicolons, snake_case for variables/functions.
- **Patterns file**: `generator/src/patterns.ts` is ~810 lines / 167K tokens — almost
  entirely inline SVG data strings. Don't try to read the whole file.
