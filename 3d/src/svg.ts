
// SVG parsing and rasterisation utilities

// Grace period before snapshotting an SVG that embeds other documents — a pragmatic
// workaround for a Safari rasterisation quirk (see svg_to_bitmap), not a guarantee. Raise it
// if a cover ever renders in the 3D view without its background again.
const NESTED_RASTER_SETTLE_MS = 250

// Feature detection is no help here (decode()/createImageBitmap exist everywhere) — this is
// a behavioural quirk specific to WebKit's renderer, so UA/platform sniffing is the only
// option. WebKit means desktop Safari, or ANY browser on iOS/iPadOS — Apple requires every
// iOS browser (Chrome, Firefox, Edge included) to run on WebKit under the hood, so those UAs
// need the same workaround despite naming another browser. Android and desktop Chrome/
// Firefox/Edge are the real Blink/Gecko engines this doesn't apply to.
const is_ios = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS reports as "Macintosh" in its UA but is touch-capable, unlike a real Mac
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)
const is_safari_desktop = typeof navigator !== 'undefined'
    && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const is_webkit = is_ios || is_safari_desktop

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

        // onload alone doesn't guarantee the image is actually paintable yet; decode() is
        // spec-guaranteed to wait until it is.
        await img.decode()

        // WebKit can resolve decode() before it has finished rasterising documents nested
        // inside this one, snapshotting a cover whose background is missing while its text
        // (native to the outer document) is fine. Everything is inline, so this is decode
        // time only, with nothing to wait on over the network. Only covers with something
        // embedded are affected, so plain ones skip the wait entirely, and only WebKit needs
        // the wait at all.
        if (is_webkit && cleaned_svg.includes('data:image/'))
            await new Promise<void>(resolve => setTimeout(resolve, NESTED_RASTER_SETTLE_MS))

        // Must be awaited here (not returned directly) — the blob URL is revoked in
        // `finally` right after this call returns, and on Safari that can race ahead of
        // createImageBitmap still reading from the img element, capturing a blank bitmap.
        const bitmap = await createImageBitmap(img)
        return bitmap
    }
    finally {
        URL.revokeObjectURL(url)
    }
}
