
// Orchestrates a per-app font download: the mandatory Noto set (always) plus an optional
// caller-supplied curated font list, writing the resulting manifest.json into fonts_dir once
// every file is confirmed reachable by Typst under the family it's listed as. Noto's
// own manifest/fallback data (noto_manifest.json, han_hints.json) ships bundled with the
// package instead — nothing else is written here.

import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {join, relative} from 'node:path'
import type {DownloadOptions} from './types.js'
import {download_noto} from './noto.js'
import {download_curated} from './curated.js'
import {remove_overlaps} from './overlaps.js'
import {listed_font_files, fix_font_names, check_font_names} from './names.js'

export async function run_download(opts:DownloadOptions):Promise<void> {
    const noto_base = await download_noto(opts.fonts_dir, opts.config?.noto_group ?? 'Noto')
    const curated = opts.config?.curated
        ? await download_curated(opts.fonts_dir, opts.config.curated)
        : []
    const font_manifest = [...noto_base, ...curated]  // Noto Serif always index 0

    // Rename files whose own family is a respelling of their listed one, so Typst can reach
    // them. Runs over files already on disk too, so it fixes an existing tree.
    console.log('\nChecking font family names...\n')
    const listed = listed_font_files(opts.fonts_dir, font_manifest)
    await fix_font_names(listed, (file, from) => {
        console.log(`  ${relative(opts.fonts_dir, file.path)}: renamed "${from}" -> "${file.family}"`)
    })

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

    // Refuse to write a manifest naming any family Typst would silently substitute
    await check_font_names(listed)
    console.log(`  all ${listed.length} files reachable by their listed family`)

    await mkdir(opts.fonts_dir, {recursive: true})
    await writeFile(join(opts.fonts_dir, 'manifest.json'), JSON.stringify(font_manifest, null, 4) + '\n')
    console.log(`\nGenerated ${join(opts.fonts_dir, 'manifest.json')}`)
}

// Check an already-downloaded fonts_dir (its manifest.json plus the bundled Noto set) without
// downloading anything — throws if any file can't be reached by its listed family. Run it
// before publishing a fonts tree.
export async function run_check(fonts_dir:string):Promise<void> {
    const font_manifest = JSON.parse(await readFile(join(fonts_dir, 'manifest.json'), 'utf8'))
    const listed = listed_font_files(fonts_dir, font_manifest)
    await check_font_names(listed)
    console.log(`All ${listed.length} font files reachable by their listed family`)
}
