
// Embed API — lets a parent frame preset the form, receive live updates, and control the
// primary button / Book Size section via postMessage. No-ops entirely when not in an iframe.
// The message types are published from bookcover-web (embed_types.ts) so hosts share them.
// Binaries (bg image File, custom font bytes) ride as structured-clone fields beside the
// pure-JSON form values — see WidgetMessage's doc comment for the send policy.

import {ref, watch, toRaw} from 'vue'
import type {EmbedFormState, InitMessage, WidgetMessage, AppLocale} from 'bookcover-web'
import type {CustomFont} from 'typst-fonts'
import type {FormState} from './form_state'
import {build_schema} from './schema'
import {add_custom_fonts, custom_font_families} from './fonts'
import {debounce} from './svg_utils'

// Swaps the primary export button into a "Finished" signal instead of a PDF download
export const finished_mode = ref(false)

// Hides the Book Size sidebar section entirely
export const hide_size_section = ref(false)

// Parent-provided locale override, captured from the 'init' message — read by main.ts before
// the app mounts, via resolve_initial_locale()
export const embed_locale = ref<AppLocale | null>(null)

// True when the parent's init message seeded the form (preset and/or explicit bg image) —
// read by App.vue so the standalone demo background never fires over a seeded form, where an
// absent image means the cover deliberately has none
export const embed_seeded = ref(false)

// True when running inside an iframe — standalone usage no-ops the whole embed API
const embedded = window.parent !== window

// Trusted parent origin, captured from the first validated 'init' message
let parent_origin:string | null = null

// Preset + binaries captured by wait_for_embed_init(), applied once the form exists (in
// init_embed). bg_image distinguishes absent (undefined) from an explicit null
let pending_preset:Partial<EmbedFormState> | null = null
let pending_bg_image:File | null | undefined
let pending_fonts:CustomFont[] | undefined

/** Post a message to the parent frame, once its origin is known (falls back to '*' for 'ready') */
function post(msg:WidgetMessage):void {
    window.parent.postMessage(msg, parent_origin ?? '*')
}

/** Serialize the reactive form into a JSON-safe, postMessage-able snapshot (binaries excluded) */
function serialize_form(form:FormState):EmbedFormState {
    const {bg_image, ...rest} = form
    // The JSON round-trip strips undefined values and Vue reactivity proxies
    return JSON.parse(JSON.stringify(rest)) as EmbedFormState
}

/** Build the renderable generator schema from the form, as plain JSON — the round-trip strips
 *  undefined values (which build_schema emits and e.g. Firestore rejects) */
function renderable_schema(form:FormState):Record<string, unknown> {
    return JSON.parse(JSON.stringify(build_schema(form))) as Record<string, unknown>
}

/** Raw (deproxied) snapshot of the custom font store — structured clone can't serialize Vue
 *  proxies, and identity comparisons must use the raw objects to be meaningful */
function raw_fonts():CustomFont[] {
    return toRaw(custom_font_families).map(f => toRaw(f))
}

// Last-sent state, for skipping no-op messages and omitting unchanged font bytes
let last_sent_json:string | null = null
let last_sent_bg:File | null = null
let last_sent_fonts:CustomFont[] | null = null

/** Whether the font store differs from what was last posted (by length + element identity) */
function fonts_changed():boolean {
    const current = raw_fonts()
    if (last_sent_fonts === null || last_sent_fonts.length !== current.length)
        return true
    return current.some((font, i) => font !== last_sent_fonts![i])
}

// Baseline captured after the init preset is applied, for dirty detection (Cancel button)
let baseline_json:string | null = null
let baseline_bg:File | null = null
let baseline_fonts:CustomFont[] = []

/** Whether the user has edited anything since the parent's preset was applied */
export function is_form_dirty(form:FormState):boolean {
    if (baseline_json === null)
        return true
    if (form.bg_image !== baseline_bg)
        return true
    const fonts = raw_fonts()
    if (fonts.length !== baseline_fonts.length || fonts.some((f, i) => f !== baseline_fonts[i]))
        return true
    return JSON.stringify(serialize_form(form)) !== baseline_json
}

