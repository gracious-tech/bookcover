
<template lang="pug">

//- Reference width lines for common paper sizes, rendered at physical scale

div(class="flex flex-col items-center gap-3 bg-black/60 backdrop-blur-sm rounded-xl px-6 py-4")
    div(
        v-for="line in lines"
        :key="line.label"
        class="flex flex-col items-center"
        :style="{width: line.px + 'px'}"
    )
        div(class="w-full h-0 border-t-2 border" :class="line.color")
        span(class="text-xs text-white/80 mt-1 whitespace-nowrap") {{ line.label }}
    p(v-if="overflows" class="text-xs text-amber-400 text-center") {{ t('paper_scale.overflow_warning') }}
    p(class="text-xs text-white/60 text-center")
        | {{ t('paper_scale.instructions_1') }}
        br
        | {{ t('paper_scale.instructions_2') }}

</template>

<script setup lang="ts">

// Shows horizontal lines at paper-width scale.
// SVGs use pt (Typst's SVG output) → browsers render at 96 CSS px per inch.

import {computed} from 'vue'
import {useWindowSize} from '@vueuse/core'
import {useI18n} from 'vue-i18n'

const props = defineProps<{
    zoom:number
    cover_width_mm:number
}>()

const {t} = useI18n()

// Paper widths in inches
const A4_WIDTH_IN = 210 / 25.4
const US_LETTER_WIDTH_IN = 8.5

// 96 CSS px per inch
const px_per_in = computed(() => 96 * props.zoom)

const {width: vw} = useWindowSize()

// Each line at absolute pixel width
const lines = computed(() => [
    {
        label: t('paper_scale.a4_label'),
        px: A4_WIDTH_IN * px_per_in.value,
        color: 'border-blue-400/80',
    },
    {
        label: t('paper_scale.us_letter_label'),
        px: US_LETTER_WIDTH_IN * px_per_in.value,
        color: 'border-amber-400/80',
    },
])

// True if any line exceeds the viewport width (accounting for container padding)
const overflows = computed(() => lines.value.some(l => l.px + 48 > vw.value))

</script>
