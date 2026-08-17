
// Shared helper functions for the cover template

// Scale content so it fits within the container width using geometric scaling.
// Uses scale() rather than text(size: ...) so inner explicit font sizes are also scaled.
#let fit-to-width(max-text-size: auto, min-text-size: 2mm, it) = context {
    let effective-max = if max-text-size == auto { text.size * 3 } else { max-text-size }
    let effective-min = if min-text-size == auto { text.size * 0.33 } else { min-text-size }
    // Express size limits as dimensionless ratios relative to current text size
    let max-ratio = effective-max / text.size
    let min-ratio = effective-min / text.size
    let contentsize = measure(it)
    layout(size => {
        if contentsize.width > 0mm {
            let ratio = calc.min(size.width / contentsize.width, size.height / contentsize.height)
            let clamped = calc.max(calc.min(ratio, max-ratio), min-ratio)
            if clamped != 1.0 {
                scale(x: clamped * 100%, y: clamped * 100%, reflow: true, it)
            } else {
                it
            }
        }
    })
}

// Variant that only shrinks (never grows beyond current text size)
#let shrink-to-width(min-text-size: auto, it) = context {
    fit-to-width(max-text-size: text.size, min-text-size: min-text-size, it)
}

// Curve segments tracing one rounded rectangle (absolute coords), for compositing
// into a larger path. Corners use a cubic-bezier handle (0.5523r) to approximate arcs.
#let rounded-subpath(x, y, w, h, r) = {
    let k = 0.5523 * r
    (
        curve.move((x + r, y), relative: false),
        curve.line((x + w - r, y), relative: false),
        curve.cubic((x + w - r + k, y), (x + w, y + r - k), (x + w, y + r), relative: false),
        curve.line((x + w, y + h - r), relative: false),
        curve.cubic((x + w, y + h - r + k), (x + w - r + k, y + h), (x + w - r, y + h), relative: false),
        curve.line((x + r, y + h), relative: false),
        curve.cubic((x + r - k, y + h), (x, y + h - r + k), (x, y + h - r), relative: false),
        curve.line((x, y + r), relative: false),
        curve.cubic((x, y + r - k), (x + r - k, y), (x + r, y), relative: false),
        curve.close(),
    )
}

// White "matte" covering the whole canvas (cw × ch) with rounded-rect windows
// punched out via even-odd fill, so the artwork shows through each window as a
// rounded card surrounded by a white border. Used for home-print margins on
// edge-to-edge-incapable printers. `windows` is an array of (x, y, w, h) tuples.
#let home-print-matte(cw, ch, windows, r) = {
    let segs = (
        curve.move((0mm, 0mm), relative: false),
        curve.line((cw, 0mm), relative: false),
        curve.line((cw, ch), relative: false),
        curve.line((0mm, ch), relative: false),
        curve.close(),
    )
    for win in windows {
        segs = segs + rounded-subpath(win.at(0), win.at(1), win.at(2), win.at(3), r)
    }
    place(top + left, curve(fill: white, fill-rule: "even-odd", ..segs))
}
