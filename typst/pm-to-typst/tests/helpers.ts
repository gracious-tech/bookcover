
// Terse builders for the ProseMirror document JSON the tests feed to pm_to_typst

import type {PmNode, PmDoc, PmMark} from '../src/types.js'

/** A text node, optionally carrying marks (given as names or full mark objects) */
export function text(value:string, ...marks:(string | PmMark)[]):PmNode {
    if (marks.length === 0)
        return {type: 'text', text: value}
    return {
        type: 'text',
        text: value,
        marks: marks.map(mark => typeof mark === 'string' ? {type: mark} : mark),
    }
}

/** Any node type, with its children as the rest arguments */
export function node(type:string, ...content:PmNode[]):PmNode {
    return {type, content}
}

/** A node carrying attrs (heading level, textAlign, etc.) */
export function node_with(type:string, attrs:Record<string, unknown>, ...content:PmNode[]):PmNode {
    return {type, attrs, content}
}

/** A paragraph wrapping the given inline content */
export function para(...content:PmNode[]):PmNode {
    return {type: 'paragraph', content}
}

/** A document root wrapping the given block content */
export function doc(...content:PmNode[]):PmDoc {
    return {type: 'doc', content}
}

/** The single empty paragraph Tiptap produces for a blank editor */
export function empty_doc():PmDoc {
    return {type: 'doc', content: [{type: 'paragraph'}]}
}
