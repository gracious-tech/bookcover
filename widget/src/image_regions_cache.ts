
// Reactive cache of colors sampled from the current background image (see
// services/image_regions.ts). Only the pixel-sampling step is cached — actual colors are
// derived live and cheaply from it at generate time (see form_schema.ts's build_schema).
// A single global cache, matching fonts.ts's custom_font_families — this app assumes one form
// instance per JS context (each embed gets its own iframe/app instance)

import {ref, watch} from 'vue'
import type {ImageRegions} from 'bookcover-web'
import type {FormState} from './form_state'
import {compute_cover_dims} from './dimensions'
import {analyze_image_regions} from './services/image_regions'

// null until a background image has been analyzed (or when there isn't one)
export const image_regions = ref<ImageRegions | null>(null)

const DEBOUNCE_MS = 500

/** Start watching a form's background image (and dimension-affecting fields) to keep
 *  image_regions up to date. Call once, alongside provide(FORM_KEY, form) in App.vue.
 *  Recomputation is debounced and deliberately does NOT depend on bg_image_coverage — toggling
 *  it should never trigger a recompute, only pick which already-cached regions get used. */
export function init_image_regions_cache(form:FormState):void {
    let timer:ReturnType<typeof setTimeout> | null = null
    let generation = 0

    const recompute = () => {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
            void recompute_now()
        }, DEBOUNCE_MS)
    }

    const recompute_now = async () => {
        const file = form.bg_image
        if (!file) {
            image_regions.value = null
            return
        }
        const my_generation = ++generation
        let dims:ReturnType<typeof compute_cover_dims> | null = null
        try {
            dims = compute_cover_dims(form)
        } catch { /* print dimensions not resolvable yet — back/spine come back null */ }
        const result = await analyze_image_regions(file, dims)
        // Bail if the image or dimensions changed again while analyzing
        if (my_generation === generation)
            image_regions.value = result
    }

    watch(() => [
        form.bg_image, form.service_id, form.size_id, form.page_count, form.binding_type,
        form.paper_type, form.ink_type, form.custom_unit, form.custom_trim_width,
        form.custom_trim_height, form.custom_bleed, form.custom_spine,
    ], recompute, {immediate: true})
}
