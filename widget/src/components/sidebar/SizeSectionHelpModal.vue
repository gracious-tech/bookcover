
<template lang="pug">

//- Modal explaining why size/print options must be accurate

UModal(:open="open_model" @update:open="open_model = $event"
        title="All size options must be accurate" :close='false'
        :ui="{content: 'max-w-sm', footer: 'justify-end'}")

    template(#body)
        div(class="flex flex-col gap-4 text-sm")

            //- Core reason: all options affect cover dimensions
            p
                | Every option in this section directly affects the final dimensions of the cover file.
                | Getting them wrong means your generated cover won't fit your book properly,
                | and may have white edges or be out of alignment when printed.

            //- Explain the less obvious ones
            div(class="flex flex-col gap-2")
                p(class="font-semibold") This includes less obvious options like:
                ul(class="flex flex-col gap-1.5 px-4 list-inside text-(--ui-text-muted)")
                    li
                        | #[strong Page count] — more pages means a thicker spine.
                    li
                        | #[strong Paper type] — thicker paper makes the spine wider.
                    li
                        | #[strong Ink type] — some services use different paper
                        |  per ink type, which also changes the spine.

            p We only list options that matter to the size. Printing services will often have more options to choose from than these, but they won't affect the size of the cover.

    template(#footer)
        UButton(type="button" color="neutral" variant="subtle" size="sm" @click="open_model = false") Got it

</template>

<script setup lang="ts">
// SizeSectionHelpModal — explains that all print options affect final cover dimensions

import {computed} from 'vue'

const props = defineProps<{open:boolean}>()
const emit = defineEmits<{(e:'update:open', val:boolean):void}>()

// Two-way binding for modal open state
const open_model = computed({
    get: () => props.open,
    set: (val) => emit('update:open', val),
})
</script>
