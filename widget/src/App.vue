
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

// App root — initialises WASM, provides form state, renders layout

import wasm_url from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'
import renderer_wasm_url from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url'
import {init} from 'bookcover-web'
import type {CoverGenerator} from 'bookcover-web'
import {ref, shallowRef, provide} from 'vue'
import {useMediaQuery} from '@vueuse/core'
import {make_form, FORM_KEY, IS_MOBILE_KEY, FULL_SVG_KEY, GENERATOR_KEY} from './form_state'

import SidebarPanel from './components/sidebar/SidebarPanel.vue'
import PreviewPane from './components/preview/PreviewPane.vue'

// Explicitly register components (suppresses TS unused-import warning for Pug templates)
defineOptions({components: {SidebarPanel, PreviewPane}})

// Create reactive form state and provide it to all child components
const form = make_form()
provide(FORM_KEY, form)

// Mobile breakpoint — matches the 1000px threshold used in CSS
const is_mobile = useMediaQuery('(max-width: 1000px)')
provide(IS_MOBILE_KEY, is_mobile)

// Full print SVG shared from PreviewPane via provide/inject
const full_svg = ref<string | null>(null)
provide(FULL_SVG_KEY, full_svg)

// Mobile view toggle — which panel is visible on narrow viewports
const mobile_view = ref<'sidebar' | 'preview'>('sidebar')

// Generator instance — null until WASM init completes
const generator = shallowRef<CoverGenerator | null>(null)
provide(GENERATOR_KEY, generator)

// Generator assets (fonts, typst templates, frames, backgrounds) served via symlink
const assets_prefix = new URL('/generator_assets/', window.location.href).href

// Initialise the WASM compiler and store the generator instance
init({wasm_url, renderer_wasm_url, assets_prefix}).then((gen) => {
    generator.value = gen
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
