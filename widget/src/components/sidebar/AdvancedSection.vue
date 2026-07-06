
<template lang="pug">

//- Spine title override — defaults to title1+2+3 joined
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") Spine title
    div(class="flex gap-1 items-stretch")
        UInput(
            v-model="form.spine_title"
            :placeholder="spine_title_placeholder"
            class="flex-1"
        )
        UPopover(v-model:open="spine_title_style_open" class="flex")
            UButton(
                type="button"
                color="neutral"
                variant="ghost"
                icon="material-symbols:custom-typography"
                class="h-full"
                aria-label="Spine title style"
            )
            template(#content)
                FontStyleOptions(
                    v-model:size="form.spine_title_size"
                    v-model:italic="form.spine_title_italic"
                    v-model:weight="form.spine_title_weight"
                    v-model:font="form.spine_title_font"
                    v-model:color="form.spine_title_color"
                    :preview_text="form.spine_title || spine_title_placeholder"
                )

//- Spine author override — defaults to author
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") Spine author
    div(class="flex gap-1 items-stretch")
        UInput(
            v-model="form.spine_author"
            :placeholder="form.author || 'Author name…'"
            class="flex-1"
        )
        UPopover(v-model:open="spine_author_style_open" class="flex")
            UButton(
                type="button"
                color="neutral"
                variant="ghost"
                icon="material-symbols:custom-typography"
                class="h-full"
                aria-label="Spine author style"
            )
            template(#content)
                FontStyleOptions(
                    v-model:size="form.spine_author_size"
                    v-model:italic="form.spine_author_italic"
                    v-model:weight="form.spine_author_weight"
                    v-model:font="form.spine_author_font"
                    v-model:color="form.spine_author_color"
                    :preview_text="form.spine_author || form.author || 'Author name'"
                )

//- Show icon on spine — only visible when an icon is selected
div(v-if="form.icon_id" class="flex items-center gap-2 pt-0.5")
    UCheckbox(v-model="form.icon_spine" label="Show icon on spine")

//- ISBN field
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") ISBN for barcode
    UInput(v-model="form.isbn" placeholder="978-…")

//- Regional glyph style for Han characters — only affects covers containing CJK text
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") Language for Han scripts
    USelect(v-model="form.cjk_variant" :items="cjk_items")
    div(class="text-[11px] text-muted") Chinese characters are drawn differently depending on the language. Only affects covers that include them.



div
    div(class='text-sm font-semibold mb-1') Positioning
    div(class='text-xs text-muted') Adjust margins and spacing relative to the height of the book.
        br
        | Some of these have minimum values that can't be removed.


//- Page margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") Page margins
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Front
        LogSlider(v-model="form.margin_front" :min="0" :max="40" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Back
        LogSlider(v-model="form.margin_back" :min="0" :max="40" :step="1" suffix="%" class="flex-1")

//- Title spacing and margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") Title margins
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Top
        LogSlider(v-model="form.title_margin_top" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Bottom
        LogSlider(v-model="form.title_margin_bottom" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Lines
        LogSlider(v-model="form.title_spacing" :min="0" :max="15" :step="0.5" suffix="%" class="flex-1")

//- Subtitle margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") Subtitle margins
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Top
        LogSlider(v-model="form.subtitle_margin_top" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Bottom
        LogSlider(v-model="form.subtitle_margin_bottom" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Lines
        LogSlider(v-model="form.subtitle_spacing" :min="0" :max="15" :step="0.5" suffix="%" class="flex-1")

//- Author margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") Author margins
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Top
        LogSlider(v-model="form.author_margin_top" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Bottom
        LogSlider(v-model="form.author_margin_bottom" :min="0" :max="30" :step="1" suffix="%" class="flex-1")

//- Blurb sizing
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") Back blurb
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Pad
        LogSlider(v-model="form.blurb_padding" :min="0" :max="10" :step='0.1' suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Width
        LogSlider(v-model="form.blurb_width" :min="30" :max="100" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") Lines
        LogSlider(v-model="form.blurb_spacing" :min="0.5" :max="3" :step="0.05" suffix="x" class="flex-1")



//- Reset button — opens confirmation dialog before wiping all values
div(class='text-center')
    UButton(
        type="button"
        color="error"
        variant="soft"
        icon="material-symbols:restart-alt"
        @click="confirm_open = true"
    ) Reset all

//- Confirmation dialog for the reset action
UModal(
    :open="confirm_open"
    @update:open="confirm_open = $event"
    title="Reset to blank?"
    :close="false"
    :ui="{content: 'max-w-sm', footer: 'justify-between gap-2'}"
)
    template(#body)
        p(class="text-sm") This will clear all text and styling — resetting the cover to a plain white blank. This cannot be undone.

    template(#footer)
        UButton(type="button" color="neutral" variant="subtle" size="lg" @click="confirm_open = false") Cancel
        UButton(type="button" color="error" variant="soft" size="lg" @click="do_reset") Reset

</template>

<script setup lang="ts">
// Advanced section — spine title/author overrides, ISBN, and full reset

import {ref, computed, inject} from 'vue'
import {FORM_KEY, make_blank_form_values} from '../../form_state'
import {default_spine_title} from 'bookcover-web'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import FontStyleOptions from './FontStyleOptions.vue'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import LogSlider from '../LogSlider.vue'

// Inject the shared form state
const form = inject(FORM_KEY)!

// Popover open state for spine style panels
const spine_title_style_open = ref(false)
const spine_author_style_open = ref(false)

// Controls the reset confirmation modal
const confirm_open = ref(false)

// Options for the Han-script language select — glyph shapes differ per region even for
// shared characters. Sentences classify themselves where possible (kana → JP, Hangul → KR,
// simplified/traditional/shinjitai-only characters → SC/TC/JP); this only breaks ties for
// all-shared-character sentences and picks HK over TC. An explicit value applies the
// tiebreak cover-wide; 'auto' resolves it per field (sentence → field → cover hierarchy).
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const cjk_items = [
    {label: "Auto detect", value: 'auto'},
    {label: "Chinese (Simplified)", value: 'SC'},
    {label: "Chinese (Traditional)", value: 'TC'},
    {label: "Chinese (Hong Kong)", value: 'HK'},
    {label: "Japanese", value: 'JP'},
    {label: "Korean", value: 'KR'},
]

// Placeholder shows the derived spine title using the same util the generator uses
const spine_title_placeholder = computed(() =>
    default_spine_title(form.title1, form.title2, form.title3) || 'Title…'
)


// Reset all form fields to a blank canvas state after confirmation
function do_reset() {
    Object.assign(form, make_blank_form_values())
    confirm_open.value = false
}
</script>
