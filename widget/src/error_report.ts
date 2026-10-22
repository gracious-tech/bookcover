
// Error relay for embedding hosts — a cross-origin host can't observe the iframe's errors, so
// unexpected failures are posted to it as WidgetMessage 'error' (see embed_types.ts in
// generator-web). Nothing is sent until embed.ts hands over the host's origin from its 'init'
// message, so standalone use behaves exactly as it always has. Reporting must never become an
// error source of its own: every entry point swallows its own failures.

import type {App} from 'vue'
import type {WidgetMessage} from 'bookcover-web'

// Build that produced the report (see vite.config.ts) — null from the dev server, where the
// running code needn't match any commit
const BUILD = import.meta.env.DEV ? null : __GIT_HASH__

// Per page load, so a failure that repeats every render can't flood the host's error pipeline
const MAX_REPORTS = 20

// Errors raised from browser extensions' injected code, which aren't the widget's to report
const EXTENSION_URL = /(?:chrome|moz|safari|safari-web)-extension:|webkit-masked-url:/

// Every distinct message sent (or held) this page load — also the running total
const reported = new Set<string>()

// The host's origin once its 'init' has been accepted; null holds reports until then
let host_origin:string | null = null

// Reports raised before the host's origin was known, oldest first
const held:string[] = []

/** Post one report to the host */
function post(message:string, origin:string):void {
    const msg:WidgetMessage = {type: 'error', message, build: BUILD}
    window.parent.postMessage(msg, origin)
}

/** Queue or send a formatted report, applying the extension filter and volume limits */
function send(message:string):void {
    if (EXTENSION_URL.test(message) || reported.has(message) || reported.size >= MAX_REPORTS)
        return
    reported.add(message)
    if (host_origin === null)
        held.push(message)
    else
        post(message, host_origin)
}

/** Start sending to the host at the origin its 'init' arrived from, flushing anything held.
 *  Called by embed.ts, so it only ever happens when embedded. */
export function enable_error_reports(origin:string):void {
    try {
        host_origin = origin
        for (const message of held.splice(0))
            post(message, origin)
    }
    catch { /* never report the reporter */ }
}

/** Plain-text form of a thrown value: "<ErrorType>: <message>\n\n<stack>". Duck-typed rather
 *  than instanceof Error, since some browsers' DOMExceptions aren't Errors */
function describe(error:unknown):string {
    if (error && typeof error === 'object') {
        const {name, message, stack} = error as {name?:unknown, message?:unknown, stack?:unknown}
        if (typeof message === 'string') {
            const head = `${typeof name === 'string' && name ? name : 'Error'}: ${message}`
            return typeof stack === 'string' && stack ? `${head}\n\n${stack}` : head
        }
    }
    return `NonError: ${typeof error === 'string' ? error : JSON.stringify(error) ?? String(error)}`
}

/** Report an unexpected failure to the host (no-op when standalone). Doesn't log — callers keep
 *  their own console.error. `context` says where it happened, appended as its own paragraph. */
export function report_error(error:unknown, context?:string):void {
    try {
        // A cancelled fetch is a deliberate outcome, not a failure
        if (error && typeof error === 'object' && (error as {name?:unknown}).name === 'AbortError')
            return
        send(context ? `${describe(error)}\n\n${context}` : describe(error))
    }
    catch { /* never report the reporter */ }
}

/** Listen for uncaught errors and unhandled rejections — call once, as early as possible, so
 *  failures before the host's 'init' arrives are held rather than missed. Purely passive: the
 *  browser still logs them as usual. */
export function install_error_reports():void {
    window.addEventListener('error', (event:ErrorEvent) => {
        try {
            if (EXTENSION_URL.test(event.filename ?? ''))
                return
            if (event.error) {
                report_error(event.error)
                return
            }
            // No error object: cross-origin script noise and benign ResizeObserver warnings,
            // otherwise all there is to go on is the message and where it was raised
            const message = event.message ?? ''
            if (message === 'Script error.' || message.includes('ResizeObserver loop'))
                return
            send(`Error: ${message}\n\n    at ${event.filename}:${event.lineno}:${event.colno}`)
        }
        catch { /* never report the reporter */ }
    })
    window.addEventListener('unhandledrejection', (event:PromiseRejectionEvent) => {
        report_error(event.reason, 'Unhandled promise rejection')
    })
}

/** Report errors Vue catches itself (render, watchers, lifecycle hooks), which never reach the
 *  window listeners. Only install when embedded: replacing Vue's handler drops its dev-mode
 *  component trace, so standalone keeps the default. Logs as Vue's production handler does. */
export function install_vue_error_reports(app:App):void {
    app.config.errorHandler = (error, _instance, info) => {
        console.error(error)
        report_error(error, `Vue: ${info}`)
    }
}
