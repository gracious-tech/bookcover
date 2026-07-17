
# bookcover-node

Generate print-ready book covers. Part of the [bookcover](https://github.com/gracious-tech/bookcover) generation system.

```
npm install bookcover-node
```

[![Example cover](../sample.svg)](../sample.pdf "View example PDF")

This is a Node.js wrapper for the book cover generator. Writes files to a temp directory,
spawns the [typst](https://typst.app/) CLI binary, and reads back the compiled output.

Requires [`typst`](https://typst.app/) on `$PATH`.

## See the [schema reference](https://github.com/gracious-tech/bookcover/blob/main/generator/README.md) which is passed as an argument and is what actually configures the cover design.

```ts
import {generate} from 'bookcover-node'
```

## `generate(options): Promise<GenerateResult>`

```ts
interface GenerateOptions {
    schema: unknown              // raw schema (see above)
    input_path: string           // directory to search for background image
    output_path: string          // where to write the output file
    format?: 'pdf'|'svg'|'png'  // default: 'pdf'
    ppi?: number                 // PNG resolution, default: 144
    split?: boolean              // also write front/back/spine panel files
    assets_dir?: string          // root of the assets tree (see "Assets" below)
    fonts_dir?: string           // fonts tree if kept elsewhere, default: <assets_dir>/fonts
    typst_path?: string          // typst CLI binary, default: 'typst' from $PATH
    custom_fonts?: CustomFont[]  // user-uploaded font families (from typst-fonts)
}

interface GenerateResult {
    output_path: string
    split_paths?: {front: string, back: string, spine?: string}
}
```

## Assets

Generating requires a local assets tree holding the Typst templates and the fonts collection —
neither ships inside the npm packages. Set it up once and pass its path as `assets_dir`:

```bash
# 1. Templates — copy assets/docs/ from the hosted assets tree (or from the repo)
mkdir -p assets/docs
curl -o assets/docs/cover.typ https://assets.paper.bible/docs/cover.typ
curl -o assets/docs/_helpers.typ https://assets.paper.bible/docs/_helpers.typ

# 2. Fonts — download the curated families + Noto fallbacks named by the repo's font config
curl -O https://raw.githubusercontent.com/gracious-tech/bookcover/main/font_config.json
npx typst-fonts-download --fonts assets/fonts --config font_config.json
```

That produces the expected layout:

```
assets/
    docs/       cover.typ, _helpers.typ
    fonts/      manifest.json, <family>/, _noto/<family>/
```

Inside the [bookcover repo](https://github.com/gracious-tech/bookcover) itself `assets_dir`
can be omitted — it defaults to the repo's own `assets/` dir.

### Example

```ts
import {generate} from 'bookcover-node'

await generate({
    schema: {
        title1: 'My Book',
        author: 'Jane Doe',
        page_count: 200,
        printer: {service: 'kdp', binding_type: 'paperback', ink_type: 'bw', paper_type: 'white'},
        size_id: 'us_trade',
    },
    input_path: '.',
    output_path: './cover.pdf',
    assets_dir: './assets',
})
```
