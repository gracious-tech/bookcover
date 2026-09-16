
// Book box geometry — builds the vertex/index data for a given cover size

import type {CoverType} from './types.js'

// Hardback board overhang (how much cover extends beyond pages on top/bottom/fore-edge)
// and board thickness (depth each board consumes from total spine width), in normalised units (h=1.0)
const BOARD_EXTEND    = 0.02
const BOARD_THICKNESS = 0.007

// Cream colour for page-edge faces (fore-edge, top, bottom)
const PAGE_COLOR:[number,number,number] = [0.94, 0.91, 0.86]

// Hole rings, rim to centre — faked radial depth gradient. Each hole is drawn as several
// concentric stadium shapes shrinking toward the centre, lit rim through to a dark shadowed
// centre, all still warm-cream tinted like the page edges rather than flat grey.
const HOLE_RINGS:{scale:number, color:[number, number, number]}[] = [
    {scale: 1.0, color: [0.60, 0.57, 0.52]},
    {scale: 0.68, color: [0.44, 0.42, 0.38]},
    {scale: 0.38, color: [0.26, 0.24, 0.21]},
]

// Coil/wire hole dimensions, measured from a real spiral-bound book (mm). Converted to
// normalised units per-book in build_holes since real hole size doesn't scale with cover height.
const HOLE_WIDTH_MM    = 5  // horizontal extent — rounded left/right caps
const HOLE_HEIGHT_MM   = 4  // vertical extent — straight top/bottom (corner radius = half this)
const HOLE_GAP_MM      = 2  // vertical gap between holes, edge to edge
const HOLE_LEFT_GAP_MM = 2  // gap from spine-side trim to the near edge of each hole
const HOLE_EDGE_GAP_MM = 2  // gap from top trim to first hole, and minimum required at the bottom
const HOLE_SEGS        = 4      // segments per rounded corner (quarter-circle)
const HOLE_EPSILON     = 0.001  // z nudge to prevent z-fighting with underlying face (normalised)

// Binding wire. One closed loop per hole rather than a true continuous helix — the only part
// of a loop that is ever visible is the arc wrapping the spine edge, where a real coil's slant
// is imperceptible at preview size, so coil and wire-o share this one geometry.
const COIL_WIRE_MM  = 1.5   // wire diameter
const COIL_MAJOR_SEGS = 20  // segments around the loop
const COIL_MINOR_SEGS = 6   // segments around the wire's cross-section
const COIL_COLOR:[number,number,number] = [0.28, 0.28, 0.30]  // dark plastic; ambient is 0.7 so
                                                              // near-black would read as a flat
                                                              // silhouette with no visible form

/** A mesh ready for GPU upload as one draw call: interleaved [xyz, uv, normal] per vertex.
 *  Usually a single quad, but anything sharing one texture/colour can be one FaceData. */
export interface FaceData {
    vertices:number[]             // 8 floats per vertex
    indices:number[]              // 3 ints per triangle, zero-based within this mesh
    texture:WebGLTexture | null
    color:[number,number,number]
}

/** Build a filled stadium shape (straight top/bottom, semicircular left/right caps) on a
 *  cover face for coil/wire hole rendering. The shape sits in the XY plane at a fixed z;
 *  nx/ny/nz is the face normal. half_w/half_h are the hole's half-extents (normalised units).
 *  Corner radius equals half_h, so each "corner" arc is actually half of a left/right cap —
 *  two adjacent quarter-arcs sharing a centre combine into one semicircle. */
