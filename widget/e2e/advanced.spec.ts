// The Advanced section: hidden until asked for, its spine/ISBN/margin options reach the cover,
// and Reset all blanks the form after confirmation

import {test, expect} from './fixtures'
import type {Page} from '@playwright/test'
import {open_widget, print_svg, wait_for_new_cover, field} from './helpers'

/** Reveal the Advanced section */
async function show_advanced(page:Page):Promise<void> {
    await page.getByRole('button', {name: 'Show advanced options'}).click()
    await expect(page.getByText('Spine title', {exact: true})).toBeVisible()
}

test('is collapsed until asked for, then shows the build version', async ({page}) => {
    await open_widget(page)
    await expect(page.getByText('Spine title', {exact: true})).toBeHidden()
    await expect(page.getByText(/^Version /)).toBeHidden()
    await show_advanced(page)
    await expect(page.getByText(/^Version [0-9a-f]{7,}(-dirty)?$/)).toBeVisible()
})

test('the spine title defaults to the cover title and can be overridden', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    const spine_title = field(page, 'Spine title').getByRole('textbox')
    // Placeholder shows the titles it falls back to
    await expect(spine_title).toHaveAttribute('placeholder', /Book Cover/)
    const before = await print_svg(page)
    await spine_title.fill('Spine Only')
    await wait_for_new_cover(page, before)
})

test('an ISBN adds a barcode to the back cover', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    const before = await print_svg(page)
    await field(page, 'ISBN for barcode').getByRole('textbox').fill('978-0-306-40615-7')
    const after = await wait_for_new_cover(page, before)
    // A barcode is dozens of bars — far more drawing than the cover had
    expect(after.length).toBeGreaterThan(before.length)
})

test('the home printing margin re-renders the cover', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    const before = await print_svg(page)
    await page.getByRole('checkbox', {name: 'Home printing margin'}).click()
    await wait_for_new_cover(page, before)
})

test('a margin slider re-renders the cover', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    const before = await print_svg(page)
    const slider = page.getByText('Page margins', {exact: true}).locator('..').getByRole('slider').first()
    await slider.focus()
    await slider.press('ArrowRight')
    await slider.press('ArrowRight')
    await wait_for_new_cover(page, before)
})

test('the icon-on-spine option appears only once an icon is chosen', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    const checkbox = page.getByRole('checkbox', {name: 'Show icon on spine'})
    await expect(checkbox).toBeHidden()
    await page.getByRole('button', {name: 'Choose an icon...'}).click()
    await page.getByRole('button', {name: 'game-icons:big-wave', exact: true}).click()
    await page.getByRole('button', {name: 'Done', exact: true}).click()
    await expect(checkbox).toBeVisible()
})

test('Reset all asks first, and Cancel keeps everything', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    await page.getByRole('button', {name: 'Reset all'}).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Reset to blank?')).toBeVisible()
    await dialog.getByRole('button', {name: 'Cancel'}).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByPlaceholder('Line 1…')).toHaveValue('The')
})

test('Reset all blanks the form and the cover', async ({page}) => {
    await open_widget(page)
    await show_advanced(page)
    const before = await print_svg(page)
    await page.getByRole('button', {name: 'Reset all'}).click()
    await page.getByRole('dialog').getByRole('button', {name: 'Reset', exact: true}).click()
    await expect(page.getByPlaceholder('Line 1…')).toHaveValue('')
    await expect(page.getByText('Author/Series', {exact: true}).locator('..').getByRole('textbox'))
        .toHaveValue('')
    const after = await wait_for_new_cover(page, before)
    // A blank white cover is a fraction of the demo's drawing
    expect(after.length).toBeLessThan(before.length / 2)
})
