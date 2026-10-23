
// Book3DRenderer's logic against recording fakes for WebGL, canvases and image decoding (see
// fake_gl.ts): which canvas it picks, what it uploads, the uniforms and draws a frame issues,
// the photo composite's placement maths, and that every GPU resource is freed. What the frames
// actually look like is checked in a real browser by the widget's Playwright suite

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'

import {Book3DRenderer, generate} from '../src/index.js'
import {build_faces} from '../src/geometry.js'
import {mat4_perspective, mat4_look_at, mat4_mul, mat4_identity, mat4_rotate_z} from '../src/math.js'
import {PHOTO_AZIMUTH, PHOTO_ELEVATION, PHOTO_BOOK_SCALE} from '../src/photo.js'
import {DEFAULT_LIGHT_AZ, DEFAULT_LIGHT_EL, DEFAULT_AMBIENT} from '../src/webgl.js'
import {FakeGl, FakeOffscreenCanvas, FakeImage, FakeContext2D, make_create_image_bitmap}
    from './fake_gl.js'
import type {FakeBitmap, FakeGlObject} from './fake_gl.js'
import type {BookFaces, CoverType} from '../src/types.js'

const GL = FakeGl.constants

// A 6x9in book (432x648pt) with a 36pt spine
const FACES:BookFaces = {
    front: '<svg width="432" height="648" viewBox="0 0 432 648"></svg>',
    back: '<svg width="432" height="648" viewBox="0 0 432 648"></svg>',
    spine: '<svg width="36" height="648" viewBox="0 0 36 648"></svg>',
}

// The same book's faces without a spine panel, as coil/wire/stitch bindings produce
const NO_SPINE:BookFaces = {front: FACES.front, back: FACES.back}

let create_image_bitmap = make_create_image_bitmap()

