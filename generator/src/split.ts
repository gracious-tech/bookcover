
// Cover splitting — crop region calculation, SVG viewBox splitting, PNG split orchestration

import type {GetDimensionsResult, Region} from 'printing-services'

/** Convert mm to pt — Typst SVG and PDF coordinate systems use pt (1mm = 72/25.4pt) */
function mm_to_pt(mm:number):number {
    return mm / 25.4 * 72
}

// -- Types --

export interface CropRegion {
    // All values in mm
    x:number
    y:number
    width:number
    height:number
    label:'front' | 'back' | 'spine'
}

export interface PixelCropRegion {
    // All values in pixels
    x:number
    y:number
    width:number
    height:number
    label:'front' | 'back' | 'spine'
}

export interface SplitResult<T> {
    front:T
    back:T
    spine?:T    // undefined when has_spine is false (home printer)
}

/** Build a SplitResult from a Map keyed by panel label */
function to_split_result<T>(parts:Map<string, T>):SplitResult<T> {
    return {
        front: parts.get('front')!,
        back: parts.get('back')!,
        spine: parts.get('spine'),
    }
}

// Platform-specific crop callback: receives full PNG data and pixel region, returns cropped PNG
export type PngCropFn = (
    data:Uint8Array, x:number, y:number, w:number, h:number,
) => Promise<Uint8Array>

// -- Crop region calculation --

/** Map a printing-services Region (Big values) to a CropRegion with a panel label */
function to_crop_region(r:Region, label:CropRegion['label']):CropRegion {
    return {x: r.x.toNumber(), y: r.y.toNumber(), width: r.w.toNumber(), height: r.h.toNumber(), label}
}

/** Calculate crop regions (in mm) for front, back, and optionally spine panels.
 *  Regions come directly from printing-services — bleed excluded, trim area only. */
export function calculate_crop_regions(dims:GetDimensionsResult):CropRegion[] {
    const regions:CropRegion[] = []

    // Back, spine (when present), and front panels
    regions.push(to_crop_region(dims.cover_region_back, 'back'))
    if (dims.cover_has_spine) {
        regions.push(to_crop_region(dims.cover_region_spine, 'spine'))
    }
    regions.push(to_crop_region(dims.cover_region_front, 'front'))

    return regions
}

/** Convert crop regions from mm to pixel coordinates at a given PPI.
 *  Widths and heights are derived from edge positions to avoid rounding gaps/overlaps. */
export function calculate_pixel_crop_regions(
    dims:GetDimensionsResult,
    ppi:number,
):PixelCropRegion[] {
    // ppi is pixels per inch; convert to pixels per mm
    const px_per_mm = ppi / 25.4
    return calculate_crop_regions(dims).map(r => {
        // Round edges, then derive size from the difference
        const left = Math.round(r.x * px_per_mm)
        const top = Math.round(r.y * px_per_mm)
        const right = Math.round((r.x + r.width) * px_per_mm)
        const bottom = Math.round((r.y + r.height) * px_per_mm)
        return {x: left, y: top, width: right - left, height: bottom - top, label: r.label}
    })
}

// -- SVG splitting --

/** Split a full-cover SVG into individual panel SVGs by adjusting the viewBox */
export function split_svg(
    svg:string,
    dims:GetDimensionsResult,
):SplitResult<string> {
    const regions = calculate_crop_regions(dims)
    const parts = new Map<string, string>()

    for (const region of regions) {
        // Typst SVGs use pt as their coordinate system
        const vb_x = mm_to_pt(region.x)
        const vb_y = mm_to_pt(region.y)
        const vb_w = mm_to_pt(region.width)
        const vb_h = mm_to_pt(region.height)

        const w_str = vb_w.toFixed(4)
        const h_str = vb_h.toFixed(4)
        const vb_str = `${vb_x.toFixed(4)} ${vb_y.toFixed(4)} ${w_str} ${h_str}`

        // Replace attributes on the root <svg> element
        const cropped = svg.replace(/<svg([^>]*)>/, (_match, attrs:string) => {
            let new_attrs = attrs
            new_attrs = new_attrs.replace(/width="[^"]*"/, `width="${w_str}pt"`)
            new_attrs = new_attrs.replace(/height="[^"]*"/, `height="${h_str}pt"`)

            if (/viewBox="[^"]*"/.test(new_attrs)) {
                new_attrs = new_attrs.replace(/viewBox="[^"]*"/, `viewBox="${vb_str}"`)
            }
            else {
                new_attrs += ` viewBox="${vb_str}"`
            }

            return `<svg${new_attrs}>`
        })

        parts.set(region.label, cropped)
    }

    return to_split_result(parts)
}

