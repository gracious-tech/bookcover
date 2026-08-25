
// 3D book renderer — public API

export type {BookFaces, CoverType, GenerateOptions, Background, PhotoCompositeOptions} from './types.js'
export {BACKGROUNDS} from './photo.js'
import type {BookFaces, CoverType, GenerateOptions, PhotoCompositeOptions} from './types.js'
import {PHOTO_AZIMUTH, PHOTO_ELEVATION, PHOTO_BOOK_SCALE} from './photo.js'
import type {FaceData} from './geometry.js'

import {mat4_perspective, mat4_look_at, mat4_mul, mat4_identity, mat4_rotate_z, normal_matrix} from './math.js'
import {parse_svg_size, svg_to_bitmap} from './svg.js'
import {VERT_SRC, FRAG_SRC, DEFAULT_LIGHT_AZ, DEFAULT_LIGHT_EL, DEFAULT_AMBIENT, build_program, upload_texture, create_page_edge_texture} from './webgl.js'
import {build_faces} from './geometry.js'

// -- Defaults --

const DEFAULT_AZIMUTH   = -30
const DEFAULT_ELEVATION = 20
const DEFAULT_WIDTH     = 800
const DEFAULT_HEIGHT    = 600

// Camera projection constants — shared between render() and shadow projection in composite_photo()
const RENDER_FOV         = 40   // field of view in degrees
const RENDER_DIST_FACTOR = 3    // camera distance = RENDER_DIST_FACTOR * book_height * zoom

// -- Internal types --

interface GlState {
    gl:WebGLRenderingContext
    prog:WebGLProgram
    // Attribute locations
    a_pos:number
    a_uv:number
    a_normal:number
    // Uniform locations
    u_mvp:WebGLUniformLocation
    u_mv:WebGLUniformLocation
    u_norm_mat:WebGLUniformLocation
    u_light_dir:WebGLUniformLocation
    u_ambient:WebGLUniformLocation
    u_exposure:WebGLUniformLocation
    u_tex:WebGLUniformLocation
    u_use_tex:WebGLUniformLocation
    u_color:WebGLUniformLocation
    u_cam_z:WebGLUniformLocation
}

/** Convert light azimuth/elevation degrees to a normalised world-space direction vector.
 *  Convention matches camera spherical coords: az=0 = from front, el=0 = horizontal. */
function light_dir_vec3(az_deg:number, el_deg:number):[number, number, number] {
    const az = az_deg * Math.PI / 180
    const el = el_deg * Math.PI / 180
    const x = Math.sin(az) * Math.cos(el)
    const y = Math.sin(el)
    const z = Math.cos(az) * Math.cos(el)
    const len = Math.sqrt(x * x + y * y + z * z)
    return [x / len, y / len, z / len]
}

interface LoadedFace {
    vbo:WebGLBuffer
    ibo:WebGLBuffer
    tex:WebGLTexture | null
    color:[number,number,number]
    index_count:number
}

// -- Renderer --

/** Persistent WebGL book renderer. Create once, call load() when covers change, render() cheaply. */
export class Book3DRenderer {

    readonly canvas:OffscreenCanvas | HTMLCanvasElement
    private _gl_state:GlState | null = null
    private _faces:LoadedFace[] = []
    private _w = 1
    private _h = 1
    private _d = 0.1
    // Physical cover height in pt (Typst SVG output), used for photo composite scaling
    private _cover_height = 1
    private _textures:WebGLTexture[] = []
    private _page_tex:WebGLTexture | null = null

    // Prefer OffscreenCanvas for performance; fall back to DOM canvas for WebGL compatibility
    constructor(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
        const offscreen = Book3DRenderer._try_offscreen_webgl(width, height)
        if (offscreen) {
            this.canvas = offscreen
        } else {
            const el = document.createElement('canvas')
            el.width = width
            el.height = height
            el.style.display = 'none'
            this.canvas = el
        }
    }

    /** Resize the render canvas without recreating the WebGL context or re-uploading textures */
    resize(width:number, height:number):void {
        this.canvas.width = width
        this.canvas.height = height
    }

    /** Projected aspect ratio (width/height) of the book at the default viewing angle */
    get_projected_aspect():number {
        const az_rad = Math.abs(DEFAULT_AZIMUTH) * Math.PI / 180
        const el_rad = Math.abs(DEFAULT_ELEVATION) * Math.PI / 180
        const proj_w = this._w * Math.cos(az_rad) + this._d * Math.sin(az_rad)
        const proj_h = this._h * Math.cos(el_rad)
        return proj_w / proj_h
    }

