
// blurb_to_text() replaces Tiptap's generateText() on the critical path (see blurb_text.ts),
// so these pin it against the real thing — if they diverge, the preview text silently changes

import {describe, it, expect} from 'vitest'
import {generateText} from '@tiptap/core'
import type {PmDoc} from 'pm-to-typst'
import {blurb_extensions} from '../src/blurb_extensions'
import {blurb_to_text, blurb_has_text} from '../src/blurb_text'
import {make_form} from '../src/form_state'

// Compare against Tiptap's own flattening for a given document. Inter-block whitespace is
// normalised away on purpose — that part differs by design (see blurb_text.ts); the point of
// these is that the TEXT CONTENT, and its order, stays identical to what Tiptap produces
function normalise(value:string):string {
    return value.trim().split(/\s+/).join(' ')
}
function expect_matches_tiptap(doc:PmDoc):void {
    expect(normalise(blurb_to_text(doc))).toBe(normalise(generateText(doc, blurb_extensions)))
}

const text = (value:string) => ({type: 'text', text: value})
const para = (...content:unknown[]) => ({type: 'paragraph', content})
const doc = (...content:unknown[]):PmDoc => ({type: 'doc', content} as PmDoc)

describe('blurb_to_text', () => {

    it('matches Tiptap on the demo blurb shipped in the default form', () => {
        expect_matches_tiptap(make_form().blurb)
    })

    it('matches Tiptap on an empty paragraph (the blank-form document)', () => {
        expect_matches_tiptap(doc({type: 'paragraph'}))
    })

    it('matches Tiptap across paragraphs, headings and marks', () => {
        expect_matches_tiptap(doc(
            {type: 'heading', attrs: {level: 1}, content: [text('A heading')]},
            para(text('Plain '), {type: 'text', text: 'bold', marks: [{type: 'bold'}]}),
            para(text('Second paragraph')),
        ))
    })

    it('matches Tiptap on nested blocks — lists and blockquotes', () => {
        expect_matches_tiptap(doc(
            {type: 'bulletList', content: [
                {type: 'listItem', content: [para(text('first'))]},
                {type: 'listItem', content: [para(text('second'))]},
            ]},
            {type: 'blockquote', content: [para(text('quoted'))]},
        ))
    })

    it('separates leaf blocks with exactly one blank line', () => {
        expect(blurb_to_text(doc(para(text('one')), para(text('two'))))).toBe('one\n\ntwo')
    })

    it('matches Tiptap on childless leaves — hardBreak and horizontalRule', () => {
        expect_matches_tiptap(doc(
            para(text('before'), {type: 'hardBreak'}, text('after')),
            {type: 'horizontalRule'},
            para(text('end')),
        ))
    })

    it('matches Tiptap on a code block', () => {
        expect_matches_tiptap(doc({type: 'codeBlock', content: [text('some code')]}))
    })

})

describe('blurb_has_text', () => {

    it('is false for a blank document and true once text is present', () => {
        expect(blurb_has_text(doc({type: 'paragraph'}))).toBe(false)
        expect(blurb_has_text(doc(para(text('   '))))).toBe(false)
        expect(blurb_has_text(doc(para(text('hello'))))).toBe(true)
    })

    it('is false for a missing document', () => {
        expect(blurb_has_text(null)).toBe(false)
        expect(blurb_has_text(undefined)).toBe(false)
    })

})

