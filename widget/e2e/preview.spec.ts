// The preview pane's tabs (3D / Mockup / Parts / Print), each rendering the generated cover, plus
// the toolbar's dark-mode toggle and the mobile layout's panel switcher

import {test, expect} from '@playwright/test'
import type {Page, Locator} from '@playwright/test'
import {watch, open_widget, wait_ready} from './helpers'

/** Switch the preview pane to one of its tabs by label */
async function show_tab(page:Page, label:string):Promise<void> {
    await page.getByRole('button', {name: label, exact: true}).click()
}

/** Wait until an <img> has decoded to a non-empty picture, returning its natural size */
async function decoded_size(img:Locator):Promise<{width:number, height:number}> {
    await expect.poll(() => img.evaluate((el:HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    return img.evaluate((el:HTMLImageElement) => ({width: el.naturalWidth, height: el.naturalHeight}))
}

/** How many distinct colours a 2D canvas holds, sampled on a coarse grid — a blank canvas has 1 */
async function canvas_colours(canvas:Locator):Promise<number> {
    return canvas.evaluate((el:HTMLCanvasElement) => {
        const ctx = el.getContext('2d')
        if (!ctx || !el.width || !el.height)
            return 0
        const data = ctx.getImageData(0, 0, el.width, el.height).data
        const colours = new Set<number>()
        const step_x = Math.max(1, Math.floor(el.width / 40))
        const step_y = Math.max(1, Math.floor(el.height / 40))
        for (let y = 0; y < el.height; y += step_y) {
            for (let x = 0; x < el.width; x += step_x) {
                const i = (y * el.width + x) * 4
                colours.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!)
            }
        }
        return colours.size
    })
}

test('opens on the 3D view with a sized WebGL canvas', async ({page}) => {
    await open_widget(page)
    const canvas = page.locator('canvas#preview-canvas')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box?.width).toBeGreaterThan(100)
    expect(box?.height).toBeGreaterThan(100)
})

test('the Mockup tab composites the book onto a background photo', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    await show_tab(page, 'Mockup')
    const canvas = page.locator('canvas#photo-canvas')
    await expect(canvas).toBeVisible()
    // A real photo composite has a wide spread of colours, not a blank fill
    await expect.poll(() => canvas_colours(canvas)).toBeGreaterThan(50)

    // Picking another photo from the strip re-composites onto that photo
    const before = await canvas.evaluate((el:HTMLCanvasElement) => el.toDataURL())
    const strip = page.locator('img[src*="/3d/backgrounds/"]')
    expect(await strip.count()).toBeGreaterThan(1)
    await strip.nth(1).click()
    await expect.poll(() => canvas.evaluate((el:HTMLCanvasElement) => el.toDataURL())).not.toBe(before)
    expect(log.errors).toEqual([])
})

test('the Parts tab shows the front, spine and back as separate images', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Parts')
    const front = await decoded_size(page.getByRole('img', {name: 'front'}))
    const spine = await decoded_size(page.getByRole('img', {name: 'spine'}))
    const back = await decoded_size(page.getByRole('img', {name: 'back'}))
    // Front and back are the same trim size; the spine is far narrower but just as tall
    expect(front).toEqual(back)
    expect(spine.width).toBeLessThan(front.width / 4)
    expect(spine.height).toBe(front.height)
})

test('the Print tab shows the full spread with a trim line overlay', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Print')
    const full = page.getByRole('img', {name: 'Full cover'})
    await expect(full).toBeVisible()
    const size = await decoded_size(full)
    // A spread is wider than it is tall
    expect(size.width).toBeGreaterThan(size.height)
    await expect(full.locator('xpath=following-sibling::div[contains(@class, "border-dashed")]'))
        .toBeVisible()
})

test('switching tabs back and forth keeps the preview ready', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    for (const label of ['Print', 'Parts', 'Mockup', '3D', 'Print'])
        await show_tab(page, label)
    await wait_ready(page)
    expect(log.errors).toEqual([])
})

test('the toolbar toggles dark mode', async ({page}) => {
    await open_widget(page)
    const html = page.locator('html')
    const was_dark = await html.evaluate(el => el.classList.contains('dark'))
    const toggle = page.getByRole('button', {name: was_dark ? 'Switch to light mode' : 'Switch to dark mode'})
    await toggle.click()
    await expect.poll(() => html.evaluate(el => el.classList.contains('dark'))).toBe(!was_dark)
})

test('the zoom popover changes the Print view zoom', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Print')
    await page.getByRole('button', {name: 'Zoom: 100%'}).click()
    // The popover's own slider (the sidebar has others) is vertical, so ArrowUp zooms in
    const slider = page.getByRole('dialog').getByRole('slider')
    await slider.focus()
    await slider.press('ArrowUp')
    await expect(page.getByRole('button', {name: /^Zoom: (?!100%)\d+%$/})).toBeVisible()
    // The 1× button resets it
    await page.getByRole('button', {name: '1×'}).click()
    await expect(page.getByRole('button', {name: 'Zoom: 100%'})).toBeVisible()
})

test.describe('on a phone-sized screen', () => {
    test.use({viewport: {width: 420, height: 860}})

    test('the floating button swaps between the form and the preview', async ({page}) => {
        await open_widget(page)
        const title = page.getByPlaceholder('Line 1…')
        await expect(title).toBeVisible()
        await page.getByRole('button', {name: 'Show preview'}).click()
        await expect(title).toBeHidden()
        await expect(page.locator('[data-preview-state]')).toBeVisible()
        await page.getByRole('button', {name: 'Show form'}).click()
        await expect(title).toBeVisible()
    })
})
