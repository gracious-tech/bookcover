
// Client for the generator Web Worker: same async API as bookcover-web's CoverGenerator, but
// every call is relayed to the worker (see generator_worker.ts) so WASM compilation never
// blocks the UI thread. The worker is disposable: a WASM trap (e.g. running out of memory) or a
// crash leaves it unusable, so it's dropped and the next call starts a fresh one, replaying init
// and the custom fonts so the swap is invisible to callers

import type {GenerateOptions, GenerateResult} from 'bookcover-web'
import type {WorkerAction, WorkerResponse} from './generator_worker'
import {i18n} from './i18n'


// Handlers awaiting a response from the worker, keyed by request id
interface PendingHandlers {
    resolve:(result:GenerateResult|null)=>void
    reject:(error:Error)=>void
}


// Failure that also broke the worker: a WASM trap, or the worker script crashing. It's the
// engine failing (typically the device running out of memory), not the cover being generated
export class WorkerFatalError extends Error {
    override name = 'WorkerFatalError'
}


// Gaps between tries at starting the generator when its files can't be downloaded (a connection
// dropping as the page loads) or the worker crashes while starting
const INIT_RETRY_GAPS_MS = [2000, 5000, 15000]


// Whether an error is a download failing to reach the network at all, in each engine's wording
// (Chromium, WebKit, Firefox), the WASM's own streaming download included (Chromium:
// "WebAssembly compilation aborted: Network error: ...")
export function is_fetch_failure(error:unknown):boolean {
    return error instanceof Error
        && /^(Failed to fetch|Load failed|NetworkError when attempting to fetch)|Network error:/
            .test(error.message)
}


// Relays generator calls to the worker via id-tagged messages and matches up the responses
export class GeneratorWorkerClient {

    private worker!:Worker
    private next_id = 0
    private pending = new Map<number, PendingHandlers>()
    // Arguments of the init and set_custom_fonts calls, replayed into each fresh worker
    private init_args:{assets_prefix:string, fonts_prefix:string}|null = null
    private custom_fonts:Uint8Array[] = []
    // Set when the worker can't be used again, so the next call starts a fresh one
    private broken = false

    constructor(){
        this.spawn_worker()
    }

    // Create the worker and wire up its message handlers (re-run for every fresh worker)
    private spawn_worker():void {
        this.worker = new Worker(
            new URL('./generator_worker.ts', import.meta.url), {type: 'module'})
        this.broken = false

        // Resolve/reject the matching call for each response
        this.worker.onmessage = (event:MessageEvent<WorkerResponse>) => {
            const response = event.data
            const handlers = this.pending.get(response.id)
            if (!handlers){
                return
            }
            this.pending.delete(response.id)
            if (response.ok){
                handlers.resolve(response.result)
            } else if (response.fatal){
                // A trap breaks the compiler for every request queued behind this one too
                handlers.reject(new WorkerFatalError(response.error))
                this.drop_worker(response.error)
            } else {
                // Rebuild the error with its original name and Zod issues, so the preview's
                // ZodError detection still works across the worker boundary. A translation
                // code (set for errors originating in generator/, which has no i18n of its
                // own — see IconCacheError) overrides the message with the translated string.
                const error = new Error(
                    response.code ? i18n.global.t(`errors.${response.code}`, response.params ?? {}) : response.error,
                )
                if (response.error_name){
                    error.name = response.error_name
                }
                if (response.issues){
                    Object.assign(error, {issues: response.issues})
                }
                handlers.reject(error)
            }
        }

        // A crash of the worker script itself (rather than a handled compile error) means no
        // response will ever arrive for what's in flight, and nothing sent later is safe either
        this.worker.onerror = event => {
            // Handled here, so the browser doesn't also pass it on to the page as an uncaught
            // error (reported again with nothing to say where it came from)
            event.preventDefault()
            this.drop_worker(event.message || i18n.global.t('errors.generator_worker_failed'))
        }
    }

    // Fail every in-flight call and stop the broken worker, so the next call starts a fresh one
    private drop_worker(message:string):void {
        for (const handlers of this.pending.values()){
            handlers.reject(new WorkerFatalError(message))
        }
        this.pending.clear()
        this.worker.terminate()
        this.broken = true
    }

    // Swap in a fresh worker, replaying init and custom fonts ahead of anything sent after. The
    // worker answers strictly in order, so posting them first is enough to sequence them
    private respawn():void {
        this.worker.terminate()
        this.spawn_worker()
        if (this.init_args){
            // A failed replay is reported by the next call to reach the worker (see
            // init_failure in generator_worker.ts), which also marks this worker for replacing
            this.post({action: 'init', ...this.init_args}).catch(() => { this.broken = true })
        }
        if (this.custom_fonts.length){
            this.post({action: 'set_custom_fonts', fonts: this.custom_fonts}).catch(() => {})
        }
    }

    // Post one request to the current worker and await its matching response
    private post(action:WorkerAction):Promise<GenerateResult|null> {
        const id = this.next_id++
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject})
            this.worker.postMessage({...action, id})
        })
    }

    // As post(), but first replaces the worker if the last one broke
    private send(action:WorkerAction):Promise<GenerateResult|null> {
        if (this.broken){
            this.respawn()
        }
        return this.post(action)
    }

    // Initialise the WASM compiler + renderer in the worker (fonts are (re)loaded per compile
    // based on what each schema needs). Its files failing to download, or the worker crashing
    // while starting, is tried again after each of INIT_RETRY_GAPS_MS, on a fresh worker
    async init(assets_prefix:string, fonts_prefix:string):Promise<void> {
        for (const gap of INIT_RETRY_GAPS_MS){
            try {
                await this.send({action: 'init', assets_prefix, fonts_prefix})
                this.init_args = {assets_prefix, fonts_prefix}
                return
            } catch (error){
                if (!is_fetch_failure(error) && !(error instanceof WorkerFatalError)){
                    throw error
                }
            }
            await new Promise(resolve => setTimeout(resolve, gap))
            this.broken = true
        }
        await this.send({action: 'init', assets_prefix, fonts_prefix})
        this.init_args = {assets_prefix, fonts_prefix}
    }

    // Send the current set of user-uploaded font bytes to the worker. The worker holds a
    // copy (not our array reference), so re-call this whenever the uploaded set changes
    async set_custom_fonts(fonts:Uint8Array[]):Promise<void> {
        this.custom_fonts = fonts
        try {
            await this.send({action: 'set_custom_fonts', fonts})
        } catch (error){
            // A broken worker is no loss here: the fresh one is sent these fonts on startup
            if (!(error instanceof WorkerFatalError)){
                throw error
            }
        }
    }

    // Generate a cover (custom fonts come from the worker's own store, not per-call options).
    // A failure that broke the worker is retried once on a fresh one, since a trap from
    // memory the old worker had built up may not happen again; failing twice is passed on
    async generate(options:Omit<GenerateOptions, 'custom_fonts'>):Promise<GenerateResult> {
        try {
            return await this.send({action: 'generate', options}) as GenerateResult
        } catch (error){
            if (!(error instanceof WorkerFatalError)){
                throw error
            }
            return await this.send({action: 'generate', options}) as GenerateResult
        }
    }
}
