
// Manifest and helpers for the auto-fetched Noto per-script fallback fonts (fonts/_noto/,
// published separately from the app — see .bin/download_fonts_noto). Detects which Unicode
// scripts appear in a schema's text and resolves them to the specific Noto family that covers
// them, so a generate only needs the handful of fallback fonts a cover's text actually uses
// instead of the full ~150MB Noto set (dominated by the five CJK regions).

import NOTO_MANIFEST from './generated/noto_manifest.json' with {type: 'json'}

export type CjkVariant = 'JP' | 'KR' | 'SC' | 'TC' | 'HK'

// Serif/sans classification used to pick the Noto fallback that best matches a chosen font
export type FontStyle = 'serif' | 'sans'

/** A Noto family entry in fonts/_noto/<family>/ */
export interface NotoFont {
    family:string
    files:string[]
}

// Regular scripts resolve straight to a family (or null if Noto has no coverage); CJK scripts
// (Han, Hiragana, Katakana, Hangul) resolve through a region since glyph shapes differ by locale
type ScriptFonts = {
    sans:string | Partial<Record<CjkVariant, string>> | null
    serif:string | Partial<Record<CjkVariant, string>> | null
}

interface NotoManifest {
    sans:NotoFont[]
    serif:NotoFont[]
    by_script:Record<string, ScriptFonts>
}

const MANIFEST = NOTO_MANIFEST as unknown as NotoManifest

// Index by family name for fast lookup (a family only ever appears in one of sans/serif)
const by_family = new Map(
    [...MANIFEST.sans, ...MANIFEST.serif].map(f => [f.family, f])
)

// Look up a Noto fallback font by its family name
export function get_noto_font(family:string):NotoFont | undefined {
    return by_family.get(family)
}

// Scripts that are either not real detectable scripts, or already covered by whatever curated
// Latin font the schema is using — never worth adding as a fallback family
const SKIP_SCRIPTS = new Set(['Latin'])

// Build the list of detectable scripts once: pair each by_script key with a compiled
// \p{Script=...} regex, silently skipping any name the JS engine's Unicode database doesn't
// recognise as a valid Script value (a handful of Noto's script buckets, e.g. "Meroitic",
// don't map 1:1 onto a single Unicode Script property).
const SCRIPT_MATCHERS:{script:string, regex:RegExp}[] = []
for (const script of Object.keys(MANIFEST.by_script)) {
    if (SKIP_SCRIPTS.has(script)) continue
    try {
        SCRIPT_MATCHERS.push({script, regex: new RegExp(`\\p{Script=${script}}`, 'u')})
    } catch {
        // Not a recognised Unicode Script value — skip rather than guess
    }
}

// Detect which Noto-covered Unicode scripts appear anywhere in the given text
export function detect_scripts(text:string):Set<string> {
    const found = new Set<string>()
    for (const {script, regex} of SCRIPT_MATCHERS) {
        if (regex.test(text)) found.add(script)
    }
    return found
}

// Kana and Hangul are unambiguous markers of their language; Han characters alone are not
const KANA_REGEX = /\p{Script=Hiragana}|\p{Script=Katakana}/u
const HANGUL_REGEX = /\p{Script=Hangul}/u
const HAN_REGEX = /\p{Script=Han}/u

// Auto-detect the cover-wide default region for Han-only text: kana anywhere can only mean
// Japanese and Hangul can only mean Korean, while Han-only text is ambiguous (SC/TC/HK can't
// be told apart reliably) so it falls back to SC as the broadest-coverage default
export function detect_cjk_variant(text:string):CjkVariant {
    if (KANA_REGEX.test(text))
        return 'JP'
    if (HANGUL_REGEX.test(text))
        return 'KR'
    return 'SC'
}

/** A contiguous CJK range of a text with the language region its sentences belong to */
export interface CjkSegment {
    start:number
    end:number
    region:CjkVariant
}

// Characters that belong to a CJK run: Han/kana/hangul letters plus CJK punctuation and
// fullwidth forms (U+3000-303F, U+FF00-FFEF) so quotes/commas stay inside their sentence
const CJK_RUN_REGEX =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]+/gu