function make_hole_rect(
    cx:number, cy:number, cz:number,
    nx:number, ny:number, nz:number,
    half_w:number, half_h:number,
    color:[number, number, number],
):FaceData {
    const verts:number[] = []
    const indices:number[] = []

    // Inner rect extents (full half-extents minus corner radius, which equals half_h)
    const iw = half_w - half_h
    const ih = 0
    const radius = half_h

    // Corner centres (dx, dy) and starting angle for each of the 4 corners
    const corners:[number, number, number][] = [
        [ iw,  ih,  0],              // top-right,    0° → 90°
        [-iw,  ih,  Math.PI / 2],    // top-left,    90° → 180°
        [-iw, -ih,  Math.PI],        // bottom-left, 180° → 270°
        [ iw, -ih,  Math.PI * 1.5],  // bottom-right,270° → 360°
    ]

    // Center vertex (index 0)
    verts.push(cx, cy, cz, 0.5, 0.5, nx, ny, nz)

    // Perimeter vertices — HOLE_SEGS+1 points per corner arc
    for (const [ox, oy, start_a] of corners) {
        for (let s = 0; s <= HOLE_SEGS; s++) {
            const a = start_a + (s / HOLE_SEGS) * (Math.PI / 2)
            verts.push(
                cx + ox + Math.cos(a) * radius,
                cy + oy + Math.sin(a) * radius,
                cz, 0.5, 0.5, nx, ny, nz,
            )
        }
    }

    // Fan triangles from center to each consecutive pair of perimeter verts
    const perimeter = corners.length * (HOLE_SEGS + 1)
    for (let i = 0; i < perimeter; i++)
        indices.push(0, 1 + i, 1 + (i + 1) % perimeter)

    return {vertices: verts, indices, texture: null, color}
}

/** Where the binding holes sit. The painted holes and the wire loops must agree exactly on
 *  this, so both derive their positions here. cover_height_mm is this book's real cover
 *  height, used to convert the fixed real-world hole measurements (HOLE_*_MM) to this book's
 *  normalised units — hole size is constant in mm regardless of book size, unlike hh which is
 *  always 0.5 by construction. */
function hole_layout(hw:number, hh:number, cover_height_mm:number) {
    const mm = (v:number) => v / cover_height_mm

    const half_w = mm(HOLE_WIDTH_MM / 2)
    const half_h = mm(HOLE_HEIGHT_MM / 2)
    const pitch = mm(HOLE_HEIGHT_MM + HOLE_GAP_MM)          // centre-to-centre
    const cx = -hw + mm(HOLE_LEFT_GAP_MM + HOLE_WIDTH_MM / 2)

    // Pack from 2mm below the top trim downward, dropping the last hole if it wouldn't
    // leave at least HOLE_EDGE_GAP_MM clear at the bottom — not centred, matching how real
    // coil punching is anchored from the top
    const first_cy = hh - mm(HOLE_EDGE_GAP_MM + HOLE_HEIGHT_MM / 2)
    const min_cy = -hh + mm(HOLE_EDGE_GAP_MM) + half_h
    const count = Math.max(1, Math.floor((first_cy - min_cy) / pitch) + 1)

    const ys:number[] = []
    for (let i = 0; i < count; i++)
        ys.push(first_cy - i * pitch)

    return {mm, cx, half_w, half_h, ys}
}

/** Build painted-on binding holes on front and back cover faces for coil/wire bindings. */
function build_holes(hw:number, hh:number, hd:number, cover_height_mm:number):FaceData[] {
    const faces:FaceData[] = []
    const {cx, half_w, half_h, ys} = hole_layout(hw, hh, cover_height_mm)

    for (const cy of ys) {
        // Each ring nudged further out than the last so smaller (inner) rings always render
        // in front of larger ones, avoiding z-fighting between the stacked layers themselves
        HOLE_RINGS.forEach((ring, r) => {
            const eps = HOLE_EPSILON * (r + 1)
            // Front cover (+z normal), nudged forward to avoid z-fighting
            faces.push(make_hole_rect(
                cx, cy, hd + eps, 0, 0, 1, half_w * ring.scale, half_h * ring.scale, ring.color,
            ))
            // Back cover (-z normal), nudged backward
            faces.push(make_hole_rect(
                cx, cy, -(hd + eps), 0, 0, -1, half_w * ring.scale, half_h * ring.scale, ring.color,
            ))
        })
    }

    return faces
}

/** Build the binding wire: one closed tube loop per hole, lying in that hole's plane (constant
 *  y) and wrapping around the spine edge.
 *
 *  Each loop is the circle through both hole centres (cx, ±hd) whose centre sits left of the
 *  hole. That placement does all the work: the left arc rises above the cover as it runs from
 *  the hole to the spine edge, clears the corner and wraps around outside, while the right arc
 *  falls away inside the book where the covers hide it via the depth test — so no clipping or
 *  hole cut-outs are needed, and the tube emerging at the hole centre reads as the wire passing
 *  through it. All loops share one colour, so the whole coil is a single FaceData. */
