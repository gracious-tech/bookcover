
<template lang="pug">

//- Reusable font chooser: select dropdown with font previews and upload button

div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ label }}
    div(class="flex gap-1.5")
        //- Select-style dropdown
        div(class="relative flex-1 min-w-0")
            button(
                ref="trigger_ref"
                type="button"
                class="w-full text-left pl-2.5 pr-1.5 py-1.5 text-sm bg-default border border-default rounded-[calc(var(--ui-radius)*1.5)] flex items-center gap-1 cursor-pointer"
                @click="open = !open"
                @blur="open = false"
            )
                //- Selected font name or placeholder
                span(
                    class="flex-1 truncate"
                    :style="{fontFamily: font_css(selected_family)}"
                ) {{ modelValue || t('common.auto') }}
                //- Chevron
                UIcon(
                    name="material-symbols:expand-more"
                    class="w-4 h-4 text-muted shrink-0 transition-transform"
                    :class="{'rotate-180': open}"
                )

            //- Dropdown
            div(
                v-if="open"
                class="absolute left-0 right-0 top-full mt-0.5 z-50 bg-default border border-default rounded-[calc(var(--ui-radius)*1.5)] shadow-lg overflow-y-auto max-h-64"
            )
                //- All font options (default + uploaded + bundled)
                template(v-for="item in font_list" :key="item.type === 'font' ? (item.value || '__default__') : item.label")
                    div(
                        v-if="item.type === 'header'"
                        class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dimmed"
                    ) {{ item.label }}
                    button(
                        v-else
                        type="button"
                        class="w-full text-left px-3 py-1.5 hover:bg-accented cursor-pointer"
                        :class="{'bg-accented': item.value === modelValue}"
                        @mousedown.prevent="select(item.value)"
                    )
                        div(class="text-2xl truncate leading-tight" :style="{fontFamily: font_css(item.family)}") {{ preview_text || item.family }}
                        div(class="text-xs text-muted truncate") {{ item.value ? item.family : t('common.auto') }}

        //- Upload button
        button(
            type="button"
            class="px-1.5 py-1.5 text-sm font-semibold text-muted hover:text-default cursor-pointer border border-default rounded hover:bg-elevated"
            :title="t('font_chooser.upload_title')"
            @click="show_upload = true"
        ) {{ t('font_chooser.more_button') }}

    //- Upload modal
    FontUploadModal(v-model:open="show_upload" @font-added="select")

</template>

<script setup lang="ts">
// FontChooser — select dropdown with actual font previews and custom font upload

import {ref, computed, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {get_fonts} from 'bookcover-web'
import {register_preview_fonts} from 'typst-fonts/web'
import {custom_font_families, fonts_prefix} from '../../fonts'
import FontUploadModal from './FontUploadModal.vue'

const props = defineProps<{
    label:string
    modelValue:string
    preview_text?:string
}>()

const emit = defineEmits<{
    'update:modelValue': [value:string]
}>()

const {t} = useI18n()

// Dropdown open state
const open = ref(false)

// Upload modal state
const show_upload = ref(false)

/** Select a font family: emit value and close dropdown */
function select(value:string) {
    emit('update:modelValue', value)
    open.value = false
}

// Build options from bundled fonts
const bundled = get_fonts()
const BASE_FAMILY = bundled[0].family

// Unified list of font options with section headers
type FontListItem = {type: 'font', family: string, value: string} | {type: 'header', label: string}
const font_list = computed(():FontListItem[] => {
    const items:FontListItem[] = []

    // Auto entry: inherits/fallback, emits ''
    items.push({type: 'font', family: BASE_FAMILY, value: ''})

    // Uploaded custom fonts with section header
    if (custom_font_families.length) {
        items.push({type: 'header', label: t('font_chooser.uploaded_header')})
        for (const f of custom_font_families)
            items.push({type: 'font', family: f.family, value: f.family})
    }

    // Bundled fonts grouped by category
    let last_group = ''
    for (const f of bundled) {
        if (f.group !== last_group) {
            last_group = f.group
            items.push({type: 'header', label: f.group})
        }
        items.push({type: 'font', family: f.family, value: f.family})
    }

    return items
})

// The family name of the currently selected font
const selected_family = computed(() => {
    if (!props.modelValue)
        return BASE_FAMILY
    return props.modelValue
})

/** CSS font-family value for a given family name */
function font_css(family:string):string {
    return `'${family}', serif`
}

// Register bundled fonts as @font-face for preview rendering (once globally) — the browser
// fetches each file lazily when its family first appears in rendered text
let preview_fonts_loaded = false
onMounted(() => {
    if (preview_fonts_loaded)
        return
    preview_fonts_loaded = true
    register_preview_fonts(fonts_prefix, bundled)
})
</script>