    // Test whether OffscreenCanvas supports WebGL in this browser
    private static _try_offscreen_webgl(w:number, h:number):OffscreenCanvas | null {
        try {
            const test = new OffscreenCanvas(1, 1)
            const gl = test.getContext('webgl', {alpha: true, premultipliedAlpha: false, antialias: true})
            if (!gl)
                return null
            gl.getExtension('WEBGL_lose_context')?.loseContext()
            return new OffscreenCanvas(w, h)
        } catch { /* OffscreenCanvas not supported */ }
        return null
    }

    /** Initialise WebGL on first use */
    private _init_gl():GlState {
        if (this._gl_state)
            return this._gl_state

        const gl = this.canvas.getContext('webgl', {
            alpha: true, premultipliedAlpha: false, antialias: true,
        }) as WebGLRenderingContext | null
        if (!gl)
            throw new Error('[cover-3d] WebGL not available in this environment')

        const prog = build_program(gl, VERT_SRC, FRAG_SRC)

        this._gl_state = {
            gl, prog,
            a_pos:    gl.getAttribLocation(prog, 'a_pos'),
            a_uv:     gl.getAttribLocation(prog, 'a_uv'),
            a_normal: gl.getAttribLocation(prog, 'a_normal'),
            u_mvp:       gl.getUniformLocation(prog, 'u_mvp')!,
            u_mv:        gl.getUniformLocation(prog, 'u_mv')!,
            u_norm_mat:  gl.getUniformLocation(prog, 'u_norm_mat')!,
            u_light_dir: gl.getUniformLocation(prog, 'u_light_dir')!,
            u_ambient:   gl.getUniformLocation(prog, 'u_ambient')!,
            u_exposure:  gl.getUniformLocation(prog, 'u_exposure')!,
            u_tex:       gl.getUniformLocation(prog, 'u_tex')!,
            u_use_tex:  gl.getUniformLocation(prog, 'u_use_tex')!,
            u_color:    gl.getUniformLocation(prog, 'u_color')!,
            u_cam_z:    gl.getUniformLocation(prog, 'u_cam_z')!,
        }
        return this._gl_state
    }

    /** Load new cover SVGs and re-upload geometry / textures.
     *  depth_mm: book thickness in mm, used when no spine SVG is present (e.g. coil/wire bindings).
     *  Pass 0 for bindings where the cover faces meet (e.g. saddle stitch). */
    async load(svgs:BookFaces, cover_type:CoverType = 'paperback', depth_mm?:number):Promise<void> {
        const {gl} = this._init_gl()

        // Free previous GPU resources
        if (this._page_tex) {
            gl.deleteTexture(this._page_tex)
            this._page_tex = null
        }
        for (const t of this._textures)
            gl.deleteTexture(t)
        this._textures = []
        for (const f of this._faces) {
            gl.deleteBuffer(f.vbo)
            gl.deleteBuffer(f.ibo)
        }
        this._faces = []

        // Parse SVG dimensions to derive normalised 3D aspect ratios
        const front_size = parse_svg_size(svgs.front)
        this._cover_height = front_size.height
        this._h = 1.0
        this._w = front_size.width / front_size.height
        const spine_size = svgs.spine ? parse_svg_size(svgs.spine) : null
        // No spine SVG → convert depth_mm to the same pt-ratio as spine_size.width/front_size.height
        // 1pt = 25.4/72 mm, so depth_pt = depth_mm * 72/25.4
        const PT_TO_MM = 25.4 / 72
        this._d = spine_size ? spine_size.width / front_size.height
            : (depth_mm != null ? depth_mm / (front_size.height * PT_TO_MM) : 0)
        const cover_height_mm = front_size.height * PT_TO_MM

        // Recreate page-edge texture scaled to this book's spine thickness
        this._page_tex = create_page_edge_texture(gl, this._d)

        // Rasterise each SVG face into an ImageBitmap for GPU upload (4x resolution for quality)
        const [front_bmp, back_bmp, spine_bmp] = await Promise.all([
            svg_to_bitmap(svgs.front, front_size.width * 4, front_size.height * 4),
            svg_to_bitmap(svgs.back,  front_size.width * 4, front_size.height * 4),
            spine_size
                ? svg_to_bitmap(svgs.spine!, spine_size.width * 4, spine_size.height * 4)
                : Promise.resolve(null),
        ])

        const front_tex = upload_texture(gl, front_bmp)
        const back_tex  = upload_texture(gl, back_bmp)
        const spine_tex = spine_bmp ? upload_texture(gl, spine_bmp) : null

        front_bmp.close()
        back_bmp.close()
        if (spine_bmp) spine_bmp.close()

        this._textures = [front_tex, back_tex, ...(spine_tex ? [spine_tex] : [])]

        // Build face geometry and upload vertex/index buffers
        const face_data:FaceData[] = build_faces(
            this._w, this._h, this._d,
            front_tex, back_tex, spine_tex, cover_type, this._page_tex!,
            cover_height_mm,
        )

        for (const fd of face_data) {
            const vbo = gl.createBuffer()!
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fd.vertices), gl.STATIC_DRAW)

