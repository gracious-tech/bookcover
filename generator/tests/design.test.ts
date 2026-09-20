
import {describe, it, expect} from 'vitest'
import chroma from 'chroma-js'

import {resolve_colors, resolve_font_configs, resolve_font_families, generate_palette,
    tinted_contrast_text, pick_vivid_tint, synthesize_fill, blend_regions, region_hex,
    all_image_regions, darken_hsl, mix_hsl, VECTOR_BG_AUTO_COLOR} from '../src/design.js'
import type {RegionStats, ImageRegions, PaletteScheme} from '../src/design.js'
import {make_schema} from './helpers.js'

const WHITE = 'hsl(0deg, 0%, 100%)'
const NEAR_BLACK = 'hsl(0deg, 0%, 10%)'

/** A sampled image region — saturation/lightness are 0-1 fractions, as chroma uses */
function region(hue:number, saturation:number, lightness:number, spread = 0):RegionStats {
    return {hue, saturation, lightness, lightness_spread: spread}
}

/** An ImageRegions where every slot samples the same color */
function uniform_regions(r:RegionStats):ImageRegions {
    return {front_top: r, front_bottom: r, front_top_full: r, front_bottom_full: r,
        back: r, spine: r}
}

/** WCAG contrast ratio, for asserting a derived text color is actually readable */
function contrast(a:string, b:string):number {
    const [la, lb] = [chroma(a).luminance(), chroma(b).luminance()].sort((x, y) => y - x)
    return (la + 0.05) / (lb + 0.05)
}

/** The lightness of a color as a 0-1 fraction */
function lightness(color:string):number {
    return chroma(color).hsl()[2] || 0
}


describe('resolve_colors without an image', () => {

    it('falls back to a white cover when nothing is chosen', () => {
        expect(resolve_colors(make_schema()).front_background).toBe(WHITE)
    })

    it('auto-contrasts every text field against the background', () => {
        const dark = resolve_colors(make_schema({bg_color: 'hsl(240deg, 30%, 12%)'}))
        expect(dark.front_title1).toBe(WHITE)
        expect(dark.front_subtitle).toBe(WHITE)
        expect(dark.front_author).toBe(WHITE)
        const light = resolve_colors(make_schema({bg_color: 'hsl(40deg, 30%, 92%)'}))
        expect(light.front_title1).toBe(NEAR_BLACK)
        expect(light.front_author).toBe(NEAR_BLACK)
    })

    it('takes near-black on a mid-gray background, though white would read better', () => {
        // Pins current behaviour: the white/black choice is made by comparing against PURE
        // black, but near-black (10%) is what gets emitted. In the narrow band where the two
        // disagree (background luminance ~0.18-0.20) the emitted color is the weaker of the
        // two — 3.94:1 here against white's 4.42:1. Changing this shifts rendered output, so
        // it needs a RENDER_VERSION bump
        const colors = resolve_colors(make_schema({bg_color: 'hsl(0deg, 0%, 47%)'}))
        expect(colors.front_title1).toBe(NEAR_BLACK)
        expect(contrast(colors.front_title1, 'hsl(0, 0%, 47%)')).toBeLessThan(
            contrast(WHITE, 'hsl(0, 0%, 47%)'))
    })

    it('lets an explicit color win over the derived one', () => {
        const colors = resolve_colors(make_schema({
            bg_color: 'hsl(240deg, 30%, 12%)', title1_color: 'hsl(120deg, 50%, 40%)'}))
        expect(colors.front_title1).toBe('hsl(120deg, 50%, 40%)')
        // The other fields still derive independently
        expect(colors.front_subtitle).toBe(WHITE)
    })

    it('falls titles 2 and 3 back to title 1, including an explicit override', () => {
        const derived = resolve_colors(make_schema({bg_color: 'hsl(240deg, 30%, 12%)'}))
        expect(derived.front_title2).toBe(derived.front_title1)
        expect(derived.front_title3).toBe(derived.front_title1)
        const override = resolve_colors(make_schema({title1_color: 'hsl(10deg, 50%, 40%)'}))
        expect(override.front_title2).toBe('hsl(10deg, 50%, 40%)')
    })

    it('shifts the gradient stops either side of the base hue', () => {
        const colors = resolve_colors(make_schema({bg_color: 'hsl(200deg, 50%, 50%)'}))
        expect(colors.front_gradient_start).toBe('hsl(235deg, 10%, 50%)')
        expect(colors.front_gradient_end).toBe('hsl(165deg, 10%, 50%)')
    })

    it('treats a null blurb background as transparent and contrasts its text on the cover', () => {
        const colors = resolve_colors(make_schema({
            bg_color: 'hsl(240deg, 30%, 12%)', blurb_bg_color: null}))
        expect(colors.blurb_background).toBeNull()
        expect(colors.blurb).toBe(WHITE)
    })

    it('contrasts blurb text against an explicit blurb background, not the cover', () => {
        const colors = resolve_colors(make_schema({
            bg_color: 'hsl(240deg, 30%, 12%)', blurb_bg_color: 'hsl(0deg, 0%, 96%)'}))
        expect(colors.blurb).toBe(NEAR_BLACK)
    })

    it('mirrors spine_color into the spine background, and null means unpainted', () => {
        expect(resolve_colors(make_schema({spine_color: 'hsl(0deg, 50%, 50%)'})).spine_background)
            .toBe('hsl(0deg, 50%, 50%)')
        expect(resolve_colors(make_schema({spine_color: null})).spine_background).toBeNull()
        expect(resolve_colors(make_schema()).spine_background).toBeNull()
    })

    it('uses a neutral tan for a vector background, which has no pixels to sample', () => {
        const colors = resolve_colors(make_schema({bg_vector_id: 'big-leaf-cluster'}))
        // Compared channel-wise: the resolved value round-trips through a rounded hsl() string
        const [r, g, b] = chroma(colors.front_background).rgb()
        const [tan_r, tan_g, tan_b] = chroma(VECTOR_BG_AUTO_COLOR).rgb()
        expect(r).toBeCloseTo(tan_r, -0.5)
        expect(g).toBeCloseTo(tan_g, -0.5)
        expect(b).toBeCloseTo(tan_b, -0.5)
    })

    it('lets an explicit bg_color beat the vector fallback', () => {
        const colors = resolve_colors(make_schema({
            bg_vector_id: 'big-leaf-cluster', bg_color: 'hsl(0deg, 0%, 0%)'}))
        expect(colors.front_background).toBe('hsl(0deg, 0%, 0%)')
    })
})


