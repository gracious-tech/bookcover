
import {ref, watch} from 'vue'
import type {Ref} from 'vue'

// Tracks how many full-screen modals (with overlay) are currently open.
// Used by PreviewPane to defer generation until all modals are closed.
export const modal_open_count = ref(0)

/** Call inside a full-screen modal's setup() to register it with the modal tracker. */
export function use_modal_tracking(open:Ref<boolean>):void {
    watch(open, (is_open) => {
        if (is_open)
            modal_open_count.value++
        else
            modal_open_count.value = Math.max(0, modal_open_count.value - 1)
    })
}
