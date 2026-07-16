
// DPI estimation for uploaded background images — warns when a source image doesn't have
// enough pixels to print cleanly at its current bg_image_coverage size (see cover.typ's
// per-coverage placement branches for the target boxes mirrored below)

import type {FormState} from './form_state'
import {compute_cover_dims} from './dimensions'
import {i18n} from './i18n'

const {t} = i18n.global

// Below this effective DPI, print quality is visibly degraded (soft/pixelated)
const VERY_LOW_DPI = 150
// Below this, quality is below print-industry standard but often still acceptable
const LOW_DPI = 300

export type DpiLevel = 'ok' | 'low' | 'very_low'

type TargetMm = {width:number, height:number}
type CoverDims = ReturnType<typeof compute_cover_dims>

/** Full-spread target box, i.e. the 'full' bg_image_coverage placement */
function full_target_mm(dims:CoverDims):TargetMm {
    return {width: dims.cover_total_width.toNumber(), height: dims.cover_total_height.toNumber()}
}

/** Front panel + bleed target box, i.e. the 'front' bg_image_coverage placement */
function front_target_mm(dims:CoverDims):TargetMm {
    return {
        width: dims.cover_face_width.toNumber() + dims.cover_bleed.toNumber(),
        height: dims.cover_total_height.toNumber(),
    }
}

/** Lower 2/3 of the front panel, i.e. the 'front_partial' bg_image_coverage placement */
function front_partial_target_mm(dims:CoverDims):TargetMm {
    return {
        width: dims.cover_face_width.toNumber(),
        height: dims.cover_face_height.toNumber() * (2 / 3),
    }
}

/** Inset box on the front panel, i.e. the 'painted'/'feature' bg_image_coverage placement
 *  (sync: cover.typ's painted_w/painted_h) */
function feature_target_mm(dims:CoverDims):TargetMm {
    return {
        width: dims.cover_face_width.toNumber() - 30,
        height: dims.cover_face_height.toNumber() * 0.5,
    }
}

/** Target box (mm) for a given bg_image_coverage value */
function position_target_mm(dims:CoverDims, coverage:FormState['bg_image_coverage']):TargetMm {
    if (coverage === 'full')
        return full_target_mm(dims)
    if (coverage === 'front_partial')
        return front_partial_target_mm(dims)
    if (coverage === 'painted' || coverage === 'feature')
        return feature_target_mm(dims)
    return front_target_mm(dims)
}

/** Effective print DPI of pixel size (px_w, px_h) fit into a target box — the lower of the
 *  two axis DPIs, since that's the axis whose pixels get stretched thinnest under "cover" fit */
function estimate_dpi(px_w:number, px_h:number, target_mm:TargetMm):number {
    const width_in = target_mm.width / 25.4
    const height_in = target_mm.height / 25.4
    return Math.min(px_w / width_in, px_h / height_in)
}

/** Classify a DPI value into a warning tier */
function dpi_level(dpi:number):DpiLevel {
    if (dpi < VERY_LOW_DPI)
        return 'very_low'
    if (dpi < LOW_DPI)
        return 'low'
    return 'ok'
}

/** Format a pixel size for display, e.g. "2400×3600px" */
function format_px(width:number, height:number):string {
    return `${width}×${height}px`
}

/** Pixel dimensions needed to hit a given DPI at the target box's physical size (mm),
 *  formatted for display */
function format_recommended_px(target_mm:TargetMm, dpi:number):string {
    return format_px(
        Math.round(target_mm.width / 25.4 * dpi),
        Math.round(target_mm.height / 25.4 * dpi),
    )
}

export interface BgImageDpiWarning {
    level:DpiLevel
    title:string
    body:string
    actual_size:string
    // Only set at the 'very_low' tier — the 150dpi floor below "recommended"
    acceptable_size?:string
    recommended_size:string
}

/** Check an uploaded background image's resolution against its current bg_image_coverage
 *  placement. Returns null when it's high enough resolution (no warning needed). When the
 *  current placement is 'full' or 'front' and a front-cover-only crop (the 'feature' box, the
 *  smallest placement) would clear the 150dpi floor, the warning notes that the image may
 *  still work if the user narrows the placement. */
export function check_bg_image_dpi(form:FormState, px_w:number, px_h:number):BgImageDpiWarning | null {
    const dims = compute_cover_dims(form)
    const coverage = form.bg_image_coverage
    const target_mm = position_target_mm(dims, coverage)
    const dpi = estimate_dpi(px_w, px_h, target_mm)
    const level = dpi_level(dpi)
    if (level === 'ok')
        return null

    const title = level === 'very_low' ? t('dpi_warning.title_very_low') : t('dpi_warning.title_low')
    let body = level === 'very_low' ? t('dpi_warning.body_very_low') : t('dpi_warning.body_low')

    if (level === 'very_low' && (coverage === 'full' || coverage === 'front')) {
        const feature_dpi = estimate_dpi(px_w, px_h, feature_target_mm(dims))
        if (dpi_level(feature_dpi) !== 'very_low')
            body += t('dpi_warning.body_front_suffix')
    }

    return {
        level, title, body,
        actual_size: format_px(px_w, px_h),
        acceptable_size: level === 'very_low' ? format_recommended_px(target_mm, VERY_LOW_DPI) : undefined,
        recommended_size: format_recommended_px(target_mm, LOW_DPI),
    }
}
