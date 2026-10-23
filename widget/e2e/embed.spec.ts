// The postMessage embed protocol end to end: a host page on another origin iframes the widget,
// answers its 'ready' with an InitMessage, and receives its data/finished/cancelled/error and
// background-suggestion messages (see embed.ts, and embed_types.ts in generator-web)

import {existsSync} from 'node:fs'
import {test, expect} from '@playwright/test'
import type {Page, FrameLocator} from '@playwright/test'
import {watch, wait_ready, print_svg, wait_for_new_cover, repo_url, repo_file} from './helpers'
import fr from '../src/locales/fr'

// The fake host's origin, served entirely by page.route()
const HOST = 'http://host.test'

// Where Playwright's webServer serves the widget (playwright.config.ts)
const WIDGET = 'http://localhost:5399'

// A font file from the gitignored fonts tree, for seeding custom fonts
const SEED_FONT = 'assets/fonts/Special Elite/SpecialElite-Regular.ttf'

/** How the fake host behaves. `init` is the InitMessage minus its binaries; the binaries are
 *  named here instead and built as real Files/Uint8Arrays in the host page */
interface HostConfig {
    init:Record<string, unknown>
    // Fixture path (under the host origin) to send as InitMessage.bg_image
    bg_image?:string
    // Seed InitMessage.custom_fonts with one family made from the host's /font.ttf
    seed_font?:{family:string, style:'serif' | 'sans'}
    // How to answer 'bg_suggestion_selected': with /fixture.jpg, with null, or not at all
    resolve?:'file' | 'null' | 'never'
    // Answer 'ready' only after this long, as a busy host page or slow device would
    init_delay_ms?:number
}

/** A message as the host recorded it — Files and byte arrays reduced to comparable summaries */
interface Received {
    origin:string
    msg:{type:string, [key:string]:unknown}
}

/** The host page: builds its InitMessage (Files included) BEFORE creating the iframe, so the init
 *  can be answered at once (or after `init_delay_ms`, to test an init that misses the widget's
 *  300ms no-init fallback) */
function host_html(config:HostConfig):string {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Host</title>
<style>body{margin:0} iframe{border:0;width:100vw;height:100vh;display:block}</style></head>
<body><script type="module">
const WIDGET = ${JSON.stringify(WIDGET)}
const CONFIG = ${JSON.stringify(config)}
window.received = []

// Fetch a fixture from this host as a File
async function fixture(name, type) {
    const response = await fetch('/' + name)
    return new File([await response.blob()], name, {type})
}

// Reduce Files and byte arrays to summaries the test can compare
function summarise(value) {
    if (value instanceof File) return {file: value.name, size: value.size, type: value.type}
    if (value instanceof Uint8Array) return {bytes: value.length}
    if (Array.isArray(value)) return value.map(summarise)
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, summarise(v)]))
    return value
}

const init = {type: 'init', ...CONFIG.init}
if (CONFIG.bg_image) init.bg_image = await fixture(CONFIG.bg_image, 'image/jpeg')
if (CONFIG.seed_font) {
    const bytes = new Uint8Array(await (await fetch('/font.ttf')).arrayBuffer())
    init.custom_fonts = [{...CONFIG.seed_font, files: [bytes]}]
}

const frame = document.createElement('iframe')
frame.id = 'widget'
window.post = msg => frame.contentWindow.postMessage(msg, WIDGET)

window.addEventListener('message', async event => {
    if (event.source !== frame.contentWindow) return
    const msg = event.data
    window.received.push({origin: event.origin, msg: summarise(msg)})
    if (msg.type === 'ready' && CONFIG.init_delay_ms)
        setTimeout(() => window.post(init), CONFIG.init_delay_ms)
    else if (msg.type === 'ready')
        window.post(init)
    if (msg.type === 'bg_suggestion_selected' && CONFIG.resolve === 'file')
        window.post({type: 'bg_suggestion_resolved', id: msg.id,
            bg_image: await fixture('fixture.jpg', 'image/jpeg')})
    if (msg.type === 'bg_suggestion_selected' && CONFIG.resolve === 'null')
        window.post({type: 'bg_suggestion_resolved', id: msg.id, bg_image: null})
})

