
// A vite plugin that serves this repo's top-level assets/ tree under /generator_assets/
// during development — docs/ (typst templates), backgrounds/ and frames/ (committed),
// fonts/ (see .bin/download_fonts) and typst/ (see .bin/add_typst_version) — mirroring the
// URL layout of the public assets bucket they're deployed to (see .bin/deploy_fonts /
// .bin/deploy_typst)

import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import path from 'node:path'

import type {Plugin} from 'vite'


const URL_PREFIX = '/generator_assets/'

const MIME_TYPES:Record<string, string> = {
    '.json': 'application/json',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',  // Required for WebAssembly.instantiateStreaming()
    // static cover assets (Typst templates, frame/background images, pattern SVGs)
    '.typ': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
}


export default function(root:string):Plugin{
    // Return config for plugin (`root` is the local dir served under the assets URL prefix)

    return {
        name: 'serve-generator-assets',

        configureServer(server){
            server.middlewares.use((req, res, next) => {
                // Only handle requests under the assets URL prefix, pass everything else along
                if (!req.url?.startsWith(URL_PREFIX)){
                    next()
                    return
                }

                // Resolve the requested file, rejecting any attempt to escape the root dir
                const rel_url = decodeURIComponent(
                    req.url.slice(URL_PREFIX.length).split('?')[0] ?? '')
                const file_path = path.join(root, rel_url)
                if (!file_path.startsWith(root + path.sep)){
                    res.statusCode = 403
                    res.end()
                    return
                }

                void stat(file_path).then(() => {
                    res.setHeader('Content-Type',
                        MIME_TYPES[path.extname(file_path)] ?? 'application/octet-stream')
                    // Consumer apps on other localhost ports fetch these cross-origin, and may
                    // be cross-origin-isolated (COEP), so match the production CDN's headers
                    res.setHeader('Access-Control-Allow-Origin', '*')
                    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
                    createReadStream(file_path).pipe(res)
                }).catch(() => {
                    next()
                })
            })
        },

    }
}