function build_coil(hw:number, hh:number, hd:number, cover_height_mm:number):FaceData {
    const {mm, cx, ys} = hole_layout(hw, hh, cover_height_mm)
    const wire_r = mm(COIL_WIRE_MM / 2)

    // Loop centre, placed so the arc passes exactly one wire-radius above the cover at the
    // spine corner — i.e. the tube wraps snug around the edge without biting into it. Solving
    // "circle through (cx, hd) reaches hd + r at the spine edge" for the centre gives this;
    // the centre drifts left as the book thickens, which is what keeps that clearance.
    const off = cx + hw          // hole centre's distance from the spine edge
    const x0 = -hw + (off * off - 2 * hd * wire_r - wire_r * wire_r) / (2 * off)
    const major_r = Math.hypot(cx - x0, hd)

    const vertices:number[] = []
    const indices:number[] = []

    for (const cy of ys) {
        const base = vertices.length / 8

        // Sweep a circular cross-section along the loop. The loop lies in the XZ plane, so its
        // axis is Y and each cross-section spans the radial direction and Y — the offset from
        // the centreline is itself the outward surface normal.
        for (let i = 0; i < COIL_MAJOR_SEGS; i++) {
            const a = (i / COIL_MAJOR_SEGS) * Math.PI * 2
            const ca = Math.cos(a)
            const sa = Math.sin(a)

            for (let j = 0; j < COIL_MINOR_SEGS; j++) {
                const b = (j / COIL_MINOR_SEGS) * Math.PI * 2
                const cb = Math.cos(b)
                const nx = ca * cb
                const ny = Math.sin(b)
                const nz = sa * cb
                vertices.push(
                    x0 + ca * major_r + nx * wire_r,
                    cy + ny * wire_r,
                    sa * major_r + nz * wire_r,
                    0.5, 0.5, nx, ny, nz,
                )
            }
        }

        // Stitch quads between consecutive cross-sections, wrapping closed both ways
        for (let i = 0; i < COIL_MAJOR_SEGS; i++) {
            const i2 = (i + 1) % COIL_MAJOR_SEGS
            for (let j = 0; j < COIL_MINOR_SEGS; j++) {
                const j2 = (j + 1) % COIL_MINOR_SEGS
                const v00 = base + i * COIL_MINOR_SEGS + j
                const v01 = base + i * COIL_MINOR_SEGS + j2
                const v10 = base + i2 * COIL_MINOR_SEGS + j
                const v11 = base + i2 * COIL_MINOR_SEGS + j2
                indices.push(v00, v10, v11, v00, v11, v01)
            }
        }
    }

    return {vertices, indices, texture: null, color: COIL_COLOR}
}

/** Build a quad face from 4 [x,y,z,u,v] vertices + a flat normal */
function make_face(
    verts:[[number,number,number,number,number],[number,number,number,number,number],
           [number,number,number,number,number],[number,number,number,number,number]],
    nx:number, ny:number, nz:number,
    tex:WebGLTexture | null,
    color:[number,number,number] = [1,1,1],
):FaceData {
    const vertices:number[] = []
    for (const [x,y,z,u,v] of verts)
        vertices.push(x, y, z, u, v, nx, ny, nz)
    return {vertices, indices: [0,1,2, 0,2,3], texture: tex, color}
}

// Saddle-stitch curve: how far from the spine edge the covers bend, and subdivision count
const STITCH_CURVE_W    = 0.011  // ~2.5mm normalised (h=1.0 = cover height ~229mm)
const STITCH_CURVE_SEGS = 5      // strip columns across the curved region

/** Build the top or bottom edge face for saddle-stitch: flat across most of the width,
 *  curving to a point only in the STITCH_CURVE_W region near the spine, matching the covers. */