frame.src = WIDGET + '/'
document.body.append(frame)
</script></body></html>`
}

/** Serve the fake host and its fixtures, open it, and wait for the embedded cover to render */
async function open_host(page:Page, config:HostConfig):Promise<FrameLocator> {
    await page.route(`${HOST}/**`, async route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/')
            return route.fulfill({contentType: 'text/html', body: host_html(config)})
        if (path === '/fixture.jpg')
            return route.fulfill({contentType: 'image/jpeg', body: repo_file('assets/backgrounds/beach.jpg')})
        if (path === '/thumb.jpg')
            return route.fulfill({contentType: 'image/jpeg',
                body: repo_file('assets/backgrounds/thumbnails/beach.jpg')})
        if (path === '/font.ttf')
            return route.fulfill({contentType: 'font/ttf', body: repo_file(SEED_FONT)})
        return route.fulfill({status: 404})
    })
    await page.goto(`${HOST}/`)
    const frame = page.frameLocator('#widget')
    await wait_ready(frame)
    return frame
}

/** Everything the host has received so far, optionally only of one type */
async function received(page:Page, type?:string):Promise<Received[]> {
    const all = await page.evaluate(() => (window as unknown as {received:Received[]}).received)
    return type ? all.filter(r => r.msg.type === type) : all
}

/** Wait for the host to have received a message of a type, returning the latest one */
async function next_message(page:Page, type:string, after = 0):Promise<Received['msg']> {
    await expect.poll(async () => (await received(page, type)).length,
        {message: `host never received '${type}'`}).toBeGreaterThan(after)
    return (await received(page, type)).at(-1)!.msg
}

// Wide enough that the embedded widget uses its desktop layout. Chrome's Local Network Access
// checks would block a "public" page (which a route-fulfilled one counts as) from framing
// localhost; real hosts and the widget are both public, so they never meet this
test.use({
    viewport: {width: 1400, height: 900},
    launchOptions: {args: ['--disable-features=LocalNetworkAccessChecks']},
})

test('a seeded form replaces the demo and the init config takes effect', async ({page}) => {
    const log = watch(page)
    const frame = await open_host(page, {init: {
        preset: {title1: 'Embedded Title', author: 'Host Author'},
        locale: 'fr-CA',
        hide_size_section: true,
        finished_mode: true,
    }})
    // 'ready' went out first, to any origin
    const first = (await received(page))[0]!
    expect(first).toEqual({origin: WIDGET, msg: {type: 'ready'}})

    // The preset, on a blank base: fields it didn't set are empty rather than the demo's
    await expect(frame.getByPlaceholder(fr.content.title_placeholder.replace('{n}', '1')))
        .toHaveValue('Embedded Title')
    await expect(frame.getByText(fr.content.author_label, {exact: true}).locator('..').getByRole('textbox'))
        .toHaveValue('Host Author')
    await expect(frame.getByText(fr.content.subtitle_label, {exact: true}).locator('..').getByRole('textbox'))
        .toHaveValue('')

    // locale: matched like a browser preference (fr-CA -> fr)
    await expect(frame.getByText(fr.sidebar.section_background, {exact: true})).toBeVisible()
    // hide_size_section
    await expect(frame.getByText(fr.sidebar.section_book_size, {exact: true})).toBeHidden()
    // finished_mode swaps Export PDF for Finished
    await expect(frame.getByRole('button', {name: fr.preview.finished_button})).toBeVisible()
    await expect(frame.getByRole('button', {name: fr.preview.export_pdf})).toBeHidden()
    expect(log.errors).toEqual([])
})

test('edits stream to the host as data messages', async ({page}) => {
    const frame = await open_host(page, {init: {preset: {title1: 'Start'}}})
    const before = (await received(page, 'data')).length
    await frame.getByPlaceholder('Line 1…').fill('Edited In Widget')
    await expect.poll(async () => (await received(page, 'data')).map(r =>
        (r.msg['data'] as {title1:string}).title1)).toContain('Edited In Widget')
    const data = (await received(page, 'data')).at(-1)!
    expect(data.origin).toBe(WIDGET)
    // No background either way, and the record is complete JSON (no binaries inside)
    expect(data.msg['bg_image']).toBeNull()
    expect(data.msg['bg_image_builtin']).toBeNull()
    expect(data.msg['data']).toMatchObject({title1: 'Edited In Widget', service_id: 'lulu'})
    expect(JSON.stringify(data.msg['data'])).not.toContain('"file"')
    expect((await received(page, 'data')).length).toBeGreaterThan(before)
})

