
// Reactive cache of colors sampled from the current background image (via bookcover-web's
// analyze_image_regions). Only the pixel-sampling step is cached — actual colors are derived
// downstream by resolve_colors() at generate time, from whatever's passed as
// GenerateOptions.image_regions (see schema.ts and PreviewPane.vue's generate() calls).
// A single global cache, matching fonts.ts's custom_font_families — this app assumes one form
// instance per JS context (each embed gets its own iframe/app instance)

import {ref, watch} from 'vue'
import type {ImageRegions} from 'bookcover-web'
import {analyze_image_regions, get_builtin_bg_regions} from 'bookcover-web'
import type {FormState} from './form_state'
import {compute_cover_dims} from './dimensions'
import {fetch_bg_preview} from './services/backgrounds'
import {debounce} from './svg_utils'

// null until a background image has been analyzed (or when there isn't one)
export const image_regions = ref<ImageRegions | null>(null)

const DEBOUNCE_MS = 500

/** Start watching a form's background image (and dimension-affecting fields) to keep
 *  image_regions up to date. Call once, alongside provide(FORM_KEY, form) in App.vue.
 *  A built-in's regions are baked (looked up by its ID), so they're set immediately; an upload's
 *  are sampled from its pixels, debounced — as are a built-in's if it's missing from the baked
 *  table (sampled from its preview copy, so a forgotten .bin/gen_bg_regions run degrades to
 *  slightly different colors rather than none). Deliberately does NOT depend on bg_image_coverage —
 *  toggling it should never trigger a recompute, only pick which already-cached regions get used. */
export function init_image_regions_cache(form:FormState):void {
    let generation = 0

    const recompute = debounce(() => void recompute_now(), DEBOUNCE_MS)

    const recompute_now = async () => {
        const builtin = form.bg_image_builtin
        // A debounced call can land after a baked built-in was picked, whose regions are set
        if (builtin && get_builtin_bg_regions(builtin))
            return
        if (!builtin && !form.bg_image) {
            image_regions.value = null
            return
        }
        const my_generation = ++generation
        let dims:ReturnType<typeof compute_cover_dims> | null = null
        try {
            dims = compute_cover_dims(form)
        } catch { /* print dimensions not resolvable yet — back/spine come back null */ }
        try {
            const file = builtin ? await fetch_bg_preview(builtin) : form.bg_image
            if (!file)
                return
            const result = await analyze_image_regions(file, dims)
            // Bail if the image or dimensions changed again while analyzing
            if (my_generation === generation)
                image_regions.value = result
        }
        catch (error) {
            // Preview fetch or decode failed — render without auto colors rather than stale ones
            console.error(error)
            if (my_generation === generation)
                image_regions.value = null
        }
    }

    // Set a baked built-in's regions straight away (superseding any upload still being
    // analyzed), otherwise sample the image
    const on_change = () => {
        const baked = form.bg_image_builtin ? get_builtin_bg_regions(form.bg_image_builtin) : null
        if (!baked) {
            if (form.bg_image_builtin)
                console.warn(`Background "${form.bg_image_builtin}" has no baked colors — `
                    + 'run .bin/gen_bg_regions')
            recompute()
            return
        }
        ++generation
        image_regions.value = baked
    }

    watch(() => [
        form.bg_image, form.bg_image_builtin, form.service_id, form.size_mode, form.size_id,
        form.page_count, form.binding_type, form.paper_type, form.ink_type, form.custom_unit,
        form.custom_trim_width, form.custom_trim_height, form.custom_bleed, form.custom_spine,
    ], on_change, {immediate: true})
}
