
// ISBN barcode generation using bwip-js (SVG output — works in both Node and browser)

import * as bwipjs from 'bwip-js'

const encoder = new TextEncoder()

/**
 * Generate an ISBN-13 barcode as SVG bytes sized to the given region.
 * Uses toSVG() which is platform-independent (no canvas / Node Buffer required).
 * width_mm/height_mm are from printing-services cover_region_barcode (mm).
 */
export function generate_isbn_barcode(isbn:string, width_mm:number, height_mm:number):Uint8Array {
    // Trim surrounding whitespace but preserve internal dashes —
    // bwip-js requires dashes for ISBN grouping validation
    // bwip-js width/height are in mm
    const svg = bwipjs.toSVG({
        bcid:        'isbn',
        text:        isbn.trim(),
        includetext: true,
        width:       width_mm,
        height:      height_mm,
        paddingwidth: 10,  // 1cm seems reasonable (not set according to any spec though)
        paddingheight: 10,  // 1cm seems reasonable (not set according to any spec though)
        backgroundcolor: 'ffffff',  // KDP and others are picky and insist on black/white
    })

    return encoder.encode(svg)
}
