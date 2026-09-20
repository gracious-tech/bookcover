
import {describe, it, expect} from 'vitest'

import {pm_to_typst, typst_renderer} from '../src/typst.js'
import {doc, para, node, node_with, text, empty_doc} from './helpers.js'


describe('text and marks', () => {

    it('renders plain text', () => {
        expect(pm_to_typst(doc(para(text('Hello world'))))).toBe('Hello world')
    })

    it('escapes Typst syntax in literal text', () => {
        // A line-start = would otherwise become a heading, and brackets open a content block
        expect(pm_to_typst(doc(para(text('= [x]'))))).toBe('\\= \\[x\\]')
    })

    it('applies each emphasis mark', () => {
        expect(pm_to_typst(doc(para(text('a', 'bold'))))).toBe('*a*')
        expect(pm_to_typst(doc(para(text('a', 'italic'))))).toBe('_a_')
        expect(pm_to_typst(doc(para(text('a', 'strike'))))).toBe('#strike[a]')
        expect(pm_to_typst(doc(para(text('a', 'underline'))))).toBe('#underline[a]')
        expect(pm_to_typst(doc(para(text('a', 'subscript'))))).toBe('#sub[a]')
        expect(pm_to_typst(doc(para(text('a', 'superscript'))))).toBe('#super[a]')
    })

    it('nests stacked marks inner-out', () => {
        expect(pm_to_typst(doc(para(text('a', 'bold', 'italic'))))).toBe('_*a*_')
    })

    it('renders inline code as Typst raw, unescaped but string-escaped', () => {
        expect(pm_to_typst(doc(para(text('a "b" \\c', 'code'))))).toBe('#raw("a \\"b\\" \\\\c")')
    })

    it('collapses a link to its plain text — the cover stays link-free', () => {
        const link = {type: 'link', attrs: {href: 'https://example.com'}}
        expect(pm_to_typst(doc(para(text('click here', link))))).toBe('click here')
    })

    it('renders an unmarked text node with no marks array', () => {
        expect(pm_to_typst(doc(para({type: 'text', text: 'bare'})))).toBe('bare')
    })
})


describe('block nodes', () => {

    it('separates block children with a blank line', () => {
        expect(pm_to_typst(doc(para(text('one')), para(text('two'))))).toBe('one\n\ntwo')
    })

    it('renders headings at their level', () => {
        expect(pm_to_typst(doc(node_with('heading', {level: 2}, text('Title'))))).toBe('== Title')
    })

    it('defaults a heading with no level to level 1', () => {
        expect(pm_to_typst(doc(node('heading', text('Title'))))).toBe('= Title')
    })

    it('renders bullet and ordered lists with Typst markers', () => {
        const items = [
            node('listItem', para(text('one'))),
            node('listItem', para(text('two'))),
        ]
        expect(pm_to_typst(doc(node('bulletList', ...items)))).toBe('- one\n- two')
        expect(pm_to_typst(doc(node('orderedList', ...items)))).toBe('+ one\n+ two')
    })

    it('indents a list item\'s wrapped lines under its marker', () => {
        const item = node('listItem', para(text('one')), para(text('still one')))
        expect(pm_to_typst(doc(node('bulletList', item)))).toBe('- one\n  \n  still one')
    })

    it('wraps a blockquote in a Typst quote block', () => {
        expect(pm_to_typst(doc(node('blockquote', para(text('quoted')))))).toBe('#quote[quoted]')
    })

    it('renders a horizontal rule and a hard break', () => {
        expect(pm_to_typst(doc(node('horizontalRule')))).toBe('#line(length: 100%)')
        expect(pm_to_typst(doc(para(text('a'), node('hardBreak'), text('b'))))).toBe('a\\\nb')
    })

    it('renders a code block raw, taking its text unescaped', () => {
        const block = node('codeBlock', text('let x = [1]'))
        expect(pm_to_typst(doc(block))).toBe('#raw(block: true, "let x = [1]")')
    })

    it('aligns blocks that carry a supported textAlign', () => {
        expect(pm_to_typst(doc(node_with('paragraph', {textAlign: 'center'}, text('a')))))
            .toBe('#align(center)[a]')
        expect(pm_to_typst(doc(node_with('heading', {level: 1, textAlign: 'right'}, text('a')))))
            .toBe('#align(right)[= a]')
    })

    it('leaves left and justify unaligned — neither maps onto a Typst #align call', () => {
        expect(pm_to_typst(doc(node_with('paragraph', {textAlign: 'left'}, text('a'))))).toBe('a')
        expect(pm_to_typst(doc(node_with('paragraph', {textAlign: 'justify'}, text('a'))))).toBe('a')
    })
})


describe('whitespace handling', () => {

    it('renders a blank editor document as an empty string', () => {
        expect(pm_to_typst(empty_doc())).toBe('')
    })

    it('collapses runs of blank lines and trims the result', () => {
        const blanks = doc(para(), para(), para(text('content')), para(), para())
        expect(pm_to_typst(blanks)).toBe('content')
    })
})


describe('extending the renderer', () => {

    it('registers a handler for an unknown node type', () => {
        const custom = {nodes: {callout: (_n:unknown, ctx:{children:() => string}) =>
            `#block[${ctx.children()}]`}}
        expect(pm_to_typst(doc(node('callout', para(text('note')))), custom)).toBe('#block[note]')
    })

    it('registers a handler for an unknown mark type', () => {
        const custom = {marks: {highlight: (_m:unknown, inner:string) => `#highlight[${inner}]`}}
        expect(pm_to_typst(doc(para(text('a', 'highlight'))), custom)).toBe('#highlight[a]')
    })

    it('overrides the text extension point (where the cover injects curly quotes)', () => {
        const custom = {text: (n:{text?:string}) => (n.text ?? '').replace(/"/g, '“')}
        expect(pm_to_typst(doc(para(text('"quoted"'))), custom)).toBe('“quoted“')
    })

    it('overrides a built-in handler without dropping the rest', () => {
        const custom = {nodes: {blockquote: () => 'REPLACED'}}
        const input = doc(node('blockquote', para(text('x'))), para(text('a', 'bold')))
        expect(pm_to_typst(input, custom)).toBe('REPLACED\n\n*a*')
    })

    it('leaves the base renderer untouched when extended', () => {
        pm_to_typst(doc(para(text('x'))), {nodes: {paragraph: () => 'REPLACED'}})
        expect(typst_renderer.nodes['paragraph']).toBeDefined()
        expect(pm_to_typst(doc(para(text('x'))))).toBe('x')
    })
})


describe('unknown node types', () => {

    it('falls back to rendering children, so unregistered nodes keep their text', () => {
        expect(pm_to_typst(doc(node('mystery', para(text('kept')))))).toBe('kept')
    })

    it('uses a custom fallback when one is supplied', () => {
        const custom = {fallback: (n:{type?:string}) => `[unsupported: ${n.type}]`}
        expect(pm_to_typst(doc(node('mystery', para(text('dropped')))), custom))
            .toBe('[unsupported: mystery]')
    })

    it('renders an empty document with no content array', () => {
        expect(pm_to_typst({type: 'doc'})).toBe('')
    })
})