describe('resolve_colors with an image', () => {

    it('derives the cover background from the sampled regions', () => {
        const regions = uniform_regions(region(200, 0.5, 0.6))
        const colors = resolve_colors(make_schema(), regions)
        expect(colors.front_background).not.toBe(WHITE)
        expect(chroma(colors.front_background).hsl()[0]).toBeCloseTo(200, 0)
    })

    it('keeps front text readable against the region it actually sits on', () => {
        const regions = uniform_regions(region(30, 0.4, 0.75))
        const colors = resolve_colors(make_schema({bg_image_coverage: 'front'}), regions)
        // Top-positioned title sits on the sampled front_top region
        expect(contrast(colors.front_title1, region_hex(regions.front_top))).toBeGreaterThan(4.5)
    })

    it('reads the back and spine off the image only under full-wrap coverage', () => {
        const dark_back = region(0, 0, 0.05)
        const regions:ImageRegions = {...uniform_regions(region(0, 0, 0.95)),
            back: dark_back, spine: dark_back}
        const wrapped = resolve_colors(
            make_schema({bg_image_coverage: 'full', bg_color: 'hsl(0deg, 0%, 100%)'}), regions)
        expect(wrapped.blurb).toBe(WHITE)
        expect(wrapped.spine_title).toBe(WHITE)
        // The same dark back/spine regions are invisible when the image is front-only
        const front_only = resolve_colors(
            make_schema({bg_image_coverage: 'front', bg_color: 'hsl(0deg, 0%, 100%)'}), regions)
        expect(front_only.blurb).toBe(NEAR_BLACK)
        expect(front_only.spine_title).toBe(NEAR_BLACK)
    })

    it('ignores the image for inset coverages, where text sits on the flat background', () => {
        // A dark image inset into a white cover — front text must stay dark, not flip to white
        const regions = uniform_regions(region(0, 0, 0.03))
        for (const coverage of ['painted', 'feature'] as const) {
            const colors = resolve_colors(make_schema(
                {bg_image_coverage: coverage, bg_color: 'hsl(0deg, 0%, 100%)'}), regions)
            expect(colors.front_title1, coverage).toBe(NEAR_BLACK)
        }
    })

    it('treats only the top of a front_partial cover as flat background', () => {
        const regions = uniform_regions(region(0, 0, 0.03))
        const schema = {bg_image_coverage: 'front_partial' as const, bg_color: 'hsl(0deg, 0%, 100%)'}
        expect(resolve_colors(make_schema({...schema, title_position: 'top'}), regions).front_title1)
            .toBe(NEAR_BLACK)
        // Bottom-positioned text sits on the image itself, which is nearly black
        expect(resolve_colors(make_schema({...schema, author_position: 'bottom'}), regions)
            .front_author).toBe(WHITE)
    })

    it('still honours explicit colors when an image is present', () => {
        const colors = resolve_colors(
            make_schema({title1_color: 'hsl(300deg, 50%, 50%)'}), uniform_regions(region(0, 0, 0.5)))
        expect(colors.front_title1).toBe('hsl(300deg, 50%, 50%)')
    })

    it('treats a null image_regions exactly like no image at all', () => {
        expect(resolve_colors(make_schema(), null).front_background).toBe(WHITE)
    })
})


