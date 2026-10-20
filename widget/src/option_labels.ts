
// Translated labels for display names that come from data rather than our own templates:
// printing-services options and font_config.json's font groups. Each keeps the source's own
// English name as its fallback, so an option added upstream still shows (untranslated) until
// its catalog entry exists — tests/locales.test.ts fails when one is missing.

import {i18n} from './i18n'

const {t, te} = i18n.global

export type PrintOptionKind = 'binding' | 'ink' | 'paper'

/** Translate via a catalog key when English has it, else show the source's own name */
function label_or_fallback(key:string, fallback:string):string {
    return te(key, 'en') ? t(key) : fallback
}

/** A printing service's binding/ink/paper option name. Keyed per service because services
 *  name the same option id differently (their own product names, e.g. "Premium Booklet") */
export function print_option_label(
    service_id:string, kind:PrintOptionKind, id:string, fallback:string,
):string {
    return label_or_fallback(`print_options.${service_id}.${kind}.${id}`, fallback)
}

/** A named trim size ("US Trade", "Pocket Book"); sizes named only by their dimensions have no
 *  catalog entry and show as-is */
export function size_label(id:string, fallback:string):string {
    return label_or_fallback(`print_sizes.${id}`, fallback)
}

/** A measurement unit as printing-services names it ('mm' | 'inch') */
export function unit_label(unit:string):string {
    return label_or_fallback(`units.${unit}`, unit)
}

// font_config.json names its groups in English prose, so they're matched by that text
export const FONT_GROUP_KEYS:Record<string, string> = {
    'Styles': 'font_groups.styles',
    'Commonly used inside books': 'font_groups.book_interior',
    'Compatible with most languages': 'font_groups.noto',
}

/** A font picker group heading from font_config.json */
export function font_group_label(group:string):string {
    const key = FONT_GROUP_KEYS[group]
    return key ? t(key) : group
}
