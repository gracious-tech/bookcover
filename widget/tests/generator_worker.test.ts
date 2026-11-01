
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {GenerateResult} from 'bookcover-web'
import type {WorkerRequest, WorkerResponse} from '../src/generator_worker'
import en from '../src/locales/en'


// CLIENT (main thread) — runs against a stand-in Worker that records requests and lets each
// test answer them

/** Stand-in for the browser Worker the client constructs */
class FakeWorker {
    static all:FakeWorker[] = []
    url:URL
    options:WorkerOptions
    sent:WorkerRequest[] = []
    terminated = false
    onmessage:((event:{data:WorkerResponse}) => void) | null = null
    onerror:((event:{message:string, preventDefault:() => void}) => void) | null = null

    constructor(url:URL, options:WorkerOptions){
        this.url = url
        this.options = options
        FakeWorker.all.push(this)
    }

    /** Record a request from the client */
    postMessage(message:WorkerRequest):void {
        this.sent.push(message)
    }

    /** Record that the client stopped this worker */
    terminate():void {
        this.terminated = true
    }

    /** Answer as the worker would */
    respond(response:WorkerResponse):void {
        this.onmessage?.({data: response})
    }

    /** Crash as the worker script would, returning whether the client cancelled the event */
    crash(message:string):boolean {
        let cancelled = false
        this.onerror?.({message, preventDefault: () => { cancelled = true }})
        return cancelled
    }

    /** The action names sent so far, in order */
    actions():string[] {
        return this.sent.map(request => request.action)
    }
}

/** The most recently started FakeWorker */
function latest():FakeWorker {
    const worker = FakeWorker.all.at(-1)
    if (!worker)
        throw new Error('Client constructed no worker')
    return worker
}

/** A fresh client on a fresh FakeWorker */
async function make_client(){
    FakeWorker.all = []
    vi.stubGlobal('Worker', FakeWorker)
    const {GeneratorWorkerClient, WorkerFatalError} = await import('../src/generator_client')
    const client = new GeneratorWorkerClient()
    return {client, worker: latest(), WorkerFatalError}
}

/** A fresh client whose worker has already answered init (and set_custom_fonts, if given) */
async function make_ready_client(fonts?:Uint8Array[]){
    const made = await make_client()
    const init = made.client.init('https://a/', 'https://a/fonts')
    made.worker.respond({id: 0, ok: true, result: null})
    await init
    if (fonts){
        const set = made.client.set_custom_fonts(fonts)
        made.worker.respond({id: 1, ok: true, result: null})
        await set
    }
    return made
}

/** Let the client's pending promise callbacks run */
async function settle():Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0))
}

// A minimal stand-in for a generate() result — the client only relays it
const RESULT = {svg: '<svg/>'} as unknown as GenerateResult

// Options for a generate() call — the client only relays them
const OPTIONS = {schema: {}} as Parameters<
    InstanceType<typeof import('../src/generator_client').GeneratorWorkerClient>['generate']>[0]


