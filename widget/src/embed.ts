
// Embed API — lets a parent frame preset the form, receive live updates, and control the
// primary button / Book Size section via postMessage. No-ops entirely when not in an iframe.

import {ref, watch} from 'vue'
import type {FormState} from './form_state'
import type {AppLocale} from './i18n'
import {build_schema} from './schema'
import {debounce} from './svg_utils'

/** JSON-safe mirror of FormState — bg_image becomes a base64 data URL instead of a File */
export type EmbedFormState = Omit<FormState, 'bg_image'> & {bg_image: string | null}

type InitMessage = {
    type: 'init'
    preset?: Partial<EmbedFormState>
    finished_mode?: boolean
    hide_size_section?: boolean
    locale?: AppLocale
}
type WidgetMessage =
    | {type: 'ready'}
    | {type: 'data', data: EmbedFormState, schema: Record<string, unknown>}
    | {type: 'finished', data: EmbedFormState, schema: Record<string, unknown>}

// Swaps the primary export button into a "Finished" signal instead of a PDF download
export const finished_mode = ref(false)

// Hides the Book Size sidebar section entirely
export const hide_size_section = ref(false)

// Parent-provided locale override, captured from the 'init' message — read by main.ts before
// the app mounts, via resolve_initial_locale()
export const embed_locale = ref<AppLocale | null>(null)

// True when running inside an iframe — standalone usage no-ops the whole embed API
const embedded = window.parent !== window

// Trusted parent origin, captured from the first validated 'init' message
let parent_origin:string | null = null

// Preset captured by wait_for_embed_init(), applied once the form exists (in init_embed)
let pending_preset:Partial<EmbedFormState> | null = null

/** Post a message to the parent frame, once its origin is known (falls back to '*' for 'ready') */
function post(msg:WidgetMessage):void {
    window.parent.postMessage(msg, parent_origin ?? '*')
}

/** Notify the parent the user is done — used by the "Finished" button. Posts the final form
 *  and schema so edits made within the debounce window before clicking aren't lost. */
export async function notify_finished(form:FormState):Promise<void> {
    post({type: 'finished', data: await serialize_form(form), schema: renderable_schema(form)})
}

// Cache the bg_image -> data URL conversion by File identity, so unrelated form edits don't
// re-encode a multi-MB image via FileReader on every debounced change
let last_bg_image_file:File | null = null
let last_bg_image_data_url:string | null = null

/** Read a File as a base64 data URL */
function file_to_data_url(file:File):Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
    })
}

/** Convert a base64 data URL back into a File */
async function data_url_to_file(data_url:string):Promise<File> {
    const blob = await (await fetch(data_url)).blob()
    return new File([blob], 'bg_image', {type: blob.type})
}

/** Resolve bg_image to a data URL, reusing the cached encoding when the File is unchanged */
async function bg_image_data_url(file:File | null):Promise<string | null> {
    if (file === last_bg_image_file)
        return last_bg_image_data_url
    last_bg_image_file = file
    last_bg_image_data_url = file ? await file_to_data_url(file) : null
    return last_bg_image_data_url
}

/** Serialize the reactive form into a JSON-safe, postMessage-able snapshot */
async function serialize_form(form:FormState):Promise<EmbedFormState> {
    const {bg_image, ...rest} = form
    const plain = JSON.parse(JSON.stringify(rest)) as Omit<EmbedFormState, 'bg_image'>
    return {...plain, bg_image: await bg_image_data_url(bg_image)}
}

/** Build the renderable generator schema from the form, as plain JSON — the round-trip strips
 *  undefined values (which build_schema emits and e.g. Firestore rejects) */
function renderable_schema(form:FormState):Record<string, unknown> {
    return JSON.parse(JSON.stringify(build_schema(form))) as Record<string, unknown>
}

/** Apply a parent-supplied preset onto the existing reactive form, in place */
async function apply_preset(form:FormState, preset:Partial<EmbedFormState>):Promise<void> {
    const {bg_image, ...rest} = preset
    Object.assign(form, rest)
    if (bg_image !== undefined) {
        form.bg_image = bg_image ? await data_url_to_file(bg_image) : null
    }
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

    if (pending_preset)
        void apply_preset(form, pending_preset)

    // Live change notifications, deduped so unrelated re-renders don't spam the parent
    let last_sent_json:string | null = null
    const notify_change = debounce(() => {
        void serialize_form(form).then((data) => {
            const json = JSON.stringify(data)
            if (json === last_sent_json) return
            last_sent_json = json
            post({type: 'data', data, schema: renderable_schema(form)})
        })
    }, 500)
    watch(() => form, notify_change, {deep: true})
}
