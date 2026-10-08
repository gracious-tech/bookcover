
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

// Unicode scripts whose letters are strong right-to-left (bidi class R or AL). Built from names
// so any the JS engine's Unicode database doesn't know yet are skipped rather than throwing
const RTL_SCRIPTS = [
    'Hebrew', 'Arabic', 'Syriac', 'Thaana', 'Nko', 'Samaritan', 'Mandaic', 'Adlam',
    'Hanifi_Rohingya', 'Yezidi', 'Mende_Kikakui', 'Garay', 'Imperial_Aramaic', 'Phoenician',
    'Kharoshthi', 'Old_South_Arabian', 'Old_North_Arabian', 'Avestan', 'Inscriptional_Parthian',
    'Inscriptional_Pahlavi', 'Psalter_Pahlavi', 'Old_Turkic', 'Old_Hungarian', 'Nabataean',
    'Palmyrene', 'Hatran', 'Manichaean', 'Elymaic', 'Sogdian', 'Old_Sogdian', 'Old_Uyghur',
    'Chorasmian', 'Lydian', 'Meroitic_Cursive', 'Meroitic_Hieroglyphs', 'Cypriot',
].filter(script => {
    try {
        new RegExp(`\\p{Script=${script}}`, 'u')
        return true
    }
    catch {
        return false
    }
})
const RTL_REGEX = new RegExp(`[${RTL_SCRIPTS.map(s => `\\p{Script=${s}}`).join('')}\\u200F\\u061C]`, 'u')

// Strong directional characters: letters, plus the LRM/RLM/ALM marks typed to force a direction
const STRONG_REGEX = /[\p{L}‎‏؜]/u

/** A text's base direction by the Unicode first-strong rule (as HTML's dir="auto"): the first
 *  letter decides, so a Hebrew sentence quoting an English word is still RTL. Text with no
 *  letters at all (digits, punctuation) is LTR. */
export function text_dir(text:string):'ltr' | 'rtl' {
    const strong = STRONG_REGEX.exec(text)
    return strong && RTL_REGEX.test(strong[0]) ? 'rtl' : 'ltr'
}

/** Report a value naming something this package version doesn't have (a pruned or renamed
 *  pattern, vector background, or background image). The feature is dropped rather than failing
 *  the whole render, but never silently — a missing ID means a stored record can no longer be
 *  reproduced, and the host needs to be able to see that happen. */
export function warn_unknown(field:string, id:string):void {
    console.warn(`bookcover: unknown ${field} "${id}" — ignoring it for this render`)
}
