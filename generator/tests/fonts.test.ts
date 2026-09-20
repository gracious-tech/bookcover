
import {describe, it, expect, beforeAll} from 'vitest'

import {collect_fonts, collect_all_fonts, collect_fallback_fonts, all_fonts_bundled,
    resolve_cjk_variant, resolve_field_cjk_variant} from '../src/fonts.js'
import {make_schema, init_test_fonts} from './helpers.js'

const JAPANESE = '日本語のテキストです。'
const SIMPLIFIED = '这是简体中文。'
const HEBREW = 'שלום'

// Everything here reads the curated manifest, which the platform wrapper normally loads
beforeAll(() => {
    init_test_fonts()
})


describe('collect_fonts', () => {

    it('always puts the base font first', () => {
        expect(collect_fonts(make_schema())[0]).toBe('Noto Serif')
    })

    it('adds each chosen family once, sorted, without repeating the base font', () => {
        const schema = make_schema({
            title1_font: {family: 'Test Sans'},
            subtitle_font: {family: 'Playfair Display'},
            author_font: {family: 'Test Sans'},
            blurb_font: {family: 'Noto Serif'},
        })
        expect(collect_fonts(schema)).toEqual(['Noto Serif', 'Playfair Display', 'Test Sans'])
    })

    it('reports whether every chosen family is in the curated manifest', () => {
        expect(all_fonts_bundled(make_schema({title1_font: {family: 'Test Sans'}}))).toBe(true)
        expect(all_fonts_bundled(make_schema({title1_font: {family: 'Uploaded Family'}}))).toBe(false)
    })
})


describe('collect_fallback_fonts', () => {

    it('finds nothing to fall back to for Latin-only text', () => {
        expect(collect_fallback_fonts(make_schema())).toEqual([])
    })

    it('adds one Noto family per non-Latin script present', () => {
        const fallback = collect_fallback_fonts(make_schema({title1: HEBREW, subtitle: JAPANESE}))
        expect(fallback).toContain('Noto Serif Hebrew')
        expect(fallback).toContain('Noto Serif JP')
    })

    it('matches the fallback style to the field\'s own font', () => {
        const sans = collect_fallback_fonts(make_schema({
            title1: HEBREW, title1_font: {family: 'Test Sans'}}))
        expect(sans).toContain('Noto Sans Hebrew')
        const serif = collect_fallback_fonts(make_schema({
            title1: HEBREW, title1_font: {family: 'Playfair Display'}}))
        expect(serif).toContain('Noto Serif Hebrew')
    })

    it('uses a custom family\'s sniffed style, since it is not in the manifest', () => {
        const fallback = collect_fallback_fonts(make_schema({
            title1: HEBREW, title1_font: {family: 'Uploaded Family', style: 'sans'}}))
        expect(fallback).toContain('Noto Sans Hebrew')
    })

    it('scans the derived spine text, not just the fields the user typed', () => {
        // The spine falls back to the titles, and its own font style picks the Noto family
        const fallback = collect_fallback_fonts(make_schema({
            title1: JAPANESE, title1_font: {family: 'Test Sans'}}))
        expect(fallback).toContain('Noto Sans JP')
    })

    it('covers every region a mixed-language blurb uses', () => {
        const fallback = collect_fallback_fonts(make_schema({blurb: `${JAPANESE}${SIMPLIFIED}`}))
        expect(fallback).toContain('Noto Serif JP')
        expect(fallback).toContain('Noto Serif SC')
    })
})


describe('collect_all_fonts', () => {

    it('is the chosen families plus their fallbacks, with no repeats', () => {
        const schema = make_schema({title1: HEBREW, title1_font: {family: 'Playfair Display'}})
        const all = collect_all_fonts(schema)
        expect(all).toEqual([...new Set(all)])
        expect(all).toContain('Noto Serif')
        expect(all).toContain('Playfair Display')
        expect(all).toContain('Noto Serif Hebrew')
    })

    it('is just the chosen families for a Latin-only cover', () => {
        expect(collect_all_fonts(make_schema())).toEqual(['Noto Serif'])
    })
})


describe('resolve_cjk_variant', () => {

    it('lets an explicit setting win cover-wide', () => {
        expect(resolve_cjk_variant(make_schema({title1: JAPANESE, cjk_variant: 'TC'}))).toBe('TC')
    })

    it('detects the region from the cover\'s own text in auto mode', () => {
        expect(resolve_cjk_variant(make_schema({title1: JAPANESE, cjk_variant: 'auto'}))).toBe('JP')
        expect(resolve_cjk_variant(make_schema({blurb: SIMPLIFIED, title1: '', title2: '',
            subtitle: '', author: ''}))).toBe('SC')
    })

    it('treats an unset cjk_variant the same as auto', () => {
        expect(resolve_cjk_variant(make_schema({title1: JAPANESE}))).toBe('JP')
    })
})


describe('resolve_field_cjk_variant', () => {

    it('lets each field decide for itself in auto mode', () => {
        const schema = make_schema({title1: JAPANESE, blurb: SIMPLIFIED})
        expect(resolve_field_cjk_variant(schema, JAPANESE)).toBe('JP')
        expect(resolve_field_cjk_variant(schema, SIMPLIFIED)).toBe('SC')
    })

    it('inherits the cover-wide detection for a field with no signal of its own', () => {
        const schema = make_schema({title1: JAPANESE})
        expect(resolve_field_cjk_variant(schema, 'Latin only')).toBe('JP')
    })

    it('applies an explicit setting to every field, whatever the field says', () => {
        const schema = make_schema({title1: JAPANESE, cjk_variant: 'HK'})
        expect(resolve_field_cjk_variant(schema, SIMPLIFIED)).toBe('HK')
    })
})
