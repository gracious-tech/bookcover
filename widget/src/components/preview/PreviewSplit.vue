
<template lang="pug">

//- Split view — panels wrap, each at natural print size (or 100% width if narrower)

div(class="absolute inset-0 overflow-auto p-6 flex justify-center items-start" @wheel="on_wheel")
    div(:style="{zoom: props.zoom}" class="flex flex-col gap-6 shrink-0")
        div(
            v-for="panel in panels"
            :key="panel.face"
            class="flex flex-col items-center gap-2"
        )
            img(
                :src="svg_data_url(panel.svg)"
                class="shadow-lg"
                :alt="panel.face"
            )
            span(class="text-xs font-mono uppercase tracking-widest text-muted") {{ panel.face }}

</template>

<script setup lang="ts">

// Split view — shows front, back, and spine panels as separate images

import {computed} from 'vue'
import {svg_data_url, ZOOM_MIN, ZOOM_MAX, ZOOM_SENS} from '../../svg_utils'

const props = defineProps<{
    split_svgs:{front:string, back:string, spine:string | undefined} | null
    zoom:number
}>()

const emit = defineEmits<{
    'update:zoom': [value:number]
}>()

// Ctrl+scroll zooms the view
function on_wheel(e:WheelEvent) {
    if (!e.ctrlKey)
        return
    e.preventDefault()
    emit('update:zoom', Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, props.zoom - e.deltaY * ZOOM_SENS)))
}

/** Ordered panels: front, back, spine (if present) */
const panels = computed(() => {
    if (!props.split_svgs)
        return []
    const {front, back, spine} = props.split_svgs
    return [
        {face: 'front', svg: front},
        {face: 'back', svg: back},
        ...(spine ? [{face: 'spine', svg: spine}] : []),
    ]
})

</script>
