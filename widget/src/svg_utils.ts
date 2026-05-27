
// SVG and general utility functions shared across preview components

/** Convert an SVG string to a base64 data URL for use as an img src */
export function svg_data_url(svg:string):string {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
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
