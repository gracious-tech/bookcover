// The Background section: colour, gradient, pattern, vector designs, built-in photos, uploads
// and the front-cover icon — each one reaching the rendered cover

import {test, expect} from './fixtures'
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

test('a custom Iconify id is checked as typed, and a real one reaches the cover', async ({page}) => {
    // Stand in for the Iconify API, which only a typed-in (non-curated) id ever reaches
    const asked:string[] = []
    await page.context().route('https://api.iconify.design/**', route => {
        const path = new URL(route.request().url()).pathname
        asked.push(path)
        if (path !== '/mdi/home.svg')
            return route.fulfill({status: 404})
        return route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"'
            + ' viewBox="0 0 24 24"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3L2 12h3v8z"/></svg>'})
    })
    await open_widget(page)
    const svg = await print_svg(page)
    await page.getByRole('button', {name: 'Choose an icon...'}).click()
    const input = page.getByPlaceholder('Enter Iconify id...')
    const status = input.locator('..').locator('[data-icon-status]')

    // An id needs a collection prefix; built-in and curated ids are checked without the network
    for (const [id, expected] of [['nocolon', 'invalid'], ['builtin:nonesuch', 'invalid'],
        ['builtin:cross', 'valid'], ['game-icons:big-wave', 'valid'], ['mdi:no-such-icon', 'invalid'],
        ['mdi:home', 'valid']] as const) {
        await input.fill(id)
        await expect(status, id).toHaveAttribute('data-icon-status', expected)
    }
    expect(asked).toContain('/mdi/no-such-icon.svg')
    await close_picker(page)
    await wait_for_new_cover(page, svg)
    await expect(page.getByRole('img', {name: 'mdi:home'})).toBeVisible()

    // Clearing the field removes the icon
    await page.getByRole('button', {name: 'Choose an icon...'}).click()
    await input.fill('')
    await expect(status).toHaveCount(0)
    await close_picker(page)
    await expect(page.getByRole('button', {name: 'Remove icon'})).toBeHidden()
})

test('pasting an image makes it the background, but not while typing in a field', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    const photo = repo_file(`assets/backgrounds/${BUILTIN}`).toString('base64')

    // A paste aimed at a text field is the field's business
    const title = page.getByPlaceholder('Line 1…')
    await title.focus()
    await paste_image(page, photo)
    await expect(page.getByRole('img', {name: 'Current background'})).toHaveCount(0)

    await title.blur()
    await paste_image(page, photo)
    await wait_for_new_cover(page, before)
    await expect(page.getByRole('img', {name: 'Current background'})).toHaveAttribute('src', /^blob:/)
})

test('the Paste button adopts an image on the clipboard, and ignores text', async ({page, context}) => {
    const log = watch(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open_widget(page)
    const before = await print_svg(page)
    const paste = page.getByRole('button', {name: 'Paste', exact: true}).first()

    // Text on the clipboard isn't a background
    await page.evaluate(() => navigator.clipboard.writeText('just some words'))
    await paste.click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('img', {name: 'Current background'})).toHaveCount(0)

    // A picture big enough to print, so no resolution warning gets in the way
    await page.evaluate(async () => {
        const canvas = new OffscreenCanvas(4000, 3000)
        const ctx = canvas.getContext('2d')!
        const gradient = ctx.createLinearGradient(0, 0, 4000, 3000)
        gradient.addColorStop(0, '#225588')
        gradient.addColorStop(1, '#ddaa33')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, 4000, 3000)
        const blob = await canvas.convertToBlob({type: 'image/png'})
        await navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
    })
    await paste.click()
    await wait_for_new_cover(page, before)
    await expect(page.getByRole('img', {name: 'Current background'})).toHaveAttribute('src', /^blob:/)
    expect(log.errors).toEqual([])
})

test('a picker closes on Escape and on a click outside it', async ({page}) => {
    await open_widget(page)
    const heading = page.getByRole('heading', {name: 'Choose an icon'})
    const open = () => page.getByRole('button', {name: 'Choose an icon...'}).click()

    await open()
    await expect(heading).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(heading).toBeHidden()

    // Outside the sidebar altogether, e.g. on the preview
    await open()
    await page.locator('[data-preview-state]').click()
    await expect(heading).toBeHidden()

    // On the blurred sidebar around the dialog
    await open()
    const sidebar = await page.locator('.sidebar-panel').boundingBox()
    await page.mouse.click(sidebar!.x + 8, sidebar!.y + 8)
    await expect(heading).toBeHidden()
})

test('the background colour can be set from inside the picker without closing it', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    await open_bg_picker(page)
    const heading = page.getByRole('heading', {name: 'Choose a background'})
    const panel = heading.locator('../../..')
    await panel.locator('input[data-coloris]').click()
    await pick_colour(page, '#aa1100')
    // Coloris's popup sits outside the dialog, so using it mustn't count as a click outside
    await expect(heading).toBeVisible()
    await wait_for_new_cover(page, before)

    await close_picker(page)
    await expect(page.getByText('Background color', {exact: true}).locator('..')
        .locator('label:has(input[data-coloris])')).toHaveCSS('background-color', 'rgb(170, 17, 0)')
})

test('the pattern colour swatch recolours the pattern, and clearing it restores it', async ({page}) => {
    await open_widget(page)
    const auto = await print_svg(page)
    const row = page.getByRole('button', {name: 'Remove pattern'}).locator('..')
    await row.locator('input[data-coloris]').click()
    await pick_colour(page, '#00aa44')
    const green = await wait_for_new_cover(page, auto)
    await expect(row.locator('label[title="#00aa44"]')).toBeVisible()

    await row.getByRole('button', {name: 'Clear color'}).click()
    await wait_for_new_cover(page, green)
    await expect(row.locator('label[title="Set color"]')).toBeVisible()
})

/** Type a colour into the open Coloris picker and confirm it */
async function pick_colour(page:Page, hex:string):Promise<void> {
    const value = page.getByRole('textbox', {name: 'Color value field'})
    await expect(value).toBeVisible()
    await value.fill(hex)
    await value.press('Enter')
}

/** Dispatch a paste of a JPEG (base64) at whatever has focus, as pasting from the OS would */
async function paste_image(page:Page, base64:string):Promise<void> {
    await page.evaluate(data => {
        const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
        const clipboard = new DataTransfer()
        clipboard.items.add(new File([bytes], 'clipboard.jpg', {type: 'image/jpeg'}))
        const target = document.activeElement ?? document.body
        target.dispatchEvent(new ClipboardEvent('paste', {clipboardData: clipboard, bubbles: true}))
    }, base64)
}

// blurb_bg_color's 'auto' sentinel must never reach the picker as a "hsl(NaN…)" swatch
test('the colour picker offers only real colours as swatches', async ({page}) => {
    await open_widget(page)
    await page.getByText('Spine color', {exact: true}).locator('..').locator('input[data-coloris]').click()
    const swatches = page.locator('#clr-swatches button')
    await expect(swatches.first()).toBeVisible()
    expect(await swatches.allTextContents()).not.toContainEqual(expect.stringContaining('NaN'))
})
