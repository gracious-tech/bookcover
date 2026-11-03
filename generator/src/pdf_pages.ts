// Re-cutting a wraparound cover PDF into a page for the front and one for the back, for printing
// them separately (generate()'s `pdf_pages` option). Not re-exported from the main barrel, since
// it brings pdf-lib with it: reach it via the `bookcover-core/pdf-pages` subpath, which the
// platform wrappers import lazily only when asked for pages

import {PDFDocument} from 'pdf-lib'
import type {PDFPage} from 'pdf-lib'
import type {GetDimensionsResult} from './dimensions.js'


/** Convert mm to pt — the PDF coordinate system uses pt (1mm = 72/25.4pt) */
function mm_to_pt(mm:number):number {
    return mm / 25.4 * 72
}

/**
 * Turn a one-page wraparound cover PDF into two pages: the front, then the back. Any spine is left
 * out, as there's nothing to print it on once the faces are apart. Each page keeps the cover's
 * bleed on every side, as each is trimmed on its own (on the inner side that bleed is the spine's
 * or the other face's artwork). Both pages share one copy of the source page's content and
 * resources, each just boxed to its own face. `dims` must be in mm, as resolve_dimensions()
 * returns them.
 */
export async function split_pdf_pages(pdf:Uint8Array, dims:GetDimensionsResult)
        :Promise<Uint8Array> {
    const bleed = dims.cover_has_bleed ? dims.cover_bleed.toNumber() : 0
    const source = await PDFDocument.load(pdf)
    const sheet = source.getPage(0).getMediaBox()

    // One copier call for both pages, so the background image etc. is only embedded once
    const out = await PDFDocument.create()
    const [front, back] = await out.copyPages(source, [0, 0]) as [PDFPage, PDFPage]
    const faces = [[front, dims.cover_region_front], [back, dims.cover_region_back]] as const
    for (const [page, region] of faces) {
        // Regions are mm from the top-left, PDF boxes are pt from the bottom-left
        const x = sheet.x + mm_to_pt(region.x.toNumber() - bleed)
        const width = mm_to_pt(region.w.toNumber() + bleed * 2)
        const height = mm_to_pt(region.h.toNumber() + bleed * 2)
        const y = sheet.y + sheet.height - mm_to_pt(region.y.toNumber() - bleed) - height
        page.setMediaBox(x, y, width, height)
        page.setCropBox(x, y, width, height)
        out.addPage(page)
    }
    return await out.save()
}
