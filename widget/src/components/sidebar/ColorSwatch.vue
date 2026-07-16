
<template lang="pug">

//- ColorSwatch: compact square color picker; shows palette icon when no color is set

div(class="relative shrink-0")
    //- Swatch: clicking opens native color picker; palette icon shown when null
    label(
        class="w-8 h-8 rounded hover:bg-accented cursor-pointer flex items-center justify-center relative overflow-hidden block"
        :class="modelValue ? 'border-transparent' : 'border-default'"
        :style="modelValue ? {background: modelValue} : {}"
        :title="modelValue ?? t('common.set_color_title')"
    )
        input(
            type="color"
            :value="modelValue ?? '#000000'"
            class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            @input="on_input"
        )
        UIcon(v-if="!modelValue" name="material-symbols:palette" class="w-4 h-4 text-muted pointer-events-none relative")
    //- Clear badge in top-right corner when clearable and a color is set
    button(
        v-if="clearable && modelValue"
        type="button"
        class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-inverted text-inverted border border-default flex items-center justify-center cursor-pointer z-10"
        :aria-label="t('common.clear_color_aria')"
        @click.stop="emit('update:modelValue', null)"
    )
        UIcon(name="material-symbols:remove" class="w-2.5 h-2.5")

</template>

<script setup lang="ts">
// ColorSwatch — compact square swatch that opens a native color picker on click

import {ref} from 'vue'
import {useI18n} from 'vue-i18n'

const props = withDefaults(defineProps<{
    modelValue:string | null
    clearable?:boolean
}>(), {
    clearable: false,
})

const emit = defineEmits<{
    (e:'update:modelValue', value:string | null): void
}>()

const {t} = useI18n()

// Debounce timer — emit only after 2s of no changes
const debounce_timer = ref<ReturnType<typeof setTimeout> | null>(null)

/** Debounce color input: emit to v-model only after 2s of no changes */
function on_input(e:Event): void {
    const value = (e.target as HTMLInputElement).value
    if (debounce_timer.value !== null) clearTimeout(debounce_timer.value)
    debounce_timer.value = setTimeout(() => emit('update:modelValue', value), 2000)
}
</script>
