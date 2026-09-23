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
| `site/` | Vue 3 public site — a header and an iframe of the widget, nothing more yet |
| `3d/` | WebGL 3D book renderer — custom shaders, no external graphics libs |
| `typst/typst-utils/` | Zero-dep Typst string escaping (`escape_typst_str`, `escape_typst`) |
| `typst/typst-fonts/` | Generic font manifest/fallback/sfnt logic for any Typst app |
| `typst/pm-to-typst/` | Pure ProseMirror/Tiptap doc JSON → Typst renderer |

Dependency graph: `generator` < `generator-node`, `generator-web` < `widget`; `3d` < `widget`.
`generator` and `3d` have no local deps on each other. `site` depends on nothing here — it
reaches the widget over HTTP, in an iframe, exactly as any other host would.

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
through the renderer's `text` extension point in `widget/src/schema.ts`), while the sidebar's
HTML preview uses Tiptap's own `generateHTML`. Importing Tiptap costs ~370KB, so nothing on the
critical path may import it directly: `blurb_html.ts` wraps `generateHTML` behind a dynamic
import (and `BlurbEditorModal` is a `defineAsyncComponent`), so the editor stack loads only once
a blurb has text or the modal opens. Plain-text flattening runs far too early for that, so
`blurb_text.ts` reimplements `generateText` with no dependencies — `tests/blurb_text.test.ts`
pins it against the real one. The Typst renderer is a per-node/
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
.bin/build_site          # vite build (site/dist/) — independent of the modules
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
`generator-node` reads `assets/fonts/` directly — run `.bin/download_fonts` before
`.bin/test_examples` (and before `.bin/test`, whose render suite skips itself without it).

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

