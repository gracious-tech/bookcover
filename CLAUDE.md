# Paper Cover Generator

A modular book cover generation system. Core logic builds a virtual Typst filesystem;
platform wrappers compile it to PDF/SVG/PNG. The widget provides a live 3D preview UI.

## Packages

| Package | Purpose |
|---------|---------|
| `generator/` | Pure TS core — schema validation, dimension calc, Typst file assembly |
| `generator-node/` | Node wrapper — spawns `typst` binary, uses `sharp` for PNG cropping |
| `generator-web/` | Browser wrapper — compiles via WASM (`typst.ts`) |
| `widget/` | Vue 3 web UI — sidebar form, preview pane, 3D book view |
| `3d/` | WebGL 3D book renderer — custom shaders, no external graphics libs |
| `typst/typst-utils/` | Zero-dep Typst string escaping (`escape_typst_str`, `escape_typst`) |
| `typst/typst-fonts/` | Generic font manifest/fallback/sfnt logic for any Typst app |
| `typst/pm-to-typst/` | Pure ProseMirror/Tiptap doc JSON → Typst renderer |

Dependency graph: `generator` < `generator-node`, `generator-web` < `widget`; `3d` < `widget`.
`generator` and `3d` have no local deps on each other.

The three `typst/` helpers are generic (nothing cover-specific) and published to npm — they're
maintained here as workspaces (adopted from paper_bible, which now depends on this repo, not
the other way round): `typst-utils` is used by `generator` and `widget`, `pm-to-typst` by
`widget`, and `typst-fonts` by `generator`, both platform wrappers, and `widget` — see its API
notes below. All Typst escaping lives in `typst-utils` — don't re-implement it.

