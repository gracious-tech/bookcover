
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'


// A stand-in <html> element and storage, recorded so tests can check what the switch applied
const html = {lang: '', dir: ''}
let storage:Map<string, string> | null = new Map()

/** Fresh i18n module (its instance and switch counter are per page load) on stand-in globals.
 *  `storage` null makes every storage call throw, as in a sandboxed iframe */
async function load(languages:string[] = ['en-US']){
    html.lang = ''
    html.dir = ''
    vi.stubGlobal('navigator', {languages, language: languages[0]})
    vi.stubGlobal('localStorage', {
        getItem: (key:string) => {
            if (!storage) throw new Error('SecurityError')
            return storage.get(key) ?? null
        },
        setItem: (key:string, value:string) => {
            if (!storage) throw new Error('SecurityError')
            storage.set(key, value)
        },
    })
    // error_report reads window.parent; standalone, so reports go nowhere
    const self:Record<string, unknown> = {}
    self['parent'] = self
    vi.stubGlobal('window', self)
    vi.resetModules()
    const i18n_module = await import('../src/i18n')
    // Stubbed only after import: Vue's DOM runtime probes a real document as it loads, and
    // set_locale() reads this one at call time
    vi.stubGlobal('document', {documentElement: html})
    return i18n_module
}

beforeEach(() => {
    storage = new Map()
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('set_locale', () => {

    it('loads the catalog, then applies it with <html lang/dir> and remembers it', async () => {
        const {set_locale, i18n} = await load()
        await set_locale('ar')
        expect(i18n.global.locale.value).toBe('ar')
        expect(i18n.global.availableLocales).toContain('ar')
        expect(html).toEqual({lang: 'ar', dir: 'rtl'})
        expect(storage?.get('bookcover_locale')).toBe('ar')
        // Back to a left-to-right language
        await set_locale('en')
        expect(html).toEqual({lang: 'en', dir: 'ltr'})
    })

    it('can switch without remembering the choice', async () => {
        const {set_locale} = await load()
        await set_locale('fr', false)
        expect(html.lang).toBe('fr')
        expect(storage?.has('bookcover_locale')).toBe(false)
    })

    it('lets the newest of overlapping switches win', async () => {
        const {set_locale, i18n} = await load()
        // Japanese needs a catalog load, so English (already loaded) finishes first — and the
        // slower, older Japanese switch must not land on top of it afterwards
        const older = set_locale('ja')
        const newer = set_locale('en')
        await Promise.all([older, newer])
        expect(i18n.global.locale.value).toBe('en')
        expect(html.lang).toBe('en')
    })

    it('keeps the current locale when a catalog fails to load', async () => {
        const {set_locale, i18n} = await load()
        await set_locale('xx' as Parameters<typeof set_locale>[0])
        expect(i18n.global.locale.value).toBe('en')
        expect(console.error).toHaveBeenCalled()
    })

    it('still switches when storage is unavailable', async () => {
        storage = null
        const {set_locale, i18n} = await load()
        await set_locale('de')
        expect(i18n.global.locale.value).toBe('de')
    })
})


describe('resolve_initial_locale', () => {

    it('prefers an embed host\'s locale, matched like a browser tag, and never stores it', async () => {
        storage?.set('bookcover_locale', 'fr')
        const {resolve_initial_locale, i18n} = await load(['de-DE'])
        await resolve_initial_locale('zh-TW')
        expect(i18n.global.locale.value).toBe('zh-Hant')
        expect(storage?.get('bookcover_locale')).toBe('fr')
    })

    it('gives an unsupported embed locale English, over the user\'s own settings', async () => {
        storage?.set('bookcover_locale', 'fr')
        const {resolve_initial_locale, i18n} = await load(['de-DE'])
        await resolve_initial_locale('xx-YY')
        expect(i18n.global.locale.value).toBe('en')
    })

    it('uses the stored choice when standalone', async () => {
        storage?.set('bookcover_locale', 'it')
        const {resolve_initial_locale, i18n} = await load(['de-DE'])
        await resolve_initial_locale()
        expect(i18n.global.locale.value).toBe('it')
    })

    it('ignores a stored value that is not a locale code, falling to the browser', async () => {
        storage?.set('bookcover_locale', 'klingon')
        const {resolve_initial_locale, i18n} = await load(['xx', 'pt-PT'])
        await resolve_initial_locale()
        expect(i18n.global.locale.value).toBe('pt-BR')
    })

    it('falls back to English with no usable preference or storage', async () => {
        storage = null
        const {resolve_initial_locale, i18n} = await load(['xx'])
        await resolve_initial_locale()
        expect(i18n.global.locale.value).toBe('en')
        expect(html.lang).toBe('en')
    })
})