function make_stitch_edge(
    hw:number, y:number, vhd:number,
    ny:number, page_tex:WebGLTexture,
):FaceData {
    const verts:number[] = []
    const idx:number[]   = []
    const cw = Math.min(STITCH_CURVE_W, hw)
    const flip = ny < 0

    // Columns from fore-edge to spine: [x, z_front, z_back]
    const cols:[number, number, number][] = [
        [hw,       vhd, -vhd],   // fore-edge
        [-hw + cw, vhd, -vhd],   // start of curve
    ]
    // Curve region — mirrors make_stitch_cover: t=0 at spine (z=0), t=1 at curve end (z=±vhd)
    for (let i = STITCH_CURVE_SEGS - 1; i >= 0; i--) {
        const t = i / STITCH_CURVE_SEGS
        const z = vhd * (1 - Math.cos(t * Math.PI / 2))
        cols.push([-hw + t * cw, z, -z])
    }

    for (let c = 0; c < cols.length - 1; c++) {
        const [x0, zf0, zb0] = cols[c]
        const [x1, zf1, zb1] = cols[c + 1]
        const u0 = (x0 + hw) / (2 * hw)
        const u1 = (x1 + hw) / (2 * hw)
        const base = (verts.length / 8)

        // Top (ny>0): spine-front, fore-front, fore-back, spine-back
        // Bottom (ny<0): spine-back, fore-back, fore-front, spine-front
        if (!flip) {
            verts.push(x1, y, zf1, u1, 0, 0, ny, 0)
            verts.push(x0, y, zf0, u0, 0, 0, ny, 0)
            verts.push(x0, y, zb0, u0, 1, 0, ny, 0)
            verts.push(x1, y, zb1, u1, 1, 0, ny, 0)
        } else {
            verts.push(x1, y, zb1, u1, 1, 0, ny, 0)
            verts.push(x0, y, zb0, u0, 1, 0, ny, 0)
            verts.push(x0, y, zf0, u0, 0, 0, ny, 0)
            verts.push(x1, y, zf1, u1, 0, 0, ny, 0)
        }
        idx.push(base, base+1, base+2,  base, base+2, base+3)
    }

    return {vertices: verts, indices: idx, texture: page_tex, color: [1, 1, 1]}
}

/** Build one curved cover panel for saddle-stitch binding.
 *  sign = +1 for front (normal points +z), -1 for back (-z).
 *  The spine edge (x = -hw) bends inward to z = 0 over STITCH_CURVE_W. */
function make_stitch_cover(
    hw:number, hh:number, hd:number,
    sign:number, tex:WebGLTexture,
):FaceData {
    const verts:number[] = []
    const idx:number[]   = []
    const cw = Math.min(STITCH_CURVE_W, hw)

    // Columns from spine edge to fore-edge, each with (x, z, u)
    const cols:{x:number, z:number, u:number}[] = []

    // Curved region: cosine ease from z=0 at spine to z=±hd at curve end
    for (let i = 0; i <= STITCH_CURVE_SEGS; i++) {
        const t = i / STITCH_CURVE_SEGS
        cols.push({
            x: -hw + t * cw,
            z: sign * hd * (1 - Math.cos(t * Math.PI / 2)),
            u: (-hw + t * cw + hw) / (2 * hw),
        })
    }
    // Flat region: single column at fore-edge
    cols.push({x: hw, z: sign * hd, u: 1.0})

    // Back face UVs are mirrored horizontally (u=0 at fore-edge, u=1 at spine)
    if (sign < 0) {
        for (const c of cols) c.u = 1 - c.u
    }

    // Vertex strip: top and bottom vert per column
    for (const {x, z, u} of cols) {
        verts.push(x,  hh, z,  u, 0,  0, 0, sign)
        verts.push(x, -hh, z,  u, 1,  0, 0, sign)
    }

    // Quads between adjacent column pairs
    for (let c = 0; c < cols.length - 1; c++) {
        const tl = c * 2, bl = c * 2 + 1
        const tr = (c + 1) * 2, br = (c + 1) * 2 + 1
        idx.push(tl, tr, br,  tl, br, bl)
    }

    return {vertices: verts, indices: idx, texture: tex, color: [1, 1, 1]}
}

/** Build faces for a saddle-stitch binding: covers curve inward to meet at the spine fold */
function build_stitch(
    hw:number, hh:number, hd:number,
    front_tex:WebGLTexture, back_tex:WebGLTexture,
    _spine_tex:WebGLTexture | null, page_tex:WebGLTexture,
):FaceData[] {
    const vhd = hd
    return [
        make_stitch_cover(hw, hh, vhd,  1, front_tex),
        make_stitch_cover(hw, hh, vhd, -1, back_tex),

        // Spine fold edge — covers meet at z=0 here so this is a zero-width seam;
        // render a thin sliver of page color as a visual hint of the fold
        make_face([
            [-hw,  hh, -0.001,  0, 0],
            [-hw,  hh,  0.001,  1, 0],
            [-hw, -hh,  0.001,  1, 1],
            [-hw, -hh, -0.001,  0, 1],
        ], -1, 0, 0, null, PAGE_COLOR),

        // Fore-edge (x = +hw)
        make_face([
            [ hw,  hh,  vhd,  0, 0],
            [ hw,  hh, -vhd,  0, 1],
            [ hw, -hh, -vhd,  1, 1],
            [ hw, -hh,  vhd,  1, 0],
        ], 1, 0, 0, page_tex),

        // Top and bottom — curved strip matching the cover profile
        make_stitch_edge(hw,  hh, vhd,  1, page_tex),
        make_stitch_edge(hw, -hh, vhd, -1, page_tex),
    ]
}