// -- PDF splitting --

/**
 * Split a full-cover PDF into individual panel PDFs by injecting a /CropBox per panel.
 * The full content is preserved in each file; viewers display only the panel's region.
 */
export function split_pdf(
    pdf:Uint8Array,
    dims:GetDimensionsResult,
):SplitResult<Uint8Array> {
    const regions = calculate_crop_regions(dims)
    const parts = new Map<string, Uint8Array>()
    const total_h_pt = mm_to_pt(dims.cover_total_height.toNumber())

    for (const region of regions) {
        // Convert region from mm/top-left origin to PDF points/bottom-left origin
        const x1 = mm_to_pt(region.x).toFixed(2)
        const y1 = (total_h_pt - mm_to_pt(region.y + region.height)).toFixed(2)
        const x2 = mm_to_pt(region.x + region.width).toFixed(2)
        const y2 = (total_h_pt - mm_to_pt(region.y)).toFixed(2)
        parts.set(region.label, inject_pdf_cropbox(pdf, `/CropBox [${x1} ${y1} ${x2} ${y2}]`))
    }

    return to_split_result(parts)
}

/**
 * Inject a /CropBox entry after /MediaBox in the PDF page dictionary, then
 * repair the traditional cross-reference table so byte offsets remain valid.
 */
function inject_pdf_cropbox(pdf:Uint8Array, cropbox:string):Uint8Array {
    // Decode as latin1 — byte values 0-255 map to codepoints 0-255, safe to round-trip
    let s = ''
    for (let i = 0; i < pdf.length; i++) s += String.fromCharCode(pdf[i])

    // Find /MediaBox in the page dict and insert CropBox immediately after it
    const m = /\/MediaBox\s*\[[^\]]*\]/.exec(s)
    if (!m) return pdf
    const ins_pos = m.index + m[0].length
    const ins_str = '\n' + cropbox
    const out = s.slice(0, ins_pos) + ins_str + s.slice(ins_pos)
    const ins_len = ins_str.length

    // Repair traditional xref table: each in-use entry is exactly 20 bytes —
    // "OOOOOOOOOO GGGGG n<2-byte-EOL>" — update offsets of objects beyond the insertion
    const repaired = out
        .replace(/(\d{10}) (\d{5}) n(\r\n| \r| \n)/g, (full, off, gen, eol) => {
            const n = parseInt(off, 10)
            if (n <= ins_pos) return full
            return (n + ins_len).toString().padStart(10, '0') + ' ' + gen + ' n' + eol
        })
        .replace(/(startxref\s+)(\d+)/, (_, pre, n) => {
            const off = parseInt(n, 10)
            return pre + (off > ins_pos ? off + ins_len : off)
        })

    // Re-encode as latin1
    const result = new Uint8Array(repaired.length)
    for (let i = 0; i < repaired.length; i++) result[i] = repaired.charCodeAt(i) & 0xff
    return result
}

// -- PNG splitting --

/**
 * Split a full-cover PNG into individual panel PNGs.
 * The actual pixel cropping is delegated to crop_fn, which each platform provides.
 */
export async function split_png(
    png:Uint8Array,
    dims:GetDimensionsResult,
    ppi:number,
    crop_fn:PngCropFn,
):Promise<SplitResult<Uint8Array>> {
    const regions = calculate_pixel_crop_regions(dims, ppi)
    const parts = new Map<string, Uint8Array>()

    for (const region of regions) {
        const cropped = await crop_fn(png, region.x, region.y, region.width, region.height)
        parts.set(region.label, cropped)
    }

    return to_split_result(parts)
}
