
<template lang="pug">

//- Modal explaining why size/print options must be accurate

UModal(:open="open_model" @update:open="open_model = $event"
        :title="t('size_help.title')" :close='false'
        :ui="{content: 'max-w-sm', footer: 'justify-end'}")

    template(#body)
        div(class="flex flex-col gap-4 text-sm")

            //- Core reason: all options affect cover dimensions
            p
                | {{ t('size_help.body_intro') }}

            //- Explain the less obvious ones
            div(class="flex flex-col gap-2")
                p(class="font-semibold") {{ t('size_help.body_list_heading') }}
                ul(class="flex flex-col gap-1.5 px-4 list-inside text-(--ui-text-muted)")
                    li
                        | #[strong {{ t('size_help.item_page_count_label') }}] {{ t('size_help.item_page_count_rest') }}
                    li
                        | #[strong {{ t('size_help.item_paper_type_label') }}] {{ t('size_help.item_paper_type_rest') }}
                    li
                        | #[strong {{ t('size_help.item_ink_type_label') }}] {{ t('size_help.item_ink_type_rest') }}

            p {{ t('size_help.footer') }}

    template(#footer)
        UButton(type="button" color="neutral" variant="subtle" size="sm" @click="open_model = false") {{ t('size_help.got_it_button') }}

</template>

<script setup lang="ts">
// SizeSectionHelpModal — explains that all print options affect final cover dimensions

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
