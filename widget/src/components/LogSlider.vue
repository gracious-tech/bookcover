
<template lang="pug">

//- Unified slider with optional logarithmic mapping and debounced output.
div(:class="is_vertical ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2 grow'")
    USlider(
        :modelValue="display_value"
        :min="slider_min"
        :max="slider_max"
        :step="slider_step"
        v-bind="$attrs"
        :class="is_vertical ? '' : 'flex-1'"
        @update:modelValue="on_slide"
    )
    span(v-if="suffix || format" :class="is_vertical ? 'text-xs shrink-0' : 'text-xs w-8 text-right shrink-0'") {{ formatted_value }}

</template>

<script setup lang="ts">

// Universal slider component — replaces direct USlider usage everywhere.
// Supports both linear and logarithmic modes, and debounces output so generation
// only triggers after the user stops dragging.

import {ref, computed, watch, onBeforeUnmount, useAttrs} from 'vue'

defineOptions({inheritAttrs: false})

const attrs = useAttrs()

// Detect vertical orientation to adjust label placement
const is_vertical = computed(() => attrs.orientation === 'vertical')

const props = withDefaults(defineProps<{
    modelValue:number
    min:number
    max:number
    step?:number
    log?:boolean
    instant?:boolean
    suffix?:string
    format?:(value:number) => string
}>(), {
    log: false,
})

const emit = defineEmits<{
    'update:modelValue': [value:number]
}>()

// Internal display value tracks the slider position in real-time (no debounce)
const internal_value = ref(props.modelValue)

// Sync internal value when parent changes (e.g. reset)
watch(() => props.modelValue, (v) => {
    internal_value.value = v
})

// Convert real value to log-space position
function to_log(value:number):number {
    return Math.log(value)
}

// Convert log-space position back to real value, rounded to avoid float noise
function from_log(log_value:number):number {
    const raw = Math.exp(log_value)
    return Math.round(raw * 100) / 100
}

// Slider bounds and step depend on mode
const slider_min = computed(() => props.log ? to_log(props.min) : props.min)
const slider_max = computed(() => props.log ? to_log(props.max) : props.max)
const slider_step = computed(() => {
    if (props.log) {
        return (to_log(props.max) - to_log(props.min)) / 100
    }
    return props.step ?? 1
})

// Display value in slider-space (log or linear)
const display_value = computed(() => props.log ? to_log(internal_value.value) : internal_value.value)

// Formatted label using internal_value for instant feedback
const formatted_value = computed(() => {
    if (props.format) {
        return props.format(internal_value.value)
    }
    // Auto-detect decimal places from step
    let decimals = props.log ? 1 : 0
    if (props.step) {
        const str = props.step.toString()
        const dot = str.indexOf('.')
        if (dot !== -1)
            decimals = str.length - dot - 1
    }
    return internal_value.value.toFixed(decimals) + props.suffix
})

// Debounce timer for emitting to parent
let debounce_timer:ReturnType<typeof setTimeout> | null = null

// Handle slider input — update display immediately, debounce the emit
function on_slide(slider_value:number):void {
    const real_value = props.log ? from_log(slider_value) : slider_value
    internal_value.value = real_value

    if (props.instant) {
        emit('update:modelValue', real_value)
        return
    }
    if (debounce_timer !== null) {
        clearTimeout(debounce_timer)
    }
    debounce_timer = setTimeout(() => {
        emit('update:modelValue', real_value)
    }, 800)
}

// Clean up timer on unmount
onBeforeUnmount(() => {
    if (debounce_timer !== null) {
        clearTimeout(debounce_timer)
    }
})

</script>
