
<template lang="pug">

//- 3D book preview canvas with mouse/touch rotation and scroll zoom

div(ref="container_el" class="absolute inset-0 flex items-center justify-center overflow-hidden")
    div(v-if="!has_preview" class="flex flex-col items-center justify-center gap-3 text-dimmed")
        p(class="text-[13px] mt-24") {{ t('common.generating_preview') }}
    canvas#preview-canvas(
        v-show="has_preview"
        ref="canvas_el"
        class="cursor-grab active:cursor-grabbing select-none"
        style="max-width: 100%; max-height: 100%; display: block;"
        @mousedown="on_mouse_down"
        @mousemove="on_mouse_move"
        @mouseup="on_mouse_up"
        @mouseleave="on_mouse_up"
        @touchstart="on_touch_start"
        @touchmove="on_touch_move"
        @touchend="on_touch_end"
        @touchcancel="on_touch_end"
        @wheel.prevent="on_wheel"
    )

</template>

<script setup lang="ts">

// 3D book preview canvas with mouse/touch rotation and scroll zoom

import {ref, watch, onMounted, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import type {Book3DRenderer} from 'bookcover-3d'

const props = defineProps<{
    has_preview:boolean
    zoom:number
}>()

const emit = defineEmits<{(e:'update:zoom', v:number):void}>()

const {t} = useI18n()

// Canvas and container element references
const canvas_el = ref<HTMLCanvasElement | null>(null)
const container_el = ref<HTMLDivElement | null>(null)

// Renderer reference — set by parent via set_renderer()
let renderer:Book3DRenderer | null = null

// Track container size and resize the renderer canvas to fill it
let resize_observer:ResizeObserver | null = null

onMounted(() => {
    resize_observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect
        if (!rect || rect.width < 1 || rect.height < 1)
            return
        apply_container_size(rect.width, rect.height)
    })
    if (container_el.value)
        resize_observer.observe(container_el.value)
})

// Resize the renderer canvas to fit the book within the container and re-render
function apply_container_size(cw:number, ch:number):void {
    if (!renderer)
        return
    const dpr = 2  // Render double size for better quality (especially when using in mockups)
    const book_aspect = renderer.get_projected_aspect()
    const container_aspect = cw / ch
    // Size canvas to the book's projected aspect, fitted within the container
    const w = Math.round((container_aspect > book_aspect ? Math.round(ch * book_aspect) : Math.round(cw)) * dpr)
    const h = Math.round((container_aspect > book_aspect ? Math.round(ch) : Math.round(cw / book_aspect)) * dpr)
    if (renderer.canvas.width !== w || renderer.canvas.height !== h) {
        renderer.resize(w, h)
        do_render(current_az, current_el)
    }
}

// Current camera angles; defaults show front + spine at a gentle tilt
const default_az = -30
const default_el = 20
let current_az = default_az
let current_el = default_el

// Zoom state: camera distance multiplier (1.0 = default; smaller = closer/zoomed-in)
// ZOOM_MIN/MAX here refer to the camera distance range, distinct from the UI zoom range in svg_utils
let current_zoom = 1.0
const CAM_MIN = 0.4
const CAM_MAX = 2.0
const ZOOM_SENS = 0.001

// RAF handle to throttle mouse-driven renders
let raf_id:number | null = null

// Drag state for click-and-drag rotation
let drag_active = false
let drag_start_x = 0
let drag_start_y = 0
let drag_base_az = default_az
let drag_base_el = default_el

// Sensitivity: degrees of rotation per pixel dragged
const AZ_SENS = -0.5
const EL_SENS = 0.3

// Dev mode: #dev in URL hash removes elevation clamp for unrestricted rotation
const dev_mode = location.hash.includes('dev')

/** Copy the renderer's OffscreenCanvas onto the displayed canvas element */
function blit_to_canvas():void {
    if (!canvas_el.value || !renderer)
        return
    const ctx = canvas_el.value.getContext('2d')
    if (!ctx)
        return
    // Set display canvas logical size to match renderer's size (CSS will scale it)
    const el = canvas_el.value
    if (el.width !== renderer.canvas.width || el.height !== renderer.canvas.height) {
        el.width = renderer.canvas.width
        el.height = renderer.canvas.height
    }
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(renderer.canvas, 0, 0)
}

