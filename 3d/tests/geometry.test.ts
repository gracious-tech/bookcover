
import {describe, it, expect} from 'vitest'

import {build_faces} from '../src/geometry.js'
import type {FaceData} from '../src/geometry.js'
import type {CoverType} from '../src/types.js'

// Textures are only ever stored on the face, never read, so a marker object stands in for one
const FRONT_TEX = {id: 'front'} as unknown as WebGLTexture
const BACK_TEX = {id: 'back'} as unknown as WebGLTexture
const SPINE_TEX = {id: 'spine'} as unknown as WebGLTexture
const PAGE_TEX = {id: 'page'} as unknown as WebGLTexture

// A 152x229mm paperback with a 17mm spine, normalised to h = 1
const W = 152 / 229
const D = 17 / 229
const COVER_HEIGHT_MM = 229

/** Build one book's faces, defaulting to the standard paperback fixture */
function faces(cover_type:CoverType = 'paperback', w = W, d = D):FaceData[] {
    return build_faces(w, 1, d, FRONT_TEX, BACK_TEX, SPINE_TEX, cover_type, PAGE_TEX, COVER_HEIGHT_MM)
}

/** Every vertex position in a mesh, as [x, y, z] triples (8 floats per vertex) */
function positions(face:FaceData):[number, number, number][] {
    const out:[number, number, number][] = []
    for (let i = 0; i < face.vertices.length; i += 8)
        out.push([face.vertices[i], face.vertices[i + 1], face.vertices[i + 2]])
    return out
}

/** The axis-aligned bounds of every vertex across all faces */
function bounds(all:FaceData[]):{min:number[], max:number[]} {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const face of all) {
        for (const point of positions(face)) {
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], point[axis])
                max[axis] = Math.max(max[axis], point[axis])
            }
        }
    }
    return {min, max}
}

const ALL_TYPES:CoverType[] = ['paperback', 'paperback_stitch', 'paperback_coil',
    'paperback_wire', 'hardcover', 'hardcover_jacket']


describe('mesh validity', () => {

    it('produces well-formed meshes for every cover type', () => {
        for (const cover_type of ALL_TYPES) {
            const all = faces(cover_type)
            expect(all.length, cover_type).toBeGreaterThan(0)
            for (const face of all) {
                // 8 interleaved floats per vertex, 3 indices per triangle
                expect(face.vertices.length % 8, cover_type).toBe(0)
                expect(face.indices.length % 3, cover_type).toBe(0)
                expect(face.indices.length, cover_type).toBeGreaterThan(0)
                for (const value of face.vertices)
                    expect(Number.isFinite(value), cover_type).toBe(true)
            }
        }
    })

    it('keeps every index inside its own mesh', () => {
        for (const cover_type of ALL_TYPES) {
            for (const face of faces(cover_type)) {
                const vertex_count = face.vertices.length / 8
                for (const index of face.indices) {
                    expect(Number.isInteger(index), cover_type).toBe(true)
                    expect(index, cover_type).toBeGreaterThanOrEqual(0)
                    expect(index, cover_type).toBeLessThan(vertex_count)
                }
            }
        }
    })

    it('gives every face a colour in range', () => {
        for (const cover_type of ALL_TYPES) {
            for (const face of faces(cover_type)) {
                expect(face.color, cover_type).toHaveLength(3)
                for (const channel of face.color) {
                    expect(channel, cover_type).toBeGreaterThanOrEqual(0)
                    expect(channel, cover_type).toBeLessThanOrEqual(1)
                }
            }
        }
    })

    it('normalises every vertex normal', () => {
        for (const cover_type of ALL_TYPES) {
            for (const face of faces(cover_type)) {
                for (let i = 0; i < face.vertices.length; i += 8) {
                    const length = Math.hypot(face.vertices[i + 5], face.vertices[i + 6],
                        face.vertices[i + 7])
                    expect(length, cover_type).toBeCloseTo(1, 4)
                }
            }
        }
    })

    it('keeps texture coordinates within the 0-1 range', () => {
        for (const cover_type of ALL_TYPES) {
            for (const face of faces(cover_type)) {
                for (let i = 0; i < face.vertices.length; i += 8) {
                    expect(face.vertices[i + 3], cover_type).toBeGreaterThanOrEqual(0)
                    expect(face.vertices[i + 3], cover_type).toBeLessThanOrEqual(1)
                    expect(face.vertices[i + 4], cover_type).toBeGreaterThanOrEqual(0)
                    expect(face.vertices[i + 4], cover_type).toBeLessThanOrEqual(1)
                }
            }
        }
    })
})


