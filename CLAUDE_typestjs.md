
---
name: typst_ts_documentation
description: Comprehensive notes on typst.ts library — architecture, APIs, packages, rendering modes, and usage patterns for compiling/rendering Typst documents in JS/browser/Node.js
type: reference
---

# typst.ts Documentation Notes

Source: https://github.com/Myriad-Dreamin/typst.ts/tree/main/docs

## What is typst.ts

typst.ts brings the Typst document compiler/renderer to JavaScript environments (browser
and Node.js). It provides a `typst::World` implementation and several exporters. The
compilation functionality comes from the official typst project; typst.ts wraps it in
Wasm modules and provides JS-friendly APIs.

## Architecture: Three Rendering Forms

1. **Server-side SVG** (Form1): Compile on server, export SVG, embed in HTML statically.
2. **Vector Format** (Form2): Preprocess on server to a custom "Vector Format" artifact,
   render on client. Supports responsive layout, incremental rendering, theme switching.
3. **Serverless** (Form3): Compile entirely in browser via Wasm compiler + renderer.

## Core Packages (npm)

| Package | Purpose |
|---------|---------|
| `@myriaddreamin/typst.ts` | Core JS wrapper library (compiler + renderer APIs) |
| `@myriaddreamin/typst-ts-renderer` | Wasm renderer module (~350 KB gzipped) |
| `@myriaddreamin/typst-ts-web-compiler` | Wasm compiler module (~7.6 MB + ~4.4 MB fonts) |
| `@myriaddreamin/typst-ts-node-compiler` | Node.js native (napi) compiler+renderer |
| `@myriaddreamin/typst-all-in-one.ts` | All-in-one bundle (compiler+renderer+fonts) |
| `@myriaddreamin/typst.react` | React component wrapper |
| `@myriaddreamin/typst.angular` | Angular module wrapper |
| `@myriaddreamin/typst.vue3` | Vue 3 component wrapper |
| `@myriaddreamin/typst.solid` | Solid.js component wrapper |
| `@myriaddreamin/rehype-typst` | Rehype plugin for typst math in Markdown |

Rust crates:
- `reflexo-typst` — Rust compiler library (features: "system" for native, "browser" for Wasm)
- `typst-ts-cli` — CLI precompiler tool

## Simplified API ($typst snippet)

```ts
import {$typst} from '@myriaddreamin/typst.ts'

// Compile + render to SVG string
await $typst.svg({mainContent: 'Hello, typst!'})

// Compile + render to PDF (Node.js only via node-compiler)
await $typst.pdf({mainContent: 'Hello, typst!'})

// Compile to vector format (intermediate)
const vectorData = await $typst.vector({mainContent})

// Render vector data to SVG (no recompilation)
await $typst.svg({vectorData})

// Render to canvas
await $typst.canvas(divElement, {vectorData})
```

### Under the hood, $typst.svg() does:
1. `createTypstCompiler()` + `init()`
2. `createTypstRenderer()` + `init()`
3. `addSource('/tmp/random.typ', mainContent)`
4. `compiler.compile(options)` → vectorData
5. `renderer.runWithSession(session => { manipulateData({session, action:'reset', data:vectorData}); renderSvg({session}) })`

### Configuring Wasm module paths (required in browser, auto in Node.js):
```ts
$typst.setCompilerInitOptions({
    getModule: () => '/path/to/typst_ts_web_compiler_bg.wasm'
})
$typst.setRendererInitOptions({
    getModule: () => '/path/to/typst_ts_renderer_bg.wasm'
})
```

### CDN bundles:
- `all-in-one.bundle.js` — everything bundled (offline capable, large)
- `all-in-one-lite.bundle.js` — fonts/wasm excluded (loads from CDN)

## Node.js Library (NodeCompiler)

Faster (native code), simpler API, uses system/embedded fonts.

```ts
import {NodeCompiler} from '@myriaddreamin/typst-ts-node-compiler'

const $typst = NodeCompiler.create({
    workspace: '/path/to/workspace',
    fontArgs: [{fontPaths: ['assets/fonts']}],
    inputs: {'theme': 'dark'}
})

// Compile + export
await $typst.svg({mainFileContent: 'Hello, typst!'})
await $typst.pdf({mainFileContent: '...'})
await $typst.html({mainFileContent: '...'})  // experimental HTML export
await $typst.plainSvg({mainFileContent: '...'})  // SVG for viewers
await $typst.vector({mainFileContent: '...'})

// Compile once, export multiple
const doc = $typst.compile({mainFileContent: '...'})
$typst.vector(doc)
$typst.pdf(doc)
$typst.svg(doc)

// Query document
$typst.query({mainFileContent}, {selector: '<some-label>'})

// Shadow files (in-memory virtual files)
$typst.mapShadow('/assets/tiger.png', pngBuffer)
await $typst.addSource('/template.typ', templateContent)
$typst.unmapShadow('/assets/data.json')
$typst.resetShadow()

// IMPORTANT: evict cache to avoid memory leak
$typst.evictCache(10)  // suggested max_age: 10 for one-shot, 30 for watch mode

// sys.inputs passed at compile time override creation-time inputs (full replace, not merge)
```

### Font precedence in NodeCompiler:
fontArgs[0] > fontArgs[1] > ... > system fonts > embedded fonts

### tryHtml (experimental):
```ts
const output = $typst.tryHtml({mainFileContent})
output.hasError() → printDiagnostics()
output.result.title() / .html() / .body() / .bodyBytes()
```

## Web Compiler (Low-level)

