
// Embed API — lets a parent frame preset the form, receive live updates, and control the
// primary button / Book Size section via postMessage. No-ops entirely when not in an iframe.
// The message types are published from bookcover-web (embed_types.ts) so hosts share them.
// Binaries (bg image File, custom font bytes) ride as structured-clone fields beside the
// pure-JSON form values — see WidgetMessage's doc comment for the send policy.

import {ref, watch, toRaw} from 'vue'
import type {EmbedFormState, HostMessage, WidgetMessage, BgSuggestion, AppLocale} from 'bookcover-web'
import type {CustomFont} from 'typst-fonts'
import type {FormState} from './form_state'
import {add_custom_fonts, custom_font_families} from './fonts'
import {adopt_bg_image, builtin_bg_filename} from './services/backgrounds'
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
let pending_bg_builtin:string | null | undefined
let pending_fonts:CustomFont[] | undefined

// The live form, captured by init_embed so messages arriving after mount can act on it
let current_form:FormState | null = null

/** Post a message to the parent frame, once its origin is known (falls back to '*' for 'ready') */
function post(msg:WidgetMessage):void {
    window.parent.postMessage(msg, parent_origin ?? '*')
}


// BACKGROUND SUGGESTIONS — candidate images the host offers alongside the built-ins. The widget
// only ever holds {id, url, label}; picking one asks the host to resolve the actual bytes. See
// BgSuggestion in generator-web's embed_types.ts for the trust boundary

// Validated suggestions from the init message, in the host's order (empty = feature off)
export const bg_suggestions = ref<BgSuggestion[]>([])

// Suggestion currently awaiting bytes from the host, or null — at most one at a time
export const pending_suggestion_id = ref<string | null>(null)

// Suggestion whose last resolution failed or timed out, for a quiet inline error on that tile
export const failed_suggestion_id = ref<string | null>(null)

// How long to wait for the host to answer before giving up on a selection
const SUGGESTION_TIMEOUT_MS = 15000

let suggestion_timer:ReturnType<typeof setTimeout> | null = null

/** Drop the pending selection and mark its tile failed — shared by an explicit null resolution
 *  and by the timeout, which are deliberately indistinguishable to the user */
function fail_pending_suggestion():void {
    if (pending_suggestion_id.value === null)
        return
    failed_suggestion_id.value = pending_suggestion_id.value
    pending_suggestion_id.value = null
}

/** Clear any armed timeout */
function clear_suggestion_timer():void {
    if (suggestion_timer !== null) {
        clearTimeout(suggestion_timer)
        suggestion_timer = null
    }
}

/** Ask the host for the bytes behind a suggestion the user clicked. A second click supersedes
 *  the first: only one id is ever pending, so the earlier answer is dropped when it arrives. */
export function select_bg_suggestion(id:string):void {
    clear_suggestion_timer()
    pending_suggestion_id.value = id
    failed_suggestion_id.value = null
    post({type: 'bg_suggestion_selected', id})
    suggestion_timer = setTimeout(() => {
        suggestion_timer = null
        fail_pending_suggestion()
    }, SUGGESTION_TIMEOUT_MS)
}

/** Apply the host's answer to a selection, ignoring anything that isn't the pending one */
function on_suggestion_resolved(id:string, file:File | null):void {
    if (id !== pending_suggestion_id.value)
        return
    clear_suggestion_timer()
    // A null image means this resolution failed — never "clear the background". An answer with
    // no form to put it on is treated the same way, though the user can't click a tile before
    // the app has mounted
    if (!file || !current_form) {
        fail_pending_suggestion()
        return
    }
    pending_suggestion_id.value = null
    failed_suggestion_id.value = null
    // Adopted as an upload, not a built-in: bg_image_builtin stays null and the image gets no
    // published region metadata. user_upload arms the low-resolution check, whose verdict can
    // differ from the other cover's when this book is a different trim size
    adopt_bg_image(current_form, file, {suggestion: id, user_upload: true})
}

/** Keep only well-formed suggestions — a host sending junk loses those tiles, not the widget */
function valid_suggestions(value:unknown):BgSuggestion[] {
    if (!Array.isArray(value))
        return []
    return value.filter((s):s is BgSuggestion => (
        !!s && typeof s === 'object'
        && typeof (s as BgSuggestion).id === 'string'
        && typeof (s as BgSuggestion).url === 'string'
    ))
}

