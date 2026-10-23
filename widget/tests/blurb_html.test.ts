
import {describe, it, expect, vi, afterEach} from 'vitest'
import type {PmDoc} from 'pm-to-typst'

// A small blurb touching a mark, a heading and a list
const DOC:PmDoc = {type: 'doc', content: [
    {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Title'}]},
    {type: 'paragraph', content: [
        {type: 'text', text: 'Some '},
        {type: 'text', text: 'bold', marks: [{type: 'bold'}]},
    ]},
    {type: 'bulletList', content: [
        {type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'one'}]}]},
    ]},
]}

afterEach(() => {
    vi.doUnmock('@tiptap/core')
    vi.restoreAllMocks()
})


describe('render_blurb_html', () => {

    // Tiptap's generateHTML needs a DOM, which the node environment lacks, so this checks the
    // wiring — the blurb goes to it with the editor's own extension list — rather than the HTML
    it('renders the blurb with the editor\'s own schema', async () => {
        vi.resetModules()
        const generate_html = vi.fn(() => '<p>rendered</p>')
        vi.doMock('@tiptap/core', async original => ({
            ...await original<typeof import('@tiptap/core')>(),
            generateHTML: generate_html,
        }))
        const {render_blurb_html} = await import('../src/blurb_html')
        const {blurb_extensions} = await import('../src/blurb_extensions')
        expect(await render_blurb_html(DOC)).toBe('<p>rendered</p>')
        expect(generate_html).toHaveBeenCalledWith(DOC, blurb_extensions)
    })

    it('resolves to null when the editor stack fails to load', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.resetModules()
        vi.doMock('@tiptap/core', () => { throw new Error('chunk load failed') })
        const {render_blurb_html} = await import('../src/blurb_html')
        expect(await render_blurb_html(DOC)).toBeNull()
        expect(console.error).toHaveBeenCalled()
    })
})
