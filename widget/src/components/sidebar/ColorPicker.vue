
<template lang="pug">

//- ColorPicker: text button with chosen color as background; X to clear

div(
    class="flex items-center rounded overflow-hidden w-fit min-w-50"
    :class="!modelValue ? 'bg-default border border-default text-default' : ''"
    :style="modelValue ? {background: modelValue, color: contrast_color} : {}"
)
    //- Main button area: label wraps hidden input to trigger native color picker
    label(class="relative flex items-center gap-1.5 px-2.5 h-7 text-sm font-medium cursor-pointer select-none flex-1")
        input(
            type="color"
            :value="modelValue ?? '#000000'"
            class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            @input="on_input"
        )
        span(class="pointer-events-none relative") {{ label }}
    //- X clear button: only when clearable and a color is set
    button(
        v-if="clearable && modelValue"
        type="button"
        class="h-7 px-1.5 flex items-center cursor-pointer"
        :aria-label="t('common.clear_color_aria')"
        @click="emit('update:modelValue', null)"
    )
        UIcon(name="material-symbols:close" class="w-3 h-3 relative")

</template>

<script setup lang="ts">
// ColorPicker — button whose background is the chosen color, with contrast-aware text

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'

const props = withDefaults(defineProps<{
    modelValue:string | null
    label?:string
    clearable?:boolean
}>(), {
    label: '',
    clearable: true,
})

const emit = defineEmits<{
    (e:'update:modelValue', value:string | null): void
}>()

const {t} = useI18n()

// CSS classes for the label button: rounding and fallback colors when no value is set
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings in new files
const label_classes = computed(() => [
    props.modelValue
        ? (props.clearable ? 'rounded-l' : 'rounded')
        : 'rounded bg-default border border-default text-(--ui-text)',
])

// White or black text, whichever contrasts more against the chosen color (ITU-R BT.601)
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings in new files
const contrast_color = computed(() => {
    if (!props.modelValue) return ''
    const hex = props.modelValue.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5 ? '#000000' : '#ffffff'
})

// Debounce timer — emit only after period of no changes
const debounce_timer = ref<ReturnType<typeof setTimeout> | null>(null)

/** Debounce color input: emit to v-model only after period of no changes */
function on_input(e:Event): void {
    const value = (e.target as HTMLInputElement).value
    if (debounce_timer.value !== null) clearTimeout(debounce_timer.value)
    debounce_timer.value = setTimeout(() => emit('update:modelValue', value), 800)
}
</script>
