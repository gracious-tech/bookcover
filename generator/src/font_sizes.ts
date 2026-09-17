
// Auto-calculate font sizes based on available panel dimensions

import {clamp} from './utils.js'
import type {CoverSchema} from './schema.js'
import type {GetDimensionsResult} from 'printing-services'

export interface FontSizes {
    subtitle_lines:string[] // the user's own subtitle lines (max 2), ready to emit to Typst
    back_blurb:number   // mm
    spine_title:number  // mm (0 if spine too narrow)
    spine_author:number // mm (0 if spine too narrow)
}

// Average character width as a fraction of font size (proportional fonts)
const CHAR_WIDTH_RATIO = 0.55

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
    // Subtitle lines come from the user's own break only — the UI field takes up to 2 lines.
    // An unbroken line that is too wide is scaled down by shrink-to-width in the template.
    const subtitle_lines = (schema.subtitle ?? '')
        .split('\n')
        .map((p:string) => p.trim().replace(/ +/g, ' '))
        .filter((p:string) => p.length > 0)
        .slice(0, 2)

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
