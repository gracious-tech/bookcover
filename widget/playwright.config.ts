
// Playwright config for the widget's browser tests (e2e/). They run against the PRODUCTION
// build served by `vite preview`, since that's where bundling problems show up (chunk splitting,
// the worker format), so build first — .bin/test_e2e does both. The app fetches fonts and the
// typst wasm from https://assets.paper.bible in a production build, so these need network access.

import {defineConfig, devices} from '@playwright/test'

const PORT = 5399

export default defineConfig({
    testDir: 'e2e',
    // The first generate downloads the ~7MB typst wasm and compiles a cover
    timeout: 120_000,
    expect: {timeout: 90_000},
    fullyParallel: true,
    reporter: 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        locale: 'en-US',
    },
    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}},
    ],
    webServer: {
        command: `npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
    },
})
