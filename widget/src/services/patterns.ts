
// Widget-side pattern helpers — built on top of the generator's list_patterns()

import {list_patterns} from 'bookcover-web'
import type {PatternDef} from 'bookcover-web'

export type {PatternDef}

export const PATTERNS:PatternDef[] = list_patterns()

// Diverse patterns shown as the trigger strip when no pattern is selected
const PREVIEW_PATTERN_IDS = ['boxes', 'brick-wall', 'bubbles', 'circuit-board']
export const PREVIEW_PATTERNS:PatternDef[] = PREVIEW_PATTERN_IDS
    .map(id => PATTERNS.find(p => p.id === id))
    .filter(Boolean) as PatternDef[]

/** Look up a pattern by ID */
export function find_pattern(id:string):PatternDef | undefined {
    return PATTERNS.find(p => p.id === id)
}

/** Generate a CSS background-image value for the preview swatch by substituting the fill color */
export function get_preview_url(pattern:PatternDef | undefined, fill = '#ffffff'):string {
    if (!pattern) return ''
    const svg = pattern.svg.replace(/currentColor/g, fill)
    return 'url(\'data:image/svg+xml,' + encodeURIComponent(svg) + '\')'
}

/** Parse the natural width/height from an SVG string */
function parse_svg_aspect(svg:string):number {
    const w = parseFloat(svg.match(/\bwidth="([0-9.]+)"/)?.[1] ?? '1')
    const h = parseFloat(svg.match(/\bheight="([0-9.]+)"/)?.[1] ?? '1')
    return (w > 0 && h > 0) ? w / h : 1
}

/** Return a CSS background-size string using tile_mm directly as pixels, preserving aspect ratio */
export function get_preview_size(pattern:PatternDef | undefined):string {
    if (!pattern) return '80px 80px'
    const aspect = parse_svg_aspect(pattern.svg)
    const w = pattern.tile_mm * 2
    return `${w}px ${Math.round(w / aspect)}px`
}
