
import {describe, it, expect} from 'vitest'

import {text_dir} from '../src/utils.js'

describe('text_dir', () => {

    it('takes the direction of the first letter, skipping neutral characters', () => {
        expect(text_dir('שלום world')).toBe('rtl')
        expect(text_dir('Hello עולם')).toBe('ltr')
        expect(text_dir('  "3. שלום!"')).toBe('rtl')
        expect(text_dir('(42) - Hello')).toBe('ltr')
    })

    it('recognises every modern RTL script', () => {
        for (const sample of ['مرحبا', 'سلام', 'ܫܠܡܐ', 'ދިވެހި', 'ߒߞߏ', 'ࠀࠁ', 'ࡀࡁ', '𞤀𞤁'])
            expect(text_dir(sample)).toBe('rtl')
    })

    it('treats LTR scripts other than Latin as LTR', () => {
        for (const sample of ['Ελληνικά', 'Русский', 'हिंदी', 'ภาษาไทย', '日本語', '한국어', 'ქართული'])
            expect(text_dir(sample)).toBe('ltr')
    })

    it('falls back to LTR for text with no letters at all', () => {
        expect(text_dir('')).toBe('ltr')
        expect(text_dir('123 — 456!')).toBe('ltr')
        expect(text_dir('١٢٣')).toBe('ltr')
    })

    it('honours explicit direction marks typed ahead of the text', () => {
        expect(text_dir('‏123 Hello')).toBe('rtl')
        expect(text_dir('‎שלום')).toBe('ltr')
        expect(text_dir('؜123')).toBe('rtl')
    })
})

