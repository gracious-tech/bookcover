
// Shared helpers for the widget's Playwright specs — page logging, waiting on the preview pane's
// render state, reading the generated print SVG back out of the page, and downloads

import {readdirSync, readFileSync} from 'node:fs'
import {expect} from '@playwright/test'
import type {Page, Locator, Frame, FrameLocator} from '@playwright/test'

// Anything a widget locator can be scoped to: the page itself, or the widget inside a host iframe
export type Scope = Page | Frame | FrameLocator

// The design the widget's default form selects (bg_vector_id in make_form(), form_state.ts)
export const DEFAULT_DESIGN = 'mountain-ridge-v2'

// Every vector background id, from its source SVG's filename
export const DESIGN_IDS = new Set(readdirSync(repo_url('generator/vector_bg_images/'))
    .filter(file => file.endsWith('.svg'))
    .map(file => file.slice(0, -'.svg'.length)))

// A built chunk is named after its module, plus an 8-character content hash
const CHUNK_RE = /\/assets\/(.+)-[A-Za-z0-9_-]{8}\.js$/

// Leading bytes that identify each exported file type
export const MAGIC = {
    pdf: Buffer.from('%PDF-'),
    png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
}

/** A file:// URL for a path relative to the repo root */
export function repo_url(path:string):URL {
    return new URL(`../../${path}`, import.meta.url)
}

/** A file's bytes, by its path relative to the repo root */
export function repo_file(path:string):Buffer {
    return readFileSync(repo_url(path))
}

/** What a page load did: errors, failed requests, every URL requested, the vector background
 *  designs whose chunks were fetched, and every other built chunk that was fetched */
export interface PageLog {
    errors:string[]
    urls:string[]
    designs:Set<string>
    chunks:Set<string>
}

/** Start recording a page's errors and requests (the generator worker's included) */
export function watch(page:Page):PageLog {
    const log:PageLog = {errors: [], urls: [], designs: new Set(), chunks: new Set()}
    page.on('pageerror', error => log.errors.push(`page error: ${error.message}`))
    page.on('console', message => {
        if (message.type() === 'error') log.errors.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => {
        // A download's blob: URL "fails" once the browser hands it over to the download
        if (!request.url().startsWith('blob:'))
            log.errors.push(`request failed: ${request.url()}`)
    })
    page.on('request', request => {
        log.urls.push(request.url())
        const chunk = CHUNK_RE.exec(new URL(request.url()).pathname)?.[1]
        if (chunk && DESIGN_IDS.has(chunk)) log.designs.add(chunk)
        else if (chunk) log.chunks.add(chunk)
    })
    return log
}

/** The preview area, whose data-preview-state is idle/generating/ready/error */
export function preview_area(scope:Scope):Locator {
    return scope.locator('[data-preview-state]')
}

/** Wait until the preview pane has finished rendering a cover */
export async function wait_ready(scope:Scope):Promise<void> {
    await expect(preview_area(scope)).toHaveAttribute('data-preview-state', 'ready')
}

/** Open the widget and wait for its first cover to finish generating */
export async function open_widget(page:Page, path = '/'):Promise<void> {
    await page.goto(path)
    await wait_ready(page)
}

/** The full print SVG the preview last rendered, read back from the Print view's <img> (kept
 *  in the DOM whichever tab is showing), or '' before the first render */
export async function print_svg(scope:Scope):Promise<string> {
    const img = scope.locator('img[src^="data:image/svg+xml;base64,"][draggable="false"]')
    if (await img.count() === 0)
        return ''
    const src = await img.getAttribute('src') ?? ''
    return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64').toString('utf8')
}

/** Wait for the print SVG to differ from `before` and the preview to settle, returning the new
 *  SVG — the signal that a form change actually reached the rendered cover */
export async function wait_for_new_cover(scope:Scope, before:string):Promise<string> {
    await expect.poll(() => print_svg(scope), {message: 'cover never re-rendered'}).not.toBe(before)
    await wait_ready(scope)
    return print_svg(scope)
}

/** The root <svg>'s width and height attributes, in the units Typst writes (pt) */
export function svg_size(svg:string):{width:number, height:number} {
    const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
    const attr = (name:string) => Number.parseFloat(
        new RegExp(`\\s${name}="([\\d.]+)`).exec(root)?.[1] ?? 'NaN')
    return {width: attr('width'), height: attr('height')}
}

/** The sidebar field group headed by a label/caption with exactly this text */
export function field(scope:Scope, label:string):Locator {
    return scope.getByText(label, {exact: true}).locator('..')
}

/** Pick an option from a Nuxt UI USelect (a reka-ui combobox + listbox) */
export async function choose(scope:Scope, select:Locator, option:string):Promise<void> {
    await select.click()
    await scope.getByRole('option', {name: option, exact: true}).click()
}

/** Click something that triggers a download and return the file's name and bytes */
export async function download(page:Page, trigger:Locator):Promise<{name:string, bytes:Buffer}> {
    const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()])
    const stream = await file.createReadStream()
    const parts:Buffer[] = []
    for await (const part of stream)
        parts.push(part as Buffer)
    return {name: file.suggestedFilename(), bytes: Buffer.concat(parts)}
}

/** Whether a buffer starts with the given magic bytes */
export function starts_with(bytes:Buffer, magic:Buffer):boolean {
    return bytes.subarray(0, magic.length).equals(magic)
}
