
<template lang="pug">

//- Split view — panels wrap, each at natural print size (or 100% width if narrower)

div(:class="['absolute inset-0 overflow-auto p-6 flex items-start', is_mobile ? 'justify-start' : 'justify-center']" @wheel="on_wheel")
    div(
        :style="is_mobile ? {width: (props.zoom * 100) + '%'} : {zoom: props.zoom}"
        :class="is_mobile ? 'shrink-0 flex flex-col gap-6' : 'flex flex-col gap-6 shrink-0'"
    )
        div(
            v-for="panel in panels"
            :key="panel.face"
            class="flex flex-col items-center gap-2"
        )
            img(
                :src="svg_data_url(panel.svg)"
                :class="['shadow-lg', is_mobile ? 'max-w-full' : '']"
                :alt="panel.face"
            )
            span(class="text-xs font-mono uppercase tracking-widest text-muted") {{ t(`preview_split.face_${panel.face}`) }}

</template>

<script setup lang="ts">

// Split view — shows front, back, and spine panels as separate images

import {computed, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {svg_data_url, ZOOM_SENS} from '../../svg_utils'
import {IS_MOBILE_KEY} from '../../form_state'

const is_mobile = inject(IS_MOBILE_KEY)!
const {t} = useI18n()

const props = defineProps<{
    split_svgs:{front:string, back:string, spine:string | undefined} | null
    zoom:number
    zoom_min:number
    zoom_max:number
}>()

const emit = defineEmits<{
    'update:zoom': [value:number]
}>()

// Ctrl+scroll zooms the view
function on_wheel(e:WheelEvent) {
    if (!e.ctrlKey)
        return
    e.preventDefault()
    emit('update:zoom', Math.max(props.zoom_min, Math.min(props.zoom_max, props.zoom - e.deltaY * ZOOM_SENS)))
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
