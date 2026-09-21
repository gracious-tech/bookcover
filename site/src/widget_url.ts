
// Where the widget is served from. It has its own bucket, distribution and hostname (see the
// Deployment section in CLAUDE.md), so this is a full cross-origin URL rather than a path.

// Production default — the site is cover.paper.bible, the widget is a sibling hostname
const PROD_WIDGET_URL = 'https://cover-widget.paper.bible'

const DEV_WIDGET_URL = 'http://localhost:5301'

// VITE_WIDGET_URL overrides both, which is how to point the site at a staging stack or a
// widget dev server on another port
export const widget_url:string = import.meta.env.VITE_WIDGET_URL
    || (import.meta.env.DEV ? DEV_WIDGET_URL : PROD_WIDGET_URL)
