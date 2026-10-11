
// Orchestrates a per-app font download: the mandatory Noto set (always) plus an optional
// caller-supplied curated font list, writing the resulting manifest.json into fonts_dir. Noto's
// own manifest/fallback data (noto_manifest.json, han_hints.json) ships bundled with the
// package instead — nothing else is written here.

import {writeFile, mkdir} from 'node:fs/promises'
import {join, relative} from 'node:path'
import type {DownloadOptions} from './types.js'
import {download_noto} from './noto.js'
import {download_curated} from './curated.js'
import {remove_overlaps} from './overlaps.js'

export async function run_download(opts:DownloadOptions):Promise<void> {
    const noto_base = await download_noto(opts.fonts_dir, opts.config?.noto_group ?? 'Noto')
    const curated = opts.config?.curated
        ? await download_curated(opts.fonts_dir, opts.config.curated)
        : []
    const font_manifest = [...noto_base, ...curated]  // Noto Serif always index 0

    // Merge overlaps in the Google Fonts files only — the _noto/ fallbacks come from upstream
    // Noto as CFF, which is already overlap-free. Runs over files already on disk too, so
    // enabling it later fixes an existing tree; clean files are left untouched.
    if (opts.remove_overlaps) {
        console.log('\nMerging overlapping glyph contours...\n')
        const paths = font_manifest.flatMap(f =>
            f.files.map(file => join(opts.fonts_dir, f.family, file)))
        await remove_overlaps(paths, result => {
            const outcome = result.merged ? `merged ${result.merged} glyphs` : 'clean'
            console.log(`  ${relative(opts.fonts_dir, result.path)}: ${outcome}`)
        })
    }

    await mkdir(opts.fonts_dir, {recursive: true})
    await writeFile(join(opts.fonts_dir, 'manifest.json'), JSON.stringify(font_manifest, null, 4) + '\n')
    console.log(`\nGenerated ${join(opts.fonts_dir, 'manifest.json')}`)
}
