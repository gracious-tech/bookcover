
// Convert CommonMark markdown (as produced by tiptap-markdown) to Typst markup.
// tiptap-markdown outputs: **bold**, _italic_, > blockquote, ---, paragraphs separated by \n\n.
// Typst uses: *bold*, _italic_, #quote[...], #line(length: 100%), same paragraph separator.

// Apply inline markdown conversions (bold, italic) and typst escaping to a string fragment
function inline_to_typst(s:string):string {
    return s
        .replace(/\*\*(.+?)\*\*/g, '\x01$1\x02')
        .replace(/\*(.+?)\*/g, '_$1_')
        .replace(/\x01/g, '*').replace(/\x02/g, '*')
        .replace(/\\/g, '\\\\')
        // eslint-disable-next-line no-useless-escape
        .replace(/[#\[\]$`<>@~]/g, '\\$&')
}

/** Convert markdown string to Typst markup for the back blurb */
export function markdown_to_typst(md:string):string {
    // Stash pre-built typst fragments that must not be escaped, restored at the end
    const stash:string[] = []
    const protect = (s:string) => { stash.push(s); return `\x03${stash.length - 1}\x04` }

    return md
        // Horizontal rules: --- or *** or ___ on their own line → protected typst call
        .replace(/^[-*_]{3,}\s*$/gm, () => protect('#line(length: 100%)'))
        // Blockquote: > lines → #quote[...] — inner content gets inline conversion + escaping
        .replace(/^((?:> ?[^\n]*\n?)+)/gm, (block:string) => {
            const inner = block.replace(/^> ?/gm, '').trimEnd()
            return protect(`#quote[${inline_to_typst(inner)}]`)
        })
        // Headings: # → =, ## → ==, etc.
        .replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes:string, text:string) => {
            return '='.repeat(hashes.length) + ' ' + text
        })
        // Numbered lists: 1. item → + item
        .replace(/^\d+\.\s+/gm, '+ ')
        // Bullet lists: * item → - item (with optional leading spaces; - already Typst-compatible)
        .replace(/^ *[*]\s+/gm, '- ')
        // Inline conversions + escaping on remaining text
        .split(/(\x03\d+\x04)/)
        .map((part) => part.startsWith('\x03') ? part : inline_to_typst(part))
        .join('')
        // Restore protected typst fragments
        .replace(/\x03(\d+)\x04/g, (_m, i) => stash[parseInt(i)])
}

/** Strip common markdown syntax for plain-text contexts (e.g. font preview) */
export function markdown_to_plain(md:string):string {
    return md
        // Horizontal rules: remove entirely
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Blockquotes: strip leading > markers
        .replace(/^> ?/gm, '')
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/gs, '$1')
        .replace(/__(.+?)__/gs, '$1')
        // Italic: *text* or _text_
        .replace(/\*(.+?)\*/gs, '$1')
        .replace(/_(.+?)_/gs, '$1')
        // Inline code
        .replace(/`(.+?)`/gs, '$1')
        // Headings
        .replace(/^#{1,6}\s+/gm, '')
        // Lists: strip bullet/number markers
        .replace(/^[\-*+]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        // Links: [text](url)
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
}

/** Convert markdown to safe HTML for the inline readonly preview */
export function markdown_to_preview_html(md:string):string {
    // Escape HTML entities first, then apply inline formatting
    return md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^[-*_]{3,}\s*$/gm, '<hr>')
        // Blockquotes: wrap in <blockquote>
        .replace(/^((?:&gt; ?[^\n]*\n?)+)/gm, (block:string) => {
            const inner = block.replace(/^&gt; ?/gm, '').trimEnd()
            return `<blockquote>${inner}</blockquote>`
        })
        // Headings: render as bold text (blurb preview is inline, no block elements)
        .replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>')
        // Lists: bullet markers → •, numbered markers stripped
        .replace(/^[\-*+]\s+/gm, '&bull; ')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/gs, '<em>$1</em>')
        .replace(/_(.+?)_/gs, '<em>$1</em>')
        .replace(/\n/g, '<br>')
}
