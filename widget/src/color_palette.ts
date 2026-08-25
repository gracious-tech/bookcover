
// Reactive "colors currently in this cover" list — every explicit *_color field plus the
// colors resolve_colors() would auto-derive right now, split into "chosen"/"auto" groups and
// deduplicated within each. Fed into Coloris's swatchGroups option (see coloris.ts) so every
// color picker in the sidebar shows the same reusable palette, grouped under "Chosen"/"Auto"
// labels. A single global cache, matching image_regions_cache.ts/fonts.ts's singleton pattern
// — this app assumes one form instance per JS context
//
// Each field is only included while its associated content is actually going to render — e.g.
// icon_color is skipped while no icon is selected, spine colors are skipped once the spine is
// too narrow for printing-services to place anything on it — so the palette never suggests a
// color for something that isn't currently part of the cover.

import {ref, watch} from 'vue'
import {generateText} from '@tiptap/vue-3'
import {resolve_colors, cover_schema, hex_override_to_hsl} from 'bookcover-web'
import type {ResolvedColors} from 'bookcover-web'
import type {FormState} from './form_state'
import {build_schema} from './schema'
import {blurb_extensions} from './blurb_extensions'
import {image_regions} from './image_regions_cache'
import {compute_cover_dims} from './dimensions'
import {debounce} from './svg_utils'

/** True once the blurb's ProseMirror doc actually contains text (the blank-form doc is a
 *  single empty paragraph, which generates to an empty string) */
function has_blurb_text(form:FormState):boolean {
    return generateText(form.blurb, blurb_extensions).trim() !== ''
}

/** True while the spine is wide enough for printing-services to place spine text on it —
 *  mirrors the cover_has_spine_text flag generator-node/PreviewPane.vue already key off */
function has_spine_text(form:FormState):boolean {
    try {
        return compute_cover_dims(form).cover_has_spine_text
    } catch {
        return true // dims not resolvable yet (mid-edit) — don't suppress
    }
}

/** True while the cover has a spine panel at all (some custom/binding configurations don't) */
function has_spine(form:FormState):boolean {
    try {
        return compute_cover_dims(form).cover_has_spine
    } catch {
        return true
    }
}

// One entry per *_color field: which FormState key holds its explicit value, which
// resolve_colors() key(s) hold its auto-derived value, and when it's actually in play
interface ColorFieldSpec {
    form_key:'title1_color' | 'title2_color' | 'title3_color' | 'subtitle_color' | 'author_color'
        | 'blurb_color' | 'blurb_bg_color' | 'spine_title_color' | 'spine_author_color'
        | 'spine_color' | 'bg_color' | 'pattern_color' | 'icon_color'
    resolved_keys:(keyof ResolvedColors)[]
    active:(form:FormState) => boolean
}

const COLOR_FIELDS:ColorFieldSpec[] = [
    {form_key: 'title1_color', resolved_keys: ['front_title1'], active: () => true},
    {form_key: 'title2_color', resolved_keys: ['front_title2'], active: form => !!form.title2},
    {form_key: 'title3_color', resolved_keys: ['front_title3'], active: form => !!form.title3},
    {form_key: 'subtitle_color', resolved_keys: ['front_subtitle'], active: form => !!form.subtitle},
    {form_key: 'author_color', resolved_keys: ['front_author'], active: form => !!form.author},
    {form_key: 'blurb_color', resolved_keys: ['blurb'], active: has_blurb_text},
    {form_key: 'blurb_bg_color', resolved_keys: ['blurb_background'], active: has_blurb_text},
    {form_key: 'spine_title_color', resolved_keys: ['spine_title'], active: has_spine_text},
    {form_key: 'spine_author_color', resolved_keys: ['spine_author'], active: has_spine_text},
    {form_key: 'spine_color', resolved_keys: ['spine_background'], active: has_spine},
    {form_key: 'bg_color', resolved_keys: ['front_background', 'back_background',
        'front_gradient_start', 'front_gradient_end'], active: () => true},
    {form_key: 'pattern_color', resolved_keys: [], active: form => !!form.pattern_id},
    {form_key: 'icon_color', resolved_keys: [], active: form => !!form.icon_id},
]

/** Dedupe a color list case-insensitively, keeping first occurrence order */
function dedupe(colors:string[]):string[] {
    const seen = new Set<string>()
    const out:string[] = []
    for (const color of colors) {
        const key = color.toLowerCase()
        if (seen.has(key))
            continue
        seen.add(key)
        out.push(color)
    }
    return out
}

// Colors currently in play on the cover, split into the two swatch groups shown in the picker
// ("Chosen" = explicit field values, "Auto" = resolve_colors()'s derived values) — for fields
// whose content is actually present. auto excludes anything already listed under chosen, so a
// color set explicitly never appears twice. Empty until the first recompute (see
// init_color_palette_cache)
export const current_cover_colors = ref<{chosen:string[], auto:string[]}>({chosen: [], auto: []})

const DEBOUNCE_MS = 300

/** Start watching a form to keep current_cover_colors up to date. Call once, alongside
 *  provide(FORM_KEY, form)/init_image_regions_cache(form) in App.vue */
export function init_color_palette_cache(form:FormState):void {
    const recompute = debounce(() => recompute_now(form), DEBOUNCE_MS)

    const recompute_now = (form:FormState) => {
        const active_fields = COLOR_FIELDS.filter(spec => spec.active(form))

        // Form fields store hex, resolve_colors() returns hsl(Xdeg, Y%, Z%) strings — normalize
        // everything to that one hsl format before dedup, or the same color in different string
        // forms (e.g. an explicit hex matching an auto-derived hsl) won't be recognized as equal
        const explicit = active_fields
            .map(spec => form[spec.form_key])
            .filter((value):value is string => typeof value === 'string')
            .map(hex => hex_override_to_hsl(hex))
            .filter((value):value is string => value !== null)

        let auto:string[] = []
        try {
            const schema = cover_schema.parse(build_schema(form))
            const resolved = resolve_colors(schema, image_regions.value)
            const active_keys = new Set(active_fields.flatMap(spec => spec.resolved_keys))
            for (const key of active_keys) {
                const value = resolved[key]
                if (value !== null)
                    auto.push(value)
            }
        } catch {
            // Form isn't in a resolvable state yet (mid-edit/incomplete) — explicit colors alone
        }

        const chosen = dedupe(explicit)
        const chosen_set = new Set(chosen.map(c => c.toLowerCase()))
        const auto_only = dedupe(auto).filter(c => !chosen_set.has(c.toLowerCase()))

        current_cover_colors.value = {chosen, auto: auto_only}
        console.log('[color_palette] suggested colors — chosen:', chosen, 'auto:', auto_only)
    }

    watch(() => [
        // Explicit color fields + the content fields their "active" checks read
        ...COLOR_FIELDS.map(spec => form[spec.form_key]),
        form.title2, form.title3, form.subtitle, form.author, form.blurb,
        form.pattern_id, form.icon_id,
        // Dimension-affecting fields (mirrors image_regions_cache.ts) — has_spine/has_spine_text
        // depend on these, and image_regions.value alone doesn't change when there's no bg image
        form.service_id, form.size_id, form.page_count, form.binding_type,
        form.paper_type, form.ink_type, form.custom_unit, form.custom_trim_width,
        form.custom_trim_height, form.custom_bleed, form.custom_spine,
        image_regions.value,
    ], recompute, {immediate: true})
}
