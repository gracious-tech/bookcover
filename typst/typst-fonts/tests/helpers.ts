
// Minimal synthetic TTF binary builder, for testing sfnt.ts's table parsing (and anything built
// on it, like custom.ts's process_font_files) without needing a real font file fixture.

/** One name-table record to embed in a synthetic test font */
export interface TestNameRecord {
    platform_id:number
    name_id:number
    value:string
}

// Encode one name record's string bytes: Windows platform (3) UTF-16BE, Mac (1) single-byte
function encode_name(platform_id:number, value:string):number[] {
    const bytes:number[] = []
    for (const ch of value) {
        const code = ch.charCodeAt(0)
        if (platform_id === 3) {
            bytes.push(code >> 8, code & 0xFF)
        } else {
            bytes.push(code & 0xFF)
        }
    }
    return bytes
}

// Build a minimal valid TTF: a 'name' table (by default one Windows-platform Family record for
// opts.family, or the explicit opts.name_records), unless no_os2 is set an 'OS/2' table whose
// sFamilyClass high byte is family_class (0 = absent classification, exercising the
// PANOSE/name fallback paths in parse_font_style), and with with_head a 54-byte 'head' table
// carrying a nonzero checkSumAdjustment. opts.version overrides the sfnt version tag to test
// rejection of non-font data.
export function build_test_font(opts:{
    family:string,
    family_class?:number,
    no_os2?:boolean,
    with_head?:boolean,
    name_records?:TestNameRecord[],
    version?:number,
}):Uint8Array {
    const records = opts.name_records
        ?? [{platform_id: 3, name_id: 1, value: opts.family}]
    const encoded = records.map(r => encode_name(r.platform_id, r.value))

    // 'name' table: format 0 header, then one 12-byte record per entry, then string storage
    const name_header_len = 6 + records.length * 12
    const name = new Uint8Array(name_header_len + encoded.reduce((sum, b) => sum + b.length, 0))
    const name_view = new DataView(name.buffer)
    name_view.setUint16(2, records.length)
    name_view.setUint16(4, name_header_len)
    let string_offset = 0
    records.forEach((record, i) => {
        const rec = 6 + i * 12
        name_view.setUint16(rec, record.platform_id)
        name_view.setUint16(rec + 2, record.platform_id === 3 ? 1 : 0)
        name_view.setUint16(rec + 4, record.platform_id === 3 ? 0x0409 : 0)
        name_view.setUint16(rec + 6, record.name_id)
        name_view.setUint16(rec + 8, encoded[i]!.length)
        name_view.setUint16(rec + 10, string_offset)
        name.set(encoded[i]!, name_header_len + string_offset)
        string_offset += encoded[i]!.length
    })
    const tables:{tag:string, body:Uint8Array}[] = [{tag: 'name', body: name}]

    // 'OS/2' table: sFamilyClass high byte only (rest left zeroed — PANOSE bytes 0 too, so a
    // family_class of 0/undefined exercises parse_font_style's "declares neither" null path)
    if (!opts.no_os2) {
        const os2 = new Uint8Array(40)
        os2[30] = opts.family_class ?? 0
        tables.push({tag: 'OS/2', body: os2})
    }

    // 'head' table: version 1.0, a stale checkSumAdjustment, and the magic number
    if (opts.with_head) {
        const head = new Uint8Array(54)
        const head_view = new DataView(head.buffer)
        head_view.setUint32(0, 0x00010000)
        head_view.setUint32(8, 0x12345678)
        head_view.setUint32(12, 0x5F0F3CF5)
        tables.push({tag: 'head', body: head})
    }

    // Offset table header (with nonzero search fields, so a rewrite that loses them shows),
    // then the directory, then each table 4-byte aligned
    const dir_len = 12 + tables.length * 16
    const offsets:number[] = []
    let size = dir_len
    for (const table of tables) {
        offsets.push(size)
        size += (table.body.length + 3) & ~3
    }
    const buf = new Uint8Array(size)
    const view = new DataView(buf.buffer)
    view.setUint32(0, opts.version ?? 0x00010000)
    view.setUint16(4, tables.length)
    view.setUint16(6, 16)
    view.setUint16(8, 1)
    view.setUint16(10, tables.length * 16 - 16)
    tables.forEach((table, i) => {
        const rec = 12 + i * 16
        for (let j = 0; j < 4; j++) buf[rec + j] = table.tag.charCodeAt(j)
        view.setUint32(rec + 8, offsets[i]!)
        view.setUint32(rec + 12, table.body.length)
        buf.set(table.body, offsets[i]!)
    })
    return buf
}
