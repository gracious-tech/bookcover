
// Auto-calculate font sizes based on available panel dimensions

import {clamp} from './utils.js'
import type {CoverSchema} from './schema.js'
import type {GetDimensionsResult} from 'printing-services'

export interface FontSizes {
    subtitle_lines:string[] // balanced subtitle lines (max 2), ready to emit to Typst
    back_blurb:number   // mm
    spine_title:number  // mm (0 if spine too narrow)
    spine_author:number // mm (0 if spine too narrow)
}

// Average character width as a fraction of font size (proportional fonts)
const CHAR_WIDTH_RATIO = 0.55

// Assumed side margin as fraction of panel width
const MARGIN_RATIO = 0.12

// Minimum spine width in mm before text is suppressed
const MIN_SPINE_MM = 5

/**
 * Estimate the font size (in mm) at which `text` fits within `available_mm` width
 * in at most `max_lines` lines.
 */
function fit_size(text:string, available_mm:number, max_lines:number, min_mm:number, max_mm:number):number {
    for (let size = max_mm; size >= min_mm; size -= 0.1) {
        const chars_per_line = available_mm / (size * CHAR_WIDTH_RATIO)
        const lines_needed = Math.ceil(text.length / chars_per_line)
        if (lines_needed <= max_lines) {
            return size
        }
    }
    return min_mm
}


/** Calculate all font sizes from text content and panel dimensions */
export function calculate_font_sizes(
    schema:CoverSchema,
    dims:GetDimensionsResult,
):FontSizes {
    const panel_mm = dims.cover_face_width.toNumber()
    const available_mm = panel_mm * (1 - 2 * MARGIN_RATIO)

    // Subtitle/author font sizes match the Typst ratios — used here only for line-splitting
    const height_mm = dims.cover_face_height.toNumber()
    const subtitle_mm = height_mm * 0.045
    const subtitle_clean = (schema.subtitle ?? '')
        .split('\n')
        .map((p:string) => p.trim().replace(/ +/g, ' '))
        .filter((p:string) => p.length > 0)
        .slice(0, 2)
        .join('\n')

    // Compute balanced subtitle lines: if no user \n, split at the point that minimises
    // the difference in line lengths; otherwise respect the user's explicit break
    let subtitle_lines:string[] = []
    if (subtitle_clean) {
        const chars_per_line = available_mm / (subtitle_mm * CHAR_WIDTH_RATIO)
        if (subtitle_clean.includes('\n')) {
            subtitle_lines = subtitle_clean.split('\n')
        } else if (subtitle_clean.length <= chars_per_line || !subtitle_clean.includes(' ')) {
            // Fits on one line or is a single word — no split needed
            subtitle_lines = [subtitle_clean]
        } else {
            // Balance: try every word split, pick the one with most equal line lengths.
            // No chars_per_line guard — shrink-to-width in Typst handles any overflow.
            const words = subtitle_clean.split(' ')
            let best_i = Math.ceil(words.length / 2)
            let best_diff = Infinity
            for (let i = 1; i < words.length; i++) {
                const l1 = words.slice(0, i).join(' ')
                const l2 = words.slice(i).join(' ')
                const diff = Math.abs(l1.length - l2.length)
                if (diff < best_diff) { best_diff = diff; best_i = i }
            }
            subtitle_lines = [words.slice(0, best_i).join(' '), words.slice(best_i).join(' ')]
        }
    }

    // Back blurb: fixed size (content length varies too much)
    const back_blurb = 3.5

    // Spine: join non-empty title texts for a single-line spine label
    const spine_mm = dims.cover_spine.toNumber()
    const spine_height_mm = dims.cover_face_height.toNumber() * 0.85

    let spine_title = 0
    let spine_author = 0

    if (spine_mm >= MIN_SPINE_MM) {
        // Title must fit in one line along spine height; 0.85 safety margin guards against
        // CHAR_WIDTH_RATIO approximation error causing overflow at the spine edge
        spine_title = clamp(
            fit_size(schema.spine_title!, spine_height_mm, 1, 2.5, spine_mm * 0.65) * 0.85,
            2.5, spine_mm * 0.65,
        )
        // Author at ~75% of spine title size if there's room
        if (schema.spine_author! && spine_mm >= MIN_SPINE_MM * 1.5) {
            spine_author = Math.max(2.5, spine_title * 0.75)
        }
    }

    return {
        subtitle_lines,
        back_blurb,
        spine_title,
        spine_author,
    }
}
