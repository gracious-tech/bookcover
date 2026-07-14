
<template lang="pug">

//- App root — layout shell with sidebar and preview pane

SidebarPanel(:class="{'mobile-hidden': mobile_view !== 'sidebar'}")
PreviewPane(:class="{'mobile-hidden': mobile_view !== 'preview'}")

//- FAB to toggle between sidebar and preview on mobile
UButton.mobile-fab(
    :icon="mobile_view === 'sidebar' ? 'material-symbols:visibility' : 'material-symbols:edit'"
    @click="mobile_view = mobile_view === 'sidebar' ? 'preview' : 'sidebar'"
)

</template>

<script setup lang="ts">

// App root — starts the generator worker, provides form state, renders layout

import {ref, shallowRef, provide} from 'vue'
import {useMediaQuery} from '@vueuse/core'
import {load_fonts_prefix} from 'typst-fonts/web'
import {make_form, FORM_KEY, IS_MOBILE_KEY, FULL_SVG_KEY, GENERATOR_KEY} from './form_state'
import {GeneratorWorkerClient} from './generator_client'
import {fonts_prefix, all_custom_font_bytes} from './fonts'
import {init_embed} from './embed'

import SidebarPanel from './components/sidebar/SidebarPanel.vue'
import PreviewPane from './components/preview/PreviewPane.vue'

// Explicitly register components (suppresses TS unused-import warning for Pug templates)
defineOptions({components: {SidebarPanel, PreviewPane}})

// Create reactive form state and provide it to all child components
const form = make_form()
provide(FORM_KEY, form)

// Wire up the postMessage embed API — no-ops when not running inside an iframe
init_embed(form)

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

// Generator assets (typst templates, frames, backgrounds) served via symlink; fonts are
// published separately and resolved via fonts_prefix (see fonts.ts)
const assets_prefix = new URL('/generator_assets/', window.location.href).href

// Load the font manifest on the main thread too — the worker loads its own copy, but the
// font pickers/previews (get_fonts, register_preview_fonts) resolve against this one
void load_fonts_prefix(fonts_prefix).catch((err:unknown) => {
    console.error('Font manifest load failed:', err)
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
