
// Playwright config for the widget's browser tests (e2e/). They run against the PRODUCTION
// build served by `vite preview`, since that's where bundling problems show up (chunk splitting,
// the worker format), so build first — .bin/test_e2e does both. The app fetches fonts and the
// typst wasm from https://assets.paper.bible in a production build, so these need network access.

import {defineConfig, devices} from '@playwright/test'
import {COVERAGE, COVERAGE_BUILD_DIR, chromium_args} from './e2e/coverage'

const PORT = 5399

// A coverage run (.bin/coverage, see e2e/coverage.ts) serves its own source-mapped build
const PREVIEW_DIR = COVERAGE ? ` --outDir ${JSON.stringify(COVERAGE_BUILD_DIR)}` : ''

export default defineConfig({
    testDir: 'e2e',
    // The first generate downloads the ~7MB typst wasm and compiles a cover
    timeout: 120_000,
    expect: {timeout: 90_000},
    fullyParallel: true,
    // In CI (where these gate deploys, see .github/workflows/test.yml) a stray test.only fails
    // the run, and one retry absorbs a network blip on the assets bucket. Playwright still
    // reports a test that only passed on retry as flaky
    forbidOnly: !!process.env['CI'],
    retries: process.env['CI'] ? 1 : 0,
    reporter: 'list',
    globalTeardown: './e2e/coverage.ts',
    use: {
        baseURL: `http://localhost:${PORT}`,
        locale: 'en-US',
        launchOptions: {args: chromium_args()},
    },
    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}},
    ],
    webServer: {
        command: `npx vite preview --port ${PORT} --strictPort${PREVIEW_DIR}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
    },
})
