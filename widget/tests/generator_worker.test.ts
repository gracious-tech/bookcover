
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {GenerateResult} from 'bookcover-web'
import type {WorkerRequest, WorkerResponse} from '../src/generator_worker'
import en from '../src/locales/en'


// CLIENT (main thread) — runs against a stand-in Worker that records requests and lets each
// test answer them

/** Stand-in for the browser Worker the client constructs */
class FakeWorker {
    static last:FakeWorker | null = null
    url:URL
    options:WorkerOptions
    sent:WorkerRequest[] = []
    onmessage:((event:{data:WorkerResponse}) => void) | null = null
    onerror:((event:{message:string}) => void) | null = null

    constructor(url:URL, options:WorkerOptions){
        this.url = url
        this.options = options
        FakeWorker.last = this
    }

    /** Record a request from the client */
    postMessage(message:WorkerRequest):void {
        this.sent.push(message)
    }

    /** Answer as the worker would */
    respond(response:WorkerResponse):void {
        this.onmessage?.({data: response})
    }
}

/** A fresh client on a fresh FakeWorker */
async function make_client(){
    vi.stubGlobal('Worker', FakeWorker)
    const {GeneratorWorkerClient} = await import('../src/generator_client')
    const client = new GeneratorWorkerClient()
    const worker = FakeWorker.last
    if (!worker)
        throw new Error('Client constructed no worker')
    return {client, worker}
}

// A minimal stand-in for a generate() result — the client only relays it
const RESULT = {svg: '<svg/>'} as unknown as GenerateResult


describe('GeneratorWorkerClient', () => {

    afterEach(() => { vi.unstubAllGlobals() })

    it('starts the worker script as an ES module', async () => {
        const {worker} = await make_client()
        expect(worker.url.pathname).toMatch(/\/generator_worker\.ts$/)
        expect(worker.options).toEqual({type: 'module'})
    })

    it('tags each request with a unique id and resolves it from the matching response', async () => {
        const {client, worker} = await make_client()
        const init = client.init('https://a/', 'https://a/fonts')
        const fonts = [new Uint8Array([1])]
        const set = client.set_custom_fonts(fonts)
        const gen = client.generate({schema: {}} as Parameters<typeof client.generate>[0])
        expect(worker.sent).toEqual([
            {action: 'init', assets_prefix: 'https://a/', fonts_prefix: 'https://a/fonts', id: 0},
            {action: 'set_custom_fonts', fonts, id: 1},
            {action: 'generate', options: {schema: {}}, id: 2},
        ])
        // Answered out of order, each still reaches its own caller
        worker.respond({id: 2, ok: true, result: RESULT})
        worker.respond({id: 0, ok: true, result: null})
        worker.respond({id: 1, ok: true, result: null})
        await expect(gen).resolves.toBe(RESULT)
        await expect(init).resolves.toBeUndefined()
        await expect(set).resolves.toBeUndefined()
    })

    it('ignores responses for unknown or already-answered ids', async () => {
        const {client, worker} = await make_client()
        const gen = client.generate({} as Parameters<typeof client.generate>[0])
        worker.respond({id: 99, ok: true, result: null})
        worker.respond({id: 0, ok: true, result: RESULT})
        worker.respond({id: 0, ok: false, error: 'late duplicate'})
        await expect(gen).resolves.toBe(RESULT)
    })

    it('rebuilds a failed call\'s error with its name and Zod issues', async () => {
        const {client, worker} = await make_client()
        const gen = client.generate({} as Parameters<typeof client.generate>[0])
        const issues = [{path: ['title1'], message: 'Required'}]
        worker.respond({id: 0, ok: false, error: 'invalid', error_name: 'ZodError', issues})
        const error = await gen.catch((e:unknown) => e) as Error & {issues?:unknown}
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toBe('invalid')
        expect(error.name).toBe('ZodError')
        expect(error.issues).toEqual(issues)
    })

    it('translates errors that carry a code from the generator', async () => {
        const {client, worker} = await make_client()
        const gen = client.generate({} as Parameters<typeof client.generate>[0])
        worker.respond({id: 0, ok: false, error: 'raw english', code: 'icon_not_found',
            params: {id: 'mdi:nope'}})
        await expect(gen).rejects.toThrow(en.errors.icon_not_found.replace('{id}', 'mdi:nope'))
    })

    it('fails every in-flight call when the worker script crashes', async () => {
        const {client, worker} = await make_client()
        const first = client.generate({} as Parameters<typeof client.generate>[0])
        const second = client.init('a', 'b')
        worker.onerror?.({message: 'SyntaxError in worker'})
        await expect(first).rejects.toThrow('SyntaxError in worker')
        await expect(second).rejects.toThrow('SyntaxError in worker')
        // Nothing is left pending, so a late response changes nothing
        worker.respond({id: 0, ok: true, result: RESULT})
    })

    it('falls back to a translated message when the crash has none', async () => {
        const {client, worker} = await make_client()
        const gen = client.generate({} as Parameters<typeof client.generate>[0])
        worker.onerror?.({message: ''})
        await expect(gen).rejects.toThrow(en.errors.generator_worker_failed)
    })
})


// WORKER — runs the real worker module against a stand-in worker global scope and a mocked
// generator, so only the relay/queueing logic is under test

const generate_mock = vi.fn()
const init_mock = vi.fn(async () => ({generate: generate_mock}))
vi.mock('bookcover-web', () => ({init: init_mock}))