describe('pick_vivid_tint', () => {

    it('goes straight to white or near-black against a near-black or near-white backdrop', () => {
        // A hue search against so stark a backdrop returns washed mid-tones — see the gray note
        const candidates = [region(30, 0.6, 0.5), region(200, 0.5, 0.4)]
        expect(pick_vivid_tint(candidates, region(0, 0, 0.02))).toBe(chroma.hsl(0, 0, 1).hex())
        expect(pick_vivid_tint(candidates, region(0, 0, 0.98))).toBe(chroma.hsl(0, 0, 0.1).hex())
    })

    it('never returns a washed mid-gray — a neutral result goes to an extreme', () => {
        // Auto text landing on gray reads as a bug, so the grayscale fallback skips
        // tinted_contrast_text (which would plateau at mid-gray) and takes black or white
        const gray_backdrop = region(0, 0, 0.5)
        const picked = pick_vivid_tint([region(0, 0, 0.5)], gray_backdrop)
        expect(chroma(picked).hsl()[1]).toBe(0)
        expect([lightness(picked) < 0.15, lightness(picked) > 0.85]).toContain(true)
    })

    it('meets the requested contrast against the backdrop', () => {
        const backdrop = region(210, 0.3, 0.7)
        const picked = pick_vivid_tint([region(210, 0.3, 0.7), region(20, 0.8, 0.3)], backdrop, 6)
        expect(contrast(picked, region_hex(backdrop))).toBeGreaterThanOrEqual(5.9)
    })

    it('borrows a hue from another region when its own is washed out', () => {
        // A pale sky backdrop with a saturated sea elsewhere in the same photo
        const sky = region(200, 0.08, 0.8)
        const sea = region(220, 0.7, 0.3)
        const picked = pick_vivid_tint([sky, sea], sky)
        expect(chroma(picked).hsl()[1]).toBeGreaterThan(0.1)
    })

    it('penalises a warm hue forced dark, which reads as muddy brown', () => {
        // A light amber backdrop would push its own hue dark; a cleaner option should win
        const amber = region(40, 0.5, 0.75)
        const cool = region(220, 0.6, 0.45)
        const picked = pick_vivid_tint([amber, cool], amber)
        const hue = chroma(picked).hsl()[0] || 0
        expect(hue < 20 || hue > 75 || chroma(picked).hsl()[1] === 0).toBe(true)
    })
})


describe('tinted_contrast_text', () => {

    it('keeps the requested hue while clearing the contrast target', () => {
        const color = tinted_contrast_text(200, 0.6, '#ffffff', 4.5)
        expect(chroma(color).hsl()[0]).toBeCloseTo(200, 0)
        expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(4.4)
    })

    it('stays as close to mid-lightness as the target allows', () => {
        // An easy target off a white background needs only a moderate darkening
        const easy = tinted_contrast_text(200, 0.6, '#ffffff', 3)
        const hard = tinted_contrast_text(200, 0.6, '#ffffff', 10)
        expect(lightness(easy)).toBeGreaterThan(lightness(hard))
    })

    it('returns the closest extreme when the target is unreachable', () => {
        // No color clears 15:1 against a mid-gray, so it falls back to the better extreme
        const color = tinted_contrast_text(200, 0.6, '#767676', 15)
        expect([lightness(color) <= 0.02, lightness(color) >= 0.98]).toContain(true)
    })

    it('keeps mid lightness when it already clears the target', () => {
        expect(lightness(tinted_contrast_text(200, 0.6, '#ffffff', 1.5))).toBeCloseTo(0.5, 2)
    })
})


