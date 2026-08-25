
// Fetch, cache, and recolor SVG icons from the Iconify API, or resolve them from the bundled
// built-in icon set

import {find_builtin_icon} from './builtin_icons.js'

// Module-level in-memory cache: iconify ID → raw SVG string
const svg_cache = new Map<string, string>()

// This package has no i18n/UI concerns (see repo CLAUDE.md — generator is pure TS core), so
// errors reachable via user input (a mistyped icon field) carry a translation code + params
// alongside a default English message; the widget translates at the point it catches them
// (generator_client.ts / PreviewPane.vue), falling back to `message` for anything else.
export class IconCacheError extends Error {
    code:string
    params:Record<string, unknown>
    constructor(message:string, code:string, params:Record<string, unknown>) {
        super(message)
        this.name = 'IconCacheError'
        this.code = code
        this.params = params
    }
}

/** Fetch an SVG from the Iconify API and cache by ID */
async function fetch_icon_svg(iconify_id:string):Promise<string> {
    if (svg_cache.has(iconify_id))
        return svg_cache.get(iconify_id)!

    // Iconify IDs are formatted as "collection:name"
    const colon = iconify_id.indexOf(':')
    if (colon < 1) {
        throw new IconCacheError(
            `Invalid iconify ID "${iconify_id}" — expected "collection:name"`,
            'icon_invalid_format', {id: iconify_id},
        )
    }

    const collection = iconify_id.slice(0, colon)
    const name       = iconify_id.slice(colon + 1)

    // "builtin:<id>" resolves from the app's own bundled icon set instead of the network
    if (collection === 'builtin') {
        const svg = find_builtin_icon(name)
        if (!svg) {
            throw new IconCacheError(`Icon does not exist: ${iconify_id}`, 'icon_not_found', {id: iconify_id})
        }
        svg_cache.set(iconify_id, svg)
        return svg
    }

    const url = `https://api.iconify.design/${collection}/${name}.svg`

    const response = await fetch(url)
    if (!response.ok){
        if (response.status === 404){
            throw new IconCacheError(`Icon does not exist: ${iconify_id}`, 'icon_not_found', {id: iconify_id})
        }
        throw new IconCacheError(
            `Failed to fetch icon "${iconify_id}": ${response.status} ${response.statusText}`,
            'icon_fetch_failed', {id: iconify_id, status: response.status, status_text: response.statusText},
        )
    }

    // Strip width/height from the root <svg> tag so the icon scales via its container
    // WARN Needed as Inkscape fails to load embedded iconify svgs that have width="1em" height="1em"
    const svg = (await response.text()).replace(/<svg\b[^>]*>/, tag => tag.replace(/\s(?:width|height)="[^"]*"/g, ''))
    svg_cache.set(iconify_id, svg)
    return svg
}

/** Replace currentColor references in an SVG with a CSS color string */
function recolor_svg(svg:string, color:string):string {
    // WARN Typst's SVG renderer (resvg) doesn't support "deg" affixed to hue value
    return svg.replace(/currentColor/g, color.replace('deg', ''))
}

/**
 * Resolve an icon to a recolored SVG string.
 * Accepts either an iconify ID (e.g. "game-icons:sailboat") or a raw SVG string.
 * Iconify responses are cached in memory for the lifetime of the module.
 */
export async function resolve_icon(id_or_svg:string, color:string):Promise<string> {
    // Treat as raw SVG if the value looks like XML
    const svg = id_or_svg.trimStart().startsWith('<')
        ? id_or_svg
        : await fetch_icon_svg(id_or_svg)

    return recolor_svg(svg, color)
}
