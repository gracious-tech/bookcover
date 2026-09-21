<template lang="pug">

//- The cover creator itself, embedded from its own origin

div(class="widget-frame")
    p(v-if="!loaded" class="widget-frame-loading") {{ loading_label }}
    iframe(
        :src="widget_url"
        :title="frame_title"
        class="widget-frame-iframe"
        @load="loaded = true"
    )

</template>

<script setup lang="ts">

// Embeds the widget. Deliberately NOT sandboxed: the widget runs a web worker, compiles
// multi-MB wasm and hands the user a generated PDF to download, and a sandbox missing any one
// of the matching allow-* tokens breaks that silently. It's our own app on a sibling hostname,
// so there's nothing to contain.
//
// It also talks an embed protocol over postMessage (see widget/src/embed.ts) for presetting
// the form and receiving edits back. This site says nothing, which is a valid host: the widget
// waits 300ms for an 'init' that never comes and then mounts standalone. Post one here when
// there's a reason to preset something.

import {ref} from 'vue'
import {widget_url} from '../widget_url'

const loading_label = "Loading the cover creator…"
const frame_title = "Book cover creator"

// Swapped by the iframe's own load event, so the placeholder never outlives the frame
const loaded = ref(false)

</script>

<style lang="sss" scoped>

.widget-frame
    position: relative
    flex: 1
    min-height: 0

/* Fills the frame's box until the load event removes it */
.widget-frame-loading
    position: absolute
    inset: 0
    display: flex
    align-items: center
    justify-content: center
    margin: 0
    color: var(--color-dim)

.widget-frame-iframe
    position: relative
    display: block
    width: 100%
    height: 100%
    border: none

</style>
