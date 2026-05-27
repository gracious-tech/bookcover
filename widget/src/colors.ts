
// Color utility functions for deriving cover color schemes

/** Convert a hex color string to an HSL tuple [h, s, l] */
export function hex_to_hsl(hex:string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min)
        return [0, 0, l * 100]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = 0
    if (max === r)
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g)
        h = ((b - r) / d + 2) / 6
    else
        h = ((r - g) / d + 4) / 6
    return [h * 360, s * 100, l * 100]
}

/** Return the WCAG relative luminance of a hex color */
function relative_luminance(hex:string): number {
    const to_linear = (c:number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    const r = to_linear(parseInt(hex.slice(1, 3), 16) / 255)
    const g = to_linear(parseInt(hex.slice(3, 5), 16) / 255)
    const b = to_linear(parseInt(hex.slice(5, 7), 16) / 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Return true when white text has better contrast than black text against this color (WCAG) */
export function is_dark_color(hex:string): boolean {
    const L = relative_luminance(hex)
    // Contrast ratio with white (L=1) vs black (L=0)
    const contrast_white = 1.05 / (L + 0.05)
    const contrast_black = (L + 0.05) / 0.05
    return contrast_white > contrast_black
}

/** Format HSL components as hsl(Hdeg, S%, L%) — compatible with CSS4 and Typst's color.hsl() */
function fmt_hsl(h:number, s:number, l:number):string {
    return `hsl(${Math.round(h)}deg, ${Math.round(s)}%, ${Math.round(l)}%)`
}

/** Convert a hex color to an HSL string */
function hex_to_hsl_str(hex:string):string {
    const [h, s, l] = hex_to_hsl(hex)
    return fmt_hsl(h, s, l)
}

/** Color values derived from the form's bg_color and spine_color */
export interface DerivedColors {
    front_background:string
    back_background:string
    spine_background:string | null
    front_title:string
    front_subtitle:string
    front_author:string
    blurb:string
    blurb_background:string
    spine_title:string
    spine_author:string
}

/**
 * Derive all cover colors from the background color and optional spine color.
 * Dark/light mode is auto-detected from bg_color.
 * spine_color: when null, spine uses bg_color; when set, spine gets its own background.
 */
export function derive_colors(bg_color:string, spine_color:string | null):DerivedColors {
    const [ph, ps, pl] = hex_to_hsl(bg_color)
    const dark = is_dark_color(bg_color)

    // Front text: white on dark primary, near-black on light primary
    const text = dark ? fmt_hsl(0, 0, 100) : fmt_hsl(0, 0, 10)

    // Spine background and text contrast
    const spine_dark = spine_color ? is_dark_color(spine_color) : dark
    const spine_text = spine_dark ? fmt_hsl(0, 0, 100) : fmt_hsl(0, 0, 10)
    let spine_bg:string | null = null
    if (spine_color) {
        const [sh, ss, sl] = hex_to_hsl(spine_color)
        spine_bg = fmt_hsl(sh, ss, sl)
    }

    // Blurb container background: derived from primary
    const blurb_background = dark
        ? fmt_hsl(ph, ps, Math.min(pl, 25))
        : fmt_hsl(ph, ps, Math.max(pl, 75))

    return {
        front_background: fmt_hsl(ph, ps, pl),
        back_background: blurb_background,
        spine_background: spine_bg,
        front_title: text,
        front_subtitle: text,
        front_author: text,
        blurb: text,
        blurb_background,
        spine_title: spine_text,
        spine_author: spine_text,
    }
}

/** Convert an optional hex color override to an HSL string, or return null */
export function hex_override_to_hsl(hex:string | null):string | null {
    if (!hex)
        return null
    return hex_to_hsl_str(hex)
}
