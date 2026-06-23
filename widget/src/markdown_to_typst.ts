
// Convert CommonMark markdown (as produced by tiptap-markdown) to Typst markup, plain text,
// and a small HTML preview. We parse with markdown-it (already a dependency via
// tiptap-markdown) and walk its token stream, so nesting and escaping are handled by the
// parser rather than by hand-rolled regexes.

import MarkdownIt from 'markdown-it'

// Shared parser — no inline HTML, no linkification beyond CommonMark autolinks (<url>)
const md = new MarkdownIt({html: false})

// Strip link anchors in rendered HTML so the preview matches the cover (which keeps only the
// link's text); the inner text tokens are still rendered between these now-empty tags
md.renderer.rules.link_open = () => ''
md.renderer.rules.link_close = () => ''

// markdown-it's token type, derived from parse() so we don't reach into its namespace
type Token = ReturnType<typeof md.parse>[number]

// Escape literal typst-significant characters in a plain-text run. The forward slash is
// included because "//" opens a Typst line comment (which would swallow the rest of the
// blurb, e.g. a URL or "and/or // note"); escaping it also stops bare URLs auto-linking,
// which matches our strip-links-to-text behaviour.
function escape_typst_literal(s:string):string {
    // eslint-disable-next-line no-useless-escape
    return s.replace(/\\/g, '\\\\').replace(/[#\[\]$`<>@~*_\/]/g, '\\$&')
}

// Index of the close token matching the open token at `open_idx` (nesting: +1/-1 per token)
function match_close(tokens:Token[], open_idx:number):number {
    let depth = 0
    for (let i = open_idx; i < tokens.length; i++) {
        depth += tokens[i].nesting
        if (depth === 0)
            return i
    }
    return tokens.length - 1
}

// Render inline child tokens to Typst. Links are stripped to their (escaped) text content.
function inline_to_typst(children:Token[]):string {
    let out = ''
    for (const t of children) {
        switch (t.type) {
            // Plain text and code spans become escaped literal text
            case 'text':
            case 'code_inline':
                out += escape_typst_literal(t.content)
                break
            case 'softbreak':
                out += '\n'
                break
            case 'hardbreak':
                out += '\\\n'
                break
            // Emphasis delimiters map straight onto Typst's
            case 'strong_open':
            case 'strong_close':
                out += '*'
                break
            case 'em_open':
            case 'em_close':
                out += '_'
                break
            // link_open / link_close are dropped; their inner text tokens are kept
        }
    }
    return out
}

// Render a range of block tokens [start, end) to Typst, joining top-level blocks with a
// blank line. Recurses into blockquotes and lists.
function blocks_to_typst(tokens:Token[], start:number, end:number):string {
    const parts:string[] = []
    let i = start
    while (i < end) {
        const t = tokens[i]
        switch (t.type) {
            // Headings: h1 → "=", h2 → "==", etc.
            case 'heading_open': {
                const level = parseInt(t.tag.slice(1))
                parts.push('='.repeat(level) + ' ' + inline_to_typst(tokens[i + 1].children ?? []))
                i = match_close(tokens, i) + 1
                break
            }
            case 'paragraph_open': {
                parts.push(inline_to_typst(tokens[i + 1].children ?? []))
                i = match_close(tokens, i) + 1
                break
            }
            case 'hr':
                parts.push('#line(length: 100%)')
                i += 1
                break
            case 'blockquote_open': {
                const close = match_close(tokens, i)
                parts.push(`#quote[${blocks_to_typst(tokens, i + 1, close)}]`)
                i = close + 1
                break
            }
            // Bullet lists use "- ", ordered lists use "+ "
            case 'bullet_list_open':
            case 'ordered_list_open': {
                const close = match_close(tokens, i)
                const marker = t.type === 'bullet_list_open' ? '- ' : '+ '
                parts.push(list_to_typst(tokens, i + 1, close, marker))
                i = close + 1
                break
            }
            default:
                i += 1
        }
    }
    return parts.join('\n\n')
}

// Render list items in [start, end) with the given Typst marker, one item per line.
// Wrapped/nested lines are indented to align under the marker.
function list_to_typst(tokens:Token[], start:number, end:number, marker:string):string {
    const items:string[] = []
    let i = start
    while (i < end) {
        if (tokens[i].type === 'list_item_open') {
            const close = match_close(tokens, i)
            const inner = blocks_to_typst(tokens, i + 1, close)
            items.push(marker + inner.replace(/\n/g, '\n' + ' '.repeat(marker.length)))
            i = close + 1
        } else {
            i += 1
        }
    }
    return items.join('\n')
}

/** Convert markdown string to Typst markup for the back blurb */
export function markdown_to_typst(md_src:string):string {
    const tokens = md.parse(md_src, {})
    return blocks_to_typst(tokens, 0, tokens.length)
}

// Collect the plain text of inline child tokens, ignoring all formatting and links
function inline_to_plain(children:Token[]):string {
    let out = ''
    for (const t of children) {
        if (t.type === 'text' || t.type === 'code_inline')
            out += t.content
        else if (t.type === 'softbreak' || t.type === 'hardbreak')
            out += ' '
    }
    return out
}

/** Strip common markdown syntax for plain-text contexts (e.g. font preview) */
export function markdown_to_plain(md_src:string):string {
    const tokens = md.parse(md_src, {})
    const lines:string[] = []
    // Each block's inline content becomes one line; hr and structural tokens are skipped
    for (const t of tokens) {
        if (t.type === 'inline')
            lines.push(inline_to_plain(t.children ?? []))
    }
    return lines.join('\n').trim()
}

/** Convert markdown to safe HTML for the inline readonly preview */
export function markdown_to_preview_html(md_src:string):string {
    // markdown-it escapes text for us (html: false); preview block styling lives in the
    // consuming component
    return md.render(md_src)
}