describe('book dimensions', () => {

    it('centres the book on the origin at the requested size', () => {
        const {min, max} = bounds(faces())
        expect(min[0]).toBeCloseTo(-W / 2, 3)
        expect(max[0]).toBeCloseTo(W / 2, 3)
        expect(min[1]).toBeCloseTo(-0.5, 3)
        expect(max[1]).toBeCloseTo(0.5, 3)
        expect(max[2] - min[2]).toBeCloseTo(D, 3)
    })

    it('grows with a wider cover and a thicker spine', () => {
        const wide = bounds(faces('paperback', W * 2, D))
        expect(wide.max[0] - wide.min[0]).toBeCloseTo(W * 2, 3)
        const thick = bounds(faces('paperback', W, D * 3))
        expect(thick.max[2] - thick.min[2]).toBeCloseTo(D * 3, 3)
    })

    it('insets a hardcover\'s pages behind the overhanging boards', () => {
        // The book keeps its overall size; the boards reach the edge and the pages sit inside
        const page_faces = (cover_type:CoverType) =>
            bounds(faces(cover_type).filter(face => face.texture === PAGE_TEX))
        const book = bounds(faces('hardcover'))
        const pages = page_faces('hardcover')
        expect(pages.max[1]).toBeLessThan(book.max[1])
        expect(pages.max[0]).toBeLessThan(book.max[0])
        // A paperback's pages run right out to the cover edge instead
        expect(page_faces('paperback').max[1]).toBeCloseTo(bounds(faces('paperback')).max[1], 6)
    })
})


describe('cover textures', () => {

    it('maps the supplied textures onto the book', () => {
        const textures = new Set(faces().map(face => face.texture))
        expect(textures.has(FRONT_TEX)).toBe(true)
        expect(textures.has(BACK_TEX)).toBe(true)
        expect(textures.has(SPINE_TEX)).toBe(true)
        expect(textures.has(PAGE_TEX)).toBe(true)
    })

    it('copes with a cover that has no spine panel', () => {
        const all = build_faces(W, 1, D, FRONT_TEX, BACK_TEX, null, 'paperback_stitch',
            PAGE_TEX, COVER_HEIGHT_MM)
        expect(all.length).toBeGreaterThan(0)
        expect(all.some(face => face.texture === FRONT_TEX)).toBe(true)
    })
})


describe('binding variants', () => {

    it('adds holes and a wire loop for coil and wire bindings', () => {
        const plain = faces('paperback').length
        for (const cover_type of ['paperback_coil', 'paperback_wire'] as const)
            expect(faces(cover_type).length, cover_type).toBeGreaterThan(plain)
    })

    it('sizes the holes in real millimetres, not in proportion to the book', () => {
        // A hole is 5mm wide whatever the cover height, so a taller book gets proportionally
        // smaller holes in normalised units
        const hole_span = (height_mm:number) => {
            const all = build_faces(W, 1, D, FRONT_TEX, BACK_TEX, SPINE_TEX, 'paperback_coil',
                PAGE_TEX, height_mm)
            const extra = all.slice(faces('paperback').length)
            const {min, max} = bounds(extra)
            return max[0] - min[0]
        }
        expect(hole_span(400)).toBeLessThan(hole_span(200))
    })

    it('puts the holes near the spine edge, not out at the fore-edge', () => {
        const extra = faces('paperback_coil').slice(faces('paperback').length)
        const {min, max} = bounds(extra)
        expect(min[0]).toBeGreaterThanOrEqual(-W / 2 - 0.05)
        expect(max[0]).toBeLessThan(0)
    })

    it('builds a jacket the same size as the hardcover underneath it', () => {
        const hardcover = bounds(faces('hardcover'))
        const jacket = bounds(faces('hardcover_jacket'))
        expect(jacket.max[0]).toBeCloseTo(hardcover.max[0], 6)
        expect(jacket.max[1]).toBeCloseTo(hardcover.max[1], 6)
    })
})
