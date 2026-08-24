
// SVG and general utility functions shared across widget components

/** Convert an SVG string to a base64 data URL for use as an img src */
export function svg_data_url(svg:string):string {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
}

/** White or black, whichever contrasts more against a hex color (ITU-R BT.601) — a cheap
 *  perceptual-luma check for UI swatch labels, not the WCAG-based math bookcover-core uses for
 *  actual cover print colors (see is_dark_color there) */
export function contrast_color(hex:string):string {
    const stripped = hex.replace('#', '')
    const r = parseInt(stripped.slice(0, 2), 16) / 255
    const g = parseInt(stripped.slice(2, 4), 16) / 255
    const b = parseInt(stripped.slice(4, 6), 16) / 255
    return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5 ? '#000000' : '#ffffff'
}

// Zoom range and sensitivity shared by all preview components
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.0
export const ZOOM_SENS = 0.001

/** Returns a wheel event handler that adjusts zoom within bounds and calls back with the new value */
export function make_zoom_wheel_handler(get_zoom:() => number, set_zoom:(v:number) => void):(e:WheelEvent) => void {
    return (e:WheelEvent) => {
        set_zoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, get_zoom() - e.deltaY * ZOOM_SENS)))
    }
}

/** Standard debounce — delays fn until ms have elapsed since last call */
export function debounce(fn:() => void, ms:number):() => void {
    let timer:ReturnType<typeof setTimeout>
    return () => {
        clearTimeout(timer)
        timer = setTimeout(fn, ms)
    }
}
