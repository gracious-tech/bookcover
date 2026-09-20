
// Plain-text flattening of the blurb's ProseMirror document, with no Tiptap dependency.
//
// Tiptap's own generateText() would do this, but reaching for it drags the whole editor stack
// (StarterKit + prosemirror-view/model/state, ~370KB) onto the critical path just to answer
// "is there any text?" and to build a font-sample string. Those two callers run on every load,
// so they use this instead and the editor stack stays behind its dynamic import
// (see BlurbEditorModal and blurb_html.ts).
//
// Text content matches generateText word for word. The whitespace BETWEEN blocks deliberately
// does not: ProseMirror's textBetween emits a separator at every block boundary it crosses, so
// a nested list yields runs of blank lines (and a leading one). This joins leaf blocks with a
// single blank line instead, which is what both callers want — one tests for emptiness, the
// other feeds a truncated single-line font sample. tests/blurb_text.test.ts pins the word-level
// agreement against the real generateText so a divergence in content can't slip through.

import type {PmDoc, PmNode} from 'pm-to-typst'

const BLOCK_SEPARATOR = '\n\n'

/** Text contributed by an inline node — a hard break is a newline, and any other childless
 *  leaf (horizontalRule, an unrecognised node) contributes nothing, as in Tiptap */
function inline_text(node:PmNode):string {
    if (typeof node.text === 'string')
        return node.text
    return node.type === 'hardBreak' ? '\n' : ''
}

/** Collect the text of every leaf block below a node, in document order */
function collect_blocks(node:PmNode, blocks:string[]):void {
    if (!node.content?.length)
        return
    // A block whose children are all inline (text, hardBreak) contributes one block of text;
    // anything else is a container (doc, list, blockquote) and is recursed into
    const is_leaf_block = node.content.every(child => !child.content)
    if (is_leaf_block) {
        blocks.push(node.content.map(inline_text).join(''))
        return
    }
    for (const child of node.content)
        collect_blocks(child, blocks)
}

/** Flatten a blurb document to plain text, as Tiptap's generateText() would */
export function blurb_to_text(doc:PmDoc | null | undefined):string {
    if (!doc)
        return ''
    const blocks:string[] = []
    collect_blocks(doc, blocks)
    return blocks.join(BLOCK_SEPARATOR)
}

/** True once the blurb actually contains text — the blank-form doc is a single empty
 *  paragraph, which flattens to an empty string */
export function blurb_has_text(doc:PmDoc | null | undefined):boolean {
    return blurb_to_text(doc).trim() !== ''
}

