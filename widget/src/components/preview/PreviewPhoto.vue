
<template lang="pug">

//- Photo mode — composited book on a background photo

div(class="absolute inset-0 flex items-center justify-center overflow-hidden p-4")
    div(v-if="!has_preview" class="flex flex-col items-center justify-center gap-3 text-dimmed")
        p(class="text-[13px]") {{ t('common.generating_preview') }}
    canvas#photo-canvas(
        v-show="has_preview"
        ref="photo_canvas_el"
        :style="{maxWidth: '100%', maxHeight: '100%', display: 'block', transform: `scale(${props.zoom})`, transformOrigin: 'center'}"
        @wheel.prevent="on_wheel"
    )

</template>

<script setup lang="ts">

// Photo mode — composites the 3D book onto a background photograph

import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {BACKGROUNDS} from 'bookcover-3d-web'
import type {Book3DRenderer} from 'bookcover-3d-web'
import {make_zoom_wheel_handler} from '../../svg_utils'

const props = defineProps<{
    has_preview:boolean
    photo_bg_urls:Record<string, string>
    zoom:number
}>()

const emit = defineEmits<{(e:'update:zoom', v:number):void}>()

const {t} = useI18n()

const on_wheel = make_zoom_wheel_handler(() => props.zoom, (v) => emit('update:zoom', v))

// Photo canvas element
const photo_canvas_el = ref<HTMLCanvasElement | null>(null)

// Currently selected background
const photo_bg_id = ref(BACKGROUNDS[0].id)

/** Switch the active background and re-render the photo composite */
function select_photo_bg(id:string):void {
    photo_bg_id.value = id
    render(null)
}

/** Load the selected background and composite the book onto it */
async function render(renderer:Book3DRenderer | null):Promise<void> {
    if (!renderer || !photo_canvas_el.value)
        return
    const url = props.photo_bg_urls[photo_bg_id.value]
    if (!url)
        return

    // Look up per-background camera/scale overrides
    const bg_meta = BACKGROUNDS.find(b => b.id === photo_bg_id.value)
    const blob = await fetch(url).then(r => r.blob())
    const bg_bmp = await createImageBitmap(blob)
    const result = await renderer.composite_photo(bg_bmp, bg_meta)
    bg_bmp.close()

    // Blit composite result to the photo canvas
    const canvas = photo_canvas_el.value
    canvas.width = result.width
    canvas.height = result.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(result, 0, 0)
    result.close()
}

/** Get the current background ID */
function get_bg_id():string {
    return photo_bg_id.value
}

/** Return the current photo composite as a PNG blob */
async function get_blob():Promise<Blob | null> {
    if (!photo_canvas_el.value) return null
    return new Promise<Blob>((resolve) => {
        photo_canvas_el.value!.toBlob((b) => resolve(b!), 'image/png')
    })
}

defineExpose({render, select_photo_bg, get_bg_id, get_blob})

</script>
