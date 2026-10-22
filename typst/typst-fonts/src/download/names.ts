// Keeps every downloaded font file reachable under the family it's listed as. Typst resolves
// `#text(font: "X")` against the family it reads from the file itself (see typst_family()),
// never our manifests, so a file named differently is unreachable — and Typst only warns
// "unknown font family" and substitutes, so nothing fails loudly. Upstream files drift from
// their listed names in a few ways: Google Fonts' optical-size cuts ("Merriweather 24pt"), and
// Noto's abbreviated legacy family names ("Noto Sans EgyptHiero", "Noto Sans PhagsPa").

import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {BundledFont} from '../manifest.js'
import {read_name_records, typst_family, type NameRecord} from '../sfnt.js'
import noto_manifest from '../generated/noto_manifest.json' with {type: 'json'}

/** A published font file and the family it's listed under */
export interface ListedFile {
    family:string
    path:string
}

// Every font file an app's fonts dir publishes: the app's own manifest entries at
// <family>/<file>, then the bundled Noto fallbacks at _noto/<family>/<file>
export function listed_font_files(fonts_dir:string, app_fonts:BundledFont[]):ListedFile[] {
    const files = app_fonts.flatMap(f =>
        f.files.map(file => ({family: f.family, path: join(fonts_dir, f.family, file)})))
    const noto = new Map([...noto_manifest.sans, ...noto_manifest.serif].map(f => [f.family, f]))
    for (const f of noto.values()) {
        files.push(...f.files.map(file =>
            ({family: f.family, path: join(fonts_dir, '_noto', f.family, file)})))
    }
    return files
}

// Name IDs whose text embeds the family name: family, full name, typographic family, Mac
// compatible full name, WWS family — and the PostScript forms with spaces dropped: unique ID,
// PostScript name, variations PostScript prefix
const FAMILY_NAME_IDS = new Set([1, 4, 16, 18, 21])
const POSTSCRIPT_NAME_IDS = new Set([3, 6, 20])

// Family name with spaces dropped, as PostScript names spell it
function squash(name:string):string {
    return name.replace(/\s+/g, '')
}

// Whether a file's own name is the listed family spelled differently, so renaming it is a safe
// correction rather than papering over a wrong download: its typographic family (ID 16) is
// already the listed one (Noto's abbreviated ID 1s), or the two differ only in spacing (Noto's
// "PhagsPa") or by Google Fonts' optical-size suffix ("Merriweather 24pt")
function same_family(records:NameRecord[], listed:string, legacy:string):boolean {
    const loose = (name:string) => squash(name.replace(/\s+\d+pt$/, '')).toLowerCase()
    return records.some(r => r.name_id === 16 && r.value === listed)
        || loose(legacy) === loose(listed)
}

// Sum a table's bytes as big-endian uint32s (zero-padded to a multiple of 4), mod 2^32
function checksum(bytes:Uint8Array):number {
    let sum = 0
    for (let i = 0; i < bytes.length; i += 4) {
        const word = ((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16)
            | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)
        sum = (sum + (word >>> 0)) >>> 0
    }
    return sum
}

// Decode a name string's raw bytes; null for a Mac record that isn't plain ASCII, since those
// are left exactly as they are
function decode(bytes:Uint8Array, platform_id:number):string | null {
    if (platform_id === 0 || platform_id === 3) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        return String.fromCharCode(
            ...Array.from({length: bytes.length >> 1}, (_, i) => view.getUint16(i * 2)))
    }
    return bytes.every(b => b < 0x80) ? String.fromCharCode(...bytes) : null
}

// Encode a name string for its platform: UTF-16BE, or single-byte ASCII for Mac
function encode(value:string, platform_id:number):Uint8Array {
    if (platform_id === 0 || platform_id === 3) {
        const bytes = new Uint8Array(value.length * 2)
        const view = new DataView(bytes.buffer)
        for (let i = 0; i < value.length; i++) {
            view.setUint16(i * 2, value.charCodeAt(i))
        }
        return bytes
    }
    return Uint8Array.from(value, c => c.charCodeAt(0))
}

