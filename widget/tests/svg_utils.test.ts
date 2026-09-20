
import {describe, it, expect, vi} from 'vitest'

import {svg_data_url, contrast_color, debounce, make_zoom_wheel_handler,
    ZOOM_MIN, ZOOM_MAX, ZOOM_SENS} from '../src/svg_utils'


describe('svg_data_url', () => {

    it('wraps an SVG as a base64 data URL', () => {
        const url = svg_data_url('<svg/>')
        expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true)
        expect(atob(url.split(',')[1])).toBe('<svg/>')
    })

    it('survives non-ASCII content', () => {
        expect(() => svg_data_url('<svg><text>日本語</text></svg>')).not.toThrow()
    })
})


describe('contrast_color', () => {

    it('labels a light swatch in black and a dark one in white', () => {
        expect(contrast_color('#ffffff')).toBe('#000000')
        expect(contrast_color('#000000')).toBe('#ffffff')
    })

    it('accepts a hex with or without the leading hash', () => {
        expect(contrast_color('ffffff')).toBe('#000000')
    })

    it('weights green highest, as perceptual luma does', () => {
        // Pure green reads as light, pure blue as dark, at identical channel values
        expect(contrast_color('#00ff00')).toBe('#000000')
        expect(contrast_color('#0000ff')).toBe('#ffffff')
    })
})


describe('make_zoom_wheel_handler', () => {

    it('zooms in when the wheel scrolls up and out when it scrolls down', () => {
        let zoom = 1
        const handler = make_zoom_wheel_handler(() => zoom, value => {
            zoom = value
        })
        handler({deltaY: -100} as WheelEvent)
        expect(zoom).toBeCloseTo(1 + 100 * ZOOM_SENS, 6)
        handler({deltaY: 200} as WheelEvent)
        expect(zoom).toBeCloseTo(1 - 100 * ZOOM_SENS, 6)
    })

    it('clamps to the shared zoom bounds however far the wheel goes', () => {
        let zoom = 1
        const handler = make_zoom_wheel_handler(() => zoom, value => {
            zoom = value
        })
        handler({deltaY: -100000} as WheelEvent)
        expect(zoom).toBe(ZOOM_MAX)
        handler({deltaY: 100000} as WheelEvent)
        expect(zoom).toBe(ZOOM_MIN)
    })
})


describe('debounce', () => {

    it('runs once after the quiet period, not per call', () => {
        vi.useFakeTimers()
        try {
            let calls = 0
            const run = debounce(() => {
                calls++
            }, 300)
            run()
            run()
            run()
            expect(calls).toBe(0)
            vi.advanceTimersByTime(299)
            expect(calls).toBe(0)
            vi.advanceTimersByTime(1)
            expect(calls).toBe(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('restarts the wait on each new call', () => {
        vi.useFakeTimers()
        try {
            let calls = 0
            const run = debounce(() => {
                calls++
            }, 300)
            run()
            vi.advanceTimersByTime(200)
            run()
            vi.advanceTimersByTime(200)
            expect(calls).toBe(0)
            vi.advanceTimersByTime(100)
            expect(calls).toBe(1)
        } finally {
            vi.useRealTimers()
        }
    })
})
