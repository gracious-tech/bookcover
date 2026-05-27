
// SVG parsing and rasterisation utilities

/** Parse dimensions from the root SVG element's width/height attributes.
 *  Values are in pt (Typst's SVG renderer uses pt as its coordinate system).
 *  Accepts both "Xpt" (node backend) and bare "X" (web backend) forms. */
export function parse_svg_size(svg:string):{width:number, height:number} {
    const w = svg.match(/width="([\d.]+)(?:pt)?"/)
    const h = svg.match(/height="([\d.]+)(?:pt)?"/)
    if (!w || !h)
        throw new Error('[cover-3d] Could not parse SVG dimensions')
    return {width: parseFloat(w[1]), height: parseFloat(h[1])}
}

/** Render an SVG string to an ImageBitmap via an HTMLImageElement.
 *  createImageBitmap(svgBlob) is unsupported in many browsers; the img→canvas
 *  route works universally. Must be called on the main thread. */
export async function svg_to_bitmap(svg:string, w_pt:number, h_pt:number):Promise<ImageBitmap> {
    const w = Math.max(1, Math.round(w_pt))
    const h = Math.max(1, Math.round(h_pt))

    // Strip out foreignObject elements (not rendered by image conversion)
    let cleaned_svg = svg.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/g, '')

    // Set explicit pixel dimensions so very narrow SVGs (e.g. thin spines) render at a usable size
    cleaned_svg = cleaned_svg
        .replace(/(<svg[^>]*?)width="[^"]*"/, `$1width="${w}"`)
        .replace(/(<svg[^>]*?)height="[^"]*"/, `$1height="${h}"`)

    const blob = new Blob([cleaned_svg], {type: 'image/svg+xml'})
    const url  = URL.createObjectURL(blob)
    try {
        // Load SVG as an image element — handles CSS vars, units, etc.
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
            img.onload  = () => resolve()
            img.onerror = () => reject(new Error('[cover-3d] SVG failed to load as image'))
            img.src = url
        })

        return createImageBitmap(img)
    }
    finally {
        URL.revokeObjectURL(url)
    }
}