The rest of the top-level `assets/` tree IS committed: `backgrounds/`, `frames/` and `3d/`
(photo-preview background JPGs + originals — the `bookcover-3d-web` package ships only their
metadata, see `3d/src/photo.ts`). `.bin/gen_bg_thumbnails` derives three sets from
`backgrounds/*.jpg`, each directory named for its size (a new size needs a new directory name,
since `backgrounds/` is cached immutable): `thumbnails/` (160x120, the widget's picker tiles),
`previews_2700/` (what previews render from instead of the original — ~380KB against a 2.8MB
average; published as `BG_PREVIEW_DIR`, with the sizing reasoning in the script's header) and
`previews_800/`, which nothing in this repo reads — paper.bible uses them as large thumbnails
when the user chooses a cover design, so don't remove or resize them without checking with it.
In dev the whole tree is served under `/generator_assets/` by `widget/vite_plugin_assets.ts`;
in production the widget
fetches it from `https://assets.paper.bible/` (deployed via `.bin/deploy_assets static`, see
`widget/src/assets.ts`).

`assets/backgrounds/originals/` keeps the untouched source of any background whose
`backgrounds/` copy isn't the original (edited or re-encoded). The re-encodes were only the
outliers: at print-master settings (q95,
4:4:4, mozjpeg, ICC kept) `rocket.jpg` and `bird.jpg` shrank ~55%, while every other file came
out the same size or larger, since they're already near that quality or 4:2:0.

`generator/vector_bg_images/*.svg` (committed) are the editable source for the built-in vector
background designs in `generator/src/vector_backgrounds.ts` — open one directly in an SVG editor
(Inkscape, Illustrator, Figma) and edit freely; each uses `#6e79ac`/`#be89b3`/`#76538e` as
placeholder colors for the c1/c2/c3 slots, swapped for a real generated palette by
`recolor_svg()` at generate time (a plain case-insensitive text substitution, so it survives an
editor moving a color into a `<style>`/class instead of an inline attribute). These live outside
the top-level `assets/` tree — that tree is reserved for statically-served runtime assets (see
above) — and, like the fonts/typst-wasm assets, are baked into the build rather than
runtime-loaded: `.bin/gen_vector_bg_images` bundles them into the gitignored
`generator/src/generated/vector_bg_images_data.ts` (a `Record<id, string>` of raw SVG text) before `tsc`
runs — `.bin/build_generator` always runs it first, so no manual step is needed, but a design
edit needs a rebuild (`.bin/build_generator` or `.bin/build_modules`) before it shows up.

`generator/typst/cover.typ` and `_helpers.typ` (the Typst templates) follow the same baked-in
pattern for the same reason: they're tied to a specific compiled template version, so a shared
external assets dir/bucket can't correctly serve multiple installed `bookcover-core` versions
at once. `.bin/gen_typst_templates` inlines them into the gitignored
`generator/src/generated/templates_data.ts` (a `Templates` object of raw `.typ` text) before `tsc` runs,
and `build()` defaults to it, so `generator-node`/`generator-web` never touch the filesystem or
network for templates. Edit the source `.typ` files, then rebuild (`.bin/build_generator` or
`.bin/build_modules`) to see changes.

For development:

```bash
cd widget && npm run dev  # starts vite dev server with HMR (port 5301)
cd site && npm run dev    # the site, on 5302 so both can run at once
```

The site's iframe points at `http://localhost:5301` in dev and `cover-widget.paper.bible` in
production, so running the site alone shows an empty frame until the widget's server is up.
`VITE_WIDGET_URL` overrides both (see `site/src/widget_url.ts`).

Individual package builds: `.bin/build_generator`, `.bin/build_generator-node`,
`.bin/build_generator-web`, `.bin/build_3d`, `.bin/build_typst-utils`,
`.bin/build_typst-fonts`, `.bin/build_pm-to-typst`.

Type-check a package: `cd <package> && npx tsc --noEmit`

### Tests

Every package has a vitest suite, in `<pkg>/tests/`. `.bin/test` runs them all in dependency
order; a single package is `cd <pkg> && npx vitest run` (each has a `test` script too). The
suites are pure and need no build, network, or assets — except `generator-node`'s, which
renders with the real `typst` binary and fonts tree and skips itself when either is missing.

- `generator/tests/build.test.ts` holds GOLDEN SNAPSHOTS of the generated `_data.typ`
  (`tests/__snapshots__/`, committed). They are the regression net for render determinism: a
  diff there means rendered output changed. If the change is deliberate, update the snapshot
  and bump `RENDER_VERSION` in the same commit (see Stored records below).
- `generator/tests/invariants.test.ts` is property-based (fast-check): a random valid form
  always builds a valid schema, dimensions always compose, auto colors are always readable.
- `generator/tests/helpers.ts` loads a stand-in font manifest via `init_fonts()` — anything
  touching `fonts.ts` or `build()` needs it, since `typst-fonts` throws until a loader runs
  and `generator` itself never loads one.
- Note for anyone adding a suite to `widget/`: it has its own `vitest.config.ts` so the tests
  don't load the app's Nuxt UI/assets plugins, and it uses the `node` environment — the tests
  cover the plain TS modules, not the Vue components.

`.bin/test_examples` is the separate manual check: it builds `generator` and `generator-node`,
then generates PDF/SVG/PNG files in the project root from a sample schema for visual
inspection (needs `assets/fonts/` populated — see Build). It asserts nothing.

## Deployment

Everything is hosted on AWS in `us-west-2`: the site at `cover.paper.bible`, the widget UI it
embeds at `cover-widget.paper.bible`, and the public assets tree at `assets.paper.bible` —
each an S3 bucket behind its own CloudFront distribution. All three buckets are private and
reachable only through CloudFront via Origin Access Control. Google is used for Firebase
alone, which this repo no longer touches. Cross-origin consumers (paper.bible et al) depend
on the CORS and `Cross-Origin-Resource-Policy` headers, which are attached by CloudFront's
response-headers policy because S3 can't set them itself.

The site and the widget are separate origins deliberately. The widget is embedded
cross-origin by other apps regardless, so it has to work that way; giving the site its own
origin means the site can't quietly acquire a same-origin dependency that those other hosts
wouldn't have. Nothing sets `X-Frame-Options` or a `frame-ancestors` policy on the widget
distribution for the same reason.

Provisioning and content deployment are deliberately separate, because they change at wildly
different rates and the content needs per-file metadata that IaC models badly:

- **Infrastructure** — `infra/cloudformation.yml`, applied by `.bin/deploy_aws`. Buckets,
  distributions, cache behaviours, the response-headers policy and the GitHub OIDC deploy
  role. Changes a couple of times a year. `deploy_aws` also handles the certificate — the one
  thing that can't be in `us-west-2`, because CloudFront reads certificates from `us-east-1`
  alone — so the first run requests it there and prints the DNS validation records, and a
  second run (once ACM says ISSUED) builds the stack. One certificate covers all three
  hostnames, because ACM can't amend a domain list after issuance — adding a hostname later
  means a new certificate and swapping the ARN under every distribution.
- **Content** — `.bin/deploy_site`, `.bin/deploy_widget` and `.bin/deploy_assets`, which read
  bucket names and distribution IDs out of the stack's outputs rather than hardcoding them.

CI authenticates by GitHub OIDC assuming the stack's deploy role, so there are no long-lived
AWS keys in repository secrets. The role ARN goes in the `AWS_DEPLOY_ROLE` repository variable.

What deploys when follows straight from what's in git:

- `.github/workflows/deploy.yml` runs on push to main and deploys the widget, the site and
  `deploy_assets static` — the committed part of the tree. This is what keeps a newly added
  background from shipping in the widget before it exists in the bucket. The widget goes
  first so the site never points its iframe at a build that isn't live.
- `.github/workflows/deploy_assets.yml` is `workflow_dispatch` only, for the `fonts` and
  `typst` sections. CI has no copy of those trees (both gitignored), so it rebuilds them —
  `download_fonts` or `add_typst_version` — before uploading. They change rarely and are
  large, so they're a deliberate trigger rather than part of the push path.

`.bin/check_typst_published` runs before every deploy. The typst.ts version is named in three
places held together by nothing but a comment — the exact pin in `generator-web/package.json`,
`TYPST_VERSION` in `widget/src/generator_worker.ts`, and a directory in the bucket — and
drift 404s at generate time for real users, so it's a build failure instead.

Cache lifetimes are set at upload and honoured end to end (the distributions use the managed
CachingOptimized policy, which follows origin `Cache-Control` rather than applying a heuristic
of its own): immutable for `backgrounds/`/`frames/`/`3d/` and the typst version dirs, one day
for fonts (their filenames carry no version, so bytes can change under a name — content-
addressing them is the clean fix), 300s for `fonts/manifest.json`, and `no-cache` on the
site's and widget's `index.html` with immutable on the hashed bundles beside them. Neither
`deploy_widget` nor `deploy_site` passes `--delete`: both apps lazy-load chunks, so removing
the previous build's files would break anyone mid-session.

The typst WASM is stored brotli-compressed and served that way to every client with no content
negotiation — 27MB raw, 10.4MB gzip, 6.9MB brotli, and it's the biggest download in a
consumer's cover path. CloudFront's automatic compression tops out around 10MB so it can't
help here, and the AWS CLI can't compress, so `deploy_assets` pre-compresses with Node's
built-in zlib. Fonts are left alone: already-compressed sfnt only reaches 75% under brotli.
This is documented in `generator-web/README.md` because that file publishes these URLs for
third parties, and a non-browser client has to decode `br` (`curl` needs `--compressed`).

## Architecture

### Generator core (`generator/src/`)

- `schema.ts` — Zod schema for cover input; validates and parses all user options
- `defaults.ts` — `SCHEMA_VERSION`/`RENDER_VERSION` plus the single source of truth for every
  fixed default (`SCHEMA_DEFAULTS`, `FORM_DEFAULTS`) — see Stored records below
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
- `patterns.ts` — pattern METADATA only (id, name, tile_mm, aspect_ratio) for 87 patterns from
  heropatterns.com. Small on purpose: `build_schema()` needs a pattern's `tile_mm`, so this
  module is reachable from the widget's main thread and must not carry the SVG payload
- `patterns_svg.ts` — the SVG strings themselves (~220KB), keyed by pattern id (large data
  file). Only `build()` and the widget's pattern picker reach it, and both do so in isolation:
  the barrel deliberately does NOT re-export it, and consumers import the
  `bookcover-core/patterns-svg` (or `bookcover-web/patterns-svg`) subpath instead. Adding a
  pattern means an entry in both files — the `PatternId` union makes a mismatch a type error,
  and `generator/tests/patterns.test.ts` checks the baked `aspect_ratio` still matches its SVG
- `barcode.ts` — ISBN-13 barcode generation via bwip-js. Imports the `isbn` encoder from
  `bwip-js/generic` and calls it directly — do NOT "simplify" this back to `toSVG({bcid})`.
  That dispatches through a lookup table referencing all ~110 symbologies, so none of them can
  be tree-shaken and the bundle grows by ~780KB for one barcode. `tests/barcode.test.ts` pins
  the rendered SVG so the swap can't silently change output
- `frame.ts` — Composites background images into decorative frames (painted, torn edges)
- `preset_icons.ts` — curated icon-id METADATA only (categories of Iconify ids, e.g.
  `game-icons:dead-wood`), same METADATA/payload split as patterns above and for the same
  reason: the widget's picker needs the id list on the main thread without the SVG payload
- `preset_icons_svg.ts` — the SVG strings for every id in `preset_icons.ts`, baked in from
  `generator/preset_icon_svgs/<collection>/<name>.svg` (committed source, one file per icon) by
  `.bin/gen_preset_icons` at build time. The source files themselves come from the Iconify API
  via the MAINTAINER-ONLY `.bin/fetch_preset_icons` (run after editing `preset_icons.ts`, then
  commit the new `.svg` files and rerun `gen_preset_icons`/`build_generator`) — this is what
  keeps `icon_cache.ts` and the widget's icon picker from ever hitting `api.iconify.design` for
  a curated icon. Not re-exported from the main barrel; reach it via the
  `bookcover-core/preset-icons-svg` (or `bookcover-web/preset-icons-svg`) subpath.
  `generator/tests/preset_icons.test.ts` checks the two files agree
- `icon_cache.ts` — Resolves an icon id to SVG with size/color stripping: `builtin:<id>` from
  `builtin_icons.ts`, a curated id from `preset_icons_svg.ts`, and anything else (a custom
  Iconify id a user typed) from a live `api.iconify.design` fetch — the ONLY runtime path in
  this app that still calls that API

### Typst templates (`generator/typst/`, baked in via `generator/src/generated/templates_data.ts`)

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

## Stored records and render determinism

`EmbedFormState` (`generator/src/form_state.ts`) is the ONLY thing that outlives a session —
it's what embed hosts persist. Nothing else here is a record: a `CoverSchema` is a transient
render input and must never be stored (its `blurb` is already-rendered Typst markup, so a stored
schema is version-locked and not re-editable). Two invariants hold it together:

- **No binaries.** The background image and custom font bytes are never in the record. They
  travel as separate structured-clone fields on the embed messages, and the host owns their
  storage and identity. A background is an ID or bytes, never both: a built-in travels as its
  published `backgrounds/` filename in `bg_image_builtin` with `bg_image: null` (the widget holds
  it the same way, as `FormState.bg_image_builtin`, and never downloads the original except for
  its own PDF export), while an upload travels as `bg_image` bytes, returned byte-for-byte. Hosts
  must check a `bg_image_builtin` against their own allowlist before trusting it.
- **Absence means nothing.** Every field in the record is always present and explicitly valued.
  Where a value is meant to be derived at render time it says so with a sentinel (`'auto'`,
  `null`, `''`), never by omitting a key. So `build_schema()` knows nothing about defaults and
  never omits a field for matching one — it emits ~60 fields explicitly, and leaves a field out
  ONLY to request a derivation that can't be a constant (auto-contrast colors, blurb background,
  spine text from the titles, an icon color sampled from the image). A record plus a
  `RENDER_VERSION` therefore determines the output; changing a default can't shift a stored cover.

`SCHEMA_VERSION` versions the record's shape. `RENDER_VERSION` is separate and versions render
*behaviour* — bump it for any change to the Typst templates, `SCHEMA_DEFAULTS`, the derivations
in `design.ts`/`font_sizes.ts`, font fallback resolution, or the bundled pattern/vector/icon
data, and bump core/-node/-web together when you do. Hosts record it at freeze time so a
re-render years later is detectably different rather than silently different.

For the same reason both typst compilers are pinned exactly — the CLI in `.bin/setup_typst`
(which asserts the version it got) and `@myriaddreamin/*` in `generator-web/package.json`. They
render the same cover on two paths; letting either float meant identical git state could produce
different output. The two pins must stay MATCHED: typst.ts vendors typst as a Rust dependency, so
the mapping is in typst.ts's `Cargo.toml` at its release tag (`workspace.dependencies` → `typst`)
— v0.7.0 → typst 0.14.2 (current), v0.8.1 → typst 0.15.1. Bump both together and bump
`RENDER_VERSION`.

Asset IDs (`pattern_id`, `bg_vector_id`, `icon_id`, `backgrounds/` filenames) and the
`blurb_extensions` node/mark list are API surface: a stored record names them, so renaming or
pruning one breaks covers that can no longer be reproduced (the `black_`/`white_` background
prefix drop in 0.9.0 already did this once). Unknown IDs now warn via `warn_unknown()` instead of
vanishing silently. Finalize and prune all of these before 1.0, then treat them as append-only.

0.19.0 (published 2026-09-23) made built-in backgrounds identified by ID, not bytes — a breaking
change for embed hosts. The embed protocol sends a built-in as `bg_image_builtin` with
`bg_image: null` (in `InitMessage` too; there, an ID sent beside bytes wins), and `FormState`
gained `bg_image_builtin`. `get_builtin_bg_regions(filename)` looks up by filename alone and
`get_builtin_bg()` adds the original's pixel size. Built-ins are never recognised from bytes:
`analyze_image_regions()` always decodes (the Node one takes no `filename`), so a host that
passes a built-in's bytes without its ID gets a live decode, with slightly different auto colours
than the baked ones. `generate()` takes `image_builtin` (baked colors for whichever copy of a
built-in is passed) and, on web, `image_max_dpi` (shrinks the image for fast previews, sampling
colors from the original). The `backgrounds/previews/` directory became `previews_800/`, beside
the new `previews_2700/`, and `rocket.jpg`/`bird.jpg` were re-encoded in place (same pixels to
the eye, ~55% smaller). No stored record changed. paper.bible is the known consumer: it must send
IDs to keep baked colours, and must move off `previews/` before the next `deploy_assets static`
removes it from the bucket.

For backgrounds specifically, **the filename is the ID** — hosts path-join it to fetch bytes and
slice its extension off for the MIME type, with no lookup table anywhere. The ID names the
picture, not the bytes: a visually identical re-encode at the same pixel size and format may
replace a file in place (original kept in `assets/backgrounds/originals/`, then rerun
`.bin/gen_bg_regions` — the baked regions are a rough colour read, so the re-bake is noise and
needs no `RENDER_VERSION` bump). A format change or anything visibly different is a new ID, and
`bg_image_builtin` must keep carrying a filename.

Retiring a background is a UI-only change local to this app: move its name from `BACKGROUNDS` to
`RETIRED_BACKGROUNDS` in `widget/src/services/backgrounds.ts` and it leaves the picker while
staying fully valid. Its file must stay in `assets/backgrounds/` — deleting it drops its entry
from the baked `builtin_bg_regions.ts` table, so covers naming it fall back to a live pixel
decode. `.bin/gen_bg_regions` cross-checks the directory against both lists and fails on a name
with no file. Retiring needs no coordination with anyone — consumer apps fetch backgrounds from
the assets bucket by name and never read our picker list, so a retired background keeps working
for them (some name our files directly as their own cover defaults). What no background survives
is being DELETED, which breaks every stored cover naming it and 404s for any app referencing it.
Full contract in that file's header.

## Key patterns

- **Keeping the widget's initial bundle lean**: the main thread imports the `bookcover-web`
  barrel for small things (`build_schema`, `resolve_dimensions`, `generate_palette`), so
  anything reachable from that barrel lands in the blocking chunk unless it can be tree-shaken.
  Two things make that work and are easy to undo by accident: every package here declares
  `"sideEffects": false` (without it, worker-only code like `build()`/`CoverGenerator` and its
  `bwip-js` dependency can't be dropped), and large payloads live off the barrel behind their
  own subpath export (see `patterns_svg.ts`). The generator worker, the pattern SVGs and the
  Tiptap editor stack are all separate chunks — check `npx vite build`'s chunk list before and
  after if you touch a barrel import, a dynamic `import()`, or a package's `exports`/
  `sideEffects`. `widget/vite.config.ts` also sets `resolve.dedupe` because
  `@tiptap/starter-kit` nests its own `@tiptap/core`, which otherwise ships twice.
- **Font loading (web)**: the compiler is created lazily on the first `generate()` (never in
  `init()`, which only warms the base-font byte cache). Font bytes are fetched once per session
  into an in-memory cache keyed by URL and handed to typst.ts `loadFonts()` as blob URLs
  (bundled and custom alike); blob URLs are revoked on reinit to prevent leaks. Custom fonts
  are keyed by `Uint8Array` object identity (WeakMap ids), so callers must pass stable
  references across generates (structured clone breaks identity, hence the worker's
  `set_custom_fonts` snapshot in the widget).
- **Background images (widget)**: a built-in background is held by ID alone
  (`form.bg_image_builtin`), so picking one downloads nothing up front. Previews render from its
  `previews_2700/` copy (`fetch_bg_preview`, a small LRU; tiles prefetch on hover) and exports from
  the original (`fetch_bg_original`) — both via `read_render_image` in `services/backgrounds.ts`.
  An upload is shrunk inside the worker by `generate()`'s `image_max_dpi`. Either way the colors
  never come from the smaller copy: `image_regions_cache.ts` takes a built-in's baked regions by
  name and samples an upload's original, and that is passed to `generate()` explicitly. A
  built-in missing from the baked table falls back to sampling its preview copy (with a console
  warning), and `widget/tests/backgrounds.test.ts` fails on one.
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

Every `build_*` package script clears its `dist/` before running `tsc` — tsc only ever writes
files, so a renamed or deleted source otherwise leaves its old output behind, and the published
package would carry that stale output to npm.

Every package's `files` is `["dist/", "!dist/**/*.map"]`. The maps are still built and still on
disk, so debugging and go-to-definition work normally inside this repo; they're just kept out of
the tarball, because `src/` isn't published and the maps carry no `sourcesContent` — shipped,
they resolve to files no consumer has. Set `inlineSources: true` if they ever need to work for
consumers, but note that embeds every source into the maps (bookcover-core: 213 kB packed ->
449 kB).

| Script | Purpose |
|--------|---------|
| `build_generator` | `gen_vector_bg_images` + `gen_icon_svgs` + `gen_preset_icons` + `gen_typst_templates` then `tsc` in generator/ |
| `build_generator-node` | `tsc` in generator-node/ |
| `build_generator-web` | `tsc` in generator-web/ |
| `build_3d` | `tsc` in 3d/ |
| `build_typst-utils` / `build_typst-fonts` / `build_pm-to-typst` | `tsc` in typst/<pkg>/ |
| `build_modules` | All package builds above in dependency order |
| `build_widget` | `vite build` in widget/ |
| `build_web` | typst helpers + generator + generator-web + 3d (no node) |
| `build_site` | `vite build` in site/ |
| `build_deploy` | npm ci all + full build incl. widget and site (for CI) |
| `publish_modules` | Version-bump + build + npm publish the four cover packages |
| `serve_widget` | `vite` dev server in widget/ |
| `serve_site` | `vite` dev server in site/ |
| `test` | Run every package's vitest suite in dependency order |
| `test_examples` | Generate test covers (PDF/SVG/PNG) for visual inspection |
| `setup_typst` | Download latest typst binary to .bin/ |
| `download_fonts` | Populate assets/fonts/ from font_config.json (typst-fonts-download) |
| `add_typst_version` | Vendor a typst.ts npm version's wasm into assets/typst/<version>/ |
| `deploy_aws` | Provision/update the CloudFormation stack in infra/ (buckets, CDN, CI role) |
| `deploy_widget` | Build (via build_web + build_widget), then upload widget/dist/ to the UI bucket + invalidate the entry point |
| `deploy_site` | Build (via build_site), then upload site/dist/ to the site bucket + invalidate the entry point |
| `deploy_assets` | Sync assets/ to the public bucket; sections: static/fonts/typst |
| `check_typst_published` | Assert the wasm version the widget requests exists in the bucket |
| `gen_bg_thumbnails` | Generate 160x120 thumbnails for background images via sharp |
| `gen_vector_bg_images` | Bundle generator/vector_bg_images/*.svg into generator/src/generated/vector_bg_images_data.ts |
| `gen_typst_templates` | Bundle generator/typst/*.typ into generator/src/generated/templates_data.ts |
| `fetch_preset_icons` | MAINTAINER-ONLY. Downloads preset_icons.ts's icon ids from Iconify into generator/preset_icon_svgs/ |
| `gen_preset_icons` | Bundle generator/preset_icon_svgs/**/*.svg into generator/src/generated/preset_icons_svg_data.ts |

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
- **`typst` naming collision**: four unrelated things share the name — the top-level `typst/`
  directory holds the `typst-utils`/`typst-fonts`/`pm-to-typst` npm workspaces, `assets/typst/`
  holds the vendored typst.ts WASM binaries (runtime-loaded, see Build), `generator/typst/`
  holds the Typst *templates* (`cover.typ`, `_helpers.typ` — codegen source, baked into the
  build, NOT under `assets/`, see Build), and the `typst` CLI binary itself (`.bin/setup_typst`).
- **No semicolons**: All TypeScript uses no semicolons, snake_case for variables/functions.
- **Patterns file**: `generator/src/patterns_svg.ts` is ~160K tokens — almost entirely inline
  SVG data strings. Don't try to read the whole file. Its sibling `patterns.ts` holds only the
  metadata and is safe to read in full.
