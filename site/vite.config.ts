
import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'


// Vite configuration for the public site that fronts the widget
export default defineConfig({
    server: {
        port: 5302,
    },
    plugins: [
        vue(),
    ],
})
