
import {describe, it, expect, vi, afterEach} from 'vitest'

/** Fresh copy of the module under the given env, since it reads import.meta.env once on load */
async function widget_url_with(env:{dev:boolean, override?:string}):Promise<string> {
    vi.stubEnv('DEV', env.dev)
    vi.stubEnv('VITE_WIDGET_URL', env.override ?? '')
    vi.resetModules()
    return (await import('../src/widget_url')).widget_url
}

afterEach(() => { vi.unstubAllEnvs() })


describe('widget_url', () => {

    it('points a production build at the widget\'s own hostname', async () => {
        expect(await widget_url_with({dev: false})).toBe('https://cover-widget.paper.bible')
    })

    it('points the dev server at the widget\'s dev server', async () => {
        expect(await widget_url_with({dev: true})).toBe('http://localhost:5301')
    })

    it('lets VITE_WIDGET_URL override both', async () => {
        const staging = 'https://cover-widget.staging.example'
        expect(await widget_url_with({dev: false, override: staging})).toBe(staging)
        expect(await widget_url_with({dev: true, override: 'http://localhost:6000'}))
            .toBe('http://localhost:6000')
    })

    it('treats an empty override as unset', async () => {
        expect(await widget_url_with({dev: false, override: ''}))
            .toBe('https://cover-widget.paper.bible')
    })
})
