
// Raw SVG payload for the bundled preset icons, split out from preset_icons.ts so the
// metadata (which the widget's picker needs on the main thread) can be imported without
// pulling the whole SVG payload in with it — same split as patterns.ts / patterns_svg.ts.
// The data comes from generator/preset_icon_svgs/ (downloaded from Iconify by the
// maintainer-only .bin/fetch_preset_icons, baked in by .bin/gen_preset_icons).

import {PRESET_ICON_SVGS} from './generated/preset_icons_svg_data.js'

export {PRESET_ICON_SVGS}

/** Raw SVG text for a bundled preset icon, keyed by its full Iconify id
 *  (e.g. "game-icons:dead-wood") — undefined for anything outside the curated preset list */
export function find_preset_icon_svg(id:string):string | undefined {
    return PRESET_ICON_SVGS[id]
}