// The worker's 'message' listener and everything it posted back
let on_message:((event:{data:WorkerRequest}) => void) | null = null
const responses:WorkerResponse[] = []

/** A fresh copy of the worker module (its generator/font state is per worker) */
async function load_worker():Promise<void> {
    on_message = null
    responses.length = 0
    vi.stubGlobal('self', {addEventListener: (type:string, fn:typeof on_message) => {
        if (type === 'message') on_message = fn
    }})
    vi.stubGlobal('postMessage', (response:WorkerResponse) => { responses.push(response) })
    vi.resetModules()
    await import('../src/generator_worker')
}

/** Send a request and wait for the worker's queue to answer it */
async function request(data:WorkerRequest):Promise<WorkerResponse | undefined> {
    const before = responses.length
    on_message?.({data})
    await vi.waitFor(() => { expect(responses.length).toBeGreaterThan(before) })
    return responses.at(-1)
}


describe('generator worker', () => {

    beforeEach(async () => {
        generate_mock.mockReset()
        init_mock.mockClear()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        await load_worker()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('initialises the generator with the versioned typst wasm URLs', async () => {
        const response = await request({action: 'init', id: 4, assets_prefix: 'https://a/',
            fonts_prefix: 'https://a/fonts'})
        expect(response).toEqual({id: 4, ok: true, result: null})
        expect(init_mock).toHaveBeenCalledWith({
            wasm_url: '/generator_assets/typst/0.7.0/typst_ts_web_compiler_bg.wasm',
            renderer_wasm_url: '/generator_assets/typst/0.7.0/typst_ts_renderer_bg.wasm',
            assets_prefix: 'https://a/',
            fonts_prefix: 'https://a/fonts',
        })
    })

    it('refuses to generate before init', async () => {
        const response = await request({action: 'generate', id: 1,
            options: {} as Extract<WorkerRequest, {action:'generate'}>['options']})
        expect(response).toMatchObject({id: 1, ok: false, error: 'Generator worker used before init',
            error_name: 'Error'})
    })

    it('passes custom fonts to generate only once some are set, keeping their identity', async () => {
        await request({action: 'init', id: 0, assets_prefix: 'a', fonts_prefix: 'b'})
        generate_mock.mockResolvedValue(RESULT)
        const options = {schema: {title1: 'x'}} as unknown as
            Extract<WorkerRequest, {action:'generate'}>['options']

        expect(await request({action: 'generate', id: 1, options}))
            .toEqual({id: 1, ok: true, result: RESULT})
        expect(generate_mock).toHaveBeenLastCalledWith(options)

        const fonts = [new Uint8Array([1, 2])]
        await request({action: 'set_custom_fonts', id: 2, fonts})
        await request({action: 'generate', id: 3, options})
        const [call] = generate_mock.mock.calls.at(-1) as [{custom_fonts:Uint8Array[]}]
        expect(call.custom_fonts).toBe(fonts)
    })

    it('serialises errors with name, Zod issues and translation code', async () => {
        await request({action: 'init', id: 0, assets_prefix: 'a', fonts_prefix: 'b'})
        const options = {} as Extract<WorkerRequest, {action:'generate'}>['options']

        // A Zod-style validation failure
        const zod = Object.assign(new Error('bad schema'), {name: 'ZodError', issues: [{path: []}]})
        generate_mock.mockRejectedValueOnce(zod)
        expect(await request({action: 'generate', id: 1, options})).toEqual({
            id: 1, ok: false, error: 'bad schema', error_name: 'ZodError', issues: [{path: []}],
        })

        // A coded generator error, with and without params
        generate_mock.mockRejectedValueOnce(Object.assign(new Error('nope'),
            {name: 'IconCacheError', code: 'icon_not_found', params: {id: 'x:y'}}))
        expect(await request({action: 'generate', id: 2, options})).toEqual({
            id: 2, ok: false, error: 'nope', error_name: 'IconCacheError',
            code: 'icon_not_found', params: {id: 'x:y'},
        })
        generate_mock.mockRejectedValueOnce(Object.assign(new Error('c'), {code: 'some_code'}))
        expect(await request({action: 'generate', id: 3, options}))
            .toMatchObject({code: 'some_code', params: {}})

        // Something thrown that isn't an Error at all
        generate_mock.mockRejectedValueOnce('a string')
        expect(await request({action: 'generate', id: 4, options}))
            .toEqual({id: 4, ok: false, error: 'a string'})
    })

    it('runs actions one at a time, in arrival order', async () => {
        await request({action: 'init', id: 0, assets_prefix: 'a', fonts_prefix: 'b'})
        const order:string[] = []
        let release_first:() => void = () => {}
        generate_mock
            .mockImplementationOnce(() => new Promise(resolve => {
                order.push('first started')
                release_first = () => { order.push('first done'); resolve(RESULT) }
            }))
            .mockImplementationOnce(async () => { order.push('second started'); return RESULT })
        const options = {} as Extract<WorkerRequest, {action:'generate'}>['options']
        on_message?.({data: {action: 'generate', id: 1, options}})
        on_message?.({data: {action: 'generate', id: 2, options}})
        await vi.waitFor(() => { expect(order).toEqual(['first started']) })
        release_first()
        await vi.waitFor(() => { expect(responses.map(r => r.id)).toEqual([0, 1, 2]) })
        expect(order).toEqual(['first started', 'first done', 'second started'])
    })
})
