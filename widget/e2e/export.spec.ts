// Saving and exporting from the preview toolbar: every tab's Save button and the PDF export
// produce real files of the right type (checked by their magic bytes), not just a click

import {test, expect} from '@playwright/test'
import type {Page} from '@playwright/test'
import {watch, open_widget, print_svg, wait_for_new_cover, download, starts_with, MAGIC} from './helpers'

/** Switch the preview pane to one of its tabs by label */
async function show_tab(page:Page, label:string):Promise<void> {
    await page.getByRole('button', {name: label, exact: true}).click()
}

/** The file names stored in a zip, read from its central directory */
function zip_names(zip:Buffer):string[] {
    const names:string[] = []
    // Central directory file headers start with PK\x01\x02; the name follows a 46-byte header
    for (let i = zip.indexOf('PK\x01\x02'); i !== -1; i = zip.indexOf('PK\x01\x02', i + 4)) {
        const length = zip.readUInt16LE(i + 28)
        names.push(zip.subarray(i + 46, i + 46 + length).toString('utf8'))
    }
    return names.sort()
}

test('Export PDF downloads a print-ready PDF', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const file = await download(page, page.getByRole('button', {name: 'Export PDF'}))
    expect(file.name).toBe('cover.pdf')
    expect(starts_with(file.bytes, MAGIC.pdf)).toBe(true)
    expect(file.bytes.length).toBeGreaterThan(20_000)
    // The last file stays downloadable from the toolbar
    await expect(page.getByRole('link', {name: 'Download last file'})).toHaveAttribute('download',
        'cover.pdf')
    expect(log.errors).toEqual([])
})

test('a PDF export renders a built-in photo from its original, not the preview copy', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    await page.getByRole('button', {name: 'Choose suggested background'}).first().click()
    await page.locator('[data-bg-builtin="beach.jpg"]').click()
    await page.getByRole('button', {name: 'Done', exact: true}).click()
    await wait_for_new_cover(page, before)
    const original = 'https://assets.paper.bible/backgrounds/beach.jpg'
    expect(log.urls).not.toContain(original)

    const file = await download(page, page.getByRole('button', {name: 'Export PDF'}))
    expect(starts_with(file.bytes, MAGIC.pdf)).toBe(true)
    expect(log.urls).toContain(original)
})

test('the Print tab saves the full print SVG', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Print')
    const file = await download(page, page.getByRole('button', {name: 'Save Image'}))
    expect(file.name).toBe('cover_print.svg')
    expect(file.bytes.toString('utf8')).toMatch(/^<svg\b/)
})

test('the Parts tab saves each face as an SVG in a zip', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Parts')
    const file = await download(page, page.getByRole('button', {name: 'Save Images'}))
    expect(file.name).toBe('cover_parts.zip')
    expect(starts_with(file.bytes, MAGIC.zip)).toBe(true)
    expect(zip_names(file.bytes)).toEqual(['back.svg', 'front.svg', 'spine.svg'])
})

test('the Parts tab exports each face as a PDF in a zip', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Parts')
    const file = await download(page, page.getByRole('button', {name: 'Export PDFs'}))
    expect(file.name).toBe('cover_parts.zip')
    expect(starts_with(file.bytes, MAGIC.zip)).toBe(true)
    expect(zip_names(file.bytes)).toEqual(['back.pdf', 'front.pdf', 'spine.pdf'])
})

test('the 3D tab saves a PNG of the book', async ({page}) => {
    await open_widget(page)
    const file = await download(page, page.getByRole('button', {name: 'Save 3D Image'}))
    expect(file.name).toBe('cover_3d.png')
    expect(starts_with(file.bytes, MAGIC.png)).toBe(true)
    expect(file.bytes.length).toBeGreaterThan(10_000)
})

test('the Mockup tab saves a PNG of the photo composite', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Mockup')
    await expect(page.locator('canvas#photo-canvas')).toBeVisible()
    const file = await download(page, page.getByRole('button', {name: 'Save Mockup'}))
    expect(file.name).toBe('cover_mockup.png')
    expect(starts_with(file.bytes, MAGIC.png)).toBe(true)
    expect(file.bytes.length).toBeGreaterThan(10_000)
})