/** Build faces for a paperback (simple box, no overhang or board thickness) */
function build_paperback(
    hw:number, hh:number, hd:number,
    front_tex:WebGLTexture, back_tex:WebGLTexture,
    spine_tex:WebGLTexture | null, page_tex:WebGLTexture,
):FaceData[] {
    return [
        // Front (z = +hd)
        make_face([
            [-hw,  hh, hd,  0, 0],
            [ hw,  hh, hd,  1, 0],
            [ hw, -hh, hd,  1, 1],
            [-hw, -hh, hd,  0, 1],
        ], 0, 0, 1, front_tex),

        // Back (z = -hd)
        make_face([
            [ hw,  hh,-hd,  0, 0],
            [-hw,  hh,-hd,  1, 0],
            [-hw, -hh,-hd,  1, 1],
            [ hw, -hh,-hd,  0, 1],
        ], 0, 0,-1, back_tex),

        // Spine (x = -hw)
        make_face([
            [-hw,  hh,-hd,  0, 0],
            [-hw,  hh, hd,  1, 0],
            [-hw, -hh, hd,  1, 1],
            [-hw, -hh,-hd,  0, 1],
        ],-1, 0, 0, spine_tex, PAGE_COLOR),

        // Fore-edge (x = +hw)
        make_face([
            [ hw,  hh, hd,  0, 0],
            [ hw,  hh,-hd,  0, 1],
            [ hw, -hh,-hd,  1, 1],
            [ hw, -hh, hd,  1, 0],
        ], 1, 0, 0, page_tex),

        // Top (y = +hh)
        make_face([
            [-hw,  hh, hd,  0, 0],
            [ hw,  hh, hd,  1, 0],
            [ hw,  hh,-hd,  1, 1],
            [-hw,  hh,-hd,  0, 1],
        ], 0, 1, 0, page_tex),

        // Bottom (y = -hh)
        make_face([
            [-hw, -hh,-hd,  0, 0],
            [ hw, -hh,-hd,  1, 0],
            [ hw, -hh, hd,  1, 1],
            [-hw, -hh, hd,  0, 1],
        ], 0,-1, 0, page_tex),
    ]
}

/** Build faces for a hardcover book with accurate interior trim vs cover trim.
 *  Cover panels use full SVG dimensions; page block is inset by board overhang/thickness.
 *  Front and back boards are separate (not connected at the fore-edge).
 *  Board edge colour is sampled from the cover textures (material wraps around). */
