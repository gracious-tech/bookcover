
import {describe, it, expect, vi, beforeEach} from 'vitest'


// A stand-in window: the parent's postMessage is recorded, and listeners are kept so tests can
// fire 'error'/'unhandledrejection' events at them
const posted:{msg:{type:string, message:string, build:string | null}, origin:string}[] = []
const listeners = new Map<string, (event:unknown) => void>()

/** Fresh copy of the module (its sent/held state is per page load) on a fresh stand-in window */
async function load(){
    posted.length = 0
    listeners.clear()
    vi.stubGlobal('window', {
        parent: {postMessage: (msg:typeof posted[0]['msg'], origin:string) => {
            posted.push({msg, origin})
        }},
        addEventListener: (type:string, fn:(event:unknown) => void) => listeners.set(type, fn),
    })
    vi.resetModules()
    return await import('../src/error_report')
}

/** An Error with a fixed stack, so messages are predictable */
function error_with_stack(message:string, stack:string):Error {
    const error = new Error(message)
    error.stack = stack
    return error
}


describe('report_error', () => {

    beforeEach(() => { vi.unstubAllGlobals() })

    it("targets '*' until the host origin is known, then that origin", async () => {
        const {report_error, set_error_report_origin} = await load()
        report_error(error_with_stack('early', 'at a.js:1'))
        set_error_report_origin('https://host.example')
        report_error(error_with_stack('late', 'at a.js:2'))
        expect(posted).toEqual([
            {msg: {type: 'error', message: 'Error: early\n\nat a.js:1', build: null}, origin: '*'},
            {msg: {type: 'error', message: 'Error: late\n\nat a.js:2', build: null},
                origin: 'https://host.example'},
        ])
    })

    it('sends nothing when not embedded', async () => {
        const {report_error} = await load()
        const self = window as unknown as {parent:unknown}
        self.parent = self
        report_error(new Error('standalone'))
        expect(posted).toEqual([])
    })

    it('formats name, message, stack and context as plain text', async () => {
        const {report_error} = await load()
        const error = error_with_stack('bad', 'stack here')
        error.name = 'TypeError'
        report_error(error, 'Vue: render function')
        report_error('a string')
        report_error({no: 'message'})
        expect(posted.map(p => p.msg.message)).toEqual([
            'TypeError: bad\n\nstack here\n\nVue: render function',
            'NonError: a string',
            'NonError: {"no":"message"}',
        ])
    })

    it('drops aborts and extension errors', async () => {
        const {report_error} = await load()
        report_error(new DOMException('cancelled', 'AbortError'))
        report_error(error_with_stack('x', 'at chrome-extension://abc/inject.js:1'))
        report_error(error_with_stack('x', 'at webkit-masked-url://hidden/:1'))
        expect(posted).toEqual([])
    })

    it('sends each distinct message once, and at most 20 in total', async () => {
        const {report_error} = await load()
        for (let i = 0; i < 30; i++) {
            report_error(error_with_stack('same', 's'))
            report_error(error_with_stack(`n${i}`, 's'))
        }
        expect(posted).toHaveLength(20)
        expect(posted.filter(p => p.msg.message.startsWith('Error: same'))).toHaveLength(1)
    })

    it('never throws, even when posting fails', async () => {
        const {report_error} = await load()
        window.parent.postMessage = () => { throw new Error('detached') }
        expect(() => report_error(error_with_stack('posted', 's'))).not.toThrow()
        // A value whose stringification throws
        expect(() => report_error({toJSON(){ throw new Error('no') }})).not.toThrow()
    })
})


describe('install_error_reports', () => {

    beforeEach(() => { vi.unstubAllGlobals() })

    it('reports uncaught errors and rejections, filtering browser noise', async () => {
        const {install_error_reports} = await load()
        install_error_reports()
        const on_error = listeners.get('error')!
        const on_rejection = listeners.get('unhandledrejection')!

        on_error({message: 'Script error.', error: null, filename: ''})
        on_error({message: 'ResizeObserver loop completed with undelivered notifications.',
            error: null, filename: ''})
        on_error({message: 'x', error: new Error('x'), filename: 'moz-extension://abc/c.js'})
        expect(posted).toEqual([])

        on_error({message: 'Uncaught oops', error: null, filename: 'https://w/app.js',
            lineno: 3, colno: 7})
        on_error({message: 'Uncaught', error: error_with_stack('real', 's'), filename: ''})
        on_rejection({reason: error_with_stack('async', 's')})
        expect(posted.map(p => p.msg.message)).toEqual([
            'Error: Uncaught oops\n\n    at https://w/app.js:3:7',
            'Error: real\n\ns',
            'Error: async\n\ns\n\nUnhandled promise rejection',
        ])
    })
})
