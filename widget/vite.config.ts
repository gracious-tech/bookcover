
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'


// Vite configuration for the book cover generator widget
export default defineConfig({
    plugins: [
        ui({
            router: false,
            colorMode: true,
            icon: {
                provider: 'none',  // Prevent remote icon requests
            },
        }),
        vue(),
    ],
})
