
<template lang="pug">

//- Full view — complete spread at print size, fills width if narrower

div(
    ref="container_ref"
    class="absolute inset-0 overflow-auto p-6 flex items-start"
    :class="{'cursor-grabbing': dragging, 'cursor-grab': !dragging}"
    @wheel="on_wheel"
    @pointerdown="on_pointer_down"
    @pointermove="on_pointer_move"
    @pointerup="on_pointer_up"
    @pointercancel="on_pointer_up"
)
    div(
        :style="is_mobile ? {width: (props.zoom * 100) + '%'} : {zoom: props.zoom}"
        :class="is_mobile ? 'shrink-0' : 'shrink-0 mx-auto'"
    )
        div(v-if="full_svg" class="relative" :class="is_mobile ? 'block' : 'inline-block'")
            img(
                :src="svg_data_url(full_svg)"
                :class="['block shadow-lg select-none', is_mobile ? 'max-w-full' : '']"
                draggable="false"
                :alt="t('preview_full.alt_full_cover')"
            )
            //- Trim line overlay — dashed border at the bleed boundary
            div(
                v-if="trim_inset"
                class="absolute pointer-events-none border border-dashed border-red-500/60"
                :style="{left: trim_inset.x + '%', top: trim_inset.y + '%', right: trim_inset.x + '%', bottom: trim_inset.y + '%'}"
            )

</template>

<script setup lang="ts">

// Full cover view — shows the complete spread with trim line overlay

import {ref, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {svg_data_url, ZOOM_SENS} from '../../svg_utils'
import {IS_MOBILE_KEY} from '../../form_state'

const is_mobile = inject(IS_MOBILE_KEY)!
const {t} = useI18n()

const props = defineProps<{
    full_svg:string | null
    trim_inset:{x:number, y:number} | null
    zoom:number
    zoom_min:number
    zoom_max:number
}>()

const emit = defineEmits<{
    'update:zoom': [value:number]
}>()

const container_ref = ref<HTMLElement | null>(null)
const dragging = ref(false)
let drag_start_x = 0
let drag_start_y = 0
let scroll_start_x = 0
let scroll_start_y = 0

// Ctrl+scroll zooms; otherwise redirect vertical wheel to horizontal scroll
function on_wheel(e:WheelEvent) {
    if (e.ctrlKey) {
        e.preventDefault()
        emit('update:zoom', Math.max(props.zoom_min, Math.min(props.zoom_max, props.zoom - e.deltaY * ZOOM_SENS)))
        return
    }
    const el = container_ref.value
    if (!el) {
        return
    }
    // If content overflows vertically, let the browser handle scroll normally
    if (el.scrollHeight > el.clientHeight) {
        return
    }
    e.preventDefault()
    el.scrollLeft += e.deltaX || e.deltaY
}

// Grab-to-pan: pointer down starts drag
function on_pointer_down(e:PointerEvent) {
    const el = container_ref.value
    if (!el) {
        return
    }
    dragging.value = true
    drag_start_x = e.clientX
    drag_start_y = e.clientY
    scroll_start_x = el.scrollLeft
    scroll_start_y = el.scrollTop
    el.setPointerCapture(e.pointerId)
}

// Grab-to-pan: pointer move updates scroll position
function on_pointer_move(e:PointerEvent) {
    if (!dragging.value || !container_ref.value) {
        return
    }
    container_ref.value.scrollLeft = scroll_start_x - (e.clientX - drag_start_x)
    container_ref.value.scrollTop = scroll_start_y - (e.clientY - drag_start_y)
}

// Grab-to-pan: pointer up ends drag
function on_pointer_up() {
    dragging.value = false
}

</script>