test('a built-in background round-trips by ID, never as bytes', async ({page}) => {
    const log = watch(page)
    const frame = await open_host(page, {init: {
        preset: {title1: 'Beach Book'},
        bg_image_builtin: 'beach.jpg',
        finished_mode: true,
    }})
    // The widget renders it from the preview copy, and shows it as the current background
    expect(log.urls).toContain('https://assets.paper.bible/backgrounds/previews_2700/beach.jpg')
    await expect(frame.getByRole('img', {name: 'Current background'})).toHaveAttribute('src',
        'https://assets.paper.bible/backgrounds/thumbnails/beach.jpg')

    // Untouched, Finished hands it straight back by ID with no confirmation
    await frame.getByRole('button', {name: 'Finished'}).click()
    const finished = await next_message(page, 'finished')
    expect(finished['bg_image_builtin']).toBe('beach.jpg')
    expect(finished['bg_image']).toBeNull()
    expect(finished['data']).toMatchObject({title1: 'Beach Book'})
    expect(finished['custom_fonts']).toEqual([])
})

test('an unknown built-in ID is ignored rather than trusted', async ({page}) => {
    const warnings:string[] = []
    page.on('console', message => {
        if (message.type() === 'warning') warnings.push(message.text())
    })
    const frame = await open_host(page, {init: {
        preset: {title1: 'Nope'},
        bg_image_builtin: '../../etc/passwd.jpg',
        finished_mode: true,
    }})
    await expect(frame.getByRole('img', {name: 'Current background'})).toHaveCount(0)
    expect(warnings.some(w => w.includes('unknown bg_image_builtin'))).toBe(true)
    await frame.getByRole('button', {name: 'Finished'}).click()
    const finished = await next_message(page, 'finished')
    expect(finished['bg_image_builtin']).toBeNull()
})

test('an uploaded background round-trips as the very File the host sent', async ({page}) => {
    const frame = await open_host(page, {
        init: {preset: {title1: 'Upload Book'}, finished_mode: true},
        bg_image: 'fixture.jpg',
    })
    await expect(frame.getByRole('img', {name: 'Current background'})).toHaveAttribute('src', /^blob:/)
    await frame.getByRole('button', {name: 'Finished'}).click()
    const finished = await next_message(page, 'finished')
    expect(finished['bg_image']).toEqual({
        file: 'fixture.jpg',
        size: repo_file('assets/backgrounds/beach.jpg').length,
        type: 'image/jpeg',
    })
    expect(finished['bg_image_builtin']).toBeNull()
})

test('Finished with edits asks first: Save sends the edits', async ({page}) => {
    const frame = await open_host(page, {init: {preset: {title1: 'Before'}, finished_mode: true}})
    const svg = await print_svg(frame)
    await frame.getByPlaceholder('Line 1…').fill('After')
    await wait_for_new_cover(frame, svg)
    await frame.getByRole('button', {name: 'Finished'}).click()
    const dialog = frame.getByRole('dialog')
    await expect(dialog.getByText('Save changes to cover?')).toBeVisible()
    await dialog.getByRole('button', {name: 'Save', exact: true}).click()
    const finished = await next_message(page, 'finished')
    expect(finished['data']).toMatchObject({title1: 'After'})
    expect(await received(page, 'cancelled')).toEqual([])
})

test('Finished with edits asks first: Discard cancels', async ({page}) => {
    const frame = await open_host(page, {init: {preset: {title1: 'Before'}, finished_mode: true}})
    await frame.getByPlaceholder('Line 1…').fill('Thrown away')
    await frame.getByRole('button', {name: 'Finished'}).click()
    await frame.getByRole('dialog').getByRole('button', {name: 'Discard'}).click()
    await next_message(page, 'cancelled')
    expect(await received(page, 'finished')).toEqual([])
})

test('a host suggestion is fetched from the host on click and adopted as an upload', async ({page}) => {
    const frame = await open_host(page, {
        init: {
            preset: {title1: 'Suggested'},
            bg_suggestions: [
                {id: 'other-book', url: `${HOST}/thumb.jpg`, label: 'My other book'},
                {nonsense: true},
            ],
        },
        resolve: 'file',
    })
    const svg = await print_svg(frame)
    await frame.getByRole('button', {name: 'Choose suggested background'}).first().click()
    await expect(frame.getByText('Recent images', {exact: true})).toBeVisible()
    // The malformed entry is dropped, leaving one tile
    const tile = frame.getByRole('button', {name: 'My other book'})
    await expect(tile).toHaveCount(1)
    await tile.click()

    const selected = await next_message(page, 'bg_suggestion_selected')
    expect(selected).toEqual({type: 'bg_suggestion_selected', id: 'other-book'})
    await frame.getByRole('button', {name: 'Done', exact: true}).click()
    await wait_for_new_cover(frame, svg)
    await expect.poll(async () => (await received(page, 'data')).at(-1)?.msg['bg_image'])
        .toMatchObject({file: 'fixture.jpg'})
    expect((await received(page, 'data')).at(-1)!.msg['bg_image_builtin']).toBeNull()
})

