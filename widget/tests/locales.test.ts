
import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {list_services, get_service, get_common_sizes} from 'printing-services'

import {AVAILABLE_LOCALES} from '../src/i18n'
import {FONT_GROUP_KEYS} from '../src/option_labels'
import eng from '../src/locales/eng'

// Every catalog, keyed by locale code — eager here, though the app loads all but English lazily
const catalogs = Object.fromEntries(Object.entries(
    import.meta.glob<Record<string, unknown>>('../src/locales/*.ts', {eager: true, import: 'default'}),
).map(([path, messages]) => [path.match(/\/(\w+)\.ts$/)![1], messages]))

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

const eng_flat = flatten(eng)

describe('locale registry', () => {

    it('has exactly one catalog per registered locale', () => {
        expect(Object.keys(catalogs).sort()).toEqual(AVAILABLE_LOCALES.map(l => l.code).sort())
    })

    it('has unique codes and BCP 47 tags', () => {
        expect(new Set(AVAILABLE_LOCALES.map(l => l.code)).size).toBe(AVAILABLE_LOCALES.length)
        expect(new Set(AVAILABLE_LOCALES.map(l => l.tag)).size).toBe(AVAILABLE_LOCALES.length)
    })
})

describe.each(Object.keys(catalogs).filter(code => code !== 'eng'))('catalog %s', code => {
    const flat = flatten(catalogs[code]!)

    it('has the same keys as English', () => {
        expect([...flat.keys()].sort()).toEqual([...eng_flat.keys()].sort())
    })

    it('keeps every placeholder exactly', () => {
        const wrong = [...eng_flat].filter(([key, source]) =>
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
    const catalog_options = eng.print_options as Record<string, Record<string, Record<string, string>>>

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
        expect(eng.print_sizes).toEqual(library)
    })

    it('has a heading for every font group in font_config.json', () => {
        const config_path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'font_config.json')
        const config = JSON.parse(readFileSync(config_path, 'utf8')) as
            {noto_group:string, curated:{group:string}[]}
        const groups = new Set([config.noto_group, ...config.curated.map(f => f.group)])
        for (const group of groups) {
            const key = FONT_GROUP_KEYS[group]
            expect(key, `font group "${group}"`).toBeDefined()
            expect(eng_flat.get(key!)).toBe(group)
        }
    })
})
