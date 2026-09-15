
// Protocol types for embedding the cover-editor widget in an iframe. The host sends one
// InitMessage in reply to the widget's 'ready' message; the widget reports edits back with
// WidgetMessage.
//
// Binaries are never part of the stored record. The background image and custom font bytes
// travel as separate structured-clone fields beside the pure-JSON form values, so hosts persist
// `data` as-is (e.g. to Firestore) and own the storage and identity of the binaries themselves.
// Messages carry no derived schema: hosts call build_schema(form) from bookcover-core, so there
// is exactly one place that form → schema conversion happens.

import type {EmbedFormState} from 'bookcover-core'
import type {CustomFont} from 'typst-fonts'

/** Locales the widget UI supports. Lives in this published package, so adding a widget
 *  locale requires a bookcover-web release. */
export type AppLocale = 'eng' | 'vie'

/** Host -> widget, answered to the widget's 'ready' message */
export interface InitMessage {
    type: 'init'
    // Form values to preset — pure JSON, no binaries inside
    preset?: Partial<EmbedFormState>
    // Background image to restore into the editor (File structured-clones as a cheap blob ref)
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
    locale?: AppLocale
}

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
 *  path otherwise. Nothing in bookcover ever resolves bytes from this field. */
export type WidgetMessage =
    | {type: 'ready'}
    | {type: 'data', data: EmbedFormState, bg_image: File | null,
        bg_image_builtin: string | null, custom_fonts?: CustomFont[]}
    | {type: 'finished', data: EmbedFormState, bg_image: File | null,
        bg_image_builtin: string | null, custom_fonts: CustomFont[]}
    | {type: 'cancelled'}
