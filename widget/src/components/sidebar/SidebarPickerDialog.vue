
<template lang="pug">

//- Teleported so the dialog escapes the sidebar's scrollable inner wrapper (which would
//- otherwise clip/scroll an absolutely-positioned descendant) while still being confined to
//- the sidebar's own box, since SidebarPanel.vue's aside.sidebar-panel is the Teleport target
//- and is position:relative. `defer` is required because that target is an ancestor of this
//- very component (rendered by the same app tree) and isn't in the DOM yet on first mount —
//- it defers target resolution until after the rest of the tree has mounted (Vue 3.5+)
Teleport(to=".sidebar-panel" defer)
    div(v-if="open" class="absolute inset-0 z-50")
        //- Backdrop — blurs the sidebar behind the dialog, click dismisses
        div(class="absolute inset-0 bg-(--ui-bg)/70 backdrop-blur-sm" @click="close")

        //- Panel — padded off the sidebar's edges so the blurred sidebar peeks around it. No
        //- @click.stop here: the backdrop's own close handler is a sibling, not an ancestor, so
        //- it's never reachable by bubbling from panel content anyway — and stopping the click
        //- would also block Coloris's color picker, which opens via a document-level click
        //- listener (see coloris.ts) that a stopped click would never reach
        div(ref="panel_el" class="absolute inset-6 flex flex-col rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) shadow-2xl overflow-hidden")
            div(class="shrink-0 border-b border-(--ui-border)")
                div(class="flex items-center justify-between px-4 py-3")
                    h2(class="text-sm font-semibold") {{ title }}
                    UButton(
                        type="button"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        icon="material-symbols:close"
                        :aria-label="t('common.close')"
                        @click="close"
                    )
                //- Pinned under the title, outside the scrolling body — for controls that need
                //- to stay in view while the body content below scrolls
                div(v-if="$slots['header-extra']" class="px-4 pb-3")
                    slot(name="header-extra")

            div(class="flex-1 overflow-y-auto px-3 pt-3 pb-16")
                slot

            div(class="shrink-0 border-t border-(--ui-border) p-3 flex items-center justify-between gap-2")
                div(class="flex items-center gap-1")
                    slot(name="footer-start")
                UButton(type="button" color="neutral" variant="solid" size="sm" @click="close") {{ t('common.done') }}

</template>

<script setup lang="ts">
// Shared overlay dialog for the sidebar's picker sections (background image, pattern, icon) —
// a bigger, non-closing alternative to a popover so users can click through many options and
// see them applied live, dismissing only via Done/Escape/backdrop click

import {ref, watch, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {is_inside_coloris_popup} from '../../coloris'

const props = defineProps<{open:boolean, title:string}>()
const emit = defineEmits<{(e:'update:open', val:boolean):void}>()

const {t} = useI18n()
const panel_el = ref<HTMLElement|null>(null)

/** Close the dialog */
function close():void {
    emit('update:open', false)
}

/** Escape key closes the dialog while it's open */
function on_keydown(e:KeyboardEvent):void {
    if (e.key === 'Escape') close()
}

// Clicks outside the panel close it, including clicks outside the sidebar itself (e.g. the
// preview pane) — the backdrop's own @click only covers clicks confined to the sidebar box.
// Coloris's popup lives outside the panel (appended straight to document.body — see
// is_inside_coloris_popup), so it needs an explicit exemption or picking a color closes
// the whole dialog before the pick registers
function on_pointerdown(e:PointerEvent):void {
    if (!panel_el.value || panel_el.value.contains(e.target as Node)) return
    if (is_inside_coloris_popup(e.target)) return
    close()
}

watch(() => props.open, (is_open) => {
    if (is_open) {
        window.addEventListener('keydown', on_keydown)
        window.addEventListener('pointerdown', on_pointerdown)
    } else {
        window.removeEventListener('keydown', on_keydown)
        window.removeEventListener('pointerdown', on_pointerdown)
    }
})
onUnmounted(() => {
    window.removeEventListener('keydown', on_keydown)
    window.removeEventListener('pointerdown', on_pointerdown)
})
</script>