            const ibo = gl.createBuffer()!
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(fd.indices), gl.STATIC_DRAW)

            this._faces.push({vbo, ibo, tex: fd.texture, color: fd.color, index_count: fd.indices.length})
        }
    }

    /** Render the book at the given camera angles (degrees), zoom multiplier, and clockwise roll */
    render(azimuth = DEFAULT_AZIMUTH, elevation = DEFAULT_ELEVATION, zoom = 1.0, roll = 0,
        light_az = DEFAULT_LIGHT_AZ, light_el = DEFAULT_LIGHT_EL, ambient = DEFAULT_AMBIENT,
        exposure = 1.0):void {
        if (!this._gl_state || this._faces.length === 0)
            return

        const {gl, prog,
            a_pos, a_uv, a_normal,
            u_mvp, u_mv, u_norm_mat, u_light_dir, u_ambient, u_exposure, u_tex, u_use_tex, u_color, u_cam_z} = this._gl_state

        const w = this.canvas.width
        const h = this.canvas.height

        gl.viewport(0, 0, w, h)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.enable(gl.DEPTH_TEST)
        gl.disable(gl.CULL_FACE)
        gl.useProgram(prog)

        // Camera in spherical coordinates orbiting the origin
        const az   = azimuth   * Math.PI / 180
        const el   = elevation * Math.PI / 180
        const dist = RENDER_DIST_FACTOR * this._h * zoom
        const cam:[number,number,number] = [
            dist * Math.sin(az) * Math.cos(el),
            dist * Math.sin(el),
            dist * Math.cos(az) * Math.cos(el),
        ]

        // MVP = projection × view × model (model rotates book clockwise by roll degrees)
        const proj  = mat4_perspective(RENDER_FOV, w / h, 0.01, 100)
        const view  = mat4_look_at(cam, [0, 0, 0])
        const model = roll !== 0 ? mat4_rotate_z(-roll) : mat4_identity()
        const mv    = mat4_mul(view, model)
        const mvp   = mat4_mul(proj, mv)
        const norm  = normal_matrix(mv)

        gl.uniformMatrix4fv(u_mvp, false, mvp)
        gl.uniformMatrix4fv(u_mv, false, mv)
        gl.uniformMatrix3fv(u_norm_mat, false, norm)
        gl.uniform3fv(u_light_dir, light_dir_vec3(light_az, light_el))
        gl.uniform1f(u_ambient, ambient)
        gl.uniform1f(u_exposure, exposure)
        // The world origin (book centre) maps to z = -dist in view space;
        // u_cam_z anchors the gradient so the face centre is always the midpoint.
        gl.uniform1f(u_cam_z, -dist)

        // Stride: 8 floats per vertex (xyz + uv + normal)
        const stride = 8 * 4

        for (const face of this._faces) {
            gl.bindBuffer(gl.ARRAY_BUFFER, face.vbo)
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, face.ibo)

            gl.enableVertexAttribArray(a_pos)
            gl.enableVertexAttribArray(a_uv)
            gl.enableVertexAttribArray(a_normal)

            gl.vertexAttribPointer(a_pos,    3, gl.FLOAT, false, stride, 0)
            gl.vertexAttribPointer(a_uv,     2, gl.FLOAT, false, stride, 3 * 4)
            gl.vertexAttribPointer(a_normal, 3, gl.FLOAT, false, stride, 5 * 4)

            if (face.tex) {
                gl.activeTexture(gl.TEXTURE0)
                gl.bindTexture(gl.TEXTURE_2D, face.tex)
                gl.uniform1i(u_tex, 0)
                gl.uniform1i(u_use_tex, 1)
            }
            else {
                gl.uniform1i(u_use_tex, 0)
                gl.uniform3fv(u_color, face.color)
            }

            gl.drawElements(gl.TRIANGLES, face.index_count, gl.UNSIGNED_SHORT, 0)
        }
    }

    /** Return the current frame as an ImageBitmap */
    async snapshot():Promise<ImageBitmap> {
        return createImageBitmap(this.canvas)
    }

    /** Render and return the current frame as PNG bytes */
    async to_png():Promise<Uint8Array> {
        let blob:Blob
        if (this.canvas instanceof OffscreenCanvas) {
            blob = await this.canvas.convertToBlob({type: 'image/png'})
        } else {
            blob = await new Promise<Blob>((resolve, reject) => {
                (this.canvas as HTMLCanvasElement).toBlob(
                    b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png',
                )
            })
        }
        return new Uint8Array(await blob.arrayBuffer())
    }

    /** Composite the book onto a background ImageBitmap at a flat-on-table angle.
     *  Renders at the given angles (defaulting to a flat overhead perspective),
     *  then draws the result centred over the background. */
    async composite_photo(background:ImageBitmap, options:PhotoCompositeOptions = {}):Promise<ImageBitmap> {
        const az         = options.azimuth    ?? PHOTO_AZIMUTH
        const el         = options.elevation  ?? PHOTO_ELEVATION
        const zoom       = options.zoom       ?? 1.0
        const roll       = options.roll       ?? 0
        const book_scale = options.book_scale ?? PHOTO_BOOK_SCALE
        const offset_x   = options.offset_x   ?? 0
        const offset_y   = options.offset_y   ?? 0
        const light_az   = options.light_az   ?? DEFAULT_LIGHT_AZ
        const light_el   = options.light_el   ?? DEFAULT_LIGHT_EL
        const ambient    = options.ambient    ?? DEFAULT_AMBIENT

        // Render at a fixed square size so the result is independent of the interactive canvas
        const saved_w = this.canvas.width
        const saved_h = this.canvas.height
        const photo_size = 2048
        this.canvas.width = photo_size
        this.canvas.height = photo_size
        this.render(az, el, zoom, roll, light_az, light_el, ambient * 0.7, 1)
        const book_bmp = await this.snapshot()
        this.canvas.width = saved_w
        this.canvas.height = saved_h

        // Build composite at background's native resolution
        const cw = background.width
        const ch = background.height
        const comp = new OffscreenCanvas(cw, ch)
        const ctx = comp.getContext('2d')!

        // Draw background, then scale and centre the book render on top
        ctx.drawImage(background, 0, 0)
        // Scale so physical book height maps to a consistent fraction of the background.
        // Divide by book_bmp.height (constant across all aspect ratios) so that landscape
        // books are not made smaller than portrait books of the same physical height.
        // 648pt = 9in, the most common trim height — used as a baseline so composites look
        // correctly sized regardless of the actual book dimensions
        const REFERENCE_HEIGHT = 648
        const scale = cw * book_scale * (this._cover_height / REFERENCE_HEIGHT) / book_bmp.height
        const bw = book_bmp.width  * scale
        const bh = book_bmp.height * scale
        // Offsets are fractions of the background dimensions — independent of book size,
        // so the book scales toward its fixed center position rather than the corner
        const bx = (cw - bw) / 2 + offset_x * cw
        const by = (ch - bh) / 2 + offset_y * ch

        // Derive shadow direction from light properties projected into screen space.
        // Shadow extends opposite to the light's horizontal direction, mapped onto the
        // camera's right and down axes so it matches what the 3D shading already shows.
        const az_rad  = az * Math.PI / 180
        const el_rad  = el * Math.PI / 180
        const laz_rad = light_az * Math.PI / 180
        const lel_rad = light_el * Math.PI / 180
        // Screen-space X: cross-camera component of the opposite-light direction
        const shadow_sx = -Math.sin(laz_rad - az_rad)
        // Screen-space Y (canvas +Y = down): camera elevation maps depth onto vertical
        const shadow_sy = -Math.sin(el_rad) * Math.cos(laz_rad - az_rad)
        // Shadow opacity: brighter ambient scenes cast softer shadows
        const shadow_alpha = Math.max(0.1, 0.45 - ambient * 0.3)
        // Shadow length: longer for low-angle light, shorter for overhead light
        const shadow_len = bh * 0.09 * Math.max(0.15, Math.cos(lel_rad))

        // Draw shadow pass: the book masked by a vertical gradient so the shadow is
        // heavy at the base (ground contact) and fades to nothing at the top.
        // This gives the silhouette shape but avoids darkening the air beside the book.
        const smask = new OffscreenCanvas(book_bmp.width, book_bmp.height)
        const sctx  = smask.getContext('2d')!
        sctx.drawImage(book_bmp, 0, 0)
        const vgrad = sctx.createLinearGradient(0, 0, 0, book_bmp.height)
        vgrad.addColorStop(0,   'rgba(0,0,0,0)')
        vgrad.addColorStop(1,   'rgba(0,0,0,1)')
        sctx.globalCompositeOperation = 'destination-in'
        sctx.fillStyle = vgrad
        sctx.fillRect(0, 0, book_bmp.width, book_bmp.height)

        ctx.shadowColor   = `rgba(0,0,0,${shadow_alpha.toFixed(2)})`
        ctx.shadowBlur    = bh * 0.015 + shadow_len * 0.4
        ctx.shadowOffsetX = shadow_sx * shadow_len
        ctx.shadowOffsetY = shadow_sy * shadow_len
        ctx.filter = 'blur(1.5px)'
        ctx.drawImage(smask, bx, by, bw, bh)
        ctx.filter      = 'none'
        ctx.shadowColor = 'transparent'

        // Draw the real book on top
        ctx.filter = 'blur(1.5px)'
        ctx.drawImage(book_bmp, bx, by, bw, bh)
        ctx.filter = 'none'

        // Draw sharp version on top, masked to centre only via radial gradient
        const mask = new OffscreenCanvas(cw, ch)
        const mctx = mask.getContext('2d')!
        mctx.drawImage(book_bmp, bx, by, bw, bh)
        const r = Math.min(bw, bh)
        const grad = mctx.createRadialGradient(bx + bw / 2, by + bh / 2, r * 0.25, bx + bw / 2, by + bh / 2, r * 0.6)
        grad.addColorStop(0, 'black')
        grad.addColorStop(1, 'transparent')
        mctx.globalCompositeOperation = 'destination-in'
        mctx.fillStyle = grad
        mctx.fillRect(0, 0, cw, ch)
        ctx.drawImage(mask, 0, 0)
        book_bmp.close()

        // NOTE Don't remove comment block below and will manually restore when want to test
        // DEBUG: draw light direction line from book centre toward projected light source
        // {
        //     const book_cx = bx + bw / 2
        //     const book_cy = by + bh / 2
        //     // Full 3D projection of light direction onto screen axes
        //     const lsx = Math.cos(lel_rad) * Math.sin(laz_rad - az_rad)
        //     const lsy = Math.cos(lel_rad) * Math.sin(el_rad) * Math.cos(laz_rad - az_rad)
        //               - Math.sin(lel_rad) * Math.cos(el_rad)
        //     const line_len = bh * 0.55
        //     const end_x = book_cx + lsx * line_len
        //     const end_y = book_cy + lsy * line_len
        //     ctx.save()
        //     ctx.strokeStyle = 'rgba(255,200,0,0.95)'
        //     ctx.lineWidth = 3
        //     ctx.setLineDash([8, 4])
        //     ctx.beginPath()
        //     ctx.moveTo(book_cx, book_cy)
        //     ctx.lineTo(end_x, end_y)
        //     ctx.stroke()
        //     ctx.setLineDash([])
        //     ctx.fillStyle = 'rgba(255,200,0,0.95)'
        //     ctx.beginPath()
        //     ctx.arc(end_x, end_y, 10, 0, Math.PI * 2)
        //     ctx.fill()
        //     ctx.restore()
        // }

        return createImageBitmap(comp)
    }

    /** Free all WebGL resources */
    destroy():void {
        if (!this._gl_state)
            return
        const {gl} = this._gl_state
        for (const t of this._textures)
            gl.deleteTexture(t)
        if (this._page_tex)
            gl.deleteTexture(this._page_tex)
        for (const f of this._faces) {
            gl.deleteBuffer(f.vbo)
            gl.deleteBuffer(f.ibo)
        }
        gl.deleteProgram(this._gl_state.prog)
        this._gl_state = null
        this._faces    = []
        this._textures = []
    }
}

/**
 * One-shot render: load the SVGs, render at the given angle, return PNG bytes.
 */
export async function generate(svgs:BookFaces, options:GenerateOptions = {}):Promise<Uint8Array> {
    const renderer = new Book3DRenderer(
        options.width  ?? DEFAULT_WIDTH,
        options.height ?? DEFAULT_HEIGHT,
    )
    try {
        await renderer.load(svgs, options.cover_type ?? 'paperback')
        renderer.render(
            options.azimuth   ?? DEFAULT_AZIMUTH,
            options.elevation ?? DEFAULT_ELEVATION,
            1.0,
            options.roll ?? 0,
        )
        return await renderer.to_png()
    }
    finally {
        renderer.destroy()
    }
}
