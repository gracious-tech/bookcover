
import {describe, it, expect} from 'vitest'
import {ref, nextTick} from 'vue'

import {modal_open_count, use_modal_tracking} from '../src/modal_state'


describe('use_modal_tracking', () => {

    it('counts open modals, never going below zero', async () => {
        const first = ref(false)
        const second = ref(false)
        use_modal_tracking(first)
        use_modal_tracking(second)
        expect(modal_open_count.value).toBe(0)

        // Opening both, then closing one at a time
        first.value = true
        second.value = true
        await nextTick()
        expect(modal_open_count.value).toBe(2)
        first.value = false
        await nextTick()
        expect(modal_open_count.value).toBe(1)
        second.value = false
        await nextTick()
        expect(modal_open_count.value).toBe(0)

        // A close with nothing counted open (the count was reset elsewhere) stays at zero
        second.value = true
        await nextTick()
        modal_open_count.value = 0
        second.value = false
        await nextTick()
        expect(modal_open_count.value).toBe(0)
    })

    it('counts a modal that mounts already open, until it closes', async () => {
        modal_open_count.value = 0
        const open = ref(true)
        use_modal_tracking(open)
        expect(modal_open_count.value).toBe(1)
        open.value = false
        await nextTick()
        expect(modal_open_count.value).toBe(0)
    })
})
