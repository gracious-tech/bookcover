
// Shader program setup and texture uploads, against a recording fake context (see fake_gl.ts).
// GLSL itself can't compile under Node, so the shader sources are checked only for agreeing with
// each other and with the names index.ts looks up

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'

import {VERT_SRC, FRAG_SRC, compile_shader, build_program, create_page_edge_texture,
    upload_texture} from '../src/webgl.js'
import {FakeGl, FakeOffscreenCanvas} from './fake_gl.js'
import type {FakeBitmap} from './fake_gl.js'

const GL = FakeGl.constants

/** Names declared with the given qualifier in a GLSL source, e.g. every `uniform` */
function declared(src:string, qualifier:string):string[] {
    const re = new RegExp(`^\\s*${qualifier}\\s+\\w+\\s+(\\w+);`, 'gm')
    return [...src.matchAll(re)].map(match => match[1])
}

let gl:FakeGl

beforeEach(() => {
    gl = new FakeGl()
    FakeOffscreenCanvas.instances.length = 0
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
})

afterEach(() => {
    vi.unstubAllGlobals()
})


describe('shader sources', () => {

    it('pass every vertex shader varying on to a matching fragment shader varying', () => {
        expect(declared(VERT_SRC, 'varying').sort()).toEqual(declared(FRAG_SRC, 'varying').sort())
    })

    it('declare every attribute and uniform the renderer looks up', () => {
        // The names Book3DRenderer._init_gl() passes to getAttribLocation/getUniformLocation
        expect(declared(VERT_SRC, 'attribute').sort()).toEqual(['a_normal', 'a_pos', 'a_uv'])
        const uniforms = [...declared(VERT_SRC, 'uniform'), ...declared(FRAG_SRC, 'uniform')]
        expect(uniforms.sort()).toEqual(['u_ambient', 'u_cam_z', 'u_color', 'u_exposure',
            'u_light_dir', 'u_mv', 'u_mvp', 'u_norm_mat', 'u_tex', 'u_use_tex'])
    })

    it('set a float precision in the fragment shader, which WebGL 1 requires', () => {
        expect(FRAG_SRC).toMatch(/precision\s+\w+p\s+float;/)
    })
})


describe('compile_shader', () => {

    it('compiles the given source as the given stage', () => {
        const shader = compile_shader(gl.as_context(), GL.VERTEX_SHADER, VERT_SRC)
        expect(gl.calls_to('createShader')).toEqual([[GL.VERTEX_SHADER]])
        expect(gl.calls_to('shaderSource')).toEqual([[shader, VERT_SRC]])
        expect(gl.calls_to('compileShader')).toEqual([[shader]])
    })

    it('throws with the driver\'s info log when compilation fails', () => {
        gl.compile_ok = false
        expect(() => compile_shader(gl.as_context(), GL.FRAGMENT_SHADER, 'nonsense'))
            .toThrow('[cover-3d] Shader compile error: ERROR: 0:1: syntax error')
    })
})


describe('build_program', () => {

    it('attaches a vertex and a fragment shader, then links', () => {
        const prog = build_program(gl.as_context(), VERT_SRC, FRAG_SRC)
        const stages = gl.calls_to('createShader').map(args => args[0])
        expect(stages).toEqual([GL.VERTEX_SHADER, GL.FRAGMENT_SHADER])
        expect(gl.calls_to('attachShader')).toHaveLength(2)
        expect(gl.calls_to('linkProgram')).toEqual([[prog]])
    })

    it('throws with the program info log when linking fails', () => {
        gl.link_ok = false
        expect(() => build_program(gl.as_context(), VERT_SRC, FRAG_SRC))
            .toThrow('[cover-3d] Program link error: ERROR: varying mismatch')
    })

    it('fails before linking when a stage does not compile', () => {
        gl.compile_ok = false
        expect(() => build_program(gl.as_context(), VERT_SRC, FRAG_SRC)).toThrow(/compile error/)
        expect(gl.calls_to('linkProgram')).toHaveLength(0)
    })
})


