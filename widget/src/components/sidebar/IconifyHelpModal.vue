
<template lang="pug">

//- Modal explaining Iconify and how to find/enter a custom icon ID

UModal(:open="open_model" @update:open="open_model = $event" :ui="{content: 'max-w-sm'}")
    template(#header)
        p(class="text-lg font-semibold") Search more icons

    template(#body)
        div(class="flex flex-col gap-4 text-sm")

            //- What is Iconify
            p
                | You can search Iconify for more icons, which is a free icon library with over 200,000 icons.

            //- How to find and use an icon
            div(class="flex flex-col gap-2")
                p(class="font-semibold") How to add a custom icon:
                ol(class="flex flex-col gap-1.5 list-decimal list-inside text-(--ui-text-muted)")
                    li
                        | Visit the icon website below and search for any icon.
                    li
                        | Click an icon to open its detail page.
                    li
                        | Copy its ID — it looks like&nbsp;
                        code(class="font-mono bg-(--ui-bg-elevated) px-1 rounded text-xs") collection:icon-name
                        | .
                    li
                        | Paste or type the ID into the icon field.

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
                ) Open Iconify
                UButton(type="button" color="neutral" variant="subtle" size="sm" @click="open_model = false") Dismiss


</template>

<script setup lang="ts">
// IconifyHelpModal — explains what Iconify is and how to enter a custom icon ID

import {computed} from 'vue'

const props = defineProps<{open:boolean}>()
const emit = defineEmits<{(e:'update:open', val:boolean):void}>()

// Two-way binding for modal open state
const open_model = computed({
    get: () => props.open,
    set: (val) => emit('update:open', val),
})
</script>
