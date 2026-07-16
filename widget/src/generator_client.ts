
// Client for the generator Web Worker: same async API as bookcover-web's CoverGenerator, but
// every call is relayed to the worker (see generator_worker.ts) so WASM compilation never
// blocks the UI thread

import type {GenerateOptions, GenerateResult} from 'bookcover-web'
import type {WorkerAction, WorkerResponse} from './generator_worker'
import {i18n} from './i18n'


// Handlers awaiting a response from the worker, keyed by request id
interface PendingHandlers {
    resolve:(result:GenerateResult|null)=>void
    reject:(error:Error)=>void
}


// Relays generator calls to the worker via id-tagged messages and matches up the responses
export class GeneratorWorkerClient {

    private worker:Worker
    private next_id = 0
    private pending = new Map<number, PendingHandlers>()

    constructor(){
        this.worker = new Worker(
            new URL('./generator_worker.ts', import.meta.url), {type: 'module'})

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

        // A crash of the worker script itself (rather than a handled compile error) fails all
        // in-flight calls, since no response will ever arrive for them
        this.worker.onerror = event => {
            const error = new Error(event.message || i18n.global.t('errors.generator_worker_failed'))
            for (const handlers of this.pending.values()){
                handlers.reject(error)
            }
            this.pending.clear()
        }
    }

    // Send one request to the worker and await its matching response
    private send(action:WorkerAction):Promise<GenerateResult|null> {
        const id = this.next_id++
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject})
            this.worker.postMessage({...action, id})
        })
    }

    // Initialise the WASM compiler + renderer in the worker (fonts are (re)loaded per compile
    // based on what each schema needs)
    async init(assets_prefix:string, fonts_prefix:string):Promise<void> {
        await this.send({action: 'init', assets_prefix, fonts_prefix})
    }

    // Send the current set of user-uploaded font bytes to the worker. The worker holds a
    // copy (not our array reference), so re-call this whenever the uploaded set changes
    async set_custom_fonts(fonts:Uint8Array[]):Promise<void> {
        await this.send({action: 'set_custom_fonts', fonts})
    }

    // Generate a cover (custom fonts come from the worker's own store, not per-call options)
    async generate(options:Omit<GenerateOptions, 'custom_fonts'>):Promise<GenerateResult> {
        return await this.send({action: 'generate', options}) as GenerateResult
    }
}
