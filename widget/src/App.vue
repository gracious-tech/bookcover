
<template lang="pug">

//- App root — layout shell with sidebar and preview pane

SidebarPanel(:class="{'mobile-hidden': mobile_view !== 'sidebar'}")
PreviewPane(:class="{'mobile-hidden': mobile_view !== 'preview'}")

//- FAB to toggle between sidebar and preview on mobile
UButton.mobile-fab(
    :icon="mobile_view === 'sidebar' ? 'material-symbols:visibility' : 'material-symbols:edit'"
    :aria-label="mobile_view === 'sidebar' ? t('app.fab_show_preview_aria') : t('app.fab_show_sidebar_aria')"
    @click="mobile_view = mobile_view === 'sidebar' ? 'preview' : 'sidebar'"
)

</template>

<script setup lang="ts">

// App root — starts the generator worker, provides form state, renders layout

import {ref, shallowRef, provide} from 'vue'
import {useMediaQuery} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import {load_fonts_prefix, FontsServerError} from 'typst-fonts/web'
import {
    make_form, make_blank_form, FORM_KEY, IS_MOBILE_KEY, FULL_SVG_KEY, GENERATOR_KEY, INIT_ERROR_KEY,
} from './form_state'
import {GeneratorWorkerClient} from './generator_client'
import {fonts_prefix, all_custom_font_bytes} from './fonts'
import {assets_prefix} from './assets'
import {init_embed, embed_seeded} from './embed'
import {fetch_bg_file} from './services/backgrounds'
import {init_image_regions_cache} from './image_regions_cache'
import {init_color_palette_cache} from './color_palette'
import {init_coloris} from './coloris'

import SidebarPanel from './components/sidebar/SidebarPanel.vue'
import PreviewPane from './components/preview/PreviewPane.vue'

// Explicitly register components (suppresses TS unused-import warning for Pug templates)
defineOptions({components: {SidebarPanel, PreviewPane}})

const {t} = useI18n()

// Create reactive form state and provide it to all child components. An embed host that
// seeded the form (preset and/or bg_image) gets a blank base so unset fields come out empty
// rather than leaking demo text/colors; a bare/standalone launch shows the demo cover
const form = embed_seeded.value ? make_blank_form() : make_form()
provide(FORM_KEY, form)
init_image_regions_cache(form)
init_color_palette_cache(form)
init_coloris()

// Wire up the postMessage embed API — no-ops when not running inside an iframe
init_embed(form)

// Load the demo background image for the initial preview — never over a parent-seeded form,
// where an absent image means the cover deliberately has none (icon/pattern/color covers)
if (!embed_seeded.value && !form.bg_image) {
    void fetch_bg_file('beach.jpg').then(file => {
        // Don't clobber an image the user added while the demo one was still downloading
        if (!form.bg_image)
            form.bg_image = file
    })
}

// Mobile breakpoint — matches the 1000px threshold used in CSS
const is_mobile = useMediaQuery('(max-width: 1000px)')
provide(IS_MOBILE_KEY, is_mobile)

// Full print SVG shared from PreviewPane via provide/inject
const full_svg = ref<string | null>(null)
provide(FULL_SVG_KEY, full_svg)

// Mobile view toggle — which panel is visible on narrow viewports
const mobile_view = ref<'sidebar' | 'preview'>('sidebar')

// Generator worker client — null until the worker's WASM compiler has initialised
const generator = shallowRef<GeneratorWorkerClient | null>(null)
provide(GENERATOR_KEY, generator)

// Fatal startup failure (fonts server / WASM init) — PreviewPane shows it instead of a preview
const init_error = ref<string | null>(null)
provide(INIT_ERROR_KEY, init_error)

// Load the font manifest on the main thread too — the worker loads its own copy, but the
// font pickers/previews (get_fonts, register_preview_fonts) resolve against this one.
// A FontsServerError means the fonts server itself isn't answering correctly (e.g. its dev
// server isn't running and something else on the port returned an HTML page) — surface that
// distinctly since it explains why fonts/covers can't work at all
void load_fonts_prefix(fonts_prefix).catch((err:unknown) => {
    console.error(err)
    init_error.value = err instanceof FontsServerError
        ? `The fonts server is not working — it didn't return the font list expected at ${fonts_prefix}/manifest.json, so covers can't be generated.`
        : 'The cover generator failed to start. Check the browser console for details.'
})

// Initialise the WASM compiler in a Web Worker (non-blocking — preview waits on it, and
// compilation runs off the main thread so it never lags the UI)
const client = new GeneratorWorkerClient()
client.init(assets_prefix, fonts_prefix).then(async () => {
    // The worker holds a snapshot of uploaded fonts — PreviewPane re-sends after changes,
    // and this covers any uploads that happened before the worker was ready
    if (all_custom_font_bytes.value.length) {
        await client.set_custom_fonts(all_custom_font_bytes.value)
    }
    generator.value = client
}).catch((err:unknown) => {
    console.error('WASM init failed:', err)
    // The worker fetches the same manifest — don't overwrite a more specific fonts error
    if (!init_error.value) {
        init_error.value = 'The cover generator failed to start. Typst wasm failed to load.'
    }
})

</script>

<style lang="sss" scoped>

/* FAB — only visible on mobile to toggle between sidebar and preview */
.mobile-fab
    display: none

@media (max-width: 1000px)
    .mobile-fab
        display: flex
        align-items: center
        justify-content: center
        position: fixed
        bottom: 20px
        right: 20px
        z-index: 40
        width: 56px
        height: 56px
        border-radius: 9999px
        background: var(--ui-secondary)
        color: black
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25)
        transition: transform 0.15s ease

    .mobile-fab :deep(svg)
        width: 28px
        height: 28px

    .mobile-fab:active
        transform: scale(0.92)

</style>