function build_hardcover(
    hw:number, hh:number, hd:number,
    front_tex:WebGLTexture, back_tex:WebGLTexture,
    spine_tex:WebGLTexture | null, page_tex:WebGLTexture,
):FaceData[] {

    // Page block extents — all four boards consume BOARD_THICKNESS, interior shifts/moves intact
    const py = hh - BOARD_EXTEND     // page half-height (top/bottom inset)
    const pz = hd - BOARD_THICKNESS  // page half-depth (front/back boards consume thickness)
    const sx = -hw + BOARD_THICKNESS  // page block left edge (spine board pushes it right)
    const fx =  hw - BOARD_EXTEND    // page block right edge (fore-edge inset)

    // UV sample points for board edges — sample near corners of the cover textures
    // where solid background colour is most likely.
    // Front cover: u=0 is spine, u=1 is fore-edge, v=0 is top, v=1 is bottom
    const f_uv:[number,number] = [0.98, 0.98]
    // Back cover: u=0 is fore-edge, u=1 is spine
    const b_uv:[number,number] = [0.02, 0.98]
    // Spine board surfaces — sample spine texture center, fall back to front cover spine edge
    const cloth_tex = spine_tex ?? front_tex
    const s_uv:[number,number] = spine_tex ? [0.5, 0.5] : [0.02, 0.5]

    const faces:FaceData[] = []

    // -- Cover panels (full size from SVG) --

    // Front cover (z = +hd)
    faces.push(make_face([
        [-hw,  hh, hd,  0, 0],
        [ hw,  hh, hd,  1, 0],
        [ hw, -hh, hd,  1, 1],
        [-hw, -hh, hd,  0, 1],
    ], 0, 0, 1, front_tex))

    // Back cover (z = -hd)
    faces.push(make_face([
        [ hw,  hh,-hd,  0, 0],
        [-hw,  hh,-hd,  1, 0],
        [-hw, -hh,-hd,  1, 1],
        [ hw, -hh,-hd,  0, 1],
    ], 0, 0,-1, back_tex))

    // Spine (x = -hw) — full cover height and depth
    faces.push(make_face([
        [-hw,  hh,-hd,  0, 0],
        [-hw,  hh, hd,  1, 0],
        [-hw, -hh, hd,  1, 1],
        [-hw, -hh,-hd,  0, 1],
    ],-1, 0, 0, spine_tex, PAGE_COLOR))

    // -- Page block (inset from cover) --

    // Page fore-edge (x = +fx) — page block right edge
    faces.push(make_face([
        [ fx,  py, pz,  0, 0],
        [ fx,  py,-pz,  0, 1],
        [ fx, -py,-pz,  1, 1],
        [ fx, -py, pz,  1, 0],
    ], 1, 0, 0, page_tex))

    // Page top (y = +py) — spine board inner edge to page fore-edge
    faces.push(make_face([
        [ sx,  py, pz,  0, 0],
        [ fx,  py, pz,  1, 0],
        [ fx,  py,-pz,  1, 1],
        [ sx,  py,-pz,  0, 1],
    ], 0, 1, 0, page_tex))

    // Page bottom (y = -py) — spine board inner edge to page fore-edge
    faces.push(make_face([
        [ sx, -py,-pz,  0, 0],
        [ fx, -py,-pz,  1, 0],
        [ fx, -py, pz,  1, 1],
        [ sx, -py, pz,  0, 1],
    ], 0,-1, 0, page_tex))

    // -- Fore-edge board strips (at x = +hw, facing +x) --
    // Front and back boards are independent — gap between them is open (no connection)

    // Front board edge (full height, z from +pz to +hd)
    faces.push(make_face([
        [ hw,  hh, hd,   f_uv[0], f_uv[1]],
        [ hw,  hh, pz,   f_uv[0], f_uv[1]],
        [ hw, -hh, pz,   f_uv[0], f_uv[1]],
        [ hw, -hh, hd,   f_uv[0], f_uv[1]],
    ], 1, 0, 0, front_tex))

    // Back board edge (full height, z from -hd to -pz)
    faces.push(make_face([
        [ hw,  hh,-pz,   b_uv[0], b_uv[1]],
        [ hw,  hh,-hd,   b_uv[0], b_uv[1]],
        [ hw, -hh,-hd,   b_uv[0], b_uv[1]],
        [ hw, -hh,-pz,   b_uv[0], b_uv[1]],
    ], 1, 0, 0, back_tex))

    // -- Top board strips (at y = +hh, facing +y) --

    // Front board top (full width, z from +pz to +hd)
    faces.push(make_face([
        [-hw,  hh, hd,   f_uv[0], f_uv[1]],
        [ hw,  hh, hd,   f_uv[0], f_uv[1]],
        [ hw,  hh, pz,   f_uv[0], f_uv[1]],
        [-hw,  hh, pz,   f_uv[0], f_uv[1]],
    ], 0, 1, 0, front_tex))

    // Back board top (full width, z from -hd to -pz)
    faces.push(make_face([
        [-hw,  hh,-pz,   b_uv[0], b_uv[1]],
        [ hw,  hh,-pz,   b_uv[0], b_uv[1]],
        [ hw,  hh,-hd,   b_uv[0], b_uv[1]],
        [-hw,  hh,-hd,   b_uv[0], b_uv[1]],
    ], 0, 1, 0, back_tex))


    // -- Bottom board strips (at y = -hh, facing -y) --

    // Front board bottom (full width, z from +pz to +hd)
    faces.push(make_face([
        [-hw, -hh, pz,   f_uv[0], f_uv[1]],
        [ hw, -hh, pz,   f_uv[0], f_uv[1]],
        [ hw, -hh, hd,   f_uv[0], f_uv[1]],
        [-hw, -hh, hd,   f_uv[0], f_uv[1]],
    ], 0,-1, 0, front_tex))

    // Back board bottom (full width, z from -hd to -pz)
    faces.push(make_face([
        [-hw, -hh,-hd,   b_uv[0], b_uv[1]],
        [ hw, -hh,-hd,   b_uv[0], b_uv[1]],
        [ hw, -hh,-pz,   b_uv[0], b_uv[1]],
        [-hw, -hh,-pz,   b_uv[0], b_uv[1]],
    ], 0,-1, 0, back_tex))

    // -- Spine board surfaces --
    // The spine board has thickness BOARD_THICKNESS (sx - (-hw)).
    // Its outer face is the spine panel already rendered above.
    // These faces close the top, bottom, and inner ledges of the spine board.

    // Spine board top (y = +hh, x from -hw to sx, z from -pz to +pz)
    faces.push(make_face([
        [-hw,  hh, pz,   s_uv[0], s_uv[1]],
        [ sx,  hh, pz,   s_uv[0], s_uv[1]],
        [ sx,  hh,-pz,   s_uv[0], s_uv[1]],
        [-hw,  hh,-pz,   s_uv[0], s_uv[1]],
    ], 0, 1, 0, cloth_tex))

    // Spine board bottom (y = -hh, x from -hw to sx, z from -pz to +pz)
    faces.push(make_face([
        [-hw, -hh,-pz,   s_uv[0], s_uv[1]],
        [ sx, -hh,-pz,   s_uv[0], s_uv[1]],
        [ sx, -hh, pz,   s_uv[0], s_uv[1]],
        [-hw, -hh, pz,   s_uv[0], s_uv[1]],
    ], 0,-1, 0, cloth_tex))

    // Spine board inner ledge top (y = +py, x from -hw to sx) — closes gap at page level
    faces.push(make_face([
        [-hw,  py, pz,   s_uv[0], s_uv[1]],
        [ sx,  py, pz,   s_uv[0], s_uv[1]],
        [ sx,  py,-pz,   s_uv[0], s_uv[1]],
        [-hw,  py,-pz,   s_uv[0], s_uv[1]],
    ], 0, 1, 0, cloth_tex))

    // Spine board inner ledge bottom (y = -py, x from -hw to sx)
    faces.push(make_face([
        [-hw, -py,-pz,   s_uv[0], s_uv[1]],
        [ sx, -py,-pz,   s_uv[0], s_uv[1]],
        [ sx, -py, pz,   s_uv[0], s_uv[1]],
        [-hw, -py, pz,   s_uv[0], s_uv[1]],
    ], 0,-1, 0, cloth_tex))

    return faces
}

