
// Web Worker that owns the WASM Typst compiler, so cover generation (which can take seconds)
// runs off the main thread and never lags the UI. Driven by GeneratorWorkerClient in
// generator_client.ts via simple id-tagged request/response messages.

import wasm_url from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'
import renderer_wasm_url from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url'
import {init as init_generator} from 'bookcover-web'

import type {CoverGenerator, GenerateOptions, GenerateResult} from 'bookcover-web'


// Actions the main thread can request (see GeneratorWorkerClient in generator_client.ts)
export type WorkerAction =
    | {action:'init', assets_prefix:string, fonts_prefix:string}
    | {action:'set_custom_fonts', fonts:Uint8Array[]}
    | {action:'generate', options:Omit<GenerateOptions, 'custom_fonts'>}

// Every request carries an id, echoed back in the matching response
export type WorkerRequest = WorkerAction & {id:number}

// Response to a request: the result for generate actions, null for init/set_custom_fonts.
// Errors keep their name and Zod issues so the UI can still detect validation failures.
export type WorkerResponse =
    | {id:number, ok:true, result:GenerateResult|null}
    | {id:number, ok:false, error:string, error_name?:string, issues?:unknown[]}


// The generator instance, created by the 'init' action (null until then)
let generator:CoverGenerator|null = null

// Worker-side copy of uploaded custom font bytes — reusing the same Uint8Array references
// across generates keeps the generator's identity-based font cache key stable, so the
// compiler only reinitialises when the font set actually changes
let custom_fonts:Uint8Array[] = []

// Actions run one at a time since compiles mutate shared compiler state (fonts, shadow files)
let queue:Promise<void> = Promise.resolve()


// Perform a single action, returning the result for generate actions
async function handle_action(message:WorkerRequest):Promise<GenerateResult|null> {
    if (message.action === 'init'){
        generator = await init_generator({
            wasm_url,
            renderer_wasm_url,
            assets_prefix: message.assets_prefix,
            fonts_prefix: message.fonts_prefix,
        })
        return null
    }
    if (!generator){
        throw new Error('Generator worker used before init')
    }
    if (message.action === 'set_custom_fonts'){
        custom_fonts = message.fonts
        return null
    }
    return generator.generate({
        ...message.options,
        ...(custom_fonts.length ? {custom_fonts} : {}),
    })
}


// Serialise an error for the main thread, keeping the name and Zod issues (both are plain
// data, unlike the Error itself which can't be structured-cloned with its prototype intact)
function error_response(id:number, error:unknown):WorkerResponse {
    const response:Extract<WorkerResponse, {ok:false}> = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    }
    if (error instanceof Error){
        response.error_name = error.name
        if ('issues' in error && Array.isArray((error as {issues:unknown}).issues)){
            response.issues = (error as {issues:unknown[]}).issues
        }
    }
    return response
}


// Queue each incoming message and answer it with a response bearing the same id
self.addEventListener('message', (event:MessageEvent<WorkerRequest>) => {
    queue = queue.then(async () => {
        try {
            const result = await handle_action(event.data)
            postMessage({id: event.data.id, ok: true, result} satisfies WorkerResponse)
        } catch (error){
            // Log here too since the Error loses its stack when serialised for the main thread
            console.error(error)
            postMessage(error_response(event.data.id, error))
        }
    })
})