// Rebuild a name table with `from` replaced by `to` in every record that embeds the family
// (and their space-free forms in the PostScript records). Keeps format 1 language tags.
function rename_in_name_table(table:Uint8Array, from:string, to:string):Uint8Array {
    const view = new DataView(table.buffer, table.byteOffset, table.byteLength)
    const format = view.getUint16(0)
    const count = view.getUint16(2)
    const storage = view.getUint16(4)
    const slice = (offset:number, length:number) =>
        table.subarray(storage + offset, storage + offset + length)

    // Read the records (12 bytes each) and any language-tag records (4 bytes each) after them
    const records = Array.from({length: count}, (_, i) => {
        const rec = 6 + i * 12
        return {
            head: table.subarray(rec, rec + 6),
            platform_id: view.getUint16(rec),
            name_id: view.getUint16(rec + 6),
            bytes: slice(view.getUint16(rec + 10), view.getUint16(rec + 8)),
        }
    })
    const tags_at = 6 + count * 12
    const lang_tags = format === 1
        ? Array.from({length: view.getUint16(tags_at)}, (_, i) =>
            slice(view.getUint16(tags_at + 4 + i * 4), view.getUint16(tags_at + 2 + i * 4)))
        : []

    // Substitute the family in each record that embeds it
    for (const record of records) {
        const [old, replacement] = FAMILY_NAME_IDS.has(record.name_id) ? [from, to]
            : POSTSCRIPT_NAME_IDS.has(record.name_id) ? [squash(from), squash(to)]
            : [null, null]
        const value = old === null ? null : decode(record.bytes, record.platform_id)
        if (value?.includes(old!) && (record.platform_id !== 1 || /^[\x00-\x7f]*$/.test(to))) {
            record.bytes = encode(value.replaceAll(old!, replacement!), record.platform_id)
        }
    }

    // Serialise: header, records, language tags, then all strings packed into fresh storage
    const header_len = tags_at + (format === 1 ? 2 + lang_tags.length * 4 : 0)
    const strings = [...records.map(r => r.bytes), ...lang_tags]
    const out = new Uint8Array(header_len + strings.reduce((sum, s) => sum + s.length, 0))
    const out_view = new DataView(out.buffer)
    out_view.setUint16(0, format)
    out_view.setUint16(2, count)
    out_view.setUint16(4, header_len)
    let offset = 0
    const place = (bytes:Uint8Array, length_at:number) => {
        out_view.setUint16(length_at, bytes.length)
        out_view.setUint16(length_at + 2, offset)
        out.set(bytes, header_len + offset)
        offset += bytes.length
    }
    records.forEach((record, i) => {
        out.set(record.head, 6 + i * 12)
        out_view.setUint16(6 + i * 12 + 6, record.name_id)
        place(record.bytes, 6 + i * 12 + 8)
    })
    if (format === 1) {
        out_view.setUint16(tags_at, lang_tags.length)
        lang_tags.forEach((tag, i) => place(tag, tags_at + 2 + i * 4))
    }
    return out
}

// Return a copy of a TTF/OTF file with its family renamed from `from` (its current name ID 1)
// to `to` throughout the name table. Every other table is copied byte for byte, in the same
// order; only the directory's offsets/checksums and head's checkSumAdjustment are recomputed.
export function rename_font_family(data:Uint8Array, from:string, to:string):Uint8Array {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const num_tables = view.getUint16(4)
    const tables = Array.from({length: num_tables}, (_, i):{tag:string, body:Uint8Array, offset:number} => {
        const rec = 12 + i * 16
        const offset = view.getUint32(rec + 8)
        return {
            tag: String.fromCharCode(...data.subarray(rec, rec + 4)),
            // A copy, not slice(): on a Node Buffer that's a view, and head is edited below
            body: new Uint8Array(data.subarray(offset, offset + view.getUint32(rec + 12))),
            offset,
        }
    })

    // Swap in the new name table, and zero checkSumAdjustment so it's summed as the spec says
    for (const table of tables) {
        if (table.tag === 'name')
            table.body = rename_in_name_table(table.body, from, to)
        if (table.tag === 'head')
            new DataView(table.body.buffer).setUint32(8, 0)
    }

    // Lay the tables out in their original physical order, each 4-byte aligned
    const placed = new Map<typeof tables[number], number>()
    let size = 12 + num_tables * 16
    for (const table of [...tables].sort((a, b) => a.offset - b.offset)) {
        placed.set(table, size)
        size += (table.body.length + 3) & ~3
    }

    // Write the header, directory and tables
    const out = new Uint8Array(size)
    const out_view = new DataView(out.buffer)
    out.set(data.subarray(0, 12))
    tables.forEach((table, i) => {
        const rec = 12 + i * 16
        out.set(data.subarray(rec, rec + 4), rec)
        out_view.setUint32(rec + 4, checksum(table.body))
        out_view.setUint32(rec + 8, placed.get(table)!)
        out_view.setUint32(rec + 12, table.body.length)
        out.set(table.body, placed.get(table)!)
    })

    // The whole-file checksum must come out to 0xB1B0AFBA
    const head = tables.find(t => t.tag === 'head')
    if (head) {
        out_view.setUint32(placed.get(head)! + 8, (0xB1B0AFBA - checksum(out)) >>> 0)
    }
    return out
}

// Rename, in place, each file whose Typst-visible family is a respelling of the family it's
// listed under (see same_family). Files already right are left untouched, so re-runs don't
// churn bytes; anything else wrong is left for check_font_names() to report.
export async function fix_font_names(
    files:ListedFile[],
    on_rename?:(file:ListedFile, from:string) => void,
):Promise<void> {
    for (const file of files) {
        const data = await readFile(file.path).catch(() => null)
        if (!data || typst_family(data)?.toLowerCase() === file.family.toLowerCase())
            continue
        const records = read_name_records(data)
        const legacy = records.find(r => r.name_id === 1)?.value
        if (legacy && same_family(records, file.family, legacy)) {
            await writeFile(file.path, rename_font_family(data, legacy, file.family))
            on_rename?.(file, legacy)
        }
    }
}

// Throw, listing every offender, unless each file exists and Typst files it under exactly the
// family it's listed as (case-insensitively, as Typst compares)
export async function check_font_names(files:ListedFile[]):Promise<void> {
    const problems:string[] = []
    for (const file of files) {
        const data = await readFile(file.path).catch(() => null)
        const family = data && typst_family(data)
        if (!data) {
            problems.push(`${file.path}: missing`)
        } else if (family?.toLowerCase() !== file.family.toLowerCase()) {
            problems.push(`${file.path}: Typst reads "${family}", listed as "${file.family}"`)
        }
    }
    if (problems.length > 0) {
        throw new Error(`${problems.length} font files can't be reached by their listed family`
            + ` — Typst would silently substitute another font:\n  ${problems.join('\n  ')}`)
    }
}
