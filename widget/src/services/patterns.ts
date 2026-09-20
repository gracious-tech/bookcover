
// Widget-side pattern helpers — built on top of the generator's list_patterns()
//
// Pattern METADATA (id/name/tile_mm/aspect_ratio) is tiny and loads with the app. The SVG
// payload is ~220KB and only the preview swatches need it, so it lives behind a dynamic
// import and is fetched off the critical path (see load_pattern_svgs below).

import {ref} from 'vue'
import {list_patterns} from 'bookcover-web'
import type {PatternDef} from 'bookcover-web'

export type {PatternDef}

export const PATTERNS:PatternDef[] = list_patterns()

// Diverse patterns shown as the trigger strip when no pattern is selected
const PREVIEW_PATTERN_IDS = ['boxes', 'brick-wall', 'bubbles', 'circuit-board']
export const PREVIEW_PATTERNS:PatternDef[] = PREVIEW_PATTERN_IDS
    .map(id => PATTERNS.find(p => p.id === id))
    .filter(Boolean) as PatternDef[]

// The SVG payload once loaded, keyed by pattern id — empty until load_pattern_svgs() resolves.
// Reactive so the swatches (which render blank meanwhile) fill in when it arrives
const pattern_svgs = ref<Record<string, string>>({})

// Kept so concurrent callers share one import rather than racing
let svgs_promise:Promise<void> | null = null

/**
 * Load the pattern SVG payload on demand. Safe to call repeatedly — the chunk is fetched once.
 * Callers don't need to await it: swatches render blank until it resolves and then fill in.
 */
export function load_pattern_svgs():Promise<void> {
    if (!svgs_promise) {
        svgs_promise = import('bookcover-web/patterns-svg').then(mod => {
            pattern_svgs.value = mod.PATTERN_SVGS
        }).catch((error:unknown) => {
            // Leave the swatches blank rather than breaking the picker — patterns still
            // apply to the cover itself, since the worker resolves the SVG independently
            console.error('Failed to load pattern SVGs:', error)
            svgs_promise = null
        })
    }
    return svgs_promise
}

/** Look up a pattern by ID */
export function find_pattern(id:string):PatternDef | undefined {
    return PATTERNS.find(p => p.id === id)
}

/** Generate a CSS background-image value for the preview swatch by substituting the fill color */
export function get_preview_url(pattern:PatternDef | undefined, fill = '#ffffff'):string {
    if (!pattern)
        return ''
    const svg = pattern_svgs.value[pattern.id]
    if (!svg)
        return ''
    return 'url(\'data:image/svg+xml,' + encodeURIComponent(svg.replace(/currentColor/g, fill)) + '\')'
}

/** Return a CSS background-size string using tile_mm directly as pixels, preserving aspect ratio */
export function get_preview_size(pattern:PatternDef | undefined):string {
    if (!pattern)
        return '80px 80px'
    const w = pattern.tile_mm * 2
    return `${w}px ${Math.round(w / pattern.aspect_ratio)}px`
}

