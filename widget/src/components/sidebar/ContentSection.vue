
<template lang="pug">

//- Content section: title fields, subtitle, author, isbn, blurb

//- Title fields — three independent single-line inputs, each with a style popover
div(class="flex flex-col gap-2")
    label(class="text-xs font-semibold tracking-[0.02em]")
        | {{ t('content.title_label') }}
    template(v-for="(key, i) in TITLE_KEYS" :key="key")
        div(v-if="i === 0 || (i === 1 ? show_title2 : show_title3)" class="flex gap-1 items-stretch")
            UInput(
                v-model="form[key]"
                :placeholder="t('content.title_placeholder', {n: i + 1})"
                class="flex-1"
                :ui="{base: text_align_class(form.title_alignment)}"
                @keydown="block_enter"
            )
            UPopover(v-model:open="title_style_open[i]" class="flex")
                UButton(
                    type="button"
                    color="neutral"
                    variant="ghost"
                    icon="material-symbols:custom-typography"
                    class="h-full"
                    :aria-label="t('content.title_style_aria', {n: i + 1})"
                )
                template(#content)
                    FontStyleOptions(
                        v-model:position="form.title_position"
                        v-model:alignment="form.title_alignment"
                        v-model:size="form[size_key(key)]"
                        v-model:italic="form[italic_key(key)]"
                        v-model:weight="form[weight_key(key)]"
                        v-model:font="form[font_key(key)]"
                        v-model:color="form[color_key(key)]"
                        :preview_text="form[key]"
                    )

//- Subtitle field with style popover
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('content.subtitle_label') }}
    div(class="flex gap-1 items-stretch")
        UTextarea(v-model="form.subtitle" :rows="2" resize="none" class="flex-1" :ui="{base: text_align_class(form.subtitle_alignment)}" @keydown="limit_subtitle")
        UPopover(v-model:open="subtitle_style_open" class="flex")
            UButton(
                type="button"
                color="neutral"
                variant="ghost"
                icon="material-symbols:custom-typography"
                class="h-full"
                :aria-label="t('content.subtitle_style_aria')"
            )
            template(#content)
                FontStyleOptions(
                    v-model:position="form.subtitle_position"
                    v-model:alignment="form.subtitle_alignment"
                    v-model:size="form.subtitle_size"
                    v-model:italic="form.subtitle_italic"
                    v-model:weight="form.subtitle_weight"
                    v-model:font="form.subtitle_font"
                    v-model:color="form.subtitle_color"
                    :preview_text="form.subtitle"
                )

//- Author field with style popover
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('content.author_label') }}
    div(class="flex gap-1 items-stretch")
        UInput(v-model="form.author" class="flex-1" :ui="{base: text_align_class(form.author_alignment)}")
        UPopover(v-model:open="author_style_open" class="flex")
            UButton(
                type="button"
                color="neutral"
                variant="ghost"
                icon="material-symbols:custom-typography"
                class="h-full"
                :aria-label="t('content.author_style_aria')"
            )
            template(#content)
                FontStyleOptions(
                    v-model:position="form.author_position"
                    v-model:alignment="form.author_alignment"
                    v-model:size="form.author_size"
                    v-model:italic="form.author_italic"
                    v-model:weight="form.author_weight"
                    v-model:font="form.author_font"
                    v-model:color="form.author_color"
                    :preview_text="form.author"
                )

//- Back blurb — readonly 4-line preview, click to open WYSIWYG markdown editor; style popover on the right
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('common.back_blurb') }}
    div(class="flex gap-1 items-stretch")
        div(
            class="cursor-pointer flex-1 rounded-md border border-default px-3 py-2 text-[13px] leading-relaxed hover:border-accented transition-colors select-none bg-default"
            role="button"
            :aria-label="t('content.blurb_edit_aria')"
            @click="is_blurb_open = true"
        )
            div(
                v-if="form.blurb"
                class="line-clamp-4 text-default [&_strong]:font-bold [&_em]:italic [&_h1]:text-[15px] [&_h1]:font-bold [&_h2]:text-[14px] [&_h2]:font-bold [&_:where(p,h1,h2,ul,ol,blockquote)]:m-0 [&_ul]:list-disc [&_ol]:list-decimal [&_:where(ul,ol)]:pl-4 [&_blockquote]:pl-2 [&_blockquote]:border-l-2 [&_blockquote]:border-default [&_hr]:my-1"
                v-html="blurb_preview_html"
            )
            div(v-else class="text-dimmed italic") {{ t('content.blurb_empty_placeholder') }}
        UPopover(v-model:open="blurb_style_open" class="flex")
            UButton(
                type="button"
                color="neutral"
                variant="ghost"
                icon="material-symbols:custom-typography"
                class="h-full"
                :aria-label="t('content.blurb_style_aria')"
            )
            template(#content)
                BlurbFontOptions(
                    v-model:size="form.blurb_size"
                    v-model:font="form.blurb_font"
                    v-model:color="form.blurb_color"
                    v-model:bg_color="form.blurb_bg_color"
                    v-model:alignment="form.blurb_alignment"
                    :preview_text="blurb_plain"
                )

BlurbEditorModal(v-model:open="is_blurb_open")

</template>

<script setup lang="ts">
// Content section — title fields, subtitle, author, ISBN, blurb

import {ref, computed, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {FORM_KEY} from '../../form_state'
import type {FormState} from '../../form_state'
import {generateHTML, generateText} from '@tiptap/vue-3'
import {blurb_extensions} from '../../blurb_extensions'
import BlurbEditorModal from './BlurbEditorModal.vue'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import FontStyleOptions from './FontStyleOptions.vue'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import BlurbFontOptions from './BlurbFontOptions.vue'

// Inject the shared form state
const form = inject(FORM_KEY)!

const {t} = useI18n()

// Title field keys for the v-for loop
const TITLE_KEYS = ['title1', 'title2', 'title3'] as const
type TitleKey = typeof TITLE_KEYS[number]

// Helper functions to derive related property keys from a title key
function size_key(key:TitleKey):keyof FormState { return `${key}_size` }
function weight_key(key:TitleKey):keyof FormState { return `${key}_weight` }
function italic_key(key:TitleKey):keyof FormState { return `${key}_italic` }
function font_key(key:TitleKey):keyof FormState { return `${key}_font` }
function color_key(key:TitleKey):keyof FormState { return `${key}_color` }

// Flatten the blurb to plain text for preview contexts (font sample, etc.)
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const blurb_plain = computed(() => generateText(form.blurb, blurb_extensions))

// Line 2 hides when all lines are empty; line 3 hides when lines 2 and 3 are both empty
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const show_title2 = computed(() => !!(form.title1 || form.title2 || form.title3))
// @ts-ignore TS6133
const show_title3 = computed(() => !!(form.title2 || form.title3))

// Map alignment to a text-align CSS class (justify → left for inputs)
function text_align_class(align:string):string {
    if (align === 'right')
        return 'text-right'
    if (align === 'center')
        return 'text-center'
    return 'text-left'
}

// Title fields are single-line — block Enter entirely
function block_enter(e:KeyboardEvent):void {
    if (e.key === 'Enter')
        e.preventDefault()
}

// Subtitle: max 2 lines (1 newline)
function limit_subtitle(e:KeyboardEvent):void {
    if (e.key === 'Enter' && (form.subtitle.match(/\n/g) ?? []).length >= 1)
        e.preventDefault()
}

// Controls the blurb editor modal
const is_blurb_open = ref(false)

// Controls the title, subtitle, author, and blurb style popovers
const title_style_open = ref([false, false, false])
const subtitle_style_open = ref(false)
const author_style_open = ref(false)
const blurb_style_open = ref(false)


// Rendered HTML for the 4-line readonly preview
const blurb_preview_html = computed(() => generateHTML(form.blurb, blurb_extensions))
</script>