test('a host that fails a suggestion leaves the background alone and says so', async ({page}) => {
    const frame = await open_host(page, {
        init: {preset: {title1: 'Suggested'},
            bg_suggestions: [{id: 'gone', url: `${HOST}/thumb.jpg`, label: 'Gone book'}]},
        resolve: 'null',
    })
    await frame.getByRole('button', {name: 'Choose suggested background'}).first().click()
    await frame.getByRole('button', {name: 'Gone book'}).click()
    await expect(frame.getByText('Could not load that image')).toBeVisible()
    await expect(frame.getByRole('img', {name: 'Current background'})).toHaveCount(0)
})

test('only the first init is honoured', async ({page}) => {
    const frame = await open_host(page, {init: {preset: {title1: 'First'}, finished_mode: true}})
    await page.evaluate(() => (window as unknown as {post:(msg:unknown) => void}).post(
        {type: 'init', preset: {title1: 'Second'}, finished_mode: false}))
    // Give the message a chance to (wrongly) land
    await expect(frame.getByRole('button', {name: 'Finished'})).toBeVisible()
    await expect(frame.getByPlaceholder('Line 1…')).toHaveValue('First')
})

test('uncaught widget errors are relayed to the host', async ({page}) => {
    await open_host(page, {init: {preset: {title1: 'Errors'}}})
    const widget = page.frames().find(f => f.url().startsWith(WIDGET))!
    await widget.evaluate(() => {
        setTimeout(() => { throw new Error('boom from the e2e test') })
    })
    const error = await next_message(page, 'error')
    expect(error['message']).toMatch(/^Error: boom from the e2e test/)
    // A production build names its commit
    expect(error['build']).toMatch(/^[0-9a-f]{7,}(-dirty)?$/)
    expect((await received(page, 'error')).at(-1)!.origin).toBe(WIDGET)
})

test('seeded custom fonts are offered and returned', async ({page}) => {
    test.skip(!existsSync(repo_url(SEED_FONT)), 'needs the fonts tree — run .bin/download_fonts')
    const frame = await open_host(page, {
        init: {preset: {title1: 'Fonts'}, finished_mode: true},
        seed_font: {family: 'Host Seeded Font', style: 'serif'},
    })
    await frame.getByRole('button', {name: 'Line 1 style'}).click()
    await frame.getByRole('dialog').getByText('Font', {exact: true}).locator('..').getByRole('button')
        .first().click()
    await expect(frame.getByText('Uploaded', {exact: true})).toBeVisible()
    await expect(frame.getByText('Host Seeded Font', {exact: true}).first()).toBeVisible()

    await page.keyboard.press('Escape')
    await frame.getByRole('button', {name: 'Finished'}).click()
    const finished = await next_message(page, 'finished')
    expect(finished['custom_fonts']).toEqual([
        {family: 'Host Seeded Font', style: 'serif', files: [{bytes: repo_file(SEED_FONT).length}]},
    ])
})

// The editor stack loads only once a blurb has text or the modal opens (see CLAUDE.md)
test('a blank embedded blurb never loads the editor stack', async ({page}) => {
    const log = watch(page)
    const frame = await open_host(page, {init: {preset: {title1: 'Blank blurb'}}})
    await wait_ready(frame)
    expect([...log.chunks].filter(chunk => chunk.startsWith('BlurbEditorModal'))).toEqual([])
})

test('an init that misses the 300ms fallback still seeds the form', async ({page}) => {
    // The widget mounts with the demo cover first, and its size watchers are live by then
    const frame = await open_host(page, {init_delay_ms: 1500, init: {
        preset: {title1: 'Late Title', service_id: 'kdp', size_id: 'digest'},
    }})
    await expect(frame.getByPlaceholder('Line 1…')).toHaveValue('Late Title')
    await wait_ready(frame)
    // Nothing describing the demo cover reached the host, and the preset isn't echoed back
    expect(await received(page, 'data')).toEqual([])

    // The first edit reports the preset on the blank base, its size intact despite the
    // service change that makes SizeSection reset the size
    await frame.getByPlaceholder('Line 1…').fill('Late Title Edited')
    const data = (await next_message(page, 'data'))['data'] as Record<string, unknown>
    expect(data).toMatchObject({title1: 'Late Title Edited', title2: '', service_id: 'kdp',
        size_id: 'digest'})
})
