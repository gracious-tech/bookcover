
// Built-in procedural vector backgrounds — full-cover SVG designs recolored at generate time
// from a palette derived from the user's chosen background color (see design.ts's
// generate_palette). Authored against a nominal 6x9in-full-wrap-shaped viewBox; Typst stretches
// the result to the real trim size, so the exact ratio only needs to be roughly right.

import type {PaletteScheme} from './design.js'

// Nominal design canvas — close to a 6x9in trade paperback full wrap (front + spine + bleed)
const W = 1400
const H = 950

export interface VectorBackgroundDef {
    id:string
    name:string
    color_count:number
    scheme:PaletteScheme
    // Render the full design to an SVG string given resolved hex colors (length === color_count)
    render(colors:string[]):string
}

/** Deterministic pseudo-random value in [0, 1) from two integer coordinates */
function hash(x:number, y:number):number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return s - Math.floor(s)
}

/** Repeating diagonal bands tiling the full canvas edge to edge, no empty corners */
function diagonal_stripes(colors:string[]):string {
    const angle = -35
    const diag = Math.sqrt(W * W + H * H)
    const span = diag * 1.4 // generous overhang so rotated bands still cover the corners
    const stripe_w = 140
    const count = Math.ceil(span / stripe_w) + 2
    const start = -(count * stripe_w) / 2
    let rects = ''
    for (let i = 0; i < count; i++) {
        const y = start + i * stripe_w
        const color = colors[i % colors.length]
        rects += `<rect x="${(-span / 2).toFixed(1)}" y="${y.toFixed(1)}" `
            + `width="${span.toFixed(1)}" height="${stripe_w.toFixed(1)}" fill="${color}"/>`
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`
        + `<g transform="translate(${W / 2} ${H / 2}) rotate(${angle})">${rects}</g>`
        + '</svg>'
}

/** Concentric rings radiating from the bottom-left corner — largest painted first, so each
 *  smaller circle on top reveals a ring of the previous color. Relies on the root <svg>'s
 *  default viewport clipping to crop circles that extend past the canvas. */
function sunburst_arcs(colors:string[]):string {
    const cx = 0
    const cy = H
    const max_r = Math.sqrt(W * W + H * H) * 1.05
    const ring_count = 7
    const step = max_r / ring_count
    let circles = ''
    for (let i = ring_count; i >= 1; i--) {
        const r = step * i
        const color = colors[(ring_count - i) % colors.length]
        circles += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${color}"/>`
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${circles}</svg>`
}

/** Low-poly triangular mosaic — a jittered grid split into 2 triangles per cell. Edge points
 *  stay unjittered so the mosaic tiles the canvas with no gaps at the border. */
function faceted_triangles(colors:string[]):string {
    const cols = 10
    const rows = 7
    const cell_w = W / cols
    const cell_h = H / rows
    const jitter = 0.28 // fraction of a cell's size

    // Jittered interior point, or the exact grid corner when on the canvas edge
    const point = (gx:number, gy:number):[number, number] => {
        const on_edge = gx === 0 || gx === cols || gy === 0 || gy === rows
        if (on_edge)
            return [gx * cell_w, gy * cell_h]
        const jx = (hash(gx, gy) - 0.5) * 2 * jitter
        const jy = (hash(gx + 99, gy + 57) - 0.5) * 2 * jitter
        return [(gx + jx) * cell_w, (gy + jy) * cell_h]
    }

    const grid:[number, number][][] = []
    for (let gy = 0; gy <= rows; gy++) {
        const row:[number, number][] = []
        for (let gx = 0; gx <= cols; gx++) row.push(point(gx, gy))
        grid.push(row)
    }

    let tris = ''
    let idx = 0
    const poly = (p1:[number, number], p2:[number, number], p3:[number, number], color:string):string => {
        const pts = [p1, p2, p3].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
        return `<polygon points="${pts}" fill="${color}"/>`
    }
    for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
            const a = grid[gy][gx]
            const b = grid[gy][gx + 1]
            const c = grid[gy + 1][gx]
            const d = grid[gy + 1][gx + 1]
            tris += poly(a, b, c, colors[idx++ % colors.length])
            tris += poly(b, d, c, colors[idx++ % colors.length])
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${tris}</svg>`
}

const VECTOR_BACKGROUNDS:VectorBackgroundDef[] = [
    {id: 'diagonal-stripes', name: 'Diagonal Stripes', color_count: 3, scheme: 'triadic', render: diagonal_stripes},
    {id: 'sunburst-arcs', name: 'Sunburst Arcs', color_count: 4, scheme: 'analogous', render: sunburst_arcs},
    {id: 'faceted-triangles', name: 'Faceted Triangles', color_count: 5, scheme: 'complementary', render: faceted_triangles},
]

export function list_vector_backgrounds():VectorBackgroundDef[] {
    return VECTOR_BACKGROUNDS.map(v => ({...v}))
}

export function find_vector_background(id:string):VectorBackgroundDef | undefined {
    return VECTOR_BACKGROUNDS.find(v => v.id === id)
}
