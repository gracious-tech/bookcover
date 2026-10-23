// The Background section: colour, gradient, pattern, vector designs, built-in photos, uploads
// and the front-cover icon — each one reaching the rendered cover

import {test, expect} from '@playwright/test'
import type {Page} from '@playwright/test'
import {DEFAULT_DESIGN, watch, open_widget, print_svg, wait_for_new_cover, repo_file} from './helpers'

// A built-in photo, by its published filename (the ID — see services/backgrounds.ts)
const BUILTIN = 'beach.jpg'

/** Open the background picker dialog */
async function open_bg_picker(page:Page):Promise<void> {
    await page.getByRole('button', {name: 'Choose suggested background'}).first().click()
    await expect(page.getByRole('heading', {name: 'Choose a background'})).toBeVisible()
}

/** Close whichever sidebar picker dialog is open */
async function close_picker(page:Page):Promise<void> {
    await page.getByRole('button', {name: 'Done', exact: true}).click()
}

/** Upload an image through the sidebar's file input */
async function upload_image(page:Page, name:string, buffer:Buffer):Promise<void> {
    await page.locator('input[type="file"][accept^=".jpg"]').first()
        .setInputFiles({name, mimeType: 'image/jpeg', buffer})
}

test('a background colour swatch recolours the cover, and Auto restores it', async ({page}) => {
    await open_widget(page)
    const auto = await print_svg(page)
    await page.locator('[data-swatch="#1f2f50"]').click()
    const navy = await wait_for_new_cover(page, auto)

    await page.getByRole('button', {name: 'Auto', exact: true}).click()
    await wait_for_new_cover(page, navy)
    await expect(page.getByRole('button', {name: 'Auto', exact: true})).toBeDisabled()
})

test('the gradient checkbox changes the background', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    await page.getByRole('checkbox', {name: 'Make background color a gradient'}).click()
    await wait_for_new_cover(page, before)
})

test('patterns can be removed and chosen from the picker', async ({page}) => {
    await open_widget(page)
    let svg = await print_svg(page)
    // The demo cover has a pattern
    await page.getByRole('button', {name: 'Remove pattern'}).click()
    svg = await wait_for_new_cover(page, svg)

    await page.getByRole('button', {name: 'Choose a pattern'}).click()
    await page.getByRole('button', {name: 'Anchors Away', exact: true}).click()
    await close_picker(page)
    svg = await wait_for_new_cover(page, svg)
    await expect(page.getByRole('button', {name: 'Remove pattern'})).toBeVisible()

    // Its scale slider sits in the sidebar row once a pattern is chosen
    const slider = page.getByRole('button', {name: 'Remove pattern'}).locator('..').getByRole('slider')
    await slider.focus()
    await slider.press('ArrowRight')
    await wait_for_new_cover(page, svg)
})

test('picking another vector design loads just that design and renders it', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    await open_bg_picker(page)
    const other = page.locator(`[data-vector-id]:not([data-vector-id="${DEFAULT_DESIGN}"])`).first()
    const id = await other.getAttribute('data-vector-id') ?? ''
    await other.click()
    await close_picker(page)
    await wait_for_new_cover(page, before)
    expect(log.designs.has(id)).toBe(true)
    expect(log.errors).toEqual([])
})

test('a built-in photo renders from its preview copy, never the original', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    await open_bg_picker(page)
    await page.locator(`[data-bg-builtin="${BUILTIN}"]`).click()
    await close_picker(page)
    await wait_for_new_cover(page, before)

    expect(log.urls).toContain(`https://assets.paper.bible/backgrounds/previews_2700/${BUILTIN}`)
    expect(log.urls).not.toContain(`https://assets.paper.bible/backgrounds/${BUILTIN}`)
    await expect(page.getByRole('img', {name: 'Current background'})).toHaveAttribute('src',
        `https://assets.paper.bible/backgrounds/thumbnails/${BUILTIN}`)
})

