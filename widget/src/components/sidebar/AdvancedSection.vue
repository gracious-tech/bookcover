
<template lang="pug">

//- Spine title override — defaults to title1+2+3 joined
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.spine_title_label') }}
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
                :aria-label="t('advanced.spine_title_style_aria')"
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
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.spine_author_label') }}
    div(class="flex gap-1 items-stretch")
        UInput(
            v-model="form.spine_author"
            :placeholder="form.author || t('advanced.author_name_placeholder')"
            class="flex-1"
        )
        UPopover(v-model:open="spine_author_style_open" class="flex")
            UButton(
                type="button"
                color="neutral"
                variant="ghost"
                icon="material-symbols:custom-typography"
                class="h-full"
                :aria-label="t('advanced.spine_author_style_aria')"
            )
            template(#content)
                FontStyleOptions(
                    v-model:size="form.spine_author_size"
                    v-model:italic="form.spine_author_italic"
                    v-model:weight="form.spine_author_weight"
                    v-model:font="form.spine_author_font"
                    v-model:color="form.spine_author_color"
                    :preview_text="form.spine_author || form.author || t('advanced.author_name_placeholder')"
                )

//- Show icon on spine — only visible when an icon is selected
div(v-if="form.icon_id" class="flex items-center gap-2 pt-0.5")
    UCheckbox(v-model="form.icon_spine" :label="t('advanced.icon_spine_checkbox')")

//- ISBN field
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.isbn_label') }}
    UInput(v-model="form.isbn" placeholder="978-…")

//- Regional glyph style for Han characters — only affects covers containing CJK text
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.cjk_label') }}
    USelect(v-model="form.cjk_variant" :items="cjk_items")
    div(class="text-[11px] text-muted") {{ t('advanced.cjk_help_text') }}



div
    div(class='text-sm font-semibold mb-1') {{ t('advanced.positioning_heading') }}
    div(class='text-xs text-muted') {{ t('advanced.positioning_help_1') }}
        br
        | {{ t('advanced.positioning_help_2') }}


//- Page margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.page_margins_label') }}
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_front') }}
        LogSlider(v-model="form.margin_front" :min="0" :max="40" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_back') }}
        LogSlider(v-model="form.margin_back" :min="0" :max="40" :step="1" suffix="%" class="flex-1")

//- Title spacing and margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.title_margins_label') }}
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_top') }}
        LogSlider(v-model="form.title_margin_top" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_bottom') }}
        LogSlider(v-model="form.title_margin_bottom" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_lines') }}
        LogSlider(v-model="form.title_spacing" :min="0" :max="15" :step="0.5" suffix="%" class="flex-1")

//- Subtitle margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.subtitle_margins_label') }}
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_top') }}
        LogSlider(v-model="form.subtitle_margin_top" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_bottom') }}
        LogSlider(v-model="form.subtitle_margin_bottom" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_lines') }}
        LogSlider(v-model="form.subtitle_spacing" :min="0" :max="15" :step="0.5" suffix="%" class="flex-1")

//- Author margins
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('advanced.author_margins_label') }}
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_top') }}
        LogSlider(v-model="form.author_margin_top" :min="0" :max="30" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_bottom') }}
        LogSlider(v-model="form.author_margin_bottom" :min="0" :max="30" :step="1" suffix="%" class="flex-1")

//- Blurb sizing
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('common.back_blurb') }}
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_pad') }}
        LogSlider(v-model="form.blurb_padding" :min="0" :max="10" :step='0.1' suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_width') }}
        LogSlider(v-model="form.blurb_width" :min="30" :max="100" :step="1" suffix="%" class="flex-1")
    div(class="flex items-center gap-2")
        span(class="text-[11px] text-muted w-10 shrink-0") {{ t('advanced.margin_lines') }}
        LogSlider(v-model="form.blurb_spacing" :min="0.5" :max="3" :step="0.05" suffix="x" class="flex-1")



//- Reset button — opens confirmation dialog before wiping all values
div(class='text-center')
    UButton(
        type="button"
        color="error"
        variant="soft"
        icon="material-symbols:restart-alt"
        @click="confirm_open = true"
    ) {{ t('advanced.reset_all_button') }}

//- Confirmation dialog for the reset action
UModal(
    :open="confirm_open"
    @update:open="confirm_open = $event"
    :title="t('advanced.reset_confirm_title')"
    :close="false"
    :ui="{content: 'max-w-sm', footer: 'justify-between gap-2'}"
)
    template(#body)
        p(class="text-sm") {{ t('advanced.reset_confirm_body') }}

    template(#footer)
        UButton(type="button" color="neutral" variant="subtle" size="lg" @click="confirm_open = false") {{ t('common.cancel') }}
        UButton(type="button" color="error" variant="soft" size="lg" @click="do_reset") {{ t('advanced.reset_confirm_button') }}

</template>

<script setup lang="ts">
// Advanced section — spine title/author overrides, ISBN, and full reset

import {ref, computed, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {FORM_KEY, make_blank_form_values} from '../../form_state'
import {default_spine_title} from 'bookcover-web'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import FontStyleOptions from './FontStyleOptions.vue'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import LogSlider from '../LogSlider.vue'

// Inject the shared form state
const form = inject(FORM_KEY)!

const {t} = useI18n()

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
const cjk_items = computed(() => [
    {label: t('advanced.cjk_auto'), value: 'auto'},
    {label: t('advanced.cjk_sc'), value: 'SC'},
    {label: t('advanced.cjk_tc'), value: 'TC'},
    {label: t('advanced.cjk_hk'), value: 'HK'},
    {label: t('advanced.cjk_jp'), value: 'JP'},
    {label: t('advanced.cjk_kr'), value: 'KR'},
])

// Placeholder shows the derived spine title using the same util the generator uses
const spine_title_placeholder = computed(() =>
    default_spine_title(form.title1, form.title2, form.title3) || t('advanced.title_fallback_placeholder')
)


// Reset all form fields to a blank canvas state after confirmation
function do_reset() {
    Object.assign(form, make_blank_form_values())
    confirm_open.value = false
}
</script>
