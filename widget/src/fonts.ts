
// Widget-side font concerns: where the published fonts tree is served from, and the shared
// reactive store for user-uploaded custom font families

import {reactive, computed} from 'vue'
import {process_font_files} from 'typst-fonts'
import type {CustomFont} from 'typst-fonts'
import {register_custom_font_preview} from 'typst-fonts/web'

// URL prefix for the separately-published fonts tree (curated + Noto fallback). The tree is
// managed in this repo at assets/fonts/ (populated via .bin/download_fonts, deployed to the
// public assets bucket via .bin/deploy_fonts) — in production it's fetched from that bucket,
// and in dev the widget's own vite server serves it (see vite_plugin_assets.ts)
export const fonts_prefix = import.meta.env.PROD
    ? 'https://assets.paper.bible/fonts'
    : '/generator_assets/fonts'

// Module-level reactive list of uploaded font families
export const custom_font_families:CustomFont[] = reactive([])

// All custom font bytes flattened (for passing to the generator)
export const all_custom_font_bytes = computed(() =>
    custom_font_families.flatMap(f => f.files)
)

/**
 * Add already-processed font families to the store, skipping duplicates by family name.
 * Also the entry point for restoring an embed host's stored fonts (see embed.ts).
 * Returns the names of the new families added. Families land in the store synchronously
 * (before any await) so callers can rely on the store being current on return of the promise
 * — only the @font-face preview registration is async.
 */
export function add_custom_fonts(fonts:CustomFont[]):Promise<string[]> {
    // Add new families to the store (skip duplicates)
    const added:CustomFont[] = []
    const existing = new Set(custom_font_families.map(f => f.family))
    for (const font of fonts) {
        if (existing.has(font.family))
            continue
        custom_font_families.push(font)
        existing.add(font.family)
        added.push(font)
    }

    // Register each new family for @font-face preview (on failure it falls back to default)
    return Promise.all(added.map(font =>
        register_custom_font_preview(font).catch(() => {})
    )).then(() => added.map(font => font.family))
}

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

    return add_custom_fonts(process_font_files(files))
}
