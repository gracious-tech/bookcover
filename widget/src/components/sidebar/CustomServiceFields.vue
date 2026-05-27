
<template lang="pug">

div(class='flex flex-row gap-[24px]')

    //- Bleed field
    div(class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Bleed
        UInput(type="number" v-model.number="form.custom_bleed" :min="0" :step="0.001")

    //- Spine width field
    div(class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Spine width
        UInput(type="number" v-model.number="form.custom_spine" :min="0" :step="0.001")

</template>

<script setup lang="ts">
// Custom service fields — bleed and spine inputs, units driven by parent SizeSection

import {inject} from 'vue'
import {FORM_KEY} from '../../form_state'

// Inject the shared form state
const form = inject(FORM_KEY)!
</script>