/** Serialize the reactive form into a JSON-safe, postMessage-able snapshot (binaries excluded) */
function serialize_form(form:FormState):EmbedFormState {
    const {bg_image, ...rest} = form
    // The JSON round-trip strips undefined values and Vue reactivity proxies
    return JSON.parse(JSON.stringify(rest)) as EmbedFormState
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

/** Notify the parent the user is done — used by the "Finished" button. Posts the final form and
 *  binaries so edits made within the debounce window before clicking aren't lost and a host that
 *  only persists on finish gets the complete state. */
export function notify_finished(form:FormState):void {
    post({
        type: 'finished',
        data: serialize_form(form),
        bg_image: form.bg_image,
        bg_image_builtin: builtin_bg_filename.value,
        custom_fonts: raw_fonts(),
    })
}

/** Notify the parent the user abandoned their edits — used by the "Cancel" button */
export function notify_cancelled():void {
    post({type: 'cancelled'})
}

/** Apply a parent-supplied preset (form values + binaries) onto the existing reactive form.
 *  Deliberately NOT routed through adopt_bg_image: this has to tell an absent bg_image from an
 *  explicit null, and it must leave bg_vector_id alone, since the preset itself may have just
 *  set a vector background that the helper would clear. */
function apply_preset(form:FormState):void {
    if (pending_preset)
        Object.assign(form, pending_preset)
    if (pending_bg_image !== undefined)
        form.bg_image = pending_bg_image
    // Seed advisory identity so a restored built-in isn't reported back as a user upload
    if (pending_bg_builtin !== undefined)
        builtin_bg_filename.value = pending_bg_builtin
    // Families land in the store synchronously; only preview @font-face registration is async
    if (pending_fonts?.length)
        void add_custom_fonts(pending_fonts)
}

// True once an 'init' message has been accepted — later ones are ignored, and nothing else is
// accepted before it (the origin it arrived from is what every later message is checked against)
let init_received = false

/** Apply the parent's 'init' message: config takes effect immediately, form values and binaries
 *  are held until init_embed() has a form to put them on */
function on_init(msg:Extract<HostMessage, {type: 'init'}>):void {
    if (msg.finished_mode !== undefined) finished_mode.value = msg.finished_mode
    if (msg.hide_size_section !== undefined) hide_size_section.value = msg.hide_size_section
    if (msg.locale !== undefined) embed_locale.value = msg.locale
    if (msg.preset) pending_preset = msg.preset
    pending_bg_image = msg.bg_image
    pending_bg_builtin = msg.bg_image_builtin
    if (msg.custom_fonts) pending_fonts = msg.custom_fonts
    // Suggestions are just offers — they don't seed the form, so embed_seeded ignores them
    bg_suggestions.value = valid_suggestions(msg.bg_suggestions)
    if (msg.preset || msg.bg_image !== undefined) embed_seeded.value = true
}

/** Wait for the parent's 'init' message before the app mounts, so form fields set by a preset
 *  are never clobbered by child-component watchers (e.g. SizeSection resetting dependent size
 *  fields) that would already be live if the app mounted first. Falls back to a short timeout
 *  so a non-cooperating parent doesn't leave the widget blank forever. No-ops when not embedded.
 *  Call from main.ts and await it before createApp(...).mount().
 *
 *  Also installs the one persistent listener for everything the host sends later. It stays for
 *  the life of the page: 'init' is only the first message, not the only one. */
export function wait_for_embed_init():Promise<void> {
    if (!embedded)
        return Promise.resolve()

    return new Promise((resolve) => {
        let done = false
        const finish = () => { if (!done) { done = true; resolve() } }

        window.addEventListener('message', (event:MessageEvent) => {
            if (event.source !== window.parent)
                return
            const msg = event.data as HostMessage
            if (!msg || typeof msg.type !== 'string')
                return

            // 'init' is what establishes the trusted origin, so it's the only message accepted
            // before one has been seen — and only the first is honoured
            if (msg.type === 'init') {
                if (init_received)
                    return
                init_received = true
                parent_origin = event.origin
                on_init(msg)
                finish()
                return
            }

            // Everything afterwards must come from the same origin that sent the init
            if (!init_received || event.origin !== parent_origin)
                return

            if (msg.type === 'bg_suggestion_resolved')
                on_suggestion_resolved(msg.id, msg.bg_image)
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

    // Held for messages that arrive after mount — a suggestion can't be resolved before this,
    // since the user has to click a tile to ask for one
    current_form = form

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
            bg_image: form.bg_image,
            bg_image_builtin: builtin_bg_filename.value,
            ...(send_fonts ? {custom_fonts: raw_fonts()} : {}),
        })
        if (send_fonts)
            last_sent_fonts = raw_fonts()
    }, 500)
    watch(() => form, notify_change, {deep: true})
    // Font uploads don't touch the form, so the deep form watcher alone would miss them
    watch(custom_font_families, notify_change)
}
