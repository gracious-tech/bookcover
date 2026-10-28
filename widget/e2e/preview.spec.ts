// The preview pane's tabs (3D / Mockup / Parts / Print), each rendering the generated cover and
// zoomed/rotated/panned by mouse, wheel and touch, plus the toolbar's dark-mode toggle and the
// mobile layout's panel switcher

import {test, expect} from '@playwright/test'
import type {Page, Locator} from '@playwright/test'
import {watch, open_widget, wait_ready, canvas_colours} from './helpers'

/** Switch the preview pane to one of its tabs by label */
async function show_tab(page:Page, label:string):Promise<void> {
    await page.getByRole('button', {name: label, exact: true}).click()
}

/** Wait until an <img> has decoded to a non-empty picture, returning its natural size */
async function decoded_size(img:Locator):Promise<{width:number, height:number}> {
    await expect.poll(() => img.evaluate((el:HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    return img.evaluate((el:HTMLImageElement) => ({width: el.naturalWidth, height: el.naturalHeight}))
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

test('dragging the 3D view rotates the book', async ({page}) => {
    await open_widget(page)
    const canvas = page.locator('canvas#preview-canvas')
    const before = await canvas_pixels(canvas)
    await drag(page, canvas, 150, 40)
    await expect.poll(() => canvas_pixels(canvas)).not.toBe(before)

    // Moving the mouse once the button is up no longer rotates it
    const rotated = await canvas_pixels(canvas)
    const box = await canvas.boundingBox()
    await page.mouse.move(box!.x + 10, box!.y + 10, {steps: 5})
    await page.waitForTimeout(100)
    expect(await canvas_pixels(canvas)).toBe(rotated)
})

test('scrolling over the 3D view zooms it, within limits', async ({page}) => {
    await open_widget(page)
    const canvas = page.locator('canvas#preview-canvas')
    const before = await canvas_pixels(canvas)
    await scroll_over(page, canvas, -200)
    // The camera moves 0.2 closer, i.e. 1 / 0.8
    await expect(page.getByRole('button', {name: 'Zoom: 125%'})).toBeVisible()
    await expect.poll(() => canvas_pixels(canvas)).not.toBe(before)

    // Scrolling far out stops at the camera's furthest distance (2×, so 50%)
    await scroll_over(page, canvas, 5000)
    await expect(page.getByRole('button', {name: 'Zoom: 50%'})).toBeVisible()
})

test('ctrl+scroll zooms the Parts view, and Print follows it', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Parts')
    const front = page.getByRole('img', {name: 'front'})
    await expect(front).toBeVisible()
    // A plain scroll scrolls rather than zooming
    await scroll_over(page, front, -100)
    await expect(page.getByRole('button', {name: 'Zoom: 100%'})).toBeVisible()
    await scroll_over(page, front, -300, ['Control'])
    await expect(page.getByRole('button', {name: 'Zoom: 130%'})).toBeVisible()

    // The two print-size views share one zoom level
    await show_tab(page, 'Print')
    await expect(page.getByRole('button', {name: 'Zoom: 130%'})).toBeVisible()
})

test('the Print view zooms with ctrl+scroll and pans by dragging', async ({page}) => {
    await open_widget(page)
    await show_tab(page, 'Print')
    const full = page.getByRole('img', {name: 'Full cover'})
    await expect(full).toBeVisible()
    // Zooming in past the maximum stops there
    await scroll_over(page, full, -5000, ['Control'])
    await expect(page.getByRole('button', {name: 'Zoom: 200%'})).toBeVisible()

    // At 200% the spread overflows its pane, so a drag scrolls it the other way
    const pane = full.locator('xpath=ancestor::div[contains(@class, "overflow-auto")][1]')
    const scroll = () => pane.evaluate(el => ({left: el.scrollLeft, top: el.scrollTop}))
    const start = await scroll()
    await drag(page, pane, -200, -100)
    await expect.poll(scroll).toEqual({left: start.left + 200, top: start.top + 100})
})

test.describe('on a phone-sized screen', () => {
    test.use({viewport: {width: 420, height: 860}, hasTouch: true})

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

    test('a one-finger drag rotates the 3D book, and two fingers leave it alone', async ({page}) => {
        await open_widget(page)
        await page.getByRole('button', {name: 'Show preview'}).click()
        const canvas = page.locator('canvas#preview-canvas')
        await expect(canvas).toBeVisible()
        const before = await canvas_pixels(canvas)

        // A pinch (two touches) isn't a rotation
        await touch_drag(canvas, 2)
        await page.waitForTimeout(100)
        expect(await canvas_pixels(canvas)).toBe(before)

        await touch_drag(canvas, 1)
        await expect.poll(() => canvas_pixels(canvas)).not.toBe(before)
    })
})

/** A canvas's current picture, as a data URL to compare against later */
async function canvas_pixels(canvas:Locator):Promise<string> {
    return canvas.evaluate((el:HTMLCanvasElement) => el.toDataURL())
}

/** Press the mouse at an element's centre, move it by (dx, dy) and release */
async function drag(page:Page, target:Locator, dx:number, dy:number):Promise<void> {
    const box = await target.boundingBox()
    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, {steps: 10})
    await page.mouse.up()
}

/** Scroll the wheel over an element's centre, holding any modifier keys */
async function scroll_over(page:Page, target:Locator, delta_y:number, modifiers:string[] = [])
        :Promise<void> {
    const box = await target.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    for (const key of modifiers)
        await page.keyboard.down(key)
    await page.mouse.wheel(0, delta_y)
    for (const key of modifiers)
        await page.keyboard.up(key)
}

/** Drag across an element with this many fingers, as legacy touch events */
async function touch_drag(target:Locator, fingers:number):Promise<void> {
    const box = await target.boundingBox()
    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2
    const at = (dx:number) => Array.from({length: fingers},
        (_, i) => ({identifier: i, clientX: x + dx + i * 30, clientY: y}))
    await target.dispatchEvent('touchstart', {touches: at(0), changedTouches: at(0)})
    for (const dx of [30, 60, 90, 120])
        await target.dispatchEvent('touchmove', {touches: at(dx), changedTouches: at(dx)})
    await target.dispatchEvent('touchend', {touches: [], changedTouches: at(120)})
}
