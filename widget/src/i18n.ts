
// Shared vue-i18n instance — used both via useI18n() in components and directly as
// i18n.global.t() in plain .ts modules that run outside any component context (e.g. dpi.ts).
// Translation workflow and rules: locales/TRANSLATING.md

import {createI18n} from 'vue-i18n'
import type {AppLocale} from 'bookcover-web'
import eng, {type Messages} from './locales/eng'

// The locale union is part of the published embed protocol (bookcover-web's embed_types.ts)
// — re-exported here so widget importers keep working unchanged
export type {AppLocale}

export type LocaleInfo = {
    code:AppLocale
    // Native name, shown in the switcher in its own language rather than the active one
    name:string
    // BCP 47 tag, set as <html lang> (which picks CJK glyph variants and makes CSS uppercase
    // locale-aware) and matched against the browser's preferred languages
    tag:string
    dir:'ltr' | 'rtl'
}

// Registry of selectable locales: English first, then alphabetical by English name. Adding one
// means an entry here, a locales/<code>.ts catalog and the AppLocale union in bookcover-web —
// tests/locales.test.ts fails until they agree. Nuxt UI's own built-in strings stay English. The
// switcher in SidebarPanel.vue reads this list directly, so it needs no change.
export const AVAILABLE_LOCALES:LocaleInfo[] = [
    {code: 'eng', name: 'English', tag: 'en', dir: 'ltr'},
    {code: 'ara', name: 'العربية', tag: 'ar', dir: 'rtl'},
    {code: 'ben', name: 'বাংলা', tag: 'bn', dir: 'ltr'},
    {code: 'zho_hans', name: '简体中文', tag: 'zh-Hans', dir: 'ltr'},
    {code: 'fra', name: 'Français', tag: 'fr', dir: 'ltr'},
    {code: 'deu', name: 'Deutsch', tag: 'de', dir: 'ltr'},
    {code: 'hin', name: 'हिन्दी', tag: 'hi', dir: 'ltr'},
    {code: 'ind', name: 'Bahasa Indonesia', tag: 'id', dir: 'ltr'},
    {code: 'ita', name: 'Italiano', tag: 'it', dir: 'ltr'},
    {code: 'jpn', name: '日本語', tag: 'ja', dir: 'ltr'},
    {code: 'kor', name: '한국어', tag: 'ko', dir: 'ltr'},
    {code: 'mar', name: 'मराठी', tag: 'mr', dir: 'ltr'},
    {code: 'fas', name: 'فارسی', tag: 'fa', dir: 'rtl'},
    {code: 'por', name: 'Português (Brasil)', tag: 'pt-BR', dir: 'ltr'},
    {code: 'rus', name: 'Русский', tag: 'ru', dir: 'ltr'},
    {code: 'spa', name: 'Español', tag: 'es', dir: 'ltr'},
    {code: 'tam', name: 'தமிழ்', tag: 'ta', dir: 'ltr'},
    {code: 'tel', name: 'తెలుగు', tag: 'te', dir: 'ltr'},
    {code: 'tha', name: 'ไทย', tag: 'th', dir: 'ltr'},
    {code: 'tur', name: 'Türkçe', tag: 'tr', dir: 'ltr'},
    {code: 'urd', name: 'اردو', tag: 'ur', dir: 'rtl'},
    {code: 'vie', name: 'Tiếng Việt', tag: 'vi', dir: 'ltr'},
]

const STORAGE_KEY = 'bookcover_locale'

// Every catalog except English is its own lazily-loaded chunk (vue-i18n's documented lazy-load
// pattern), so supporting another language costs the initial bundle nothing. English stays
// eager as the fallback for any key a catalog lacks.
const CATALOG_LOADERS = import.meta.glob<Messages>(
    ['./locales/*.ts', '!./locales/eng.ts'], {import: 'default'},
)

export const i18n = createI18n({
    legacy: false,
    locale: 'eng',
    fallbackLocale: 'eng',
    messages: {eng} as Record<AppLocale, Messages>,
})

/** Whether an untrusted value (host message, localStorage) names a supported locale */
export function is_app_locale(value:unknown):value is AppLocale {
    return AVAILABLE_LOCALES.some(l => l.code === value)
}

/** Read the stored locale choice — storage can throw outright in a sandboxed or
 *  storage-partitioned iframe, which must never stop the app from mounting */
function read_stored_locale():AppLocale | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return is_app_locale(stored) ? stored : null
    }
    catch {
        return null
    }
}

/** Persist the locale choice for the next standalone load, if storage is available */
function write_stored_locale(locale:AppLocale):void {
    try {
        localStorage.setItem(STORAGE_KEY, locale)
    }
    catch {
        // Not persisting is harmless — the choice still applies for this session
    }
}

/** First of the browser's preferred languages that we support, matched on the primary language
 *  subtag (so pt-PT gets Brazilian Portuguese and zh-TW gets Simplified Chinese, which beat the
 *  English fallback for those readers) */
function match_browser_locale():AppLocale | null {
    for (const preferred of navigator.languages ?? [navigator.language]) {
        const primary = preferred.toLowerCase().split('-')[0]
        const match = AVAILABLE_LOCALES.find(l => l.tag.toLowerCase().split('-')[0] === primary)
        if (match)
            return match.code
    }
    return null
}

/** Make sure a locale's catalog is registered with vue-i18n, fetching its chunk if needed */
async function load_catalog(locale:AppLocale):Promise<void> {
    if (locale === 'eng' || i18n.global.availableLocales.includes(locale))
        return
    const loader = CATALOG_LOADERS[`./locales/${locale}.ts`]
    if (!loader)
        throw new Error(`No catalog for locale "${locale}"`)
    i18n.global.setLocaleMessage(locale, await loader())
}

// Guards against an older, slower switch landing after a newer one
let latest_request = 0

/** Switch the active locale: loads its catalog, then applies it along with <html lang/dir>
 *  in one step. A failed load (e.g. offline) leaves the current locale. */
export async function set_locale(locale:AppLocale, persist = true):Promise<void> {
    const request = ++latest_request
    try {
        await load_catalog(locale)
        if (request !== latest_request)
            return
        const info = AVAILABLE_LOCALES.find(l => l.code === locale)!
        i18n.global.locale.value = locale
        document.documentElement.lang = info.tag
        document.documentElement.dir = info.dir
        if (persist)
            write_stored_locale(locale)
    }
    catch (error) {
        console.error(`Failed to load locale "${locale}"`, error)
    }
}

/** Resolve and load the initial locale: embed override > stored preference > browser > English.
 *  Await before mount. An embed-provided locale is applied but not persisted, since it reflects
 *  the parent site's language rather than the user's own standalone choice. */
export async function resolve_initial_locale(embed_locale?:string):Promise<void> {
    const locale = (is_app_locale(embed_locale) ? embed_locale : null)
        ?? read_stored_locale() ?? match_browser_locale() ?? 'eng'
    await set_locale(locale, false)
}