```ts
import {createTypstCompiler} from '@myriaddreamin/typst.ts'

const cc = createTypstCompiler()
await cc.init({getModule: () => '/path/to/wasm'})
cc.addSource('/main.typ', 'Hello, typst!')
const vectorData = await cc.compile({mainFilePath: '/main.typ'})

// Shadow API
cc.mapShadow('/assets/data.json', encoder.encode(jsonData))
cc.unmapShadow('/assets/data.json')
cc.resetShadow()
```

## Web Renderer (Low-level)

```ts
import {createTypstRenderer} from '@myriaddreamin/typst.ts'

const renderer = createTypstRenderer()
await renderer.init({getModule: () => '/path/to/wasm'})

// Render precompiled artifact to canvas
await renderer.renderToCanvas({
    artifactContent,  // Uint8Array in vector format
    container,        // DOM element
    backgroundColor: '#343541',
    pixelPerPt: 4.5
})
```

## Framework Wrappers

### React
```tsx
import {TypstDocument} from '@myriaddreamin/typst.react'
<TypstDocument fill="#343541" artifact={artifact} />
// Configure wasm: TypstDocument.setWasmModuleInitOptions({getModule: ...})
```

### Angular
```ts
import {TypstDocumentModule} from '@myriaddreamin/typst.angular'
// Template: <typst-document fill="#343541" artifact="{{ artifact }}"></typst-document>
```

### Vue 3
```vue
<Typst v-bind:content="sourceCode" />
```

### Solid
```tsx
import {TypstDocument} from '@myriaddreamin/typst.solid'
<TypstDocument fill="#343541" artifact={vec()} />
```

## Access Models (filesystem backends for browser compiler)

- `FetchAccessModel` — HTTP server backend
- `MemoryAccessModel` — in-memory filesystem

```ts
$typst.use(TypstSnippet.withAccessModel(new cm.FetchAccessModel('http://localhost:20810')))
$typst.use(TypstSnippet.fetchPackageRegistry(fetchBackend))  // remote package registry
```

## High-level `use` API methods:
- `preloadFontFromUrl` / `preloadFontData` / `preloadFonts`
- `disableDefaultFontAssets` / `loadFonts` / `preloadFontAssets`
- `withPackageRegistry` / `withAccessModel`
- `fetchPackageRegistry` / `fetchPackageBy`

## CLI (typst-ts-cli)

```bash
cargo install --locked --git https://github.com/Myriad-Dreamin/typst.ts typst-ts-cli
typst-ts-cli compile -e main.typ --format vector -o output/
typst-ts-cli compile -e main.typ --format svg
typst-ts-cli compile -e main.typ --dynamic-layout  # responsive layout artifacts
typst-ts-cli compile -e main.typ --watch
```

## Responsive Rendering (Static Sites)

Uses `DynLayoutCompiler` to precompile artifacts with data for multiple screen widths/themes.
Typst scripts read `sys.inputs.at("x-page-width")` and `sys.inputs.at("x-target")`.

```typ
#let page-width = sys.inputs.at("x-page-width", default: 21cm)
#let target = sys.inputs.at("x-target", default: "pdf")
#let is-web-target() = target.starts-with("web")
```

```js
// Node.js precompiler
const dyn = DynLayoutCompiler.fromBoxed(NodeCompiler.create(args).intoBoxed())
const vectorData = dyn.vector({mainFilePath: path})
```

## Incremental/Streaming Rendering

Uses `CompileActor` (Rust) for watch compilation + `IncrSvgDocServer`/`IncrSvgDocClient`
for streaming diffs. Communication via `ArtifactDiff` (FlatModule).

## Rust Compiler Library (reflexo-typst)

```rust
// Minimal
let verse = CompileOnceArgs::parse().resolve_system()?;
let doc = typst::compile(&verse.snapshot())?;
verse.evict(10);

// Watch mode
let (intr_tx, intr_rx) = tokio::sync::mpsc::unbounded_channel();
let actor = CompileActor::new(verse, intr_tx, intr_rx).with_watch(true);
tokio::spawn(actor.run());
```

Key Rust concepts:
- `Universe` spawns multiple `World` instances (World is Send+Sync)
- `EntryState` variants: `new_rooted_by_parent`, `new_rooted`, `new_rootless`, `new_workspace`, `new_detached`
- Shadow API: `map_shadow` / `map_shadow_by_id` for in-memory file overrides
- `increment_revision()` for fine-grained universe mutation
- Exporters: AstExporter, PdfDocExporter, PureSvgExporter, SvgHtmlExporter, SvgModuleExporter, TextExporter
- HTML target: `world.html_task()` + `typst::compile::<TypstHtmlDocument>()`

## SVG Output Differences

- Node CLI: `width="X pt"` attributes
- Web renderer: `width="X"` with offset `viewBox`, uses CSS custom properties (`var(--glyph_fill)`) requiring injection when loaded as `<img>`

## Known Limitations

- Transparent background not supported in some browsers
- Web compiler is slower than native (Wasm overhead)
- Web requires font loading from network (not bundled by default in lite version)
- Cache eviction must be done manually to avoid memory leaks
- `sys.inputs` in NodeCompiler.compile() fully replaces (not merges) creation-time inputs

## Proposals/Advanced Topics

- **Vector Format**: Custom intermediate representation optimized for typst documents
- **Artifact Streaming**: IncrSvgDocServer/Client for incremental diff-based rendering
- **Incremental Font Transfer**: Only transfer needed font byte ranges (W3C IFT inspired)
- **Fine-granular Canvas Update**: Bound tree + differential updates for canvas rendering
- **Text Retrieval**: Mapping typst TextItems to pdf.js-like TextContent for text selection