describe('GeneratorWorkerClient', () => {

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

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
        const gen = client.generate(OPTIONS)
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
        const gen = client.generate(OPTIONS)
        worker.respond({id: 99, ok: true, result: null})
        worker.respond({id: 0, ok: true, result: RESULT})
        worker.respond({id: 0, ok: false, error: 'late duplicate'})
        await expect(gen).resolves.toBe(RESULT)
    })

    it('rebuilds a failed call\'s error with its name and Zod issues', async () => {
        const {client, worker} = await make_client()
        const gen = client.generate(OPTIONS)
        const issues = [{path: ['title1'], message: 'Required'}]
        worker.respond({id: 0, ok: false, error: 'invalid', error_name: 'ZodError', issues})
        const error = await gen.catch((e:unknown) => e) as Error & {issues?:unknown}
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toBe('invalid')
        expect(error.name).toBe('ZodError')
        expect(error.issues).toEqual(issues)
        // An ordinary failure leaves the worker in use
        expect(FakeWorker.all).toHaveLength(1)
    })

    it('translates errors that carry a code from the generator', async () => {
        const {client, worker} = await make_client()
        const gen = client.generate(OPTIONS)
        worker.respond({id: 0, ok: false, error: 'raw english', code: 'icon_not_found',
            params: {id: 'mdi:nope'}})
        await expect(gen).rejects.toThrow(en.errors.icon_not_found.replace('{id}', 'mdi:nope'))
    })

    it('retries a trapped generate on a fresh worker, replaying init and fonts first', async () => {
        const fonts = [new Uint8Array([1])]
        const {client, worker} = await make_ready_client(fonts)
        const gen = client.generate(OPTIONS)
        worker.respond({id: 2, ok: false, error: 'unreachable', error_name: 'RuntimeError',
            fatal: true})
        await settle()

        expect(worker.terminated).toBe(true)
        const fresh = latest()
        expect(fresh).not.toBe(worker)
        expect(fresh.sent).toEqual([
            {action: 'init', assets_prefix: 'https://a/', fonts_prefix: 'https://a/fonts', id: 3},
            {action: 'set_custom_fonts', fonts, id: 4},
            {action: 'generate', options: OPTIONS, id: 5},
        ])
        fresh.respond({id: 3, ok: true, result: null})
        fresh.respond({id: 4, ok: true, result: null})
        fresh.respond({id: 5, ok: true, result: RESULT})
        await expect(gen).resolves.toBe(RESULT)
    })

    it('fails everything queued behind a trap, since the compiler is broken for all of it',
            async () => {
        const {client, worker, WorkerFatalError} = await make_ready_client()
        const first = client.generate(OPTIONS)
        const second = client.generate(OPTIONS)
        worker.respond({id: 1, ok: false, error: 'unreachable', fatal: true})
        await settle()
        // Both were retried on the one fresh worker, behind the replayed init
        const fresh = latest()
        expect(fresh.actions()).toEqual(['init', 'generate', 'generate'])
        // Failing again there is passed on rather than retried forever
        fresh.respond({id: 3, ok: true, result: null})
        fresh.respond({id: 4, ok: false, error: 'out of memory', fatal: true})
        await expect(first).rejects.toBeInstanceOf(WorkerFatalError)
        await expect(second).rejects.toThrow('out of memory')
        expect(FakeWorker.all).toHaveLength(2)
    })

    it('handles a crash of the worker script itself the same way, cancelling the event', async () => {
        const {client, worker} = await make_ready_client()
        const gen = client.generate(OPTIONS)
        // Cancelled so the page's own error handlers don't report it a second time
        expect(worker.crash('Uncaught RuntimeError: unreachable')).toBe(true)
        expect(worker.terminated).toBe(true)
        await settle()
        const fresh = latest()
        expect(fresh.actions()).toEqual(['init', 'generate'])
        fresh.respond({id: 2, ok: true, result: null})
        fresh.respond({id: 3, ok: true, result: RESULT})
        await expect(gen).resolves.toBe(RESULT)
    })

    it('falls back to a translated message when the crash has none', async () => {
        const {client, worker} = await make_ready_client()
        const gen = client.generate(OPTIONS)
        worker.crash('')
        await settle()
        latest().crash('')
        await expect(gen).rejects.toThrow(en.errors.generator_worker_failed)
    })

    it('starts a fresh worker for the next call after a crash between calls', async () => {
        const {client, worker} = await make_ready_client()
        worker.crash('Uncaught Error')
        const gen = client.generate(OPTIONS)
        expect(worker.actions()).toEqual(['init'])
        expect(latest().actions()).toEqual(['init', 'generate'])
        latest().respond({id: 2, ok: true, result: RESULT})
        await expect(gen).resolves.toBe(RESULT)
    })

    it('keeps custom fonts through a crash rather than failing to send them', async () => {
        const {client, worker} = await make_ready_client()
        const fonts = [new Uint8Array([2])]
        const set = client.set_custom_fonts(fonts)
        worker.crash('Uncaught Error')
        await expect(set).resolves.toBeUndefined()
        client.generate(OPTIONS)
        expect(latest().sent).toContainEqual({action: 'set_custom_fonts', fonts, id: 3})
    })

    it('starts yet another worker when a fresh one fails to start', async () => {
        const {client, worker} = await make_ready_client()
        const gen = client.generate(OPTIONS)
        worker.respond({id: 1, ok: false, error: 'unreachable', fatal: true})
        await settle()
        const fresh = latest()
        // The replayed init can't download its files, and the retried generate says so
        fresh.respond({id: 2, ok: false, error: 'Failed to fetch'})
        fresh.respond({id: 3, ok: false, error: 'Failed to fetch'})
        await expect(gen).rejects.toThrow('Failed to fetch')
        // Rather than reusing the worker that never started, the next call gets another
        void client.generate(OPTIONS)
        expect(FakeWorker.all).toHaveLength(3)
        expect(latest().actions()).toEqual(['init', 'generate'])
    })

    it('retries an init that can\'t download its files on a fresh worker', async () => {
        vi.useFakeTimers()
        const {client, worker} = await make_client()
        const init = client.init('https://a/', 'https://a/fonts')
        worker.respond({id: 0, ok: false,
            error: 'WebAssembly compilation aborted: Network error: net::ERR_FAILED'})
        await vi.advanceTimersByTimeAsync(2000)
        // A dropped connection isn't the worker's fault, but nothing of the failed try is kept
        expect(worker.terminated).toBe(true)
        const fresh = latest()
        expect(fresh.actions()).toEqual(['init'])
        fresh.respond({id: 1, ok: true, result: null})
        await expect(init).resolves.toBeUndefined()
    })

    it('gives up on init after its last retry', async () => {
        vi.useFakeTimers()
        const {client} = await make_client()
        const init = client.init('a', 'b').catch((e:unknown) => e)
        for (const gap of [2000, 5000, 15000]){
            latest().crash('Uncaught Error')
            await vi.advanceTimersByTimeAsync(gap)
        }
        latest().respond({id: 3, ok: false, error: 'Load failed'})
        expect(await init).toMatchObject({message: 'Load failed'})
        expect(FakeWorker.all).toHaveLength(4)
    })

    it('doesn\'t retry an init that fails for any other reason', async () => {
        const {client, worker} = await make_client()
        const init = client.init('a', 'b')
        worker.respond({id: 0, ok: false, error: 'Font manifest is invalid'})
        await expect(init).rejects.toThrow('Font manifest is invalid')
        expect(FakeWorker.all).toHaveLength(1)
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

    it('marks WASM traps and stack overflows as fatal, and nothing else', async () => {
        await request({action: 'init', id: 0, assets_prefix: 'a', fonts_prefix: 'b'})
        const options = {} as Extract<WorkerRequest, {action:'generate'}>['options']

        generate_mock.mockRejectedValueOnce(new WebAssembly.RuntimeError('unreachable'))
        expect(await request({action: 'generate', id: 1, options}))
            .toMatchObject({id: 1, ok: false, error: 'unreachable', fatal: true})
        generate_mock.mockRejectedValueOnce(new RangeError('Maximum call stack size exceeded'))
        expect(await request({action: 'generate', id: 2, options})).toMatchObject({fatal: true})

        // A compile error or any other RangeError leaves the compiler usable
        generate_mock.mockRejectedValueOnce(new Error('unknown variable: freely'))
        expect(await request({action: 'generate', id: 3, options})).not.toHaveProperty('fatal')
        generate_mock.mockRejectedValueOnce(new RangeError('Invalid array length'))
        expect(await request({action: 'generate', id: 4, options})).not.toHaveProperty('fatal')
    })

    it('answers actions after a failed init with why it failed', async () => {
        init_mock.mockRejectedValueOnce(new Error('Failed to fetch'))
        expect(await request({action: 'init', id: 0, assets_prefix: 'a', fonts_prefix: 'b'}))
            .toMatchObject({ok: false, error: 'Failed to fetch'})
        expect(await request({action: 'generate', id: 1,
            options: {} as Extract<WorkerRequest, {action:'generate'}>['options']}))
            .toMatchObject({id: 1, ok: false, error: 'Failed to fetch'})
    })
})
