
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
