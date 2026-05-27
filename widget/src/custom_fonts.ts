
// Shared reactive store for user-uploaded custom font families

import {reactive, computed} from 'vue'
import {unzipSync} from 'fflate'

/** A user-uploaded font family with its file data */
export interface CustomFontFamily {
    family:string
    files:Uint8Array[]
}

// Module-level reactive list of uploaded font families
export const custom_font_families:CustomFontFamily[] = reactive([])

// All custom font bytes flattened (for passing to the generator)
export const all_custom_font_bytes = computed(() =>
    custom_font_families.flatMap(f => f.files)
)

/** Weights to exclude — exotic variants that the generator doesn't need */
const SKIP_WEIGHTS = /-(Thin|ExtraLight|Light|Medium|SemiBold|ExtraBold|Black|Heavy|UltraLight|DemiBold|UltraBold)/i

/** Variable font filename patterns to exclude */
const VARIABLE_FONT = /VariableFont|\[/

/** Check if a filename is a font file we should keep */
function should_include(name:string):boolean {
    const base = name.split('/').pop() || ''
    if (!/\.(ttf|otf)$/i.test(base))
        return false
    if (VARIABLE_FONT.test(base))
        return false
    if (SKIP_WEIGHTS.test(base))
        return false
    return true
}

/** Parse the font family name from a TTF/OTF file's name table */
export function parse_font_family(data:Uint8Array):string | null {
    try {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

        // Read number of tables from the offset table
        const num_tables = view.getUint16(4)

        // Find the 'name' table offset
        let name_offset = 0
        for (let i = 0; i < num_tables; i++) {
            const rec = 12 + i * 16
            const tag = String.fromCharCode(
                view.getUint8(rec), view.getUint8(rec + 1),
                view.getUint8(rec + 2), view.getUint8(rec + 3),
            )
            if (tag === 'name') {
                name_offset = view.getUint32(rec + 8)
                break
            }
        }
        if (!name_offset)
            return null

        // Parse name records
        const count = view.getUint16(name_offset + 2)
        const string_storage = name_offset + view.getUint16(name_offset + 4)

        for (let i = 0; i < count; i++) {
            const rec = name_offset + 6 + i * 12
            const platform_id = view.getUint16(rec)
            const name_id = view.getUint16(rec + 6)
            const length = view.getUint16(rec + 8)
            const offset = view.getUint16(rec + 10)

            // nameID 1 = Font Family name
            if (name_id !== 1)
                continue

            const str_start = string_storage + offset

            // Platform 3 (Windows) — UTF-16BE encoding
            if (platform_id === 3) {
                const chars:number[] = []
                for (let j = 0; j < length; j += 2) {
                    chars.push(view.getUint16(str_start + j))
                }
                return String.fromCharCode(...chars)
            }

            // Platform 1 (Mac) — ASCII-like encoding
            if (platform_id === 1) {
                const chars:number[] = []
                for (let j = 0; j < length; j++) {
                    chars.push(view.getUint8(str_start + j))
                }
                return String.fromCharCode(...chars)
            }
        }
    } catch {
        // Malformed font file
    }
    return null
}

/** Register a custom font for preview in the browser via FontFace API */
async function register_preview_font(family:string, data:Uint8Array):Promise<void> {
    try {
        const face = new FontFace(family, data.buffer.slice(
            data.byteOffset, data.byteOffset + data.byteLength,
        ))
        await face.load()
        document.fonts.add(face)
    } catch {
        // Font preview will fall back to default
    }
}

/**
 * Process uploaded files — extracts font families from raw file data.
 * Handles both individual .ttf/.otf files and .zip archives.
 * Returns the number of new families added.
 */
export async function process_uploaded_files(file_list:File[]):Promise<string[]> {
    // Collect all font file buffers with their filenames
    const font_files:{name:string, data:Uint8Array}[] = []

    for (const file of file_list) {
        const buf = new Uint8Array(await file.arrayBuffer())

        if (file.name.toLowerCase().endsWith('.zip')) {
            // Extract font files from zip
            const entries = unzipSync(buf)
            for (const [path, data] of Object.entries(entries)) {
                if (should_include(path)) {
                    font_files.push({name: path.split('/').pop()!, data})
                }
            }
        } else if (should_include(file.name)) {
            font_files.push({name: file.name, data: buf})
        }
    }

    // If no files passed the filter, try again with all font files (no weight filter)
    if (font_files.length === 0) {
        for (const file of file_list) {
            const buf = new Uint8Array(await file.arrayBuffer())
            if (file.name.toLowerCase().endsWith('.zip')) {
                const entries = unzipSync(buf)
                for (const [path, data] of Object.entries(entries)) {
                    const base = path.split('/').pop() || ''
                    if (/\.(ttf|otf)$/i.test(base)) {
                        font_files.push({name: base, data})
                    }
                }
            } else if (/\.(ttf|otf)$/i.test(file.name)) {
                font_files.push({name: file.name, data: buf})
            }
        }
    }

    // Group files by family name (parsed from font metadata)
    const families = new Map<string, Uint8Array[]>()
    for (const {data} of font_files) {
        const family = parse_font_family(data)
        if (!family)
            continue
        const existing = families.get(family)
        if (existing) {
            existing.push(data)
        } else {
            families.set(family, [data])
        }
    }

    // Add new families to the store (skip duplicates)
    const added:string[] = []
    const existing = new Set(custom_font_families.map(f => f.family))
    for (const [family, files] of families) {
        if (existing.has(family))
            continue
        custom_font_families.push({family, files})
        existing.add(family)
        added.push(family)

        // Register the first file for @font-face preview
        await register_preview_font(family, files[0]!)
    }

    return added
}
