
import {describe, it, expect, vi, beforeEach} from 'vitest'
import type {CustomFont} from 'typst-fonts'

// Preview @font-face registration needs a DOM — recorded instead, failing for any family
// named 'Broken' so the store's tolerance of a failed registration can be checked
const registered:string[] = []
vi.mock('typst-fonts/web', () => ({
    register_custom_font_preview: vi.fn(async (font:CustomFont) => {
        if (font.family === 'Broken') throw new Error('bad font data')
        registered.push(font.family)
    }),
}))

// Font parsing is typst-fonts' own concern (tested there) — here, only what's handed to it
const processed:{name:string, data:Uint8Array}[][] = []
vi.mock('typst-fonts', () => ({
    process_font_files: vi.fn((files:{name:string, data:Uint8Array}[]) => {
        processed.push(files)
        return files.map(file => make_font(file.name.replace(/\.\w+$/, '')))
    }),
}))

/** A custom font family with one file of distinct bytes */
function make_font(family:string, bytes = [family.length]):CustomFont {
    return {family, style: 'sans', files: [new Uint8Array(bytes)]}
}

/** Fresh copy of the module, whose font store is per page load */
async function load(){
    registered.length = 0
    processed.length = 0
    vi.resetModules()
    return await import('../src/fonts')
}


describe('custom font store', () => {

    beforeEach(() => { vi.clearAllMocks() })

    it('serves fonts from the dev server outside a production build', async () => {
        const {fonts_prefix} = await load()
        expect(fonts_prefix).toBe('/generator_assets/fonts')
    })

    it('adds new families, skipping ones already stored or repeated in the batch', async () => {
        const {add_custom_fonts, custom_font_families} = await load()
        expect(await add_custom_fonts([make_font('A'), make_font('B')])).toEqual(['A', 'B'])
        expect(await add_custom_fonts([make_font('B'), make_font('C'), make_font('C')]))
            .toEqual(['C'])
        expect(custom_font_families.map(f => f.family)).toEqual(['A', 'B', 'C'])
        // Only the families actually added get a preview registration
        expect(registered).toEqual(['A', 'B', 'C'])
    })

    it('stores families synchronously, before the preview registration settles', async () => {
        const {add_custom_fonts, custom_font_families} = await load()
        const pending = add_custom_fonts([make_font('Sync')])
        expect(custom_font_families.map(f => f.family)).toEqual(['Sync'])
        await pending
    })

    it('keeps a family whose preview registration fails', async () => {
        const {add_custom_fonts, custom_font_families} = await load()
        expect(await add_custom_fonts([make_font('Broken')])).toEqual(['Broken'])
        expect(custom_font_families.map(f => f.family)).toEqual(['Broken'])
    })

    it('flattens every family\'s files for the generator', async () => {
        const {add_custom_fonts, all_custom_font_bytes} = await load()
        const a = make_font('A', [1])
        const b:CustomFont = {family: 'B', style: 'serif',
            files: [new Uint8Array([2]), new Uint8Array([3])]}
        await add_custom_fonts([a, b])
        expect(all_custom_font_bytes.value).toEqual([a.files[0], b.files[0], b.files[1]])
    })

    it('reads uploaded files\' bytes and names for processing', async () => {
        const {process_uploaded_files} = await load()
        const files = [
            new File([new Uint8Array([1, 2, 3])], 'Upload.ttf'),
            new File([new Uint8Array([4])], 'Other.otf'),
        ]
        expect(await process_uploaded_files(files)).toEqual(['Upload', 'Other'])
        expect(processed).toEqual([[
            {name: 'Upload.ttf', data: new Uint8Array([1, 2, 3])},
            {name: 'Other.otf', data: new Uint8Array([4])},
        ]])
    })
})
