
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
}

interface GenerateResult {
    output_path: string
    split_paths?: {front: string, back: string, spine?: string}
}
```

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
})
```
