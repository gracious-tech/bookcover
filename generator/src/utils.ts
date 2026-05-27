
// Unit conversion and string escaping utilities

/** Format a millimetre value as a Typst length literal (e.g. "9.1440mm") */
export function mm_to_typst(mm:number):string {
    return mm.toFixed(4) + 'mm'
}

/**
 * Escape a string for embedding as a Typst double-quoted string literal.
 * Escapes backslashes and double-quotes only.
 */
export function escape_typst_str(s:string):string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Escape characters that have special meaning in Typst content mode
// \     Character escape / line break
// #     Code expression
// []    Content block
// $     Math mode
// *     Strong emphasis
// _     Emphasis
// `     Raw text
// <>    Label
// @     Reference
// ~     Symbol shorthand (non-breaking space)
// /     Term list / comment
// +     Numbered list
// -     Bullet list / symbol shorthand (dashes)
export function escape_typst_content(s:string):string {
    // First condense whitespace to single space (XML parser preserves source whitespace)
    s = s.replaceAll(/\s+/g, ' ').trim()
    // eslint-disable-next-line no-useless-escape
    return s.replace(/[\\#\[\]$*_`<>@~/+-]/g, '\\$&')
}


/** Clamp a number between min and max */
export function clamp(value:number, min:number, max:number):number {
    return Math.max(min, Math.min(max, value))
}

/** Derive the default spine title by joining all the title lines */
export function default_spine_title(title1?:string, title2?:string, title3?:string):string {
    return [title1, title2, title3]
        .filter(t => t)
        .join(' ')
        .trim()
        .replace(/ +/g, ' ')
}