beforeEach(() => {
    FakeOffscreenCanvas.instances.length = 0
    FakeOffscreenCanvas.webgl_factory = () => new FakeGl()
    FakeImage.instances.length = 0
    create_image_bitmap = make_create_image_bitmap()
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('createImageBitmap', create_image_bitmap)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

/** The fake context behind a renderer's canvas (an OffscreenCanvas one, which is the default) */
function gl_of(renderer:Book3DRenderer):FakeGl {
    const gl = (renderer.canvas as unknown as FakeOffscreenCanvas).gl
    if (!gl)
        throw new Error('renderer has no WebGL context yet')
    return gl
}

/** A loaded renderer plus its fake context */
async function loaded(faces = FACES, cover_type:CoverType = 'paperback', depth_mm?:number):
    Promise<{renderer:Book3DRenderer, gl:FakeGl}> {
    const renderer = new Book3DRenderer(800, 600)
    await renderer.load(faces, cover_type, depth_mm)
    return {renderer, gl: gl_of(renderer)}
}

/** The bitmaps load() rasterised, in order (front, back, then spine when there is one) */
function rasterised():FakeBitmap[] {
    return create_image_bitmap.mock.settledResults.map(result => result.value as unknown as FakeBitmap)
}

/** How many textures were uploaded from rasterised faces (rather than the page-edge canvas) */
function face_texture_count(gl:FakeGl):number {
    return gl.calls_to('texImage2D')
        .filter(args => (args[5] as FakeBitmap).source instanceof FakeImage).length
}

/** Expected projected aspect at the default -30/20 degree view, for normalised w and d */
function projected_aspect(w:number, d:number):number {
    const az = 30 * Math.PI / 180
    const el = 20 * Math.PI / 180
    return (w * Math.cos(az) + d * Math.sin(az)) / Math.cos(el)
}


describe('canvas selection', () => {

    it('uses an OffscreenCanvas of the requested size when it supports WebGL', () => {
        const renderer = new Book3DRenderer(640, 480)
        expect(renderer.canvas).toBeInstanceOf(FakeOffscreenCanvas)
        expect([renderer.canvas.width, renderer.canvas.height]).toEqual([640, 480])
    })

    it('releases the context it opened only to probe for support', () => {
        new Book3DRenderer()
        const probe = FakeOffscreenCanvas.instances[0]
        expect([probe.width, probe.height]).toEqual([1, 1])
        expect(probe.gl?.lost).toBe(true)
    })

    it('defaults to 800x600', () => {
        const renderer = new Book3DRenderer()
        expect([renderer.canvas.width, renderer.canvas.height]).toEqual([800, 600])
    })

    /** A fake document whose createElement('canvas') returns a plain object with a style */
    function stub_document():{width:number, height:number, style:{display:string}}[] {
        const made:{width:number, height:number, style:{display:string}}[] = []
        vi.stubGlobal('document', {
            createElement: () => {
                const el = {width: 0, height: 0, style: {display: ''}}
                made.push(el)
                return el
            },
        })
        return made
    }

    it('falls back to a hidden DOM canvas when OffscreenCanvas has no WebGL', () => {
        FakeOffscreenCanvas.webgl_factory = () => null
        const made = stub_document()
        const renderer = new Book3DRenderer(320, 200)
        expect(renderer.canvas).toBe(made[0])
        expect(made[0]).toEqual({width: 320, height: 200, style: {display: 'none'}})
    })

    it('falls back to a DOM canvas when OffscreenCanvas does not exist at all', () => {
        vi.stubGlobal('OffscreenCanvas', undefined)
        const made = stub_document()
        const renderer = new Book3DRenderer()
        expect(renderer.canvas).toBe(made[0])
    })

    it('resizes the canvas in place', () => {
        const renderer = new Book3DRenderer()
        const canvas = renderer.canvas
        renderer.resize(1024, 768)
        expect(renderer.canvas).toBe(canvas)
        expect([canvas.width, canvas.height]).toEqual([1024, 768])
    })
})


describe('load', () => {

    it('throws a clear error when WebGL is unavailable', async () => {
        const renderer = new Book3DRenderer()
        // The probe succeeded, but the real canvas then fails to give a context
        FakeOffscreenCanvas.webgl_factory = () => null
        await expect(renderer.load(FACES)).rejects.toThrow('[cover-3d] WebGL not available')
    })

    it('compiles the shader program once, however often covers reload', async () => {
        const {renderer, gl} = await loaded()
        await renderer.load(FACES)
        expect(gl.calls_to('linkProgram')).toHaveLength(1)
    })

    it('rasterises each face at 4x its pt size', async () => {
        const create_object_url = vi.spyOn(URL, 'createObjectURL')
        try {
            await loaded()
            // The SVG text each <img> loaded carries the pixel size it was rasterised at
            const svgs = await Promise.all(create_object_url.mock.calls
                .map(([blob]) => (blob as Blob).text()))
            expect(svgs.map(svg => /width="(\d+)" height="(\d+)"/.exec(svg)?.slice(1))).toEqual([
                ['1728', '2592'], ['1728', '2592'], ['144', '2592']])
            expect(rasterised()).toHaveLength(3)
        }
        finally {
            create_object_url.mockRestore()
        }
    })

    it('uploads front, back and spine textures plus a page-edge texture, closing the bitmaps', async () => {
        const {gl} = await loaded()
        expect(gl.calls_to('texImage2D')).toHaveLength(4)
        for (const bitmap of rasterised())
            expect(bitmap.close).toHaveBeenCalled()
    })

    it('skips the spine texture when there is no spine panel', async () => {
        const {gl} = await loaded(NO_SPINE, 'paperback_coil', 10)
        expect(rasterised()).toHaveLength(2)
        expect(face_texture_count(gl)).toBe(2)
    })

    it('uploads one vertex and one index buffer per face, matching build_faces()', async () => {
        const {gl} = await loaded()
        const textures = gl.calls_to('createTexture').length
        expect(textures).toBe(4)
        // Same geometry the renderer built: normalised w = 432/648, d = 36/648, h = 1
        const stand_in = {} as WebGLTexture
        const expected = build_faces(432 / 648, 1, 36 / 648, stand_in, stand_in, stand_in,
            'paperback', stand_in, 648 * 25.4 / 72)
        const uploads = gl.calls_to('bufferData')
        expect(uploads).toHaveLength(expected.length * 2)
        expected.forEach((face, i) => {
            expect(uploads[i * 2][0]).toBe(GL.ARRAY_BUFFER)
            expect(uploads[i * 2][1]).toEqual(new Float32Array(face.vertices))
            expect(uploads[i * 2 + 1][0]).toBe(GL.ELEMENT_ARRAY_BUFFER)
            expect(uploads[i * 2 + 1][1]).toEqual(new Uint16Array(face.indices))
        })
    })

    it('frees the previous cover\'s textures and buffers on reload', async () => {
        const {renderer, gl} = await loaded()
        const first_textures = gl.calls_to('createTexture').length
        const first_buffers = gl.calls_to('createBuffer').length
        await renderer.load(FACES)
        expect(gl.calls_to('deleteTexture')).toHaveLength(first_textures)
        expect(gl.calls_to('deleteBuffer')).toHaveLength(first_buffers)
    })

    it('derives depth from the spine panel\'s width', async () => {
        const {renderer} = await loaded()
        expect(renderer.get_projected_aspect()).toBeCloseTo(projected_aspect(432 / 648, 36 / 648))
    })

    it('derives depth from depth_mm when there is no spine panel', async () => {
        // 648pt tall = 228.6mm, so a 22.86mm-thick book is 0.1 deep in normalised units
        const {renderer} = await loaded(NO_SPINE, 'paperback_wire', 22.86)
        expect(renderer.get_projected_aspect()).toBeCloseTo(projected_aspect(432 / 648, 0.1))
    })

    it('makes a spine-less book with no depth_mm flat, as saddle stitch is', async () => {
        const {renderer} = await loaded(NO_SPINE, 'paperback_stitch')
        expect(renderer.get_projected_aspect()).toBeCloseTo(projected_aspect(432 / 648, 0))
    })

    it('propagates an SVG with no parseable size', async () => {
        const renderer = new Book3DRenderer()
        await expect(renderer.load({front: '<svg>', back: '<svg>'}))
            .rejects.toThrow(/Could not parse SVG dimensions/)
    })
})


describe('render', () => {

    it('does nothing before load', () => {
        const renderer = new Book3DRenderer()
        renderer.render()
        expect((renderer.canvas as unknown as FakeOffscreenCanvas).gl).toBeNull()
    })

    it('clears to transparent and draws every face once', async () => {
        const {renderer, gl} = await loaded()
        const faces = gl.calls_to('bufferData').length / 2
        gl.calls.length = 0
        renderer.render()
        expect(gl.calls_to('viewport')).toEqual([[0, 0, 800, 600]])
        expect(gl.calls_to('clearColor')).toEqual([[0, 0, 0, 0]])
        expect(gl.calls_to('enable')).toEqual([[GL.DEPTH_TEST]])
        expect(gl.calls_to('drawElements')).toHaveLength(faces)
    })

    it('draws each face\'s full index list as triangles', async () => {
        const {renderer, gl} = await loaded()
        const index_counts = gl.calls_to('bufferData')
            .filter(args => args[0] === GL.ELEMENT_ARRAY_BUFFER)
            .map(args => (args[1] as Uint16Array).length)
        renderer.render()
        expect(gl.calls_to('drawElements')).toEqual(
            index_counts.map(count => [GL.TRIANGLES, count, GL.UNSIGNED_SHORT, 0]))
    })

    it('interleaves position, uv and normal in an 8-float stride', async () => {
        const {renderer, gl} = await loaded()
        renderer.render()
        // Attribute locations are 0/1/2 for a_pos/a_uv/a_normal, in _init_gl's lookup order
        const pointers = gl.calls_to('vertexAttribPointer').slice(0, 3)
        expect(pointers).toEqual([
            [0, 3, GL.FLOAT, false, 32, 0],
            [1, 2, GL.FLOAT, false, 32, 12],
            [2, 3, GL.FLOAT, false, 32, 20],
        ])
    })

    it('textures the cover faces and colours the rest', async () => {
        // A coil binding has untextured faces (the coil itself) beside the textured covers
        const {renderer, gl} = await loaded(NO_SPINE, 'paperback_coil', 10)
        renderer.render()
        const use_tex = gl.calls.filter(call => call.name === 'uniform1i'
            && (call.args[0] as {uniform:string}).uniform === 'u_use_tex').map(call => call.args[1])
        expect(use_tex).toContain(1)
        expect(use_tex).toContain(0)
        // Textured faces bind a texture on unit 0
        expect(gl.calls_to('activeTexture').every(args => args[0] === GL.TEXTURE0)).toBe(true)
    })

    it('uploads the projection x view matrix for the given camera angles', async () => {
        const {renderer, gl} = await loaded()
        renderer.render(0, 0, 1)
        // Straight on from the front at distance 3 x book height
        const view = mat4_look_at([0, 0, 3], [0, 0, 0])
        const mvp = mat4_mul(mat4_perspective(40, 800 / 600, 0.01, 100), mat4_mul(view, mat4_identity()))
        expect(gl.uniform('u_mvp')).toEqual(mvp)
        expect(gl.uniform('u_cam_z')).toBeCloseTo(-3)
    })

    it('moves the camera back with zoom', async () => {
        const {renderer, gl} = await loaded()
        renderer.render(-30, 20, 2)
        expect(gl.uniform('u_cam_z')).toBeCloseTo(-6)
    })

    it('rolls the book clockwise by the given degrees', async () => {
        const {renderer, gl} = await loaded()
        renderer.render(0, 0, 1, 15)
        const view = mat4_look_at([0, 0, 3], [0, 0, 0])
        expect(gl.uniform('u_mv')).toEqual(mat4_mul(view, mat4_rotate_z(-15)))
    })

    it('passes a unit light direction from azimuth/elevation', async () => {
        const {renderer, gl} = await loaded()
        // Light from straight above
        renderer.render(-30, 20, 1, 0, 0, 90)
        const dir = gl.uniform('u_light_dir') as number[]
        expect(dir[0]).toBeCloseTo(0)
        expect(dir[1]).toBeCloseTo(1)
        expect(dir[2]).toBeCloseTo(0)
        // From the right, level
        renderer.render(-30, 20, 1, 0, 90, 0)
        const right = gl.uniform('u_light_dir') as number[]
        expect(right[0]).toBeCloseTo(1)
        expect(Math.hypot(...right)).toBeCloseTo(1)
    })

    it('defaults lighting to the shared constants', async () => {
        const {renderer, gl} = await loaded()
        renderer.render()
        expect(gl.uniform('u_ambient')).toBe(DEFAULT_AMBIENT)
        expect(gl.uniform('u_exposure')).toBe(1)
        const az = DEFAULT_LIGHT_AZ * Math.PI / 180
        const el = DEFAULT_LIGHT_EL * Math.PI / 180
        const dir = gl.uniform('u_light_dir') as number[]
        expect(dir[0]).toBeCloseTo(Math.sin(az) * Math.cos(el))
        expect(dir[1]).toBeCloseTo(Math.sin(el))
    })

    it('follows the canvas aspect after a resize', async () => {
        const {renderer, gl} = await loaded()
        renderer.resize(400, 400)
        renderer.render(0, 0, 1)
        const view = mat4_look_at([0, 0, 3], [0, 0, 0])
        expect(gl.uniform('u_mvp')).toEqual(mat4_mul(mat4_perspective(40, 1, 0.01, 100),
            mat4_mul(view, mat4_identity())))
        expect(gl.calls_to('viewport').at(-1)).toEqual([0, 0, 400, 400])
    })
})


describe('to_png and snapshot', () => {

    it('encodes an OffscreenCanvas with convertToBlob', async () => {
        const renderer = new Book3DRenderer(64, 32)
        const png = await renderer.to_png()
        expect(new TextDecoder().decode(png)).toBe('image/png:64x32')
    })

    /** A renderer on a DOM canvas whose toBlob yields `blob` */
    function dom_renderer(blob:Blob | null):Book3DRenderer {
        FakeOffscreenCanvas.webgl_factory = () => null
        vi.stubGlobal('document', {createElement: () => ({
            style: {},
            toBlob: (callback:(b:Blob | null) => void) => callback(blob),
        })})
        return new Book3DRenderer()
    }

    it('encodes a DOM canvas with toBlob', async () => {
        const png = await dom_renderer(new Blob(['dom-png'])).to_png()
        expect(new TextDecoder().decode(png)).toBe('dom-png')
    })

    it('rejects when a DOM canvas cannot be encoded', async () => {
        await expect(dom_renderer(null).to_png()).rejects.toThrow('toBlob failed')
    })

    it('snapshots the canvas as a bitmap', async () => {
        const renderer = new Book3DRenderer()
        const bitmap = await renderer.snapshot() as unknown as FakeBitmap
        expect(bitmap.source).toBe(renderer.canvas)
    })
})


describe('composite_photo', () => {

    // A 3000x2000 background photo
    const BACKGROUND = {width: 3000, height: 2000} as unknown as ImageBitmap

    /** Run a composite and return the composite canvas' 2D context */
    async function composite(renderer:Book3DRenderer,
        options:Parameters<Book3DRenderer['composite_photo']>[1] = {}):Promise<FakeContext2D> {
        await renderer.composite_photo(BACKGROUND, options)
        const comp = FakeOffscreenCanvas.instances.find(c => c.width === 3000 && c.height === 2000)
        if (!comp?.ctx2d)
            throw new Error('no composite canvas')
        return comp.ctx2d
    }

    /** Where the book lands on the 3000x2000 background, per composite_photo's scaling rule */
    function book_rect(book_scale:number, offset_x = 0, offset_y = 0):number[] {
        // The book is rendered at 2048x2048; 648pt is the reference height, so a 648pt book
        // spans book_scale of the background's width
        const scale = 3000 * book_scale * (648 / 648) / 2048
        const size = 2048 * scale
        return [(3000 - size) / 2 + offset_x * 3000, (2000 - size) / 2 + offset_y * 2000, size, size]
    }

    it('renders at a fixed 2048px square, then restores the interactive canvas size', async () => {
        const {renderer, gl} = await loaded()
        await composite(renderer)
        expect(gl.calls_to('viewport').at(-1)).toEqual([0, 0, 2048, 2048])
        expect([renderer.canvas.width, renderer.canvas.height]).toEqual([800, 600])
    })

    it('renders from the photo camera with ambient dimmed to 70%', async () => {
        const {renderer, gl} = await loaded()
        await composite(renderer)
        expect(gl.uniform('u_ambient')).toBeCloseTo(DEFAULT_AMBIENT * 0.7)
        const az = PHOTO_AZIMUTH * Math.PI / 180
        const el = PHOTO_ELEVATION * Math.PI / 180
        const view = mat4_look_at([3 * Math.sin(az) * Math.cos(el), 3 * Math.sin(el),
            3 * Math.cos(az) * Math.cos(el)], [0, 0, 0])
        expect(gl.uniform('u_mv')).toEqual(mat4_mul(view, mat4_identity()))
    })

    it('draws the background first, at its native size', async () => {
        const {renderer} = await loaded()
        const ctx = await composite(renderer)
        expect(ctx.draws[0]).toMatchObject({source: BACKGROUND, args: [0, 0]})
    })

    it('centres the book at the default photo scale', async () => {
        const {renderer} = await loaded()
        const ctx = await composite(renderer)
        // Shadow pass, blurred book, then the sharp centre mask — the book draws are the middle two
        expect(ctx.draws[2].args).toEqual(book_rect(PHOTO_BOOK_SCALE))
        expect(ctx.draws[1].args).toEqual(book_rect(PHOTO_BOOK_SCALE))
    })

    it('offsets the book by fractions of the background', async () => {
        const {renderer} = await loaded()
        const ctx = await composite(renderer, {book_scale: 0.4, offset_x: 0.1, offset_y: -0.05})
        expect(ctx.draws[2].args).toEqual(book_rect(0.4, 0.1, -0.05))
    })

    it('scales the book with its physical height against a 9in reference', async () => {
        // A 4.5in-tall book takes half the space of a 9in one at the same book_scale
        const {renderer} = await loaded({
            front: '<svg width="216" height="324"></svg>', back: '<svg width="216" height="324"></svg>'})
        const ctx = await composite(renderer, {book_scale: 0.5})
        const [, , bw] = ctx.draws[2].args
        expect(bw).toBeCloseTo(book_rect(0.5)[2] / 2)
    })

    it('casts a shadow away from the light, then clears it for the book itself', async () => {
        const {renderer} = await loaded()
        // Light from the camera's right, so the shadow falls to the left (negative x)
        const ctx = await composite(renderer, {azimuth: 0, light_az: 90, ambient: 0.5})
        const [shadow, book] = [ctx.draws[1], ctx.draws[2]]
        expect(shadow.shadow_offset[0]).toBeLessThan(0)
        expect(shadow.shadow_color).toBe('rgba(0,0,0,0.30)')
        expect(book.shadow_color).toBe('transparent')
        expect(ctx.filter).toBe('none')
    })

    it('keeps the shadow at least faintly visible in a very bright scene', async () => {
        const {renderer} = await loaded()
        // 0.45 - 1.5 * 0.3 would be no shadow at all; it floors at 0.1
        const ctx = await composite(renderer, {ambient: 1.5})
        expect(ctx.draws[1].shadow_color).toBe('rgba(0,0,0,0.10)')
    })

    it('fades the shadow mask from clear at the top to solid at the base', async () => {
        const {renderer} = await loaded()
        await composite(renderer)
        const mask = FakeOffscreenCanvas.instances.find(c => c.width === 2048 && c.height === 2048
            && c.ctx2d)
        expect(mask?.ctx2d?.gradients[0]).toMatchObject({kind: 'linear', args: [0, 0, 0, 2048],
            stops: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]})
        expect(mask?.ctx2d?.fills[0].composite).toBe('destination-in')
    })

    it('closes the book render and returns a bitmap of the composite', async () => {
        const {renderer} = await loaded()
        const result = await renderer.composite_photo(BACKGROUND) as unknown as FakeBitmap
        const comp = FakeOffscreenCanvas.instances.find(c => c.width === 3000 && c.height === 2000)
        expect(result.source).toBe(comp)
        // The snapshot of the 2048px render is the first bitmap made from the renderer's canvas
        const book_bmp = create_image_bitmap.mock.settledResults
            .map(r => r.value as unknown as FakeBitmap)
            .find(b => b.source === renderer.canvas)
        expect(book_bmp?.close).toHaveBeenCalled()
    })
})


describe('destroy', () => {

    it('frees every texture, buffer and the program', async () => {
        const {renderer, gl} = await loaded()
        const textures = gl.calls_to('createTexture').map(args => args)
        renderer.destroy()
        expect(gl.calls_to('deleteTexture')).toHaveLength(textures.length)
        expect(gl.calls_to('deleteBuffer')).toHaveLength(gl.calls_to('createBuffer').length)
        const program = gl.calls_to('linkProgram')[0][0] as FakeGlObject
        expect(gl.calls_to('deleteProgram')).toEqual([[program]])
    })

    it('is a no-op before first use, and safe to call twice', async () => {
        const renderer = new Book3DRenderer()
        renderer.destroy()
        const {renderer: used, gl} = await loaded()
        used.destroy()
        used.destroy()
        expect(gl.calls_to('deleteProgram')).toHaveLength(1)
    })

    it('stops render() drawing anything', async () => {
        const {renderer, gl} = await loaded()
        renderer.destroy()
        gl.calls.length = 0
        renderer.render()
        expect(gl.calls).toEqual([])
    })
})


describe('generate', () => {

    it('renders once at the given size and returns PNG bytes', async () => {
        const png = await generate(FACES, {width: 300, height: 200})
        expect(new TextDecoder().decode(png)).toBe('image/png:300x200')
    })

    it('uses the given camera angles', async () => {
        await generate(FACES, {azimuth: 0, elevation: 0})
        const canvas = FakeOffscreenCanvas.instances.find(c => c.gl && c.width === 800)
        expect(canvas?.gl?.uniform('u_mv')).toEqual(
            mat4_mul(mat4_look_at([0, 0, 3], [0, 0, 0]), mat4_identity()))
    })

    it('frees GPU resources even when loading fails', async () => {
        // A face that fails to rasterise propagates, but destroy() still runs
        FakeImage.fail_next = true
        await expect(generate(FACES)).rejects.toThrow(/failed to load/)
        const canvas = FakeOffscreenCanvas.instances.filter(c => c.gl && c.width === 800).at(-1)
        expect(canvas?.gl?.calls_to('deleteProgram')).toHaveLength(1)
    })
})
