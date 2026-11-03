
import {describe, it, expect} from 'vitest'
import {PDFDocument} from 'pdf-lib'

import {resolve_dimensions} from '../src/dimensions.js'
import {split_pdf_pages} from '../src/pdf_pages.js'


const mm_to_pt = (mm:number) => mm / 25.4 * 72

// A blank one-page wraparound the size the dimensions say, as a render would produce
async function wraparound(dims:ReturnType<typeof resolve_dimensions>):Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    doc.addPage([mm_to_pt(dims.cover_total_width.toNumber()),
        mm_to_pt(dims.cover_total_height.toNumber())])
    return await doc.save()
}

// A custom-service A5 cover with the given bleed and spine
function custom_dims(bleed:number, spine:number) {
    return resolve_dimensions({service_id: 'custom', binding_type: 'paperback', custom_unit: 'mm',
        custom_trim_width: 148, custom_trim_height: 210, custom_bleed: bleed, custom_spine: spine})
}

// Each page's media box of a split cover
async function boxes(dims:ReturnType<typeof resolve_dimensions>) {
    const split = await PDFDocument.load(await split_pdf_pages(await wraparound(dims), dims))
    return split.getPages().map(page => page.getMediaBox())
}


describe('split_pdf_pages', () => {

    it('puts the front on page one and the back on page two', async () => {
        const [front, back, ...rest] = await boxes(custom_dims(0, 0))
        expect(rest).toEqual([])
        // The back is the left half of the wraparound, the front the right half
        expect(front?.x).toBeCloseTo(mm_to_pt(148), 1)
        expect(back?.x).toBeCloseTo(0, 1)
        for (const box of [front, back]) {
            expect(box?.y).toBeCloseTo(0, 1)
            expect(box?.width).toBeCloseTo(mm_to_pt(148), 1)
            expect(box?.height).toBeCloseTo(mm_to_pt(210), 1)
        }
    })

    it('leaves the spine out, the faces sitting either side of it', async () => {
        const [front, back, ...rest] = await boxes(custom_dims(0, 10))
        expect(rest).toEqual([])
        expect(back?.x).toBeCloseTo(0, 1)
        expect(front?.x).toBeCloseTo(mm_to_pt(158), 1)
        expect(front?.width).toBeCloseTo(mm_to_pt(148), 1)
    })

    it('keeps the bleed on all four sides of each face', async () => {
        const [front, back] = await boxes(custom_dims(3, 10))
        // Each page reaches 3mm past its face on every side: the back starts at the sheet's own
        // outer edge, the front 3mm into the spine
        expect(back?.x).toBeCloseTo(0, 1)
        expect(front?.x).toBeCloseTo(mm_to_pt(3 + 148 + 10 - 3), 1)
        for (const box of [front, back]) {
            expect(box?.y).toBeCloseTo(0, 1)
            expect(box?.width).toBeCloseTo(mm_to_pt(148 + 6), 1)
            expect(box?.height).toBeCloseTo(mm_to_pt(210 + 6), 1)
        }
    })

    it('sets the crop box to match, so viewers and printers agree on each page', async () => {
        const dims = custom_dims(3, 10)
        const split = await PDFDocument.load(await split_pdf_pages(await wraparound(dims), dims))
        for (const page of split.getPages()) {
            expect(page.getCropBox()).toEqual(page.getMediaBox())
        }
    })
})
