
// Protocol types for embedding the cover-editor widget in an iframe. The host sends one
// InitMessage in reply to the widget's 'ready' message; the widget reports edits back with
// WidgetMessage, and may send further HostMessages afterwards.
//
// Binaries are never part of the stored record. The background image and custom font bytes
// travel as separate structured-clone fields beside the pure-JSON form values, so hosts persist
// `data` as-is (e.g. to Firestore) and own the storage and identity of the binaries themselves.
// Messages carry no derived schema: hosts call build_schema(form) from bookcover-core, so there
// is exactly one place that form → schema conversion happens.
//
// BACKGROUND IMAGE BYTES ROUND-TRIP UNMODIFIED. Whatever File the host hands in comes back out
// byte-for-byte — never re-encoded, resized or stripped of metadata — so a host can hash the
// bytes to recognise an image it already stores. See FormState.bg_image in bookcover-core.

import type {EmbedFormState} from 'bookcover-core'
import type {CustomFont} from 'typst-fonts'

/** Locales the widget UI supports. Lives in this published package, so adding a widget
 *  locale requires a bookcover-web release. */
export type AppLocale = 'eng' | 'vie'

/** One candidate background the host offers alongside the widget's own built-ins — typically an
 *  image the user already used on another of their covers, which the widget would otherwise make
 *  them find on disk and upload again.
 *
 *  The widget knows nothing about these images beyond what is in this object. It renders `url`
 *  as a thumbnail, and when the user picks one it asks the host for the bytes
 *  ('bg_suggestion_selected' -> 'bg_suggestion_resolved'), so the host never has to download a
 *  candidate the user never looks at and only the host ever touches host storage.
 *
 *  `id` is an OPAQUE HOST TOKEN. The widget echoes it back verbatim, never parses it, never
 *  stores it in the form record, and never puts it anywhere near `bg_image_builtin` — that field
 *  names a shipped background and is allowlisted by hosts, so a host id leaking into it would
 *  collide. A resolved suggestion is adopted through the UPLOAD path: it reports
 *  `bg_image_builtin: null` and gets no published region metadata, exactly like a user upload.
 *
 *  `url` is UNTRUSTED and is an image source only. The widget sets it as an <img src> (with
 *  referrerpolicy="no-referrer") and nothing else — it is never fetched as data, never resolved
 *  against widget-internal paths, and never assumed same-origin. It needs no CORS headers.
 *
 *  A HOST MUST NOT SUGGEST AN IMAGE WHOSE PROVENANCE WAS A BUILT-IN. Those are already in the
 *  picker, and routing one through here would convert the host's stored reference to a shipped
 *  image into a private copy of its bytes — the exact thing `bg_image_builtin` exists to avoid.
 *
 *  `label` is display text (the other book's name, say), used as the tile's alt/title. The host
 *  supplies it already localised. */
export interface BgSuggestion {
    id: string
    url: string
    label?: string
}

/** Host -> widget, answered to the widget's 'ready' message */
export interface InitMessage {
    type: 'init'
    // Form values to preset — pure JSON, no binaries inside
    preset?: Partial<EmbedFormState>
    // Background image to restore into the editor (File structured-clones as a cheap blob ref).
    // Returned byte-for-byte — see the round-trip guarantee at the top of this file
    bg_image?: File | null
    // Published filename of that image when it is one of the widget's built-in backgrounds.
    // Seeds the widget's advisory tracking so a restored built-in isn't reported back as a
    // user upload on the first data message — see bg_image_builtin on WidgetMessage
    bg_image_builtin?: string | null
    // Previously uploaded font families to restore into the editor
    custom_fonts?: CustomFont[]
    // Swap the export button for a "Finished" signal, and show a Cancel button
    finished_mode?: boolean
    // Hide the Book Size sidebar section entirely
    hide_size_section?: boolean
    // Candidate backgrounds to offer alongside the built-ins — see BgSuggestion. Absent or
    // empty leaves the background picker exactly as it is by default. Expect a short list
    // (the number of covers one user has made); entries that aren't {id, url} are dropped
    bg_suggestions?: BgSuggestion[]
    locale?: AppLocale
}

/** Host -> widget. InitMessage is the first and must arrive before any other; later messages are
 *  only accepted from the same origin that sent it.
 *
 *  'bg_suggestion_resolved' answers a 'bg_suggestion_selected' by handing over that image's
 *  bytes. It is a RESPONSE, not a general "set the background" command — the widget tracks a
 *  single pending id and DROPS any resolution whose `id` isn't it, so a slow answer can never
 *  overwrite a later choice. Clicking a second tile supersedes the first.
 *
 *  `bg_image: null` means THAT RESOLUTION FAILED. The widget clears the tile's pending state and
 *  shows a quiet inline error, leaving the current background untouched; it never means "clear
 *  the background". A host that never answers is treated the same way after a short timeout, so
 *  not answering is a safe way to decline. */
export type HostMessage =
    | InitMessage
    | {type: 'bg_suggestion_resolved', id: string, bg_image: File | null}

/** Widget -> host. `bg_image` rides on every data/finished message (cloning a File is cheap);
 *  `custom_fonts` byte arrays are expensive to clone, so on 'data' messages the field is only
 *  present when the font set changed since the last message (absent = unchanged), while
 *  'finished' always carries the complete array.
 *
 *  `bg_image_builtin` is ADVISORY background identity, so a host doesn't have to recover it by
 *  hashing returned bytes: when the user picks one of the widget's built-in backgrounds it
 *  carries that image's published filename, and it is null for a user upload or no image at all.
 *  The filename IS the id — hosts join it onto their own assets path to get the bytes and slice
 *  its extension off for the MIME type, so it must stay a filename (see the contract on
 *  BACKGROUNDS in the widget's services/backgrounds.ts). It exists purely so the host can store a
 *  reference instead of a private copy of a shipped image. Treat it as untrusted input — map it
 *  to a built-in only after checking it against your own allowlist, and fall back to the upload
 *  path otherwise. Nothing in bookcover ever resolves bytes from this field.
 *
 *  The `bg_image` File is the one the host supplied, byte-for-byte — see the round-trip
 *  guarantee at the top of this file.
 *
 *  'bg_suggestion_selected' asks the host for the bytes behind one of the BgSuggestions it sent
 *  in InitMessage, carrying that suggestion's id verbatim. The host answers with
 *  'bg_suggestion_resolved'. */
export type WidgetMessage =
    | {type: 'ready'}
    | {type: 'data', data: EmbedFormState, bg_image: File | null,
        bg_image_builtin: string | null, custom_fonts?: CustomFont[]}
    | {type: 'finished', data: EmbedFormState, bg_image: File | null,
        bg_image_builtin: string | null, custom_fonts: CustomFont[]}
    | {type: 'cancelled'}
    | {type: 'bg_suggestion_selected', id: string}