// Base zoom to tighten framing in the 3D view — brings the camera closer without affecting mockups
const BASE_ZOOM = 0.75

/** Render 3D book at the given angles and copy result to the display canvas */
function do_render(az:number, el:number):void {
    if (!renderer)
        return
    renderer.render(az, el, current_zoom * BASE_ZOOM)
    blit_to_canvas()
}

// Mouse down: begin drag, record starting position and current angles
function on_mouse_down(e:MouseEvent):void {
    drag_active = true
    drag_start_x = e.clientX
    drag_start_y = e.clientY
    drag_base_az = current_az
    drag_base_el = current_el
}

// Mouse move: update angles based on drag delta and re-render via RAF
function on_mouse_move(e:MouseEvent):void {
    if (!drag_active)
        return
    current_az = drag_base_az + (e.clientX - drag_start_x) * AZ_SENS
    // Clamp elevation to 45° range (±45°) — prevents near-vertical/top-down viewing
    const new_el = drag_base_el - (e.clientY - drag_start_y) * EL_SENS
    current_el = dev_mode ? new_el : Math.max(-45, Math.min(45, new_el))

    // Throttle to one render per animation frame
    if (raf_id === null)
        raf_id = requestAnimationFrame(() => {
            raf_id = null
            do_render(current_az, current_el)
        })
}

// Mouse up / leave: end drag, keep current angle
function on_mouse_up():void {
    drag_active = false
}

// Touch start: begin drag from first touch point
function on_touch_start(e:TouchEvent):void {
    if (e.touches.length !== 1)
        return
    drag_active = true
    drag_start_x = e.touches[0].clientX
    drag_start_y = e.touches[0].clientY
    drag_base_az = current_az
    drag_base_el = current_el
}

// Touch move: update angles from touch delta, same logic as mouse move
function on_touch_move(e:TouchEvent):void {
    if (!drag_active || e.touches.length !== 1)
        return
    // Prevent page scroll while rotating
    e.preventDefault()

    current_az = drag_base_az + (e.touches[0].clientX - drag_start_x) * AZ_SENS
    const new_el = drag_base_el - (e.touches[0].clientY - drag_start_y) * EL_SENS
    current_el = dev_mode ? new_el : Math.max(-45, Math.min(45, new_el))

    if (raf_id === null)
        raf_id = requestAnimationFrame(() => {
            raf_id = null
            do_render(current_az, current_el)
        })
}

// Touch end / cancel: end drag
function on_touch_end():void {
    drag_active = false
}

// Scroll wheel: zoom in/out by adjusting camera distance multiplier, then sync to parent
function on_wheel(e:WheelEvent):void {
    current_zoom = Math.max(CAM_MIN, Math.min(CAM_MAX, current_zoom + e.deltaY * ZOOM_SENS))
    emit('update:zoom', 1.0 / current_zoom)
    if (raf_id === null)
        raf_id = requestAnimationFrame(() => {
            raf_id = null
            do_render(current_az, current_el)
        })
}

// Sync camera distance when parent zoom prop changes (slider or reset), guard against scroll-wheel echo
watch(() => props.zoom, (z) => {
    const new_cam = Math.max(CAM_MIN, Math.min(CAM_MAX, 1.0 / z))
    if (Math.abs(new_cam - current_zoom) < 0.001)
        return
    current_zoom = new_cam
    do_render(current_az, current_el)
})

/** Store the renderer reference, size canvas to container, and trigger an initial render */
function set_renderer(r:Book3DRenderer):void {
    renderer = r
    if (container_el.value) {
        const rect = container_el.value.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0)
            apply_container_size(rect.width, rect.height)
    }
    do_render(current_az, current_el)
}

/** Get the current renderer (for photo mode compositing) */
function get_renderer():Book3DRenderer | null {
    return renderer
}

// Clean up RAF and ResizeObserver on unmount
onUnmounted(() => {
    if (raf_id !== null)
        cancelAnimationFrame(raf_id)
    resize_observer?.disconnect()
    resize_observer = null
})

/** Return the current 3D view as a PNG blob */
async function get_blob():Promise<Blob | null> {
    if (!canvas_el.value) return null
    return new Promise<Blob>((resolve) => {
        canvas_el.value!.toBlob((b) => resolve(b!), 'image/png')
    })
}

defineExpose({set_renderer, get_renderer, get_blob})

</script>
