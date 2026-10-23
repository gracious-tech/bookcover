// Fonts: the per-field font chooser fetches the chosen family and re-renders the cover, and a
// user-uploaded font joins the chooser and the cover

import {existsSync} from 'node:fs'
import {test, expect} from '@playwright/test'
import type {Page, Locator} from '@playwright/test'
import {watch, open_widget, print_svg, wait_for_new_cover, repo_url, repo_file} from './helpers'

// A font file from the gitignored fonts tree (.bin/download_fonts), used as an upload fixture
const UPLOAD_FONT = 'assets/fonts/Special Elite/SpecialElite-Regular.ttf'

/** The custom font upload modal (it has a heading but no accessible name) */
function upload_modal(page:Page):Locator {
    return page.getByRole('dialog').filter({hasText: 'Upload custom fonts'})
}

/** Open line 1's style popover and return its font chooser's trigger button */
async function open_title_font_chooser(page:Page):Promise<Locator> {
    await page.getByRole('button', {name: 'Line 1 style'}).click()
    const popover = page.getByRole('dialog')
    const trigger = popover.getByText('Font', {exact: true}).locator('..').getByRole('button').first()
    await expect(trigger).toBeVisible()
    return trigger
}

test('choosing a font fetches that family and re-renders the cover', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    const trigger = await open_title_font_chooser(page)
    await trigger.click()
    // Each option previews the field's own text above the family name
    await page.getByRole('button').filter({hasText: /Lora$/}).first().click()
    await expect(trigger).toHaveText(/Lora/)
    await wait_for_new_cover(page, before)
    expect(log.urls.some(url => url.startsWith('https://assets.paper.bible/fonts/Lora/'))).toBe(true)
    expect(log.errors).toEqual([])
})

test('the chooser lists the curated groups and an Auto default', async ({page}) => {
    await open_widget(page)
    const trigger = await open_title_font_chooser(page)
    await expect(trigger).toHaveText(/Auto/)
    await trigger.click()
    for (const group of ['Styles', 'Commonly used inside books', 'Compatible with most languages'])
        await expect(page.getByText(group, {exact: true})).toBeVisible()
})

test('an uploaded font is selected, listed under Uploaded and rendered', async ({page}) => {
    test.skip(!existsSync(repo_url(UPLOAD_FONT)), 'needs the fonts tree — run .bin/download_fonts')
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    await open_title_font_chooser(page)
    await page.getByRole('button', {name: 'More', exact: true}).click()
    const modal = upload_modal(page)
    await expect(modal).toBeVisible()
    await modal.locator('input[type="file"]').setInputFiles({
        name: 'SpecialElite-Regular.ttf',
        mimeType: 'font/ttf',
        buffer: repo_file(UPLOAD_FONT),
    })
    // A successful upload closes the modal and picks the new family
    await expect(modal).toBeHidden()
    await wait_for_new_cover(page, before)
    // The style popover may still be open behind where the modal was — close it to start clean
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const trigger = await open_title_font_chooser(page)
    await expect(trigger).toHaveText(/Special Elite/)

    await trigger.click()
    await expect(page.getByText('Uploaded', {exact: true})).toBeVisible()
    expect(log.errors).toEqual([])
})

test('a file that is not a font is rejected with a message', async ({page}) => {
    await open_widget(page)
    await open_title_font_chooser(page)
    await page.getByRole('button', {name: 'More', exact: true}).click()
    const modal = upload_modal(page)
    await modal.locator('input[type="file"]').setInputFiles({
        name: 'not_a_font.ttf',
        mimeType: 'font/ttf',
        buffer: Buffer.from('definitely not an sfnt file'),
    })
    await expect(modal.getByText('No new font families found in the uploaded files')).toBeVisible()
    await expect(modal).toBeVisible()
})
