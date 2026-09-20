
// Golden snapshots of the generated _data.typ, plus the shape of the virtual filesystem.
//
// The snapshots are the regression net for render determinism: _data.typ carries every value
// the Typst template renders from, so an accidental change to a default or a derivation shows
// up here as a diff. A DELIBERATE change to one is a RENDER_VERSION bump (see defaults.ts) —
// update the snapshot and bump the version together.

import {describe, it, expect, beforeAll} from 'vitest'

import {build} from '../src/index.js'
import {make_schema, init_test_fonts} from './helpers.js'
import type {CoverSchema} from '../src/schema.js'

const decoder = new TextDecoder()

/** Build a cover and return its _data.typ as text */
async function build_data(schema:CoverSchema):Promise<string> {
    const {files} = await build(schema)
    return decoder.decode(files.get('_data.typ'))
}

/** Read one #let binding's value out of a _data.typ */
function binding(data:string, name:string):string | undefined {
    return new RegExp(`^#let ${name} = (.*)$`, 'm').exec(data)?.[1]
}

beforeAll(() => {
    init_test_fonts()
})


describe('_data.typ golden snapshots', () => {

    it('matches for a plain text-only cover', async () => {
        expect(await build_data(make_schema())).toMatchSnapshot()
    })

    it('matches for a fully styled cover', async () => {
        const schema = make_schema({
            title3: 'Volume Two',
            title1_font: {family: 'Playfair Display'},
            title1_size: 1.4,
            title1_weight: 900,
            title1_italic: true,
            title1_color: 'hsl(40deg, 80%, 60%)',
            title_alignment: 'left',
            title_spacing: 5,
            title_margin_top: 6,
            subtitle_font: {family: 'Test Sans'},
            subtitle_weight: 300,
            subtitle: 'A journey\nthrough software craft',
            author_alignment: 'right',
            blurb_alignment: 'justified',
            blurb_padding: 6,
            blurb_width: 80,
            blurb_spacing: 1.4,
            blurb_bg_color: 'hsl(0deg, 0%, 96%)',
            bg_color: 'hsl(237deg, 28%, 14%)',
            bg_color_gradient: true,
            spine_color: 'hsl(234deg, 88%, 73%)',
            margin_front: 10,
            margin_back: 7,
            home_print_margin: true,
        })
        expect(await build_data(schema)).toMatchSnapshot()
    })

    it('matches for a cover carrying assets and a custom size', async () => {
        const schema = make_schema({
            service_id: 'custom',
            size_id: undefined,
            page_count: undefined,
            binding_type: 'paperback_coil',
            custom_unit: 'mm',
            custom_trim_width: 148,
            custom_trim_height: 210,
            custom_bleed: 3,
            custom_spine: 12,
            icon_id: 'builtin:cross',
            icon_mode: 'echo',
            icon_size: 1.5,
            icon_spine: true,
            pattern: 'bamboo',
            pattern_tile_mm: 40,
            pattern_color: 'hsl(200deg, 30%, 40%)',
        })
        expect(await build_data(schema)).toMatchSnapshot()
    })

    it('matches for a multilingual cover with per-field font fallbacks', async () => {
        const schema = make_schema({
            title1: '日本語',
            title2: 'の本',
            subtitle: 'שלום',
            author: '홍길동',
            blurb: '日本語のテキストです。这是简体中文。',
            cjk_variant: 'auto',
        })
        expect(await build_data(schema)).toMatchSnapshot()
    })
})