/** Notify the parent the user is done — used by the "Finished" button. Posts the final form,
 *  schema, and binaries so edits made within the debounce window before clicking aren't lost
 *  and a host that only persists on finish gets the complete state. */
export function notify_finished(form:FormState):void {
    post({
        type: 'finished',
        data: serialize_form(form),
        schema: renderable_schema(form),
        bg_image: form.bg_image,
        custom_fonts: raw_fonts(),
    })
}

/** Notify the parent the user abandoned their edits — used by the "Cancel" button */
export function notify_cancelled():void {
    post({type: 'cancelled'})
}

/** Apply a parent-supplied preset (form values + binaries) onto the existing reactive form */
function apply_preset(form:FormState):void {
    if (pending_preset)
        Object.assign(form, pending_preset)
    if (pending_bg_image !== undefined)
        form.bg_image = pending_bg_image
    // Families land in the store synchronously; only preview @font-face registration is async
    if (pending_fonts?.length)
        void add_custom_fonts(pending_fonts)
}

/** Wait for the parent's 'init' message before the app mounts, so form fields set by a preset
 *  are never clobbered by child-component watchers (e.g. SizeSection resetting dependent size
 *  fields) that would already be live if the app mounted first. Falls back to a short timeout
 *  so a non-cooperating parent doesn't leave the widget blank forever. No-ops when not embedded.
 *  Call from main.ts and await it before createApp(...).mount(). */
export function wait_for_embed_init():Promise<void> {
    if (!embedded)
        return Promise.resolve()

    return new Promise((resolve) => {
        let done = false
        const finish = () => { if (!done) { done = true; resolve() } }

        window.addEventListener('message', (event:MessageEvent) => {
            if (event.source !== window.parent)
                return
            const msg = event.data as InitMessage
            if (!msg || msg.type !== 'init')
                return
            parent_origin = event.origin
            if (msg.finished_mode !== undefined) finished_mode.value = msg.finished_mode
            if (msg.hide_size_section !== undefined) hide_size_section.value = msg.hide_size_section
            if (msg.locale !== undefined) embed_locale.value = msg.locale
            if (msg.preset) pending_preset = msg.preset
            pending_bg_image = msg.bg_image
            if (msg.custom_fonts) pending_fonts = msg.custom_fonts
            if (msg.preset || msg.bg_image !== undefined) embed_seeded.value = true
            finish()
        })

        setTimeout(finish, 300)
        post({type: 'ready'})
    })
}

/** Apply any preset captured by wait_for_embed_init and start reporting live form changes back
 *  to the parent. Call once from App.vue's setup, after the reactive form is created. */
export function init_embed(form:FormState):void {
    if (!embedded)
        return

    apply_preset(form)

    // Snapshot the post-preset state as the Cancel button's "no edits yet" baseline
    baseline_json = JSON.stringify(serialize_form(form))
    baseline_bg = form.bg_image
    baseline_fonts = raw_fonts()

    // Live change notifications, deduped so unrelated re-renders don't spam the parent.
    // Font bytes are expensive to structured-clone, so they're only included when changed
    const notify_change = debounce(() => {
        const data = serialize_form(form)
        const json = JSON.stringify(data)
        const send_fonts = fonts_changed()
        if (json === last_sent_json && form.bg_image === last_sent_bg && !send_fonts)
            return
        last_sent_json = json
        last_sent_bg = form.bg_image
        post({
            type: 'data',
            data,
            schema: renderable_schema(form),
            bg_image: form.bg_image,
            ...(send_fonts ? {custom_fonts: raw_fonts()} : {}),
        })
        if (send_fonts)
            last_sent_fonts = raw_fonts()
    }, 500)
    watch(() => form, notify_change, {deep: true})
    // Font uploads don't touch the form, so the deep form watcher alone would miss them
    watch(custom_font_families, notify_change)
}
