
<template lang="pug">

//- Reusable font style panel: size slider, weight, italic, font family, and color

div(class="p-3 flex flex-col gap-4 w-100")

    //- Size slider (relative multiplier)
    div(class="flex flex-col gap-1")
        span(class="text-xs font-semibold") Size
        LogSlider(
            :modelValue="size"
            :min="0.25"
            :max="4"
            log
            suffix="x"
            @update:modelValue="$emit('update:size', $event)"
        )

    //- Font family chooser
    FontChooser(
        :modelValue="font"
        label="Font"
        :preview_text="preview_text"
        @update:modelValue="$emit('update:font', $event)"
    )

    //- Bold and italic toggles
    div(class="flex items-center gap-4")
        UCheckbox(
            :modelValue="weight >= 700"
            label="Bold"
            @update:modelValue="$emit('update:weight', $event ? 700 : 400)"
        )
        UCheckbox(
            :modelValue="italic"
            label="Italic"
            @update:modelValue="$emit('update:italic', $event)"
        )

    //- Color override (clearable — null = use derived color)
    div
        ColorPicker(
            :modelValue="color"
            :label="color ? 'Color' : 'Color (auto)'"
            :clearable="true"
            @update:modelValue="$emit('update:color', $event)"
        )

    //- Position selector (top / middle / bottom) — only shown when prop is provided
    div(v-if="position !== undefined" class="flex flex-col gap-1 w-50")
        span(class="text-xs font-semibold") Position on cover
        USelect(
            :modelValue="position"
            :items="POSITION_OPTIONS"
            size="sm"
            @update:modelValue="$emit('update:position', $event)"
        )

    //- Alignment toggle buttons (left / center / right) — only shown when prop is provided
    div(v-if="alignment !== undefined" class="flex flex-col gap-1")
        span(class="text-xs font-semibold") Alignment
        div(class="flex gap-1")
            UButton(
                type="button"
                icon="material-symbols:format-align-left"
                :color="alignment === 'left' ? 'primary' : 'neutral'"
                :variant="alignment === 'left' ? 'soft' : 'ghost'"
                size="sm"
                aria-label="Align left"
                @click="$emit('update:alignment', 'left')"
            )
            UButton(
                type="button"
                icon="material-symbols:format-align-center"
                :color="alignment === 'center' ? 'primary' : 'neutral'"
                :variant="alignment === 'center' ? 'soft' : 'ghost'"
                size="sm"
                aria-label="Align center"
                @click="$emit('update:alignment', 'center')"
            )
            UButton(
                type="button"
                icon="material-symbols:format-align-right"
                :color="alignment === 'right' ? 'primary' : 'neutral'"
                :variant="alignment === 'right' ? 'soft' : 'ghost'"
                size="sm"
                aria-label="Align right"
                @click="$emit('update:alignment', 'right')"
            )

</template>

<script setup lang="ts">
// FontStyleOptions — reusable panel with size, weight, italic, font, and color controls

import FontChooser from './FontChooser.vue'
import ColorPicker from './ColorPicker.vue'
import LogSlider from '../LogSlider.vue'

defineProps<{
    size:number
    italic:boolean
    weight:number
    font:string
    color:string | null
    position?:'top' | 'middle' | 'bottom'
    alignment?:'center' | 'left' | 'right'
    preview_text?:string
}>()

defineEmits<{
    'update:size': [value:number]
    'update:italic': [value:boolean]
    'update:weight': [value:number]
    'update:font': [value:string]
    'update:color': [value:string | null]
    'update:position': [value:'top' | 'middle' | 'bottom']
    'update:alignment': [value:'center' | 'left' | 'right']
}>()

// Position options for the front cover box
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const POSITION_OPTIONS = [
    {label: 'Top', value: 'top'},
    {label: 'Middle', value: 'middle'},
    {label: 'Bottom', value: 'bottom'},
]


</script>
