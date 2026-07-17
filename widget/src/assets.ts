
// Where the shared static assets tree (typst templates in docs/, backgrounds, frames) is
// served from. The tree is managed in this repo at assets/ — in production it's fetched from
// the public assets bucket, and in dev the widget's own vite server serves it (see
// vite_plugin_assets.ts). Absolute in dev too since the generator worker fetches against
// this prefix.
export const assets_prefix = import.meta.env.PROD
    ? 'https://assets.paper.bible/'
    : new URL('/generator_assets/', window.location.href).href
