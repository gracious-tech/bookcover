
import {describe, it, expect} from 'vitest'

import {escape_typst, escape_typst_str, escape_typst_postfix, typst_inline} from '../src/index.js'

// escape_typst_str: only backslashes and double quotes need escaping inside a string literal
describe('escape_typst_str', () => {
    it('escapes backslashes before quotes, so an escaped quote stays escaped', () => {
        expect(escape_typst_str('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye')
    })
    it('leaves markup characters alone, since a string literal has no markup', () => {
        expect(escape_typst_str('#[*_]$')).toBe('#[*_]$')
    })
})

// escape_typst: line-start heading marker is now escaped
describe('escape_typst', () => {
    it('escapes a line-start heading marker', () => {
        expect(escape_typst('= not a heading')).toBe('\\= not a heading')
    })
    it('escapes every content-mode special character', () => {
        const specials = [...'\\#[]$*_`<>@~/+-=']
        expect(escape_typst(specials.join(''))).toBe(specials.map(c => '\\' + c).join(''))
    })
    it('leaves plain text and punctuation Typst ignores untouched', () => {
        expect(escape_typst('Hello, world! (1.0) "quoted"')).toBe('Hello, world! (1.0) "quoted"')
    })
})

// escape_typst_postfix: only a leading ( or . should be escaped
describe('escape_typst_postfix', () => {
    it('escapes a leading parenthesis', () => {
        expect(escape_typst_postfix('(aside) is fine.')).toBe('\\(aside) is fine.')
    })
    it('escapes a leading dot', () => {
        expect(escape_typst_postfix('...trailing')).toBe('\\...trailing')
    })
    it('leaves text without a leading trigger untouched', () => {
        expect(escape_typst_postfix('normal text')).toBe('normal text')
    })
    it('is a no-op after escape_typst has already neutralised a leading bracket', () => {
        expect(escape_typst_postfix(escape_typst('[x]'))).toBe('\\[x\\]')
    })
})

// typst_inline: joins a code expression to following text, escaping the seam
describe('typst_inline', () => {
    it('escapes the seam between an expression and following text', () => {
        expect(typst_inline('#v(8)', '(an aside).')).toBe('#v(8)\\(an aside).')
    })
})
