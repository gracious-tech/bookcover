
// Shared cover dimension computation — used by the preview pane and background DPI checks

import {resolve_dimensions} from 'bookcover-web'
import type {FormState} from './form_state'

/** Compute cover dimensions (in mm) from the current form state. A thin wrapper around
 *  bookcover-web's resolve_dimensions — FormState's fields are a structural match for what it
 *  needs (see DimensionInputs) — kept under this name/signature since it's called from several
 *  places here; this used to be its own duplicate implementation and had drifted out of sync
 *  (it never passed paper_type/ink_type, which KDP and ctrlprint both require for an accurate
 *  spine width, so image-region sampling/DPI checks/preview sizing could disagree with what
 *  generate() itself computes for those services). */
export function compute_cover_dims(form:FormState) {
    // size_mode is the form's own field — DimensionInputs has no notion of it and keys off
    // size_id alone, so custom mode must drop size_id here exactly as build_schema() does.
    // Otherwise a record carrying a stale preset id (which a host may still hold, and which
    // the editor itself used to write) resolves the preset size here while generate() renders
    // the custom trim
    return resolve_dimensions(form.size_mode === 'custom' ? {...form, size_id: undefined} : form)
}
