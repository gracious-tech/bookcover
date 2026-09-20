
// ISBN barcode generation using bwip-js (SVG output — works in both Node and browser)

import {isbn as bwipp_isbn, drawingSVG} from 'bwip-js/generic'

const encoder = new TextEncoder()

/**
 * Generate an ISBN-13 barcode as SVG bytes sized to the given region.
 * width_mm/height_mm are from printing-services cover_region_barcode (mm).
 *
 * Calls the isbn encoder directly rather than bwip-js's toSVG(). toSVG() dispatches on the
 * bcid string, and that lookup table references all ~110 symbologies, so none of them can be
 * dropped — the dispatch alone costs ~1.5MB of encoders we never use. Naming the encoder
 * leaves only its own code reachable. The 'generic' entry point also avoids the canvas/DOM
 * path, which is dead weight here on both platforms. Output is unchanged: this is the same
 * encoder and the same SVG drawing backend toSVG() would have reached.
 */
export function generate_isbn_barcode(isbn:string, width_mm:number, height_mm:number):Uint8Array {
    // Trim surrounding whitespace but preserve internal dashes —
    // bwip-js requires dashes for ISBN grouping validation
    // bwip-js width/height are in mm
    const svg = bwipp_isbn({
        bcid: 'isbn',
        text: isbn.trim(),
        includetext: true,
        width: width_mm,
        height: height_mm,
        paddingwidth: 10,  // 1cm seems reasonable (not set according to any spec though)
        paddingheight: 10,  // 1cm seems reasonable (not set according to any spec though)
        backgroundcolor: 'ffffff',  // KDP and others are picky and insist on black/white
    }, drawingSVG())

    return encoder.encode(svg)
}