describe('synthesize_fill', () => {

    it('falls back to white with no candidates', () => {
        expect(synthesize_fill([])).toBe('#ffffff')
    })

    it('takes its hue from the most saturated candidate', () => {
        const fill = synthesize_fill([region(0, 0.05, 0.5), region(280, 0.6, 0.5)])
        expect(chroma(fill).hsl()[0]).toBeCloseTo(280, 0)
    })

    it('bands a light source light and a dark source dark', () => {
        expect(lightness(synthesize_fill([region(200, 0.5, 0.8)]))).toBeGreaterThan(0.7)
        expect(lightness(synthesize_fill([region(200, 0.5, 0.2)]))).toBeLessThan(0.35)
    })

    it('honours an explicit target lightness for punchier accents', () => {
        expect(lightness(synthesize_fill([region(200, 0.5, 0.8)], 0.45))).toBeCloseTo(0.45, 2)
    })

    it('goes to true black for a near-black achromatic source', () => {
        // A dark band would show as washed gray, and there is no real hue to preserve
        expect(synthesize_fill([region(0, 0.01, 0.04)])).toBe('#000000')
    })

    it('goes to true black for a dark, vividly warm source that would read as brown', () => {
        expect(synthesize_fill([region(25, 0.8, 0.1)])).toBe('#000000')
    })

    it('leaves a dark but cool source as a rich color, not black', () => {
        expect(synthesize_fill([region(220, 0.8, 0.1)])).not.toBe('#000000')
    })

    it('never invents a hue for a black and white photo', () => {
        expect(chroma(synthesize_fill([region(0, 0.01, 0.6)])).hsl()[1]).toBe(0)
    })

    it('keeps the accent path out of the black shortcut', () => {
        // The shortcut is for general fills only — an accent asks for a specific lightness
        expect(synthesize_fill([region(25, 0.8, 0.1)], 0.45)).not.toBe('#000000')
    })
})


describe('blend_regions', () => {

    it('averages saturation and lightness', () => {
        const blended = blend_regions(region(0, 0.2, 0.2), region(0, 0.6, 0.8))
        expect(blended.saturation).toBeCloseTo(0.4, 6)
        expect(blended.lightness).toBeCloseTo(0.5, 6)
    })

    it('biases the blended hue toward the more colorful region', () => {
        const blended = blend_regions(region(0, 0.1, 0.5), region(60, 0.9, 0.5))
        expect(blended.hue).toBeGreaterThan(45)
    })

    it('takes the short way around the hue wheel', () => {
        const blended = blend_regions(region(350, 0.5, 0.5), region(10, 0.5, 0.5))
        expect(blended.hue % 360).toBeCloseTo(0, 4)
    })

    it('counts the gap between the two lightnesses as spread of its own', () => {
        // Blending a light region with a dark one is itself a reason to demand more contrast
        expect(blend_regions(region(0, 0.5, 0.1), region(0, 0.5, 0.9)).lightness_spread)
            .toBeCloseTo(0.4, 6)
    })

    it('keeps the first hue when both regions are fully desaturated', () => {
        expect(blend_regions(region(120, 0, 0.5), region(240, 0, 0.5)).hue).toBe(120)
    })
})


