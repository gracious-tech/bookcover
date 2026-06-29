
// Unit conversion and string escaping utilities

/** Format a millimetre value as a Typst length literal (e.g. "9.1440mm") */
export function mm_to_typst(mm:number):string {
    return mm.toFixed(4) + 'mm'
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
