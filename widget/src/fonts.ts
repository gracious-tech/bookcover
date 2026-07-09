
// Widget-side font concerns: where the published fonts tree is served from, and the shared
// reactive store for user-uploaded custom font families

import {reactive, computed} from 'vue'
import {process_font_files} from 'typst-fonts'
import type {CustomFont} from 'typst-fonts'
import {register_custom_font_preview} from 'typst-fonts/web'

// URL prefix for the separately-published fonts tree (curated + Noto fallback). The fonts
// collection is managed in its own repo, not here — in production it's published at
// fonts.paper.bible, and in dev that repo's own dev server serves the same tree
export const fonts_prefix = import.meta.env.PROD
    ? 'https://fonts.paper.bible'
    : 'http://localhost:5300/generator_assets/fonts'

// Module-level reactive list of uploaded font families
export const custom_font_families:CustomFont[] = reactive([])

// All custom font bytes flattened (for passing to the generator)
export const all_custom_font_bytes = computed(() =>
    custom_font_families.flatMap(f => f.files)
)

/**
 * Process uploaded files via typst-fonts — extracts font families from raw file data,
 * handling both individual .ttf/.otf files and .zip archives.
 * Returns the names of the new families added.
 */
export async function process_uploaded_files(file_list:File[]):Promise<string[]> {
    // Read every uploaded file's raw bytes for process_font_files
    const files = await Promise.all(file_list.map(async (file) => ({
        name: file.name,
        data: new Uint8Array(await file.arrayBuffer()),
    })))

    // Add new families to the store (skip duplicates)
    const added:string[] = []
    const existing = new Set(custom_font_families.map(f => f.family))
    for (const font of process_font_files(files)) {
        if (existing.has(font.family))
            continue
        custom_font_families.push(font)
        existing.add(font.family)
        added.push(font.family)

        // Register the family for @font-face preview (on failure it falls back to default)
        await register_custom_font_preview(font).catch(() => {})
    }

    return added
}