describe('generate_palette', () => {

    it('returns exactly the requested number of colors', () => {
        for (const count of [1, 3, 5, 8])
            expect(generate_palette('#3366cc', count, 'triadic'), `${count}`).toHaveLength(count)
    })

    it('spaces the hues by each scheme\'s own offsets', () => {
        const hue_of = (hex:string) => Math.round(chroma(hex).hsl()[0] || 0)
        const triadic = generate_palette('#ff0000', 3, 'triadic').map(hue_of)
        expect(triadic).toEqual([0, 120, 240])
        const complementary = generate_palette('#ff0000', 2, 'complementary').map(hue_of)
        expect(complementary).toEqual([0, 180])
    })

    it('varies lightness rather than repeating a tone past the scheme\'s hue count', () => {
        const colors = generate_palette('#ff0000', 4, 'complementary')
        expect(colors[2]).not.toBe(colors[0])
        expect(Math.round(chroma(colors[2]).hsl()[0] || 0)).toBe(0)
    })

    it('stays colorful even from a near-white or near-black base', () => {
        for (const base of ['#fefefe', '#010101']) {
            for (const color of generate_palette(base, 3, 'triadic')) {
                expect(lightness(color), base).toBeGreaterThan(0.3)
                expect(lightness(color), base).toBeLessThan(0.7)
            }
        }
    })

    it('softens accent_tones toward the base color instead of a hue wheel', () => {
        const tones = generate_palette('#804020', 3, 'accent_tones')
        expect(tones).toHaveLength(3)
        expect(new Set(tones).size).toBe(3)
    })

    it('lightens accent_tones against a dark base so fills stay legible', () => {
        const dark = generate_palette('#101020', 3, 'accent_tones').map(lightness)
        const light = generate_palette('#e0e0f0', 3, 'accent_tones').map(lightness)
        expect(Math.max(...dark)).toBeGreaterThan(Math.max(...light))
    })

    it('produces valid hex for every scheme', () => {
        const schemes:PaletteScheme[] = ['triadic', 'analogous', 'split_complementary',
            'complementary', 'accent_tones']
        for (const scheme of schemes) {
            for (const color of generate_palette('#3366cc', 3, scheme))
                expect(color, scheme).toMatch(/^#[0-9a-f]{6}$/)
        }
    })
})


describe('resolve_font_configs', () => {

    it('defaults every field to the body font', () => {
        const configs = resolve_font_configs(make_schema())
        for (const config of Object.values(configs))
            expect(config.family).toBe('Noto Serif')
    })

    it('falls titles 2 and 3, and the spine title, back to title 1', () => {
        const configs = resolve_font_configs(make_schema({title1_font: {family: 'Playfair Display'}}))
        expect(configs.title2.family).toBe('Playfair Display')
        expect(configs.title3.family).toBe('Playfair Display')
        expect(configs.spine_title.family).toBe('Playfair Display')
        // The subtitle is a separate branch of the chain
        expect(configs.subtitle.family).toBe('Noto Serif')
    })

    it('falls the author, and the spine author, back to the subtitle font', () => {
        const configs = resolve_font_configs(make_schema({subtitle_font: {family: 'Test Sans'}}))
        expect(configs.author.family).toBe('Test Sans')
        expect(configs.spine_author.family).toBe('Test Sans')
    })

    it('lets each field override its inherited font', () => {
        const configs = resolve_font_configs(make_schema({
            title1_font: {family: 'Playfair Display'}, title2_font: {family: 'Test Sans'}}))
        expect(configs.title2.family).toBe('Test Sans')
    })

    it('carries a custom font\'s sniffed style through the chain', () => {
        const configs = resolve_font_configs(make_schema({
            title1_font: {family: 'Uploaded', style: 'sans'}}))
        expect(configs.spine_title.style).toBe('sans')
    })

    it('resolve_font_families returns the same chain as bare family names', () => {
        const families = resolve_font_families(make_schema({title1_font: {family: 'Playfair Display'}}))
        expect(families.title2).toBe('Playfair Display')
        expect(families.body).toBe('Noto Serif')
    })
})


describe('color mixing helpers', () => {

    it('darkens toward black by the given opacity', () => {
        expect(darken_hsl('hsl(0deg, 0%, 100%)', 0.5)).toBe('hsl(0deg, 0%, 50%)')
        expect(darken_hsl('hsl(0deg, 0%, 100%)', 0)).toBe('hsl(0deg, 0%, 100%)')
        expect(darken_hsl('hsl(0deg, 0%, 100%)', 1)).toBe('hsl(0deg, 0%, 0%)')
    })

    it('mixes between two colors, accepting hex or hsl input', () => {
        expect(mix_hsl('hsl(0deg, 0%, 0%)', '#ffffff', 0)).toBe('hsl(0deg, 0%, 0%)')
        expect(mix_hsl('hsl(0deg, 0%, 0%)', '#ffffff', 1)).toBe('hsl(0deg, 0%, 100%)')
        expect(mix_hsl('hsl(0deg, 0%, 0%)', '#ffffff', 0.5)).toBe('hsl(0deg, 0%, 50%)')
    })
})


describe('all_image_regions', () => {

    it('flattens every sampled region, skipping the ones that came back null', () => {
        const r = region(0, 0.5, 0.5)
        expect(all_image_regions(uniform_regions(r))).toHaveLength(4)
        expect(all_image_regions({...uniform_regions(r), back: null, spine: null})).toHaveLength(2)
    })
})
