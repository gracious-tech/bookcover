
<template lang="pug">

//- Modal explaining Iconify and how to find/enter a custom icon ID

UModal(:open="open_model" @update:open="open_model = $event" :ui="{content: 'max-w-sm'}")
    template(#header)
        p(class="text-lg font-semibold") {{ t('iconify_help.title') }}

    template(#body)
        div(class="flex flex-col gap-4 text-sm")

            //- What is Iconify
            p
                | {{ t('iconify_help.intro') }}

            //- How to find and use an icon
            div(class="flex flex-col gap-2")
                p(class="font-semibold") {{ t('iconify_help.instructions_heading') }}
                ol(class="flex flex-col gap-1.5 list-decimal list-inside text-(--ui-text-muted)")
                    li
                        | {{ t('iconify_help.step1') }}
                    li
                        | {{ t('iconify_help.step2') }}
                    li
                        | {{ t('iconify_help.step3_prefix') }}&nbsp;
                        code(class="font-mono bg-(--ui-bg-elevated) px-1 rounded text-xs") collection:icon-name
                        | {{ t('iconify_help.step3_suffix') }}
                    li
                        | {{ t('iconify_help.step4') }}

            //- Link to site + dismiss inline
            div(class="flex gap-2 justify-between")
                UButton(
                    as="a"
                    href="https://icon-sets.iconify.design"
                    target="_blank"
                    rel="noopener"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    trailing-icon="material-symbols:open-in-new"
                ) {{ t('iconify_help.open_button') }}
                UButton(type="button" color="neutral" variant="subtle" size="sm" @click="open_model = false") {{ t('iconify_help.dismiss_button') }}


</template>

<script setup lang="ts">
// IconifyHelpModal — explains what Iconify is and how to enter a custom icon ID

import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

const props = defineProps<{open:boolean}>()
const emit = defineEmits<{(e:'update:open', val:boolean):void}>()

const {t} = useI18n()

// Two-way binding for modal open state
const open_model = computed({
    get: () => props.open,
    set: (val) => emit('update:open', val),
})
</script>