describe('build output', () => {

    it('always emits the templates and the data file, and nothing else unasked', async () => {
        const {files} = await build(make_schema({isbn: ''}))
        expect([...files.keys()].sort()).toEqual(['_data.typ', '_helpers.typ', 'cover.typ'])
    })

    it('returns the resolved dimensions alongside the files', async () => {
        const {dims} = await build(make_schema())
        expect(dims.cover_total_width.toNumber()).toBeGreaterThan(0)
    })

    it('is deterministic — the same schema builds byte-identical files', async () => {
        const first = await build(make_schema())
        const second = await build(make_schema())
        expect([...second.files.keys()]).toEqual([...first.files.keys()])
        for (const [name, bytes] of first.files)
            expect(second.files.get(name), name).toEqual(bytes)
    })

    it('adds a barcode only when there is an ISBN', async () => {
        const {files} = await build(make_schema())
        expect(files.has('barcode.svg')).toBe(true)
        expect(binding(decoder.decode(files.get('_data.typ')), 'has_barcode')).toBe('true')
        const {files: none} = await build(make_schema({isbn: ''}))
        expect(none.has('barcode.svg')).toBe(false)
    })

    it('emits four recolored variants for an icon', async () => {
        const {files} = await build(make_schema({icon_id: 'builtin:cross'}))
        expect(files.has('icon_main.svg')).toBe(true)
        expect(files.has('icon_ghost.svg')).toBe(true)
        expect(files.has('icon_ghost2.svg')).toBe(true)
        expect(files.has('icon_spine.svg')).toBe(true)
        // The ghosts are faded toward the background, so no two variants are identical
        const svg = (name:string) => decoder.decode(files.get(name))
        expect(svg('icon_main.svg')).not.toBe(svg('icon_ghost.svg'))
        expect(svg('icon_main.svg')).toContain('<svg')
    })

    it('strips the deg suffix when recoloring an icon, which resvg cannot parse', async () => {
        const {files} = await build(make_schema({
            icon_id: 'builtin:cross', icon_color: 'hsl(200deg, 50%, 40%)'}))
        const svg = decoder.decode(files.get('icon_main.svg'))
        expect(svg).toContain('hsl(200, 50%, 40%)')
        expect(svg).not.toContain('currentColor')
    })

    it('resolves a pattern id to a recolored tile and records its aspect ratio', async () => {
        const {files} = await build(make_schema({pattern: 'bamboo', pattern_tile_mm: 40}))
        expect(decoder.decode(files.get('pattern.svg'))).toContain('<svg')
        const data = decoder.decode(files.get('_data.typ'))
        expect(binding(data, 'has_pattern')).toBe('true')
        // Bamboo's tile is 16x32, so the height comes out at twice the width
        expect(binding(data, 'pattern_tile_w')).toBe('40.0000mm')
        expect(binding(data, 'pattern_tile_h')).toBe('80.0000mm')
    })

    it('renders a vector background as a stretched full-wrap image', async () => {
        const {files} = await build(make_schema({bg_vector_id: 'big-leaf-cluster'}))
        expect(files.has('background.svg')).toBe(true)
        const data = decoder.decode(files.get('_data.typ'))
        expect(binding(data, 'image_is_vector')).toBe('true')
        expect(binding(data, 'image_coverage')).toBe('"full"')
    })

    it('recolors a vector background from the resolved background color', async () => {
        const {files} = await build(make_schema({
            bg_vector_id: 'big-leaf-cluster', bg_color: 'hsl(0deg, 0%, 20%)'}))
        const svg = decoder.decode(files.get('background.svg'))
        // The placeholder colors the source SVG ships with must all be gone
        for (const placeholder of ['#6e79ac', '#be89b3', '#76538e'])
            expect(svg.toLowerCase(), placeholder).not.toContain(placeholder)
    })

    it('warns and skips a vector background id this version no longer has', async () => {
        const warnings:unknown[] = []
        const original = console.warn
        console.warn = (...args:unknown[]) => warnings.push(args)
        try {
            const {files} = await build(make_schema({bg_vector_id: 'no-such-design'}))
            expect(files.has('background.svg')).toBe(false)
        } finally {
            console.warn = original
        }
        expect(String(warnings[0])).toContain('no-such-design')
    })

    it('embeds a supplied background image under its own extension', async () => {
        const image = {data: new Uint8Array([0xff, 0xd8, 0xff]), ext: '.jpg'}
        const {files} = await build(make_schema(), image)
        expect(files.get('background.jpg')).toEqual(image.data)
        expect(binding(decoder.decode(files.get('_data.typ')), 'image_filename'))
            .toBe('"background.jpg"')
    })
})