// Sentence-ending punctuation inside a CJK run (。．！？) — enders stay with their sentence
const SENTENCE_END_REGEX = /[。．！？]+/gu

// Classify one sentence's language: kana → JP, Hangul → KR, Han-only → han_variant,
// null when it contains no CJK letters at all (punctuation only)
function classify_sentence(text:string, han_variant:CjkVariant):CjkVariant | null {
    if (KANA_REGEX.test(text))
        return 'JP'
    if (HANGUL_REGEX.test(text))
        return 'KR'
    if (HAN_REGEX.test(text))
        return han_variant
    return null
}

// Split text into CJK segments and classify each one's language: contiguous CJK runs are
// split at sentence-ending punctuation and each sentence is classified independently (kana
// can only be Japanese, Hangul only Korean, Han-only sentences use han_variant). This is
// what lets one blurb mix e.g. Japanese and Chinese sentences and render each with its own
// regional font — per-glyph fallback alone can't tell shared Han characters apart.
export function cjk_segments(text:string, han_variant:CjkVariant):CjkSegment[] {
    const segments:CjkSegment[] = []
    for (const run of text.matchAll(CJK_RUN_REGEX)) {
        const run_text = run[0]
        const run_start = run.index!

        // Split the run into sentences (ender punctuation stays with the preceding sentence)
        const parts:{start:number, end:number}[] = []
        let sentence_start = 0
        for (const ender of run_text.matchAll(SENTENCE_END_REGEX)) {
            parts.push({start: sentence_start, end: ender.index! + ender[0].length})
            sentence_start = ender.index! + ender[0].length
        }
        if (sentence_start < run_text.length)
            parts.push({start: sentence_start, end: run_text.length})

        // Classify each sentence; punctuation-only sentences inherit the previous sentence's
        // region (or the next one's when the run starts with them)
        const regions = parts.map(p => classify_sentence(
            run_text.slice(p.start, p.end), han_variant))
        for (let i = 0; i < regions.length; i++) {
            if (regions[i] === null)
                regions[i] = regions[i - 1] ?? regions.slice(i + 1).find(r => r !== null) ?? null
        }

        // Emit segments, merging adjacent sentences of the same region
        for (let i = 0; i < parts.length; i++) {
            const region = regions[i]
            if (region === null)
                continue
            const start = run_start + parts[i].start
            const end = run_start + parts[i].end
            const last = segments[segments.length - 1]
            if (last && last.region === region && last.end === start) {
                last.end = end
            }
            else {
                segments.push({start, end, region})
            }
        }
    }
    return segments
}

// Resolve the Noto CJK family covering a region in the given style (('JP', 'serif') →
// 'Noto Serif JP'); null only if the manifest is somehow missing the region
export function cjk_family(region:CjkVariant, style:FontStyle):string | null {
    return resolve_script_family(MANIFEST.by_script['Han'], region, style)
}

// Resolve one script's {sans, serif} entry to a single concrete family: the preferred style
// when Noto covers the script in it, otherwise the other style (rendering something always
// beats style purity). CJK scripts (Han/Hiragana/Katakana/Hangul) resolve per-region via
// cjk_variant.
function resolve_script_family(
    fonts:ScriptFonts,
    cjk_variant:CjkVariant,
    style:FontStyle,
):string | null {
    const resolve = (entry:ScriptFonts['sans']):string | null => {
        if (entry === null) return null
        if (typeof entry === 'string') return entry
        return entry[cjk_variant] ?? null
    }
    return resolve(fonts[style]) ?? resolve(style === 'serif' ? fonts.sans : fonts.serif)
}

// Build the font fallback chain for a piece of text: one Noto family per script detected in
// the text, in the given style where available (Typst tries fonts in array order and skips
// glyphs it can't find, so the chosen font always stays first in the caller's chain)
export function resolve_fallback_chain(
    text:string,
    cjk_variant:CjkVariant = 'SC',
    style:FontStyle = 'serif',
):string[] {
    const families = new Set<string>()
    for (const script of detect_scripts(text)) {
        const family = resolve_script_family(MANIFEST.by_script[script], cjk_variant, style)
        if (family)
            families.add(family)
    }
    return [...families]
}
