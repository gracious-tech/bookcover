
// Shared vue-i18n instance — used both via useI18n() in components and directly as
// i18n.global.t() in plain .ts modules that run outside any component context (e.g. dpi.ts).
// Translation workflow and rules: locales/TRANSLATING.md

import {createI18n} from 'vue-i18n'
import en, {type Messages} from './locales/en'
import {report_error} from './error_report'

export type LocaleInfo = {
    // BCP 47 tag, as browsers use: the catalog's filename, the value embed hosts send, and
    // <html lang> (which picks CJK glyph variants and makes CSS uppercase locale-aware). A
    // region or script subtag only where it tells catalogs apart: Chinese is tagged by script
    // (zh-Hans/zh-Hant), not region (zh-CN/zh-TW), since each script serves several regions.
    code:string
    // Native name, shown in the switcher in its own language rather than the active one
    name:string
    dir:'ltr' | 'rtl'
}

// Registry of selectable locales: English first, then alphabetical by English name. Adding one
// means an entry here and a locales/<code>.ts catalog — tests/locales.test.ts fails until they
// agree. Nuxt UI's own built-in strings stay English. The switcher in SidebarPanel.vue reads
// this list directly, so it needs no change. Embed hosts send the locale as a plain string, so
// a new language needs no bookcover-web release.
export const AVAILABLE_LOCALES = [
    {code: 'en', name: 'English', dir: 'ltr'},
    {code: 'ar', name: 'العربية', dir: 'rtl'},
    {code: 'bn', name: 'বাংলা', dir: 'ltr'},
    {code: 'zh-Hans', name: '简体中文', dir: 'ltr'},
    {code: 'zh-Hant', name: '繁體中文', dir: 'ltr'},
    {code: 'fr', name: 'Français', dir: 'ltr'},
    {code: 'de', name: 'Deutsch', dir: 'ltr'},
    {code: 'hi', name: 'हिन्दी', dir: 'ltr'},
    {code: 'id', name: 'Bahasa Indonesia', dir: 'ltr'},
    {code: 'it', name: 'Italiano', dir: 'ltr'},
    {code: 'ja', name: '日本語', dir: 'ltr'},
    {code: 'ko', name: '한국어', dir: 'ltr'},
    {code: 'mr', name: 'मराठी', dir: 'ltr'},
    {code: 'fa', name: 'فارسی', dir: 'rtl'},
    {code: 'pt-BR', name: 'Português (Brasil)', dir: 'ltr'},
    {code: 'ru', name: 'Русский', dir: 'ltr'},
    {code: 'es', name: 'Español', dir: 'ltr'},
    {code: 'ta', name: 'தமிழ்', dir: 'ltr'},
    {code: 'te', name: 'తెలుగు', dir: 'ltr'},
    {code: 'th', name: 'ไทย', dir: 'ltr'},
    {code: 'tr', name: 'Türkçe', dir: 'ltr'},
    {code: 'ur', name: 'اردو', dir: 'rtl'},
    {code: 'vi', name: 'Tiếng Việt', dir: 'ltr'},
] as const satisfies readonly LocaleInfo[]

// A supported locale code, derived from the registry so it can't drift from it
export type AppLocale = typeof AVAILABLE_LOCALES[number]['code']

const STORAGE_KEY = 'bookcover_locale'

// Every catalog except English is its own lazily-loaded chunk (vue-i18n's documented lazy-load
// pattern), so supporting another language costs the initial bundle nothing. English stays
// eager as the fallback for any key a catalog lacks.
const CATALOG_LOADERS = import.meta.glob<Messages>(
    ['./locales/*.ts', '!./locales/en.ts'], {import: 'default'},
)

export const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: {en} as Record<AppLocale, Messages>,
})

/** Whether a value is exactly one of our locale codes */
function is_app_locale(value:unknown):value is AppLocale {
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

/** A BCP 47 tag with its likely script and region filled in (CLDR likely subtags, so zh-TW and
 *  zh-HK become zh-Hant-*, bare zh becomes zh-Hans-CN), or null for a malformed tag */
function maximize_tag(tag:string):Intl.Locale | null {
    try {
        return new Intl.Locale(tag).maximize()
    }
    catch {
        return null
    }
}

// Registry codes, maximized once for matching
const MAXIMIZED_CODES = AVAILABLE_LOCALES.map(l => ({code: l.code, locale: maximize_tag(l.code)}))

/** First of the given preferred BCP 47 tags that we support. Language and script must both
 *  match where possible, so zh-TW gets Traditional and zh-SG Simplified; failing that, the
 *  language alone (pt-PT gets Brazilian Portuguese, which beats English for those readers) */
export function match_locale(preferred:readonly unknown[]):AppLocale | null {
    for (const tag of preferred) {
        const wanted = typeof tag === 'string' ? maximize_tag(tag) : null
        if (!wanted)
            continue
        const same_language = MAXIMIZED_CODES.filter(m => m.locale?.language === wanted.language)
        const match = same_language.find(m => m.locale?.script === wanted.script) ?? same_language[0]
        if (match)
            return match.code
    }
    return null
}

/** First of the browser's preferred languages that we support */
function match_browser_locale():AppLocale | null {
    return match_locale(navigator.languages ?? [navigator.language])
}

/** Make sure a locale's catalog is registered with vue-i18n, fetching its chunk if needed */
async function load_catalog(locale:AppLocale):Promise<void> {
    if (locale === 'en' || i18n.global.availableLocales.includes(locale))
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
        document.documentElement.lang = info.code
        document.documentElement.dir = info.dir
        if (persist)
            write_stored_locale(locale)
    }
    catch (error) {
        console.error(`Failed to load locale "${locale}"`, error)
        report_error(error, `Failed to load locale "${locale}"`)
    }
}

/** Resolve and load the initial locale: embed override > stored preference > browser > English.
 *  Await before mount. An embed-provided locale is matched like a browser preference (so zh-TW
 *  or pt-PT work) and applied but not persisted, since it reflects the parent site's language
 *  rather than the user's own standalone choice. One we don't support gets English: the host
 *  chose a language, so it overrides the user's own settings. */
export async function resolve_initial_locale(embed_locale?:string):Promise<void> {
    let locale:AppLocale
    if (embed_locale !== undefined)
        locale = match_locale([embed_locale]) ?? 'en'
    else
        locale = read_stored_locale() ?? match_browser_locale() ?? 'en'
    await set_locale(locale, false)
}
