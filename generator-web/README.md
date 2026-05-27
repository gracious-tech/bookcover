
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
    assets_prefix?: string        // URL prefix for generator assets (fonts, templates, frames)
}
```

**`wasm_url` / `renderer_wasm_url`** — serve the `.wasm` files from your origin. With Vite, import them directly:

```ts
import wasm_url from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'
import renderer_wasm_url from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url'
```

Without a bundler, copy the files from `node_modules` into your `public/` dir and reference by path.

**`assets_prefix`** — points to the `generator/assets/` directory (fonts, Typst templates, frame images). The easiest setup is a symlink from your `public/` dir:

```bash
ln -s ../node_modules/bookcover/assets public/generator_assets
```

Then pass `assets_prefix: '/generator_assets/'`. With Vite the symlink is served automatically at dev time and included in the production build.


## `CoverGenerator.generate(options): Promise<GenerateResult>`

```ts
interface GenerateOptions {
    schema: unknown               // raw schema (see above)
    image?: Blob                  // background image
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
    wasm_url: '/typst_ts_web_compiler_bg.wasm',
    renderer_wasm_url: '/typst_ts_renderer_bg.wasm',
    assets_prefix: '/generator_assets/',
})

const result = await generator.generate({
    schema: {title1: 'My Book', author: 'Jane Doe', /* ... */},
    format: 'svg',
    split: true,
})

// result.data is the full SVG string
// result.split.front / .back / .spine are individual panel SVGs
```
