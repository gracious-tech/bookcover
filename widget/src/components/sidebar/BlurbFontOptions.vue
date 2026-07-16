
<template lang="pug">

//- Blurb font options popover panel — size, font, text color, background color
div(class="p-3 flex flex-col gap-4 w-100")
    div(class="flex flex-col gap-1")
        span(class="text-xs font-semibold") {{ t('font_style.size_label') }}
        div(class="flex items-center gap-2")
            LogSlider(
                :modelValue="size"
                :step="0.1"
                :min="0.2"
                :max="4"
                class="flex-1"
                @update:modelValue="$emit('update:size', $event)"
            )
            span(class="text-xs w-8 text-right shrink-0") {{ size.toFixed(1) }}x
    FontChooser(
        :modelValue="font"
        :label="t('font_style.font_label')"
        :preview_text="preview_text"
        @update:modelValue="$emit('update:font', $event)"
    )
    ColorPicker(
        :modelValue="color"
        :label="color ? t('blurb_font.text_color_label') : t('blurb_font.text_color_auto_label')"
        :clearable="true"
        @update:modelValue="$emit('update:color', $event)"
    )
    //- Background color: auto (derived) / transparent / custom hex
    div(class="flex items-center gap-1")
        ColorPicker(
            :modelValue="bg_color === undefined ? null : bg_color"
            :label="bg_color === undefined ? t('blurb_font.bg_auto_label') : bg_color ? t('blurb_font.bg_label') : t('blurb_font.bg_none_label')"
            :clearable="bg_color !== undefined && bg_color !== null"
            @update:modelValue="$emit('update:bg_color', $event)"
        )
        //- Auto: show X to clear; otherwise show "Auto" to switch back
        UButton(
            v-if="bg_color === undefined"
            type="button"
            icon="material-symbols:close"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('blurb_font.clear_auto_bg_aria')"
            @click="$emit('update:bg_color', null)"
        )
        UButton(
            v-else
            type="button"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="$emit('update:bg_color', undefined)"
        ) {{ t('common.auto') }}
    //- Alignment toggle buttons (left / center / right / justified)
    div(class="flex flex-col gap-1")
        span(class="text-xs font-semibold") {{ t('font_style.alignment_label') }}
        div(class="flex gap-1")
            UButton(
                type="button"
                icon="material-symbols:format-align-left"
                :color="alignment === 'left' ? 'primary' : 'neutral'"
                :variant="alignment === 'left' ? 'soft' : 'ghost'"
                size="sm"
                :aria-label="t('font_style.align_left_aria')"
                @click="$emit('update:alignment', 'left')"
            )
            UButton(
                type="button"
                icon="material-symbols:format-align-center"
                :color="alignment === 'center' ? 'primary' : 'neutral'"
                :variant="alignment === 'center' ? 'soft' : 'ghost'"
                size="sm"
                :aria-label="t('font_style.align_center_aria')"
                @click="$emit('update:alignment', 'center')"
            )
            UButton(
                type="button"
                icon="material-symbols:format-align-right"
                :color="alignment === 'right' ? 'primary' : 'neutral'"
                :variant="alignment === 'right' ? 'soft' : 'ghost'"
                size="sm"
                :aria-label="t('font_style.align_right_aria')"
                @click="$emit('update:alignment', 'right')"
            )
            UButton(
                type="button"
                icon="material-symbols:format-align-justify"
                :color="alignment === 'justified' ? 'primary' : 'neutral'"
                :variant="alignment === 'justified' ? 'soft' : 'ghost'"
                size="sm"
                :aria-label="t('blurb_font.justify_aria')"
                @click="$emit('update:alignment', 'justified')"
            )

</template>

<script setup lang="ts">
// Popover panel for blurb font styling — size, font, text color, background color
import {useI18n} from 'vue-i18n'
import FontChooser from './FontChooser.vue'
import ColorPicker from './ColorPicker.vue'
import LogSlider from '../LogSlider.vue'

defineProps<{
    size:number
    font:string
    color:string | null
    bg_color:string | null | undefined
    alignment:'center' | 'left' | 'right' | 'justified'
    preview_text?:string
}>()

defineEmits<{
    'update:size': [value:number]
    'update:font': [value:string]
    'update:color': [value:string | null]
    'update:bg_color': [value:string | null | undefined]
    'update:alignment': [value:'center' | 'left' | 'right' | 'justified']
}>()

const {t} = useI18n()

</script>
