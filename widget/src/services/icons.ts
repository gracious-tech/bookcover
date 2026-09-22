
// Widget-side icon helpers — built on top of the generator's icon_categories/suggested_icons
//
// Icon id METADATA is tiny and loads with the app. The preset SVG payload lives behind a
// dynamic import and is fetched off the critical path (see load_preset_icon_svgs below),
// mirroring services/patterns.ts. Icons outside the curated preset list (a custom typed id)
// still resolve from the Iconify API directly — see icon_url() in BackgroundSection.vue.

import {ref} from 'vue'
import {icon_categories, suggested_icons} from 'bookcover-web'
import type {IconCategory} from 'bookcover-web'

export type {IconCategory}
export {icon_categories, suggested_icons}

// The preset SVG payload once loaded, keyed by full icon id — empty until
// load_preset_icon_svgs() resolves. Reactive so swatches (which render blank meanwhile using
// the Iconify network fallback) fill in with the local copy when it arrives
export const preset_icon_svgs = ref<Record<string, string>>({})

// Kept so concurrent callers share one import rather than racing
let svgs_promise:Promise<void> | null = null

/**
 * Load the preset icon SVG payload on demand. Safe to call repeatedly — the chunk is fetched
 * once. Callers don't need to await it: swatches fall back to the Iconify network URL until it
 * resolves and then switch to the bundled copy.
 */
export function load_preset_icon_svgs():Promise<void> {
    if (!svgs_promise) {
        svgs_promise = import('bookcover-web/preset-icons-svg').then(mod => {
            preset_icon_svgs.value = mod.PRESET_ICON_SVGS
        }).catch((error:unknown) => {
            console.error('Failed to load preset icon SVGs:', error)
            svgs_promise = null
        })
    }
    return svgs_promise
}
