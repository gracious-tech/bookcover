
import {describe, it, expect} from 'vitest'

import {BACKGROUNDS, PHOTO_AZIMUTH, PHOTO_ELEVATION, PHOTO_BOOK_SCALE} from '../src/photo.js'


describe('background photo metadata', () => {

    it('ships at least one background', () => {
        expect(BACKGROUNDS.length).toBeGreaterThan(0)
    })

    it('gives every background a unique id', () => {
        const ids = BACKGROUNDS.map(bg => bg.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('keeps ids filename-safe — consumers path-join them to fetch the JPG', () => {
        // The metadata is all this package ships; the images live in the repo's assets tree
        for (const bg of BACKGROUNDS)
            expect(bg.id, bg.id).toMatch(/^[a-z0-9_]+$/)
    })

    it('keeps every camera and lighting override in a sane range', () => {
        for (const bg of BACKGROUNDS) {
            expect(bg.azimuth, bg.id).toBeGreaterThanOrEqual(-180)
            expect(bg.azimuth, bg.id).toBeLessThanOrEqual(180)
            expect(bg.elevation, bg.id).toBeGreaterThanOrEqual(-90)
            expect(bg.elevation, bg.id).toBeLessThanOrEqual(90)
            expect(bg.book_scale, bg.id).toBeGreaterThan(0)
            expect(bg.book_scale, bg.id).toBeLessThanOrEqual(2)
            expect(bg.ambient, bg.id).toBeGreaterThan(0)
            expect(bg.ambient, bg.id).toBeLessThanOrEqual(1)
        }
    })

    it('keeps the book on screen — offsets are a fraction of the image', () => {
        for (const bg of BACKGROUNDS) {
            expect(Math.abs(bg.offset_x ?? 0), bg.id).toBeLessThan(0.5)
            expect(Math.abs(bg.offset_y ?? 0), bg.id).toBeLessThan(0.5)
        }
    })
})


describe('photo defaults', () => {

    it('looks down at the cover, turned slightly to show depth', () => {
        expect(PHOTO_ELEVATION).toBeGreaterThan(0)
        expect(PHOTO_AZIMUTH).toBeLessThan(0)
    })

    it('sizes the book to part of the background width', () => {
        expect(PHOTO_BOOK_SCALE).toBeGreaterThan(0)
        expect(PHOTO_BOOK_SCALE).toBeLessThan(1)
    })
})
