
// WebGL shader sources and low-level helpers

const AMBIENT = 0.7

// Default light direction as azimuth/elevation degrees (see light_dir_vec3 in index.ts)
export const DEFAULT_LIGHT_AZ = 15
export const DEFAULT_LIGHT_EL = 25
export const DEFAULT_AMBIENT = AMBIENT

export const VERT_SRC = `
attribute vec3 a_pos;
attribute vec2 a_uv;
attribute vec3 a_normal;
uniform mat4 u_mvp;
uniform mat4 u_mv;
uniform mat3 u_norm_mat;
uniform vec3 u_light_dir;
uniform float u_ambient;
uniform float u_exposure;
varying vec2 v_uv;
varying float v_light;
varying float v_view_z;
void main() {
    gl_Position = u_mvp * vec4(a_pos, 1.0);
    v_uv = a_uv;
    float diffuse = max(dot(normalize(u_norm_mat * a_normal), u_light_dir), 0.0);
    v_light = u_exposure * (u_ambient + (1.0 - u_ambient) * diffuse);
    // View-space Z: used in fragment shader to create depth-based gradient
    v_view_z = (u_mv * vec4(a_pos, 1.0)).z;
}
`

export const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
varying float v_light;
varying float v_view_z;
uniform sampler2D u_tex;
uniform bool u_use_tex;
uniform vec3 u_color;
uniform float u_cam_z;
void main() {
    vec3 base = u_use_tex ? texture2D(u_tex, v_uv).rgb : u_color;
    // View-angle gradient: a smooth ramp from bright (near side) to dark (far side)
    // across the whole face. rel_z > 0 = closer to camera, rel_z < 0 = farther away.
    // Negative shadow (near side) slightly brightens; positive shadow (far side) darkens.
    // Faces directly facing the camera have near-zero rel_z variance → no visible gradient.
    float rel_z = v_view_z - u_cam_z;
    float shadow = clamp(-rel_z * 0.6, -0.08, 0.15);
    gl_FragColor = vec4(base * v_light * (1.0 - shadow), 1.0);
}
`

/** Compile a single shader stage from GLSL source */
export function compile_shader(gl:WebGLRenderingContext, type:number, src:string):WebGLShader {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`[cover-3d] Shader compile error: ${gl.getShaderInfoLog(shader)}`)
    return shader
}

/** Link a vertex + fragment shader into a program */
export function build_program(gl:WebGLRenderingContext, vert:string, frag:string):WebGLProgram {
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile_shader(gl, gl.VERTEX_SHADER, vert))
    gl.attachShader(prog, compile_shader(gl, gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(`[cover-3d] Program link error: ${gl.getProgramInfoLog(prog)}`)
    return prog
}

/** Create a procedural page-edge texture scaled to the book's spine width.
 *  spine_d is the normalised depth (spine_width / cover_height). */
export function create_page_edge_texture(gl:WebGLRenderingContext, spine_d:number):WebGLTexture {
    // Derive stripe count proportional to spine thickness (600 lines per unit is visually calibrated)
    const n_stripes = Math.max(6, Math.round(spine_d * 600))

    // Pack into exactly 256px (power-of-2 required for mipmap generation).
    // Each stripe: body + 2px separator; body scales with available space.
    const px_per_stripe = Math.max(3, Math.floor(256 / n_stripes))
    const actual_n = Math.floor(256 / px_per_stripe)
    const body_h = px_per_stripe - 2

    // Pre-fill with cream so the unpainted tail of the texture blends seamlessly
    const canvas = new OffscreenCanvas(4, 256)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#EDE5D4'
    ctx.fillRect(0, 0, 4, 256)

    // Draw separator lines; page body is already the pre-filled cream
    for (let i = 0; i < actual_n; i++) {
        ctx.fillStyle = '#847C6E'
        ctx.fillRect(0, i * px_per_stripe + body_h, 4, 2)
    }

    // Mipmaps + LINEAR_MIPMAP_LINEAR: lines degrade smoothly at oblique angles rather
    // than aliasing/flickering as the camera rotates.  Requires power-of-2 dimensions (4×256).
    const bitmap = canvas.transferToImageBitmap()
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    bitmap.close()
    return tex
}

/** Upload an ImageBitmap to a WebGL texture (no mipmaps for NPOT support) */
export function upload_texture(gl:WebGLRenderingContext, bitmap:ImageBitmap):WebGLTexture {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // Flip Y so UV (0,0) maps to the top-left of the source image
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    // Skip mipmap generation for NPOT textures (SVG dimensions may not be powers of 2)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    return tex
}
