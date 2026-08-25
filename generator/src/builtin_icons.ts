
// Built-in icons bundled directly into the build, for cases where a suitable icon isn't
// available on Iconify (or the app wants to ship its own drawing rather than depend on an
// external collection). Source SVGs live in generator/icon_svgs/ (open any one directly in an
// SVG editor and edit freely; they use currentColor for the fill, recolored at generate time
// the same way as a fetched Iconify icon — see recolor_svg() in icon_cache.ts) and are bundled
// into generated/icon_svgs_data.ts by .bin/gen_icon_svgs at build time. Referenced by id as
// "builtin:<id>" (e.g. "builtin:cross") — resolve_icon() in icon_cache.ts checks this map
// before falling back to an Iconify API fetch.

import {BUILTIN_ICON_SVGS} from './generated/icon_svgs_data.js'

/** Raw SVG text for a bundled built-in icon, keyed by its bare id (without "builtin:" prefix) */
export function find_builtin_icon(id:string):string | undefined {
    return BUILTIN_ICON_SVGS[id]
}

/** All bundled built-in icon ids, without the "builtin:" prefix */
export function list_builtin_icons():string[] {
    return Object.keys(BUILTIN_ICON_SVGS).sort()
}
