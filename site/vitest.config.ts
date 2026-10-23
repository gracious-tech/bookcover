
import {defineConfig} from 'vitest/config'

// Test config kept separate from vite.config.ts, as in widget/: the tests cover the plain TS
// modules, so they need neither the Vue plugin nor the dev server settings
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
})
