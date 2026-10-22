import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {rename_font_family, fix_font_names, check_font_names} from '../src/download/names.js'
import {read_name_records, typst_family} from '../src/sfnt.js'
import {build_test_font, type TestNameRecord} from './helpers.js'


// Name records shaped like Google Fonts' static Merriweather 24pt Regular
const MERRIWEATHER_24PT:TestNameRecord[] = [
    {platform_id: 3, name_id: 1, value: 'Merriweather 24pt'},
    {platform_id: 3, name_id: 2, value: 'Regular'},
    {platform_id: 3, name_id: 3, value: '2.100;STC;Merriweather24pt-Regular'},
    {platform_id: 3, name_id: 4, value: 'Merriweather 24pt Regular'},
    {platform_id: 3, name_id: 6, value: 'Merriweather24pt-Regular'},
    {platform_id: 3, name_id: 7, value: 'Merriweather is a trademark of Sorkin Type Co.'},
    {platform_id: 3, name_id: 16, value: 'Merriweather 24pt'},
]

// Map of name ID -> value for a font's records
function names(data:Uint8Array):Record<number, string> {
    return Object.fromEntries(read_name_records(data).map(r => [r.name_id, r.value]))
}

// Sum of a byte range as big-endian uint32s, mod 2^32
function checksum(bytes:Uint8Array):number {
    let sum = 0
    for (let i = 0; i < bytes.length; i += 4) {
        sum = (sum + ((((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16)
            | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0)) >>> 0
    }
    return sum
}


describe('rename_font_family', () => {

    it('renames the family throughout the name table, PostScript forms included', () => {
        const font = build_test_font({family: '', name_records: MERRIWEATHER_24PT})
        const renamed = rename_font_family(font, 'Merriweather 24pt', 'Merriweather')
        expect(names(renamed)).toEqual({
            1: 'Merriweather',
            2: 'Regular',
            3: '2.100;STC;Merriweather-Regular',
            4: 'Merriweather Regular',
            6: 'Merriweather-Regular',
            7: 'Merriweather is a trademark of Sorkin Type Co.',
            16: 'Merriweather',
        })
        expect(typst_family(renamed)).toBe('Merriweather')
    })

    it('leaves the other tables byte-identical and writes valid table checksums', () => {
        const font = build_test_font({family: '', family_class: 3, name_records: MERRIWEATHER_24PT})
        const renamed = rename_font_family(font, 'Merriweather 24pt', 'Merriweather')
        const view = new DataView(renamed.buffer)
        const table = (data:Uint8Array, tag:string) => {
            const v = new DataView(data.buffer, data.byteOffset)
            for (let i = 0; i < v.getUint16(4); i++) {
                const rec = 12 + i * 16
                if (String.fromCharCode(...data.subarray(rec, rec + 4)) === tag) {
                    return {rec, body: data.subarray(v.getUint32(rec + 8),
                        v.getUint32(rec + 8) + v.getUint32(rec + 12))}
                }
            }
            throw new Error(`no ${tag}`)
        }
        expect(table(renamed, 'OS/2').body).toEqual(table(font, 'OS/2').body)
        for (const tag of ['name', 'OS/2']) {
            const {rec, body} = table(renamed, tag)
            expect(view.getUint32(rec + 4)).toBe(checksum(body))
        }
    })

    it('copies tables rather than editing the input, even from a Node Buffer', () => {
        // Shaped like readFile()'s result: a Buffer over the whole file, where slice() is a view
        const font = Buffer.from(build_test_font({family: '', with_head: true,
            name_records: MERRIWEATHER_24PT}).buffer)
        const original = Uint8Array.from(font)
        const renamed = rename_font_family(font, 'Merriweather 24pt', 'Merriweather')
        expect(Uint8Array.from(font)).toEqual(original)
        expect(renamed.subarray(0, 12)).toEqual(original.subarray(0, 12))
    })

    it('recomputes head checkSumAdjustment so the whole file sums to 0xB1B0AFBA', () => {
        const font = build_test_font({family: '', with_head: true, name_records: MERRIWEATHER_24PT})
        const renamed = rename_font_family(font, 'Merriweather 24pt', 'Merriweather')
        const view = new DataView(renamed.buffer)
        expect(checksum(renamed)).toBe(0xB1B0AFBA)

        // head's own directory checksum is taken with the adjustment zeroed
        for (let i = 0; i < view.getUint16(4); i++) {
            const rec = 12 + i * 16
            if (String.fromCharCode(...renamed.subarray(rec, rec + 4)) !== 'head') continue
            const head = renamed.slice(view.getUint32(rec + 8), view.getUint32(rec + 8) + 54)
            new DataView(head.buffer).setUint32(8, 0)
            expect(view.getUint32(rec + 4)).toBe(checksum(head))
        }
    })

    it('respaces a Noto family in its family records but not its PostScript ones', () => {
        const font = build_test_font({family: '', name_records: [
            {platform_id: 1, name_id: 1, value: 'Noto Sans PhagsPa'},
            {platform_id: 3, name_id: 1, value: 'Noto Sans PhagsPa'},
            {platform_id: 3, name_id: 6, value: 'NotoSansPhagsPa-Regular'},
        ]})
        const records = read_name_records(
            rename_font_family(font, 'Noto Sans PhagsPa', 'Noto Sans Phags Pa'))
        expect(records.map(r => r.value))
            .toEqual(['Noto Sans Phags Pa', 'Noto Sans Phags Pa', 'NotoSansPhagsPa-Regular'])
    })
})


describe('fix_font_names / check_font_names', () => {

    let dir:string
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'typst-fonts-names-'))
    })
    afterEach(() => {
        rmSync(dir, {recursive: true, force: true})
    })

    // Write a test font with the given name records, returning its path
    const write = (file:string, name_records:TestNameRecord[]) => {
        const path = join(dir, file)
        writeFileSync(path, build_test_font({family: '', name_records}))
        return path
    }

    it('renames respellings so the check passes', async () => {
        const files = [
            {family: 'Merriweather', path: write('a.ttf', MERRIWEATHER_24PT)},
            {family: 'Noto Sans Egyptian Hieroglyphs', path: write('b.otf', [
                {platform_id: 3, name_id: 1, value: 'Noto Sans EgyptHiero'},
                {platform_id: 3, name_id: 16, value: 'Noto Sans Egyptian Hieroglyphs'},
            ])},
            {family: 'Noto Sans OldItalic', path: write('c.otf', [
                {platform_id: 3, name_id: 1, value: 'Noto Sans Old Italic'},
            ])},
        ]
        await expect(check_font_names(files)).rejects.toThrow('3 font files')
        await fix_font_names(files)
        await check_font_names(files)
        expect(files.map(f => typst_family(readFileSync(f.path))))
            .toEqual(['Merriweather', 'Noto Sans Egyptian Hieroglyphs', 'Noto Sans OldItalic'])
    })

    it('leaves correct files untouched and unrelated names for the check to report', async () => {
        const right = write('right.ttf', [{platform_id: 3, name_id: 1, value: 'Lora'}])
        const wrong = write('wrong.ttf', [{platform_id: 3, name_id: 1, value: 'Comic Sans'}])
        const before = readFileSync(right)
        const files = [{family: 'Lora', path: right}, {family: 'Raleway', path: wrong},
            {family: 'Bevan', path: join(dir, 'missing.ttf')}]
        await fix_font_names(files)
        expect(readFileSync(right)).toEqual(before)
        await expect(check_font_names(files)).rejects.toThrow(
            /2 font files[\s\S]*Typst reads "Comic Sans", listed as "Raleway"[\s\S]*missing/)
    })
})
