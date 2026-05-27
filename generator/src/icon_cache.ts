
// Fetch, cache, and recolor SVG icons from the Iconify API

// Module-level in-memory cache: iconify ID → raw SVG string
const svg_cache = new Map<string, string>()

/** Fetch an SVG from the Iconify API and cache by ID */
async function fetch_icon_svg(iconify_id:string):Promise<string> {
    if (svg_cache.has(iconify_id))
        return svg_cache.get(iconify_id)!

    // Iconify IDs are formatted as "collection:name"
    const colon = iconify_id.indexOf(':')
    if (colon < 1)
        throw new Error(`Invalid iconify ID "${iconify_id}" — expected "collection:name"`)

    const collection = iconify_id.slice(0, colon)
    const name       = iconify_id.slice(colon + 1)
    const url        = `https://api.iconify.design/${collection}/${name}.svg`

    const response = await fetch(url)
    if (!response.ok){
        if (response.status === 404){
            throw new Error(`Icon does not exist: ${iconify_id}`)
        }
        throw new Error(`Failed to fetch icon "${iconify_id}": ${response.status} ${response.statusText}`)
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
