
// Column-major Mat4 / Mat3 math — no external dependencies

export type Mat4 = Float32Array
export type Mat3 = Float32Array

/** Create a 4×4 identity matrix */
export function mat4_identity():Mat4 {
    const m = new Float32Array(16)
    m[0] = m[5] = m[10] = m[15] = 1
    return m
}

/** Multiply two 4×4 matrices: result = a * b */
export function mat4_mul(a:Mat4, b:Mat4):Mat4 {
    const out = new Float32Array(16)
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            let sum = 0
            for (let k = 0; k < 4; k++)
                sum += a[row + k * 4] * b[k + col * 4]
            out[row + col * 4] = sum
        }
    }
    return out
}

/** Perspective projection matrix (column-major, right-hand) */
export function mat4_perspective(fov_deg:number, aspect:number, near:number, far:number):Mat4 {
    const m = new Float32Array(16)
    const f = 1.0 / Math.tan((fov_deg * Math.PI / 180) / 2)
    m[0]  = f / aspect
    m[5]  = f
    m[10] = (far + near) / (near - far)
    m[11] = -1
    m[14] = (2 * far * near) / (near - far)
    return m
}

/** LookAt view matrix — up is always +Y */
export function mat4_look_at(eye:[number,number,number], target:[number,number,number]):Mat4 {
    const up:[number,number,number] = [0, 1, 0]

    // Forward = normalize(eye - target)
    let fx = eye[0] - target[0], fy = eye[1] - target[1], fz = eye[2] - target[2]
    const fl = Math.sqrt(fx*fx + fy*fy + fz*fz)
    fx /= fl; fy /= fl; fz /= fl

    // Right = normalize(up × forward)
    let rx = up[1]*fz - up[2]*fy, ry = up[2]*fx - up[0]*fz, rz = up[0]*fy - up[1]*fx
    const rl = Math.sqrt(rx*rx + ry*ry + rz*rz)
    rx /= rl; ry /= rl; rz /= rl

    // True up = forward × right
    const ux = fy*rz - fz*ry, uy = fz*rx - fx*rz, uz = fx*ry - fy*rx

    const m = new Float32Array(16)
    m[0] = rx;  m[4] = ry;  m[8]  = rz;  m[12] = -(rx*eye[0] + ry*eye[1] + rz*eye[2])
    m[1] = ux;  m[5] = uy;  m[9]  = uz;  m[13] = -(ux*eye[0] + uy*eye[1] + uz*eye[2])
    m[2] = fx;  m[6] = fy;  m[10] = fz;  m[14] = -(fx*eye[0] + fy*eye[1] + fz*eye[2])
    m[15] = 1
    return m
}

/** Rotation matrix around the Z-axis (column-major); positive angle = counter-clockwise from +Z */
export function mat4_rotate_z(angle_deg:number):Mat4 {
    const m = mat4_identity()
    const a = angle_deg * Math.PI / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    // Column 0: [c, s, 0, 0], Column 1: [-s, c, 0, 0]
    m[0] =  c; m[1] = s
    m[4] = -s; m[5] = c
    return m
}

/** Extract the 3×3 normal matrix (upper-left of the view matrix) for rotation-only views */
export function normal_matrix(mv:Mat4):Mat3 {
    const n = new Float32Array(9)
    n[0] = mv[0]; n[1] = mv[1]; n[2] = mv[2]
    n[3] = mv[4]; n[4] = mv[5]; n[5] = mv[6]
    n[6] = mv[8]; n[7] = mv[9]; n[8] = mv[10]
    return n
}
