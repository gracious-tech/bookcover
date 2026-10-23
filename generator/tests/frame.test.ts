// frame_image() draws through the Canvas API, which Node lacks — so these stub a recording 2D
// context, OffscreenCanvas/document and createImageBitmap, and check what gets drawn where.

import {describe, it, expect, vi, afterEach} from 'vitest'

import {frame_image, frame_asset_path, FRAME_FILES} from '../src/frame.js'

/** One recorded canvas call, with the composite op in force when it was made */
interface DrawCall {
    op:string
    args:unknown[]
    composite:string
}

/** A 2D context that records every call made on it */
class FakeContext {
    calls:DrawCall[] = []
    fillStyle = ''
    globalCompositeOperation = 'source-over'

    // Record a call by name alongside the current composite op
    private record(op:string, args:unknown[]):void {
        this.calls.push({op, args, composite: this.globalCompositeOperation})
    }

    fillRect(...args:unknown[]):void { this.record('fillRect', [this.fillStyle, ...args]) }
    drawImage(...args:unknown[]):void { this.record('drawImage', args) }
    save():void { this.record('save', []) }
    restore():void { this.record('restore', []) }
    translate(...args:unknown[]):void { this.record('translate', args) }
    rotate(...args:unknown[]):void { this.record('rotate', args) }
    scale(...args:unknown[]):void { this.record('scale', args) }

    /** Calls of one kind, in order */
    of(op:string):DrawCall[] {
        return this.calls.filter(call => call.op === op)
    }
}

/** A decoded bitmap stand-in that remembers whether it was closed */
class FakeBitmap {
    closed = false
    constructor(public width:number, public height:number) {}
    close():void { this.closed = true }
}

// Every context and bitmap the stubs hand out during a test
let contexts:FakeContext[] = []
let bitmaps:FakeBitmap[] = []

/** Stub a worker-like environment: OffscreenCanvas plus createImageBitmap, which decodes each
 *  Blob into a bitmap of the size its text says ("WxH") */
function stub_worker_canvas():void {
    vi.stubGlobal('OffscreenCanvas', class {
        constructor(public width:number, public height:number) {}
        getContext() {
            const ctx = new FakeContext()
            contexts.push(ctx)
            return ctx
        }
        async convertToBlob(options:{type:string}) {
            return new Blob([`${this.width}x${this.height}`], options)
        }
    })
    vi.stubGlobal('createImageBitmap', async (blob:Blob) => {
        const [w, h] = (await blob.text()).split('x').map(Number)
        const bitmap = new FakeBitmap(w, h)
        bitmaps.push(bitmap)
        return bitmap
    })
}

/** A Blob that the stubbed createImageBitmap decodes to the given size */
function sized(width:number, height:number):Blob {
    return new Blob([`${width}x${height}`])
}

afterEach(() => {
    vi.unstubAllGlobals()
    contexts = []
    bitmaps = []
})


describe('frame_asset_path', () => {

    it('joins the frames directory and the frame\'s file onto any base', () => {
        expect(frame_asset_path('https://assets.example/', 'torn'))
            .toBe('https://assets.example/frames/torn.png')
        expect(frame_asset_path('/srv/assets', 'painted')).toBe('/srv/assets/frames/painted.png')
        expect(Object.keys(FRAME_FILES).sort()).toEqual(['painted', 'torn'])
    })
})


describe('frame_image', () => {

    it('fills the background, then draws the image cropped to cover the canvas', async () => {
        stub_worker_canvas()
        // A 2:1 image into a square canvas keeps its full height and crops the sides evenly
        await frame_image(sized(200, 100), sized(100, 100), '#abcdef', 100, 100)
        const [ctx] = contexts
        expect(ctx.of('fillRect')).toEqual([
            {op: 'fillRect', args: ['#abcdef', 0, 0, 100, 100], composite: 'source-over'}])
        expect(ctx.of('drawImage')[0].args.slice(1)).toEqual([50, 0, 100, 100, 0, 0, 100, 100])
        // The fill comes before any drawing
        expect(ctx.calls[0].op).toBe('fillRect')
    })

    it('erases the image under the frame with destination-out, then restores state', async () => {
        stub_worker_canvas()
        await frame_image(sized(100, 150), sized(100, 150), '#fff', 100, 150)
        const [ctx] = contexts
        const [image_draw, frame_draw] = ctx.of('drawImage')
        expect(image_draw.composite).toBe('source-over')
        expect(frame_draw.composite).toBe('destination-out')
        const ops = ctx.calls.map(call => call.op)
        expect(ops.indexOf('save')).toBeLessThan(ops.lastIndexOf('drawImage'))
        expect(ops.at(-1)).toBe('restore')
    })

    it('keeps a frame unrotated when it matches the canvas orientation', async () => {
        stub_worker_canvas()
        await frame_image(sized(100, 150), sized(100, 200), '#fff', 100, 150)
        const [ctx] = contexts
        expect(ctx.of('translate')[0].args).toEqual([50, 75])
        expect(ctx.of('rotate')[0].args).toEqual([0])
        // Both flips are on while randomness is disabled
        expect(ctx.of('scale')[0].args).toEqual([-1, -1])
        expect(ctx.of('drawImage')[1].args.slice(1)).toEqual([-50, -75, 100, 150])
    })

    it('turns a frame a quarter-turn and swaps its draw size when orientations differ',
        async () => {
            stub_worker_canvas()
            // Landscape frame onto a portrait canvas
            await frame_image(sized(100, 150), sized(200, 100), '#fff', 100, 150)
            const [ctx] = contexts
            expect(ctx.of('rotate')[0].args).toEqual([Math.PI / 2])
            expect(ctx.of('drawImage')[1].args.slice(1)).toEqual([-75, -50, 150, 100])
        })

    it('closes both decoded bitmaps and exports a PNG of the canvas size', async () => {
        stub_worker_canvas()
        const out = await frame_image(sized(10, 10), sized(10, 10), '#fff', 30, 20)
        expect(bitmaps).toHaveLength(2)
        expect(bitmaps.every(bitmap => bitmap.closed)).toBe(true)
        expect(out.type).toBe('image/png')
        expect(await out.text()).toBe('30x20')
    })

    it('uses a DOM canvas on the main thread, exporting through toBlob', async () => {
        stub_worker_canvas()
        // With a document present, the canvas comes from createElement instead
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => {
                const ctx = new FakeContext()
                contexts.push(ctx)
                return ctx
            },
            toBlob: (callback:(blob:Blob | null) => void, type:string) =>
                callback(new Blob(['dom'], {type})),
        }
        const create_element = vi.fn(() => canvas)
        vi.stubGlobal('document', {createElement: create_element})
        const out = await frame_image(sized(10, 10), sized(10, 10), '#fff', 40, 30)
        expect(create_element).toHaveBeenCalledWith('canvas')
        expect([canvas.width, canvas.height]).toEqual([40, 30])
        expect(out.type).toBe('image/png')
        expect(await out.text()).toBe('dom')
    })

    it('rejects when a DOM canvas fails to export', async () => {
        stub_worker_canvas()
        vi.stubGlobal('document', {createElement: () => ({
            getContext: () => new FakeContext(),
            toBlob: (callback:(blob:Blob | null) => void) => callback(null),
        })})
        await expect(frame_image(sized(10, 10), sized(10, 10), '#fff', 10, 10))
            .rejects.toThrow('canvas.toBlob returned null')
    })
})
