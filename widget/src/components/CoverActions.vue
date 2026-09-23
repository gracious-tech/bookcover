
<template lang="pug">

//- Save image, then Export PDF — or Finished in embed mode. Save is icon-only and the primary
//- button small on mobile

div(v-if="preview_exports" class="flex items-center gap-2")
    //- Context-sensitive save button — output depends on active view mode
    UButton(
        v-if="preview_exports.has_preview"
        :label="is_mobile ? undefined : preview_exports.save_label"
        :icon="is_mobile ? 'material-symbols:image' : undefined"
        color="neutral"
        :variant="is_mobile ? 'ghost' : 'outline'"
        class="cursor-pointer"
        :aria-label="preview_exports.save_label"
        :loading="preview_exports.is_saving"
        :disabled="preview_exports.is_saving"
        @click="preview_exports.save_image()"
    )
    //- Embed mode: signal the parent instead of exporting locally
    UButton(
        v-if="finished_mode"
        :size="is_mobile ? 'sm' : undefined"
        color="primary"
        variant='solid'
        class="cursor-pointer"
        @click="on_finished"
    ) {{ t('preview.finished_button') }}
    //- Export PDF (single), or Export PDFs in Parts view (split parts as zip)
    UButton(
        v-else
        :size="is_mobile ? 'sm' : undefined"
        color="primary"
        variant='solid'
        class="cursor-pointer"
        :disabled="!preview_exports.is_ready || preview_exports.is_exporting"
        :loading="preview_exports.is_exporting"
        @click="preview_exports.export_pdf()"
    ) {{ preview_exports.export_label }}

    //- Save-or-discard dialog for Finished, dismissable (X/Escape/backdrop) to keep editing
    UModal(
        :open="finish_confirm_open"
        @update:open="finish_confirm_open = $event"
        :title="t('preview.finish_confirm_title')"
        :ui="{content: 'max-w-sm', footer: 'justify-between gap-2'}"
    )
        template(#footer)
            UButton(type="button" color="error" variant="soft" size="lg" @click="do_discard") {{ t('preview.finish_confirm_discard') }}
            UButton(type="button" color="primary" variant="solid" size="lg" @click="do_save") {{ t('preview.finish_confirm_save') }}

</template>

<script setup lang="ts">

// Cover save/export/finish actions — shown in the preview toolbar, and in the sidebar header on
// mobile

import {ref, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {FORM_KEY, IS_MOBILE_KEY, PREVIEW_EXPORTS_KEY} from '../form_state'
import {finished_mode, notify_finished, notify_cancelled, is_form_dirty} from '../embed'

// Injected shared state — preview_exports is null until PreviewPane sets it
const form = inject(FORM_KEY)!
const is_mobile = inject(IS_MOBILE_KEY)!
const preview_exports = inject(PREVIEW_EXPORTS_KEY)!

const {t} = useI18n()

// Controls the save-or-discard modal
const finish_confirm_open = ref(false)

/** Finished: ask save-or-discard when there are unsaved edits, otherwise finish immediately
 *  (an untouched preset still counts as accepted, so the host gets 'finished' not 'cancelled') */
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
function on_finished():void {
    if (is_form_dirty(form)) {
        finish_confirm_open.value = true
    }
    else {
        notify_finished(form)
    }
}

/** Discard: close the dialog and signal the parent to drop the session's edits */
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
function do_discard():void {
    finish_confirm_open.value = false
    notify_cancelled()
}

/** Save: close the dialog and hand the final form back to the parent */
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
function do_save():void {
    finish_confirm_open.value = false
    notify_finished(form)
}

</script>
