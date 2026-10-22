
// Browser tests of the production widget build — see playwright.config.ts. These cover what the
// unit tests can't: the app actually generating a cover, and which chunks/requests a page load
// makes (lazy-loaded vector backgrounds, no Iconify API calls for curated icons).

import {readdirSync} from 'node:fs'
import {test, expect} from '@playwright/test'
import type {Page} from '@playwright/test'

// The design the widget's default form selects (bg_vector_id in make_form(), form_state.ts)
const DEFAULT_DESIGN = 'mountain-ridge-v2'

// Every vector background id, from its source SVG's filename
const DESIGN_IDS = new Set(readdirSync(new URL('../../generator/vector_bg_images/', import.meta.url))
    .filter(file => file.endsWith('.svg'))
    .map(file => file.slice(0, -'.svg'.length)))

// A built chunk is named after its module, plus an 8-character content hash
const CHUNK_RE = /\/assets\/(.+)-[A-Za-z0-9_-]{8}\.js$/

/** What a page load did: errors, failed requests, every URL requested, and the vector
 *  background designs whose chunks were fetched */
interface PageLog {
    errors:string[]
    urls:string[]
    designs:Set<string>
}

/** Start recording a page's errors and requests (the generator worker's included) */
function watch(page:Page):PageLog {
    const log:PageLog = {errors: [], urls: [], designs: new Set()}
    page.on('pageerror', error => log.errors.push(`page error: ${error.message}`))
    page.on('console', message => {
        if (message.type() === 'error') log.errors.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => log.errors.push(`request failed: ${request.url()}`))
    page.on('request', request => {
        log.urls.push(request.url())
        const chunk = CHUNK_RE.exec(new URL(request.url()).pathname)?.[1]
        if (chunk && DESIGN_IDS.has(chunk)) log.designs.add(chunk)
    })
    return log
}

/** Open the widget and wait for its first cover to finish generating */
async function open_widget(page:Page):Promise<void> {
    await page.goto('/')
    await expect(page.locator('[data-preview-state]')).toHaveAttribute('data-preview-state', 'ready')
}

test('generates the default cover with no errors or failed requests', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    expect(log.errors).toEqual([])
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
