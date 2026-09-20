
// Rendered-HTML preview of the blurb, kept behind a dynamic import.
//
// Unlike the plain-text flattening in blurb_text.ts, this genuinely needs Tiptap: the preview
// has to match the editor's own rendering, and that means the real schema. Importing it
// statically would put the whole editor stack (~370KB) in the initial bundle for a preview
// that only matters once a blurb exists, so it loads on demand instead — see ContentSection.

import type {PmDoc} from 'pm-to-typst'

/**
 * Render a blurb document to HTML, loading Tiptap on first use. Resolves to null if that load
 * fails, which leaves the preview blank rather than breaking the sidebar — the cover itself is
 * unaffected, since it renders from the same JSON via pm_to_typst().
 */
export async function render_blurb_html(doc:PmDoc):Promise<string | null> {
    try {
        const [{generateHTML}, {blurb_extensions}] = await Promise.all([
            import('@tiptap/core'),
            import('./blurb_extensions'),
        ])
        return generateHTML(doc, blurb_extensions)
    } catch (error) {
        console.error('Failed to render blurb preview:', error)
        return null
    }
}