The blurb is a WYSIWYG field. `pm-to-typst` is renderer-only — it does NOT own the editor
schema. The shared Tiptap schema lives in `widget/src/blurb_extensions.ts` (`blurb_extensions`
= StarterKit with link disabled, so the cover stays link-free); both the editor
(`BlurbEditorModal.vue`) and the sidebar previews (`ContentSection.vue`) build from that one
list so what they parse never diverges. Tiptap stores the blurb as ProseMirror document JSON
(`form.blurb`); the cover is rendered via `pm_to_typst()` (with curly-quote + escaping injected
through the renderer's `text` extension point in `widget/src/schema.ts`), while the sidebar
previews use Tiptap's own `generateHTML` / `generateText`. The Typst renderer is a per-node/
per-mark handler registry — `pm_to_typst(doc, custom)` merges a partial `{text, nodes, marks,
fallback}` over the built-in renderer (`extend_renderer`), so extra node/mark types (color,
alignment, etc.) can be registered; when adding one, register the matching Tiptap extension in
`blurb_extensions` and a handler together so the schema and renderer stay in lockstep.

## Build

Each package compiles TypeScript to `dist/` via `tsc`. The packages are npm workspaces of the
repo root. Build in dependency order using the `.bin/` scripts:

```bash
.bin/build_modules       # typst helpers -> generator -> generator-node -> generator-web -> 3d
.bin/build_widget        # vite build (widget/dist/)
.bin/build_site          # build_modules + build_widget
.bin/build_deploy        # npm ci all packages + build everything (for CI)
```

The fonts collection (curated fonts + Noto fallback set + `manifest.json`) is managed by this
repo but NOT committed: `font_config.json` names the curated families, `.bin/download_fonts`
populates `assets/fonts/` (gitignored) via the `typst-fonts-download` CLI, and
`.bin/deploy_assets fonts` syncs that tree to the public assets bucket at
`https://assets.paper.bible/fonts`. Font manifests are runtime-loaded, not baked into the
build, so `typst-fonts`'s `init_fonts()`/`load_fonts_dir()`/`load_fonts_prefix()` need real
manifest data to resolve against: the widget loads `/generator_assets/fonts/manifest.json` in
dev (served by its own vite server — see `widget/vite_plugin_assets.ts`, which also sets the
CORS headers consumer apps like paper_bible need to fetch these cross-origin in dev) and
`https://assets.paper.bible/fonts` in production (see `widget/src/fonts.ts`), while
`generator-node` reads `assets/fonts/` directly — run `.bin/download_fonts` before `.bin/test`.

The typst.ts WASM binaries (compiler ~28MB + renderer ~1MB) are likewise NOT bundled or
committed — `.bin/add_typst_version` vendors a published npm version into
`assets/typst/<version>/` (gitignored) and `.bin/deploy_assets typst` uploads it to
`https://assets.paper.bible/typst/<version>/<file>.wasm` (immutable write-once version
directories matching the npm package versions; served under `/generator_assets/typst/` in dev
by the same vite plugin). `widget/src/generator_worker.ts` derives each URL from the installed
`@myriaddreamin/*` package's own version, so bumping those deps requires running
`.bin/add_typst_version` + `.bin/deploy_assets typst` for that version first (a stale bucket
404s at
generate time).

The rest of the top-level `assets/` tree IS committed: `docs/` (the Typst templates —
`typst/` is the WASM, see above), `backgrounds/`, `frames/` and `3d/` (photo-preview
background JPGs + originals — the `bookcover-3d-web` package ships only their metadata, see
`3d/src/photo.ts`). In dev the whole tree is
served under `/generator_assets/` by `widget/vite_plugin_assets.ts`; in production the widget
fetches it from `https://assets.paper.bible/` (deployed via `.bin/deploy_assets static`, see
`widget/src/assets.ts`), and
`generator-node` reads `assets/docs/` from disk directly (npm consumers point `assets_dir`
at their own copy — see generator-node/README.md).

For development:

```bash
cd widget && npm run dev  # starts vite dev server with HMR
```

Individual package builds: `.bin/build_generator`, `.bin/build_generator-node`,
`.bin/build_generator-web`, `.bin/build_3d`, `.bin/build_typst-utils`,
`.bin/build_typst-fonts`, `.bin/build_pm-to-typst`.

Type-check a package: `cd <package> && npx tsc --noEmit`

### Tests

The `typst/` helper packages have vitest suites (`cd typst/<pkg> && npx vitest run`). The
cover packages have no test suite: `.bin/test` generates PDF/SVG/PNG files in the project root
for manual visual inspection. It builds `generator` and `generator-node` first, then runs a
Node script that calls `generate()` with a sample schema (needs `assets/fonts/` populated —
see Build).

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
- `fonts.ts` — Cover-schema-specific font resolution layered on top of the generic `typst-fonts`
  package (manifest lookup, Noto fallback resolution, CJK/script detection all live there now —
  see below). `collect_all_fonts()` is the source of truth for which font families a schema
  needs: chosen fonts plus one Noto fallback per non-Latin script per field, matching each field
  font's serif/sans style (`style` in the manifest; custom fonts pass a sniffed `style` in their
  FontConfig), using the other style only when Noto lacks the preferred one. CJK text resolves
  per SENTENCE segment (`cjk_segments`, in `typst-fonts`): kana → JP, Hangul → KR, Han-only
  sentences classify by character evidence (simplified-only/traditional-only/shinjitai-only
  chars — han-hints data bundled inside `typst-fonts`, built from OpenCC tables + JP/KR font
  cmaps by that repo's maintainer-only `update-han-hints` script) with `cjk_variant` as
  the tiebreaker; a JP/KR default holds unless the sentence needs glyphs that region's font
  lacks. An explicit `cjk_variant` tiebreaks cover-wide; 'auto' resolves sentence → field →
  cover (`resolve_field_cjk_variant`). `build()` wraps the blurb's CJK
  segments in `#text(font:)` spans so one blurb can mix languages; other fields get one
  family per detected region in their chain. Every function in `fonts.ts` assumes `typst-fonts`
  has already been initialised by the calling platform wrapper (`generator-node`/`generator-web`)
  — `generator` itself does no I/O and never calls the loaders
- `patterns.ts` — 60+ SVG pattern definitions from heropatterns.com (large data file)
- `barcode.ts` — ISBN-13 barcode generation via bwip-js
- `frame.ts` — Composites background images into decorative frames (painted, torn edges)
- `icon_cache.ts` — Fetches and caches Iconify SVGs with size/color stripping

### Typst templates (`assets/docs/`)

- `cover.typ` — Main template; receives all variables from `_data.typ` (generated at build
  time). Layers: background fills -> pattern -> image -> spine bg -> icons -> back content
  (blurb + barcode) -> spine text -> front content (title/subtitle/author in position boxes)
- `_helpers.typ` — `fit-to-width` and `shrink-to-width` scaling helpers used by cover.typ

### Font logic (`typst/typst-fonts/` workspace)

Generic, cover-app-agnostic font manifest/fallback logic, maintained here as a workspace and
published to npm. Nothing in it knows about `CoverSchema`/`FontConfig`. The API surface the
cover packages use:

- Main export — Noto per-script fallback + CJK/script detection (`detect_scripts`,
  `resolve_fallback_chain`, `cjk_segments`, `cjk_family`, `detect_cjk_variant`, etc.; backed by
  data bundled in the package, so these work immediately on import with no setup call);
  curated-font lookups (`get_bundled_font`, `get_fonts`, `base_font`, `font_style` — this data
  is app-specific so it's runtime-loaded via `init_fonts()`, and every lookup throws until a
  loader has run); pure TTF/OTF sfnt parsing (`parse_font_family`, `parse_font_style`); and
  custom-font upload processing (`process_font_files` — zip extraction, weight filtering,
  family grouping, serif/sans sniffing — returning `CustomFont[]`).
- `typst-fonts/node` / `typst-fonts/web` — platform loaders (`load_fonts_dir`,
  `load_fonts_prefix`) that read an app's `manifest.json` and call `init_fonts()`, plus
  platform-specific helpers: `resolve_font_dirs`/`write_custom_fonts` on Node;
  `font_file_url`/`font_urls_for`/`fetch_font_bytes`/`fonts_to_blob_urls`/`revoke_blob_urls`/
  `register_preview_fonts`/`register_custom_font_preview` on web.
- `typst-fonts-download` CLI (+ `typst-fonts/download` API) — downloads a fonts tree for an
  app. This is what `.bin/download_fonts` runs (with `font_config.json`) to populate
  `assets/fonts/` (see Build above).

### Platform wrappers

**generator-node**: Writes files to a temp directory, spawns the `typst` CLI binary, reads
output back. Uses `sharp` for PNG cropping in split mode. Lazily calls `typst-fonts/node`'s
`load_fonts_dir()` once per process (memoised) before the first `generate()` resolves any font.

**generator-web**: Manages a `TypstCompiler` + optional `TypstRenderer` (WASM). Files are
loaded into a virtual shadow filesystem. `init()` calls `typst-fonts/web`'s `load_fonts_prefix()`
before anything else touches fonts. The compiler is reinitialised when the set of
required fonts changes (tracked by `active_fonts` cache key). Renderer is init'd once.

### Widget (`widget/src/`)

- `form_state.ts` — Reactive form state (`FormState` interface), injected via Vue provide/inject
- `schema.ts` — Converts `FormState` into the generator schema format
- `App.vue` — Root layout; starts the generator Web Worker (and loads the font manifest on
  the main thread for the pickers), manages generate-on-change loop with debouncing and
  deferred generation while modals are open
- `generator_worker.ts` / `generator_client.ts` — Web Worker owning the WASM compiler (all
  generation runs off the main thread) + the main-thread client that relays calls via
  id-tagged request/response messages (same pattern as paper_bible's `typst_worker.ts`).
  The worker keeps a snapshot of uploaded font bytes (`set_custom_fonts` action, re-sent on
  upload) so `generate` options don't carry fonts and byte identity stays stable worker-side
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

The cover schema is flat — print options are top-level fields:

```js
service_id: 'kdp', binding_type: 'paperback', ink_type: 'bw', paper_type: 'white',
size_id: 'us_trade', page_count: 300,
// or custom size:
custom_trim_width: 152, custom_trim_height: 229, custom_unit: 'mm', page_count: 300,
```

## Key patterns

- **Font loading (web)**: the compiler is created lazily on the first `generate()` (never in
  `init()`, which only warms the base-font byte cache). Font bytes are fetched once per session
  into an in-memory cache keyed by URL and handed to typst.ts `loadFonts()` as blob URLs
  (bundled and custom alike); blob URLs are revoked on reinit to prevent leaks. Custom fonts
  are keyed by `Uint8Array` object identity (WeakMap ids), so callers must pass stable
  references across generates (structured clone breaks identity, hence the worker's
  `set_custom_fonts` snapshot in the widget).
- **Split output**: SVG splits adjust the viewBox; PDF splits inject CropBox arrays into the
  raw PDF bytes; PNG splits use a crop callback (`sharp` on Node, Canvas API on web).
- **Debounced inputs**: Color pickers debounce at 800ms (`ColorPicker.vue`) or 2000ms
  (`BackgroundSection.vue` bg_color, `ColorSwatch.vue`). The main generate loop in `App.vue`
  has its own debounce on top.
- **Modal tracking**: `modal_state.ts` tracks open modals; `App.vue` defers regeneration
  while any modal is open to avoid layout thrashing.
- **Custom fonts**: Uploaded .ttf/.otf/.zip files are processed by `typst-fonts`'s
  `process_font_files()` (zip extraction, weight filtering, family grouping, serif/sans
  sniffing), stored in `fonts.ts`'s reactive `CustomFont[]` store, registered for preview via
  `register_custom_font_preview()`, and snapshot-sent as raw `Uint8Array` bytes to the
  generator worker (`set_custom_fonts`) for Typst compilation.
- **Vue Pug + TS**: Volar can't trace Pug template bindings, so components/refs used only
  in templates get `@ts-ignore TS6133` comments. `SidebarPanel.vue` uses `defineOptions({components})`
  to register its children explicitly.
- **UI icons (widget)**: All app-chrome icons are Material Symbols, bundled locally at build
  time — no iconify API requests at runtime (unlike cover *background* icons, which the
  generator fetches from iconify). Handled by the `@nuxt/ui` vite plugin's
  `icon.clientBundle` option: `scan: true` picks up icons named in components automatically
  (from `@iconify-json/material-symbols`), and `widget/ui_icons.ts` holds Material
  replacements for Nuxt UI's default lucide icons, applied via `ui.icons` AND listed in
  `clientBundle.icons` (auto-inclusion only trusts the default lucide collection). Keep
  everything material-symbols so only one collection is needed. NOTE: `clientBundle` on the
  Vue side needs `@nuxt/ui` > 4.9.0 — widget pins a pkg.pr.new commit build until the next
  release; swap back to a semver range when it ships.

## .bin/ scripts

| Script | Purpose |
|--------|---------|
| `build_generator` | `tsc` in generator/ |
| `build_generator-node` | `tsc` in generator-node/ |
| `build_generator-web` | `tsc` in generator-web/ |
| `build_3d` | `tsc` in 3d/ |
| `build_typst-utils` / `build_typst-fonts` / `build_pm-to-typst` | `tsc` in typst/<pkg>/ |
| `build_modules` | All package builds above in dependency order |
| `build_widget` | `vite build` in widget/ |
| `build_web` | typst helpers + generator + generator-web + 3d (no node) |
| `build_site` | build_modules + build_widget |
| `build_deploy` | npm ci all + full build (for CI/Netlify) |
| `publish_modules` | Version-bump + build + npm publish the four cover packages |
| `serve_widget` | `vite` dev server in widget/ |
| `serve_site` | `vite` dev server in site/ |
| `test` | Generate test covers (PDF/SVG/PNG) for visual inspection |
| `setup_typst` | Download latest typst binary to .bin/ |
| `download_fonts` | Populate assets/fonts/ from font_config.json (typst-fonts-download) |
| `add_typst_version` | Vendor a typst.ts npm version's wasm into assets/typst/<version>/ |
| `deploy_assets` | Sync assets/ to the public bucket (gcloud); sections: static/fonts/typst |
| `gen_bg_thumbnails` | Generate 160x120 thumbnails for background images via sharp |

## Gotchas

- **Widget CSS**: `styles.sss` (SugarSS) for global styles; `tailwind.css` must stay vanilla
  CSS because Tailwind's plugin system breaks inside preprocessors.
- **Typst binary**: `generator-node` requires `typst` on PATH. Run `.bin/setup_typst` to install.
- **WASM lifecycle**: `generator-web` creates a `CoverGenerator` instance via `init()` — in
  the widget this all happens inside `generator_worker.ts`, never on the main thread.
  The compiler is reinitialised per-generate when fonts change; the renderer is not
  (glyph outlines are embedded in compiled vector data).
- **Pug comments**: Use `//-` not `//` in `<template lang="pug">` blocks.
- **npm v9 bug**: `widget/` fails `npm install` on npm 9.x due to nested `file:` dep
  resolution; use `npx npm@latest install` as a workaround.
- **Assets dir naming**: in the top-level `assets/` tree, the Typst *templates* live under
  `docs/` — `typst/` holds the vendored typst.ts WASM binaries (see Build). The generator
  core's `DOCS_DIR` constant reflects this.
- **No semicolons**: All TypeScript uses no semicolons, snake_case for variables/functions.
- **Patterns file**: `generator/src/patterns.ts` is ~810 lines / 167K tokens — almost
  entirely inline SVG data strings. Don't try to read the whole file.
