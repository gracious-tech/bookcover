
import {describe, it, expect} from 'vitest'

import {mat4_identity, mat4_mul, mat4_perspective, mat4_look_at, mat4_rotate_z,
    normal_matrix} from '../src/math.js'
import type {Mat4} from '../src/math.js'

/** Transform a point by a column-major 4x4, returning the homogeneous result */
function transform(m:Mat4, [x, y, z]:[number, number, number]):number[] {
    const out:number[] = []
    for (let row = 0; row < 4; row++) {
        out.push(m[row] * x + m[row + 4] * y + m[row + 8] * z + m[row + 12])
    }
    return out
}

/** Every element of two matrices, compared within floating-point tolerance */
function expect_matrix(actual:Mat4, expected:number[]):void {
    for (let i = 0; i < expected.length; i++)
        expect(actual[i], `element ${i}`).toBeCloseTo(expected[i], 5)
}


describe('mat4_identity', () => {

    it('has ones down the diagonal and zeroes elsewhere', () => {
        expect([...mat4_identity()]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    })

    it('leaves a point where it is', () => {
        expect(transform(mat4_identity(), [3, -4, 5]).slice(0, 3)).toEqual([3, -4, 5])
    })
})


describe('mat4_mul', () => {

    it('leaves a matrix unchanged when multiplied by the identity', () => {
        const m = mat4_rotate_z(37)
        expect_matrix(mat4_mul(m, mat4_identity()), [...m])
        expect_matrix(mat4_mul(mat4_identity(), m), [...m])
    })

    it('composes rotations, applying the right-hand operand first', () => {
        const combined = mat4_mul(mat4_rotate_z(30), mat4_rotate_z(60))
        expect_matrix(combined, [...mat4_rotate_z(90)])
    })

    it('is not commutative for a rotation and a translation', () => {
        const translate = mat4_identity()
        translate[12] = 5
        const rotate = mat4_rotate_z(90)
        expect([...mat4_mul(rotate, translate)]).not.toEqual([...mat4_mul(translate, rotate)])
    })
})


describe('mat4_rotate_z', () => {

    it('turns +X into +Y at 90 degrees, counter-clockwise from +Z', () => {
        const [x, y] = transform(mat4_rotate_z(90), [1, 0, 0])
        expect(x).toBeCloseTo(0, 6)
        expect(y).toBeCloseTo(1, 6)
    })

    it('is the identity at zero, and returns to it at 360', () => {
        expect_matrix(mat4_rotate_z(0), [...mat4_identity()])
        expect_matrix(mat4_rotate_z(360), [...mat4_identity()])
    })

    it('leaves the z axis alone', () => {
        expect(transform(mat4_rotate_z(45), [0, 0, 1]).slice(0, 3).map(v => Math.round(v)))
            .toEqual([0, 0, 1])
    })
})


describe('mat4_perspective', () => {

    it('divides x by the aspect ratio so a wide viewport does not stretch', () => {
        const wide = mat4_perspective(45, 2, 0.1, 100)
        const square = mat4_perspective(45, 1, 0.1, 100)
        expect(wide[0]).toBeCloseTo(square[0] / 2, 6)
        expect(wide[5]).toBeCloseTo(square[5], 6)
    })

    it('carries the perspective divide in w', () => {
        expect(mat4_perspective(45, 1, 0.1, 100)[11]).toBe(-1)
        // A point in front of the camera comes back with a positive w after the divide
        expect(transform(mat4_perspective(45, 1, 0.1, 100), [0, 0, -5])[3]).toBeCloseTo(5, 6)
    })

    it('maps the near and far planes onto the clip range', () => {
        const m = mat4_perspective(60, 1, 1, 10)
        const depth_at = (z:number) => {
            const p = transform(m, [0, 0, z])
            return p[2] / p[3]
        }
        expect(depth_at(-1)).toBeCloseTo(-1, 5)
        expect(depth_at(-10)).toBeCloseTo(1, 5)
    })

    it('narrows the field of view as the angle shrinks', () => {
        expect(mat4_perspective(30, 1, 0.1, 100)[5])
            .toBeGreaterThan(mat4_perspective(90, 1, 0.1, 100)[5])
    })
})


describe('mat4_look_at', () => {

    it('puts the target at the origin of view space', () => {
        const view = mat4_look_at([0, 0, 5], [0, 0, 0])
        expect(transform(view, [0, 0, 0]).slice(0, 3).map(v => Math.round(v * 1e6) / 1e6))
            .toEqual([0, 0, -5])
    })

    it('leaves an eye on +Z looking at the origin as a plain translation', () => {
        expect_matrix(mat4_look_at([0, 0, 5], [0, 0, 0]),
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1])
    })

    it('builds an orthonormal basis for an off-axis camera', () => {
        const view = mat4_look_at([3, 4, 5], [0, 0, 0])
        const right = [view[0], view[1], view[2]]
        const up = [view[4], view[5], view[6]]
        const length = (v:number[]) => Math.hypot(...v)
        const dot = (a:number[], b:number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
        // Rows of the rotation block are the basis vectors, so each column is unit length
        expect(length([view[0], view[4], view[8]])).toBeCloseTo(1, 6)
        expect(length([view[1], view[5], view[9]])).toBeCloseTo(1, 6)
        expect(dot(right, up)).toBeCloseTo(0, 6)
    })

    it('keeps the camera the same distance from its target however it is placed', () => {
        const view = mat4_look_at([3, 4, 5], [1, 1, 1])
        const target_in_view = transform(view, [1, 1, 1])
        expect(Math.hypot(...target_in_view.slice(0, 3)))
            .toBeCloseTo(Math.hypot(3 - 1, 4 - 1, 5 - 1), 5)
    })
})


describe('normal_matrix', () => {

    it('takes the upper-left 3x3 of the view matrix', () => {
        const view = mat4_look_at([3, 4, 5], [0, 0, 0])
        const n = normal_matrix(view)
        expect([...n]).toEqual([view[0], view[1], view[2], view[4], view[5], view[6],
            view[8], view[9], view[10]])
    })

    it('drops the translation, so normals are unaffected by camera position', () => {
        const near = normal_matrix(mat4_look_at([0, 0, 2], [0, 0, 0]))
        const far = normal_matrix(mat4_look_at([0, 0, 50], [0, 0, 0]))
        expect([...near]).toEqual([...far])
    })

    it('stays a rotation — it preserves the length of a normal', () => {
        const n = normal_matrix(mat4_look_at([3, 4, 5], [0, 0, 0]))
        const rotated = [
            n[0] * 1 + n[3] * 0 + n[6] * 0,
            n[1] * 1 + n[4] * 0 + n[7] * 0,
            n[2] * 1 + n[5] * 0 + n[8] * 0,
        ]
        expect(Math.hypot(...rotated)).toBeCloseTo(1, 6)
    })
})
