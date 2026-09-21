/// <reference types="vite/client" />

// Env vars this app reads, merged into vite's own ImportMetaEnv — see widget_url.ts
interface ImportMetaEnv {
    readonly VITE_WIDGET_URL?:string
}
