// Note: manifest.ts holds module-level state, so the "before load" test runs first, then
// load_fonts_dir() applies for the rest of the file (vitest isolates modules per test file)

import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {load_fonts_dir, resolve_font_dirs, write_custom_fonts} from '../src/node.js'
import {get_fonts, get_bundled_font} from '../src/manifest.js'

import type {BundledFont} from '../src/manifest.js'
import type {CustomFont} from '../src/custom.js'


const TEST_MANIFEST:BundledFont[] = [
    {family: 'Noto Serif', group: 'Noto', style: 'serif',
        files: ['NotoSerif-Regular.ttf'], preview_file: 'NotoSerif-Regular.ttf'},
    {family: 'Test Sans', group: 'Test', style: 'sans',
        files: ['TestSans-Regular.ttf'], preview_file: 'TestSans-Regular.ttf'},
]

// A per-file scratch directory holding the manifest, removed afterwards
let fonts_dir:string
beforeAll(() => {
    fonts_dir = mkdtempSync(join(tmpdir(), 'typst-fonts-node-'))
    writeFileSync(join(fonts_dir, 'manifest.json'), JSON.stringify(TEST_MANIFEST))
})
afterAll(() => {
    rmSync(fonts_dir, {recursive: true, force: true})
})


describe('load_fonts_dir', () => {

    it('leaves the manifest uninitialised until it runs', () => {
        expect(() => get_fonts()).toThrow(/init_fonts/)
    })

    it('fails when the directory has no manifest.json', async () => {
        await expect(load_fonts_dir(join(fonts_dir, 'missing'))).rejects.toThrow(/ENOENT/)
    })

    it('initialises the curated manifest from <dir>/manifest.json', async () => {
        await load_fonts_dir(fonts_dir)
        expect(get_fonts().map(f => f.family)).toEqual(['Noto Serif', 'Test Sans'])
        expect(get_bundled_font('Test Sans')?.style).toBe('sans')
    })
})


describe('resolve_font_dirs', () => {

    it('maps curated families to <dir>/<family> and Noto fallbacks to <dir>/_noto/<family>', () => {
        expect(resolve_font_dirs(fonts_dir, ['Test Sans', 'Noto Sans Arabic'])).toEqual([
            join(fonts_dir, 'Test Sans'),
            join(fonts_dir, '_noto', 'Noto Sans Arabic'),
        ])
    })

    it('prefers the curated entry when a family is both curated and a Noto fallback', () => {
        // Noto Serif is in the curated manifest and the bundled fallback set alike
        expect(resolve_font_dirs(fonts_dir, ['Noto Serif'])).toEqual([join(fonts_dir, 'Noto Serif')])
    })

    it('drops families it has no files for', () => {
        expect(resolve_font_dirs(fonts_dir, ['Nonexistent Font', 'Test Sans']))
            .toEqual([join(fonts_dir, 'Test Sans')])
    })
})


describe('write_custom_fonts', () => {

    it('writes each family\'s files into its own subdirectory and returns those directories', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'typst-fonts-custom-'))
        try {
            const fonts:CustomFont[] = [
                {family: 'Upload One', style: 'serif',
                    files: [new Uint8Array([1, 2]), new Uint8Array([3])]},
                {family: 'Upload Two', style: 'sans', files: [new Uint8Array([4])]},
            ]
            const dirs = await write_custom_fonts(dir, fonts)
            expect(dirs).toEqual([join(dir, 'Upload One'), join(dir, 'Upload Two')])

            // Every byte array lands as its own numbered file, unchanged
            expect(readdirSync(join(dir, 'Upload One')).sort()).toEqual(['file-0.ttf', 'file-1.ttf'])
            expect([...readFileSync(join(dir, 'Upload One', 'file-1.ttf'))]).toEqual([3])
            expect([...readFileSync(join(dir, 'Upload Two', 'file-0.ttf'))]).toEqual([4])
        } finally {
            rmSync(dir, {recursive: true, force: true})
        }
    })

    it('writes nothing and returns no directories for no fonts', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'typst-fonts-custom-'))
        try {
            expect(await write_custom_fonts(dir, [])).toEqual([])
            expect(readdirSync(dir)).toEqual([])
        } finally {
            rmSync(dir, {recursive: true, force: true})
        }
    })
})