test('a photo offers coverage positions, and removing it hides them', async ({page}) => {
    await open_widget(page)
    let svg = await print_svg(page)
    await open_bg_picker(page)
    await page.locator(`[data-bg-builtin="${BUILTIN}"]`).click()
    await close_picker(page)
    svg = await wait_for_new_cover(page, svg)

    const position = page.getByText('Background position', {exact: true}).locator('..')
    for (const label of ['Front', 'Feature', 'Painted']) {
        await position.getByRole('button', {name: label, exact: true}).click()
        svg = await wait_for_new_cover(page, svg)
    }

    await page.getByRole('button', {name: 'Remove image'}).click()
    await wait_for_new_cover(page, svg)
    await expect(page.getByText('Background position', {exact: true})).toBeHidden()
})

test('an uploaded photo becomes the background', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    await upload_image(page, 'my_photo.jpg', repo_file(`assets/backgrounds/${BUILTIN}`))
    await wait_for_new_cover(page, before)
    // The sidebar thumbnail shows the upload itself
    await expect(page.getByRole('img', {name: 'Current background'})).toHaveAttribute('src', /^blob:/)
    // A full-resolution photo raises no resolution warning
    await expect(page.getByText(/low resolution/i)).toHaveCount(0)
    expect(log.errors).toEqual([])
})

test('a tiny upload warns that it is too low resolution to print', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    // The picker's 160x120 thumbnail is far too small for a whole cover
    await upload_image(page, 'tiny.jpg', repo_file(`assets/backgrounds/thumbnails/${BUILTIN}`))
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Very low resolution image')).toBeVisible()
    await expect(dialog.getByText('160×120px')).toBeVisible()
    await dialog.getByRole('button', {name: 'Understood'}).click()
    await expect(dialog).toBeHidden()
    // The inline warning stays, and reopens the details
    await page.getByRole('button', {name: 'Very low resolution - should change'}).click()
    await expect(page.getByRole('dialog').getByText('Very low resolution image')).toBeVisible()
    await page.getByRole('button', {name: 'Understood'}).click()
    await wait_for_new_cover(page, before)
})

test('a front cover icon can be chosen, placed and removed', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    let svg = await print_svg(page)
    await page.getByRole('button', {name: 'Choose an icon...'}).click()
    await page.getByRole('button', {name: 'game-icons:big-wave', exact: true}).click()
    await close_picker(page)
    svg = await wait_for_new_cover(page, svg)
    await expect(page.getByRole('img', {name: 'game-icons:big-wave'})).toBeVisible()

    // Placement modes
    for (const mode of ['Offset', 'Echo', 'Center']) {
        await page.getByRole('button', {name: mode, exact: true}).click()
        svg = await wait_for_new_cover(page, svg)
    }

    await page.getByRole('button', {name: 'Remove icon'}).click()
    await wait_for_new_cover(page, svg)
    await expect(page.getByRole('button', {name: 'Echo', exact: true})).toBeHidden()
    // Curated icons come from the bundle, never the Iconify API
    expect(log.urls.filter(url => url.includes('api.iconify.design'))).toEqual([])
})

test('the spine colour picker recolours the spine', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    // The label wraps the transparent input Coloris binds to, which takes the click
    await page.getByText('Spine color', {exact: true}).locator('..').locator('input[data-coloris]').click()
    const value = page.getByRole('textbox', {name: 'Color value field'})
    await expect(value).toBeVisible()
    await value.fill('#aa1100')
    await value.press('Enter')
    await wait_for_new_cover(page, before)
    // The picker's trigger now paints the chosen colour
    await expect(page.getByText('Spine color', {exact: true}).locator('../..'))
        .toHaveCSS('background-color', 'rgb(170, 17, 0)')
})

// blurb_bg_color's 'auto' sentinel must never reach the picker as a "hsl(NaN…)" swatch
test('the colour picker offers only real colours as swatches', async ({page}) => {
    await open_widget(page)
    await page.getByText('Spine color', {exact: true}).locator('..').locator('input[data-coloris]').click()
    const swatches = page.locator('#clr-swatches button')
    await expect(swatches.first()).toBeVisible()
    expect(await swatches.allTextContents()).not.toContainEqual(expect.stringContaining('NaN'))
})
