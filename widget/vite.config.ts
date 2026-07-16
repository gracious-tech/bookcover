
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import {nuxt_ui_icons} from './ui_icons'


// Vite configuration for the book cover generator widget
export default defineConfig({
    plugins: [
        ui({
            router: false,
            colorMode: true,
            // Replace Nuxt UI's default lucide icons so the UI only uses Material Symbols
            ui: {
                icons: nuxt_ui_icons,
            },
            // Bundle all UI icons locally (scan finds component usage; the ui.icons overrides
            // must be listed explicitly since auto-inclusion only trusts the default lucide
            // collection) so nothing is fetched from the iconify API at runtime.
            // NOTE: needs @nuxt/ui > 4.9.0 (pinned to a pkg.pr.new build until then)
            icon: {
                clientBundle: {
                    scan: true,
                    icons: Object.values(nuxt_ui_icons),
                },
            },
        }),
        vue(),
    ],
})
