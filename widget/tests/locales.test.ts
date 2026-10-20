
import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {list_services, get_service, get_common_sizes} from 'printing-services'

import {AVAILABLE_LOCALES, match_locale} from '../src/i18n'
import {FONT_GROUP_KEYS} from '../src/option_labels'
import en from '../src/locales/en'

// Every catalog, keyed by locale code — eager here, though the app loads all but English lazily
const catalogs = Object.fromEntries(Object.entries(
    import.meta.glob<Record<string, unknown>>('../src/locales/*.ts', {eager: true, import: 'default'}),
).map(([path, messages]) => [path.match(/\/([\w-]+)\.ts$/)![1], messages]))

// Keys that are halves of a sentence wrapped around a link or code sample, which a language's
// word order may leave empty
const MAY_BE_EMPTY = /_(prefix|suffix)$/

// printing-services names sizes it has no name for by their dimensions ('5.25" x 8"')
const DIMENSIONS_ONLY = /^[\d.]+" x [\d.]+"$/

/** Flatten a nested catalog into dotted keys -> message */
function flatten(obj:Record<string, unknown>, prefix = ''):Map<string, string> {
    const out = new Map<string, string>()
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string')
            out.set(path, value)
        else
            for (const [k, v] of flatten(value as Record<string, unknown>, path))
                out.set(k, v)
    }
    return out
}

/** Sorted named placeholders ({n}, {pages}…) in a message */
function placeholders(message:string):string[] {
    return [...message.matchAll(/\{(\w+)\}/g)].map(m => m[1]!).sort()
}

const en_flat = flatten(en)

describe('locale registry', () => {

    it('has exactly one catalog per registered locale', () => {
        expect(Object.keys(catalogs).sort()).toEqual(AVAILABLE_LOCALES.map(l => l.code).sort())
    })

    it('has unique codes', () => {
        expect(new Set(AVAILABLE_LOCALES.map(l => l.code)).size).toBe(AVAILABLE_LOCALES.length)
    })

    // Codes are set as <html lang>, so each must already be in canonical BCP 47 form
    it('uses canonical BCP 47 tags as codes', () => {
        for (const {code} of AVAILABLE_LOCALES)
            expect(Intl.getCanonicalLocales(code)[0]).toBe(code)
    })

    // Every catalog must be reachable by matching its own code
    it('matches each code to itself', () => {
        for (const {code} of AVAILABLE_LOCALES)
            expect(match_locale([code])).toBe(code)
    })
})

describe('locale matching (browser preferences and embed hosts)', () => {

    // Script beats region: each Chinese catalog serves every region written in its script
    it.each([
        ['zh-TW', 'zh-Hant'],
        ['zh-HK', 'zh-Hant'],
        ['zh-MO', 'zh-Hant'],
        ['zh-Hant-CN', 'zh-Hant'],
        ['zh', 'zh-Hans'],
        ['zh-CN', 'zh-Hans'],
        ['zh-SG', 'zh-Hans'],
        ['zh-Hans-HK', 'zh-Hans'],
        ['ar-EG', 'ar'],
        ['fa-IR', 'fa'],
    ])('matches %s to %s', (tag, code) => {
        expect(match_locale([tag])).toBe(code)
    })

    it('falls back to the language alone when no region or script matches', () => {
        expect(match_locale(['pt-PT'])).toBe('pt-BR')
        expect(match_locale(['en-GB'])).toBe('en')
    })

    it('takes the first supported preference and skips malformed or non-string tags', () => {
        expect(match_locale(['not a tag', 42, 'xx', 'de-AT', 'fr'])).toBe('de')
        expect(match_locale(['xx'])).toBe(null)
        expect(match_locale([''])).toBe(null)
    })
})

describe.each(Object.keys(catalogs).filter(code => code !== 'en'))('catalog %s', code => {
    const flat = flatten(catalogs[code]!)

    it('has the same keys as English', () => {
        expect([...flat.keys()].sort()).toEqual([...en_flat.keys()].sort())
    })

    it('keeps every placeholder exactly', () => {
        const wrong = [...en_flat].filter(([key, source]) =>
            flat.has(key) && placeholders(flat.get(key)!).join() !== placeholders(source).join())
        expect(wrong.map(([key]) => `${key}: ${flat.get(key)}`)).toEqual([])
    })

    it('leaves no message empty', () => {
        const empty = [...flat].filter(([key, value]) => !value.trim() && !MAY_BE_EMPTY.test(key))
        expect(empty.map(([key]) => key)).toEqual([])
    })
})

describe.each(Object.keys(catalogs))('message syntax %s', code => {

    // vue-i18n reserves { } for placeholders, @ for linked messages and | for plural forms, so
    // any of them outside a {name} placeholder breaks or silently alters the message
    it('uses no vue-i18n special characters', () => {
        const bad = [...flatten(catalogs[code]!)].filter(([, value]) =>
            /[{}@|]/.test(value.replace(/\{\w+\}/g, '')))
        expect(bad.map(([key, value]) => `${key}: ${value}`)).toEqual([])
    })

    // Zero-width spaces and bidi controls can't be seen while editing, so a later edit can't
    // tell they're there (see TRANSLATING.md for writing RTL without them). ZWNJ/ZWJ
    // (U+200C/D) are allowed: they're part of normal spelling in Persian and Indic scripts.
    it('has no invisible characters', () => {
        const bad = [...flatten(catalogs[code]!)].filter(([, value]) =>
            /[​‎‏‪-‮⁦-⁩﻿]/.test(value))
        expect(bad.map(([key]) => key)).toEqual([])
    })

    // Inputs, previews and the printed cover all use Western digits, so the UI matches them
    it('uses Western digits', () => {
        const native_digits = /[٠-٩۰-۹०-९০-৯௦-௯౦-౯๐-๙]/
        const bad = [...flatten(catalogs[code]!)].filter(([, value]) => native_digits.test(value))
        expect(bad.map(([key, value]) => `${key}: ${value}`)).toEqual([])
    })
})

describe('English covers names that come from data', () => {
    const catalog_options = en.print_options as Record<string, Record<string, Record<string, string>>>

    it('names every printing-services option exactly as the library does', () => {
        const library:Record<string, Record<string, Record<string, string>>> = {}
        for (const {id} of list_services()) {
            const service = get_service(id)
            library[id] = {
                binding: Object.fromEntries(service.get_binding_types().map(o => [o.id, o.name])),
                ink: Object.fromEntries(service.get_ink_types().map(o => [o.id, o.name])),
                paper: Object.fromEntries(service.get_paper_types().map(o => [o.id, o.name])),
            }
        }
        expect(catalog_options).toEqual(library)
    })

    it('names every named trim size exactly as the library does', () => {
        const library:Record<string, string> = {}
        const sizes = [...get_common_sizes(), ...list_services().flatMap(s => get_service(s.id).get_sizes())]
        for (const size of sizes)
            if (!DIMENSIONS_ONLY.test(size.name))
                library[size.id] = size.name
        expect(en.print_sizes).toEqual(library)
    })

    it('has a heading for every font group in font_config.json', () => {
        const config_path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'font_config.json')
        const config = JSON.parse(readFileSync(config_path, 'utf8')) as
            {noto_group:string, curated:{group:string}[]}
        const groups = new Set([config.noto_group, ...config.curated.map(f => f.group)])
        for (const group of groups) {
            const key = FONT_GROUP_KEYS[group]
            expect(key, `font group "${group}"`).toBeDefined()
            expect(en_flat.get(key!)).toBe(group)
        }
    })
})
