
<template lang="pug">

//- Modal explaining how to download fonts from Google Fonts and upload them

UModal(:open="open_model" @update:open="open_model = $event" :ui="{content: 'max-w-sm'}")
    template(#header)
        p(class="text-lg font-semibold") {{ t('font_upload.title') }}

    template(#body)
        div(class="flex flex-col gap-4 text-sm")

            //- Instructions
            div(class="flex flex-col gap-2")
                p(class="font-semibold") {{ t('font_upload.instructions_heading') }}
                ol(class="flex flex-col gap-1.5 list-decimal list-inside text-muted")
                    li
                        | {{ t('font_upload.step1_prefix') }}&nbsp;
                        a(
                            href="https://fonts.google.com"
                            target="_blank"
                            rel="noopener"
                            class="text-highlighted underline"
                        ) fonts.google.com
                        | &nbsp;{{ t('font_upload.step1_suffix') }}
                    li {{ t('font_upload.step2') }}
                    li {{ t('font_upload.step3') }}

            //- File upload area
            label(
                class="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-default rounded-lg cursor-pointer hover:border-accented hover:bg-elevated transition-colors"
                :class="{'border-primary': is_dragging}"
                @dragenter.prevent="is_dragging = true"
                @dragover.prevent="is_dragging = true"
                @dragleave.prevent="is_dragging = false"
                @drop.prevent="on_drop"
            )
                UIcon(name="material-symbols:upload-file" class="w-8 h-8 text-muted")
                span(class="text-muted text-center") {{ t('font_upload.dropzone_text') }}
                span(class="text-xs text-dimmed") {{ t('font_upload.dropzone_filetypes') }}
                input(
                    ref="file_input"
                    type="file"
                    accept=".zip,.ttf,.otf"
                    multiple
                    class="hidden"
                    @change="on_file_select"
                )

            //- Status message
            div(v-if="status" class="text-xs flex items-center gap-1.5" :class="status_class")
                UIcon(:name="status_icon" class="w-3.5 h-3.5 shrink-0")
                span {{ status }}

            //- Action buttons
            div(class="flex gap-2 justify-end")
                UButton(type="button" color="neutral" variant="subtle" size="sm" @click="open_model = false") {{ t('common.close') }}

</template>

<script setup lang="ts">
// FontUploadModal — dialog for uploading custom font files (zip or individual)

import {ref, computed, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {process_uploaded_files} from '../../fonts'
import {use_modal_tracking} from '../../modal_state'

const props = defineProps<{open:boolean}>()
const emit = defineEmits<{
    (e:'update:open', val:boolean):void
    (e:'font-added', family:string):void
}>()

const {t} = useI18n()

// Two-way binding for modal open state
const open_model = computed({
    get: () => props.open,
    set: (val) => emit('update:open', val),
})

// Register with modal tracker so the generator defers while this modal is open
use_modal_tracking(toRef(props, 'open'))

// Drag state for visual feedback
const is_dragging = ref(false)

// Status message after upload
const status = ref('')
const status_type = ref<'success' | 'error' | 'loading'>('success')

// Status display helpers
const status_class = computed(() => ({
    'text-green-600 dark:text-green-400': status_type.value === 'success',
    'text-red-600 dark:text-red-400': status_type.value === 'error',
    'text-muted': status_type.value === 'loading',
}))

// @ts-ignore TS6133 — used in Pug template
const status_icon = computed(() => ({
    success: 'material-symbols:check-circle',
    error: 'material-symbols:error',
    loading: 'material-symbols:progress-activity',
}[status_type.value]))

// File input ref
const file_input = ref<HTMLInputElement | null>(null)

/** Process the selected or dropped files */
async function handle_files(files:File[]):Promise<void> {
    if (!files.length)
        return

    status.value = t('font_upload.status_processing')
    status_type.value = 'loading'

    try {
        const added = await process_uploaded_files(files)
        if (added.length > 0) {
            emit('font-added', added[0]!)
            open_model.value = false
        } else {
            status.value = t('font_upload.status_no_new_fonts')
            status_type.value = 'error'
        }
    } catch (err:unknown) {
        status.value = err instanceof Error ? err.message : t('font_upload.status_failed')
        status_type.value = 'error'
    }
}

/** Handle file input change event */
function on_file_select(event:Event):void {
    const input = event.target as HTMLInputElement
    if (input.files) {
        handle_files([...input.files])
        input.value = ''
    }
}

/** Handle drag-and-drop */
function on_drop(event:DragEvent):void {
    is_dragging.value = false
    if (event.dataTransfer?.files) {
        handle_files([...event.dataTransfer.files])
    }
}
</script>
