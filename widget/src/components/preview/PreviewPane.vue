
<template lang="pug">

//- Preview pane with toolbar and content area

div.preview-panel(class="flex-1 flex flex-col overflow-hidden bg-(--ui-color-neutral-200) dark:bg-(--ui-color-neutral-900) min-w-0")
    div(class="bg-(--ui-bg-elevated) border-b border-(--ui-border) shrink-0")
        //- Main toolbar row
        div(class="flex items-center px-3.5 py-2.5 gap-2.5")
            div(class="flex flex-1 items-center gap-1")
                //- Color mode toggle — switches between light and dark
                UButton(
                    :icon="is_dark ? 'material-symbols:dark-mode' : 'material-symbols:light-mode'"
                    color="neutral"
                    variant="ghost"
                    class="cursor-pointer"
                    :aria-label="`Switch to ${is_dark ? 'light' : 'dark'} mode`"
                    @click="toggle_color_mode"
                )
                //- Zoom control — per-view zoom level with vertical slider
                UPopover(v-model:open="show_zoom" :content="{side: 'bottom', align: 'start'}")
                    UButton(
                        icon="material-symbols:zoom-in"
                        color="neutral"
                        variant="ghost"
                        class="cursor-pointer"
                        :aria-label="`Zoom: ${Math.round(zoom_per_view[view_mode] * 100)}%`"
                    )
                    template(#content)
                        div(class="flex flex-col items-center gap-2 p-3")
                            LogSlider(
                                :modelValue="zoom_per_view[view_mode]"
                                :min="zoom_min"
                                :max="zoom_max"
                                log
                                instant
                                :format="fmt_zoom"
                                orientation="vertical"
                                class="h-60"
                                @update:modelValue="zoom_per_view[view_mode] = $event"
                            )
                            UButton(
                                label="1×"
                                size="xs"
                                color="neutral"
                                variant="outline"
                                class="cursor-pointer font-mono"
                                @click="zoom_per_view[view_mode] = 1.0"
                            )
            //- View mode toggle: 3D / Photo / Split panels / Full cover
            //- Desktop: button group; mobile: compact select dropdown
            USelect(
                v-if="is_mobile"
                v-model="view_mode"
                :items="view_mode_items"
                class="min-w-26"
            )
            div(v-else class="flex items-center")
                UButton(
                    v-for="(m, i) in VIEW_MODES"
                    :key="m.id"
                    :label="m.label"
                    :variant="view_mode === m.id ? 'solid' : 'outline'"
                    color="neutral"
                    size="xl"
                    :class="['cursor-pointer rounded-none! -ml-px first:ml-0', i === 0 ? 'rounded-l-md!' : '', i === VIEW_MODES.length - 1 ? 'rounded-r-md!' : '', view_mode === m.id ? 'z-1' : '']"
                    @click="view_mode = m.id"
                )

            div(class="flex flex-1 items-center justify-end gap-2")
                //- Context-sensitive save button — output depends on active view mode
                UButton(
                    v-if="has_preview"
                    :label="is_mobile ? undefined : save_label"
                    :icon="is_mobile ? 'material-symbols:image' : undefined"
                    color="neutral"
                    :variant="is_mobile ? 'ghost' : 'outline'"
                    class="cursor-pointer"
                    :loading="is_saving"
                    :disabled="is_saving"
                    @click="save_image"
                )
                //- Export PDF (single) or Export PDFs (split parts as zip)
                UButton(
                    :icon="is_mobile ? 'material-symbols:draft' : undefined"
                    color="primary"
                    variant='solid'
                    class="cursor-pointer"
                    :disabled="!is_ready || is_exporting"
                    :loading="is_exporting"
                    @click="view_mode === 'split' ? export_split_pdfs() : export_pdf()"
                )
                    template(v-if="!is_mobile") {{ view_mode === 'split' ? 'Export PDFs' : 'Export PDF' }}
                //- Fallback download icon — redownloads whatever was last saved/exported
                UButton(
                    v-if="last_url"
                    as="a"
                    :href="last_url"
                    :download="last_filename"
                    icon="material-symbols:download"
                    color="warning"
                    variant="soft"
                    class="cursor-pointer"
                    aria-label="Download last file"
                )

        //- Background thumbnail strip — only visible in photo mode, centred below the toolbar row
        div(v-show="view_mode === 'photo'" class="flex justify-center gap-2 px-4 pb-3 overflow-x-auto")
            img(
                v-for="bg in BACKGROUNDS"
                :key="bg.id"
                :src="photo_bg_urls[bg.id]"
                class="cursor-pointer flex-1 basis-0 min-w-12 max-w-20 aspect-10/7 object-cover rounded-xl shadow-sm transition-all border-2 border-transparent"
                :class="preview_photo_ref?.get_bg_id() === bg.id ? 'border-primary!' : 'opacity-70 hover:opacity-100'"
                @click="on_photo_bg_click(bg.id)"
            )

    //- Preview area — switches between 3D, split panel, and full SVG views
    div(class="flex-1 relative overflow-hidden")

        //- Input error panel: shown instead of preview when generation fails
        div(
            v-if="preview_error"
            class="absolute inset-0 flex items-center justify-center p-8"
        )
            div(class="flex flex-col items-center gap-3 text-center max-w-lg")
                svg(width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="text-muted shrink-0")
                    path(d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z")
                    line(x1="12" y1="9" x2="12" y2="13")
                    line(x1="12" y1="17" x2="12.01" y2="17")
                p(class="text-lg whitespace-pre-line text-muted") {{ preview_error }}

        //- First-load spinner: shown while generating with no existing preview yet
        div(
            v-if="is_generating && !has_preview && !preview_error"
            class="absolute inset-0 flex items-center justify-center"
        )
            div(class="w-10 h-10 rounded-full border-4 border-(--ui-border) border-t-(--ui-text-muted) animate-spin")

        //- Stale-render overlay: spinner shown while re-generating an existing preview
        Transition(name="fade")
            div(
                v-if="is_generating && has_preview && !preview_error"
                class="absolute inset-0 z-10 flex items-center justify-center bg-black/20 pointer-events-none"
            )
                div(class="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin")

        //- Export error banner: non-blocking, floats over the preview
        Transition(name="fade")
            div(
                v-if="export_error"
                class="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-red-600 text-white text-sm px-4 py-2 rounded shadow-lg pointer-events-none"
            )
                span {{ export_error }}

        //- 3D canvas — kept in DOM at all times to preserve the WebGL renderer state
        Preview3D(
            v-show="view_mode === '3d' && !preview_error"
            ref="preview_3d_ref"
            :has_preview="has_preview"
            v-model:zoom="zoom_per_view['3d']"
        )

        //- Photo mode — composited book on a background photo
        PreviewPhoto(
            v-show="view_mode === 'photo' && !preview_error"
            ref="preview_photo_ref"
            :has_preview="has_preview"
            :photo_bg_urls="photo_bg_urls"
            v-model:zoom="zoom_per_view['photo']"
        )

        //- Split view — individual face SVGs
        PreviewSplit(
            v-show="view_mode === 'split' && !preview_error"
            :split_svgs="split_svgs"
            :zoom_min="zoom_min"
            :zoom_max="zoom_max"
            v-model:zoom="zoom_per_view['split']"
        )

        //- Full view — complete spread at print size
        PreviewFull(
            v-show="view_mode === 'full' && !preview_error"
            :full_svg="full_svg"
            :trim_inset="trim_inset"
            :zoom_min="zoom_min"
            :zoom_max="zoom_max"
            v-model:zoom="zoom_per_view['full']"
        )

        //- Paper scale reference lines — fixed to bottom of viewport when zoom popover is open
        Teleport(to="body")
            Transition(name="fade")
                div(
                    v-if="show_zoom && show_scale_lines && cover_width_mm"
                    class="paper-scale-lines fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-6"
                )
                    PaperScaleLines(:zoom="zoom_per_view[view_mode]" :cover_width_mm="cover_width_mm")

</template>

<script setup lang="ts">

// Preview pane — toolbar, generation logic, and preview mode orchestration

import {Book3DRenderer, BACKGROUNDS} from 'bookcover-3d'
import type {CoverType} from 'bookcover-3d'

// Background photo URLs — imported as Vite asset references so they get hashed/served correctly
import url_coffee_table from '../../../../3d/src/backgrounds/coffee_table.jpg?url'
import url_table_side from '../../../../3d/src/backgrounds/table_side.jpg?url'
import url_table_with_book from '../../../../3d/src/backgrounds/table_with_book.jpg?url'
import url_table_with_laptop from '../../../../3d/src/backgrounds/table_with_laptop.jpg?url'
import url_wood from '../../../../3d/src/backgrounds/wood.jpg?url'

const photo_bg_urls:Record<string, string> = {
    coffee_table: url_coffee_table,
    table_side: url_table_side,
    table_with_book: url_table_with_book,
    table_with_laptop: url_table_with_laptop,
    wood: url_wood,
}

import {ref, watch, inject, computed, reactive, onUnmounted} from 'vue'
import {useDark} from '@vueuse/core'
import {zipSync} from 'fflate'
import {get_service, get_custom_dimensions} from 'printing-services'
import type {BindingTypeId, SizeId, CustomSize} from 'printing-services'
import {FORM_KEY, IS_MOBILE_KEY, FULL_SVG_KEY, GENERATOR_KEY} from '../../form_state'
import {build_schema, read_image, read_image_preview} from '../../schema'
import {all_custom_font_bytes} from '../../fonts'
import {debounce} from '../../svg_utils'
import {modal_open_count} from '../../modal_state'

import LogSlider from '../LogSlider.vue'
import Preview3D from './Preview3D.vue'
import PreviewPhoto from './PreviewPhoto.vue'
import PreviewSplit from './PreviewSplit.vue'
import PreviewFull from './PreviewFull.vue'
import PaperScaleLines from './PaperScaleLines.vue'

// Explicitly register components (suppresses TS unused-import warning for Pug templates)
defineOptions({components: {Preview3D, PreviewPhoto, PreviewSplit, PreviewFull, PaperScaleLines}})

// Inject the generator instance (null until WASM init completes)
const generator = inject(GENERATOR_KEY)!
const is_ready = computed(() => generator.value !== null)

// Inject the shared form state
const form = inject(FORM_KEY)!

// Template refs for child preview components
const preview_3d_ref = ref<InstanceType<typeof Preview3D> | null>(null)
const preview_photo_ref = ref<InstanceType<typeof PreviewPhoto> | null>(null)

// Dark mode toggle — useDark syncs with the .dark class on <html> (used by Nuxt UI)
const is_dark = useDark()
const is_mobile = inject(IS_MOBILE_KEY)!

/** Toggle between light and dark mode */
function toggle_color_mode():void {
    is_dark.value = !is_dark.value
}

// UI state refs
const is_generating = ref(false)
const is_exporting = ref(false)
const is_saving = ref(false)
const has_preview = ref(false)
const preview_error = ref<string | null>(null)
const export_error = ref<string | null>(null)

// Last download blob URL + filename — kept alive for the fallback download icon
const last_url = ref<string | null>(null)
const last_filename = ref('')

/** Revoke and clear the last object URL */
function revoke_last_url():void {
    if (last_url.value) {
        URL.revokeObjectURL(last_url.value)
        last_url.value = null
    }
}

/** Auto-trigger a download and keep the URL alive for the fallback icon */
function trigger_download(blob:Blob, filename:string):void {
    revoke_last_url()
    last_url.value = URL.createObjectURL(blob)
    last_filename.value = filename
    const a = document.createElement('a')
    a.href = last_url.value
    a.download = filename
    a.click()
}

// View mode: '3d' for 3D preview, 'photo' for mockup, 'split' for panels, 'full' for spread
type ViewMode = '3d' | 'photo' | 'split' | 'full'

// Zoom level per view — persisted independently when switching views
const zoom_per_view = reactive<Record<ViewMode, number>>({'3d': 1.0, photo: 1.0, split: 1.0, full: 1.0})

// Zoom popover visibility
const show_zoom = ref(false)

// Format zoom multiplier as percentage for the slider label
const fmt_zoom = (v:number) => Math.round(v * 100) + '%'

// Scale lines only shown in views that render at physical size
const show_scale_lines = computed(() => view_mode.value === 'split' || view_mode.value === 'full')

// On mobile, full/split views fit to width at zoom=1, so zooming out is meaningless
const zoom_min = computed(() => is_mobile.value && show_scale_lines.value ? 1.0 : 0.5)
const zoom_max = computed(() => is_mobile.value && show_scale_lines.value ? 3.0 : 2.0)

// Keep split and full zoom in sync — both render at physical size
watch(() => zoom_per_view.split, (v) => { zoom_per_view.full = v })
watch(() => zoom_per_view.full, (v) => { zoom_per_view.split = v })


// Detect WebGL — renderer falls back to DOM canvas, so check both
const webgl_available = (() => {
    try {
        const offscreen = new OffscreenCanvas(1, 1)
        if (offscreen.getContext('webgl'))
            return true
    } catch { /* OffscreenCanvas not supported */ }
    const dom = document.createElement('canvas')
    return !!(dom.getContext('webgl2') || dom.getContext('webgl'))
})()

const ALL_VIEW_MODES:{id:ViewMode, label:string}[] = [
    {id: '3d', label: '3D'},
    {id: 'photo', label: 'Mockup'},
    {id: 'split', label: 'Parts'},
    {id: 'full', label: 'Print'},
]
// Hide 3D and photo modes when WebGL is unavailable
const VIEW_MODES = webgl_available
    ? ALL_VIEW_MODES
    : ALL_VIEW_MODES.filter(m => m.id !== '3d' && m.id !== 'photo')
// Items formatted for USelect (mobile dropdown)
const view_mode_items = VIEW_MODES.map(m => ({label: m.label, value: m.id}))
const view_mode = ref<ViewMode>(webgl_available ? '3d' : 'split')
const split_svgs = ref<{front:string, back:string, spine:string | undefined} | null>(null)

/** Label for the save button based on active view mode */
const save_label = computed(() => ({
    '3d': 'Save 3D Image',
    photo: 'Save Mockup',
    split: 'Save Images',
    full: 'Save Image',
}[view_mode.value]))
const full_svg = inject(FULL_SVG_KEY)!

// Convert a value to mm based on the form's custom unit
function form_to_mm(v:number):number {
    return form.custom_unit === 'inch' ? v * 25.4 : v
}

/** Compute cover dimensions from the current form state */
function compute_dims() {
    const unit = form.custom_unit as 'mm' | 'inch'
    if (form.service_id === 'custom') {
        const size:SizeId | {width:number, height:number} = form.size_id
            ? form.size_id as SizeId
            : {width: form_to_mm(form.custom_trim_width), height: form_to_mm(form.custom_trim_height)}
        return get_custom_dimensions({
            unit: 'mm', size,
            bleed: form_to_mm(form.custom_bleed),
            spine: form_to_mm(form.custom_spine),
        })
    }
    const service = get_service(form.service_id as Parameters<typeof get_service>[0])
    const size:SizeId | CustomSize = form.size_id
        ? form.size_id as SizeId
        : {width: form.custom_trim_width, height: form.custom_trim_height, unit}
    return service.get_dimensions({
        size, pages: form.page_count,
        binding_type: form.binding_type as BindingTypeId,
        unit: 'mm',
    })
}

/** Trim line position as a percentage of total cover dimensions, for the overlay in full view */
const trim_inset = computed(() => {
    try {
        const dims = compute_dims()
        const bleed = dims.cover_bleed.toNumber()
        if (!bleed)
            return null
        return {
            x: bleed / dims.cover_total_width.toNumber() * 100,
            y: bleed / dims.cover_total_height.toNumber() * 100,
        }
    } catch {
        return null
    }
})

/** Total cover width in mm, for paper-scale reference lines */
const cover_width_mm = computed<number | null>(() => {
    try {
        return compute_dims().cover_total_width.toNumber()
    } catch {
        return null
    }
})

// 3D renderer instance — owned here, shared with Preview3D and PreviewPhoto
let renderer:Book3DRenderer | null = null

// Pending renderer load args — set when generation runs off 3d/photo view, consumed on switch
type RendererArgs = {svgs:{front:string, back:string, spine:string | undefined}, cover_type:CoverType, depth_mm:number | undefined}
let pending_renderer:RendererArgs | null = null

/** Load SVGs into the renderer and push to child components.
 *  Preview3D handles canvas sizing via ResizeObserver — renderer is created at a default size. */
async function load_renderer({svgs, cover_type, depth_mm}:RendererArgs):Promise<void> {
    if (!renderer)
        renderer = new Book3DRenderer()
    await renderer.load(svgs, cover_type, depth_mm)
    pending_renderer = null
    preview_3d_ref.value?.set_renderer(renderer)
    if (view_mode.value === 'photo')
        preview_photo_ref.value?.render(renderer)
}


// Whether another generation was requested while one was in progress
let regenerate_queued = false

// Whether a generation was skipped because a modal was open
let generate_pending_modal = false

/** Run SVG generation and update all three view modes */
async function run_generate():Promise<void> {
    if (!is_ready.value)
        return
    // If a full-screen modal is open, defer until it closes (form state still updates)
    if (modal_open_count.value > 0) {
        generate_pending_modal = true
        return
    }
    // If already generating, queue a re-run so the latest state is always rendered
    if (is_generating.value) {
        regenerate_queued = true
        return
    }
    is_generating.value = true
    revoke_last_url()

    try {
        // Check the current binding is valid for the current size + page count (skip for custom service)
        if (form.service_id !== 'custom') {
            const svc = get_service(form.service_id as Parameters<typeof get_service>[0])
            const valid_bindings = svc.get_binding_types({
                size: (form.size_id || undefined) as SizeId | undefined,
                pages: form.page_count,
            })
            if (!valid_bindings.some(b => b.id === form.binding_type)) {
                const binding_name = svc.get_binding_types().find(b => b.id === form.binding_type)?.name ?? form.binding_type
                if (valid_bindings.length === 0) {
                    preview_error.value = `No binding type supports ${form.page_count} pages`
                } else {
                    preview_error.value = `"${binding_name}" is not available for ${form.page_count} pages`
                }
                return
            }
        }

        // Clear any previous error before generating
        preview_error.value = null

        const schema = build_schema(form)

        // Compute preview image dimensions
        // Using a lower res version for preview greatly speeds up render
        // Full res still used for save and export
        const dims = compute_dims()
        const dpi = 96 * 2  // Standard screen 96dpi × 2 for zoom
        const preview_w = Math.round(dims.cover_total_width.toNumber() * dpi)
        const preview_h = Math.round(dims.cover_total_height.toNumber() * dpi)
        const img = await read_image_preview(form, preview_w, preview_h)

        // Generate SVG with split panels (needed for 3D renderer and split view)
        const result = await generator.value!.generate({
            schema,
            image: img,
            format: 'svg',
            split: true,
        })

        if (!result.split)
            throw new Error('[3D preview] SVG split result missing')

        // For custom service with no spine, treat as stitch (faces meet)
        const cover_type = (form.service_id === 'custom' && dims.cover_spine.toNumber() === 0)
            ? 'paperback_stitch' as CoverType
            : form.binding_type as CoverType

        // Store SVGs for the split and full views
        const split = result.split as {front:string, back:string, spine?:string}
        const svgs = {
            front: split.front,
            back: split.back,
            spine: split.spine,
        }
        split_svgs.value = svgs
        full_svg.value = result.data as string

        // For bindings with no spine SVG, pass book depth in mm to the renderer
        const depth_mm = !svgs.spine ? dims.depth.toNumber() : undefined

        // Only load renderer immediately if on a view that needs it; otherwise defer
        if (view_mode.value === '3d' || view_mode.value === 'photo') {
            await load_renderer({svgs, cover_type, depth_mm})
        } else {
            pending_renderer = {svgs, cover_type, depth_mm}
        }

        has_preview.value = true
        preview_error.value = null
    }
    catch (err:unknown) {
        if (err instanceof Error && err.name === 'ZodError' && 'issues' in err) {
            const issues = err.issues as {path:unknown[], message:string}[]
            const field = issues[0]?.path.join('.') ?? 'input'
            preview_error.value = `Invalid ${field} — finish filling in the form`
        } else {
            const msg = err instanceof Error ? err.message : String(err)
            preview_error.value = msg
            console.error(err)
        }
    }
    finally {
        is_generating.value = false
        // If a change came in while we were generating, run again with latest state
        if (regenerate_queued) {
            regenerate_queued = false
            run_generate()
        }
    }
}

/** Explicitly generate and download a PDF (on button click only) */
async function export_pdf():Promise<void> {
    if (!is_ready.value || is_exporting.value)
        return
    is_exporting.value = true
    export_error.value = null
    revoke_last_url()

    try {
        const schema = build_schema(form)
        const img = read_image(form)
        const result = await generator.value!.generate({schema, image: img})
        // .slice() produces Uint8Array<ArrayBuffer> (not ArrayBufferLike), satisfying BlobPart
        trigger_download(new Blob([(result.data as Uint8Array).slice()], {type: 'application/pdf'}), 'cover.pdf')
    }
    catch (err:unknown) {
        export_error.value = err instanceof Error ? err.message : String(err)
        console.error(err)
    }
    finally {
        is_exporting.value = false
    }
}

/** Generate a full PDF, split into per-panel PDFs, and download as a zip */
async function export_split_pdfs():Promise<void> {
    if (!is_ready.value || is_exporting.value)
        return
    is_exporting.value = true
    export_error.value = null
    revoke_last_url()

    try {
        const schema = build_schema(form)
        const img = read_image(form)
        const result = await generator.value!.generate({
            schema, image: img, format: 'pdf', split: true,
        })

        const parts = result.split as {front:Uint8Array, back:Uint8Array, spine?:Uint8Array}
        const files:Record<string, Uint8Array> = {
            'front.pdf': parts.front,
            'back.pdf': parts.back,
        }
        if (parts.spine) files['spine.pdf'] = parts.spine

        trigger_download(new Blob([zipSync(files)], {type: 'application/zip'}), 'cover_parts.zip')
    }
    catch (err:unknown) {
        export_error.value = err instanceof Error ? err.message : String(err)
        console.error(err)
    }
    finally {
        is_exporting.value = false
    }
}

/** Zip split SVGs and trigger download */
async function save_split_svgs():Promise<void> {
    if (!split_svgs.value) return
    const enc = new TextEncoder()
    const files:Record<string, Uint8Array> = {
        'front.svg': enc.encode(split_svgs.value.front),
        'back.svg': enc.encode(split_svgs.value.back),
    }
    if (split_svgs.value.spine) files['spine.svg'] = enc.encode(split_svgs.value.spine)
    trigger_download(new Blob([zipSync(files)], {type: 'application/zip'}), 'cover_parts.zip')
}

/** Download the full print-ready SVG */
function save_full_svg():void {
    if (!full_svg.value) return
    trigger_download(new Blob([full_svg.value], {type: 'image/svg+xml'}), 'cover_print.svg')
}

/** Dispatch save action based on the current view mode */
async function save_image():Promise<void> {
    is_saving.value = true
    revoke_last_url()
    try {
        if (view_mode.value === '3d') {
            const blob = await preview_3d_ref.value?.get_blob()
            if (blob) trigger_download(blob, 'cover_3d.png')
        } else if (view_mode.value === 'photo') {
            const blob = await preview_photo_ref.value?.get_blob()
            if (blob) trigger_download(blob, 'cover_mockup.png')
        } else if (view_mode.value === 'split') {
            await save_split_svgs()
        } else {
            save_full_svg()
        }
    }
    finally {
        is_saving.value = false
    }
}

/** Handle background thumbnail click in photo mode */
function on_photo_bg_click(id:string):void {
    preview_photo_ref.value?.select_photo_bg(id)
    preview_photo_ref.value?.render(preview_3d_ref.value?.get_renderer() ?? null)
}

// Load pending renderer data and update photo composite when switching to 3d/photo
watch(view_mode, async (mode) => {
    if ((mode === '3d' || mode === 'photo') && pending_renderer)
        await load_renderer(pending_renderer)
    else if (mode === 'photo' && has_preview.value)
        preview_photo_ref.value?.render(preview_3d_ref.value?.get_renderer() ?? null)
})

// Debounced generation for text inputs — waits until typing pauses
const schedule_generate = debounce(run_generate, 700)

// Flag set by the text-fields watcher to suppress the deep watcher for the same flush
let text_changed = false

// Text fields that need debouncing — must be registered before the deep watcher
watch(
    () => [
        form.title1, form.title2, form.title3,
        form.subtitle, form.author, form.isbn, form.blurb,
        form.custom_trim_width, form.custom_trim_height, form.page_count,
        form.custom_bleed, form.custom_spine,
        form.title1_font, form.subtitle_font, form.blurb_font, form.spine_title_font,
        form.spine_title, form.spine_author,
    ],
    () => { text_changed = true; schedule_generate() },
)

// Push uploaded fonts to the generator worker (it holds a copy, not our array reference),
// then re-generate with them. Uploads before the worker is ready are sent by App.vue instead.
watch(all_custom_font_bytes, async (fonts) => {
    if (!generator.value)
        return
    await generator.value.set_custom_fonts(fonts)
    void run_generate()
})

// All other form changes (selects, toggles, etc.) run immediately;
// text field changes are handled above and suppressed here via the flag
watch(
    () => form,
    () => { if (text_changed) { text_changed = false; return } run_generate() },
    {deep: true},
)

// When all modals close, run a deferred generation if changes occurred while they were open
watch(modal_open_count, (count) => {
    if (count === 0 && generate_pending_modal) {
        generate_pending_modal = false
        run_generate()
    }
})

// Run first generation once WASM is ready
watch(() => is_ready.value, (ready) => {
    if (ready)
        run_generate()
})

// If already ready on mount (unlikely but safe), generate immediately
if (is_ready.value)
    run_generate()

// Clean up the renderer when torn down
onUnmounted(() => {
    renderer?.destroy()
    renderer = null
})

</script>

<style lang="sss" scoped>

/* Fade the stale-render overlay in/out smoothly */
.fade-enter-active,
.fade-leave-active
    transition: opacity 0.15s ease

.fade-enter-from,
.fade-leave-to
    opacity: 0

</style>
