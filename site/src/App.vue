<template lang="pug">

//- Page shell. Everything but the frame is placeholder chrome — it exists so the deployed
//- site has a shape to flesh out, not because this is the intended design.

div(class="page")

    header(class="page-header")
        img(class="page-logo" src="/icon.png" alt="" width="28" height="28")
        div
            h1(class="page-title") Book Cover Creator
            p(class="page-tagline") Create professional looking book covers in minutes, for free.

    WidgetFrame

</template>

<script setup lang="ts">

// Root layout — a slim header above the embedded widget, which takes the remaining height

import WidgetFrame from './components/WidgetFrame.vue'

</script>

<style lang="sss" scoped>

.page
    display: flex
    flex-direction: column
    height: 100%

.page-header
    display: flex
    align-items: center
    gap: 12px
    flex: none
    padding: 10px 16px
    border-bottom: 1px solid var(--color-border)
    background: var(--color-surface)

.page-logo
    flex: none

.page-title
    margin: 0
    font-size: 15px
    font-weight: 600
    line-height: 1.3

.page-tagline
    margin: 0
    font-size: 13px
    line-height: 1.3
    color: var(--color-dim)

/* The tagline is the first thing to go — the title alone carries a narrow header */
@media (max-width: 560px)
    .page-tagline
        display: none

</style>
