
// Book box geometry — builds the vertex/index data for a given cover size

import type {CoverType} from './types.js'

// Hardback board overhang (how much cover extends beyond pages on top/bottom/fore-edge)
// and board thickness (depth each board consumes from total spine width), in normalised units (h=1.0)
const BOARD_EXTEND    = 0.02
const BOARD_THICKNESS = 0.007

// Cream colour for page-edge faces (fore-edge, top, bottom)
const PAGE_COLOR:[number,number,number] = [0.94, 0.91, 0.86]

// Hole colour: same warm cream as page edges but darkened
const HOLE_COLOR:[number,number,number] = [0.38, 0.36, 0.33]

// Coil/wire hole dimensions, measured from a real spiral-bound book (mm). Converted to
// normalised units per-book in build_holes since real hole size doesn't scale with cover height.
const HOLE_WIDTH_MM    = 5  // horizontal extent — rounded left/right caps
const HOLE_HEIGHT_MM   = 4  // vertical extent — straight top/bottom (corner radius = half this)
const HOLE_GAP_MM      = 2  // vertical gap between holes, edge to edge
const HOLE_LEFT_GAP_MM = 2  // gap from spine-side trim to the near edge of each hole
const HOLE_EDGE_GAP_MM = 2  // gap from top trim to first hole, and minimum required at the bottom
const HOLE_SEGS        = 4      // segments per rounded corner (quarter-circle)
const HOLE_EPSILON     = 0.001  // z nudge to prevent z-fighting with underlying face (normalised)

/** A single face ready for GPU upload: interleaved [xyz, uv, normal] × 4 verts + 6 indices */
export interface FaceData {
    vertices:number[]             // 4 × 8 floats
    indices:number[]              // 6 ints (two triangles, zero-based within this face)
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

    return {vertices: verts, indices, texture: null, color: HOLE_COLOR}
}

/** Build painted-on binding holes on front and back cover faces for coil/wire bindings.
 *  cover_height_mm is this book's real cover height, used to convert the fixed real-world
 *  hole measurements (HOLE_*_MM) to this book's normalised units — hole size is constant in
 *  mm regardless of book size, unlike hh which is always 0.5 by construction. */
function build_holes(hw:number, hh:number, hd:number, cover_height_mm:number):FaceData[] {
    const faces:FaceData[] = []
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
    const hole_count = Math.max(1, Math.floor((first_cy - min_cy) / pitch) + 1)

    for (let i = 0; i < hole_count; i++) {
        const cy = first_cy - i * pitch

        // Front cover (+z normal), nudged forward to avoid z-fighting
        faces.push(make_hole_rect(cx, cy, hd + HOLE_EPSILON,  0, 0,  1, half_w, half_h))
        // Back cover (-z normal), nudged backward
        faces.push(make_hole_rect(cx, cy, -(hd + HOLE_EPSILON), 0, 0, -1, half_w, half_h))
    }

    return faces
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

    // Coil and wire bindings get painted-on holes near the spine edge
    if (cover_type === 'paperback_coil' || cover_type === 'paperback_wire')
        faces.push(...build_holes(hw, hh, hd, cover_height_mm))

    return faces
}
