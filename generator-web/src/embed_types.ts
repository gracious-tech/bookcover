
// Protocol types for embedding the cover-editor widget in an iframe. The host sends one
// InitMessage in reply to the widget's 'ready' message; the widget reports edits back with
// WidgetMessage. Binaries (background image, custom font bytes) always travel as separate
// structured-clone fields beside the pure-JSON form values, so hosts can persist `data`
// as-is (e.g. to Firestore) and store the binaries elsewhere.

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
    // Previously uploaded font families to restore into the editor
    custom_fonts?: CustomFont[]
    // Swap the export button for a "Finished" signal, and show a Cancel button
    finished_mode?: boolean
    // Hide the Book Size sidebar section entirely
    hide_size_section?: boolean
    locale?: AppLocale
}

/** Widget -> host. `schema` is the renderable generator schema derived from `data` (also
 *  derivable host-side via build_schema). `bg_image` rides on every data/finished message
 *  (cloning a File is cheap); `custom_fonts` byte arrays are expensive to clone, so on 'data'
 *  messages the field is only present when the font set changed since the last message
 *  (absent = unchanged), while 'finished' always carries the complete array. */
export type WidgetMessage =
    | {type: 'ready'}
    | {type: 'data', data: EmbedFormState, schema: Record<string, unknown>,
        bg_image: File | null, custom_fonts?: CustomFont[]}
    | {type: 'finished', data: EmbedFormState, schema: Record<string, unknown>,
        bg_image: File | null, custom_fonts: CustomFont[]}
    | {type: 'cancelled'}
