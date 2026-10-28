// The generator worker driven directly, for the bookcover-web output the widget's own UI never
// requests (it previews SVG and exports PDF), but an embed host running the generator in its own
// worker would: PNG, which renders through the real typst.ts canvas renderer

import {readdirSync} from 'node:fs'
import {test, expect} from './fixtures'
import {build_schema, cover_schema, make_blank_form_values, resolve_dimensions} from 'bookcover-web'
import type {FormState} from '../src/form_state'

// The built worker's file, in the production build's assets directory
const WORKER_FILE = readdirSync(new URL('../dist/assets/', import.meta.url))
    .find(file => file.startsWith('generator_worker'))

// What the widget's own init sends in a production build (see assets.ts and fonts.ts)
const ASSETS_PREFIX = 'https://assets.paper.bible/'
const FONTS_PREFIX = 'https://assets.paper.bible/fonts'

/** What the page reports back about a PNG the worker rendered */
interface PngReport {
    error?:string
    width?:number
    height?:number
    distinct_colors?:number
}

test('renders a PNG of the full spread inside the worker', async ({page}) => {
    const schema = build_schema({...make_blank_form_values(), title1: 'PNG check'} as FormState)
    const dims = resolve_dimensions(cover_schema.parse(schema))
    const ppi = 72
    await page.goto('/')

    const report = await page.evaluate(async ({file, schema, ppi, assets, fonts}):Promise<PngReport> => {
        const worker = new Worker(`/assets/${file}`, {type: 'module'})
        // A crashed worker (e.g. a WASM panic) never answers, so surface it as an error instead
        const crashed = new Promise<never>((_resolve, reject) => {
            worker.addEventListener('error', event => reject(new Error(event.message)))
        })

        /** Send one id-tagged request and wait for its response */
        const call = (request:object) => Promise.race([crashed, new Promise<{ok:boolean,
            result?:{data:Uint8Array}, error?:unknown}>(resolve => {
            const id = Math.random()
            worker.addEventListener('message', function on(event:MessageEvent) {
                if (event.data.id !== id) return
                worker.removeEventListener('message', on)
                resolve(event.data)
            })
            worker.postMessage({...request, id})
        })])

        try {
            await call({action: 'init', assets_prefix: assets, fonts_prefix: fonts})
            const response = await call({action: 'generate', options: {schema, format: 'png', ppi}})
            if (!response.ok) return {error: JSON.stringify(response.error)}

            // Decode it and count the colours in the whole image, so a blank render fails too
            const bitmap = await createImageBitmap(new Blob([response.result!.data],
                {type: 'image/png'}))
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(bitmap, 0, 0)
            const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
            const colors = new Set<number>()
            for (let i = 0; i < pixels.length; i += 4)
                colors.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!)
            return {width: bitmap.width, height: bitmap.height, distinct_colors: colors.size}
        }
        catch (error) {
            return {error: String(error)}
        }
        finally {
            worker.terminate()
        }
    }, {file: WORKER_FILE, schema, ppi, assets: ASSETS_PREFIX, fonts: FONTS_PREFIX})

    expect(report.error).toBeUndefined()
    // The canvas is sized to the Typst page, which is the whole cover spread
    expect(report.width).toBe(Math.round(dims.cover_total_width.toNumber() / 25.4 * ppi))
    expect(report.height).toBe(Math.round(dims.cover_total_height.toNumber() / 25.4 * ppi))
    // Anti-aliased title text alone yields dozens of shades; a blank canvas has one
    expect(report.distinct_colors).toBeGreaterThan(10)
})