describe('build derivations', () => {

    it('derives the spine text from the titles and author when unset', async () => {
        const data = await build_data(make_schema({title1: 'The', title2: 'Art of Code'}))
        expect(binding(data, 'spine_title')).toBe('"The Art of Code"')
        expect(binding(data, 'spine_author')).toBe('"Alice Chen"')
    })

    it('honours explicitly empty spine text, which is not the same as unset', async () => {
        const data = await build_data(make_schema({spine_title: '', spine_author: ''}))
        expect(binding(data, 'spine_title')).toBe('""')
        expect(binding(data, 'spine_author')).toBe('""')
    })

    it('escapes a quote in a text field rather than breaking the Typst string', async () => {
        const data = await build_data(make_schema({title1: 'He said "hi"'}))
        expect(binding(data, 'title1')).toBe('"He said \\"hi\\""')
    })

    it('wraps each CJK sentence of the blurb in its own regional font', async () => {
        // The chosen font stays first, then the sentence's own region, then the rest of the chain
        const data = await build_data(make_schema({blurb: '日本語です。这是简体。'}))
        expect(data).toContain('#text(font: ("Noto Serif", "Noto Serif JP", "Noto Serif SC",))[日本語です。]')
        expect(data).toContain('#text(font: ("Noto Serif", "Noto Serif SC", "Noto Serif JP",))[这是简体。]')
    })

    it('puts each field\'s own fallback chain in its font list', async () => {
        const data = await build_data(make_schema({title1: 'שלום', subtitle: 'Latin only'}))
        expect(binding(data, 'font_title1_family')).toBe('("Noto Serif", "Noto Serif Hebrew",)')
        expect(binding(data, 'font_subtitle_family')).toBe('("Noto Serif",)')
    })

    it('gives the body font every fallback any field references', async () => {
        const data = await build_data(make_schema({title1: 'שלום', subtitle: 'テキスト'}))
        const body = binding(data, 'font_body_family')!
        expect(body).toContain('Noto Serif Hebrew')
        expect(body).toContain('Noto Serif JP')
    })

    it('reserves a spine-side margin for the punched holes of a coil binding', async () => {
        const coil = {service_id: 'custom' as const, size_id: undefined, page_count: undefined,
            custom_unit: 'mm', custom_trim_width: 148, custom_trim_height: 210, custom_spine: 12,
            custom_bleed: 3}
        const spiral = await build_data(make_schema({...coil, binding_type: 'paperback_coil'}))
        const plain = await build_data(make_schema({...coil, binding_type: 'paperback'}))
        expect(binding(spiral, 'spiral_margin')).toBe('7.0000mm')
        expect(binding(plain, 'spiral_margin')).toBe('0.0000mm')
        expect(binding(spiral, 'front_content_w')).not.toBe(binding(plain, 'front_content_w'))
    })

    it('flattens a justified blurb into a left alignment plus the justify flag', async () => {
        const data = await build_data(make_schema({blurb_alignment: 'justified'}))
        expect(binding(data, 'blurb_alignment')).toBe('left')
        expect(binding(data, 'blurb_justify')).toBe('true')
    })

    it('marks which text fields actually have content', async () => {
        const data = await build_data(make_schema({title2: '', title3: '   ', subtitle: ''}))
        expect(binding(data, 'has_title1')).toBe('true')
        expect(binding(data, 'has_title2')).toBe('false')
        expect(binding(data, 'has_title3')).toBe('false')
        expect(binding(data, 'has_subtitle')).toBe('false')
    })

    it('clamps the blurb width to the back panel\'s content width', async () => {
        const data = await build_data(make_schema({blurb_width: 100, margin_back: 20}))
        const width = parseFloat(binding(data, 'blurb_width')!)
        const content = parseFloat(binding(data, 'back_content_w')!)
        expect(width).toBeLessThanOrEqual(content)
    })
})
