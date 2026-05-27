
# bookcover-3d

Create 3D images of books by providing the book cover designs. Part of the [bookcover](https://github.com/gracious-tech/bookcover) generation system.

```
npm install bookcover-3d
```

![Example 3D image](./README_sample.webp)

This is a WebGL 3D book renderer with no external graphics dependencies.

```ts
import {Book3DRenderer, generate} from 'bookcover-3d'
import type {BookFaces, CoverType, GenerateOptions} from 'bookcover-3d'
```

Both exports take the same SVG face inputs and produce the same kind of output. The
difference is lifecycle: `generate` is a one-shot helper that creates and destroys a
renderer internally, while `Book3DRenderer` keeps the WebGL context alive so you can
re-render cheaply (e.g. on mouse drag) without reloading textures.

Use `generate` for static exports. Use `Book3DRenderer` for interactive previews.

## `generate(svgs, options?): Promise<Uint8Array>`

Creates a renderer, loads the SVGs, renders once, returns PNG bytes, then cleans up.

```ts
import {generate} from 'bookcover-3d'

const png = await generate(
    {front: frontSvg, back: backSvg, spine: spineSvg},
    {cover_type: 'paperback', azimuth: -30, width: 800, height: 600},
)
```

```ts
interface BookFaces {
    front: string   // SVG string
    back: string    // SVG string
    spine?: string  // SVG string (optional — depth_mm used if absent)
}

interface GenerateOptions {
    cover_type?: 'paperback'|'paperback_coil'|'paperback_wire'|'paperback_stitch'|'hardcover'|'hardcover_jacket'
    azimuth?: number     // horizontal camera angle in degrees (default: -30)
    elevation?: number   // vertical camera angle in degrees (default: 20)
    roll?: number        // clockwise rotation in degrees (default: 0)
    width?: number       // canvas width in pixels (default: 800)
    height?: number      // canvas height in pixels (default: 600)
}
```

## `Book3DRenderer`

Persistent renderer for interactive use. Load SVGs once; call `render()` repeatedly
with different angles without reloading textures each time.

```ts
import {Book3DRenderer} from 'bookcover-3d'

// Create once
const renderer = new Book3DRenderer(800, 600)

// Load SVGs and build geometry (do this when the cover changes)
await renderer.load({front: frontSvg, back: backSvg, spine: spineSvg}, 'paperback')

// Render at any angle — fast, no texture reload
renderer.render(-30, 20)   // azimuth, elevation

// Export the current frame
const png = await renderer.to_png()

// Free GPU resources when done
renderer.destroy()
```

### Full API

```ts
const renderer = new Book3DRenderer(width?, height?)

// Load cover face SVGs and build 3D geometry
await renderer.load(svgs: BookFaces, cover_type?: CoverType, depth_mm?: number)

// Render at camera angles (all in degrees)
renderer.render(azimuth?, elevation?, zoom?, roll?, light_az?, light_el?, ambient?, exposure?)

// Resize without recreating WebGL context
renderer.resize(width, height)

// Get projected width/height ratio at default viewing angle
renderer.get_projected_aspect(): number

// Composite onto a background photo
await renderer.composite_photo(background: ImageBitmap, options?: PhotoCompositeOptions)

// Export current frame
await renderer.snapshot(): Promise<ImageBitmap>
await renderer.to_png(): Promise<Uint8Array>

// Free GPU resources
renderer.destroy()
```

## Photo compositing

`composite_photo` renders the book at a certain angle and composites it over a
background image, with a shadow derived from the light direction. It returns an
`ImageBitmap` at the background's native resolution.

![Example photo](./README_mockup.webp)

The library ships a set of built-in background photos via `BACKGROUNDS`. Each entry has
an `id` (to identify which image to load) and pre-tuned camera/lighting options that
make the book look natural in that scene. Pass the background entry directly as the
`options` argument — it extends `PhotoCompositeOptions`.

```ts
import {Book3DRenderer, BACKGROUNDS} from 'bookcover-3d'
import type {Background} from 'bookcover-3d'

// Find the background you want
const bg: Background = BACKGROUNDS.find(b => b.id === 'coffee_table')!

// Load the image however you serve your assets
const img = await fetch(`/assets/backgrounds/${bg.id}.webp`)
const blob = await img.blob()
const bitmap = await createImageBitmap(blob)

// Render the book, then composite — pass the background entry as options
await renderer.load({front: frontSvg, back: backSvg, spine: spineSvg})
const result = await renderer.composite_photo(bitmap, bg)

// result is an ImageBitmap at the background's native resolution
```

Available background IDs: `table_with_book`, `wood`, `coffee_table`, `table_with_laptop`,
`table_side`.

You can also composite onto your own image by passing a plain `PhotoCompositeOptions`
object (all fields optional — defaults give a flat overhead perspective):

```ts
interface PhotoCompositeOptions {
    azimuth?: number      // horizontal camera angle in degrees (default: -15)
    elevation?: number    // vertical camera angle in degrees (default: 35)
    zoom?: number
    roll?: number         // clockwise rotation in degrees (default: 0)
    book_scale?: number   // book width as fraction of background width (default: 0.55)
    offset_x?: number     // position offset as fraction of background width (0 = centred)
    offset_y?: number     // position offset as fraction of background height (0 = centred)
    light_az?: number     // light horizontal angle in degrees
    light_el?: number     // light vertical angle in degrees
    ambient?: number      // ambient light level 0–1
}
```
