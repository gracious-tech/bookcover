
// Shared vue-i18n instance — used both via useI18n() in components and directly as
// i18n.global.t() in plain .ts modules that run outside any component context (e.g. dpi.ts)

import {createI18n} from 'vue-i18n'
import type {AppLocale} from 'bookcover-web'
import eng from './locales/eng'
import vie from './locales/vie'

// The locale union is part of the published embed protocol (bookcover-web's embed_types.ts)
// — re-exported here so widget importers keep working unchanged
export type {AppLocale}

// Registry of selectable locales, each shown by its own native name (not translated into the
// currently active language) — add an entry here (plus a locales/<code>.ts catalog AND the
// published AppLocale union in bookcover-web) to support another language; the switcher UI in
// PreviewPane.vue reads this list directly, so it never needs updating when a locale is added
// or removed.
export const AVAILABLE_LOCALES:{code:AppLocale, name:string}[] = [
    {code: 'eng', name: 'English'},
    {code: 'vie', name: 'Tiếng Việt'},
]

const STORAGE_KEY = 'bookcover_locale'

export const i18n = createI18n({
    legacy: false,
    locale: 'eng',
    fallbackLocale: 'eng',
    messages: {eng, vie},
})

/** Switch the active locale and persist the choice for the next standalone load */
export function set_locale(locale:AppLocale):void {
    i18n.global.locale.value = locale
    localStorage.setItem(STORAGE_KEY, locale)
}

/** Resolve the initial locale: embed override > stored preference > browser > 'eng' fallback.
 *  Call once before mount — an embed-provided locale is applied but not persisted, since it
 *  reflects the parent site's language rather than the user's own standalone choice. */
export function resolve_initial_locale(embed_locale?:AppLocale):void {
    const stored = localStorage.getItem(STORAGE_KEY) as AppLocale | null
    const browser_is_vi = navigator.language.toLowerCase().startsWith('vi')
    i18n.global.locale.value = embed_locale ?? stored ?? (browser_is_vi ? 'vie' : 'eng')
}
