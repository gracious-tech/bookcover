// Page-load behaviour of the production build: the app generating its demo cover, which
// chunks/requests a load makes (lazy-loaded vector backgrounds, no Iconify API calls for curated
// icons), and what it shows when the assets it starts from can't be loaded

import {test, expect} from '@playwright/test'
import {DEFAULT_DESIGN, watch, open_widget, print_svg, preview_area} from './helpers'

test('generates the default cover with no errors or failed requests', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    expect(log.errors).toEqual([])
    // The demo cover really rendered: a non-trivial print SVG is in the page
    expect((await print_svg(page)).length).toBeGreaterThan(10_000)
})

test('downloads only the selected vector background design on load', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    expect([...log.designs]).toEqual([DEFAULT_DESIGN])
})

test('never asks the Iconify API for a curated icon', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    expect(log.urls.filter(url => url.includes('api.iconify.design'))).toEqual([])
})

test('fetches the typst wasm and fonts from the assets bucket', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    expect(log.urls.some(url => /^https:\/\/assets\.paper\.bible\/typst\/[^/]+\/.+\.wasm$/.test(url)))
        .toBe(true)
    expect(log.urls).toContain('https://assets.paper.bible/fonts/manifest.json')
})

test('a fonts server that fails says so instead of a cover', async ({page}) => {
    // The worker fetches the manifest too, so route the whole context
    await page.context().route('https://assets.paper.bible/fonts/manifest.json',
        route => route.fulfill({status: 500}))
    await page.goto('/')
    await expect(preview_area(page)).toHaveAttribute('data-preview-state', 'error')
    await expect(page.getByText('The fonts server is not working')).toBeVisible()
    await expect(page.getByText('https://assets.paper.bible/fonts/manifest.json')).toBeVisible()
})

test('a typst wasm that fails to load says so instead of a cover', async ({page}) => {
    await page.context().route(/^https:\/\/assets\.paper\.bible\/typst\/.+\.wasm$/,
        route => route.fulfill({status: 404}))
    await page.goto('/')
    await expect(preview_area(page)).toHaveAttribute('data-preview-state', 'error')
    await expect(page.getByText('Typst wasm failed to load.')).toBeVisible()
})

test('shows a thumbnail for every vector background in the picker', async ({page}) => {
    await open_widget(page)
    await page.getByRole('button', {name: 'Choose suggested background'}).first().click()
    // Only the picker grid's buttons carry data-vector-id
    const thumbnails = page.locator('[data-vector-id]')
    await expect(thumbnails.first()).toBeVisible()
    // Each design's SVG loads lazily, so wait for every thumbnail to fill in
    for (const thumbnail of await thumbnails.all()) {
        const id = await thumbnail.getAttribute('data-vector-id')
        await expect(thumbnail, id ?? '').toHaveCSS('background-image', /^url\("data:image\/svg\+xml,/)
    }
})
