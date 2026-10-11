#!/usr/bin/env node

// Standalone CLI for downloading fonts into an app's own fonts directory. Noto Serif/Sans +
// the full per-script fallback set are always included; --config supplies any additional
// curated fonts. Not every consumer needs to run this — the library can also be pointed at
// manifest data produced some other way (e.g. an existing hosted font collection).
//
// Usage: typst-fonts-download --fonts <dir> [--config <config.json>] [--remove-overlaps]
//   --fonts <dir>        Directory to download font binaries + write manifest.json into
//   --config <path>      JSON file: {noto_group?, curated?: [{family, group, style}]}
//   --remove-overlaps    Merge overlapping glyph contours (needs python3 with fonttools and
//                        skia-pathops) so the fonts print without gaps on even-odd RIPs

import {readFile} from 'node:fs/promises'
import {run_download} from './run.js'
import type {FontsConfig} from './types.js'

function read_arg(flag:string):string | undefined {
    const i = process.argv.indexOf(flag)
    return i === -1 ? undefined : process.argv[i + 1]
}

// Print usage and exit when asked
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: typst-fonts-download --fonts <dir> [--config <config.json>]'
        + ' [--remove-overlaps]\n'
        + '  --fonts <dir>        Directory to download fonts + write manifest.json into'
        + ' (default ./fonts)\n'
        + '  --config <path>      JSON file: {noto_group?, curated?: [{family, group, style}]}\n'
        + '  --remove-overlaps    Merge overlapping glyph contours for print (needs python3 with'
        + ' fonttools + skia-pathops)')
    process.exit(0)
}

const fonts_dir = read_arg('--fonts') ?? './fonts'
const config_path = read_arg('--config')
const config:FontsConfig | undefined = config_path
    ? JSON.parse(await readFile(config_path, 'utf8'))
    : undefined
const remove_overlaps = process.argv.includes('--remove-overlaps')

await run_download({fonts_dir, config, remove_overlaps})