/** Build all faces of the book using normalised dimensions (h = 1).
 *  w = cover_width / cover_height, d = spine_width / cover_height.
 *  cover_height_mm is the book's real cover height, needed only to size coil/wire holes
 *  at their true physical mm size regardless of this book's normalised scale. */
export function build_faces(
    w:number,
    h:number,
    d:number,
    front_tex:WebGLTexture,
    back_tex:WebGLTexture,
    spine_tex:WebGLTexture | null,
    cover_type:CoverType,
    page_tex:WebGLTexture,
    cover_height_mm:number,
):FaceData[] {

    // Half-extents
    const hw = w / 2, hh = h / 2, hd = d / 2

    if (cover_type === 'hardcover' || cover_type === 'hardcover_jacket')
        return build_hardcover(hw, hh, hd, front_tex, back_tex, spine_tex, page_tex)

    if (cover_type === 'paperback_stitch')
        return build_stitch(hw, hh, hd, front_tex, back_tex, spine_tex, page_tex)

    const faces = build_paperback(hw, hh, hd, front_tex, back_tex, spine_tex, page_tex)

    // Coil and wire bindings get painted-on holes near the spine edge, with the binding wire
    // threaded through them
    if (cover_type === 'paperback_coil' || cover_type === 'paperback_wire') {
        faces.push(...build_holes(hw, hh, hd, cover_height_mm))
        faces.push(build_coil(hw, hh, hd, cover_height_mm))
    }

    return faces
}
