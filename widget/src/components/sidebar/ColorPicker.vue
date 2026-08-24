
<template lang="pug">

//- ColorPicker: text button with chosen color as background; X inside to clear a chosen color,
//- plus an "Auto" button outside the field when clear_mode makes auto a valid target — clicking
//- it sets auto directly, or (clear_mode="auto_none") toggles auto <-> none once already empty

div(class="flex items-center gap-1.5 w-fit")
    div(
        class="flex items-center rounded overflow-hidden min-w-50"
        :class="!modelValue ? 'bg-default border border-default text-default' : ''"
        :style="modelValue ? {background: modelValue, color: text_color} : {}"
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
        //- X: whenever none/transparent is reachable and not already the current value — for
        //- clear_mode="auto" the Auto button alone covers clearing, so X never shows there
        button(
            v-if="show_x"
            type="button"
            class="h-7 px-1.5 flex items-center cursor-pointer"
            :aria-label="t('common.clear_color_aria')"
            @click="emit('update:modelValue', null)"
        )
            UIcon(name="material-symbols:close" class="w-3 h-3 relative")
    //- Auto button: whenever auto is reachable and not already the current value
    UButton(
        v-if="auto_button"
        type="button"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('update:modelValue', auto_button.target)"
    ) {{ auto_button.label }}

</template>

<script setup lang="ts">
// ColorPicker — button whose background is the chosen color, with contrast-aware text

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {contrast_color} from '../../svg_utils'

const props = withDefaults(defineProps<{
    modelValue:string | null | undefined
    label?:string
    // 'auto' / 'none': field only ever clears to that one empty value (null)
    // 'auto_none': field distinguishes undefined (auto) from null (none/transparent)
    clear_mode?:'auto' | 'none' | 'auto_none'
}>(), {
    label: '',
    clear_mode: undefined,
})

const emit = defineEmits<{
    (e:'update:modelValue', value:string | null | undefined): void
}>()

const {t} = useI18n()

// X: shown whenever none/transparent is a reachable target and isn't the current value
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings in new files
const show_x = computed(() => {
    return (props.clear_mode === 'none' || props.clear_mode === 'auto_none')
        && props.modelValue !== null
})

// Auto button config: label + the value clicking it sets (always undefined for auto_none,
// null for plain "auto"). null when auto isn't an option, or it's already the current value
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings in new files
const auto_button = computed(() => {
    if (props.clear_mode === 'auto_none')
        return props.modelValue !== undefined ? {label: t('common.auto'), target: undefined} : null
    if (props.clear_mode === 'auto')
        return props.modelValue !== null ? {label: t('common.auto'), target: null} : null
    return null
})

// White or black text, whichever contrasts more against the chosen color
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings in new files
const text_color = computed(() => props.modelValue ? contrast_color(props.modelValue) : '')

// Debounce timer — emit only after period of no changes
const debounce_timer = ref<ReturnType<typeof setTimeout> | null>(null)

/** Debounce color input: emit to v-model only after period of no changes */
function on_input(e:Event): void {
    const value = (e.target as HTMLInputElement).value
    if (debounce_timer.value !== null) clearTimeout(debounce_timer.value)
    debounce_timer.value = setTimeout(() => emit('update:modelValue', value), 800)
}
</script>
