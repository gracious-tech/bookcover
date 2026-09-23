
import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest'
import {reactive, nextTick} from 'vue'

import {make_blank_form_values} from 'bookcover-web'
import type {FormState} from '../src/form_state'
import {init_color_palette_cache, current_cover_colors} from '../src/color_palette'

// assets.ts (reached via the image-regions cache) reads window.location in dev, which the node
// test environment doesn't have
vi.mock('../src/assets', () => ({assets_prefix: 'https://assets.test/'}))

// The palette cache is a module-level singleton watching one form, so the whole file shares
// one reactive form and edits it between tests (matching the app's one-form-per-context model)
const form = reactive(make_blank_form_values()) as FormState

/** Apply form edits, then let the watcher fire and its 300ms debounce elapse */
async function settle(changes:Partial<FormState> = {}):Promise<void> {
    Object.assign(form, changes)
    await nextTick()
    vi.advanceTimersByTime(300)
    await nextTick()
}

/** The palette's two groups after the current edit settles */
function groups():{chosen:string[], auto:string[]} {
    return current_cover_colors.value
}

beforeAll(async () => {
    vi.useFakeTimers()
    init_color_palette_cache(form)
    await settle()
})

afterAll(() => {
    vi.useRealTimers()
})


describe('chosen colors', () => {

    it('lists an explicitly set color, normalised to the hsl form', async () => {
        await settle({title1_color: '#ff0000'})
        expect(groups().chosen).toContain('hsl(0deg, 100%, 50%)')
    })

    it('deduplicates the same color set on two fields', async () => {
        await settle({title1: 'Title', title2: 'Two', title2_color: '#ff0000'})
        const reds = groups().chosen.filter(color => color === 'hsl(0deg, 100%, 50%)')
        expect(reds).toHaveLength(1)
    })

    it('drops a color once its field is cleared', async () => {
        await settle({title1_color: null, title2_color: null})
        expect(groups().chosen).not.toContain('hsl(0deg, 100%, 50%)')
    })
})


describe('auto colors', () => {

    it('lists the colors resolve_colors would derive right now', async () => {
        await settle({bg_color: '#1a1a2e'})
        // White title text on a dark cover, plus the cover color itself
        expect(groups().auto).toContain('hsl(0deg, 0%, 100%)')
        expect(groups().chosen).toContain('hsl(240deg, 28%, 14%)')
    })

    it('never repeats a color already listed as chosen', async () => {
        await settle({bg_color: '#1a1a2e'})
        for (const color of groups().chosen)
            expect(groups().auto).not.toContain(color)
    })

    it('adds the gradient stops only while the gradient is on', async () => {
        await settle({bg_color: '#3366cc', bg_color_gradient: false})
        const without = groups().auto.length
        await settle({bg_color_gradient: true})
        expect(groups().auto.length).toBeGreaterThan(without)
    })

    it('suggests a pattern color only while a pattern is chosen', async () => {
        await settle({bg_color_gradient: false, pattern_id: null})
        const without = groups().auto.length
        await settle({pattern_id: 'bamboo'})
        expect(groups().auto.length).toBeGreaterThan(without)
    })

    it('suggests the whole palette a vector background would recolor itself with', async () => {
        await settle({pattern_id: null, bg_vector_id: null})
        const without = groups().auto.length
        await settle({bg_vector_id: 'big-leaf-cluster'})
        // A vector design pulls three coordinated colors, not one
        expect(groups().auto.length).toBeGreaterThanOrEqual(without + 3)
    })
})


describe('inactive fields', () => {

    it('skips a field whose content is not on the cover', async () => {
        await settle({bg_vector_id: null, subtitle: '', subtitle_color: '#00ff00'})
        expect(groups().chosen).not.toContain('hsl(120deg, 100%, 50%)')
        await settle({subtitle: 'A subtitle'})
        expect(groups().chosen).toContain('hsl(120deg, 100%, 50%)')
    })

    it('skips the icon color while no icon is selected', async () => {
        await settle({icon_id: null, icon_color: '#ff00ff'})
        expect(groups().chosen).not.toContain('hsl(300deg, 100%, 50%)')
        await settle({icon_id: 'builtin:cross'})
        expect(groups().chosen).toContain('hsl(300deg, 100%, 50%)')
    })

    it('skips the spine colors once the spine is too narrow to print on', async () => {
        await settle({icon_id: null, spine_title_color: '#ffff00',
            service_id: 'kdp', size_id: 'us_trade', page_count: 300})
        expect(groups().chosen).toContain('hsl(60deg, 100%, 50%)')
        // A stitched binding has no spine to place text on
        await settle({service_id: 'officeworks', size_id: 'a5', binding_type: 'paperback_stitch'})
        expect(groups().chosen).not.toContain('hsl(60deg, 100%, 50%)')
    })
})


describe('resilience', () => {

    it('keeps the chosen colors when the form is mid-edit and cannot resolve', async () => {
        await settle({service_id: 'nonsense', title1_color: '#ff0000'})
        expect(groups().chosen).toContain('hsl(0deg, 100%, 50%)')
    })
})