describe('upload_texture', () => {

    it('uploads the bitmap flipped, without mipmaps (cover faces are rarely power-of-two)', () => {
        const bitmap = {width: 300, height: 450} as unknown as ImageBitmap
        const tex = upload_texture(gl.as_context(), bitmap)
        expect(gl.calls_to('bindTexture')).toEqual([[GL.TEXTURE_2D, tex]])
        expect(gl.calls_to('texImage2D')).toEqual([
            [GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, bitmap]])
        expect(gl.calls_to('generateMipmap')).toHaveLength(0)
        expect(gl.calls_to('texParameteri')).toContainEqual(
            [GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR])
    })

    it('clamps at the edges and restores the unpack flip afterwards', () => {
        upload_texture(gl.as_context(), {} as ImageBitmap)
        const params = gl.calls_to('texParameteri')
        expect(params).toContainEqual([GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE])
        expect(params).toContainEqual([GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE])
        expect(gl.calls_to('pixelStorei')).toEqual([
            [GL.UNPACK_FLIP_Y_WEBGL, true], [GL.UNPACK_FLIP_Y_WEBGL, false]])
    })
})


describe('create_page_edge_texture', () => {

    /** The separator-line rectangles drawn on the page-edge canvas */
    function separators():number[][] {
        const ctx = FakeOffscreenCanvas.instances[0].ctx2d
        return (ctx?.fills ?? []).filter(fill => fill.style === '#847C6E').map(fill => fill.rect)
    }

    it('draws on a 4x256 power-of-two canvas, so it can be mipmapped', () => {
        create_page_edge_texture(gl.as_context(), 0.05)
        const canvas = FakeOffscreenCanvas.instances[0]
        expect([canvas.width, canvas.height]).toEqual([4, 256])
        expect(gl.calls_to('generateMipmap')).toEqual([[GL.TEXTURE_2D]])
        expect(gl.calls_to('texParameteri')).toContainEqual(
            [GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR_MIPMAP_LINEAR])
    })

    it('pre-fills the whole canvas with the page cream', () => {
        create_page_edge_texture(gl.as_context(), 0.05)
        const first = FakeOffscreenCanvas.instances[0].ctx2d?.fills[0]
        expect(first).toMatchObject({style: '#EDE5D4', rect: [0, 0, 4, 256]})
    })

    it('scales the page count with spine thickness', () => {
        // 0.05 * 600 = 30 stripes at floor(256 / 30) = 8px each, which fits 32 in 256px
        create_page_edge_texture(gl.as_context(), 0.05)
        const lines = separators()
        expect(lines).toHaveLength(32)
        // Each 2px separator sits at the bottom of its 8px stripe
        expect(lines[0]).toEqual([0, 6, 4, 2])
        expect(lines[1]).toEqual([0, 14, 4, 2])
    })

    it('keeps at least six pages on a very thin spine', () => {
        // round(0.001 * 600) = 1, raised to 6 stripes of floor(256 / 6) = 42px; 6 fit
        create_page_edge_texture(gl.as_context(), 0.001)
        expect(separators()).toHaveLength(6)
    })

    it('never packs a stripe below 3px on a very thick spine', () => {
        // 2 * 600 = 1200 stripes would be a fraction of a pixel each; 3px gives floor(256 / 3) = 85
        create_page_edge_texture(gl.as_context(), 2)
        const lines = separators()
        expect(lines).toHaveLength(85)
        expect(lines.every(([, y]) => y + 2 <= 256)).toBe(true)
    })

    it('uploads and then closes its bitmap', () => {
        create_page_edge_texture(gl.as_context(), 0.05)
        const uploaded = gl.calls_to('texImage2D')[0][5] as FakeBitmap
        expect(uploaded.source).toBe(FakeOffscreenCanvas.instances[0])
        expect(uploaded.close).toHaveBeenCalled()
    })
})
