
import {defineConfig} from 'vitest/config'

// Test config kept separate from vite.config.ts on purpose: the app build loads the Nuxt UI
// plugin (icon bundling, color mode) and the assets dev server, none of which the tests here
// need — they cover the plain TS modules, not the Vue components
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
})
