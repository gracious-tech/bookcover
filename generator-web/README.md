
# bookcover-web

Generate print-ready book covers. Part of the [bookcover](https://github.com/gracious-tech/bookcover) generation system.

```
npm install bookcover-web
```

[![Example cover](../sample.svg)](../sample.pdf "View example PDF")

This is a browser wrapper for the book cover generator. It compiles covers via WASM using
[typst.ts](https://github.com/Myriad-Dreamin/typst.ts).

## See the [schema reference](https://github.com/gracious-tech/bookcover/blob/main/generator/README.md) which is passed as an argument and is what actually configures the cover design.

```ts
import {init, CoverGenerator} from 'bookcover-web'
```

## `init(options): Promise<CoverGenerator>`

Create a generator instance with an initialised WASM compiler and optional renderer.

```ts
interface InitOptions {
    wasm_url: string              // URL to typst_ts_web_compiler_bg.wasm
    renderer_wasm_url?: string    // URL to typst_ts_renderer_bg.wasm (required for SVG/PNG)
    assets_prefix?: string        // URL prefix for static assets (templates, frames, backgrounds)
    fonts_prefix?: string         // URL prefix for the fonts tree (manifest.json + families)
}
```

## Assets

The Typst templates are bundled inside `bookcover-core` itself (tied to the exact installed
version — no setup needed). Generating still fetches three kinds of assets at runtime, none of
which ship inside the npm packages: the WASM binaries, frame images (`frames/`), and the fonts
tree. The easiest setup is the hosted tree at `https://assets.paper.bible/` (CORS enabled):

> The `typst/` WASM binaries are stored Brotli-compressed and served with
> `Content-Encoding: br` to every client, with no content negotiation — the compiler is 27 MB
> raw and 6.9 MB compressed, so this is not optional. Browsers handle it transparently. If you
> fetch these from a non-browser client, make sure it decodes `br` (`curl` needs `--compressed`,
> or it will write the compressed bytes to disk).

```ts
// Match the wasm version to your installed @myriaddreamin/typst-ts-web-compiler version
const typst_version = '0.7.0'

const generator = await init({
    wasm_url: `https://assets.paper.bible/typst/${typst_version}/typst_ts_web_compiler_bg.wasm`,
    renderer_wasm_url: `https://assets.paper.bible/typst/${typst_version}/typst_ts_renderer_bg.wasm`,
    assets_prefix: 'https://assets.paper.bible/',
    fonts_prefix: 'https://assets.paper.bible/fonts',
})
```

To self-host instead, serve the same layout under any prefix on your origin:

- **WASM** — with Vite, import the URLs straight from the installed packages (no hosting
  needed): `import wasm_url from
  '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'` (and likewise
  for the renderer). Without a bundler, copy them from `node_modules` into your `public/` dir.
- **`<assets_prefix>/frames/`** — `painted.png` and `torn.png`, copied from the repo's
  `assets/frames/`. (`backgrounds/` is only needed if your UI offers the suggested
  background images — see below.)
- **`<fonts_prefix>/`** — the fonts tree (`manifest.json`, one dir per family, Noto fallbacks
  under `_noto/`). Generate it with the repo's font config:

  ```bash
  curl -O https://raw.githubusercontent.com/gracious-tech/bookcover/main/font_config.json
  npx typst-fonts-download --fonts public/fonts --config font_config.json
  ```


### Built-in backgrounds

A built-in background's filename (e.g. `beach.jpg`) is its ID — the embed protocol sends a built-in
as `bg_image_builtin` with no bytes. Join it onto any of these to fetch a copy:

- `https://assets.paper.bible/backgrounds/<name>` — the original (2.8MB on average), for final
  output
- `https://assets.paper.bible/backgrounds/previews_2700/<name>` (`BG_PREVIEW_DIR`) — ~380KB,
  enough for on-screen previews of a 6x9" cover
- `https://assets.paper.bible/backgrounds/previews_800/<name>` — large thumbnails
- `https://assets.paper.bible/backgrounds/thumbnails/<name>` — 160x120 picker tiles

Pass the filename to `generate()` as `image_builtin` whichever copy you render, so the automatic
text colors come from its baked color data and a preview matches the final output exactly.
`get_builtin_bg_regions(name)` returns the same data, and `get_builtin_bg(name)` adds the
original's pixel size (for resolution checks without downloading it).


## `CoverGenerator.generate(options): Promise<GenerateResult>`

```ts
interface GenerateOptions {
    schema: unknown               // raw schema (see above)
    image?: Blob                  // background image
    // Filename of the built-in background `image` is a copy of — colors come from its baked data
    image_builtin?: string
    // Shrink `image` to at most this many pixels per inch of cover before compiling (previews)
    image_max_dpi?: number
    format?: 'pdf'|'svg'|'png'   // default: 'pdf'
    ppi?: number                  // PNG resolution, default: 144
    split?: boolean               // include split panels in result
    custom_fonts?: Uint8Array[]   // raw TTF bytes for custom fonts
}

interface GenerateResult {
    data: Uint8Array | string     // full cover (bytes for PDF/PNG, string for SVG)
    split?: SplitResult<Uint8Array> | SplitResult<string>
}
```

## `CoverGenerator.destroy()`

Revoke blob URLs to free memory. Call when the instance is no longer needed.

### Example

```ts
import {init} from 'bookcover-web'

const generator = await init({
    wasm_url: 'https://assets.paper.bible/typst/0.7.0/typst_ts_web_compiler_bg.wasm',
    renderer_wasm_url: 'https://assets.paper.bible/typst/0.7.0/typst_ts_renderer_bg.wasm',
    assets_prefix: 'https://assets.paper.bible/',
    fonts_prefix: 'https://assets.paper.bible/fonts',
})

const result = await generator.generate({
    schema: {title1: 'My Book', author: 'Jane Doe', /* ... */},
    format: 'svg',
    split: true,
})

// result.data is the full SVG string
// result.split.front / .back / .spine are individual panel SVGs
```
